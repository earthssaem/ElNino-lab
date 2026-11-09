/* ENSO 모형 — 실측 자료로 맞춘 평상시·엘니뇨·라니냐 사이를 상태 s 로 잇는다
 * 상태 s : −1(엘니뇨 사례 3개 합성) … 0(1991~2020 평년) … +1(라니냐 사례 2개 합성)
 *   s 사이 값은 평년값에 합성 편차를 |s| 만큼 더한다(선형). 합성 편차·평년값은 js/obs-calib.js(window.ENSO_OBS,
 *   pipeline/build_sim.py 가 ERSST v5·GODAS·NCEP/NCAR R1·GPCP v2.3·NOAA CPC 기압으로 만든 값)에서 읽는다.
 * s 는 숫자(바다 전체가 같은 상태) 또는 경도마다 상태가 다른 객체 {w, h(lon), t(lon), mean, key}다.
 *   w: 무역풍 상태, h(lon): 수온 약층(아래쪽 수온) 상태, t(lon): 표층 수온 상태, mean: 대기가 느끼는 평균 상태.
 *   ① 의 시간 변화(Ocean)가 이 객체를 만든다.
 * 경도는 0~360°E 로 다룬다 (180 = 날짜 변경선, 260 = 100°W).
 */
(function () {
  'use strict';
  var O = window.ENSO_OBS;

  var LON_W = 130; // 적도 태평양 서쪽 경계(뉴기니 부근)
  var LON_E = 280; // 적도 태평양 동쪽 경계(에콰도르 해안, 80°W)
  var PROBE_W = 150; // 서태평양 읽기 지점(150°E)
  var PROBE_E = 270; // 동태평양 읽기 지점(90°W)

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  // s<0 이면 평상시→엘니뇨, s>0 이면 평상시→라니냐 쪽으로 보간
  function by(s, nino, normal, nina) { return s < 0 ? lerp(normal, nino, -s) : lerp(normal, nina, s); }
  // 합성 편차 섞기: s<0 은 엘니뇨 편차 × |s|, s>0 은 라니냐 편차 × s
  function blend(s, dNino, dNina) { return s < 0 ? -s * dNino : s * dNina; }

  /* ── 상태 꺼내기 ─────────────────────── */
  function isNum(s) { return typeof s === 'number'; }
  function sH(s, lon) { return isNum(s) ? s : s.h(lon); }
  function sT(s, lon) { return isNum(s) ? s : s.t(lon); }
  function sW(s) { return isNum(s) ? s : s.w; }
  function sMean(s) { return isNum(s) ? s : s.mean; }
  function skey(s) { return isNum(s) ? s.toFixed(3) : s.key; }
  // 평상시와 거의 같은 상태인지(평상시 비교선을 그릴지 정할 때)
  function near0(s) { return isNum(s) ? Math.abs(s) < 0.03 : s.dev < 0.03; }

  // 등간격 경도 표에서 선형 보간 (끝 밖은 끝값)
  function table(lons, vals) {
    var x0 = lons[0], dx = lons[1] - lons[0], n = lons.length;
    return function (lon) {
      var f = clamp((lon - x0) / dx, 0, n - 1), i = Math.min(n - 2, Math.floor(f));
      return lerp(vals[i], vals[i + 1], f - i);
    };
  }

  /* ── 무역풍 ─────────────────────────────── */
  // 서·중앙 태평양(5°S~5°N, 135°E~140°W) 10 m 동서 바람의 평년 대비 세기. 평상시 = 1
  var TR = O.trade, K_NINO = TR.dNino / -TR.u0, K_NINA = -TR.dNina / -TR.u0;
  function wind(s) { var w = sW(s); return w < 0 ? 1 + K_NINO * w : 1 + K_NINA * w; }
  // 용승(에크만 발산)은 바람 응력(∝ 풍속²)에 비례
  function upwelling(s) { var w = wind(s); return w * w; }
  // 경도별 무역풍(동풍) 세기 m/s (적도 5°S~5°N R1 평년 + 합성 편차). 음수면 서풍
  var U0 = table(O.u.lon, O.u.u0), UN = table(O.u.lon, O.u.dNino), UL = table(O.u.lon, O.u.dNina);
  function windAt(lon, s) { return -(U0(lon) + blend(sW(s), UN(lon), UL(lon))); }
  function windFromRatio(r) { return r < 1 ? (r - 1) / K_NINO : (r - 1) / K_NINA; }

  /* ── 표층 수온 (ERSST v5, 2°S~2°N) ─────── */
  var SST0 = table(O.sst.lon, O.sst.T0), SSTN = table(O.sst.lon, O.sst.dNino), SSTL = table(O.sst.lon, O.sst.dNina);
  function sstNormal(lon) { return SST0(lon); }
  function sstAnom(lon, s) { return blend(sT(s, lon), SSTN(lon), SSTL(lon)); }
  function sst(lon, s) { return SST0(lon) + sstAnom(lon, s); }

  /* ── 적도 수온 단면 (GODAS, 2°S~2°N 평균) ── */
  var RAW = O.section, ZK = RAW.depth, NZ = ZK.length, NX = RAW.lon.length;
  var X0 = RAW.lon[0], DX = RAW.lon[1] - RAW.lon[0];
  /* 개념 시뮬레이션용 매끄러운 수온장: 실측 단면(평년·합성 편차)을 깊이마다 경도 방향으로 가우스 평활화(σ = SMOOTH_LON°)한다.
     평활화는 선형이라 평상시·엘니뇨·라니냐와 그 사이 상태가 같은 방식으로 다듬어지고, 색과 등온선·20 °C 깊이·혼합층이
     모두 이 수온장 하나에서 계산되어 서로 맞는다. 깊이 방향은 다듬지 않는다(수온 약층의 날카로움 유지). 실측 원값은 E.RAW_SECTION */
  var SMOOTH_LON = 8;
  function smoothLon(a, sig) {
    var r = Math.ceil(sig * 2.5 / DX), w = [], out = new Array(a.length), k, i, j;
    for (j = -r; j <= r; j++) w.push(Math.exp(-0.5 * Math.pow(j * DX / sig, 2)));
    for (k = 0; k < NZ; k++) {
      for (i = 0; i < NX; i++) {
        var s = 0, ws = 0;
        for (j = -r; j <= r; j++) {
          var ii = i + j;
          if (ii < 0 || ii >= NX) continue;   // 끝에서는 안쪽 값만으로 (가중치를 다시 나눔)
          s += a[k * NX + ii] * w[j + r]; ws += w[j + r];
        }
        out[k * NX + i] = s / ws;
      }
    }
    return out;
  }
  var SEC = SMOOTH_LON > 0 ? { T0: smoothLon(RAW.T0, SMOOTH_LON), dNino: smoothLon(RAW.dNino, SMOOTH_LON), dNina: smoothLon(RAW.dNina, SMOOTH_LON) } : RAW;
  // 깊이에 따라 표층 상태(t)와 아래쪽 상태(h)를 섞는 비율: 표층 0 → 60 m 아래 1
  var WZ = ZK.map(function (z) { return smooth((z - 5) / 55); });
  // 같은 상태·같은 경도(0.25° 단위)의 연직 수온은 한 번만 계산한다(그림 한 장에 수천 번 부름)
  var colCache = new Map();
  function column(lon, s) {
    var q = Math.round(lon * 4), m;
    if (isNum(s)) {
      var k = s.toFixed(4);
      m = colCache.get(k);
      if (!m) {
        if (colCache.size > 8) colCache.delete(colCache.keys().next().value);
        colCache.set(k, (m = {}));
      }
    } else m = s._cc || (s._cc = {});
    return m[q] || (m[q] = columnAt(q / 4, s));
  }
  function columnAt(lon, s) {
    var f = clamp((lon - X0) / DX, 0, NX - 1), i = Math.min(NX - 2, Math.floor(f)), a = f - i;
    var h = sH(s, lon), t = sT(s, lon), P = new Array(NZ);
    for (var k = 0; k < NZ; k++) {
      var j = k * NX + i;
      var T0 = lerp(SEC.T0[j], SEC.T0[j + 1], a);
      var dn = lerp(SEC.dNino[j], SEC.dNino[j + 1], a), dl = lerp(SEC.dNina[j], SEC.dNina[j + 1], a);
      P[k] = T0 + (1 - WZ[k]) * blend(t, dn, dl) + WZ[k] * blend(h, dn, dl);
      // 정적 안정: 시간 변화 중 아래쪽(h)이 표층(t)보다 먼저 데워질 때 위층보다 따뜻한 물이 생기지 않게 한다
      // (평상시·엘니뇨·라니냐처럼 바다 전체가 같은 상태면 평활화한 수온장에 역전이 없어 아무것도 바뀌지 않음)
      if (k && P[k] > P[k - 1]) P[k] = P[k - 1];
    }
    var D = cross(P, 20), M = cross(P, P[0] - 0.5);
    return { S: sst(lon, s), P: P, D: D == null ? ZK[NZ - 1] : D, M: M == null ? ZK[NZ - 1] : Math.max(M, 4), D15: cross(P, 15) || ZK[NZ - 1] };
  }
  // 위에서 내려가며 처음 T 보다 낮아지는 깊이(선형 보간). 없으면 null
  function cross(P, T) {
    if (P[0] < T) return 0;
    for (var k = 0; k < NZ - 1; k++) {
      if (P[k] >= T && P[k + 1] < T) return ZK[k] + (P[k] - T) / (P[k] - P[k + 1]) * (ZK[k + 1] - ZK[k]);
    }
    return null;
  }
  function tempAt(c, z) {
    if (z <= ZK[0]) return c.P[0];
    for (var k = 0; k < NZ - 1; k++) {
      if (z <= ZK[k + 1]) return lerp(c.P[k], c.P[k + 1], (z - ZK[k]) / (ZK[k + 1] - ZK[k]));
    }
    return c.P[NZ - 1];
  }
  function temp(lon, z, s) { return tempAt(column(lon, s), z); }
  // 20 °C 등온선 깊이(m) = 수온 약층의 대표 깊이
  function iso20(lon, s) { return column(lon, s).D; }
  // 혼합층 두께 = 수온 약층이 시작되는 깊이 (표층보다 0.5 °C 낮아지는 깊이)
  function mixedLayer(lon, s) { return column(lon, s).M; }
  // 특정 수온이 나타나는 깊이 (없으면 null)
  function depthOf(lon, T, s, zMax) {
    var c = column(lon, s), z = cross(c.P, T);
    return z == null || z > (zMax || 400) ? null : z;
  }

  /* ── 해수면 ───────────────────────────── */
  // 따뜻한 층이 두꺼운 곳일수록 해수면이 높다: η ≈ (Δρ/ρ)·h, Δρ/ρ ≈ 0.0032
  // 값은 기준면에 대한 높이(cm). 평상시 서(150°E)−동(90°W) 차 ≈ 45 cm (실측 해수면 높이 차와 비슷한 크기)
  function seaLevel(lon, s) { return 0.32 * (iso20(lon, s) - 100); }

  /* ── 엘니뇨 감시 구역 수온 편차 (Niño 3.4: 5°S~5°N, 170°W~120°W) ── */
  // 실측 합성값(엘니뇨 +2.3 °C, 라니냐 −1.3 °C)에 맞춘다. 경도마다 상태가 다르면 170°W~120°W 의 표층 상태를 평균
  var N34 = O.nino34;
  function nino34(s) {
    if (isNum(s)) return blend(s, N34.nino, N34.nina);
    var sum = 0, n = 0;
    for (var lon = 190; lon <= 240; lon += 2) { sum += blend(s.t(lon), N34.nino, N34.nina); n++; }
    return sum / n;
  }
  // 편차 ±0.5 °C 가 기준
  function phase(s) {
    var a = nino34(s);
    return a >= 0.5 ? 'nino' : a <= -0.5 ? 'nina' : 'normal';
  }
  // Niño 3.4 편차 → 같은 편차를 내는 s
  function stateFromNino34(a) { return clamp(a >= 0 ? -a / N34.nino : a / N34.nina, -1, 1); }

  /* ── 대기: 워커 순환 ──────────────────── */
  // 비가 많이 내리는 곳의 중심 경도와 세기는 GPCP 강수 합성에서
  var RAIN = O.rain;
  function walker(s) {
    var m = sMean(s);
    var rise = by(m, RAIN.centerNino, RAIN.center0, RAIN.centerNina); // 상승 기류(구름·비) 중심 경도
    return {
      rise: rise,
      sinkE: 262,                                  // 동태평양 하강 기류
      sinkW: 118,                                  // 인도네시아·오스트레일리아 북부 하강 기류
      east: by(m, 0.55, 1, 1.45),                  // 동쪽 순환 세기
      west: clamp((rise - 166) / 24, 0, 1) * 0.85, // 엘니뇨 때 생기는 서쪽 순환 세기
      convection: by(m, RAIN.peakNino / RAIN.peak0, 1, RAIN.peakNina / RAIN.peak0) // 상승 기류(구름) 세기
    };
  }

  // 경도별 실제 강수(GPCP, 5°S~5°N, 월 mm): 평상시 + 합성 편차를 상태 m 에 맞춰 섞는다(walker 와 같은 '대기가 느끼는 바다 상태')
  var RF0 = table(RAIN.lon, RAIN.p0), RFN = table(RAIN.lon, RAIN.pNino), RFL = table(RAIN.lon, RAIN.pNina);
  function rainAt(lon, s) { var m = sMean(s); return by(m, RFN(lon), RF0(lon), RFL(lon)); }
  // 비가 많이 오는 띠의 동쪽 끝: 상승 기류 중심에서 동쪽으로, 강수가 평상시 최대의 frac(기본 75 %) 이상인 곳까지
  function rainBandEast(s, frac) {
    var thr = RAIN.peak0 * (frac || 0.75), lon = walker(s).rise;
    while (lon < LON_E && rainAt(lon + 1, s) >= thr) lon += 1;
    return lon;
  }

  /* ── 남방진동: 다윈·타히티 해면 기압 편차(hPa, 1991~2020 평년 대비 실측 합성) ── */
  var PR = O.pressure;
  function pressure(s) {
    var m = sMean(s);
    return { darwin: blend(m, PR.darwinNino, PR.darwinNina), tahiti: blend(m, PR.tahitiNino, PR.tahitiNina) };
  }
  // 남방진동 지수(표준화, NOAA CPC) 실측 합성 (양수: 라니냐, 음수: 엘니뇨)
  function soi(s) { return blend(sMean(s), PR.soiNino, PR.soiNina); }

  /* ── 시간에 따라 변하는 바다 ───────────────
   * 무역풍이 바뀌면 바다는 곧바로 바뀌지 않는다. 바람이 가장 크게 바뀌는 날짜 변경선 서쪽(175°E)에서 시작한 수온 약층의 변화가
   * 동쪽으로는 빠르게(약 60°/월 ≈ 2.6 m/s, 적도 켈빈파), 서쪽으로는 느리게(약 20°/월, 로스비파) 퍼지고,
   * 표층 수온은 수온 약층을 약 1개월 늦게 따라간다. 시간 단위는 '달'.
   * 실제 1991~2024 무역풍으로 돌리면 감시 구역 수온 편차가 실측과 상관 0.8 정도로 맞는다(pipeline/build_sim.py 와 README).
   */
  var OC = { src: 175, cEast: 60, cWest: 20, tauH: 0.7, tauT: 1.0 };
  var GL = []; for (var g = LON_W; g <= LON_E + 0.01; g += 2) GL.push(g);
  function Ocean(s0) {
    this.h = GL.map(function () { return s0 || 0; });
    this.t = this.h.slice();
    this.delay = GL.map(function (lon) { return lon >= OC.src ? (lon - OC.src) / OC.cEast : (OC.src - lon) / OC.cWest; });
    this.time = 0;
    this.hist = [[-12, s0 || 0], [0, s0 || 0]];
    this.w = s0 || 0;
    this.change = { t: -99, from: this.w, to: this.w };
    this.moved = -99;   // 바람이 마지막으로 바뀐 시각
  }
  Ocean.prototype.reset = function (s0) { Ocean.call(this, s0); };
  // 시각 t 의 바람 상태(기록에서 선형 보간)
  Ocean.prototype.windAt = function (t) {
    var H = this.hist;
    if (t <= H[0][0]) return H[0][1];
    for (var i = H.length - 1; i > 0; i--) {
      if (t >= H[i - 1][0]) {
        var a = H[i - 1], b = H[i];
        return b[0] === a[0] ? b[1] : lerp(a[1], b[1], clamp((t - a[0]) / (b[0] - a[0]), 0, 1));
      }
    }
    return H[H.length - 1][1];
  };
  // dt 달만큼 나아간다. w = 지금 무역풍 상태
  Ocean.prototype.step = function (dt, w) {
    if (dt <= 0) return;
    // 바람이 반달 넘게 그대로 있다가 다시 바뀌기 시작하면 새 변화의 시작
    if (Math.abs(w - this.w) > 1e-4) {
      if (this.time - this.moved > 0.5) this.change = { t: this.time, from: this.w, to: w };
      else this.change.to = w;
      this.moved = this.time + dt;
    }
    var n = Math.max(1, Math.ceil(dt / 0.05)), d = dt / n;
    for (var k = 0; k < n; k++) {
      this.time += d;
      this.w = lerp(this.w, w, (k + 1) / n);
      this.hist.push([this.time, this.w]);
      var aH = Math.min(1, d / OC.tauH), aT = Math.min(1, d / OC.tauT);
      for (var i = 0; i < GL.length; i++) {
        this.h[i] += (this.windAt(this.time - this.delay[i]) - this.h[i]) * aH;
        this.t[i] += (this.h[i] - this.t[i]) * aT;
      }
    }
    var keep = this.time - 8;
    while (this.hist.length > 2 && this.hist[1][0] < keep) this.hist.shift();
  };
  // 바람과 바다가 모두 자리를 잡았는지
  Ocean.prototype.settled = function () {
    for (var i = 0; i < GL.length; i++) if (Math.abs(this.t[i] - this.w) > 0.01 || Math.abs(this.h[i] - this.w) > 0.01) return false;
    return true;
  };
  // 수온 약층 변화가 퍼져 나간 앞머리 경도 [서쪽, 동쪽] (변화가 없거나 다 퍼졌으면 null)
  Ocean.prototype.fronts = function () {
    var c = this.change, el = this.time - c.t;
    if (Math.abs(c.to - c.from) < 0.12 || el < 0) return null;
    var e = OC.src + OC.cEast * el, w = OC.src - OC.cWest * el;
    return { east: e <= LON_E ? e : null, west: w >= LON_W ? w : null, warm: c.to < c.from, elapsed: el };
  };
  // 지금 바다 상태 → 모형 함수에 넘기는 상태 객체
  Ocean.prototype.state = function () {
    var h = this.h.slice(), t = this.t.slice(), w = this.w;
    var fh = table(GL, h), ft = table(GL, t), sum = 0, n = 0, dev = Math.abs(w), q = [];
    for (var i = 0; i < GL.length; i++) {
      if (GL[i] >= 160 && GL[i] <= 240) { sum += t[i]; n++; }
      dev = Math.max(dev, Math.abs(h[i]), Math.abs(t[i]));
      q.push(Math.round(h[i] * 300), Math.round(t[i] * 300));
    }
    return { w: w, h: fh, t: ft, mean: sum / n, dev: dev, key: 'o' + Math.round(w * 300) + ':' + q.join(',') };
  };

  window.ENSO = {
    LON_W: LON_W, LON_E: LON_E, PROBE_W: PROBE_W, PROBE_E: PROBE_E,
    clamp: clamp, lerp: lerp, smooth: smooth,
    sW: sW, sMean: sMean, skey: skey, near0: near0,
    wind: wind, upwelling: upwelling, windAt: windAt, windFromRatio: windFromRatio,
    sstNormal: sstNormal, sstAnom: sstAnom, sst: sst,
    iso20: iso20, mixedLayer: mixedLayer, temp: temp, depthOf: depthOf,
    column: column, tempAt: tempAt,
    seaLevel: seaLevel, nino34: nino34, phase: phase, stateFromNino34: stateFromNino34,
    walker: walker, rainAt: rainAt, rainBandEast: rainBandEast, ENSO_RAIN_PEAK0: RAIN.peak0, pressure: pressure, soi: soi,
    Ocean: Ocean, OBS: O, RAW_SECTION: RAW, SMOOTH_LON: SMOOTH_LON
  };
})();
