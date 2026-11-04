/* 색 척도 (window.OBSColor)
   - 같은 변수는 날짜가 바뀌어도 같은 범위·같은 단계를 쓴다(고정 범위).
   - 실제 값은 연속형(순차) 색, 편차는 0을 가운데 둔 발산형 색. 강수와 수온은 서로 다른 색을 쓴다.
   - 범위를 벗어난 값은 양 끝 색(▲·▼ 표시)으로 칠한다. */
(function () {
  'use strict';

  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

  function ramp(stops) {
    var c = stops.map(hex);
    return function (t) {
      t = Math.max(0, Math.min(1, t));
      var x = t * (c.length - 1), i = Math.min(c.length - 2, Math.floor(x)), f = x - i;
      return [0, 1, 2].map(function (k) { return Math.round(c[i][k] + (c[i + 1][k] - c[i][k]) * f); });
    };
  }

  // 차가운 물 → 따뜻한 물 (순차)
  var THERMAL = ramp(['#1b2a6b', '#2459a8', '#2f8fc4', '#5cc0c8', '#a6dcb0', '#f1ea9a', '#f9bb5c', '#ee7a3a', '#cf3d2e', '#8f1d2c']);
  // 파랑 ↔ 빨강 (발산, 가운데 흰색)
  var RDBU = ramp(['#1d3f8f', '#3b6fb6', '#76a8d6', '#bcd7ec', '#f6f6f4', '#f6c7ad', '#e58a67', '#c7473a', '#8e1b26']);
  // 강수량 (순차: 거의 흰색 → 초록 → 청록 → 파랑 → 보라)
  var RAIN = ramp(['#fbfcf4', '#d9efc5', '#9fd6a5', '#5bb9a5', '#2f93a9', '#2b68a6', '#3b3f94', '#4a1f72']);
  // 강수 편차 (발산: 갈색=건조 ↔ 청록=습윤)
  var BRBG = ramp(['#6b3c11', '#a8692b', '#d6aa66', '#efdcae', '#f5f5f0', '#b5e1d6', '#5fb3a5', '#1f7d75', '#0b4741']);

  function binned(edges, fn, center) {
    // edges: 경계값 배열(오름차순). 칸 수 = edges.length - 1, 양 끝 밖은 마지막 칸 색
    var n = edges.length - 1, cols = [];
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 0.5 : i / (n - 1);
      cols.push(fn(t));
    }
    if (center) {      // 0을 사이에 둔 칸은 흰색에 가깝게
      for (var j = 0; j < n; j++) if (edges[j] < 0 && edges[j + 1] > 0) cols[j] = [246, 246, 244];
    }
    return {
      edges: edges, colors: cols,
      index: function (v) {
        if (v !== v) return -1;
        if (v < edges[0]) return 0;
        for (var k = 1; k < edges.length; k++) if (v < edges[k]) return k - 1;
        return n - 1;
      }
    };
  }

  function range(a, b, step) { var o = []; for (var x = a; x <= b + 1e-9; x += step) o.push(Math.round(x * 100) / 100); return o; }
  function sym(list) { var neg = list.slice().reverse().map(function (x) { return -x; }); return neg.concat(list); }

  var S = {
    sst: { title: '해수면 온도', unit: '°C', scale: binned(range(15, 32, 1), THERMAL), digits: 1 },
    sstA: { title: '해수면 온도 편차', unit: '°C', scale: binned(sym([0.5, 1, 1.5, 2, 2.5, 3, 4, 5]), RDBU, true), digits: 1, diverging: true },
    precip: { title: '강수량', unit: 'mm/월', scale: binned(range(0, 550, 50), RAIN), digits: 0 },
    precipA: { title: '강수량 편차', unit: 'mm/월', scale: binned(sym([25, 50, 100, 150, 200, 300, 400]), BRBG, true), digits: 0, diverging: true },
    sec: { title: '수온', unit: '°C', scale: binned(range(5, 32, 1), THERMAL), digits: 1 },
    secA: { title: '수온 편차', unit: '°C', scale: binned(sym([0.5, 1, 2, 3, 4, 5, 6, 7]), RDBU, true), digits: 1, diverging: true }
  };

  /* 범례: 가로 막대(칸마다 색), 경계값 눈금 */
  function legend(el, key) {
    var s = S[key], e = s.scale.edges, cols = s.scale.colors;
    var html = '<div class="lg-title">' + s.title + ' <span>(' + s.unit + ')</span></div><div class="lg-bar">';
    for (var i = 0; i < cols.length; i++) {
      var cls = (i === 0 ? ' lo' : '') + (i === cols.length - 1 ? ' hi' : '');
      html += '<i class="' + cls + '" style="background:rgb(' + cols[i].join(',') + ')"></i>';
    }
    html += '</div><div class="lg-ticks">';
    var every = s.diverging ? 1 : (e.length > 14 ? 2 : 1), mid = 1;
    for (var k = 1; k < e.length - 1; k++) {
      if (Math.abs(k - mid) % every) continue;
      html += '<span style="left:' + (k / (e.length - 1) * 100) + '%">' + fmt(e[k]) + '</span>';
    }
    html += '</div>';
    el.innerHTML = html;
    el.setAttribute('aria-label', s.title + ' 범례, ' + fmt(e[1]) + '부터 ' + fmt(e[e.length - 2]) + ' ' + s.unit + '까지, 양 끝 칸은 범위 밖 값 포함');
  }
  function fmt(v) { return (v < 0 ? '−' : '') + String(Math.abs(v)); }

  window.OBSColor = { S: S, legend: legend };
})();
