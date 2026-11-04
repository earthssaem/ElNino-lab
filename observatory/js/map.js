/* 태평양 지도 (window.OBSMap)
   - 등장방형(경위도 그대로) 투영, 범위 30°S~30°N · 100°E~290°E 고정. 날짜가 바뀌어도 지도 영역·크기는 그대로다.
   - 해수면 온도(ERSST 2°)·강수량(GPCP 2.5°)은 격자 칸을 그대로 칠한다(보간 없음).
   - 바람 화살표는 NCEP/NCAR R1 격자점 값 그대로. 방향 = 바람이 향하는 방향, 길이 ∝ 풍속. */
(function () {
  'use strict';

  var LON0 = 100, LON1 = 290, LAT0 = -30, LAT1 = 30;
  var M = { l: 40, r: 10, t: 8, b: 24 };
  var LAND = window.ENSO_LAND || [];

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function create(canvas) {
    var ctx = canvas.getContext('2d');
    var W = 0, H = 0, pw = 0, ph = 0, dpr = 1;
    var fieldCache = {};

    function resize() {
      var cw = canvas.parentNode.clientWidth;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      pw = Math.max(200, cw - M.l - M.r);
      ph = Math.round(pw * (LAT1 - LAT0) / (LON1 - LON0));
      W = pw + M.l + M.r; H = ph + M.t + M.b;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    }
    function X(lon) { return M.l + (lon - LON0) / (LON1 - LON0) * pw; }
    function Y(lat) { return M.t + (LAT1 - lat) / (LAT1 - LAT0) * ph; }

    function fieldImage(layer, mode, ym) {
      var key = layer + mode + ym;
      if (fieldCache[key]) return fieldCache[key];
      var g = OBS.meta.grids[layer], ny = g.lat.length, nx = g.lon.length;
      var data = mode === 'anom' ? OBS.anom(layer, ym) : OBS.value(layer, ym);
      var sc = OBSColor.S[layer + (mode === 'anom' ? 'A' : '')].scale;
      var off = document.createElement('canvas');
      off.width = nx; off.height = ny;
      var oc = off.getContext('2d'), img = oc.createImageData(nx, ny);
      for (var j = 0; j < ny; j++) {
        for (var i = 0; i < nx; i++) {
          var v = data[j * nx + i], p = ((ny - 1 - j) * nx + i) * 4, k = sc.index(v);
          if (k < 0) { img.data[p + 3] = 0; continue; }
          var c = sc.colors[k];
          img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2]; img.data[p + 3] = 255;
        }
      }
      oc.putImageData(img, 0, 0);
      var dlon = g.lon[1] - g.lon[0], dlat = g.lat[1] - g.lat[0];
      var res = { img: off, lon0: g.lon[0] - dlon / 2, lon1: g.lon[nx - 1] + dlon / 2, lat0: g.lat[0] - dlat / 2, lat1: g.lat[ny - 1] + dlat / 2 };
      var keys = Object.keys(fieldCache);
      if (keys.length > 40) delete fieldCache[keys[0]];
      return (fieldCache[key] = res);
    }

    function landPath() {
      ctx.beginPath();
      LAND.forEach(function (r) {
        for (var i = 0; i < r.length; i += 2) {
          var x = X(r[i]), y = Y(r[i + 1]);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
      });
    }

    function arrow(x, y, dx, dy, head) {
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.6) return;
      var ux = dx / len, uy = dy / len, h = Math.min(head, len * 0.45);
      ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy);
      ctx.moveTo(x + dx, y + dy); ctx.lineTo(x + dx - ux * h - uy * h * 0.55, y + dy - uy * h + ux * h * 0.55);
      ctx.moveTo(x + dx, y + dy); ctx.lineTo(x + dx - ux * h + uy * h * 0.55, y + dy - uy * h - ux * h * 0.55);
    }

    /* 화살표 길이: 1 m/s 당 픽셀 */
    function stepOf() { return pw < 450 ? 6 : pw < 700 ? 4 : 3; }
    function pxPerMs() { return pw / (LON1 - LON0) * 0.27 * stepOf(); }

    function draw(st) {
      if (!OBS.meta) return;
      if (canvas.parentNode.clientWidth !== W) resize();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var ink = css('--ink'), muted = css('--muted'), line = css('--line');

      ctx.save();
      ctx.beginPath(); ctx.rect(M.l, M.t, pw, ph); ctx.clip();
      ctx.fillStyle = css('--nodata'); ctx.fillRect(M.l, M.t, pw, ph);
      var f = fieldImage(st.layer, st.mode, st.ym);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(f.img, X(f.lon0), Y(f.lat1), X(f.lon1) - X(f.lon0), Y(f.lat0) - Y(f.lat1));

      // 육지: 해수면 온도는 육지를 덮고, 강수(육지에도 자료 있음)는 해안선만
      landPath();
      if (st.layer === 'sst') { ctx.fillStyle = css('--land'); ctx.fill(); }
      ctx.strokeStyle = css('--coast'); ctx.lineWidth = 0.8; ctx.stroke();

      // 경위선
      ctx.strokeStyle = 'rgba(30,40,60,.18)'; ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (var lo = 120; lo < LON1; lo += 20) { ctx.moveTo(X(lo), M.t); ctx.lineTo(X(lo), M.t + ph); }
      for (var la = -20; la <= 20; la += 10) { ctx.moveTo(M.l, Y(la)); ctx.lineTo(M.l + pw, Y(la)); }
      ctx.stroke();

      // 단면 영역 띠(2°S~2°N, GODAS 단면 경도 범위)
      var sg = OBS.meta.grids.section, b0 = sg.lon[0] - 0.5, b1 = sg.lon[sg.lon.length - 1] + 0.5;
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      ctx.fillRect(X(b0), Y(2), X(b1) - X(b0), Y(-2) - Y(2));
      ctx.setLineDash([5, 3]); ctx.strokeStyle = 'rgba(15,25,45,.85)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(b0), Y(2)); ctx.lineTo(X(b1), Y(2)); ctx.moveTo(X(b0), Y(-2)); ctx.lineTo(X(b1), Y(-2)); ctx.stroke();
      // Niño 3.4 감시 구역
      var nb = OBS.meta.regions.nino34;
      ctx.setLineDash([2, 3]); ctx.strokeStyle = 'rgba(15,25,45,.7)';
      ctx.strokeRect(X(nb.lon[0]), Y(nb.lat[1]), X(nb.lon[1]) - X(nb.lon[0]), Y(nb.lat[0]) - Y(nb.lat[1]));
      if (st.region) {
        ctx.setLineDash([]); ctx.strokeStyle = css('--wind-line'); ctx.lineWidth = 1.6;
        ctx.strokeRect(X(st.region.lon[0]), Y(st.region.lat[1]), X(st.region.lon[1]) - X(st.region.lon[0]), Y(st.region.lat[0]) - Y(st.region.lat[1]));
      }
      ctx.setLineDash([]);

      // 바람 화살표
      if (st.arrows) {
        var wg = OBS.meta.grids.wind, uu = OBS.value('u', st.ym), vv = OBS.value('v', st.ym), k = pxPerMs();
        var step = pw < 700 ? 3 : 2, nx = wg.lon.length;
        var path = function () {
          ctx.beginPath();
          for (var j = 1; j < wg.lat.length; j += step) {
            for (var i = 0; i < nx; i += step) {
              var u = uu[j * nx + i], v = vv[j * nx + i];
              if (isNaN(u) || isNaN(v)) continue;
              arrow(X(wg.lon[i]), Y(wg.lat[j]), u * k, -v * k, 4.5);
            }
          }
        };
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        path(); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3.2; ctx.stroke();
        path(); ctx.strokeStyle = css('--arrow'); ctx.lineWidth = 1.4; ctx.stroke();
      }

      // 선택한 경도(단면과 연동)
      if (st.probeLon !== null && st.probeLon !== undefined) {
        ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(X(st.probeLon), Y(6)); ctx.lineTo(X(st.probeLon), Y(-6)); ctx.stroke();
      }
      if (st.click) {
        var cx = X(st.click.lon), cy = Y(st.click.lat);
        ctx.lineWidth = 3; ctx.strokeStyle = '#fff';
        ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1.6; ctx.strokeStyle = css('--accent-strong');
        ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();

      // 테두리와 눈금
      ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.strokeRect(M.l + 0.5, M.t + 0.5, pw - 1, ph - 1);
      ctx.fillStyle = muted; ctx.font = '11px ' + css('--font-num');
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      var stepLon = pw < 520 ? 40 : 20;
      for (var t = 120; t < LON1; t += stepLon) ctx.fillText(OBS.fmtLon(t), X(t), M.t + ph + 6);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (var s = -20; s <= 20; s += 10) ctx.fillText(OBS.fmtLat(s), M.l - 5, Y(s));
      ctx.fillStyle = ink;
    }

    function hit(px, py) {
      if (px < M.l || px > M.l + pw || py < M.t || py > M.t + ph) return null;
      return { lon: LON0 + (px - M.l) / pw * (LON1 - LON0), lat: LAT1 - (py - M.t) / ph * (LAT1 - LAT0) };
    }

    resize();
    return { draw: draw, hit: hit, resize: resize, pxPerMs: pxPerMs, step: stepOf, canvas: canvas, clearCache: function () { fieldCache = {}; } };
  }

  window.OBSMap = { create: create };
})();
