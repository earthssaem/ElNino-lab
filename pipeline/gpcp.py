"""GPCP 월 강수량 (NOAA CDR, GPCP Monthly v2.3 = 파일 버전 v02r03).

원자료: https://www.ncei.noaa.gov/products/climate-data-records/precipitation-gpcp-monthly
같은 파일을 NOAA Open Data Dissemination(NODD)이 AWS에 그대로 올려 둔 사본에서 받는다.
  s3://noaa-cdr-precip-gpcp-monthly-pds/data/YYYY/gpcp_v02r03_monthly_dYYYYMM_cYYYYMMDD.nc
원자료 단위는 mm/day(그 달의 하루 평균)이며, 그 달의 실제 일수를 곱해 mm/월로 바꾼다.
격자: 2.5° × 2.5° (격자 중심 ±1.25°, ±3.75°, …). 위성·우량계 관측을 합친 분석 자료(재분석 아님).
"""
import os
import re
import urllib.request

import numpy as np
import xarray as xr

import common as C

BUCKET = 'https://noaa-cdr-precip-gpcp-monthly-pds.s3.amazonaws.com'


def list_year(y):
    url = '%s/?list-type=2&prefix=data/%d/' % (BUCKET, y)
    with urllib.request.urlopen(url, timeout=120) as r:
        xml = r.read().decode()
    keys = re.findall(r'<Key>([^<]+\.nc)</Key>', xml)
    by_month = {}
    for k in keys:
        m = re.search(r'_d(\d{6})_c(\d{8})\.nc$', k)
        if m:  # 같은 달 파일이 여러 개면 가장 최근에 만든 것
            ym = m.group(1)
            if ym not in by_month or m.group(2) > by_month[ym][1]:
                by_month[ym] = (k, m.group(2))
    return {ym: v[0] for ym, v in by_month.items()}


def run():
    tl = C.months()
    lat = lon = None
    vals = []
    files = []
    for y in range(C.YEAR0, C.YEAR1 + 1):
        lst = list_year(y)
        for m in range(1, 13):
            ym = '%04d%02d' % (y, m)
            if ym not in lst:
                raise RuntimeError('GPCP %s 파일이 없습니다' % ym)
            key = lst[ym]
            p = C.download('%s/%s' % (BUCKET, key), os.path.join(C.RAW, 'gpcp', os.path.basename(key)))
            files.append(os.path.basename(key))
            with xr.open_dataset(p) as d:
                pr = d['precip']
                assert pr.attrs['units'] == 'mm/day', pr.attrs['units']
                t = str(d['time'].values[0])[:7]
                assert t == '%04d-%02d' % (y, m), (t, ym)
                la, lo = d['latitude'].values, d['longitude'].values
                sla = (la > C.MAP_LAT[0]) & (la < C.MAP_LAT[1])   # 격자 칸이 지도 범위 안에 드는 것
                slo = (lo > C.MAP_LON[0]) & (lo < C.MAP_LON[1])
                v = pr.values[0][sla][:, slo].astype('f8')
                vmin, vmax = pr.attrs['valid_range']
                v[(v < vmin) | (v > vmax)] = np.nan    # 유효 범위 밖은 결측(다른 숫자로 채우지 않음)
                if lat is None:
                    lat, lon = la[sla].astype('f8'), lo[slo].astype('f8')
                vals.append(v * C.days_in_month(tl[len(vals)]))   # mm/day × 그 달 일수 → mm/월
    vals = np.array(vals)
    C.save_work('gpcp', time=np.array(tl), lat=lat, lon=lon, precip=vals, files=np.array(files))
    print('GPCP: %d개월, 격자 %d×%d, 결측 %d개' % (len(tl), len(lat), len(lon), int(np.isnan(vals).sum())))


if __name__ == '__main__':
    run()
