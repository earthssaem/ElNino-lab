/* 대화로 배우는 엘니뇨: 적도 단면 그림, 그림 위 캐릭터, 대화 진행
 * 대본은 script.js(window.STORY). 수온·수온약층·해수면·용승은 ../js/model.js(window.ENSO),
 * 바다·육지·무역풍·물고기·구름 그리기는 ../js/draw.js(window.ENSODraw)를 그대로 쓴다.
 */
(function () {
  'use strict';
  var E = window.ENSO, D = window.ENSODraw, S = window.STORY;
  var clamp = E.clamp;
  var STEPS = S.STEPS, CH = S.CH;

  function $(id) { return document.getElementById(id); }

  var stage = $('story-stage'), cv = $('story-canvas'), ctx = cv.getContext('2d');
  var badge = $('story-badge'), castEl = $('cast'), note = $('sayNote');
  var W = 0, H = 0, dpr = 1, L = null;
  var base = null, baseKey = '', spot = null;
  var s = 0, target = 0, time = 0, dirty = true, themeTick = 0;
  var flow = D.makeFlow(70, 46), windP = D.makeWind(64);
  var cur = 0, li = 0, shownStep = -1, answers = {};
  var st = null;          // 지금 대사의 상태 {s, badge, show, cast, hl, who, mood}
  var castKey = '', avSize = 40;

  var motion = true;
  try { motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* 무시 */ }

  /* ── 대본 → 상태 ─────────────────────── */
  // (i 단계, j 번째 대사)까지 읽었을 때의 상태. 그림 층과 등장한 캐릭터는 누적, s·딱지는 마지막으로 정한 값
  function stateAt(i, j) {
    var o = { s: 0, badge: 'normal', show: {}, cast: {} };
    for (var k = 0; k <= i; k++) {
      var lines = STEPS[k].lines, m = k < i ? lines.length - 1 : j;
      for (var q = 0; q <= m; q++) {
        var ln = lines[q];
        if (ln.s != null) o.s = ln.s;
        if (ln.badge) o.badge = ln.badge;
        (ln.show || []).forEach(function (x) { o.show[x] = true; });
        o.cast[ln.who] = true;
        if (ln.ask && answers[k + '-' + q]) { o.s = ln.ask.reveal; o.badge = ln.ask.badge; }
      }
    }
    var c = STEPS[i].lines[j];
    o.hl = c.hl || []; o.who = c.who; o.mood = c.mood || '';
    return o;
  }
  function moodOf(k, sv) {
    if (st && k === st.who && st.mood) return st.mood;
    return k === 'fisher' && sv <= -0.4 ? 'sad' : '';   // 엘니뇨 때 어부는 시무룩
  }

  /* ── 캔버스 크기 ─────────────────────── */
  function resize() {
    var w = Math.round(stage.clientWidth);
    if (!w) return;
    var h = w < 560 ? Math.round(w * 0.86) : Math.round(clamp(Math.min(w * 0.6, window.innerHeight * 0.68), 300, 620));
    if (w === W && h === H) return;
    W = w; H = h;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.height = H + 'px';
    L = D.sectionLayout(W, H, { sky: 0.42, zMax: 300, landW: w < 560 ? 0.085 : 0.07, landE: w < 560 ? 0.11 : 0.085 });
    avSize = W < 560 ? 30 : W < 900 ? 36 : 42;
    castEl.style.setProperty('--av', avSize + 'px');
    baseKey = ''; castKey = ''; dirty = true;
  }

  /* ── 그림 요소의 위치 (그리기와 밝게 비추기에 함께 씀) ── */
  function fsz(add) { return clamp(11 * L.u + (add == null ? 3 : add), 10, 14.5); }
  function box(x0, y0, x1, y1) {
    var a = clamp(Math.min(x0, x1), 2, W - 2), b = clamp(Math.min(y0, y1), 2, H - 2);
    return { x: a, y: b, w: clamp(Math.max(x0, x1), 2, W - 2) - a, h: clamp(Math.max(y0, y1), 2, H - 2) - b };
  }
  function geoWind() {
    var w = E.wind(s), top = L.padT + 6, bot = L.ySL - 8, span = L.ox1 - L.ox0;
    var thick = (4 + 7 * w) * L.u + 2, len2 = span * (0.07 + 0.09 * w);
    var yA = bot - (bot - top) * 0.3, yHi = yA - (bot - top) * 0.22, fs = clamp(12 * L.u + 3, 11, 16);
    return box(L.ox0 + span * 0.24 - len2 / 2 - 8, yHi - thick - fs * 1.4, L.ox0 + span * 0.8 + len2 / 2 + 8, yA + thick + 4);
  }
  function geoFlow() {
    var w = E.wind(s), y = L.zToY(12);
    return { x0: L.lonToX(258), x1: L.lonToX(258 - 38 - 42 * w), y: y, th: (2.5 + 4 * w) * L.u + 1.5, ly: y + (8 + 5 * w) * L.u + 6, fs: fsz(2.5) };
  }
  function geoUp() {
    var U = E.upwelling(s), c = E.column(268, s);
    return { x: L.lonToX(268), yB: L.zToY(Math.min(200, c.D + 55)), yT: L.zToY(Math.max(3, c.M * 0.3)) + 2, th: (2.5 + 6 * Math.min(U, 2) / 2) * L.u + 2, fs: fsz(4) };
  }
  function geoAir() {
    var wk = E.walker(s), u2 = clamp(W / 700, 0.6, 1.15), skyH = L.ySL - L.padT;
    var r = (12 + 11 * wk.convection) * u2;
    var eSST = E.sst(276, s);
    var g = {
      wk: wk, u2: u2, r: r,
      cx: clamp(L.lonToX(wk.rise), L.ox0 + r * 0.9, L.ox1 - r * 1.5), cy: L.padT + skyH * 0.2 + r * 0.35,
      // 엘니뇨로 동태평양 연안 바다가 충분히 따뜻해지면(모형 표층 수온 26.5 °C 이상) 해안에도 비구름
      coast: eSST >= 26.5 ? clamp((eSST - 26.5) / 1.2, 0.4, 1) : 0,
      sunX: L.lonToX(269), sunY: L.padT + skyH * 0.3, sunR: 7 * u2 + 3,
      dry: s <= -0.4, dX: (L.padL + L.ox0) / 2 + 2
    };
    g.cR = r * (0.45 + 0.15 * g.coast); g.cX = L.lonToX(270); g.cY = g.cy + r * 0.3;
    return g;
  }

  // 밝게 비출 곳
  var REG = {
    westsea: function () {
      return [box(L.lonToX(131.5), L.surfY(140, s) - 8, L.lonToX(176), L.zToY(Math.max(E.mixedLayer(150, s) + 18, 55)))];
    },
    eastsea: function () {
      return [box(L.lonToX(229), Math.min(L.surfY(229, s), L.surfY(279, s)) - 8, L.lonToX(279.6), L.zToY(Math.max(E.mixedLayer(268, s) + 30, 80)))];
    },
    wind: function () { return [geoWind()]; },
    flow: function () { var g = geoFlow(); return [box(g.x1 - 8, g.y - g.th * 1.1 - 6, g.x0 + 8, g.ly + g.fs * 0.8)]; },
    sea: function () {
      var lo = Infinity, hi = -Infinity;
      for (var lon = E.LON_W; lon <= E.LON_E; lon += 5) { var y = L.surfY(lon, s); lo = Math.min(lo, y); hi = Math.max(hi, y); }
      return [box(L.ox0 - 4, lo - fsz() * 1.7 - 4, L.ox1 + 4, hi + 12)];
    },
    thermo: function () {
      var m1 = E.mixedLayer(135, s), m2 = E.mixedLayer(279, s);
      return [box(L.ox0 - 4, L.zToY(Math.min(m1, m2)) - 10, L.ox1 + 4, L.zToY(Math.max(m1, m2) + 40))];
    },
    up: function () { var g = geoUp(); return [box(g.x - g.th - g.fs * 2.6, g.yT - 8, g.x + g.th + 8, g.yB + 8)]; },
    fish: function () { return [box(L.lonToX(253), L.zToY(0) - 8, L.lonToX(279.8), L.zToY(25))]; },
    cloud: function () {
      var g = geoAir(), R = [box(g.cx - g.r * 2.0, g.cy - g.r * 1.15, g.cx + g.r * 1.7, L.ySL + 3)];
      if (g.coast) R.push(box(g.cX - g.cR * 1.7, g.cY - g.cR * 1.2, g.cX + g.cR * 1.7, L.ySL + 3));
      return R;
    },
    sink: function () { var g = geoAir(); return g.coast ? [] : [box(g.sunX - g.sunR * 2.2, g.sunY - g.sunR * 1.8, g.sunX + g.sunR * 2.2, L.ySL + 3)]; },
    drywest: function () { return [box(L.padL + 1, L.padT + 2, L.lonToX(150), L.ySL + 6)]; }
  };

  /* ── 바탕 (s·크기·그림 층이 같으면 다시 그리지 않음) ── */
  function buildBase(sh) {
    if (!base) base = document.createElement('canvas');
    base.width = cv.width; base.height = cv.height;
    var b = base.getContext('2d'), t = D.theme(), fs = fsz();
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    b.clearRect(0, 0, W, H);
    D.drawSky(b, L);
    D.drawOcean(b, L, s, 'temp');
    if (sh.thermo) {
      D.drawThermocline(b, L, s, { mode: 'temp' });
      var c = E.column(200, s);
      D.text(b, '수온약층', L.lonToX(200), (L.zToY(c.M) + L.zToY(c.D + 53)) / 2, { size: fs, weight: 700, color: '#0f1d26', haloColor: 'rgba(255,255,255,0.8)' });
    }
    D.drawLand(b, L, s, { names: true });
    D.text(b, '깊은 곳의 차가운 바닷물', L.lonToX(205), L.zToY(262), { size: fs - 1, weight: 600, color: '#e6f0ff', haloColor: 'rgba(10,30,70,0.55)' });

    if (sh.sea) {
      // 동쪽 해수면 높이를 서쪽까지 점선으로 이어 높이 차를 보여 줌
      var yE = L.surfY(E.LON_E - 2, s), xW = L.lonToX(147), yW = L.surfY(147, s);
      b.save();
      b.setLineDash([5, 4]); b.lineWidth = 1.4; b.strokeStyle = t.ink; b.globalAlpha = 0.75;
      b.beginPath(); b.moveTo(L.ox0, yE); b.lineTo(L.ox1, yE); b.stroke();
      b.restore();
      if (yE - yW > 5) {
        b.save();
        b.strokeStyle = t.ink; b.lineWidth = 1.8;
        b.beginPath(); b.moveTo(xW, yW + 1); b.lineTo(xW, yE - 1); b.stroke();
        D.arrowHead(b, xW, yW, -Math.PI / 2, 6, t.ink);
        D.arrowHead(b, xW, yE, Math.PI / 2, 6, t.ink);
        b.restore();
      }
      D.text(b, '해수면 높이 차', xW + 6, Math.min(yW, yE) - fs * 0.9, { size: fs - 0.5, weight: 700, align: 'left' });
    }
    if (sh.flow) {
      var g = geoFlow();
      b.save(); b.globalAlpha = 0.9;
      D.blockArrow(b, g.x0, g.x1, g.y, g.th, 'rgba(255,255,255,0.72)', 'rgba(20,30,40,0.35)');
      b.restore();
      D.text(b, '표층 바닷물', (g.x0 + g.x1) / 2, g.ly, { size: g.fs, weight: 700, color: '#10202a', haloColor: 'rgba(255,255,255,0.8)' });
    }
    if (sh.up) {
      var u = geoUp();
      D.upArrow(b, u.x, u.yB, u.yT, u.th, 'rgba(214,245,255,0.93)', 'rgba(16,40,70,0.6)');
      D.text(b, '용승', u.x - u.th - u.fs * 1.3, (u.yB + u.yT) / 2 + 6, { size: u.fs, weight: 800, color: '#0b2a44', haloColor: 'rgba(225,248,255,0.9)' });
    }
  }

  /* ── 움직이는 층 ─────────────────────── */
  // D.updateFlow 가 움직인 입자 중 보이는 층만 그림 (표층 바닷물 이동 / 용승)
  function drawParticles(c, sh) {
    var w = E.wind(s), i;
    c.save();
    c.lineCap = 'round';
    if (sh.flow) {
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.6;
      c.beginPath();
      for (i = 0; i < flow.nSurf; i++) {
        var p = flow.surf[i], col = E.column(p.lon, s);
        var x = L.lonToX(p.lon), y = L.zToY(2 + p.f * Math.max(4, col.M * 0.8));
        c.moveTo(x, y); c.lineTo(x + (4 + 7 * w) * L.u, y);
      }
      c.stroke();
    }
    if (sh.up) {
      c.fillStyle = 'rgba(210,245,255,0.95)'; c.strokeStyle = 'rgba(210,245,255,0.55)'; c.lineWidth = 1.4;
      for (i = 0; i < flow.nUp; i++) {
        var q = flow.up[i];
        if (!q.alive) continue;
        var qx = L.lonToX(q.lon), qy = L.zToY(q.z);
        c.globalAlpha = Math.min(1, q.age * 1.5);
        c.beginPath(); c.moveTo(qx, qy); c.lineTo(qx + 1.5, qy + 7 * L.u + 3); c.stroke();
        c.beginPath(); c.arc(qx, qy, 1.9 * Math.max(0.8, L.u), 0, Math.PI * 2); c.fill();
      }
    }
    c.restore();
  }
  function downArrow(c, x, y0, y1, th, fill, edge) {
    if (y1 - y0 < 10) return;
    c.save(); c.translate(x, y0); c.rotate(Math.PI / 2);
    D.blockArrow(c, 0, y1 - y0, 0, th, fill, edge);
    c.restore();
  }
  // 따뜻한 바다 위: 공기가 올라감 → 구름·비 / 차가운 바다 위: 공기가 내려옴 → 맑음
  function drawAir(c) {
    var g = geoAir(), r = g.r, tm = motion ? time : 0;
    var th = (3 + 2 * g.wk.convection) * g.u2;
    D.rain(c, g.cx, g.cy + r * 0.45, L.ySL + 2, r * 1.7, Math.round(5 + 4 * g.wk.convection), tm, 0.85);
    if (g.coast) D.rain(c, g.cX, g.cY + g.cR * 0.45, L.ySL + 2, g.cR * 1.6, Math.round(2 + 3 * g.coast), tm, 0.8);
    c.save(); c.globalAlpha = 0.85;
    D.upArrow(c, g.cx - r * 1.45, L.ySL - 6, g.cy + r * 0.25, th, 'rgba(255,255,255,0.92)', 'rgba(60,80,100,0.55)');
    if (!g.coast) downArrow(c, g.sunX, g.sunY + g.sunR * 1.7, L.ySL - 6, th * 0.9, 'rgba(255,255,255,0.92)', 'rgba(60,80,100,0.55)');
    c.restore();
    D.cloud(c, g.cx, g.cy, r);
    if (g.coast) D.cloud(c, g.cX, g.cY, g.cR);
    else D.sun(c, g.sunX, g.sunY, g.sunR);
    if (g.dry) D.sun(c, g.dX, g.sunY, g.sunR * 0.9);   // 엘니뇨 때 인도네시아 쪽은 비가 줄어 맑고 건조
  }

  function drawSpot(c, keys) {
    var R = [];
    keys.forEach(function (k) { if (REG[k]) R = R.concat(REG[k]()); });
    R = R.filter(function (r) { return r.w > 4 && r.h > 4; });
    if (!R.length) return;
    var t = D.theme();
    if (!spot) spot = document.createElement('canvas');
    if (spot.width !== cv.width || spot.height !== cv.height) { spot.width = cv.width; spot.height = cv.height; }
    var g = spot.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    g.fillStyle = t.dark ? 'rgba(0,0,0,0.42)' : 'rgba(12,24,34,0.3)';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-out';   // 겹친 곳도 한 번만 뚫리도록 따로 그린 뒤 얹음
    g.fillStyle = '#000';
    R.forEach(function (r) { g.beginPath(); D.roundRect(g, r.x, r.y, r.w, r.h, 10); g.fill(); });
    g.globalCompositeOperation = 'source-over';
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(spot, 0, 0);
    c.restore();
    c.save();
    R.forEach(function (r) { c.beginPath(); D.roundRect(c, r.x, r.y, r.w, r.h, 10); c.lineWidth = 4.5; c.strokeStyle = 'rgba(0,0,0,0.35)'; c.stroke(); });
    c.setLineDash([8, 6]); c.lineDashOffset = motion ? -time * 18 : 0;
    R.forEach(function (r) { c.beginPath(); D.roundRect(c, r.x, r.y, r.w, r.h, 10); c.lineWidth = 2.4; c.strokeStyle = '#ffd23f'; c.stroke(); });
    c.restore();
  }

  /* ── 그림 위 캐릭터 ─────────────────── */
  var actors = {};
  Object.keys(CH).forEach(function (k) {
    var el = document.createElement('div');
    el.className = 'actor';
    el.setAttribute('data-who', k);
    el.innerHTML = '<span class="actor-av"></span><span class="actor-nm"></span>';
    el.lastChild.textContent = CH[k].tag;
    castEl.appendChild(el);
    actors[k] = { el: el, av: el.firstChild, mood: null };
  });
  function actorPos(k) {
    var skyH = L.ySL - L.padT;
    if (k === 'wind') return [L.lonToX(232), L.padT + skyH * 0.2];
    if (k === 'west') return [L.lonToX(143), L.zToY(30)];
    if (k === 'east') return [L.lonToX(240), L.zToY(62)];
    if (k === 'cloud') { var g = geoAir(); return [Math.min(W - avSize * 0.6, g.cx + g.r * 1.2 + avSize * 0.45), g.cy - g.r * 0.5]; }
    return [Math.min(W - avSize * 0.55, L.ox1 + L.landE * 0.42 + 2), L.surfY(E.LON_E, s) - avSize * 0.62];   // 어부: 남아메리카 해안
  }
  function placeCast() {
    var key = [W, H, s.toFixed(3), Object.keys(st.cast).join(','), st.who, st.mood].join('|');
    if (key === castKey) return;
    castKey = key;
    Object.keys(actors).forEach(function (k) {
      var a = actors[k], on = !!st.cast[k];
      a.el.classList.toggle('on', on);
      if (!on) return;
      var m = moodOf(k, s);
      if (a.mood !== m) { a.av.innerHTML = CH[k].ic(m); a.mood = m; }
      var p = actorPos(k);
      a.el.style.left = Math.round(p[0] - avSize / 2) + 'px';
      a.el.style.top = Math.round(Math.max(2, p[1] - avSize / 2)) + 'px';   // 그림 위쪽 밖으로 나가지 않게
    });
  }
  function hop(who) {
    Object.keys(actors).forEach(function (k) { actors[k].el.classList.remove('speaking'); });
    var a = actors[who];
    if (!a) return;
    void a.el.offsetWidth;   // 애니메이션 다시 시작
    a.el.classList.add('speaking');
  }

  /* ── 그리기 ─────────────────────────── */
  function draw(dt) {
    var sh = st.show;
    var key = [s.toFixed(3), W, H, Object.keys(sh).sort().join(','), themeTick].join('|');
    if (key !== baseKey) { buildBase(sh); baseKey = key; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(base, 0, 0, W, H);
    if (motion && (sh.flow || sh.up)) { D.updateFlow(flow, s, dt); drawParticles(ctx, sh); }
    if (sh.fish) D.drawFishery(ctx, L, s, time);
    if (sh.air) drawAir(ctx);
    if (sh.wind) D.drawTradeWind(ctx, L, s, windP, dt, { labels: false });   // 이름은 그림 위 무역풍 캐릭터가 보여 줌
    if (st.hl.length) drawSpot(ctx, st.hl);
    placeCast();
  }

  function frame(dt) {
    if (!L || !st) return;
    var moving = false;
    if (s !== target) {
      var d = target - s;
      s = Math.abs(d) < 0.004 ? target : s + d * Math.min(1, dt * 2.4);
      moving = true;
      updateRead();
    }
    if (!motion && !dirty && !moving) return;
    if (motion) time += dt;
    draw(motion ? dt : 0);
    dirty = false;
  }

  /* ── 수온 읽기 ──────────────────────── */
  function fmt(v) { var r = v.toFixed(1); return r === '-0.0' ? '0.0' : r; }
  function delta(el, v) {
    if (Math.abs(v) < 0.05) { el.textContent = ''; el.className = 'rv-d'; return; }
    el.textContent = '평소보다 ' + (v > 0 ? '+' : '−') + fmt(Math.abs(v));
    el.className = 'rv-d ' + (v > 0 ? 'up' : 'dn');
  }
  function updateRead() {
    var sw = E.sst(E.PROBE_W, s), se = E.sst(E.PROBE_E, s);
    $('rv-w').textContent = fmt(sw);
    $('rv-e').textContent = fmt(se);
    delta($('rv-dw'), sw - E.sst(E.PROBE_W, 0));
    delta($('rv-de'), se - E.sst(E.PROBE_E, 0));
    cv.setAttribute('aria-label', '적도 태평양 단면 그림. ' + S.BADGE[st.badge][0] + '. 서쪽 바다 표층 수온 ' + fmt(sw) +
      '도, 동쪽 바다 표층 수온 ' + fmt(se) + '도.');
  }

  /* ── 대화 ───────────────────────────── */
  var dots = $('dots');
  STEPS.forEach(function (step, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'STEP ' + i + ': ' + step.title);
    b.title = 'STEP ' + i + ': ' + step.title;
    b.addEventListener('click', function () { go(i, 0); });
    dots.appendChild(b);
  });

  function askEl(a, got) {
    var wrap = document.createElement('div');
    wrap.className = 'ask';
    var row = document.createElement('div');
    row.className = 'choices';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', a.q + ' 예측');
    a.opts.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ch' + (got ? (o === a.ans ? ' right' : o === got ? ' wrong' : '') : '');
      b.textContent = S.CHOICE[o];
      b.setAttribute('data-o', o);
      b.disabled = !!got;
      row.appendChild(b);
    });
    wrap.appendChild(row);
    if (got) {
      var fb = document.createElement('div');
      fb.className = 'fb ' + (got === a.ans ? 'ok' : 'no');
      fb.textContent = got === a.ans ? '맞아요! 그림에서 바뀐 모습을 확인해 보세요.' : '아쉬워요. 실제로는 ' + S.RESULT[a.ans] + ' 그림에서 확인해 보세요.';
      wrap.appendChild(fb);
    }
    return wrap;
  }

  function render() {
    var step = STEPS[cur], ln = step.lines[li];
    var lastLine = li === step.lines.length - 1, lastStep = cur === STEPS.length - 1;
    st = stateAt(cur, li);
    $('stepNo').textContent = 'STEP ' + cur + ' / ' + (STEPS.length - 1);
    $('stepDare').hidden = !step.dare;
    $('stepTitle').textContent = step.title;
    var av = $('sayAv');
    av.className = 'av ' + ln.who;
    av.innerHTML = CH[ln.who].ic(moodOf(ln.who, st.s));
    $('sayName').textContent = CH[ln.who].nm;
    $('sayCnt').textContent = step.lines.length > 1 ? (li + 1) + ' / ' + step.lines.length : '';
    $('speech').className = 'speech ' + ln.who;
    $('sayText').textContent = ln.t;

    note.innerHTML = '';
    var got = ln.ask ? answers[cur + '-' + li] : null;
    if (ln.ask) note.appendChild(askEl(ln.ask, got));
    if (ln.key) {
      var k = document.createElement('div');
      k.className = 'key';
      k.textContent = ln.key;
      note.appendChild(k);
    }
    var more = $('stepMore');
    more.hidden = !step.more;
    $('stepMoreText').textContent = step.more || '';
    if (shownStep !== cur) more.open = false;   // 단계가 바뀌면 '더 알아보기'를 접음
    shownStep = cur;

    var next = $('next');
    $('prev').disabled = cur === 0 && li === 0;
    next.disabled = !!(ln.ask && !got);
    next.textContent = next.disabled ? '먼저 예측해 보세요' : lastStep && lastLine ? S.END_LABEL : lastLine ? '다음 단계 ▶' : '다음 대화 ▶';
    Array.prototype.forEach.call(dots.children, function (b, i) {
      b.className = (i < cur ? 'done' : i === cur ? 'cur' : '') + (STEPS[i].dare ? ' dare' : '');
      if (i === cur) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });

    var bd = S.BADGE[st.badge];
    badge.textContent = bd[0];
    badge.setAttribute('data-phase', bd[1]);
    target = st.s;
    if (!motion) s = target;
    hop(ln.who);
    castKey = '';
    updateRead();
    dirty = true;
  }

  function go(i, j) {
    cur = clamp(i, 0, STEPS.length - 1);
    li = clamp(j || 0, 0, STEPS[cur].lines.length - 1);
    render();
  }
  // 다음: 남은 대사 → 다음 단계 → 마지막 대사에서는 실측자료 탐구실로
  function nextLine() {
    if ($('next').disabled) return;
    if (li < STEPS[cur].lines.length - 1) go(cur, li + 1);
    else if (cur < STEPS.length - 1) go(cur + 1, 0);
    else location.href = S.END_URL;
  }
  // 이전: 바로 앞 대사 → 단계의 첫 대사에서는 이전 단계의 마지막 대사로
  function prevLine() {
    if (li > 0) go(cur, li - 1);
    else if (cur > 0) go(cur - 1, STEPS[cur - 1].lines.length - 1);
  }

  $('prev').addEventListener('click', prevLine);
  $('next').addEventListener('click', nextLine);
  $('restart').addEventListener('click', function () { answers = {}; go(0, 0); });
  note.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.ch');
    if (!b || b.disabled) return;
    answers[cur + '-' + li] = b.getAttribute('data-o');
    render();
    $('next').focus();   // 고른 단추는 다시 그려지므로 '다음'으로 초점을 옮김
  });
  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var tg = e.target && e.target.closest ? e.target : null;
    if (tg && tg.closest('input, textarea, select')) return;
    var onCtl = tg && tg.closest('button, a, summary, label');
    if (e.key === 'ArrowRight') { e.preventDefault(); nextLine(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prevLine(); }
    else if ((e.key === ' ' || e.key === 'Enter') && !onCtl) { e.preventDefault(); nextLine(); }
  });
  // 제목을 누르면 처음 화면으로: STEP 0 첫 대사 · 맨 위 (예측 답은 그대로 둠)
  $('homeLink').addEventListener('click', function (e) {
    e.preventDefault();
    go(0, 0);
    window.scrollTo(0, 0); document.body.scrollTop = 0;
  });

  /* ── 보기 설정 · 색 막대 · 테마 ─────── */
  var motionBox = $('story-motion');
  motionBox.checked = motion;
  motionBox.addEventListener('change', function () { motion = motionBox.checked; if (!motion) s = target; dirty = true; });

  $('story-cbar').style.background = D.gradientCss(D.TEMP);
  $('story-cbar-ticks').innerHTML = [8, 12, 16, 20, 24, 28].map(function (v) {
    return '<span style="left:' + ((v - D.TEMP.lo) / (D.TEMP.hi - D.TEMP.lo) * 100).toFixed(1) + '%">' + v + '</span>';
  }).join('');

  function themeChanged() { D.invalidateTheme(); themeTick++; dirty = true; }
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged); } catch (e) { /* 무시 */ }
  if (window.MutationObserver) {
    new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(themeChanged);

  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize);
  resize();
  go(0, 0);

  var last = performance.now();
  function loop(now) {
    var dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    frame(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
