/* 대화로 배우는 엘니뇨: 적도 단면 그림, 그림 위 캐릭터, 대화 진행 (과목별 대본)
 * 대본은 script.js(window.STORY.stepsFor(과목)). 수온·수온약층·해수면·용승·기압은 ../js/model.js(window.ENSO),
 * 바다·육지·무역풍·물고기·구름·워커 순환 그리기는 ../js/draw.js(window.ENSODraw)를 그대로 쓴다.
 * 과목은 ../js/lab.js(window.LAB). 없으면 통합과학. 과목을 바꾸면 같은(없으면 가장 가까운) 단계에서 이어 간다.
 */
(function () {
  'use strict';
  var E = window.ENSO, D = window.ENSODraw, S = window.STORY;
  var clamp = E.clamp;
  var CH = S.CH, LAB = window.LAB;
  function subjectNow() { return LAB && LAB.get() === 'earth' ? 'earth' : 'integrated'; }
  var subj = subjectNow(), STEPS = S.stepsFor(subj);

  function $(id) { return document.getElementById(id); }

  var stage = $('story-stage'), cv = $('story-canvas'), ctx = cv.getContext('2d');
  var badge = $('story-badge'), castEl = $('cast'), note = $('sayNote');
  var W = 0, H = 0, dpr = 1, L = null;
  var base = null, baseKey = '', spot = null;
  var s = 0, target = 0, time = 0, dirty = true, themeTick = 0;
  var flow = D.makeFlow(70, 46), windP = D.makeWind(64);
  var cur = 0, li = 0, shownStep = -1, answers = {};
  var st = null;          // 지금 대사의 상태 {s, badge, show, cast, hl, who, mood}
  var wkGeo = null, prGeo = null;   // 이번 프레임에 그린 워커 순환·기압 표시의 위치(밝게 비추기·캐릭터 자리에 씀)
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
        (ln.show || []).forEach(function (x) { if (x.charAt(0) === '-') delete o.show[x.slice(1)]; else o.show[x] = true; });
        o.cast[ln.who] = true;
        if (ln.ask && answers[STEPS[k].id + '-' + q]) {
          if (ln.ask.reveal != null) o.s = ln.ask.reveal;
          if (ln.ask.badge) o.badge = ln.ask.badge;
          (ln.ask.show || []).forEach(function (x) { o.show[x] = true; });
        }
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
  // D.drawTradeWind 의 큰 화살표 4개(경도 비율 0.14~0.86, 길이·굵기는 그 경도의 바람 세기)를 감싸는 상자
  function geoWind() {
    var top = L.padT + 6, bot = L.ySL - 8, span = L.ox1 - L.ox0;
    var thick = (3 + 8 * 1.3) * L.u + 1.5, len2 = span * (0.03 + 0.1 * 1.3);
    var yA = bot - (bot - top) * 0.3, yHi = yA - (bot - top) * 0.22;
    return box(L.ox0 + span * 0.14 - len2 / 2 - 6, yHi - thick - 6, L.ox0 + span * 0.86 + len2 / 2 + 6, yA + thick + 4);
  }
  function geoFlow() {
    var w = E.wind(s), y = L.zToY(12);
    if (subj === 'integrated') {   // 통합과학2: 학습지 방식 — 평상시 서쪽 표층 해수, 엘니뇨 따뜻한 해수의 동쪽 확장(D.schemFlow)
      var sf = D.schemFlow(L, s), a = sf.east || sf.west;
      return { x0: a.x0, x1: a.x1, y: y, th: a.th, ly: y + a.th + fsz(2.5) * 0.8 + 4, fs: fsz(2.5), warm: !!sf.east, a: Math.max(0.35, a.a) };
    }
    return { x0: L.lonToX(258), x1: L.lonToX(258 - 38 - 42 * w), y: y, th: (2.5 + 4 * w) * L.u + 1.5, ly: y + (8 + 5 * w) * L.u + 6, fs: fsz(2.5), warm: false, a: 1 };
  }
  function geoUp() {
    if (subj === 'integrated') { var su = D.schemUp(L, s); return { x: su.x, yB: su.yB, yT: su.yT, th: su.th, fs: fsz(4), a: su.a }; }   // 평상시 크게, 엘니뇨 작고 흐리게
    var U = E.upwelling(s), c = E.column(268, s);
    return { x: L.lonToX(268), yB: L.zToY(Math.min(200, c.D + 55)), yT: L.zToY(Math.max(3, c.M * 0.3)) + 2, th: (2.5 + 6 * Math.min(U, 2) / 2) * L.u + 2, fs: fsz(4), a: 1 };
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
      // 대류 중심이 동쪽으로 옮겨 가면 평상시 구름 자리에 흐린 구름(서태평양 비 감소. '맑음'으로 그리지 않음)
      dry: wk.rise - E.walker(0).rise > 12, gR: (12 + 11 * E.walker(0).convection) * u2 * 0.8
    };
    g.gX = clamp(L.lonToX(E.walker(0).rise), L.ox0 + g.gR * 0.9, L.ox1 - g.gR * 1.5);
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
    flow: function () { var g = geoFlow(); return [box(Math.min(g.x0, g.x1) - 8, g.y - g.th * 1.1 - 6, Math.max(g.x0, g.x1) + 8, g.ly + g.fs * 0.8)]; },
    sea: function () {
      var lo = Infinity, hi = -Infinity;
      for (var lon = E.LON_W; lon <= E.LON_E; lon += 5) { var y = L.surfY(lon, s); lo = Math.min(lo, y); hi = Math.max(hi, y); }
      return [box(L.ox0 - 4, lo - fsz() * 1.7 - 4, L.ox1 + 4, hi + 12)];
    },
    // 수온약층 띠·20 ℃ 선(지구과학), 따뜻한 해수층(통합과학)을 감싸도록
    thermo: function () {
      var top = Math.min(E.mixedLayer(135, s), E.mixedLayer(279, s)), bot = Math.max(E.iso20(140, s), E.iso20(160, s), E.iso20(279, s));
      return [box(L.ox0 - 4, L.zToY(top) - 10, L.ox1 + 4, L.zToY(bot) + 14)];
    },
    up: function () { var g = geoUp(); return [box(g.x - g.th - g.fs * 2.6, g.yT - 8, g.x + g.th + 8, g.yB + 8)]; },
    fish: function () { return [box(L.lonToX(253), L.zToY(0) - 8, L.lonToX(279.8), L.zToY(25))]; },
    cloud: function () {
      var g = geoAir(), R = [box(g.cx - g.r * 2.0, g.cy - g.r * 1.15, g.cx + g.r * 1.7, L.ySL + 3)];
      if (g.coast) R.push(box(g.cX - g.cR * 1.7, g.cY - g.cR * 1.2, g.cX + g.cR * 1.7, L.ySL + 3));
      return R;
    },
    sink: function () {
      if (wkGeo) { var x = wkGeo.sinkX, y = wkGeo.yB - (wkGeo.yB - wkGeo.yT) * 0.32; return [box(x - 36 * wkGeo.u, wkGeo.yT - 8, x + 30 * wkGeo.u, L.ySL + 3)]; }
      var g = geoAir(); return g.coast ? [] : [box(g.sunX - g.sunR * 2.2, g.sunY - g.sunR * 1.8, g.sunX + g.sunR * 2.2, L.ySL + 3)];
    },
    walker: function () { return wkGeo ? [box(L.ox0 - 6, wkGeo.yT - wkGeo.cloudR * 1.2, L.ox1 + 6, wkGeo.yB + 10)] : []; },
    rise: function () { return wkGeo ? [box(wkGeo.xR - wkGeo.cloudR * 1.7, wkGeo.yT - wkGeo.cloudR * 1.2, wkGeo.xR + wkGeo.cloudR * 1.7, wkGeo.yB + 8)] : REG.cloud(); },
    lower: function () { return wkGeo ? [box(L.ox0 - 6, wkGeo.yB - 14, L.ox1 + 6, wkGeo.yB + 14)] : [geoWind()]; },
    darwin: function () { return prGeo ? [prGeo.darwin] : []; },
    tahiti: function () { return prGeo ? [prGeo.tahiti] : []; },
    soi: function () { return prGeo && prGeo.soi ? [prGeo.soi] : []; },
    drywest: function () {   // 워커 순환 고리 장면(지구과학)은 예전 크기, 공기 오르내림 장면은 변화 화살표 글자까지
      var g = geoAir(), x1 = Math.max(L.lonToX(150), g.gX + g.gR * 1.3);
      if (!wkGeo && !prGeo && subj === 'earth') x1 = Math.max(x1, g.gX + 16 * g.u2 + fsz(-1) * 7.5);
      return [box(L.padL + 1, L.padT + 2, x1, L.ySL + 6)];
    }
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
      var c = E.column(200, s);
      if (subj === 'earth') {   // 수온약층 띠(흰 선 = 시작 깊이)와 20 ℃ 등온선(굵은 선)
        D.drawThermocline(b, L, s, { mode: 'temp', thin: true });
        D.drawIso20(b, L, s, { label: '20 ℃', labelLon: 205 });
        D.text(b, '수온약층', L.lonToX(200), (L.zToY(c.M) + L.zToY(c.D15)) / 2, { size: fs, weight: 700, color: '#0f1d26', haloColor: 'rgba(255,255,255,0.8)' });
      } else {                  // 통합과학: 선 없이 수온 색과 '따뜻한 해수층' 이름만
        var cw = E.column(165, s);
        D.text(b, '따뜻한 해수층', L.lonToX(165), (L.surfY(165, s) + L.zToY(cw.D)) / 2 + 6, { size: fs, weight: 800, color: '#3a0a06', haloColor: 'rgba(255,235,220,0.85)' });
      }
    }
    // 워커 순환·기압 표시가 하늘을 채우는 단계에서는 땅 이름과 해수면 높이 차 표시를 감춘다(겹치지 않게)
    var busy = sh.walker || sh.pressure;
    // 좁은 화면에서 서태평양 변화 화살표의 글자가 들어갈 자리가 없으면 땅 이름을 감춘다(겹침 방지)
    var crowd = subj === 'earth' && sh.air && W < 480 && E.walker(s).rise - E.walker(0).rise > 12;
    D.drawLand(b, L, s, { names: !busy && !crowd });
    D.text(b, '깊은 곳의 차가운 바닷물', L.lonToX(205), L.zToY(262), { size: fs - 1, weight: 600, color: '#e6f0ff', haloColor: 'rgba(10,30,70,0.55)' });

    if (sh.sea && !busy) {
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
      b.save(); b.globalAlpha = 0.9 * g.a;
      if (g.warm) D.blockArrow(b, g.x0, g.x1, g.y, g.th, D.WARM_FILL, D.WARM_EDGE);
      else D.blockArrow(b, g.x0, g.x1, g.y, g.th, 'rgba(255,255,255,0.72)', 'rgba(20,30,40,0.35)');
      b.restore();
      if (g.warm) D.text(b, '따뜻한 바닷물의 동쪽 확장', (g.x0 + g.x1) / 2, g.ly, { size: g.fs, weight: 700, color: '#3a0a06', haloColor: 'rgba(255,235,220,0.85)' });
      else D.text(b, '표층 바닷물', (g.x0 + g.x1) / 2, g.ly, { size: g.fs, weight: 700, color: '#10202a', haloColor: 'rgba(255,255,255,0.8)' });
    }
    if (sh.up) {
      var u = geoUp();
      b.save(); b.globalAlpha = u.a;
      D.upArrow(b, u.x, u.yB, u.yT, u.th, 'rgba(214,245,255,0.93)', 'rgba(16,40,70,0.6)');
      b.restore();
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
  function drawAir(c, sh) {
    var g = geoAir(), r = g.r, tm = motion ? time : 0;
    var th = (3 + 2 * g.wk.convection) * g.u2;
    D.rain(c, g.cx, g.cy + r * 0.45, L.ySL + 2, r * 1.7, Math.round(5 + 4 * g.wk.convection), tm, 0.85);
    if (g.coast) D.rain(c, g.cX, g.cY + g.cR * 0.45, L.ySL + 2, g.cR * 1.6, Math.round(2 + 3 * g.coast), tm, 0.8);
    c.save(); c.globalAlpha = 0.85;
    // 상승 기류: 통합과학2는 구름 한가운데 아래(구름이 덮어 그려져 구름 속으로 들어가 보임), 지구과학은 예전대로 구름 왼쪽
    D.upArrow(c, subj === 'integrated' ? g.cx : g.cx - r * 1.45, L.ySL - 6, g.cy + r * 0.25, th, 'rgba(255,255,255,0.92)', 'rgba(60,80,100,0.55)');
    if (!g.coast) downArrow(c, g.sunX, g.sunY + g.sunR * 1.7, L.ySL - 6, th * 0.9, 'rgba(255,255,255,0.92)', 'rgba(60,80,100,0.55)');
    c.restore();
    if (subj === 'integrated') D.drawRainBand(c, s, L.lonToX, g.cy, r, L.ySL + 2, tm, L.ox1 - r);   // 동쪽으로 이어진 비구름 띠(통합과학2)
    D.cloud(c, g.cx, g.cy, r);
    if (g.coast) D.cloud(c, g.cX, g.cY, g.cR);
    else D.sun(c, g.sunX, g.sunY, g.sunR);
    if (g.dry && subj === 'integrated') {
      // 통합과학2(학습지의 교과서형 모식도): 흐린 구름과 약한 비(비가 줄었지만 그치지 않음) + 그 서쪽에 하강 기류(동쪽 하강과 같은 흰 화살표)
      var wX = Math.max(L.ox0 + th * 2, g.gX - g.gR * 2.2);
      var wY1 = sh && sh.sea ? L.ySL - fsz() * 2.1 : L.ySL - 6;   // '해수면 높이 차' 표시와 겹치지 않게
      D.rain(c, g.gX, g.cy + g.gR * 0.45, L.ySL + 2, g.gR * 1.3, 3, tm, 0.35);
      D.cloud(c, g.gX, g.cy, g.gR, 0.32);
      c.save(); c.globalAlpha = 0.85;
      downArrow(c, wX, g.sunY + g.sunR * 1.7, wY1, th * 0.9, 'rgba(255,255,255,0.92)', 'rgba(60,80,100,0.55)');
      c.restore();
    } else if (g.dry) {   // 지구과학: 평상시보다 구름·비가 줄고(흐린 구름), 상승 약화·하강 강화(변화 화살표, 실제 하강 기류 아님)
      D.cloud(c, g.gX, g.cy, g.gR, 0.32);
      // 바다 위 '해수면 높이 차' 글자와 겹치지 않게 조금 위에서 멈춤. 기압 표시 장면(지구과학 PART D)에서는 겹치므로 생략
      if (!(sh && sh.pressure)) D.changeArrow(c, g.gX, g.cy + g.gR * 0.85, L.ySL - fsz() * 2.1, th, { lines: D.CHANGE_LINES, narrow: D.CHANGE_LINES_NARROW, size: fsz(-1), right: g.cx - r * 1.45 - th });
    }
  }

  // 워커 순환 고리(지구과학 PART C): ② 비교 그림과 같은 D.drawWalker
  function drawWalkerLoop(c) {
    var u = clamp(W / 560, 0.55, 1.1);
    var g = D.drawWalker(c, function (lon, a) { return [L.lonToX(lon), L.ySL - 6 - a * (L.ySL - L.padT - 10)]; }, s, time, { u: u, motion: motion });
    g.u = u; g.sinkX = L.lonToX(E.walker(s).sinkE) + 16 * u;
    return g;
  }
  // 다윈·타히티 기압 편차(모형, 실측 합성으로 맞춘 hPa)와 남방진동 지수 표시(지구과학 PART D)
  // 두 곳은 적도에서 조금 남쪽(다윈 12°S, 타히티 18°S)이라 그 경도의 하늘에 깃발처럼 세운다
  function drawPressure(c, withSoi) {
    var pr = E.pressure(s), fs = fsz(1.5), t = D.theme(), out = {};
    var skyH = L.ySL - L.padT, y = L.padT + skyH * 0.52;
    [['darwin', '다윈', 131, pr.darwin], ['tahiti', '타히티', 210, pr.tahiti]].forEach(function (q) {
      var v = q[3], hi = v > 0.3, lo = v < -0.3;
      var txt = q[1] + ' ' + (hi ? '▲ 높음' : lo ? '▼ 낮음' : '– 평소') + (hi || lo ? ' ' + (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1) + ' hPa' : '');
      var x0 = L.lonToX(q[2]);
      c.save(); c.font = D.font(fs, 700);
      var w = c.measureText(txt).width + fs * 1.2, h = fs * 1.9;
      c.restore();
      var x = clamp(x0 - w / 2, L.padL + 4, W - w - 4);
      c.save();
      c.strokeStyle = t.ink; c.lineWidth = 1.4; c.globalAlpha = 0.8;
      c.beginPath(); c.moveTo(x0, y + h / 2); c.lineTo(x0, L.ySL - 2); c.stroke();
      c.fillStyle = t.ink; c.beginPath(); c.arc(x0, L.ySL - 2, 3, 0, Math.PI * 2); c.fill();
      c.restore();
      D.pill(c, txt, x, y, { size: fs, align: 'left', bg: hi ? '#0f1d26' : lo ? '#ffffff' : 'rgba(255,255,255,0.85)', fg: hi ? '#ffffff' : '#0f1d26', border: '#0f1d26' });
      out[q[0]] = box(x - 4, y - h / 2 - 4, x + w + 4, L.ySL + 2);
    });
    if (withSoi) {
      var si = E.soi(s), txt2 = '남방진동 지수(모형) ' + (si > 0.05 ? '+' : si < -0.05 ? '−' : '') + Math.abs(si).toFixed(1);
      var ys = L.zToY(205);   // 깊은 바다 쪽 빈 곳(하늘에는 캐릭터·구름이 많음)
      c.save(); c.font = D.font(fs + 1, 800);
      var w2 = c.measureText(txt2).width + (fs + 1) * 1.2;
      c.restore();
      D.pill(c, txt2, W / 2, ys, { size: fs + 1, bg: si > 0.05 ? t.nina : si < -0.05 ? t.nino : t.normal, fg: t.onPhase });
      out.soi = box(W / 2 - w2 / 2 - 6, ys - fs * 1.4, W / 2 + w2 / 2 + 6, ys + fs * 1.4);
    }
    return out;
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
    if (k === 'cloud') {
      if (st.show.walker) {
        var u = clamp(W / 560, 0.55, 1.1), cr = (15 + 13 * E.walker(s).convection) * u, yT = L.ySL - 6 - 0.84 * (L.ySL - L.padT - 10);
        return [Math.min(W - avSize * 0.6, L.lonToX(E.walker(s).rise) + cr * 1.15 + avSize * 0.45), yT + cr * 0.2];
      }
      var g = geoAir(); return [Math.min(W - avSize * 0.6, g.cx + g.r * 1.2 + avSize * 0.45), g.cy - g.r * 0.5];
    }
    return [Math.min(W - avSize * 0.55, L.ox1 + L.landE * 0.42 + 2), L.surfY(E.LON_E, s) - avSize * 0.62];   // 어부: 남아메리카 해안
  }
  function placeCast() {
    var key = [W, H, s.toFixed(3), Object.keys(st.cast).join(','), st.who, st.mood, !!st.show.walker].join('|');
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
    var key = [s.toFixed(3), W, H, Object.keys(sh).sort().join(','), subj, themeTick].join('|');
    if (key !== baseKey) { buildBase(sh); baseKey = key; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(base, 0, 0, W, H);
    if (motion && (sh.flow || sh.up)) { D.updateFlow(flow, s, dt); drawParticles(ctx, sh); }
    if (sh.fish) D.drawFishery(ctx, L, s, time);
    wkGeo = null; prGeo = null;
    if (sh.walker) wkGeo = drawWalkerLoop(ctx);   // 고리의 아래쪽이 무역풍이므로 무역풍 화살표·간단한 구름은 그리지 않음
    else {
      if (sh.air) drawAir(ctx, sh);
      if (sh.wind) D.drawTradeWind(ctx, L, s, windP, dt, { labels: false });   // 이름은 그림 위 무역풍 캐릭터가 보여 줌
    }
    if (sh.pressure) prGeo = drawPressure(ctx, sh.soi);
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
  // 단계 바로 가기 점: 지구과학은 지금 PART 의 단계만, 통합과학은 모든 단계
  var dots = $('dots'), partsEl = $('parts');
  function partOf(i) { return STEPS[i].part; }
  function buildNav() {
    dots.innerHTML = '';
    STEPS.forEach(function (step, i) {
      if (subj === 'earth' && step.part !== partOf(cur)) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-i', i);
      b.setAttribute('aria-label', step.title);
      b.title = step.title;
      b.addEventListener('click', function () { go(i, 0); });
      dots.appendChild(b);
    });
    partsEl.hidden = subj !== 'earth';
    if (subj !== 'earth') return;
    partsEl.innerHTML = '';
    Object.keys(S.PARTS).forEach(function (p) {
      var first = -1;
      STEPS.forEach(function (x, i) { if (first < 0 && x.part === p) first = i; });
      if (first < 0) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'part' + (p === partOf(cur) ? ' cur' : '');
      if (p === partOf(cur)) b.setAttribute('aria-current', 'step');
      b.innerHTML = '<b>' + p + '</b><span></span>';
      b.lastChild.textContent = S.PARTS[p];
      b.addEventListener('click', function () { go(first, 0); });
      partsEl.appendChild(b);
    });
  }
  var navKey = '';

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
      b.textContent = (a.words || S.CHOICE)[o];
      b.setAttribute('data-o', o);
      b.disabled = !!got;
      row.appendChild(b);
    });
    wrap.appendChild(row);
    if (got) {
      var fb = document.createElement('div');
      fb.className = 'fb ' + (got === a.ans ? 'ok' : 'no');
      fb.textContent = got === a.ans ? '맞아요! 그림에서 바뀐 모습을 확인해 보세요.' : '아쉬워요. 실제로는 ' + (a.result || S.RESULT)[a.ans] + ' 그림에서 확인해 보세요.';
      wrap.appendChild(fb);
    }
    return wrap;
  }

  function render() {
    var step = STEPS[cur], ln = step.lines[li];
    var lastLine = li === step.lines.length - 1, lastStep = cur === STEPS.length - 1;
    st = stateAt(cur, li);
    var nk = subj + '|' + (subj === 'earth' ? partOf(cur) : '');
    if (nk !== navKey) { navKey = nk; buildNav(); }
    var inPart = STEPS.map(function (x, i) { return i; }).filter(function (i) { return subj !== 'earth' || partOf(i) === partOf(cur); });
    var pos = inPart.indexOf(cur), lastInPart = pos === inPart.length - 1;
    $('stepNo').textContent = subj === 'earth' ? 'PART ' + partOf(cur) + ' · ' + (pos + 1) + ' / ' + inPart.length : 'STEP ' + cur + ' / ' + (STEPS.length - 1);
    $('stepDare').hidden = true;
    $('stepTitle').textContent = step.title;
    var av = $('sayAv');
    av.className = 'av ' + ln.who;
    av.innerHTML = CH[ln.who].ic(moodOf(ln.who, st.s));
    $('sayName').textContent = CH[ln.who].nm;
    $('sayCnt').textContent = step.lines.length > 1 ? (li + 1) + ' / ' + step.lines.length : '';
    $('speech').className = 'speech ' + ln.who;
    $('sayText').textContent = ln.t;

    note.innerHTML = '';
    var got = ln.ask ? answers[step.id + '-' + li] : null;
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
    next.textContent = next.disabled ? '먼저 예측해 보세요' : lastStep && lastLine ? S.END[subj].label
      : lastLine && subj === 'earth' && lastInPart ? '다음: ' + S.PARTS[partOf(cur + 1)] + ' ▶' : lastLine ? '다음 단계 ▶' : '다음 대화 ▶';
    Array.prototype.forEach.call(dots.children, function (b) {
      var i = +b.getAttribute('data-i');
      b.className = i < cur ? 'done' : i === cur ? 'cur' : '';
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
    else { var e = S.END[subj]; location.href = (LAB ? LAB.url(e.learn, subj) : '../observatory/') + e.hash; }
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
    answers[STEPS[cur].id + '-' + li] = b.getAttribute('data-o');
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

  // 과목을 바꾸면 그 과목의 대본으로: 같은 단계가 있으면 그 자리, 없으면 앞쪽에서 가장 가까운 단계로 (예측 답은 그대로)
  if (LAB) LAB.onChange(function () {
    var id = STEPS[cur].id, line = li;
    subj = subjectNow(); STEPS = S.stepsFor(subj); navKey = '';
    var ids = STEPS.map(function (x) { return x.id; }), at = ids.indexOf(id);
    if (at < 0) {
      line = 0;
      for (var k = S.ORDER.indexOf(id); k >= 0 && at < 0; k--) at = ids.indexOf(S.ORDER[k]);
      if (at < 0) at = 0;
    }
    baseKey = ''; castKey = '';
    go(at, line);
  });

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
