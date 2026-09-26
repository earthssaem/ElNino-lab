/* ENSO 모식 모형
 * 상태 변수 s : -1(무역풍 매우 약함, 강한 엘니뇨) … 0(평상시) … +1(무역풍 매우 강함, 강한 라니냐)
 * 경도는 0~360°E 로 다룬다 (180 = 날짜 변경선, 260 = 100°W).
 * 수치는 관측 기후값(적도 태평양 연평균 단면, 1997/98 엘니뇨, 2010/11 라니냐 등)의
 * 대략적인 크기에 맞춘 교육용 모식값이다.
 */
(function () {
  'use strict';

  var LON_W = 130; // 적도 태평양 서쪽 경계(뉴기니 부근)
  var LON_E = 280; // 적도 태평양 동쪽 경계(에콰도르 해안, 80°W)
  var PROBE_W = 150; // 서태평양 읽기 지점(150°E)
  var PROBE_E = 270; // 동태평양 읽기 지점(90°W)

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  // s<0 이면 평상시→엘니뇨, s>0 이면 평상시→라니냐 쪽으로 보간
  function by(s, nino, normal, nina) { return s < 0 ? lerp(normal, nino, -s) : lerp(normal, nina, s); }
  function piecewise(tbl, x) {
    var xs = tbl[0], ys = tbl[1];
    if (x <= xs[0]) return ys[0];
    for (var i = 1; i < xs.length; i++) {
      if (x <= xs[i]) return lerp(ys[i - 1], ys[i], (x - xs[i - 1]) / (xs[i] - xs[i - 1]));
    }
    return ys[ys.length - 1];
  }

  /* ── 무역풍 ─────────────────────────────── */
  // 평상시 = 1. 엘니뇨 쪽으로 최대 60 % 약화, 라니냐 쪽으로 최대 40 % 강화
  function wind(s) { return s < 0 ? 1 + 0.6 * s : 1 + 0.4 * s; }
  // 용승(에크만 발산)은 바람 응력(∝ 풍속²)에 비례
  function upwelling(s) { var w = wind(s); return w * w; }

  /* ── 표층 수온 ─────────────────────────── */
  // 평상시: 서태평양 약 29.6 °C 난수역, 날짜 변경선 동쪽부터 차가워져 동태평양 약 24 °C
  function sstNormal(lon) {
    var u = clamp((lon - 170) / 105, 0, 1);
    return 29.6 - 5.6 * smooth(Math.pow(u, 0.9));
  }
  // 강한 엘니뇨(s=-1) / 강한 라니냐(s=+1) 때 평상시 대비 표층 수온 편차(°C)
  var ANOM_NINO = [[130, 150, 165, 180, 200, 220, 240, 260, 280], [-0.8, -0.6, 0, 1.0, 2.0, 2.8, 3.4, 3.8, 3.8]];
  var ANOM_NINA = [[130, 150, 165, 180, 200, 220, 240, 260, 280], [0.5, 0.4, 0, -0.8, -1.4, -1.6, -1.5, -1.2, -1.0]];
  function sstAnom(lon, s) {
    return s < 0 ? -s * piecewise(ANOM_NINO, lon) : s * piecewise(ANOM_NINA, lon);
  }
  function sst(lon, s) { return sstNormal(lon) + sstAnom(lon, s); }

  /* ── 수온 약층 ─────────────────────────── */
  // 20 °C 등온선 깊이(m). 서쪽 끝 Dw, 동쪽 끝 De 사이를 관측 모양에 맞춘 곡선으로 잇는다.
  function tiltShape(lon) {
    var u = clamp((lon - 150) / 130, 0, 1);
    return 0.5 * (1 - Math.pow(u, 1.6)) + 0.5 * (1 - smooth(u));
  }
  function iso20(lon, s) {
    var dw = by(s, 115, 165, 190);
    var de = by(s, 100, 35, 15);
    return de + (dw - de) * tiltShape(lon);
  }
  // 혼합층 두께 = 수온 약층이 시작되는 깊이
  function mixedLayer(lon, s) { return 0.5 * iso20(lon, s); }

  // 연직 수온 분포 T(경도, 깊이 z[m])
  function temp(lon, z, s) {
    var S = sst(lon, s), D = iso20(lon, s), M = 0.5 * D;
    if (z <= M) return S;
    if (z <= D) return 20 + (S - 20) * (1 - Math.pow((z - M) / (D - M), 1.4));
    return 6 + 14 * Math.exp(-(z - D) / 120);
  }
  // 한 경도의 연직 구조를 미리 계산해 두고 빠르게 수온을 얻는다 (그림 그릴 때 사용)
  function column(lon, s) {
    var D = iso20(lon, s);
    return { S: sst(lon, s), D: D, M: 0.5 * D };
  }
  function tempAt(c, z) {
    if (z <= c.M) return c.S;
    if (z <= c.D) return 20 + (c.S - 20) * (1 - Math.pow((z - c.M) / (c.D - c.M), 1.4));
    return 6 + 14 * Math.exp(-(z - c.D) / 120);
  }
  // 특정 수온이 나타나는 깊이 (없으면 null)
  function depthOf(lon, T, s, zMax) {
    zMax = zMax || 400;
    if (temp(lon, 0, s) < T) return null;
    if (temp(lon, zMax, s) > T) return null;
    var a = 0, b = zMax;
    for (var i = 0; i < 26; i++) {
      var m = 0.5 * (a + b);
      if (temp(lon, m, s) > T) a = m; else b = m;
    }
    return 0.5 * (a + b);
  }

  /* ── 해수면 ───────────────────────────── */
  // 따뜻한 층이 두꺼운 곳일수록 해수면이 높다: η ≈ (Δρ/ρ)·h, Δρ/ρ ≈ 0.0032
  // 값은 기준면에 대한 높이(cm). 평상시 서(150°E)−동(90°W) 차 ≈ 40 cm
  function seaLevel(lon, s) { return 0.32 * (iso20(lon, s) - 100); }

  /* ── 엘니뇨 감시 구역 수온 편차 (Niño 3.4: 5°S~5°N, 170°W~120°W) ── */
  function nino34(s) {
    var sum = 0, n = 0;
    for (var lon = 190; lon <= 240; lon += 2) { sum += sstAnom(lon, s); n++; }
    return sum / n;
  }
  // 편차 ±0.5 °C 가 기준
  function phase(s) {
    var a = nino34(s);
    return a >= 0.5 ? 'nino' : a <= -0.5 ? 'nina' : 'normal';
  }

  /* ── 대기: 워커 순환 ──────────────────── */
  function walker(s) {
    var rise = s >= 0 ? 140 - 10 * s : 140 + 50 * -s; // 상승 기류(구름·비) 중심 경도
    return {
      rise: rise,
      sinkE: 262,                                  // 동태평양 하강 기류
      sinkW: 118,                                  // 인도네시아·오스트레일리아 북부 하강 기류
      east: by(s, 0.55, 1, 1.45),                  // 동쪽 순환 세기
      west: clamp((rise - 158) / 32, 0, 1) * 0.85, // 엘니뇨 때 생기는 서쪽 순환 세기
      convection: by(s, 0.85, 1, 1.35)             // 상승 기류(구름) 세기
    };
  }

  /* ── 남방진동: 해면 기압 편차(모식, 단위 없음) ── */
  function pressure(s) {
    return { darwin: -1.2 * s, tahiti: 1.2 * s };
  }
  // 남방진동 지수 ∝ 타히티 기압 편차 − 다윈 기압 편차 (양수: 라니냐, 음수: 엘니뇨)
  function soi(s) { var p = pressure(s); return p.tahiti - p.darwin; }

  /* ── 모식 시계열 (실제 관측값이 아님) ─── */
  // 24년 동안의 가상 사건: [정점 시각(년), 세기 s, 지속 폭(년)]
  // 2~7년 간격, 겨울철 정점, 강한 엘니뇨 뒤의 라니냐, 여러 해 이어지는 라니냐를 흉내 냈다.
  var EVENTS = [
    [1.95, -0.55, 0.45], [3.1, 0.45, 0.5],
    [6.95, -1.0, 0.5], [8.1, 0.62, 0.6], [9.05, 0.5, 0.6], [10.0, 0.42, 0.55],
    [13.95, -0.45, 0.45], [16.0, 0.45, 0.55],
    [18.95, -0.92, 0.5], [20.1, 0.55, 0.6], [21.05, 0.42, 0.55],
    [22.95, -0.6, 0.45]
  ];
  var SERIES_YEARS = 24;
  function seriesState(t) {
    var v = 0;
    for (var i = 0; i < EVENTS.length; i++) {
      var e = EVENTS[i], d = (t - e[0]) / e[2];
      v += e[1] * Math.exp(-d * d);
    }
    return clamp(v, -1, 1);
  }
  // 남방진동 지수의 달마다 흔들림(결정적 잡음)
  function seriesSoi(t) {
    var n = 0.22 * Math.sin(t * 37.1) + 0.14 * Math.sin(t * 91.7 + 1.3);
    return soi(seriesState(t)) + n;
  }

  window.ENSO = {
    LON_W: LON_W, LON_E: LON_E, PROBE_W: PROBE_W, PROBE_E: PROBE_E,
    clamp: clamp, lerp: lerp, smooth: smooth,
    wind: wind, upwelling: upwelling,
    sstNormal: sstNormal, sstAnom: sstAnom, sst: sst,
    iso20: iso20, mixedLayer: mixedLayer, temp: temp, depthOf: depthOf,
    column: column, tempAt: tempAt,
    seaLevel: seaLevel, nino34: nino34, phase: phase,
    walker: walker, pressure: pressure, soi: soi,
    SERIES_YEARS: SERIES_YEARS, seriesState: seriesState, seriesSoi: seriesSoi
  };
})();
