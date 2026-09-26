/* ③ 남방진동: 워커 순환 지도 + 다윈·타히티 기압 시소 + 모식 시계열 */
(function () {
  'use strict';
  var E = window.ENSO, D = window.ENSODraw;
  var clamp = E.clamp;
  var SVGNS = 'http://www.w3.org/2000/svg';

  var LON0 = 100, LON1 = 295, LAT0 = -40, LAT1 = 34;
  var DARWIN = { lon: 130.8, lat: -12.5, name: '다윈' };
  var TAHITI = { lon: 210.4, lat: -17.6, name: '타히티' };

  var M = {};
  var stage, cv, ctx, badge;
  var W = 0, H = 0, dpr = 1, proj = null;
  var flat = null, flatS = null, flatTheme = -1;
  var s = 0, target = null, playing = false, tYears = 0;
  var time = 0, dirty = true, visible = false, themeTick = 0;
  var motion = true;
  var seesaw = {}, chart = {};

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) {
      var v = attrs[k];
      if (typeof v === 'string' && v.indexOf('var(') === 0) n.style.setProperty(k, v);
      else n.setAttribute(k, v);
    }
    if (parent) parent.appendChild(n);
    return n;
  }

  M.init = function (cfg) {
    stage = $('so-map').parentNode; cv = $('so-map'); ctx = cv.getContext('2d'); badge = $('so-badge');
    motion = !cfg.reducedMotion;
    $('so-motion').checked = motion;
    $('so-motion').addEventListener('change', function (e) { motion = e.target.checked; dirty = true; });

    ['so-normal', 'so-nino', 'so-nina'].forEach(function (id) {
      $(id).addEventListener('click', function () {
        setPlaying(false);
        target = parseFloat($(id).getAttribute('data-s'));
        if (!motion) { s = target; target = null; }
        pressButtons(id);
        update();
      });
    });
    $('so-play').addEventListener('click', function () { setPlaying(!playing); });

    buildSeesaw();
    buildChart();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
    window.addEventListener('resize', resize);
    update();
  };

  function pressButtons(id) {
    ['so-normal', 'so-nino', 'so-nina'].forEach(function (b) { $(b).setAttribute('aria-pressed', b === id); });
  }
  function setPlaying(on) {
    playing = on;
    $('so-play').setAttribute('aria-pressed', on);
    $('so-play').querySelector('span').textContent = on ? '일시 정지' : '시간 흐름 재생';
    if (on) { target = null; pressButtons(null); }
    dirty = true;
  }

  /* ── 지도 투영 (남쪽 위에서 비스듬히 내려다본 모습) ── */
  function makeProj(w, h) {
    var r = 0.62;
    var nearY = h - 24, farY = h * (w < 600 ? 0.44 : 0.5);
    var H0 = (nearY - farY) / (1 - r), yh = nearY - H0;
    var cx = w / 2, half = w * 0.5;
    var P = {
      w: w, h: h, r: r, nearY: nearY, farY: farY, H0: H0, yh: yh, cx: cx, half: half,
      Z: function (lat) { var v = (lat - LAT0) / (LAT1 - LAT0); return 1 + v * (1 / r - 1); },
      p: function (lon, lat, alt) {
        var Z = P.Z(lat), X = (lon - (LON0 + LON1) / 2) / ((LON1 - LON0) / 2);
        return [cx + X * half / Z, yh + (H0 - (alt || 0)) / Z];
      }
    };
    var Zeq = P.Z(0), yEq = yh + H0 / Zeq;
    P.loopA = H0 - (h * 0.1 - yh) * Zeq; // 순환 고리 꼭대기가 화면 위쪽 10 % 에 오도록
    P.yEq = yEq;
    P.u = clamp(w / 900, 0.55, 1.2) / Math.sqrt(Zeq);
    return P;
  }

  function resize() {
    var w = Math.round(stage.clientWidth);
    if (!w) return;
    var h = Math.round(w < 600 ? w * 1.12 : clamp(w * 0.5, 340, 600));
    if (w === W && h === H) return;
    W = w; H = h;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.height = H + 'px';
    proj = makeProj(W, H);
    dirty = true;
  }

  /* ── 평면 지도(등장방형) 한 장을 만들어 원근으로 펼친다 ── */
  var PX = 4; // 1° 당 픽셀
  function buildFlat(sNow) {
    var t = D.theme();
    var mw = (LON1 - LON0) * PX, mh = (LAT1 - LAT0) * PX;
    if (!flat) { flat = document.createElement('canvas'); flat.width = mw; flat.height = mh; }
    var f = flat.getContext('2d');
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.fillStyle = t.mapOcean;
    f.fillRect(0, 0, mw, mh);

    // 적도 부근 표층 수온 띠
    var row = document.createElement('canvas');
    row.width = mw; row.height = 1;
    var rc = row.getContext('2d'), img = rc.createImageData(mw, 1), rgb = [0, 0, 0];
    for (var i = 0; i < mw; i++) {
      var lon = clamp(LON0 + (i + 0.5) / PX, E.LON_W, E.LON_E);
      D.lookup(D.TEMP, E.sst(lon, sNow), rgb);
      img.data[i * 4] = rgb[0]; img.data[i * 4 + 1] = rgb[1]; img.data[i * 4 + 2] = rgb[2]; img.data[i * 4 + 3] = 255;
    }
    rc.putImageData(img, 0, 0);
    var band = document.createElement('canvas');
    band.width = mw; band.height = mh;
    var bc = band.getContext('2d');
    bc.imageSmoothingEnabled = true;
    bc.drawImage(row, 0, 0, mw, 1, 0, 0, mw, mh);
    bc.globalCompositeOperation = 'destination-in';
    var g = bc.createLinearGradient(0, 0, 0, mh);
    for (var lat = LAT1; lat >= LAT0; lat -= 2) {
      g.addColorStop((LAT1 - lat) / (LAT1 - LAT0), 'rgba(0,0,0,' + (0.95 * Math.exp(-Math.pow(lat / 13, 2))).toFixed(3) + ')');
    }
    bc.fillStyle = g;
    bc.fillRect(0, 0, mw, mh);
    f.drawImage(band, 0, 0);

    // 경위선
    f.strokeStyle = t.mapGrid; f.lineWidth = 1;
    f.beginPath();
    [140, 180, 220, 260].forEach(function (lon) { var x = (lon - LON0) * PX; f.moveTo(x, 0); f.lineTo(x, mh); });
    [-20, 20].forEach(function (la) { var y = (LAT1 - la) * PX; f.moveTo(0, y); f.lineTo(mw, y); });
    f.stroke();

    // 육지 (Natural Earth 해안선)
    f.fillStyle = t.mapLand; f.strokeStyle = t.mapEdge; f.lineWidth = 1.2; f.lineJoin = 'round';
    f.beginPath();
    (window.ENSO_LAND || []).forEach(function (ring) {
      for (var k = 0; k < ring.length; k += 2) {
        var x = (ring[k] - LON0) * PX, y = (LAT1 - ring[k + 1]) * PX;
        if (k) f.lineTo(x, y); else f.moveTo(x, y);
      }
      f.closePath();
    });
    f.fill(); f.stroke();

    // 적도
    f.strokeStyle = t.dark ? 'rgba(255,255,255,0.7)' : 'rgba(15,29,38,0.55)';
    f.setLineDash([10, 7]); f.lineWidth = 2;
    f.beginPath(); f.moveTo(0, LAT1 * PX); f.lineTo(mw, LAT1 * PX); f.stroke();
    f.setLineDash([]);
    flatS = sNow; flatTheme = themeTick;
  }

  function drawMap() {
    var P = proj, mh = flat.height, mw = flat.width;
    ctx.save();
    var c0 = P.p(LON0, LAT1), c1 = P.p(LON1, LAT1), c2 = P.p(LON1, LAT0), c3 = P.p(LON0, LAT0);
    ctx.beginPath();
    ctx.moveTo(c0[0], c0[1]); ctx.lineTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(c3[0], c3[1]);
    ctx.closePath();
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    var rows = 150;
    for (var j = 0; j < rows; j++) {
      var la0 = LAT1 - (LAT1 - LAT0) * j / rows, la1 = LAT1 - (LAT1 - LAT0) * (j + 1) / rows;
      var a = P.p(LON0, la0), b = P.p(LON1, la0), c = P.p(LON0, la1), d = P.p(LON1, la1);
      var sy = (LAT1 - la0) * PX, sh = (la0 - la1) * PX;
      var xl = Math.min(a[0], c[0]), xr = Math.max(b[0], d[0]);
      ctx.drawImage(flat, 0, sy, mw, Math.min(sh, mh - sy), xl, a[1], xr - xl, c[1] - a[1] + 0.8);
    }
    ctx.restore();
    // 가장자리 (두께감)
    ctx.save();
    var t = D.theme();
    var n0 = P.p(LON0, LAT0), n1 = P.p(LON1, LAT0);
    ctx.fillStyle = t.dark ? '#0b2536' : '#6f9fbd';
    ctx.fillRect(n0[0], n0[1], n1[0] - n0[0], 7);
    ctx.restore();
  }

  function drawSky() {
    var t = D.theme();
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, t.skyTop); g.addColorStop(1, t.skyBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function lonLabel() {
    var t = D.theme(), fs = clamp(10 * proj.u + 3, 10, 12.5);
    [[140, '140°E'], [180, '180°'], [220, '140°W'], [260, '100°W']].forEach(function (q) {
      var p = proj.p(q[0], LAT0);
      D.text(ctx, q[1], p[0], p[1] + 16, { size: fs, weight: 500, color: t.muted, halo: false });
    });
  }

  function pin(pt, anom, fs) {
    var t = D.theme();
    var p = proj.p(pt.lon, pt.lat);
    ctx.save();
    ctx.fillStyle = t.ink; ctx.strokeStyle = t.surface; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    // 기압 편차 표시
    var gy = p[1] - fs * 2.6, r = fs * 1.05;
    ctx.save();
    ctx.strokeStyle = t.ink; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(p[0], p[1] - 5); ctx.lineTo(p[0], gy + r); ctx.stroke();
    ctx.beginPath(); ctx.arc(p[0], gy, r, 0, Math.PI * 2);
    var hi = anom > 0.12, lo = anom < -0.12;
    ctx.fillStyle = hi ? t.ink : t.surface;
    ctx.fill(); ctx.lineWidth = 1.8; ctx.stroke();
    ctx.fillStyle = hi ? t.surface : t.ink;
    ctx.font = D.font(fs * 0.95, 700);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(hi ? '▲' : lo ? '▼' : '–', p[0], gy + 1);
    ctx.restore();
    D.text(ctx, pt.name, p[0] + fs * 0.9, p[1] + 2, { size: fs, weight: 800, align: 'left', color: t.ink });
  }

  function drawScene() {
    var t = D.theme();
    if (flatS == null || Math.abs(flatS - s) > 0.008 || flatTheme !== themeTick) buildFlat(s);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawSky();
    drawMap();
    lonLabel();
    var fs = clamp(12 * proj.u + 3, 11, 15);

    // 대륙 이름 (적도 뒤쪽)
    var asia = proj.p(106, 29);
    D.text(ctx, '아시아', asia[0], asia[1], { size: fs - 1, weight: 700, color: t.ink2 });

    // 워커 순환 (적도를 따라 세운 연직면)
    var P = proj;
    D.drawWalker(ctx, function (lon, a) { return P.p(lon, 0, a * P.loopA); }, s, time, { u: P.u * 1.25, motion: motion });

    // 적도 앞쪽(남반구) 요소
    var au = proj.p(134, -25);
    D.text(ctx, '오스트레일리아', au[0], au[1], { size: fs - 1, weight: 700, color: t.ink2 });
    var sa = proj.p(290, -22);
    D.text(ctx, '남아메리카', Math.min(sa[0], W - fs * 3), sa[1], { size: fs - 1, weight: 700, color: t.ink2 });
    var eq = proj.p(LON0 + 1, 2.2);
    D.text(ctx, '적도', eq[0] + 4, eq[1] - fs * 0.2, { size: fs - 1, weight: 700, color: t.ink2, align: 'left' });

    // 평상시 대비 수온 변화 딱지
    if (Math.abs(s) > 0.2) {
      var narrow = W < 640;
      [[narrow ? 168 : 152, E.sstAnom(152, s)], [248, E.sstAnom(248, s)]].forEach(function (q) {
        var p = proj.p(q[0], -5.5);
        var warm = q[1] > 0;
        var txt = narrow ? (warm ? '수온 ▲' : '수온 ▼') : (warm ? '평상시보다 따뜻' : '평상시보다 차가움');
        D.pill(ctx, txt, p[0], p[1], {
          size: fs - 2.5, bg: warm ? t.nino : t.nina, fg: '#fff'
        });
      });
    }

    var pr = E.pressure(s);
    pin(DARWIN, pr.darwin, fs);
    pin(TAHITI, pr.tahiti, fs);
  }

  /* ── 기압 시소 ─────────────────────── */
  function buildSeesaw() {
    var svg = $('so-seesaw');
    el('line', { x1: 20, y1: 204, x2: 380, y2: 204, stroke: 'var(--line)', 'stroke-width': 2 }, svg);
    el('path', { d: 'M200 150 L178 204 L222 204 Z', fill: 'var(--ink-2)' }, svg);
    seesaw.beam = el('g', {}, svg);
    el('rect', { x: 44, y: 144, width: 312, height: 12, rx: 6, fill: 'var(--surface-2)', stroke: 'var(--ink-2)', 'stroke-width': 2 }, seesaw.beam);
    el('circle', { cx: 200, cy: 150, r: 5, fill: 'var(--ink)' }, svg);
    seesaw.ends = [makeGauge(svg, '다윈', '서태평양 쪽'), makeGauge(svg, '타히티', '동태평양 쪽')];
  }
  function makeGauge(svg, name, region) {
    var g = el('g', {}, svg);
    el('line', { x1: 0, y1: 0, x2: 0, y2: -14, stroke: 'var(--ink-2)', 'stroke-width': 2 }, g);
    el('circle', { cx: 0, cy: -44, r: 30, fill: 'var(--surface)', stroke: 'var(--ink)', 'stroke-width': 2.2 }, g);
    // 눈금: 왼쪽 낮음, 오른쪽 높음
    for (var i = -3; i <= 3; i++) {
      var a = (i * 20 - 90) * Math.PI / 180;
      el('line', { x1: Math.cos(a) * 22, y1: -44 + Math.sin(a) * 22, x2: Math.cos(a) * 27, y2: -44 + Math.sin(a) * 27, stroke: 'var(--muted)', 'stroke-width': i === 0 ? 2.2 : 1.2 }, g);
    }
    var lo = el('text', { x: -16, y: -30, 'font-size': 10, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-weight': 600 }, g); lo.textContent = '저';
    var hi = el('text', { x: 16, y: -30, 'font-size': 10, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-weight': 600 }, g); hi.textContent = '고';
    var needle = el('line', { x1: 0, y1: -44, x2: 0, y2: -68, stroke: 'var(--ink)', 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
    el('circle', { cx: 0, cy: -44, r: 3.5, fill: 'var(--ink)' }, g);
    var tag = el('text', { x: 0, y: -84, 'font-size': 14, 'text-anchor': 'middle', 'font-weight': 700, fill: 'var(--ink)' }, g);
    var label = el('text', { x: 0, y: 28, 'font-size': 15, 'text-anchor': 'middle', 'font-weight': 800, fill: 'var(--ink)' }, g);
    label.textContent = name;
    var sub = el('text', { x: 0, y: 44, 'font-size': 11.5, 'text-anchor': 'middle', 'font-weight': 500, fill: 'var(--muted)' }, g);
    sub.textContent = region;
    return { g: g, needle: needle, tag: tag };
  }
  function updateSeesaw() {
    var pr = E.pressure(s);
    var ang = clamp((pr.darwin - pr.tahiti) * 6, -16, 16);
    seesaw.beam.setAttribute('transform', 'rotate(' + ang.toFixed(2) + ' 200 150)');
    var rad = ang * Math.PI / 180;
    [[-148, pr.darwin], [148, pr.tahiti]].forEach(function (q, i) {
      var x = 200 + q[0] * Math.cos(rad) - (-6) * Math.sin(rad);
      var y = 150 + q[0] * Math.sin(rad) + (-6) * Math.cos(rad);
      var e = seesaw.ends[i];
      e.g.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')');
      e.needle.setAttribute('transform', 'rotate(' + clamp(q[1] * 38, -60, 60).toFixed(1) + ' 0 -44)');
      var v = q[1];
      e.tag.textContent = v > 0.12 ? '기압 ▲' : v < -0.12 ? '기압 ▼' : '평상시';
      e.tag.setAttribute('fill', v > 0.12 || v < -0.12 ? 'var(--ink)' : 'var(--muted)');
    });
    var soi = E.soi(s);
    $('soi-needle').style.left = (50 + clamp(soi / 2.4, -1, 1) * 44) + '%';
  }

  /* ── 모식 시계열 그래프 ──────────────── */
  var CH = { x0: 52, x1: 626, top: [26, 128], bot: [168, 270] };
  function cx(t) { return CH.x0 + t / E.SERIES_YEARS * (CH.x1 - CH.x0); }
  function cyTop(v) { return CH.top[0] + (3 - v) / 5 * (CH.top[1] - CH.top[0]); }  // −2 … +3 °C
  function cyBot(v) { return CH.bot[0] + (3 - v) / 6 * (CH.bot[1] - CH.bot[0]); }  // −3 … +3
  function buildChart() {
    var svg = $('so-chart');
    var N = E.SERIES_YEARS * 12, i, t, ph, start = 0, prev = null;
    var nino = [], soi = [];
    for (i = 0; i <= N; i++) {
      t = i / 12;
      var st = E.seriesState(t);
      nino.push([t, E.nino34(st)]);
      soi.push([t, E.seriesSoi(t)]);
    }
    // 엘니뇨·라니냐 시기 음영
    var shade = el('g', {}, svg);
    var lastLabelX = -99;
    for (i = 0; i <= N + 1; i++) {
      ph = i <= N ? (nino[i][1] >= 0.5 ? 'nino' : nino[i][1] <= -0.5 ? 'nina' : null) : null;
      if (ph !== prev) {
        if (prev) {
          el('rect', { x: cx(start / 12), y: CH.top[0] - 4, width: cx(i / 12) - cx(start / 12), height: CH.bot[1] - CH.top[0] + 8, fill: prev === 'nino' ? 'var(--nino-soft)' : 'var(--nina-soft)' }, shade);
          var mid = (cx(start / 12) + cx(i / 12)) / 2;
          if (mid - lastLabelX > 46) {
            var lab = el('text', { x: mid, y: CH.top[0] - 8, 'font-size': 11, 'font-weight': 700, 'text-anchor': 'middle', fill: prev === 'nino' ? 'var(--nino)' : 'var(--nina)' }, shade);
            lab.textContent = prev === 'nino' ? '엘니뇨' : '라니냐';
            lastLabelX = mid;
          }
        }
        prev = ph; start = i;
      }
    }
    // 축
    var ax = el('g', { 'font-size': 11, fill: 'var(--muted)', 'font-family': 'var(--font-mono)' }, svg);
    [[-2, cyTop], [0, cyTop], [2, cyTop], [-2, cyBot], [0, cyBot], [2, cyBot]].forEach(function (q) {
      var y = q[1](q[0]);
      el('line', { x1: CH.x0, x2: CH.x1, y1: y, y2: y, stroke: q[0] === 0 ? 'var(--muted)' : 'var(--line)', 'stroke-width': 1 }, svg);
      var tx = el('text', { x: CH.x0 - 6, y: y + 4, 'text-anchor': 'end' }, ax);
      tx.textContent = (q[0] > 0 ? '+' : q[0] < 0 ? '−' : '') + Math.abs(q[0]);
    });
    [0.5, -0.5].forEach(function (v) {
      el('line', { x1: CH.x0, x2: CH.x1, y1: cyTop(v), y2: cyTop(v), stroke: 'var(--muted)', 'stroke-dasharray': '3 4', 'stroke-width': 1 }, svg);
    });
    for (t = 0; t <= E.SERIES_YEARS; t += 4) {
      var xt = el('text', { x: cx(t), y: CH.bot[1] + 18, 'text-anchor': 'middle' }, ax);
      xt.textContent = t + (t === E.SERIES_YEARS ? '년' : '');
    }
    var h1 = el('text', { x: CH.x0, y: CH.top[0] + 12, 'font-size': 12, 'font-weight': 700, fill: 'var(--ink)', 'font-family': 'var(--font)', dx: 6 }, svg);
    h1.textContent = '동태평양 수온 편차 (°C)';
    var h2 = el('text', { x: CH.x0, y: CH.bot[0] + 12, 'font-size': 12, 'font-weight': 700, fill: 'var(--ink)', 'font-family': 'var(--font)', dx: 6 }, svg);
    h2.textContent = '남방진동 지수';

    // 영역 채우기: 엘니뇨 쪽은 붉게, 라니냐 쪽은 푸르게
    function area(data, fy, zeroY, above, color, id) {
      var clip = el('clipPath', { id: id }, svg);
      el('rect', { x: CH.x0, width: CH.x1 - CH.x0, y: above ? 0 : zeroY, height: above ? zeroY : 400 }, clip);
      var d = 'M' + cx(data[0][0]).toFixed(1) + ' ' + zeroY;
      data.forEach(function (p) { d += ' L' + cx(p[0]).toFixed(1) + ' ' + fy(p[1]).toFixed(1); });
      d += ' L' + cx(data[data.length - 1][0]).toFixed(1) + ' ' + zeroY + ' Z';
      el('path', { d: d, fill: color, 'clip-path': 'url(#' + id + ')', opacity: 0.85 }, svg);
    }
    area(nino, cyTop, cyTop(0), true, 'var(--nino)', 'clipNinoUp');
    area(nino, cyTop, cyTop(0), false, 'var(--nina)', 'clipNinoDn');
    area(soi, cyBot, cyBot(0), true, 'var(--nina)', 'clipSoiUp');
    area(soi, cyBot, cyBot(0), false, 'var(--nino)', 'clipSoiDn');
    function line(data, fy) {
      var d = '';
      data.forEach(function (p, k) { d += (k ? ' L' : 'M') + cx(p[0]).toFixed(1) + ' ' + fy(p[1]).toFixed(1); });
      el('path', { d: d, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.2, opacity: 0.7 }, svg);
    }
    line(nino, cyTop); line(soi, cyBot);

    // 재생 위치
    chart.head = el('g', {}, svg);
    el('line', { x1: 0, x2: 0, y1: CH.top[0] - 2, y2: CH.bot[1] + 2, stroke: 'var(--ink)', 'stroke-width': 2 }, chart.head);
    chart.dotTop = el('circle', { cx: 0, cy: 0, r: 5, fill: 'var(--surface)', stroke: 'var(--ink)', 'stroke-width': 2 }, chart.head);
    chart.dotBot = el('circle', { cx: 0, cy: 0, r: 5, fill: 'var(--surface)', stroke: 'var(--ink)', 'stroke-width': 2 }, chart.head);
    chart.label = el('text', { x: 0, y: CH.bot[1] + 36, 'font-size': 11.5, 'font-weight': 700, 'text-anchor': 'middle', fill: 'var(--ink)' }, chart.head);
    chart.data = { nino: nino, soi: soi };

    var dragging = false;
    function seek(e) {
      var r = svg.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width * 640;
      tYears = clamp((x - CH.x0) / (CH.x1 - CH.x0) * E.SERIES_YEARS, 0, E.SERIES_YEARS);
      target = null;
      s = E.seriesState(tYears);
      pressButtons(null);
      update();
    }
    svg.addEventListener('pointerdown', function (e) { dragging = true; setPlaying(false); seek(e); if (svg.setPointerCapture) svg.setPointerCapture(e.pointerId); });
    svg.addEventListener('pointermove', function (e) { if (dragging) seek(e); });
    svg.addEventListener('pointerup', function () { dragging = false; });
    svg.addEventListener('pointercancel', function () { dragging = false; });
    updateHead();
  }
  function updateHead() {
    var i = clamp(Math.round(tYears * 12), 0, chart.data.nino.length - 1);
    var x = cx(tYears);
    chart.head.setAttribute('transform', 'translate(' + x.toFixed(1) + ' 0)');
    chart.dotTop.setAttribute('cy', cyTop(chart.data.nino[i][1]).toFixed(1));
    chart.dotBot.setAttribute('cy', cyBot(chart.data.soi[i][1]).toFixed(1));
    var yr = Math.floor(tYears), mo = Math.floor((tYears - yr) * 12) + 1;
    if (yr >= E.SERIES_YEARS) { yr = E.SERIES_YEARS; mo = 0; }
    chart.label.textContent = mo ? (yr + '년 ' + mo + '월') : (yr + '년');
    chart.label.setAttribute('x', x < 90 ? 30 : x > 590 ? -30 : 0);
  }

  function update() {
    var ph = E.phase(s);
    badge.setAttribute('data-phase', ph);
    badge.textContent = ph === 'nino' ? '엘니뇨' : ph === 'nina' ? '라니냐' : '평상시';
    updateSeesaw();
    chart.head.style.opacity = playing || target == null && !isPreset() ? 1 : 0.35;
    var pr = E.pressure(s);
    cv.setAttribute('aria-label', '열대 태평양 워커 순환. 현재 ' + badge.textContent + '. 다윈 기압 ' +
      (pr.darwin > 0.12 ? '평상시보다 높음' : pr.darwin < -0.12 ? '평상시보다 낮음' : '평상시') + ', 타히티 기압 ' +
      (pr.tahiti > 0.12 ? '평상시보다 높음' : pr.tahiti < -0.12 ? '평상시보다 낮음' : '평상시') + '.');
    dirty = true;
  }
  function isPreset() {
    return ['so-normal', 'so-nino', 'so-nina'].some(function (id) { return $(id).getAttribute('aria-pressed') === 'true'; });
  }

  M.frame = function (dt) {
    if (!visible || !proj) return;
    if (playing) {
      tYears += dt * 0.7;
      if (tYears > E.SERIES_YEARS) tYears = 0;
      s = E.seriesState(tYears);
      updateHead();
      update();
    } else if (target != null) {
      var d = target - s;
      if (Math.abs(d) < 0.004) { s = target; target = null; } else s += d * Math.min(1, dt * 3.2);
      update();
    }
    if (!motion && !dirty) return;
    if (motion) time += dt;
    drawScene();
    dirty = false;
  };
  M.show = function () { visible = true; dirty = true; resize(); };
  M.hide = function () { visible = false; setPlaying(false); };
  M.redraw = function () { themeTick++; dirty = true; };

  window.TabSO = M;
})();
