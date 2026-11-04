/* 자료 읽기와 계산 (window.OBS)
   - data/*.json 은 pipeline/build_web.py 가 공식 원자료로 만든 파일이다. 여기서 값을 만들어 넣지 않는다.
   - 편차 = 실제 값 − 같은 달 1991~2020년 평년값. 결측(null)은 NaN 으로 두고 그리지 않는다. */
(function () {
  'use strict';

  var OBS = { meta: null, clim: null, series: null, years: {} };
  var cache = {};

  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' (' + r.status + ')');
      return r.json();
    });
  }

  function decode(arr, scale) {
    var out = new Float32Array(arr.length);
    for (var i = 0; i < arr.length; i++) out[i] = arr[i] === null ? NaN : arr[i] * scale;
    return out;
  }

  OBS.load = function () {
    return Promise.all([getJSON('data/meta.json'), getJSON('data/clim.json'), getJSON('data/series.json')]).then(function (r) {
      OBS.meta = r[0]; OBS.clim = r[1]; OBS.series = r[2];
    });
  };

  /* 월별 지도·단면 자료는 연도별 파일(year-YYYY.json). 사례끼리 기간이 겹쳐도 같은 파일을 쓴다. */
  OBS.has = function (ym) { return OBS.meta.years.indexOf(parseInt(ym.slice(0, 4), 10)) >= 0; };
  OBS.loadYear = function (y) {
    if (OBS.years[y]) return Promise.resolve(OBS.years[y]);
    return getJSON('data/year-' + y + '.json').then(function (d) { OBS.years[y] = d; return d; });
  };
  OBS.ensure = function (months) {
    var ys = {};
    months.forEach(function (m) { if (m && OBS.has(m)) ys[m.slice(0, 4)] = true; });
    return Promise.all(Object.keys(ys).map(function (y) { return OBS.loadYear(parseInt(y, 10)); }));
  };
  function monthData(ym) {
    var d = OBS.years[parseInt(ym.slice(0, 4), 10)];
    return d ? { d: d, i: parseInt(ym.slice(5, 7), 10) - 1 } : null;
  }

  OBS.caseInfo = function (id) {
    for (var i = 0; i < OBS.meta.cases.length; i++) if (OBS.meta.cases[i].id === id) return OBS.meta.cases[i];
    return null;
  };
  /* 그 달을 포함하는 사례들(겹치는 기간은 둘 이상) */
  OBS.casesWith = function (ym) {
    return OBS.meta.cases.filter(function (c) { return c.months.indexOf(ym) >= 0; });
  };

  /* NOAA CPC 공식 판정(RONI 표의 빨강·파랑). 1 엘니뇨, −1 라니냐, 0 중립, null 자료 없음 */
  OBS.ensoState = function (ym) {
    var i = OBS.series.months.indexOf(ym);
    if (i < 0) return null;
    var v = OBS.series.enso.roni[i];
    return v === null ? null : OBS.series.enso.roni_state[i];
  };
  OBS.ensoName = function (s) { return s === 1 ? '엘니뇨' : s === -1 ? '라니냐' : s === 0 ? '중립' : '자료 없음'; };

  var SC = { sst: 'sst', precip: 'precip', u: 'wind', v: 'wind', section: 'section' };

  /* 실제 값 (var: sst | precip | u | v | section) */
  OBS.value = function (v, ym) {
    var key = 'v|' + v + '|' + ym;
    if (cache[key]) return cache[key];
    var md = monthData(ym);
    if (!md) return null;
    return (cache[key] = decode(md.d[v][md.i], OBS.meta.scale[SC[v]]));
  };

  /* 같은 달 평년값 */
  OBS.climOf = function (v, ym) {
    var m = parseInt(ym.slice(5, 7), 10) - 1;
    var key = 'c|' + v + '|' + m;
    return cache[key] || (cache[key] = decode(OBS.clim[v][m], OBS.meta.scale[SC[v]]));
  };

  /* 편차 */
  OBS.anom = function (v, ym) {
    var key = 'a|' + v + '|' + ym;
    if (cache[key]) return cache[key];
    var a = OBS.value(v, ym), c = OBS.climOf(v, ym);
    if (!a) return null;
    var out = new Float32Array(a.length);
    for (var i = 0; i < a.length; i++) out[i] = a[i] - c[i];
    return (cache[key] = out);
  };

  /* 단면 각 칸(수심×경도)의 위도 평균에 실제로 쓴 해양 격자 수(2°S~2°N 위도 격자 12개 중).
     기본은 해양 격자 수이고, 그 달 원자료가 결측이라 빠진 칸만 사례 파일에 따로 적혀 있다. */
  OBS.secCount = function (ym) {
    var key = 'n|' + ym;
    if (cache[key]) return cache[key];
    var g = OBS.meta.grids.section, out = new Int8Array(g.ocean_count);
    var md = monthData(ym);
    if (md && md.d.section_count_diff) {
      (md.d.section_count_diff[md.i] || []).forEach(function (d) { out[d[0]] = d[1]; });
    }
    return (cache[key] = out);
  };
  OBS.secLatTotal = function () { return OBS.meta.grids.section.lat.length; };

  /* 20 ℃ 등온선 깊이: 위에서부터 내려가며 수온이 20 ℃ 이상→미만으로 바뀌는 첫 두 층 사이를 선형 보간.
     결측 층을 먼저 만나거나 교차가 없으면 NaN(측정 불가). sec: [층][경도] 순서로 펼친 배열 */
  OBS.isoDepth = function (sec, col, target) {
    var g = OBS.meta.grids.section, nz = g.depth.length, nx = g.lon.length;
    target = target === undefined ? 20 : target;
    for (var k = 0; k < nz - 1; k++) {
      var a = sec[k * nx + col], b = sec[(k + 1) * nx + col];
      if (isNaN(a) || isNaN(b)) return NaN;
      if (a >= target && b < target) return g.depth[k] + (a - target) / (a - b) * (g.depth[k + 1] - g.depth[k]);
    }
    return NaN;
  };

  OBS.isoLine = function (sec) {
    var key = sec.__iso;
    if (key) return key;
    var n = OBS.meta.grids.section.lon.length, out = new Float32Array(n);
    for (var i = 0; i < n; i++) out[i] = OBS.isoDepth(sec, i, 20);
    sec.__iso = out;
    return out;
  };

  /* 가장 가까운 격자 (경도는 0~360) */
  OBS.nearest = function (arr, x) {
    var best = 0, d = Infinity;
    for (var i = 0; i < arr.length; i++) { var e = Math.abs(arr[i] - x); if (e < d) { d = e; best = i; } }
    return best;
  };

  /* 격자 칸 안에 드는지(칸 중심 ± 반 칸) */
  OBS.cellIndex = function (centers, x) {
    var i = OBS.nearest(centers, x);
    var half = centers.length > 1 ? Math.abs(centers[1] - centers[0]) / 2 : 0.5;
    return Math.abs(centers[i] - x) <= half + 1e-6 ? i : -1;
  };

  /* 표기 */
  OBS.fmtLon = function (x) {
    x = ((x % 360) + 360) % 360;
    if (Math.abs(x - 180) < 0.05) return '180°';
    return x < 180 ? fix(x) + '°E' : fix(360 - x) + '°W';
  };
  OBS.fmtLat = function (y) {
    if (Math.abs(y) < 0.05) return '0°';
    return y > 0 ? fix(y) + '°N' : fix(-y) + '°S';
  };
  function fix(v) { return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1); }
  OBS.fmtMonth = function (ym) { return ym.slice(0, 4) + '년 ' + parseInt(ym.slice(5, 7), 10) + '월'; };
  OBS.sign = function (v, d) { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d); };
  OBS.num = function (v, d) { return (v < 0 ? '−' : '') + Math.abs(v).toFixed(d); };

  /* 풍향(불어오는 방향) 16방위 */
  var DIRS = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
  OBS.windFrom = function (u, v) {
    var deg = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
    return { deg: deg, name: DIRS[Math.round(deg / 22.5) % 16] + '풍' };
  };

  window.OBS = OBS;
})();
