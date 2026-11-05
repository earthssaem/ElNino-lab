"""개념 시뮬레이터(루트 웹앱)를 실측 자료에 맞추는 보정 자료를 만든다 → js/obs-calib.js

입력
- observatory/data/*.json : build_web.py 가 ERSST v5·GODAS·NCEP/NCAR R1·GPCP v2.3 으로 만든 자료(평년값·사례 연도·월별 시계열)
- NOAA CPC 남방진동 지수(표준화)와 다윈·타히티 해면 기압(원자료)
    https://www.cpc.ncep.noaa.gov/data/indices/soi
    https://www.cpc.ncep.noaa.gov/data/indices/darwin
    https://www.cpc.ncep.noaa.gov/data/indices/tahiti

만드는 값
- 평상시 = 1991~2020 연평균(같은 달 평년값 12개의 평균)
- 엘니뇨(s = −1) = 실측자료 탐구실 엘니뇨 사례 3개(1997~98, 2015~16, 2023~24)의 정점 달(focus) 앞뒤 1개월(3개월) 평균 편차를
  사례마다 구한 뒤 사례끼리 평균한 합성 편차
- 라니냐(s = +1) = 라니냐 사례 2개(1998~2001, 2020~23)의 같은 방식 합성 편차
- 적도 단면(GODAS 2°S~2°N 평균) 130~280°E 2° 간격·0~366 m, 적도 표층 수온(ERSST 2°S~2°N), 적도 10 m 동서 바람(R1 5°S~5°N),
  강수(GPCP 5°S~5°N)로 정한 비가 많이 내리는 곳의 중심 경도, 무역풍 세기 비율, 기압 편차
- ③ 남방진동 그래프용 1991~2024 월별 Niño 3.4 편차·남방진동 지수·다윈·타히티 기압 편차·NOAA 공식 판정,
  ① 실제 바람 재생용 서·중앙 태평양(135°E~140°W) 10 m 동서 바람 편차

값을 만들어 넣거나 결측을 채우지 않는다. 단면의 쓰는 구간에 결측이 있으면 멈춘다.
"""
import json
import os

import numpy as np

import common as C

DATA = C.OUT
JS = os.path.join(os.path.dirname(C.ROOT), 'js', 'obs-calib.js')
CPC = 'https://www.cpc.ncep.noaa.gov/data/indices/'

SEC_LON = np.arange(130.5, 280.0, 2.0)     # 단면 경도(GODAS 격자 중심 x.5°)
SEC_ZMAX = 370.0                           # 그림은 300 m까지, 보간을 위해 그 아래 층 하나 더
BAND_SST = (-2.0, 2.0)
BAND_ATM = (-5.0, 5.0)


def load(name):
    with open(os.path.join(DATA, name), encoding='utf-8') as f:
        return json.load(f)


meta, clim, series = load('meta.json'), load('clim.json'), load('series.json')
G, SC = meta['grids'], meta['scale']
VAR_SC = {'sst': SC['sst'], 'precip': SC['precip'], 'u': SC['wind'], 'v': SC['wind'], 'section': SC['section']}
_years = {}


def arr(a, scale):
    return np.array([np.nan if v is None else v * scale for v in a], dtype='f8')


def value(var, ym):
    y = int(ym[:4])
    if y not in _years:
        _years[y] = load('year-%d.json' % y)
    return arr(_years[y][var][int(ym[5:7]) - 1], VAR_SC[var])


def clim_month(var, m):
    return arr(clim[var][m], VAR_SC[var])


def clim_annual(var):
    return np.mean([clim_month(var, m) for m in range(12)], axis=0)   # 평년값 결측 칸은 결측으로 남음


def shift(ym, k):
    y, m = int(ym[:4]), int(ym[5:7]) - 1 + k
    return '%04d-%02d' % (y + m // 12, m % 12 + 1)


def cases(phase):
    return [c for c in meta['cases'] if c['phase'] == phase]


def composite(var, phase):
    """사례마다 focus 앞뒤 1개월 평균 편차 → 사례 평균"""
    per = []
    for c in cases(phase):
        a = [value(var, shift(c['focus'], k)) - clim_month(var, int(shift(c['focus'], k)[5:7]) - 1) for k in (-1, 0, 1)]
        per.append(np.mean(a, axis=0))
    return np.mean(per, axis=0)


def band_profile(field, grid, band, lons):
    """위도 띠 cos 가중 평균(값이 있는 바다 격자만, 단면과 같은 규칙) → 경도 lons 에서 선형 보간"""
    lat, lon = np.array(G[grid]['lat']), np.array(G[grid]['lon'])
    f = field.reshape(len(lat), len(lon))
    sel = (lat >= band[0] - 1e-6) & (lat <= band[1] + 1e-6)
    sub = f[sel]
    w = np.cos(np.deg2rad(lat[sel]))[:, None] * np.isfinite(sub)
    with np.errstate(invalid='ignore'):
        prof = (np.where(np.isfinite(sub), sub, 0) * w).sum(axis=0) / w.sum(axis=0)
    out = np.interp(lons, lon, prof)
    if not np.all(np.isfinite(out)):
        raise SystemExit('%s 띠 평균에 쓸 바다 격자가 없는 경도가 있습니다' % grid)
    return out


def section_grid(field):
    sg = G['section']
    lon, dep = np.array(sg['lon']), np.array(sg['depth'])
    f = field.reshape(len(dep), len(lon))
    zi = dep <= SEC_ZMAX
    cols = [int(np.argmin(np.abs(lon - x))) for x in SEC_LON]
    out = f[zi][:, cols]
    if not np.all(np.isfinite(out)):
        raise SystemExit('단면 쓰는 구간(130~280°E, 0~%d m)에 결측이 있습니다' % SEC_ZMAX)
    return dep[zi], out


def rain_center(p, lons):
    """월 100 mm 넘는 강수의 무게 중심 경도(비가 많이 내리는 곳의 중심)"""
    w = np.clip(p - 100.0, 0, None)
    return float((w * lons).sum() / w.sum())


def read_cpc(name, block):
    """CPC 지수 파일의 block 번째 표(0부터) → {YYYY-MM: 값}"""
    path = C.download(CPC + name, os.path.join(C.RAW, 'cpc', name + '.txt'))
    out, k, seen = {}, -1, False
    for line in open(path, encoding='latin-1'):
        if line.startswith('YEAR'):
            k += 1
            continue
        if k != block or len(line) < 10 or not line[:4].isdigit():
            continue
        y = int(line[:4])
        vals = [line[4 + 6 * i: 10 + 6 * i] for i in range(12)]
        for m, v in enumerate(vals):
            v = v.strip()
            if v and float(v) > -999:
                out['%d-%02d' % (y, m + 1)] = float(v)
        seen = True
    if not seen:
        raise SystemExit(name + ' 표를 읽지 못했습니다')
    return out


def anomaly_monthly(rec, months):
    """1991~2020 같은 달 평균을 뺀 편차(자료가 있는 달만)"""
    climm = {}
    for m in range(1, 13):
        v = [rec[ym] for ym in rec if ym[5:] == '%02d' % m and 1991 <= int(ym[:4]) <= 2020]
        if len(v) < C.MIN_CLIM_YEARS:
            raise SystemExit('기압 평년값을 만들 자료가 모자랍니다')
        climm[m] = float(np.mean(v))
    return [None if ym not in rec else round(rec[ym] - climm[int(ym[5:])], 2) for ym in months]


def comp_series(vals, months, phase):
    per = []
    for c in cases(phase):
        v = [vals[months.index(shift(c['focus'], k))] for k in (-1, 0, 1)]
        per.append(np.mean(v))
    return float(np.mean(per))


def r(a, nd=2):
    a = np.asarray(a, dtype='f8')
    return [round(float(x), nd) for x in a.ravel()] if a.ndim else round(float(a), nd)


def main():
    months = series['months']
    lon_sec = SEC_LON
    dep, T0 = section_grid(clim_annual('section'))
    _, dTn = section_grid(composite('section', 'nino'))
    _, dTl = section_grid(composite('section', 'nina'))

    lon1 = np.arange(130.0, 281.0, 2.0)
    sst0 = band_profile(clim_annual('sst'), 'sst', BAND_SST, lon1)
    sstN = band_profile(composite('sst', 'nino'), 'sst', BAND_SST, lon1)
    sstL = band_profile(composite('sst', 'nina'), 'sst', BAND_SST, lon1)
    u0 = band_profile(clim_annual('u'), 'wind', BAND_ATM, lon1)
    uN = band_profile(composite('u', 'nino'), 'wind', BAND_ATM, lon1)
    uL = band_profile(composite('u', 'nina'), 'wind', BAND_ATM, lon1)
    lonP = np.arange(130.0, 281.0, 2.5)
    p0 = band_profile(clim_annual('precip'), 'precip', BAND_ATM, lonP)
    pN = p0 + band_profile(composite('precip', 'nino'), 'precip', BAND_ATM, lonP)
    pL = p0 + band_profile(composite('precip', 'nina'), 'precip', BAND_ATM, lonP)

    # 무역풍: 서·중앙 태평양(135°E~140°W) 10 m 동서 바람(series.json 의 지역 평균)
    W = series['wind']
    wv = np.array([(a + b) / 2 for a, b in zip(W['west']['value'], W['central']['value'])])
    wa = np.array([(a + b) / 2 for a, b in zip(W['west']['anom'], W['central']['anom'])])
    base = [i for i, m in enumerate(months) if 1991 <= int(m[:4]) <= 2020]
    U0 = float(np.mean(wv[base] - wa[base]))       # 평년 바람(음수 = 동풍)
    duN, duL = comp_series(list(wa), months, 'nino'), comp_series(list(wa), months, 'nina')

    n34 = series['nino34']['anom']
    soi = read_cpc('soi', 1)            # 두 번째 표: 표준화한 남방진동 지수
    darwin = anomaly_monthly(read_cpc('darwin', 0), months)
    tahiti = anomaly_monthly(read_cpc('tahiti', 0), months)
    soi_m = [soi.get(m) for m in months]

    obs = {
        'source': 'pipeline/build_sim.py — ERSST v5·GODAS·NCEP/NCAR R1·GPCP v2.3(observatory/data), NOAA CPC SOI·다윈·타히티 기압',
        'cases': [{'id': c['id'], 'phase': c['phase'], 'name': c['name'], 'start': c['start'], 'end': c['end'], 'focus': c['focus']}
                  for c in meta['cases']],
        'section': {'lon': r(lon_sec, 1), 'depth': r(dep, 1), 'T0': r(T0), 'dNino': r(dTn), 'dNina': r(dTl)},
        'sst': {'lon': r(lon1, 1), 'T0': r(sst0), 'dNino': r(sstN), 'dNina': r(sstL)},
        'u': {'lon': r(lon1, 1), 'u0': r(u0), 'dNino': r(uN), 'dNina': r(uL)},
        'trade': {'region': '5°S~5°N, 135°E~140°W', 'u0': r(U0), 'dNino': r(duN), 'dNina': r(duL)},
        'nino34': {'nino': r(comp_series(n34, months, 'nino')), 'nina': r(comp_series(n34, months, 'nina'))},
        'rain': {'center0': r(rain_center(p0, lonP), 1), 'centerNino': r(rain_center(pN, lonP), 1),
                 'centerNina': r(rain_center(pL, lonP), 1),
                 'peak0': r(p0.max(), 0), 'peakNino': r(pN.max(), 0), 'peakNina': r(pL.max(), 0)},
        'pressure': {'darwinNino': r(comp_series(darwin, months, 'nino')), 'darwinNina': r(comp_series(darwin, months, 'nina')),
                     'tahitiNino': r(comp_series(tahiti, months, 'nino')), 'tahitiNina': r(comp_series(tahiti, months, 'nina')),
                     'soiNino': r(comp_series(soi_m, months, 'nino')), 'soiNina': r(comp_series(soi_m, months, 'nina'))},
        'monthly': {'start': months[0], 'nino34': n34, 'soi': soi_m, 'darwin': darwin, 'tahiti': tahiti,
                    'state': series['enso']['roni_state'], 'windAnom': r(wa)}
    }
    os.makedirs(os.path.dirname(JS), exist_ok=True)
    with open(JS, 'w', encoding='utf-8') as f:
        f.write('/* 자동 생성 파일: pipeline/build_sim.py 가 실측 자료로 만든다. 직접 고치지 말고 스크립트를 다시 돌린다.\n'
                ' * 개념 시뮬레이터(model.js)가 평상시·엘니뇨·라니냐의 수온 단면, 표층 수온, 바람, 강수, 기압을 이 값에 맞춘다. */\n')
        f.write('window.ENSO_OBS = ')
        json.dump(obs, f, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
        f.write(';\n')
    print('  저장:', os.path.relpath(JS, os.path.dirname(C.ROOT)), '%.0f KB' % (os.path.getsize(JS) / 1024))
    print('  Niño 3.4 합성: 엘니뇨 %+.2f, 라니냐 %+.2f °C' % (obs['nino34']['nino'], obs['nino34']['nina']))
    print('  무역풍(서·중앙): 평년 %.2f m/s, 엘니뇨 %+.2f, 라니냐 %+.2f' % (U0, duN, duL))
    print('  비 중심: 평상시 %.0f, 엘니뇨 %.0f, 라니냐 %.0f °E' % (obs['rain']['center0'], obs['rain']['centerNino'], obs['rain']['centerNina']))
    print('  기압 편차(엘니뇨): 다윈 %+.2f, 타히티 %+.2f hPa, SOI %+.2f' % (obs['pressure']['darwinNino'], obs['pressure']['tahitiNino'], obs['pressure']['soiNino']))
    print('  기압 편차(라니냐): 다윈 %+.2f, 타히티 %+.2f hPa, SOI %+.2f' % (obs['pressure']['darwinNina'], obs['pressure']['tahitiNina'], obs['pressure']['soiNina']))


if __name__ == '__main__':
    main()
