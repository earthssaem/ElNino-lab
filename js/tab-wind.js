/* ① 무역풍 실험: 무역풍 세기 → 해수면, 수온 약층, 용승, 표층 수온 */
(function () {
  'use strict';
  var E = window.ENSO, D = window.ENSODraw;
  var clamp = E.clamp;

  var M = {};
  var stage, cv, ctx, slider, out, badge;
  var W = 0, H = 0, dpr = 1, L = null;
  var base = null, baseKey = '';
  var s = 0, target = null, time = 0, dirty = true, visible = true;
  var opts = { iso: true, ghost: true, motion: true };
  var flow = D.makeFlow(70, 46);
  var windP = D.makeWind(64);
  var themeTick = 0;

  function $(id) { return document.getElementById(id); }

  M.init = function (cfg) {
    stage = $('wind-stage'); cv = $('wind-canvas'); ctx = cv.getContext('2d');
    slider = $('wind-slider'); out = $('wind-out'); badge = $('wind-badge');
    opts.motion = !cfg.reducedMotion;
    $('wind-motion').checked = opts.motion;

    slider.addEventListener('input', function () {
      target = null;
      s = slider.value / 100;
      update();
    });
    Array.prototype.forEach.call(document.querySelectorAll('#tab-wind .preset'), function (b) {
      b.addEventListener('click', function () {
        target = parseFloat(b.getAttribute('data-target'));
        if (!opts.motion) { s = target; target = null; slider.value = Math.round(s * 100); update(); }
      });
    });
    [['wind-iso', 'iso'], ['wind-ghost', 'ghost'], ['wind-motion', 'motion']].forEach(function (p) {
      $(p[0]).addEventListener('change', function (e) { opts[p[1]] = e.target.checked; dirty = true; });
    });

    // 색 막대
    $('wind-cbar').style.background = D.gradientCss(D.TEMP);
    ticks($('wind-cbar-ticks'), D.TEMP, [8, 12, 16, 20, 24, 28]);

    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
    window.addEventListener('resize', resize);
    resize();
    update();
  };

  function ticks(el, m, vals) {
    el.innerHTML = vals.map(function (v) {
      return '<span style="left:' + ((v - m.lo) / (m.hi - m.lo) * 100).toFixed(1) + '%">' + v + '</span>';
    }).join('');
  }
  M.ticks = ticks;

  function resize() {
    var w = Math.round(stage.clientWidth);
    if (!w) return;
    var h = w < 560 ? Math.round(w * 1.0) : Math.round(clamp(w * 0.56, 360, 640));
    if (w === W && h === H) return;
    W = w; H = h;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.height = H + 'px';
    L = D.sectionLayout(W, H, { axis: true, sky: w < 560 ? 0.34 : 0.3, zMax: 300, landW: w < 560 ? 0.08 : 0.06, landE: w < 560 ? 0.1 : 0.075 });
    baseKey = '';
    dirty = true;
  }

  function buildBase() {
    if (!base) base = document.createElement('canvas');
    base.width = cv.width; base.height = cv.height;
    var b = base.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    b.clearRect(0, 0, W, H);
    var t = D.theme();
    D.drawSky(b, L);
    D.drawOcean(b, L, s, 'temp');
    var band = D.drawThermocline(b, L, s, { mode: 'temp' });
    if (opts.iso) D.drawIsotherms(b, L, s, { mode: 'temp', labels: true });
    if (opts.ghost) D.drawGhost(b, L, s, { mode: 'temp' });
    D.drawLand(b, L, s, { names: true });
    D.drawAxes(b, L);
    D.drawFlowGlyphs(b, L, s, { labels: true });

    // 층 이름
    var fs = clamp(11 * L.u + 3, 10.5, 14);
    var lonT = 184, colT = E.column(lonT, s);
    var yBandMid = (L.zToY(colT.M) + L.zToY(colT.D + 53)) / 2;
    D.text(b, '수온 약층', L.lonToX(lonT), yBandMid, { size: fs, weight: 700, color: '#0f1d26', haloColor: 'rgba(255,255,255,0.8)' });
    var colW = E.column(160, s);
    if (L.zToY(colW.M) - L.ySL > fs * 2) {
      D.text(b, '혼합층', L.lonToX(160), (L.ySL + L.zToY(colW.M)) / 2 + 2, { size: fs, weight: 700, color: '#3a0a06', haloColor: 'rgba(255,235,220,0.85)' });
    }
    D.text(b, '차가운 심층', L.lonToX(184), L.zToY(262), { size: fs - 1, weight: 600, color: '#e6f0ff', haloColor: 'rgba(10,30,70,0.55)' });

    // 서·동 읽기 지점
    [[E.PROBE_W, '서'], [E.PROBE_E, '동']].forEach(function (p) {
      var x = L.lonToX(p[0]), y = L.surfY(p[0], s);
      b.save();
      b.fillStyle = t.ink;
      b.beginPath(); b.moveTo(x, y - 3); b.lineTo(x - 5, y - 11); b.lineTo(x + 5, y - 11); b.closePath(); b.fill();
      b.restore();
      D.pill(b, p[1], x, y - 21, { size: fs - 1, bg: t.ink, fg: t.surface });
    });

    // 해수면 과장 표시
    D.text(b, '해수면 높이 차는 과장해서 그림', L.ox1 - 8, L.yBot - fs * 0.9, { size: fs - 2.5, weight: 600, color: '#e6f0ff', haloColor: 'rgba(10,30,70,0.5)', align: 'right' });
    return band;
  }

  function draw(dt) {
    var key = [s.toFixed(3), W, H, opts.iso, opts.ghost, themeTick].join('|');
    if (key !== baseKey) { buildBase(); baseKey = key; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(base, 0, 0, W, H);
    if (opts.motion) {
      D.updateFlow(flow, s, dt);
      D.drawFlow(ctx, L, s, flow);
    }
    D.drawFishery(ctx, L, s, time);
    D.drawTradeWind(ctx, L, s, windP, opts.motion ? dt : 0, { labels: true });
  }

  M.frame = function (dt) {
    if (!visible || !L) return;
    if (target != null) {
      var d = target - s;
      if (Math.abs(d) < 0.004) { s = target; target = null; }
      else s += d * Math.min(1, dt * 3.2);
      slider.value = Math.round(s * 100);
      update();
    }
    if (!opts.motion && !dirty) return;
    if (opts.motion) time += dt;
    draw(opts.motion ? dt : 0);
    dirty = false;
  };

  M.show = function () { visible = true; dirty = true; resize(); };
  M.hide = function () { visible = false; };
  M.redraw = function () { themeTick++; dirty = true; };

  /* ── 읽기 표 · 사슬 ─────────────────── */
  function fmt(v, d) { var r = v.toFixed(d); return r === '-0' || r === '-0.0' ? (0).toFixed(d) : r; }
  function signed(v, d) { var r = fmt(v, d); return (v > 0 && parseFloat(r) !== 0 ? '+' : '') + r.replace('-', '−'); }
  function setD(el, v, d, unit, words) {
    el.className = 'ro-d';
    if (Math.abs(v) < Math.pow(10, -d) * 0.5 || Math.abs(s) < 0.005) { el.textContent = ''; return; }
    if (words) {
      el.textContent = fmt(Math.abs(v), d) + ' ' + unit + ' ' + (v > 0 ? words[0] : words[1]);
    } else {
      el.textContent = (v > 0 ? '▲ ' : '▼ ') + fmt(Math.abs(v), d) + ' ' + unit;
      el.className = 'ro-d ' + (v > 0 ? 'up' : 'dn');
    }
  }
  function midBar(el, v, range) {
    var f = clamp(Math.abs(v) / range, 0, 1) * 50;
    el.style.width = f + '%';
    el.style.left = (v >= 0 ? 50 : 50 - f) + '%';
  }

  function update() {
    var pw = E.PROBE_W, pe = E.PROBE_E;
    var sw = E.sst(pw, s), se = E.sst(pe, s);
    var mw = E.mixedLayer(pw, s), me = E.mixedLayer(pe, s);
    var ew = E.seaLevel(pw, s) - E.seaLevel(pw, 0), ee = E.seaLevel(pe, s) - E.seaLevel(pe, 0);
    var diff = E.seaLevel(pw, s) - E.seaLevel(pe, s);
    var U = E.upwelling(s), wind = E.wind(s);
    var a = E.nino34(s), ph = E.phase(s);

    $('ro-sst-w').textContent = fmt(sw, 1);
    $('ro-sst-e').textContent = fmt(se, 1);
    [['ro-sst-bw', sw], ['ro-sst-be', se]].forEach(function (p) {
      var el = $(p[0]);
      el.style.width = clamp((p[1] - 20) / 11, 0.03, 1) * 100 + '%';
      el.style.background = D.colorCss(D.TEMP, p[1]);
    });
    setD($('ro-sst-dw'), sw - E.sst(pw, 0), 1, '°C');
    setD($('ro-sst-de'), se - E.sst(pe, 0), 1, '°C');

    $('ro-mld-w').textContent = fmt(mw, 0);
    $('ro-mld-e').textContent = fmt(me, 0);
    $('ro-mld-bw').style.width = clamp(mw / 100, 0.03, 1) * 100 + '%';
    $('ro-mld-be').style.width = clamp(me / 100, 0.03, 1) * 100 + '%';
    setD($('ro-mld-dw'), mw - E.mixedLayer(pw, 0), 0, 'm', ['깊어짐', '얕아짐']);
    setD($('ro-mld-de'), me - E.mixedLayer(pe, 0), 0, 'm', ['깊어짐', '얕아짐']);

    $('ro-eta-w').textContent = signed(ew, 0);
    $('ro-eta-e').textContent = signed(ee, 0);
    midBar($('ro-eta-bw'), ew, 25);
    midBar($('ro-eta-be'), ee, 25);

    var bars = clamp(Math.round(U / 1.96 * 5), 1, 5);
    Array.prototype.forEach.call($('ro-up').children, function (el, i) { el.className = i < bars ? 'on' : ''; });
    $('ro-up').setAttribute('aria-label', '용승 세기 5단계 중 ' + bars);

    $('ro-diff').textContent = fmt(diff, 0);
    var k = 0.2;
    $('ro-diff-sea').setAttribute('d', 'M4 ' + (17 - diff * k).toFixed(1) + ' L116 ' + (17 + diff * k).toFixed(1) + ' L116 32 L4 32 Z');

    $('ro-nino').textContent = signed(a, 1);
    var pos = a <= -0.5 ? 40 * (a + 2) / 1.5 : a < 0.5 ? 40 + (a + 0.5) * 20 : 60 + (a - 0.5) / 2.5 * 40;
    $('ro-nino-mark').style.left = clamp(pos, 0, 100) + '%';

    // 슬라이더 옆 글자, 상태 딱지
    out.textContent = Math.abs(wind - 1) < 0.005 ? '평상시' : '평상시의 ' + Math.round(wind * 100) + '%';
    slider.setAttribute('aria-valuetext', out.textContent);
    badge.setAttribute('data-phase', ph);
    badge.textContent = ph === 'nino' ? '엘니뇨 상태' : ph === 'nina' ? '라니냐 상태' : '평상시';

    // 원인 → 결과
    var dir = Math.abs(s) < 0.03 ? 0 : s < 0 ? -1 : 1;
    var cls = dir < 0 ? 'p-nino' : dir > 0 ? 'p-nina' : '';
    function chain(k, txt) {
      var el = document.querySelector('#wind-chain [data-k="' + k + '"] .c-v');
      el.className = 'c-v ' + (txt[1] ? cls : '');
      el.textContent = txt[0];
    }
    chain('wind', dir < 0 ? ['▼ 약해짐', 1] : dir > 0 ? ['▲ 강해짐', 1] : ['동 → 서', 0]);
    chain('trans', dir < 0 ? ['▼ 줄어듦', 1] : dir > 0 ? ['▲ 늘어남', 1] : ['서쪽에 쌓임', 0]);
    chain('up', dir < 0 ? ['▼ 약해짐', 1] : dir > 0 ? ['▲ 강해짐', 1] : ['활발', 0]);
    chain('sste', dir < 0 ? ['▲ ' + fmt(se, 1) + ' °C', 1] : dir > 0 ? ['▼ ' + fmt(se, 1) + ' °C', 1] : [fmt(se, 1) + ' °C', 0]);
    chain('tilt', dir < 0 ? ['완만해짐', 1] : dir > 0 ? ['급해짐', 1] : ['서쪽이 깊음', 0]);
    chain('sl', dir < 0 ? ['서·동 차이 줄어듦', 1] : dir > 0 ? ['서·동 차이 커짐', 1] : ['서쪽이 높음', 0]);

    cv.setAttribute('aria-label', '적도 태평양 연직 단면. 무역풍 ' + out.textContent +
      '. 서태평양 표층 수온 ' + fmt(sw, 1) + '도, 동태평양 ' + fmt(se, 1) + '도. 수온 약층 시작 깊이 서 ' +
      fmt(mw, 0) + '미터, 동 ' + fmt(me, 0) + '미터. 해수면 높이 차 ' + fmt(diff, 0) + '센티미터.');
    dirty = true;
  }

  window.TabWind = M;
})();
