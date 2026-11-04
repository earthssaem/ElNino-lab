"""공통 설정과 도구.

모든 자료는 1991-01 ~ 2024-12 월별 값으로 가공하고,
평년값은 1991~2020년 같은 달 평균으로 직접 계산한다.
"""
import calendar
import json
import os
import time
import urllib.request

import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('ENSO_RAW', os.path.join(ROOT, 'raw'))      # 원자료(용량 큼, 저장소에 넣지 않음)
WORK = os.environ.get('ENSO_WORK', os.path.join(ROOT, 'work'))   # 해역만 잘라 낸 중간 자료(.npz)
OUT = os.path.join(os.path.dirname(ROOT), 'observatory', 'data')  # 웹앱이 읽는 자료

YEAR0, YEAR1 = 1991, 2024          # 가공 기간
CLIM0, CLIM1 = 1991, 2020          # 평년 기간

# 지도 범위(경도는 0~360°E)
MAP_LAT = (-30.0, 30.0)
MAP_LON = (100.0, 290.0)

# 단면(2°S~2°N 평균) 범위
SEC_LAT = (-2.0, 2.0)
SEC_LON = (120.0, 285.0)
SEC_MAXDEPTH = 600.0                # 500 m까지 그리려면 그 아래 층 하나가 더 필요
SEC_MIN_OCEAN = 6                   # 2°S~2°N 위도 격자 12개 중 해양 격자가 이보다 적으면 '대표성 낮음'으로 표시

# 사례(발생 전·발달·쇠퇴를 볼 수 있게 앞뒤 기간 포함). start~end는 '자료 탐색 기간'이며
# 실제 엘니뇨·라니냐 발생 기간은 NOAA CPC 공식 판정(enso_record.py)으로 따로 표시한다.
CASES = [
    {'id': 'nino1997', 'phase': 'nino', 'name': '1997~1998년 엘니뇨', 'start': '1996-01', 'end': '1999-12', 'focus': '1997-12'},
    {'id': 'nino2015', 'phase': 'nino', 'name': '2015~2016년 엘니뇨', 'start': '2014-01', 'end': '2017-12', 'focus': '2015-12'},
    {'id': 'nino2023', 'phase': 'nino', 'name': '2023~2024년 엘니뇨', 'start': '2022-01', 'end': '2024-12', 'focus': '2023-12'},
    {'id': 'nina1998', 'phase': 'nina', 'name': '1998~1999년 라니냐', 'start': '1998-01', 'end': '2001-06', 'focus': '1999-12'},
    {'id': 'nina2020', 'phase': 'nina', 'name': '2020~2022년 라니냐', 'start': '2020-01', 'end': '2023-06', 'focus': '2022-12'},
]


def case_years():
    """웹 자료로 내보낼 연도(사례가 겹치는 해도 한 번만)."""
    ys = set()
    for c in CASES:
        ys.update(range(int(c['start'][:4]), int(c['end'][:4]) + 1))
    return sorted(ys)


# Niño 3.4 해역
NINO34 = {'lat': (-5.0, 5.0), 'lon': (190.0, 240.0)}

# 무역풍(10 m 동서 바람) 지역 평균 — 공식 지수가 아니라 이 프로젝트가 ERA5로 직접 계산한 값.
# 경도 범위는 NOAA CPC의 850 hPa 동서 바람 지수 해역을 본떴지만 고도(10 m)와 자료(ERA5)가 다르다.
WIND_REGIONS = [
    {'id': 'west', 'name': '서태평양', 'lat': (-5.0, 5.0), 'lon': (135.0, 180.0)},
    {'id': 'central', 'name': '중앙 태평양', 'lat': (-5.0, 5.0), 'lon': (185.0, 220.0)},
    {'id': 'east', 'name': '동태평양', 'lat': (-5.0, 5.0), 'lon': (225.0, 240.0)},
]


def months(y0=YEAR0, y1=YEAR1):
    return ['%04d-%02d' % (y, m) for y in range(y0, y1 + 1) for m in range(1, 13)]


def days_in_month(ym):
    y, m = int(ym[:4]), int(ym[5:7])
    return calendar.monthrange(y, m)[1]


MIN_CLIM_YEARS = 24   # 30년 중 80% 이상 (WMO 기후 평년값 지침의 결측 허용 기준)


def climatology(values, month_list, min_years=MIN_CLIM_YEARS):
    """values: (시간, ...) 배열. 1991~2020년 같은 달 평균 (12, ...).
    결측(NaN)은 다른 숫자로 채우지 않는다. 결측이 아닌 해만 평균하되, 30년 중 min_years년 이상
    자료가 있어야 평년값을 만들고 그보다 적으면 평년값도 결측으로 둔다."""
    yrs = np.array([int(t[:4]) for t in month_list])
    mon = np.array([int(t[5:7]) for t in month_list])
    out = []
    for m in range(1, 13):
        sel = (mon == m) & (yrs >= CLIM0) & (yrs <= CLIM1)
        n = int(sel.sum())
        if n != CLIM1 - CLIM0 + 1:
            raise RuntimeError('평년 계산에 필요한 %d월 자료가 %d개뿐입니다' % (m, n))
        v = values[sel]
        cnt = np.isfinite(v).sum(axis=0)
        with np.errstate(invalid='ignore'):
            mean = np.nansum(v, axis=0) / cnt
        out.append(np.where(cnt >= min_years, mean, np.nan))
    return np.array(out)


def clim_count(values, month_list):
    """평년 계산에 쓴 해의 수 (12, ...) — 문서화용."""
    yrs = np.array([int(t[:4]) for t in month_list])
    mon = np.array([int(t[5:7]) for t in month_list])
    return np.array([np.isfinite(values[(mon == m) & (yrs >= CLIM0) & (yrs <= CLIM1)]).sum(axis=0) for m in range(1, 13)])


def area_mean(field, lat, lon, latr, lonr, require_all=True):
    """위도 가중(cos) 지역 평균. field: (..., lat, lon)."""
    la = (lat >= latr[0] - 1e-6) & (lat <= latr[1] + 1e-6)
    lo = (lon >= lonr[0] - 1e-6) & (lon <= lonr[1] + 1e-6)
    sub = field[..., la, :][..., lo]
    w = np.cos(np.deg2rad(lat[la]))[:, None] * np.ones(lo.sum())[None, :]
    w = np.broadcast_to(w, sub.shape)
    ok = np.isfinite(sub)
    if require_all:
        s = (sub * w).sum(axis=(-2, -1)) / w.sum(axis=(-2, -1))
        return s
    s = np.where(ok, sub * w, 0).sum(axis=(-2, -1)) / np.where(ok, w, 0).sum(axis=(-2, -1))
    return s


def download(url, dest, tries=4):
    """이미 받은 파일은 다시 받지 않는다."""
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + '.part'
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'enso-observatory-pipeline'})
            with urllib.request.urlopen(req, timeout=300) as r, open(tmp, 'wb') as f:
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    f.write(b)
            os.replace(tmp, dest)
            return dest
        except Exception as e:  # noqa: BLE001
            print('  내려받기 실패(%d/%d) %s: %s' % (i + 1, tries, url, e))
            time.sleep(2 ** (i + 1))
    raise RuntimeError('내려받지 못했습니다: ' + url)


def save_work(name, **arrays):
    os.makedirs(WORK, exist_ok=True)
    np.savez_compressed(os.path.join(WORK, name + '.npz'), **arrays)


def load_work(name):
    p = os.path.join(WORK, name + '.npz')
    if not os.path.exists(p):
        return None
    d = np.load(p, allow_pickle=False)
    return {k: d[k] for k in d.files}


def write_json(name, obj):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    print('  저장:', os.path.relpath(p, os.path.dirname(ROOT)), '%.0f KB' % (os.path.getsize(p) / 1024))


def ints(a, scale):
    """실수 배열 → 정수 목록(결측은 null). 웹 용량을 줄이기 위해 scale 단위로 반올림."""
    a = np.asarray(a, dtype='f8').ravel()
    out = np.round(a / scale)
    return [None if not np.isfinite(v) else int(v) for v in out]
