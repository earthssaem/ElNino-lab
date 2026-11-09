/* ① 무역풍 실험: 무역풍 세기 → (몇 달에 걸쳐) 해수면, 수온 약층, 용승, 표층 수온
 * 무역풍(w)은 슬라이더를 따라 바로 바뀌고, 바다는 E.Ocean 이 시간(달)에 따라 따라가게 한다.
 * '실제 관측 바람으로 실험하기'(지구과학)는 사례 기간의 실측 무역풍 편차(NCEP/NCAR R1)로 w 를 정하고 모형이 계산한 바다의 반응을 보여 준다.
 * 과목(M.subject): 통합과학은 무역풍을 평상시~약화 범위로, 정보는 무역풍 세기·표층 수온·용승·비가 많이 오는 곳만.
 *   지구과학은 약화~강화, 20 ℃ 등온선 깊이·용승 강도와 접이식 상세 정보, 실제 관측 바람 실험. */
(function () {
  'use strict';
  var E = window.ENSO, D = window.ENSODraw, OBS = E.OBS;
  var clamp = E.clamp;

  var MONTHS_PER_SEC = 1.0;       // 직접 바꿀 때: 1초 = 1달
  var REPLAY_MONTHS_PER_SEC = 1.6; // 실제 바람 재생: 1초 = 1.6달

  var M = {};
  var stage, cv, ctx, slider, out, badge, clock;
  var W = 0, H = 0, dpr = 1, L = null;
  var base = null, baseKey = '';
  var w = 0, target = null, time = 0, dirty = true, visible = true;
  var ocean = new E.Ocean(0), st = ocean.state();
  var opts = { iso: false, ghost: true, motion: true };
  var subj = 'earth';
  var flow = D.makeFlow(70, 46);
  var windP = D.makeWind(64);
  var themeTick = 0;
  var replay = { on: false, c: null, i0: 0, n: 0, t: 0 };

  function $(id) { return document.getElementById(id); }

  M.init = function (cfg) {
    stage = $('wind-stage'); cv = $('wind-canvas'); ctx = cv.getContext('2d');
    slider = $('wind-slider'); out = $('wind-out'); badge = $('wind-badge'); clock = $('wind-clock');
    opts.motion = !cfg.reducedMotion;
    $('wind-motion').checked = opts.motion;

    slider.addEventListener('input', function () {
      stopReplay();
      target = null;
      setWind(slider.value / 100);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#tab-wind .preset'), function (b) {
      b.addEventListener('click', function () {
        stopReplay();
        target = parseFloat(b.getAttribute('data-target'));
        if (!opts.motion) { var v = target; target = null; setWind(v); slider.value = Math.round(w * 100); }
      });
    });
    [['wind-iso', 'iso'], ['wind-ghost', 'ghost'], ['wind-motion', 'motion']].forEach(function (p) {
      $(p[0]).addEventListener('change', function (e) {
        opts[p[1]] = e.target.checked;
        if (p[1] === 'motion' && !opts.motion && !replay.on) settleNow();
        dirty = true;
      });
    });

    // 실제 무역풍 재생: 실측자료 탐구실과 같은 사례
    var sel = $('replay-case');
    OBS.cases.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.id; o.textContent = c.name;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { if (replay.on) startReplay(); });
    $('replay-play').addEventListener('click', function () { if (replay.on) stopReplay(); else startReplay(); });

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

  // 무역풍 상태를 바꾼다. '움직임'이 꺼져 있으면 바다도 곧바로 새 상태로
  function setWind(v) {
    w = clamp(v, -1, subj === 'integrated' ? 0 : 1);
    if (!opts.motion && !replay.on) settleNow();
    update();
  }
  function settleNow() { ocean.reset(w); st = ocean.state(); }

  /* ── 실제 무역풍 재생 ───────────────── */
  var MON = OBS.monthly, U0 = OBS.trade.u0;
  function monthIndex(ym) {
    var y0 = parseInt(MON.start.slice(0, 4), 10), m0 = parseInt(MON.start.slice(5, 7), 10);
    return (parseInt(ym.slice(0, 4), 10) - y0) * 12 + parseInt(ym.slice(5, 7), 10) - m0;
  }
  function ymOf(i) {
    var y0 = parseInt(MON.start.slice(0, 4), 10), m0 = parseInt(MON.start.slice(5, 7), 10) - 1 + i;
    return (y0 + Math.floor(m0 / 12)) + '년 ' + (m0 % 12 + 1) + '월';
  }
  // 그 달까지 3개월 평균 바람 편차 → 무역풍 세기 비율 → 상태 w
  function windState(i) {
    var sum = 0, n = 0;
    for (var k = i - 2; k <= i; k++) { var v = MON.windAnom[k]; if (v != null) { sum += v; n++; } }
    if (!n) return 0;
    return clamp(E.windFromRatio(1 + (sum / n) / U0), -1, 1);
  }
  function startReplay() {
    var id = $('replay-case').value, c = null;
    OBS.cases.forEach(function (q) { if (q.id === id) c = q; });
    if (!c) return;
    target = null;
    replay = { on: true, c: c, i0: monthIndex(c.start), n: monthIndex(c.end) - monthIndex(c.start), t: 0 };
    w = windState(replay.i0);
    ocean.reset(w); st = ocean.state();
    var b = $('replay-play');
    b.setAttribute('aria-pressed', 'true'); b.lastElementChild.textContent = '멈춤';
    slider.value = Math.round(w * 100);
    update();
  }
  function stopReplay() {
    if (!replay.on) return;
    replay.on = false;
    var b = $('replay-play');
    b.setAttribute('aria-pressed', 'false'); b.lastElementChild.textContent = '재생';
    update();
  }

  // 과목 바꾸기: 통합과학은 무역풍 강화(라니냐)와 실제 바람 실험을 숨긴다. 지금 상태는 그대로 이어 간다
  M.subject = function (s) {
    subj = s;
    if (s === 'integrated') {
      stopReplay();
      slider.max = 0;
      if (target != null && target > 0) target = 0;
      if (w > 0) { if (opts.motion) target = 0; else setWind(0); }
    } else {
      slider.max = 100;
    }
    slider.value = Math.round(w * 100);
    baseKey = '';
    update();
  };

  function resize() {
    var wd = Math.round(stage.clientWidth);
    if (!wd) return;
    // 넓은 화면: 단면과 그 아래 조작부가 한 화면에 들어오도록 창 높이에 맞춤(너무 납작해지지 않게 아래 한계)
    var h = wd < 560 ? Math.round(wd * 1.0) : Math.round(clamp(Math.min(wd * 0.56, D.fitHeight(stage)), Math.max(300, wd * 0.3), 640));
    if (wd === W && h === H) return;
    W = wd; H = h;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.height = H + 'px';
    L = D.sectionLayout(W, H, { axis: true, sky: wd < 560 ? 0.34 : 0.3, zMax: 300, landW: wd < 560 ? 0.08 : 0.06, landE: wd < 560 ? 0.1 : 0.075 });
    baseKey = '';
    dirty = true;
  }

  function buildBase() {
    if (!base) base = document.createElement('canvas');
    base.width = cv.width; base.height = cv.height;
    var b = base.getContext('2d'), s = st;
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    b.clearRect(0, 0, W, H);
    var t = D.theme();
    D.drawSky(b, L);
    D.drawOcean(b, L, s, 'temp');
    var fs = clamp(11 * L.u + 3, 10.5, 14), band = null;
    if (subj === 'earth') {
      band = D.drawThermocline(b, L, s, { mode: 'temp', thin: true });
      if (opts.iso) D.drawIsotherms(b, L, s, { mode: 'temp', labels: true, skip20: true });
    }
    if (subj === 'earth') {   // 20 ℃ 등온선(굵은 실선)·평상시 20 ℃(점선)는 지구과학만. 통합과학은 수온 색으로만 보여 줌
      if (opts.ghost) D.drawGhost(b, L, s, { mode: 'temp' });
      D.drawIso20(b, L, s, { label: '20 ℃', labelLon: 226 });
    }
    D.drawLand(b, L, s, { names: true });
    D.drawAxes(b, L);
    D.drawFlowGlyphs(b, L, s, { labels: true, simple: subj === 'integrated' });

    // 층 이름: 지구과학은 혼합층·수온 약층, 통합과학은 따뜻한 해수층
    var colW = E.column(160, s);
    if (subj === 'earth') {
      var colT = E.column(184, s);
      D.text(b, '수온 약층', L.lonToX(184), (L.zToY(colT.M) + L.zToY(colT.D15)) / 2, { size: fs, weight: 700, color: '#0f1d26', haloColor: 'rgba(255,255,255,0.8)' });
      if (L.zToY(colW.M) - L.ySL > fs * 2) {
        D.text(b, '혼합층', L.lonToX(160), (L.ySL + L.zToY(colW.M)) / 2 + 2, { size: fs, weight: 700, color: '#3a0a06', haloColor: 'rgba(255,235,220,0.85)' });
      }
      D.text(b, '차가운 심층', L.lonToX(184), L.zToY(262), { size: fs - 1, weight: 600, color: '#e6f0ff', haloColor: 'rgba(10,30,70,0.55)' });
    } else {
      D.text(b, '따뜻한 해수층', L.lonToX(160), (L.surfY(160, s) + L.zToY(colW.D)) / 2 + 4, { size: fs + 1, weight: 800, color: '#3a0a06', haloColor: 'rgba(255,235,220,0.85)' });
      D.text(b, '차가운 바닷물', L.lonToX(200), L.zToY(250), { size: fs, weight: 700, color: '#e6f0ff', haloColor: 'rgba(10,30,70,0.55)' });
    }

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

  // 수온 약층 변화가 퍼져 나가는 앞머리: 혼합층 바닥선 위에 빛나는 점과 이름표
  function drawFronts(c) {
    var f = ocean.fronts();
    if (!f) return;
    var fs = clamp(10.5 * L.u + 3, 10, 13.5), pulse = opts.motion ? 0.5 + 0.5 * Math.sin(time * 7) : 1;
    var words = subj === 'integrated' ? [f.warm ? '따뜻한 해수층 두꺼워짐 →' : '따뜻한 해수층 얇아짐 →', f.warm ? '← 얇아짐' : '← 두꺼워짐']
      : [f.warm ? '수온 약층 깊어짐 →' : '수온 약층 얕아짐 →', f.warm ? '← 얕아짐' : '← 깊어짐'];
    [['east', f.east, words[0]], ['west', f.west, words[1]]].forEach(function (q) {
      if (q[1] == null) return;
      var lon = q[1], x = L.lonToX(lon), y = L.zToY(E.iso20(lon, st));
      c.save();
      var g = c.createRadialGradient(x, y, 0, x, y, 18 * L.u + 6);
      g.addColorStop(0, 'rgba(255,236,120,' + (0.55 + 0.35 * pulse).toFixed(2) + ')');
      g.addColorStop(1, 'rgba(255,236,120,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, 18 * L.u + 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffe36a'; c.strokeStyle = 'rgba(40,30,0,0.7)'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, 3.5 * L.u + 2, 0, Math.PI * 2); c.fill(); c.stroke();
      c.restore();
      // 이름표는 진행 방향 쪽에 두되, 그림 가장자리에 가까우면 반대쪽으로 (잘리지 않게)
      var right = q[0] === 'east' ? x < W * 0.6 : x < W * 0.35;
      D.pill(c, q[2], x + (right ? 10 : -10), y + fs * 1.7, { size: fs - 0.5, bg: 'rgba(30,24,0,0.82)', fg: '#ffe36a', align: right ? 'left' : 'right' });
    });
  }

  // 통합과학: 비가 많이 오는 곳(따뜻한 바다 위 상승 기류의 구름·비, 실측 강수 중심 경도)
  function drawRain(c) {
    var wk = E.walker(st), skyH = L.ySL - L.padT, r = (10 + 8 * wk.convection) * clamp(W / 800, 0.6, 1.1);
    var x = clamp(L.lonToX(wk.rise), L.ox0 + r, L.ox1 - r), y = L.padT + skyH * 0.2 + r * 0.3;
    var w0 = E.walker(0);   // 평상시 구름 자리: 구름이 동쪽으로 옮겨 가면 흐린 구름(구름·비가 줄어든 곳)
    if (wk.rise - w0.rise > 12) {
      var r0 = (10 + 8 * w0.convection) * clamp(W / 800, 0.6, 1.1) * 0.8;
      D.cloud(c, clamp(L.lonToX(w0.rise), L.ox0 + r0, L.ox1 - r0), y, r0, 0.32);
    }
    D.rain(c, x, y + r * 0.45, L.ySL - 2, r * 1.6, Math.round(4 + 4 * wk.convection), opts.motion ? time : 0, 0.8);
    D.cloud(c, x, y, r);
  }

  function draw(dt) {
    var key = [E.skey(st), W, H, opts.iso, opts.ghost, subj, themeTick].join('|');
    if (key !== baseKey) { buildBase(); baseKey = key; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(base, 0, 0, W, H);
    if (opts.motion) {
      D.updateFlow(flow, st, dt);
      D.drawFlow(ctx, L, st, flow);
    }
    D.drawFishery(ctx, L, st, time);
    if (subj === 'integrated') drawRain(ctx);
    D.drawTradeWind(ctx, L, st, windP, opts.motion ? dt : 0, { labels: true });
    drawFronts(ctx);
  }

  M.frame = function (dt) {
    if (!visible || !L) return;
    var changed = false;
    if (replay.on) {
      replay.t += dt * REPLAY_MONTHS_PER_SEC;
      if (replay.t >= replay.n) { replay.t = replay.n; }
      var i = replay.i0 + Math.floor(replay.t), f = replay.t - Math.floor(replay.t);
      w = E.lerp(windState(i), windState(Math.min(i + 1, replay.i0 + replay.n)), f);
      slider.value = Math.round(w * 100);
      ocean.step(dt * REPLAY_MONTHS_PER_SEC, w);
      st = ocean.state();
      changed = true;
      if (replay.t >= replay.n) stopReplay();
    } else {
      if (target != null) {
        var d = target - w;
        if (Math.abs(d) < 0.004) { w = target; target = null; } else w += d * Math.min(1, dt * 3.2);
        slider.value = Math.round(w * 100);
        if (!opts.motion) settleNow();
        changed = true;
      }
      if (opts.motion && (!ocean.settled() || Math.abs(ocean.w - w) > 1e-4)) {
        ocean.step(dt * MONTHS_PER_SEC, w);
        st = ocean.state();
        changed = true;
      }
    }
    if (changed) update();
    if (!opts.motion && !dirty) return;
    if (opts.motion) time += dt;
    draw(opts.motion ? dt : 0);
    dirty = false;
  };

  M.show = function () { visible = true; dirty = true; resize(); };
  M.hide = function () { visible = false; stopReplay(); };
  M.redraw = function () { themeTick++; dirty = true; };

  /* ── 읽기 표 · 사슬 ─────────────────── */
  function fmt(v, d) { var r = v.toFixed(d); return r === '-0' || r === '-0.0' ? (0).toFixed(d) : r; }
  function signed(v, d) { var r = fmt(v, d); return (v > 0 && parseFloat(r) !== 0 ? '+' : '') + r.replace('-', '−'); }
  function setD(el, v, d, unit, words) {
    el.className = 'ro-d';
    if (Math.abs(v) < Math.pow(10, -d) * 0.5) { el.textContent = ''; return; }
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
    var s = st, pw = E.PROBE_W, pe = E.PROBE_E;
    var sw = E.sst(pw, s), se = E.sst(pe, s);
    var mw = E.mixedLayer(pw, s), me = E.mixedLayer(pe, s);
    var ew = E.seaLevel(pw, s) - E.seaLevel(pw, 0), ee = E.seaLevel(pe, s) - E.seaLevel(pe, 0);
    var diff = E.seaLevel(pw, s) - E.seaLevel(pe, s), diff0 = E.seaLevel(pw, 0) - E.seaLevel(pe, 0);
    var U = E.upwelling(w), wind = E.wind(w);
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

    // 지구과학 기본: 20 ℃ 등온선 깊이(수온 약층 깊이의 대표 지표)
    var iw = E.iso20(pw, s), ie = E.iso20(pe, s);
    $('ro-iso-w').textContent = fmt(iw, 0);
    $('ro-iso-e').textContent = fmt(ie, 0);
    $('ro-iso-bw').style.width = clamp(iw / 220, 0.03, 1) * 100 + '%';
    $('ro-iso-be').style.width = clamp(ie / 220, 0.03, 1) * 100 + '%';
    setD($('ro-iso-dw'), iw - E.iso20(pw, 0), 0, 'm', ['깊어짐', '얕아짐']);
    setD($('ro-iso-de'), ie - E.iso20(pe, 0), 0, 'm', ['깊어짐', '얕아짐']);
    // 통합과학 기본: 무역풍 세기, 비가 많이 오는 곳(실측 강수 중심 경도로 정한 모형 값)
    $('ro-wind').textContent = Math.round(wind * 100);
    $('ro-wind-b').style.width = clamp(wind / 1.4, 0.03, 1) * 100 + '%';
    var rise = E.walker(s).rise;
    $('ro-rain').textContent = rise < 166 ? '서태평양 (인도네시아 부근)' : '중앙 태평양 쪽으로 이동';
    $('ro-rain-s').textContent = rise < 166 ? '따뜻한 바다 위에서 공기가 올라가 구름이 생기고 비가 내려요.' : '따뜻한 바닷물을 따라 구름과 비가 동쪽으로 옮겨 가요.';

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
    $('ro-up-t').textContent = subj === 'integrated' ? (U < 0.9 ? '약해짐' : U > 1.1 ? '강해짐' : '활발') : '';
    $('ro-up-t').className = 'ro-d' + (U < 0.9 ? ' dn' : U > 1.1 ? ' up' : '');

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

    // 시계: 재생 중이면 연·월과 NOAA 공식 판정, 아니면 바람이 바뀐 뒤 흐른 달
    var settled = ocean.settled() && target == null;
    var f = ocean.fronts();
    if (replay.on) {
      var i = replay.i0 + Math.floor(replay.t), stt = MON.state[i], obs = MON.nino34[i];
      clock.textContent = ymOf(i) + ' · NOAA 판정 ' + (stt === 1 ? '엘니뇨' : stt === -1 ? '라니냐' : stt === 0 ? '중립' : '자료 없음');
      clock.className = 'clock on replay';
      $('replay-cmp').hidden = false;
      $('replay-model').textContent = signed(a, 1) + ' °C';
      $('replay-obs').textContent = obs == null ? '자료 없음' : signed(obs, 1) + ' °C';
      $('replay-prog').style.width = (replay.t / replay.n * 100).toFixed(1) + '%';
    } else {
      if (!settled && f) {
        clock.textContent = '바람이 바뀐 뒤 ' + f.elapsed.toFixed(1) + '개월';
        clock.className = 'clock on';
      } else if (!settled) {
        clock.textContent = '바다가 바뀌는 중…';
        clock.className = 'clock on';
      } else {
        clock.textContent = '';
        clock.className = 'clock';
      }
    }

    // 원인 → 결과: 지금 값으로 정하고, 아직 따라 바뀌는 중인 고리는 깜빡임
    var dw = Math.abs(w) < 0.03 ? 0 : w < 0 ? -1 : 1;
    function dirOf(v, tol) { return Math.abs(v) < tol ? 0 : v > 0 ? 1 : -1; }
    var dsst = dirOf(se - E.sst(pe, 0), 0.15), dtilt = dirOf(diff - diff0, 2);
    var eqE = E.sst(pe, w), eqDiff = E.seaLevel(pw, w) - E.seaLevel(pe, w);
    var windLive = target != null;
    function chain(key, txt, cls, live) {
      var li = document.querySelector('#wind-chain [data-k="' + key + '"]');
      li.classList.toggle('live', !!live);
      var el = li.querySelector('.c-v');
      el.className = 'c-v ' + (cls || '');
      el.textContent = txt;
    }
    var cw = dw < 0 ? 'p-nino' : dw > 0 ? 'p-nina' : '';
    chain('wind', dw < 0 ? '▼ 약해짐' : dw > 0 ? '▲ 강해짐' : '동 → 서', cw, windLive);
    chain('trans', dw < 0 ? '▼ 줄어듦' : dw > 0 ? '▲ 늘어남' : '서쪽에 쌓임', cw, windLive);
    chain('up', dw < 0 ? '▼ 약해짐' : dw > 0 ? '▲ 강해짐' : '활발', cw, windLive);
    chain('sste', (dsst > 0 ? '▲ ' : dsst < 0 ? '▼ ' : '') + fmt(se, 1) + ' °C', dsst > 0 ? 'p-nino' : dsst < 0 ? 'p-nina' : '', Math.abs(se - eqE) > 0.08);
    chain('rain', rise < 166 ? '서태평양' : '▶ 중앙 태평양 쪽', rise < 166 ? '' : 'p-nino', Math.abs(rise - E.walker(w).rise) > 2);
    chain('tilt', dtilt < 0 ? '완만해짐' : dtilt > 0 ? '급해짐' : '서쪽이 깊음', dtilt < 0 ? 'p-nino' : dtilt > 0 ? 'p-nina' : '', Math.abs(diff - eqDiff) > 1);
    chain('sl', dtilt < 0 ? '서·동 차이 줄어듦' : dtilt > 0 ? '서·동 차이 커짐' : '서쪽이 높음', dtilt < 0 ? 'p-nino' : dtilt > 0 ? 'p-nina' : '', Math.abs(diff - eqDiff) > 1);

    cv.setAttribute('aria-label', '적도 태평양 연직 단면. 무역풍 ' + out.textContent +
      '. 서태평양 표층 수온 ' + fmt(sw, 1) + '도, 동태평양 ' + fmt(se, 1) + '도. ' +
      (subj === 'integrated' ? '비가 많이 오는 곳 ' + $('ro-rain').textContent + '.'
        : '20도 등온선 깊이 서 ' + fmt(iw, 0) + '미터, 동 ' + fmt(ie, 0) + '미터. 해수면 높이 차 ' + fmt(diff, 0) + '센티미터.') +
      (clock.textContent ? ' ' + clock.textContent + '.' : ''));
    dirty = true;
  }

  window.TabWind = M;
})();
