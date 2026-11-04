/* 시계열 그래프 (window.OBSSeries) — SVG
   위: Niño 3.4 해수면 온도 편차(ERSST v5, °C), 아래: 선택 해역 10 m 동서 바람 u(NCEP/NCAR R1, m/s).
   두 그래프는 가로축(연·월)을 함께 쓰고 세로축은 각자의 단위로 따로 둔다. */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function create(box, onPick) {
    var svg = el('svg', { class: 'series-svg', role: 'img' }, box);
    var state = null;

    function draw(st) {
      state = st;
      var w = Math.max(320, box.clientWidth), panelH = 112, gap = 26;
      var m = { l: 52, r: 14, t: 18, b: 26 };
      var h = m.t + panelH * 2 + gap + m.b;
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      svg.setAttribute('width', w); svg.setAttribute('height', h);
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      var S = OBS.series, months = st.months, n = months.length;
      var i0 = S.months.indexOf(months[0]);
      var pw = w - m.l - m.r;
      function X(i) { return m.l + (i + 0.5) / n * pw; }

      var reg = st.region, ws = S.wind[reg.id], windAnom = st.windMode === 'anom';
      var panels = [
        { title: 'Niño 3.4 해수면 온도 편차 (°C) · ERSST v5, 1991~2020 평년 기준', key: 'nino', lo: -3, hi: 3,
          vals: S.nino34.anom.slice(i0, i0 + n), color: 'var(--nino-line)', ticks: [-2, -1, 0, 1, 2] },
        { title: (windAnom ? '동서 바람 u 평년 편차 (m/s)' : '동서 바람 u (m/s)') + ' · 10 m, ' + reg.name + ' ' + regText(reg) +
            ' 평균 · 음수 = 동풍(서쪽으로 부는 바람)', key: 'wind',
          lo: windAnom ? -5 : -10, hi: windAnom ? 5 : 4,
          vals: (windAnom ? ws.anom : ws.value).slice(i0, i0 + n), color: 'var(--wind-line)',
          ticks: windAnom ? [-4, -2, 0, 2, 4] : [-8, -6, -4, -2, 0, 2] }
      ];
      if (!windAnom) {       // 같은 달 평년값(직접 계산)
        var v = ws.value, a = ws.anom;
        panels[1].clim = months.map(function (mm, k) { var j = i0 + k; return v[j] - a[j]; });
      }

      // 사례 구간 밖 회색 처리는 없음(이 그래프는 사례 기간만 보여 줌). 해 경계선
      panels.forEach(function (p, pi) {
        var top = m.t + pi * (panelH + gap);
        function Y(val) { return top + (p.hi - Math.max(p.lo, Math.min(p.hi, val))) / (p.hi - p.lo) * panelH; }
        el('rect', { x: m.l, y: top, width: pw, height: panelH, class: 'sr-bg' }, svg);
        months.forEach(function (mm, i) {
          if (mm.slice(5) === '01' && i > 0) el('line', { x1: X(i) - pw / n / 2, x2: X(i) - pw / n / 2, y1: top, y2: top + panelH, class: 'sr-year' }, svg);
        });
        p.ticks.forEach(function (t) {
          el('line', { x1: m.l, x2: m.l + pw, y1: Y(t), y2: Y(t), class: t === 0 ? 'sr-zero' : 'sr-grid' }, svg);
          var tx = el('text', { x: m.l - 6, y: Y(t) + 4, class: 'sr-tick', 'text-anchor': 'end' }, svg);
          tx.textContent = (t < 0 ? '−' : t > 0 && p.key === 'nino' ? '+' : '') + Math.abs(t);
        });
        var tt = el('text', { x: m.l, y: top - 6, class: 'sr-title' }, svg);
        tt.textContent = p.title;
        if (p.key === 'nino') {
          [0.5, -0.5].forEach(function (b) { el('line', { x1: m.l, x2: m.l + pw, y1: Y(b), y2: Y(b), class: 'sr-thresh' }, svg); });
        }
        if (p.clim) el('path', { d: pathOf(p.clim, X, Y), class: 'sr-clim' }, svg);
        el('path', { d: pathOf(p.vals, X, Y), class: 'sr-line', style: 'stroke:' + p.color }, svg);
        p.vals.forEach(function (val, i) {
          if (val === null) return;
          el('circle', { cx: X(i), cy: Y(val), r: n > 40 ? 1.8 : 2.2, style: 'fill:' + p.color }, svg);
        });
      });
      // 범례(점선)
      if (!windAnom) {
        var lg = el('text', { x: m.l + pw, y: m.t + panelH + gap - 6, class: 'sr-note', 'text-anchor': 'end' }, svg);
        lg.textContent = '점선: 같은 달 1991~2020 평년값';
      }
      var lg2 = el('text', { x: m.l + pw, y: m.t - 6, class: 'sr-note', 'text-anchor': 'end' }, svg);
      lg2.textContent = '가는 선: ±0.5 °C';

      // 가로축(연·월)
      months.forEach(function (mm, i) {
        var mo = parseInt(mm.slice(5), 10);
        if (mo === 1 || mo === 7) {
          var t = el('text', { x: X(i), y: h - 8, class: 'sr-tick', 'text-anchor': 'middle' }, svg);
          t.textContent = mo === 1 ? mm.slice(0, 4) + '.1' : '7';
        }
      });
      // 현재 월
      var ci = months.indexOf(st.ym);
      if (ci >= 0) {
        el('line', { x1: X(ci), x2: X(ci), y1: m.t - 2, y2: m.t + panelH * 2 + gap, class: 'sr-now' }, svg);
        var cur = panels.map(function (p) { return p.vals[ci]; });
        svg.setAttribute('aria-label', OBS.fmtMonth(st.ym) + ': Niño 3.4 편차 ' + fmtv(cur[0], 2, '°C') +
          ', ' + reg.name + ' 동서 바람 ' + (windAnom ? '편차 ' : '') + fmtv(cur[1], 1, 'm/s'));
      }
      // 클릭 영역
      var hitbox = el('rect', { x: m.l, y: m.t, width: pw, height: panelH * 2 + gap, class: 'sr-hit' }, svg);
      hitbox.addEventListener('click', function (e) {
        var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * (w / r.width);
        var i = Math.max(0, Math.min(n - 1, Math.floor((x - m.l) / pw * n)));
        onPick(months[i]);
      });
    }

    function pathOf(vals, X, Y) {
      var d = '', pen = false;
      vals.forEach(function (v, i) {
        if (v === null || v !== v) { pen = false; return; }
        d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1);
        pen = true;
      });
      return d;
    }
    function fmtv(v, d, u) { return v === null || v === undefined ? '자료 없음' : OBS.sign(v, d) + ' ' + u; }
    function regText(r) { return OBS.fmtLat(r.lat[0]) + '~' + OBS.fmtLat(r.lat[1]) + ', ' + OBS.fmtLon(r.lon[0]) + '~' + OBS.fmtLon(r.lon[1]); }

    return { draw: draw, redraw: function () { if (state) draw(state); } };
  }

  window.OBSSeries = { create: create };
})();
