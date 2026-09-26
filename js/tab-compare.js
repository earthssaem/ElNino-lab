/* ② 세 상태 비교: 평상시 · 엘니뇨 · 라니냐를 나란히 */
(function () {
  'use strict';
  var E = window.ENSO, D = window.ENSODraw;
  var clamp = E.clamp;

  var M = {};
  var panels = [];
  var opts = { mode: 'temp', walker: true, flow: true, iso: false, motion: true };
  var probeLon = null;
  var time = 0, dirty = true, visible = false, themeTick = 0;

  function $(id) { return document.getElementById(id); }

  M.init = function (cfg) {
    opts.motion = !cfg.reducedMotion;
    $('cmp-motion').checked = opts.motion;
    Array.prototype.forEach.call(document.querySelectorAll('#tab-compare .cmp'), function (fig, i) {
      var cv = fig.querySelector('canvas');
      var p = {
        fig: fig, cv: cv, ctx: cv.getContext('2d'),
        s: parseFloat(fig.getAttribute('data-s')),
        W: 0, H: 0, dpr: 1, L: null, base: null, baseKey: '',
        flow: D.makeFlow(40, 26), wind: D.makeWind(36)
      };
      panels.push(p);
      cv.addEventListener('pointermove', function (e) { probe(p, e); });
      cv.addEventListener('pointerdown', function (e) { probe(p, e); });
      cv.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { probeLon = null; dirty = true; } });
      if (window.ResizeObserver) new ResizeObserver(function () { resize(p); }).observe(fig);
    });
    window.addEventListener('resize', function () { panels.forEach(resize); });

    function setMode(m) {
      opts.mode = m;
      $('cmp-mode-temp').setAttribute('aria-pressed', m === 'temp');
      $('cmp-mode-anom').setAttribute('aria-pressed', m === 'anom');
      legend();
      dirty = true;
    }
    $('cmp-mode-temp').addEventListener('click', function () { setMode('temp'); });
    $('cmp-mode-anom').addEventListener('click', function () { setMode('anom'); });
    [['cmp-walker', 'walker'], ['cmp-flow', 'flow'], ['cmp-iso', 'iso'], ['cmp-motion', 'motion']].forEach(function (q) {
      $(q[0]).addEventListener('change', function (e) { opts[q[1]] = e.target.checked; dirty = true; });
    });
    legend();
  };

  function legend() {
    var m = opts.mode === 'anom' ? D.ANOM : D.TEMP;
    $('cmp-cbar').style.background = D.gradientCss(m);
    var el = $('cmp-cbar-ticks');
    var vals = opts.mode === 'anom' ? [[-6, '−6'], [-3, '−3'], [0, '0'], [3, '+3'], [6, '+6 °C']] : [[8, '8'], [12, '12'], [16, '16'], [20, '20'], [24, '24'], [28, '28 °C']];
    el.innerHTML = vals.map(function (v) {
      return '<span style="left:' + ((v[0] - m.lo) / (m.hi - m.lo) * 100).toFixed(1) + '%">' + v[1] + '</span>';
    }).join('');
  }

  function probe(p, e) {
    if (!p.L) return;
    var r = p.cv.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width * p.W;
    var lon = p.L.xToLon(x);
    probeLon = lon < E.LON_W || lon > E.LON_E ? null : lon;
    dirty = true;
  }

  function resize(p) {
    var w = Math.round(p.cv.parentNode.clientWidth - 16);
    if (w <= 0) return;
    var h = Math.round(w > 600 ? w * 0.6 : w * 1.02);
    if (w === p.W && h === p.H) return;
    p.W = w; p.H = h;
    p.dpr = Math.min(2, window.devicePixelRatio || 1);
    p.cv.width = Math.round(w * p.dpr); p.cv.height = Math.round(h * p.dpr);
    p.cv.style.height = h + 'px';
    p.L = D.sectionLayout(w, h, { sky: 0.42, zMax: 300, landW: 0.075, landE: 0.09, compact: true });
    p.baseKey = '';
    dirty = true;
  }

  function buildBase(p) {
    if (!p.base) p.base = document.createElement('canvas');
    p.base.width = p.cv.width; p.base.height = p.cv.height;
    var b = p.base.getContext('2d'), L = p.L, s = p.s;
    b.setTransform(p.dpr, 0, 0, p.dpr, 0, 0);
    b.clearRect(0, 0, p.W, p.H);
    D.drawSky(b, L);
    D.drawOcean(b, L, s, opts.mode);
    D.drawThermocline(b, L, s, { mode: opts.mode });
    if (opts.iso) D.drawIsotherms(b, L, s, { mode: opts.mode, labels: L.w > 300 });
    if (s !== 0) D.drawGhost(b, L, s, { mode: opts.mode });
    D.drawLand(b, L, s, {});
    if (opts.flow) D.drawFlowGlyphs(b, L, s, { labels: false });
    // 서 · 동
    var t = D.theme(), fs = clamp(11 * L.u + 3.5, 10.5, 13);
    D.text(b, '서', L.padL + 10, L.yBot - 12, { size: fs, weight: 700, color: '#fff', haloColor: 'rgba(0,0,0,0.4)' });
    D.text(b, '동', L.w - L.padR - 10, L.yBot - 12, { size: fs, weight: 700, color: '#fff', haloColor: 'rgba(0,0,0,0.4)' });
    return t;
  }

  function drawPanel(p, dt) {
    var L = p.L, s = p.s, ctx = p.ctx;
    var key = [s, p.W, p.H, opts.mode, opts.iso, opts.flow, themeTick].join('|');
    if (key !== p.baseKey) { buildBase(p); p.baseKey = key; }
    ctx.setTransform(p.dpr, 0, 0, p.dpr, 0, 0);
    ctx.clearRect(0, 0, p.W, p.H);
    ctx.drawImage(p.base, 0, 0, p.W, p.H);

    if (opts.flow) {
      if (opts.motion) { D.updateFlow(p.flow, s, dt); D.drawFlow(ctx, L, s, p.flow); }
      D.drawFishery(ctx, L, s, time);
    }
    if (opts.walker) {
      D.drawWalker(ctx, function (lon, a) {
        return [L.lonToX(lon), L.ySL - 6 - a * (L.ySL - L.padT - 10)];
      }, s, time, { u: clamp(L.w / 520, 0.55, 1.1), motion: opts.motion });
    } else {
      D.drawTradeWind(ctx, L, s, p.wind, opts.motion ? dt : 0, { labels: false });
    }
    if (probeLon != null) drawProbe(ctx, L, s);
  }

  function drawProbe(ctx, L, s) {
    var t = D.theme();
    var x = L.lonToX(probeLon), col = E.column(probeLon, s);
    var fs = clamp(10 * L.u + 4, 10.5, 12.5);
    ctx.save();
    ctx.strokeStyle = t.ink; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(x, L.padT + 4); ctx.lineTo(x, L.yBot); ctx.stroke();
    ctx.restore();
    var ySurf = L.surfY(probeLon, s), yM = L.zToY(col.M);
    ctx.save();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0f1d26'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, yM, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    var right = x < L.w * 0.6;
    var val = opts.mode === 'anom' ? col.S - E.sst(probeLon, 0) : col.S;
    var txt = opts.mode === 'anom' ? (val >= 0 ? '+' : '−') + Math.abs(val).toFixed(1) + '°C' : val.toFixed(1) + '°C';
    D.pill(ctx, txt, x + (right ? 6 : -6), ySurf - fs * 1.2, { size: fs, bg: t.ink, fg: t.surface, align: right ? 'left' : 'right' });
    D.pill(ctx, Math.round(col.M) + ' m', x + (right ? 8 : -8), yM, { size: fs, bg: 'rgba(255,255,255,0.92)', fg: '#0f1d26', align: right ? 'left' : 'right' });
  }

  M.frame = function (dt) {
    if (!visible) return;
    if (!opts.motion && !dirty) return;
    if (opts.motion) time += dt;
    panels.forEach(function (p) { if (p.L) drawPanel(p, opts.motion ? dt : 0); });
    dirty = false;
  };
  M.show = function () { visible = true; dirty = true; panels.forEach(resize); };
  M.hide = function () { visible = false; };
  M.redraw = function () { themeTick++; dirty = true; };

  window.TabCompare = M;
})();
