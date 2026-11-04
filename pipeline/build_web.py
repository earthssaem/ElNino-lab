"""중간 자료(work/*.npz) → 웹앱이 읽는 정적 자료(observatory/data/*.json).

- 실제 값과 1991~2020년 월별 평년값을 정수(scale 단위)로 저장하고, 편차는 웹앱이 '실제 값 − 같은 달 평년값'으로 계산한다.
- 결측은 null. 값을 만들어 넣지 않는다.
- 사례 기간(앞뒤 해 포함)이 걸친 해의 월별 지도·단면 자료를 연도별 파일(year-YYYY.json)로 싣는다.
  사례끼리 기간이 겹쳐도 같은 달은 한 번만 저장한다. 시계열은 1991~2024 전체를 싣는다.
- 각 사례에는 NOAA CPC 공식 판정(RONI, 참고 ONI v5)으로 구한 실제 발생 기간을 함께 적는다.
"""
import datetime

import numpy as np

import common as C

SCALE = {'sst': 0.01, 'precip': 0.1, 'wind': 0.01, 'section': 0.01}


def anomalies(x, t):
    cl = C.climatology(x, t)
    return x - np.array([cl[int(m[5:7]) - 1] for m in t]), cl


def r(a, nd=2):
    return [None if not np.isfinite(v) else round(float(v), nd) for v in np.asarray(a, dtype='f8').ravel()]


def main():
    sst, pr, wd, gd = C.load_work('ersst'), C.load_work('gpcp'), C.load_work('wind'), C.load_work('godas')
    t = list(sst['time'])
    for d in (pr, wd, gd):
        assert list(d['time']) == t, '자료마다 월 목록이 다릅니다'

    clim = {
        'sst': C.climatology(sst['sst'], t), 'precip': C.climatology(pr['precip'], t),
        'u': C.climatology(wd['u'], t), 'v': C.climatology(wd['v'], t),
        'section': C.climatology(gd['section'], t),
    }
    C.write_json('clim.json', {
        'note': '1991~2020년 같은 달 평균(직접 계산). 결측은 null. 값 × scale = 실제 단위',
        'sst': [C.ints(clim['sst'][m], SCALE['sst']) for m in range(12)],
        'precip': [C.ints(clim['precip'][m], SCALE['precip']) for m in range(12)],
        'u': [C.ints(clim['u'][m], SCALE['wind']) for m in range(12)],
        'v': [C.ints(clim['v'][m], SCALE['wind']) for m in range(12)],
        'section': [C.ints(clim['section'][m], SCALE['section']) for m in range(12)],
    })

    # 월별 자료는 연도별 파일로 저장한다(사례 기간이 겹쳐도 같은 달을 두 번 저장하지 않음)
    oc = gd['ocean_count'].ravel()
    for y in C.case_years():
        ms = ['%d-%02d' % (y, m) for m in range(1, 13)]
        idx = [t.index(m) for m in ms]
        cdiff = []          # 평균에 쓴 격자 수가 해양 격자 수와 다른 칸(원자료 결측)만 [칸 번호, 격자 수]로
        for i in idx:
            cn = gd['count'][i].ravel()
            cdiff.append([[int(k), int(cn[k])] for k in np.where(cn != oc)[0]])
        C.write_json('year-%d.json' % y, {
            'year': y, 'months': ms,
            'sst': [C.ints(sst['sst'][i], SCALE['sst']) for i in idx],
            'precip': [C.ints(pr['precip'][i], SCALE['precip']) for i in idx],
            'u': [C.ints(wd['u'][i], SCALE['wind']) for i in idx],
            'v': [C.ints(wd['v'][i], SCALE['wind']) for i in idx],
            'section': [C.ints(gd['section'][i], SCALE['section']) for i in idx],
            'section_count_diff': cdiff,
        })

    # 공식 ENSO 판정(NOAA CPC): 주 = RONI(공식 감시 지수), 참고 = ONI v5
    en = C.load_work('enso')
    assert list(en['time']) == t

    def eps(state, months, sign=None):
        out, cur = [], None
        for m in months:
            s = int(state[t.index(m)])
            if cur and s == cur[2] and s != 0:
                cur[1] = m
            else:
                if cur and cur[2] != 0:
                    out.append(cur)
                cur = [m, m, s]
        if cur and cur[2] != 0:
            out.append(cur)
        return [{'start': a, 'end': b, 'phase': 'nino' if s > 0 else 'nina'} for a, b, s in out if sign is None or s == sign]

    cases = []
    for c in C.CASES:
        ms = [m for m in t if c['start'] <= m <= c['end']]
        sign = 1 if c['phase'] == 'nino' else -1
        cases.append(dict(c, months=ms,
                          official=eps(en['roni_state'], ms, sign), official_oni5=eps(en['oni5_state'], ms, sign),
                          episodes=eps(en['roni_state'], ms)))
        if not cases[-1]['official']:
            raise RuntimeError('%s 기간에 공식 %s 판정 달이 없습니다' % (c['name'], c['phase']))

    n34, _ = anomalies(sst['nino34'], t)
    series = {'months': t, 'nino34': {'value': r(sst['nino34']), 'anom': r(n34)}, 'wind': {},
              'enso': {'roni': r(en['roni_value'], 1), 'roni_state': [int(x) for x in en['roni_state']],
                       'oni5': r(en['oni5_value'], 1), 'oni5_state': [int(x) for x in en['oni5_state']]}}
    for reg in C.WIND_REGIONS:
        a, _ = anomalies(wd['idx_' + reg['id']], t)
        series['wind'][reg['id']] = {'value': r(wd['idx_' + reg['id']]), 'anom': r(a)}
    C.write_json('series.json', series)

    meta = {
        'generated': datetime.date.today().isoformat(),
        'period': [t[0], t[-1]], 'climatology': [C.CLIM0, C.CLIM1],
        'cases': cases, 'years': C.case_years(), 'scale': SCALE,
        'grids': {
            'sst': {'lat': r(sst['lat']), 'lon': r(sst['lon']), 'res': '2° × 2°'},
            'precip': {'lat': r(pr['lat']), 'lon': r(pr['lon']), 'res': '2.5° × 2.5°'},
            'wind': {'lat': r(wd['lat'], 3), 'lon': r(wd['lon'], 3), 'res': 'T62 가우스 격자(경도 1.875° × 위도 약 1.9°)'},
            'section': {'lon': r(gd['lon']), 'depth': r(gd['depth'], 1), 'lat': r(gd['lat_used'], 2),
                        'ocean_count': [int(x) for x in gd['ocean_count'].ravel()], 'min_ocean': C.SEC_MIN_OCEAN},
        },
        'regions': {'nino34': C.NINO34, 'wind': C.WIND_REGIONS, 'section': {'lat': C.SEC_LAT}},
    }
    C.write_json('meta.json', meta)


if __name__ == '__main__':
    main()
