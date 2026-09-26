/* 공통 그리기 도구: 색 지도, 적도 단면(해양), 워커 순환(대기), 아이콘 */
(function () {
  'use strict';
  var E = window.ENSO;
  var clamp = E.clamp;
  var D = {};

  /* ── 색 지도 ───────────────────────────── */
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function makeMap(stops, n) {
    var lo = stops[0][0], hi = stops[stops.length - 1][0];
    var lut = new Uint8ClampedArray(n * 3);
    for (var i = 0; i < n; i++) {
      var v = lo + (hi - lo) * i / (n - 1), k = 1;
      while (k < stops.length - 1 && v > stops[k][0]) k++;
      var a = stops[k - 1], b = stops[k];
      var t = clamp((v - a[0]) / (b[0] - a[0]), 0, 1);
      var ca = hex(a[1]), cb = hex(b[1]);
      for (var c = 0; c < 3; c++) lut[i * 3 + c] = ca[c] + (cb[c] - ca[c]) * t;
    }
    return { lo: lo, hi: hi, n: n, lut: lut, stops: stops };
  }
  // 수온(°C)
  D.TEMP = makeMap([
    [4, '#1b2a6b'], [8, '#23519b'], [12, '#2c7fb8'], [16, '#41b6c4'], [20, '#a1dab4'],
    [23, '#f1f5ac'], [25, '#fed976'], [27, '#fd8d3c'], [29, '#e31a1c'], [31, '#8f0015']
  ], 512);
  // 평상시와의 수온 차(°C)
  D.ANOM = makeMap([
    [-6, '#16427f'], [-3, '#3f86cc'], [-1, '#b9d5ee'], [0, '#f3f3f0'],
    [1, '#f5c2b2'], [3, '#dd6146'], [6, '#8e1515']
  ], 512);
  function lookup(m, v, out) {
    var i = Math.round((v - m.lo) / (m.hi - m.lo) * (m.n - 1));
    i = i < 0 ? 0 : i >= m.n ? m.n - 1 : i;
    out[0] = m.lut[i * 3]; out[1] = m.lut[i * 3 + 1]; out[2] = m.lut[i * 3 + 2];
    return out;
  }
  D.lookup = lookup;
  D.colorCss = function (m, v) { var a = lookup(m, v, [0, 0, 0]); return 'rgb(' + a[0] + ',' + a[1] + ',' + a[2] + ')'; };
  D.gradientCss = function (m) {
    return 'linear-gradient(90deg,' + m.stops.map(function (s) {
      return s[1] + ' ' + ((s[0] - m.lo) / (m.hi - m.lo) * 100).toFixed(1) + '%';
    }).join(',') + ')';
  };

  /* ── 테마 ─────────────────────────────── */
  var theme = null;
  D.theme = function () {
    if (theme) return theme;
    var cs = getComputedStyle(document.documentElement);
    function v(n) { return cs.getPropertyValue(n).trim(); }
    theme = {
      ink: v('--ink'), ink2: v('--ink-2'), muted: v('--muted'), surface: v('--surface'),
      skyTop: v('--sky-top'), skyBot: v('--sky-bot'),
      veg: v('--land-veg'), dry: v('--land-dry'), rock: v('--land-rock'), crust: v('--crust'), snow: v('--snow'),
      windFill: v('--wind-fill'), windEdge: v('--wind-edge'), streak: v('--streak'),
      walker: v('--walker'), walkerEdge: v('--walker-edge'), surfWind: v('--surface-wind'),
      cloud: v('--cloud'), cloudShade: v('--cloud-shade'), rain: v('--rain'), sun: v('--sun'),
      mapOcean: v('--map-ocean'), mapLand: v('--map-land'), mapEdge: v('--map-edge'), mapGrid: v('--map-grid'),
      nino: v('--nino'), nina: v('--nina'), normal: v('--normal'), accent: v('--accent'),
      halo: v('--canvas-halo'), dark: v('--is-dark') === '1'
    };
    return theme;
  };
  D.invalidateTheme = function () { theme = null; fieldCache.clear(); };

  var FONT_STACK = '"IBM Plex Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
  D.font = function (size, weight) { return (weight || 500) + ' ' + size.toFixed(1) + 'px ' + FONT_STACK; };

  // 테두리(halo)가 있는 글자
  D.text = function (ctx, str, x, y, o) {
    o = o || {};
    var t = D.theme();
    ctx.save();
    ctx.font = D.font(o.size || 12, o.weight || 600);
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.baseline || 'middle';
    if (o.halo !== false) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = o.haloWidth || 3.2;
      ctx.strokeStyle = o.haloColor || t.halo;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = o.color || t.ink;
    ctx.fillText(str, x, y);
    ctx.restore();
  };
  // 둥근 딱지
  D.pill = function (ctx, str, x, y, o) {
    o = o || {};
    ctx.save();
    var size = o.size || 11;
    ctx.font = D.font(size, o.weight || 700);
    var w = ctx.measureText(str).width + size * 1.1, h = size * 1.75;
    var x0 = o.align === 'left' ? x : o.align === 'right' ? x - w : x - w / 2;
    ctx.beginPath();
    roundRect(ctx, x0, y - h / 2, w, h, h / 2);
    ctx.fillStyle = o.bg; ctx.fill();
    if (o.border) { ctx.lineWidth = 1; ctx.strokeStyle = o.border; ctx.stroke(); }
    ctx.fillStyle = o.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(str, x0 + w / 2, y + 0.5);
    ctx.restore();
    return w;
  };
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  D.roundRect = roundRect;

  // 속이 찬 굵은 화살표 (x0 → x1, 수평)
  D.blockArrow = function (ctx, x0, x1, y, thick, fill, edge) {
    var dir = x1 > x0 ? 1 : -1, len = Math.abs(x1 - x0);
    var head = Math.min(len * 0.45, thick * 1.5);
    var hw = thick * 1.05;
    ctx.beginPath();
    ctx.moveTo(x0, y - thick / 2);
    ctx.lineTo(x1 - dir * head, y - thick / 2);
    ctx.lineTo(x1 - dir * head, y - hw);
    ctx.lineTo(x1, y);
    ctx.lineTo(x1 - dir * head, y + hw);
    ctx.lineTo(x1 - dir * head, y + thick / 2);
    ctx.lineTo(x0, y + thick / 2);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (edge) { ctx.lineWidth = 1.2; ctx.strokeStyle = edge; ctx.stroke(); }
  };

  // 위쪽을 가리키는 굵은 화살표 (y0 → y1, y1 < y0)
  D.upArrow = function (ctx, x, y0, y1, thick, fill, edge) {
    ctx.save();
    ctx.translate(x, y0);
    ctx.rotate(-Math.PI / 2);
    D.blockArrow(ctx, 0, y0 - y1, 0, thick, fill, edge);
    ctx.restore();
  };

  // 선 끝 화살촉
  function arrowHead(ctx, x, y, ang, size, fill) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, size * 0.72);
    ctx.lineTo(-size * 0.35, 0);
    ctx.lineTo(-size * 0.7, -size * 0.72);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.restore();
  }
  D.arrowHead = arrowHead;

  /* ── 구름·비·해 ───────────────────────── */
  D.cloud = function (ctx, x, y, r, alpha) {
    var t = D.theme();
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    var puffs = [[-0.95, 0.2, 0.55], [-0.45, -0.18, 0.72], [0.15, -0.38, 0.85], [0.7, -0.08, 0.66], [1.05, 0.25, 0.5], [0.1, 0.25, 0.7], [-0.5, 0.3, 0.55]];
    var g = ctx.createLinearGradient(0, y - r, 0, y + r * 0.8);
    g.addColorStop(0, t.cloud); g.addColorStop(1, t.cloudShade);
    ctx.fillStyle = g;
    ctx.beginPath();
    puffs.forEach(function (p) { ctx.moveTo(x + p[0] * r + p[2] * r, y + p[1] * r); ctx.arc(x + p[0] * r, y + p[1] * r, p[2] * r, 0, Math.PI * 2); });
    ctx.fill();
    ctx.restore();
  };
  D.rain = function (ctx, x, yTop, yBot, width, n, time, alpha) {
    var t = D.theme();
    ctx.save();
    ctx.strokeStyle = t.rain;
    ctx.globalAlpha = alpha == null ? 0.8 : alpha;
    ctx.lineWidth = 1.3;
    ctx.setLineDash([6, 7]);
    ctx.lineDashOffset = -time * 60;
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var f = n === 1 ? 0.5 : i / (n - 1);
      var xx = x - width / 2 + f * width;
      var y0 = yTop + ((i * 37) % 11);
      ctx.moveTo(xx, y0);
      ctx.lineTo(xx - (yBot - y0) * 0.12, yBot);
    }
    ctx.stroke();
    ctx.restore();
  };
  D.sun = function (ctx, x, y, r) {
    var t = D.theme();
    ctx.save();
    ctx.strokeStyle = t.sun; ctx.fillStyle = t.sun; ctx.lineWidth = Math.max(1.2, r * 0.18); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      ctx.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
      ctx.lineTo(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15);
    }
    ctx.stroke();
    ctx.restore();
  };
  D.fish = function (ctx, x, y, len, dir, color) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(dir, 1);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, len * 0.42, len * 0.2, 0, 0, Math.PI * 2);
    ctx.moveTo(len * 0.32, 0);
    ctx.lineTo(len * 0.58, -len * 0.2);
    ctx.lineTo(len * 0.58, len * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  /* ── 적도 단면 배치 ───────────────────── */
  // 서쪽(왼쪽) 130°E 뉴기니 ~ 동쪽(오른쪽) 80°W 남아메리카, 깊이 0~300 m
  D.sectionLayout = function (w, h, o) {
    var padL = o.axis ? clamp(w * 0.045, 30, 44) : 4;
    var padR = 4, padT = 2, padB = o.axis ? 22 : 4;
    var inner = w - padL - padR;
    var landW = Math.max(20, inner * (o.landW || 0.06));
    var landE = Math.max(24, inner * (o.landE || 0.075));
    var ox0 = padL + landW, ox1 = w - padR - landE;
    var ySL = padT + (h - padT - padB) * o.sky;
    var yBot = h - padB;
    var L = {
      w: w, h: h, padL: padL, padR: padR, padT: padT, padB: padB,
      ox0: ox0, ox1: ox1, ySL: ySL, yBot: yBot, zMax: o.zMax || 300,
      landW: landW, landE: landE, compact: !!o.compact
    };
    L.u = clamp(w / 900, 0.5, 1.2);
    L.kEta = Math.max(0.28, (yBot - ySL) * 0.0016); // 해수면 과장 (px/cm)
    L.lonToX = function (lon) { return ox0 + (lon - E.LON_W) / (E.LON_E - E.LON_W) * (ox1 - ox0); };
    L.xToLon = function (x) { return E.LON_W + (x - ox0) / (ox1 - ox0) * (E.LON_E - E.LON_W); };
    L.zToY = function (z) { return ySL + z / L.zMax * (yBot - ySL); };
    L.surfY = function (lon, s) { return ySL - E.seaLevel(clamp(lon, E.LON_W, E.LON_E), s) * L.kEta; };
    L.key = [w, h, o.sky, o.zMax || 300, o.landW, o.landE, o.axis ? 1 : 0].join('|');
    return L;
  };

  /* ── 수온 단면 이미지 (캐시) ─────────── */
  var fieldCache = new Map();
  function field(L, s, mode) {
    var key = L.key + '|' + mode + '|' + s.toFixed(3);
    var hit = fieldCache.get(key);
    if (hit) return hit;
    var ext0 = L.ox0 - L.landW * 0.7, ext1 = L.ox1 + L.landE * 0.7;
    var yTop = L.ySL - 34 * L.kEta - 3;
    var fw = clamp(Math.round((ext1 - ext0) / 3), 90, 280);
    var fh = clamp(Math.round((L.yBot - yTop) / 3), 60, 170);
    var c = document.createElement('canvas');
    c.width = fw; c.height = fh;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(fw, fh), d = img.data, rgb = [0, 0, 0];
    var m = mode === 'anom' ? D.ANOM : D.TEMP;
    for (var i = 0; i < fw; i++) {
      var lon = clamp(L.xToLon(ext0 + (i + 0.5) / fw * (ext1 - ext0)), E.LON_W, E.LON_E);
      var col = E.column(lon, s), col0 = mode === 'anom' ? E.column(lon, 0) : null;
      for (var j = 0; j < fh; j++) {
        var y = yTop + (j + 0.5) / fh * (L.yBot - yTop);
        var z = Math.max(0, (y - L.ySL) / (L.yBot - L.ySL) * L.zMax);
        var v = E.tempAt(col, z);
        if (col0) v -= E.tempAt(col0, z);
        lookup(m, v, rgb);
        var o = (j * fw + i) * 4;
        d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    var f = { canvas: c, x: ext0, y: yTop, w: ext1 - ext0, h: L.yBot - yTop };
    if (fieldCache.size > 60) fieldCache.delete(fieldCache.keys().next().value);
    fieldCache.set(key, f);
    return f;
  }

  function surfacePath(ctx, L, s, x0, x1) {
    ctx.moveTo(x0, L.surfY(L.xToLon(x0), s));
    for (var x = x0; x < x1; x += 3) ctx.lineTo(x, L.surfY(L.xToLon(x), s));
    ctx.lineTo(x1, L.surfY(L.xToLon(x1), s));
  }

  /* ── 하늘 ─────────────────────────────── */
  D.drawSky = function (ctx, L, top) {
    var t = D.theme();
    var g = ctx.createLinearGradient(0, top || 0, 0, L.ySL);
    g.addColorStop(0, t.skyTop); g.addColorStop(1, t.skyBot);
    ctx.fillStyle = g;
    ctx.fillRect(L.padL, top || 0, L.w - L.padL - L.padR, L.ySL - (top || 0) + 2);
  };

  /* ── 바다 ─────────────────────────────── */
  D.drawOcean = function (ctx, L, s, mode) {
    var f = field(L, s, mode);
    ctx.save();
    ctx.beginPath();
    surfacePath(ctx, L, s, f.x, f.x + f.w);
    ctx.lineTo(f.x + f.w, L.yBot); ctx.lineTo(f.x, L.yBot); ctx.closePath();
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(f.canvas, f.x, f.y, f.w, f.h);
    ctx.restore();
    // 해수면 선
    ctx.save();
    ctx.beginPath();
    surfacePath(ctx, L, s, L.ox0 - 2, L.ox1 + 2);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
    ctx.restore();
  };

  // 등온선
  D.drawIsotherms = function (ctx, L, s, o) {
    var levels = [28, 24, 20, 16, 12];
    var step = 4;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = o.mode === 'anom' ? 'rgba(20,30,40,0.35)' : 'rgba(10,15,25,0.42)';
    var labelSize = clamp(10 * L.u + 2, 9, 12);
    levels.forEach(function (T) {
      ctx.beginPath();
      var pen = false, pts = [];
      for (var x = L.ox0 - L.landW * 0.7; x <= L.ox1 + L.landE * 0.7; x += step) {
        var lon = clamp(L.xToLon(x), E.LON_W, E.LON_E), z = E.depthOf(lon, T, s, L.zMax);
        if (z == null || z < 0.5) { pen = false; continue; }
        var y = L.zToY(z);
        if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        pen = true; pts.push([x, y, lon]);
      }
      ctx.stroke();
      if (o.labels && pts.length > 4) {
        // 이름표 위치: 날짜 변경선 동쪽 부근
        var want = T >= 24 ? 226 : 238, best = pts[0];
        pts.forEach(function (p) { if (Math.abs(p[2] - want) < Math.abs(best[2] - want)) best = p; });
        D.text(ctx, T + '°', best[0], best[1], { size: labelSize, weight: 600, color: '#101820', haloColor: 'rgba(255,255,255,0.75)', haloWidth: 2.6 });
      }
    });
    ctx.restore();
  };

  // 수온 약층 띠: 위 경계 = 혼합층 바닥(수온 약층이 시작되는 깊이), 아래 경계 = 15 °C
  D.drawThermocline = function (ctx, L, s, o) {
    var top = [], bot = [];
    for (var x = L.ox0 - L.landW * 0.7; x <= L.ox1 + L.landE * 0.7; x += 4) {
      var lon = clamp(L.xToLon(x), E.LON_W, E.LON_E), c = E.column(lon, s);
      top.push([x, L.zToY(c.M)]);
      bot.push([x, L.zToY(Math.min(L.zMax, c.D + 120 * Math.log(14 / 9)))]);
    }
    var line = o.mode === 'anom' ? 'rgba(16,24,32,0.8)' : 'rgba(255,255,255,0.95)';
    ctx.save();
    ctx.beginPath();
    top.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    for (var i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
    ctx.closePath();
    ctx.fillStyle = o.mode === 'anom' ? 'rgba(16,24,32,0.07)' : 'rgba(255,255,255,0.13)';
    ctx.fill();
    ctx.beginPath();
    bot.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = line; ctx.globalAlpha = 0.6; ctx.stroke();
    ctx.globalAlpha = 1; ctx.setLineDash([]);
    ctx.beginPath();
    top.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.lineWidth = 2.2 * Math.max(0.8, L.u); ctx.strokeStyle = line; ctx.stroke();
    ctx.restore();
    return { top: top, bot: bot };
  };

  // 평상시 비교선 (점선)
  D.drawGhost = function (ctx, L, s, o) {
    if (Math.abs(s) < 0.03) return;
    var t = D.theme();
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = o.mode === 'anom' ? 'rgba(16,24,32,0.75)' : 'rgba(16,24,32,0.7)';
    // 평상시 해수면
    ctx.beginPath();
    surfacePath(ctx, L, 0, L.ox0, L.ox1);
    ctx.strokeStyle = t.ink; ctx.globalAlpha = 0.7; ctx.stroke();
    // 평상시 수온 약층 시작 깊이
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = 'rgba(12,18,26,0.85)';
    ctx.beginPath();
    for (var x = L.ox0; x <= L.ox1 + 0.1; x += 4) {
      var y = L.zToY(E.mixedLayer(L.xToLon(x), 0));
      if (x === L.ox0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  };

  /* ── 육지 ─────────────────────────────── */
  D.drawLand = function (ctx, L, s, o) {
    var t = D.theme();
    var skyH = L.ySL - L.padT;
    var yW = L.surfY(E.LON_W, s), yE = L.surfY(E.LON_E, s);
    // 서쪽: 뉴기니·인도네시아 (열대 우림)
    var xl = L.padL, xc = L.ox0;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xl, L.yBot);
    ctx.lineTo(xl, yW - skyH * 0.16);
    ctx.bezierCurveTo(xl + (xc - xl) * 0.3, yW - skyH * 0.26, xl + (xc - xl) * 0.55, yW - skyH * 0.2, xc - (xc - xl) * 0.15, yW - skyH * 0.08);
    ctx.lineTo(xc + 2, yW);
    ctx.lineTo(xc - (xc - xl) * 0.2, L.zToY(40));
    ctx.lineTo(xc - (xc - xl) * 0.62, L.yBot);
    ctx.closePath();
    ctx.fillStyle = t.crust; ctx.fill();
    // 땅 위
    ctx.beginPath();
    ctx.moveTo(xl, yW + 1);
    ctx.lineTo(xl, yW - skyH * 0.16);
    ctx.bezierCurveTo(xl + (xc - xl) * 0.3, yW - skyH * 0.26, xl + (xc - xl) * 0.55, yW - skyH * 0.2, xc - (xc - xl) * 0.15, yW - skyH * 0.08);
    ctx.lineTo(xc + 2, yW);
    ctx.closePath();
    ctx.fillStyle = t.veg; ctx.fill();
    ctx.restore();

    // 동쪽: 남아메리카 (해안 사막 + 안데스산맥)
    var xr = L.w - L.padR, xe = L.ox1;
    var span = xr - xe;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xr, L.yBot);
    ctx.lineTo(xe + span * 0.62, L.yBot);
    ctx.lineTo(xe + span * 0.2, L.zToY(40));
    ctx.lineTo(xe - 2, yE);
    ctx.lineTo(xr, yE);
    ctx.closePath();
    ctx.fillStyle = t.crust; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(xe - 2, yE + 1);
    ctx.lineTo(xe + span * 0.18, yE - skyH * 0.04);
    ctx.lineTo(xe + span * 0.34, yE - skyH * 0.2);
    ctx.lineTo(xe + span * 0.46, yE - skyH * 0.14);
    ctx.lineTo(xe + span * 0.62, yE - skyH * 0.44);
    ctx.lineTo(xe + span * 0.76, yE - skyH * 0.3);
    ctx.lineTo(xe + span * 0.88, yE - skyH * 0.38);
    ctx.lineTo(xr, yE - skyH * 0.24);
    ctx.lineTo(xr, yE + 1);
    ctx.closePath();
    ctx.fillStyle = t.dry; ctx.fill();
    // 눈 덮인 봉우리
    ctx.beginPath();
    ctx.moveTo(xe + span * 0.555, yE - skyH * 0.38);
    ctx.lineTo(xe + span * 0.62, yE - skyH * 0.44);
    ctx.lineTo(xe + span * 0.685, yE - skyH * 0.375);
    ctx.closePath();
    ctx.fillStyle = t.snow; ctx.fill();
    ctx.restore();

    if (o.names) {
      var fs = clamp(11 * L.u + 2.5, 10, 14);
      D.text(ctx, '인도네시아', xl + 2, yW - skyH * 0.52, { size: fs, weight: 700, color: t.ink2, align: 'left' });
      D.text(ctx, '남아메리카', xr - 2, yE - skyH * 0.62, { size: fs, weight: 700, color: t.ink2, align: 'right' });
    }
  };

  /* ── 축 ───────────────────────────────── */
  D.drawAxes = function (ctx, L) {
    var t = D.theme();
    var fs = clamp(9.5 * L.u + 2, 9.5, 12);
    ctx.save();
    ctx.font = D.font(fs, 500);
    ctx.fillStyle = t.muted; ctx.strokeStyle = t.muted; ctx.lineWidth = 1;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [0, 100, 200, 300].forEach(function (z) {
      if (z > L.zMax) return;
      var y = L.zToY(z);
      ctx.beginPath(); ctx.moveTo(L.padL - 4, y); ctx.lineTo(L.padL, y); ctx.stroke();
      ctx.fillText(z === 0 ? '0' : String(z), L.padL - 6, z === L.zMax ? y - 5 : y);
    });
    ctx.save();
    ctx.translate(fs * 0.7, (L.ySL + L.yBot) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('수심 (m)', 0, 0);
    ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [[140, '140°E'], [180, '180°'], [220, '140°W'], [260, '100°W']].forEach(function (p) {
      var x = L.lonToX(p[0]);
      ctx.beginPath(); ctx.moveTo(x, L.yBot); ctx.lineTo(x, L.yBot + 4); ctx.stroke();
      ctx.fillText(p[1], x, L.yBot + 6);
    });
    ctx.restore();
  };

  /* ── 해수 흐름·용승·어장 (움직이는 입자) ── */
  function rand(seed) { var x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  D.makeFlow = function (nSurf, nUp) {
    var F = { surf: [], up: [], seed: 1 };
    for (var i = 0; i < nSurf; i++) F.surf.push({ lon: 135 + rand(i) * 145, f: rand(i + 50), k: rand(i + 90) });
    for (var j = 0; j < nUp; j++) F.up.push({ lon: 0, z: -1, age: 0, k: rand(j + 200), alive: false, wait: rand(j + 300) * 4 });
    return F;
  };

  D.updateFlow = function (F, s, dt) {
    var W = E.wind(s), U = E.upwelling(s);
    var nSurf = Math.round(F.surf.length * clamp(W / 1.4, 0.15, 1));
    F.nSurf = nSurf;
    for (var i = 0; i < F.surf.length; i++) {
      var p = F.surf[i];
      p.lon -= dt * (5 + 7 * p.k) * W;
      if (p.lon < 134) { p.lon = 278; p.f = rand(p.f * 97 + i); }
    }
    var nUp = Math.round(F.up.length * clamp(U / 1.96, 0.08, 1));
    F.nUp = nUp;
    for (var j = 0; j < F.up.length; j++) {
      var q = F.up[j];
      if (j >= nUp) { q.alive = false; continue; }
      if (!q.alive) {
        q.wait -= dt;
        if (q.wait <= 0) {
          q.alive = true; q.age = 0;
          q.lon = 279 - Math.pow(rand(j * 13 + q.k * 7 + F.seed), 1.6) * 40;
          var c = E.column(q.lon, s);
          q.z = Math.min(260, c.D + 25 + rand(j * 3 + F.seed) * 50);
          F.seed += 1.7;
        }
        continue;
      }
      var col = E.column(q.lon, s);
      q.age += dt;
      if (q.z > col.M * 0.35 + 2) {
        q.z -= dt * (16 + 10 * q.k) * U;
        q.lon -= dt * 0.4 * W;
      } else {
        q.z = Math.max(1.5, q.z - dt * 2);
        q.lon -= dt * (6 + 4 * q.k) * W;
      }
      if (q.lon < 230 || q.age > 18) { q.alive = false; q.wait = rand(q.age * 11 + j) * 1.2; }
    }
  };

  D.drawFlow = function (ctx, L, s, F) {
    var W = E.wind(s);
    ctx.save();
    ctx.lineCap = 'round';
    // 서쪽으로 이동하는 표층 해수
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (var i = 0; i < F.nSurf; i++) {
      var p = F.surf[i], c = E.column(p.lon, s);
      var z = 2 + p.f * Math.max(4, c.M * 0.8);
      var x = L.lonToX(p.lon), y = L.zToY(z);
      var len = (4 + 7 * W) * L.u;
      ctx.moveTo(x, y); ctx.lineTo(x + len, y);
    }
    ctx.stroke();
    // 용승하는 찬 해수
    ctx.fillStyle = 'rgba(210,245,255,0.95)';
    ctx.strokeStyle = 'rgba(210,245,255,0.55)';
    ctx.lineWidth = 1.4;
    for (var j = 0; j < F.nUp; j++) {
      var q = F.up[j];
      if (!q.alive) continue;
      var qx = L.lonToX(q.lon), qy = L.zToY(q.z);
      var a = Math.min(1, q.age * 1.5);
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(qx + 1.5, qy + 7 * L.u + 3); ctx.stroke();
      ctx.beginPath(); ctx.arc(qx, qy, 1.9 * Math.max(0.8, L.u), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };

  // 정지 화살표: 표층 해수 이동 + 용승
  D.drawFlowGlyphs = function (ctx, L, s, o) {
    var W = E.wind(s), U = E.upwelling(s);
    var fs = clamp(10.5 * L.u + 2.5, 10, 13.5);
    // 표층 해수 이동 (동 → 서)
    var yS = L.zToY(12);
    var x0 = L.lonToX(258), x1 = L.lonToX(258 - 38 - 42 * W);
    ctx.save();
    ctx.globalAlpha = 0.9;
    D.blockArrow(ctx, x0, x1, yS, (2.5 + 4 * W) * L.u + 1.5, 'rgba(255,255,255,0.72)', 'rgba(20,30,40,0.35)');
    ctx.restore();
    if (o.labels) D.text(ctx, '표층 해수', (x0 + x1) / 2, yS + (8 + 5 * W) * L.u + 6, { size: fs, weight: 700, color: '#10202a', haloColor: 'rgba(255,255,255,0.8)' });

    // 용승: 깊은 곳의 찬 해수가 표층으로 올라옴
    var lonU = 268, colU = E.column(lonU, s);
    var xU = L.lonToX(lonU);
    var yBottom = L.zToY(Math.min(200, colU.D + 55));
    var yTopU = L.zToY(Math.max(3, colU.M * 0.3)) + 2;
    var thickU = (2.5 + 6 * Math.min(U, 2) / 2) * L.u + 2;
    D.upArrow(ctx, xU, yBottom, yTopU, thickU, 'rgba(214,245,255,0.93)', 'rgba(16,40,70,0.6)');
    if (o.labels) D.text(ctx, '용승', xU - thickU - fs * 1.3, (yBottom + yTopU) / 2 + 6, { size: fs + 1, weight: 800, color: '#0b2a44', haloColor: 'rgba(225,248,255,0.9)' });
    return { xU: xU };
  };

  // 영양염이 풍부한 어장: 용승이 강할수록 플랑크톤·물고기가 많다
  var FISH = [[268, 7], [274, 13], [262, 12], [277, 5], [257, 8], [270, 19]];
  D.drawFishery = function (ctx, L, s, time) {
    var U = E.upwelling(s);
    var n = clamp(Math.round(U * 3.1), 0, 6);
    var dots = Math.round(U * 16);
    ctx.save();
    ctx.fillStyle = 'rgba(40,120,60,0.85)';
    for (var i = 0; i < dots; i++) {
      var lon = 279 - rand(i + 7) * 30, z = 1.5 + rand(i + 40) * 14;
      var x = L.lonToX(lon) + Math.sin(time * 0.8 + i) * 1.5, y = L.zToY(z);
      ctx.beginPath(); ctx.arc(x, y, 1.3 * Math.max(0.8, L.u), 0, Math.PI * 2); ctx.fill();
    }
    for (var k = 0; k < n; k++) {
      var f = FISH[k];
      var fx = L.lonToX(f[0]) + Math.sin(time * 0.9 + k * 1.7) * 3 * L.u;
      var fy = L.zToY(f[1]) + Math.cos(time * 1.3 + k) * 1.2;
      D.fish(ctx, fx, fy, (10 + 3 * L.u) * L.u + 3, k % 2 ? 1 : -1, 'rgba(18,28,40,0.88)');
    }
    ctx.restore();
    return n;
  };

  /* ── 무역풍 (하늘의 바람) ─────────────── */
  D.makeWind = function (n) {
    var P = [];
    for (var i = 0; i < n; i++) P.push({ x: rand(i + 500), y: rand(i + 600), k: rand(i + 700) });
    return P;
  };
  D.drawTradeWind = function (ctx, L, s, P, dt, o) {
    var t = D.theme();
    var W = E.wind(s);
    var top = L.padT + 6, bot = L.ySL - 8;
    var span = L.ox1 - L.ox0;
    // 흐르는 바람 줄
    var n = Math.round(P.length * clamp(W / 1.4, 0.12, 1));
    ctx.save();
    ctx.strokeStyle = t.streak;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (var i = 0; i < P.length; i++) {
      var p = P[i];
      if (dt) p.x -= dt * (0.05 + 0.05 * p.k) * W;
      if (p.x < 0) { p.x += 1; p.y = rand(p.y * 31 + i); }
      if (i >= n) continue;
      var x = L.ox0 + p.x * span, y = top + (0.25 + 0.72 * p.y) * (bot - top);
      var len = (10 + 22 * W) * L.u;
      ctx.moveTo(x, y); ctx.lineTo(x + len, y);
    }
    ctx.globalAlpha = 0.75;
    ctx.stroke();
    ctx.restore();
    // 큰 화살표 3개
    var thick = (4 + 7 * W) * L.u + 2;
    var len2 = span * (0.07 + 0.09 * W);
    var yA = bot - (bot - top) * 0.3;
    [0.8, 0.52, 0.24].forEach(function (f, i) {
      var xc = L.ox0 + span * f;
      var yy = yA - (i % 2) * (bot - top) * 0.22;
      D.blockArrow(ctx, xc + len2 / 2, xc - len2 / 2, yy, thick, t.windFill, t.windEdge);
    });
    if (o.labels) {
      var fs = clamp(12 * L.u + 3, 11, 16);
      D.text(ctx, '무역풍', L.ox0 + span * 0.52, yA - (bot - top) * 0.22 - thick - fs * 0.7, { size: fs, weight: 800, color: t.ink });
    }
  };

  /* ── 워커 순환 ────────────────────────── */
  // P(lon, a) → [x, y] : a = 0(지표) … 1(대류권 위쪽). u = 크기 배율
  function loopPoints(xa, xb, yT, yB, r, cw) {
    // 시계 방향(cw): 아래 변을 오른→왼, 왼 변을 아래→위, 위 변을 왼→오, 오른 변을 위→아래
    var pts = [], i, a;
    function arc(cx, cy, a0, a1) { for (i = 0; i <= 6; i++) { a = a0 + (a1 - a0) * i / 6; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } }
    var PI = Math.PI;
    if (cw) {
      pts.push([xb - r, yB]);
      pts.push([xa + r, yB]); arc(xa + r, yB - r, PI / 2, PI);
      pts.push([xa, yT + r]); arc(xa + r, yT + r, PI, 1.5 * PI);
      pts.push([xb - r, yT]); arc(xb - r, yT + r, 1.5 * PI, 2 * PI);
      pts.push([xb, yB - r]); arc(xb - r, yB - r, 0, PI / 2);
    } else {
      pts.push([xa + r, yB]);
      pts.push([xb - r, yB]); arc(xb - r, yB - r, PI / 2, 0);
      pts.push([xb, yT + r]); arc(xb - r, yT + r, 0, -PI / 2);
      pts.push([xa + r, yT]); arc(xa + r, yT + r, -PI / 2, -PI);
      pts.push([xa, yB - r]); arc(xa + r, yB - r, PI, PI / 2);
    }
    return pts;
  }
  function polyLen(pts) {
    var cum = [0];
    for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return cum;
  }
  function pointAt(pts, cum, d) {
    var L = cum[cum.length - 1];
    d = ((d % L) + L) % L;
    for (var i = 1; i < cum.length; i++) {
      if (cum[i] >= d) {
        var f = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
        var a = pts[i - 1], b = pts[i];
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[1] - a[1], b[0] - a[0])];
      }
    }
    return [pts[0][0], pts[0][1], 0];
  }

  D.drawWalker = function (ctx, P, s, time, o) {
    var t = D.theme();
    var wk = E.walker(s), u = o.u;
    var yB = P(180, 0.1)[1], yT = P(180, 0.84)[1];
    var xR = P(wk.rise, 0)[0];
    var gap = wk.west > 0.02 ? 6 * u : 0;
    var loops = [{ xa: xR + gap, xb: P(wk.sinkE, 0)[0], k: wk.east, cw: true }];
    if (wk.west > 0.02) loops.push({ xa: P(wk.sinkW, 0)[0], xb: xR - gap, k: wk.west, cw: false });

    // 구름 아래 비 (먼저 그려서 고리 뒤에 보이게)
    var cloudR = (15 + 13 * wk.convection) * u;
    var rainTop = yT + cloudR * 0.55;
    D.rain(ctx, xR, rainTop, yB + 4 * u, cloudR * 1.8, Math.round(5 + 4 * wk.convection), o.motion ? time : 0, 0.85);

    loops.forEach(function (lp) {
      var r = Math.min((yB - yT) * 0.32, (lp.xb - lp.xa) * 0.3, 30 * u);
      var pts = loopPoints(lp.xa, lp.xb, yT, yB, r, lp.cw);
      var cum = polyLen(pts);
      var lw = (2 + 5 * lp.k) * u + 0.8;
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.closePath();
      ctx.lineWidth = lw + 2.4; ctx.strokeStyle = t.walkerEdge; ctx.stroke();
      ctx.lineWidth = lw; ctx.strokeStyle = t.walker; ctx.stroke();
      // 지표 부근의 바람(무역풍 또는 서풍)
      ctx.beginPath();
      ctx.moveTo(lp.xa + r, yB); ctx.lineTo(lp.xb - r, yB);
      ctx.lineWidth = lw; ctx.strokeStyle = t.surfWind; ctx.stroke();
      ctx.restore();
      // 흐름 방향 화살촉
      var L = cum[cum.length - 1];
      var spacing = Math.max(46 * u, L / Math.max(3, Math.round(L / (70 * u))));
      var off = o.motion ? time * (18 + 30 * lp.k) * u : spacing * 0.35;
      for (var d = 0; d < L - 1; d += spacing) {
        var q = pointAt(pts, cum, d + off);
        D.arrowHead(ctx, q[0], q[1], q[2], lw * 0.9 + 4 * u, t.walkerEdge);
        D.arrowHead(ctx, q[0], q[1], q[2], lw * 0.9 + 2.2 * u, '#ffffff');
      }
    });

    // 상승 기류 위의 구름
    D.cloud(ctx, xR, yT - cloudR * 0.15, cloudR);
    // 하강 기류: 맑고 건조
    D.sun(ctx, P(wk.sinkE, 0)[0] + 16 * u, yB - (yB - yT) * 0.32, 8 * u + 2);
    if (wk.west > 0.25) D.sun(ctx, Math.max(12 * u + 4, P(wk.sinkW, 0)[0] - 14 * u), yB - (yB - yT) * 0.32, (5 + 4 * wk.west) * u + 2);
    return { xR: xR, yT: yT, yB: yB, cloudR: cloudR };
  };

  window.ENSODraw = D;
})();
