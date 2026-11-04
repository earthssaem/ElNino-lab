/* 적도 태평양 수온 단면 (window.OBSSection)
   - GODAS 2°S~2°N 평균 수온(파이프라인에서 위도 평균을 먼저 한 값). 가로 경도(왼쪽 서태평양), 세로 수심 0~500 m.
   - 색은 격자값(경도 1°, 수심 층) 사이를 선형 보간해 칠한다. 자료가 없는 칸(육지 등)은 회색.
     GODAS 맨 위 층(5 m)은 0~10 m 층의 값이므로 해면까지 그 값으로 칠한다.
   - 20 ℃ 등온선: 실선 = 그 달, 점선 = 같은 달 1991~2020년 평년. 두 층 사이 선형 보간으로 계산(OBS.isoDepth). */
(function () {
  'use strict';

  var LON0 = 120, LON1 = 284, ZMAX = 500;
  var M = { l: 48, r: 34, t: 24, b: 26 };

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function create(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var W = 0, H = 0, pw = 0, ph = 0, dpr = 1, cache = {};

    function resize() {
      var cw = canvas.parentNode.clientWidth;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      pw = Math.max(200, cw - M.l - M.r);
      ph = Math.round(Math.max(opts.minH || 190, Math.min(opts.maxH || 430, pw * (opts.ratio || 0.34))));
      W = pw + M.l + M.r; H = ph + M.t + M.b;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    }
    function X(lon) { return M.l + (lon - LON0) / (LON1 - LON0) * pw; }
    function Y(z) { return M.t + z / ZMAX * ph; }

    function image(mode, ym) {
      var key = mode + ym;
      if (cache[key]) return cache[key];
      var g = OBS.meta.grids.section, nx = g.lon.length, nz = g.depth.length, dep = g.depth;
      var data = mode === 'anom' ? OBS.anom('section', ym) : OBS.value('section', ym);
      var sc = OBSColor.S[mode === 'anom' ? 'secA' : 'sec'].scale;
      var IW = (LON1 - LON0) * 4, IH = 250;
      var off = document.createElement('canvas');
      off.width = IW; off.height = IH;
      var oc = off.getContext('2d'), img = oc.createImageData(IW, IH);
      var kz = new Int16Array(IH), wz = new Float32Array(IH);
      for (var j = 0; j < IH; j++) {
        var z = (j + 0.5) * ZMAX / IH, k = 0;
        if (z <= dep[0]) { kz[j] = 0; wz[j] = 0; continue; }
        while (k < nz - 2 && dep[k + 1] < z) k++;
        kz[j] = k; wz[j] = Math.min(1, (z - dep[k]) / (dep[k + 1] - dep[k]));
      }
      for (var i = 0; i < IW; i++) {
        var lon = LON0 + (i + 0.5) / 4, fx = lon - g.lon[0];
        var x0 = Math.floor(fx), wx = fx - x0, x1 = x0 + 1;
        if (x0 < 0) { x0 = 0; x1 = 0; wx = 0; }
        if (x1 > nx - 1) { x1 = nx - 1; x0 = Math.min(x0, nx - 1); wx = 0; }
        for (var jj = 0; jj < IH; jj++) {
          var k0 = kz[jj], wzv = wz[jj], k1 = Math.min(nz - 1, k0 + 1);
          var a = data[k0 * nx + x0], b = data[k0 * nx + x1], c = data[k1 * nx + x0], d = data[k1 * nx + x1];
          var v;
          if (a === a && b === b && c === c && d === d) {
            v = (a * (1 - wx) + b * wx) * (1 - wzv) + (c * (1 - wx) + d * wx) * wzv;
          } else {           // 이웃 중 결측이 있으면 가장 가까운 격자값(그 칸의 값)만 쓴다
            var nk = wzv < 0.5 ? k0 : k1, ni = wx < 0.5 ? x0 : x1;
            v = data[nk * nx + ni];
          }
          var p = (jj * IW + i) * 4, ci = sc.index(v);
          if (ci < 0) { img.data[p + 3] = 0; continue; }
          var col = sc.colors[ci];
          img.data[p] = col[0]; img.data[p + 1] = col[1]; img.data[p + 2] = col[2]; img.data[p + 3] = 255;
        }
      }
      oc.putImageData(img, 0, 0);
      var keys = Object.keys(cache);
      if (keys.length > 30) delete cache[keys[0]];
      return (cache[key] = off);
    }

    function isoPath(line, lons) {
      ctx.beginPath();
      var pen = false;
      for (var i = 0; i < line.length; i++) {
        var z = line[i];
        if (z !== z || lons[i] < LON0 || lons[i] > LON1) { pen = false; continue; }
        if (!pen) { ctx.moveTo(X(lons[i]), Y(z)); pen = true; } else ctx.lineTo(X(lons[i]), Y(z));
      }
    }

    function draw(st) {
      if (!OBS.meta) return;
      if (canvas.parentNode.clientWidth !== W) resize();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var g = OBS.meta.grids.section, muted = css('--muted'), ink = css('--ink');

      ctx.save();
      ctx.beginPath(); ctx.rect(M.l, M.t, pw, ph); ctx.clip();
      ctx.fillStyle = css('--nodata'); ctx.fillRect(M.l, M.t, pw, ph);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image(st.mode, st.ym), M.l, M.t, pw, ph);

      // 수심 100 m 간격 안내선
      ctx.strokeStyle = 'rgba(20,30,50,.16)'; ctx.lineWidth = 0.6; ctx.beginPath();
      for (var z = 100; z < ZMAX; z += 100) { ctx.moveTo(M.l, Y(z)); ctx.lineTo(M.l + pw, Y(z)); }
      ctx.stroke();

      if (st.iso) {
        var cur = OBS.isoLine(OBS.value('section', st.ym)), cl = OBS.isoLine(OBS.climOf('section', st.ym));
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.setLineDash([7, 5]);
        isoPath(cl, g.lon); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 4; ctx.stroke();
        isoPath(cl, g.lon); ctx.strokeStyle = css('--iso'); ctx.lineWidth = 1.8; ctx.stroke();
        ctx.setLineDash([]);
        isoPath(cur, g.lon); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 5; ctx.stroke();
        isoPath(cur, g.lon); ctx.strokeStyle = css('--iso'); ctx.lineWidth = 2.6; ctx.stroke();
      }

      if (st.probeLon !== null && st.probeLon !== undefined) {
        var px = X(st.probeLon);
        ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(px, M.t); ctx.lineTo(px, M.t + ph); ctx.stroke();
        ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px, M.t); ctx.lineTo(px, M.t + ph); ctx.stroke();
        if (st.iso && st.probe) {
          [[st.probe.clim, false], [st.probe.cur, true]].forEach(function (p) {
            if (p[0] !== p[0]) return;
            ctx.beginPath(); ctx.arc(px, Y(p[0]), p[1] ? 5 : 4, 0, Math.PI * 2);
            ctx.fillStyle = p[1] ? css('--iso') : '#fff'; ctx.fill();
            ctx.lineWidth = 1.8; ctx.strokeStyle = p[1] ? '#fff' : css('--iso'); ctx.stroke();
          });
        }
      }
      ctx.restore();

      ctx.strokeStyle = css('--line'); ctx.lineWidth = 1; ctx.strokeRect(M.l + 0.5, M.t + 0.5, pw - 1, ph - 1);
      var fnum = css('--font-num'), fui = css('--font-ui');
      ctx.fillStyle = muted; ctx.font = '11px ' + fnum;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      var stepLon = pw < 520 ? 40 : 20;
      for (var t = 120; t <= LON1; t += stepLon) if (t > LON0) ctx.fillText(OBS.fmtLon(t), X(t), M.t + ph + 7);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (var d = 0; d <= ZMAX; d += 100) ctx.fillText(d + (d === 0 ? '' : ''), M.l - 6, Y(d));
      // 자료 층 눈금(오른쪽)
      ctx.strokeStyle = muted; ctx.lineWidth = 1; ctx.beginPath();
      g.depth.forEach(function (z) { if (z <= ZMAX) { ctx.moveTo(M.l + pw + 1, Y(z)); ctx.lineTo(M.l + pw + 5, Y(z)); } });
      ctx.stroke();
      ctx.save(); ctx.translate(M.l + pw + 18, M.t + ph / 2); ctx.rotate(Math.PI / 2);
      ctx.textAlign = 'center'; ctx.font = '10px ' + fui; ctx.fillText('GODAS 자료 층', 0, 0); ctx.restore();
      ctx.save(); ctx.translate(12, M.t + ph / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.font = '11px ' + fui; ctx.fillText('수심 (m)', 0, 0); ctx.restore();
      ctx.font = '600 11.5px ' + fui; ctx.fillStyle = ink; ctx.textBaseline = 'alphabetic';
      var narrow = pw < 460;
      ctx.textAlign = 'left'; ctx.fillText(narrow ? '← 서태평양' : '← 서태평양 (인도네시아 쪽)', M.l, M.t - 8);
      ctx.textAlign = 'right'; ctx.fillText(narrow ? '동태평양 →' : '동태평양 (남아메리카 쪽) →', M.l + pw, M.t - 8);
    }

    function hit(px, py) {
      if (px < M.l || px > M.l + pw || py < M.t || py > M.t + ph) return null;
      return { lon: LON0 + (px - M.l) / pw * (LON1 - LON0), depth: (py - M.t) / ph * ZMAX };
    }

    resize();
    return { draw: draw, hit: hit, resize: resize, canvas: canvas, range: [LON0, LON1] };
  }

  window.OBSSection = { create: create };
})();
