"""NOAA ERSST v5 월평균 해수면 온도.

원자료: https://www.ncei.noaa.gov/products/extended-reconstructed-sst
  https://www.ncei.noaa.gov/pub/data/cmb/ersst/v5/netcdf/ersst.v5.YYYYMM.nc
변수 sst(°C), 2° × 2° 격자(격자 중심 짝수 위도·경도). 선박·부이 관측을 통계적으로 재구성한 분석 자료(재분석 아님).
파일 안의 ssta(1971~2000년 기준 편차)는 쓰지 않고, 1991~2020년 평년값과 편차를 직접 계산한다.
"""
import os

import numpy as np
import xarray as xr

import common as C

BASE = 'https://www.ncei.noaa.gov/pub/data/cmb/ersst/v5/netcdf/ersst.v5.%s.nc'


def run():
    tl = C.months()
    lat = lon = None
    maps, nino = [], []
    for ym in tl:
        tag = ym.replace('-', '')
        p = C.download(BASE % tag, os.path.join(C.RAW, 'ersst', 'ersst.v5.%s.nc' % tag))
        with xr.open_dataset(p) as d:
            sst = d['sst']
            assert 'C' in sst.attrs.get('units', ''), sst.attrs.get('units')
            assert str(d['time'].values[0])[:7] == ym, (str(d['time'].values[0]), ym)
            v = sst.values.reshape(sst.shape[-2:]).astype('f8')     # (lat, lon), 결측은 NaN으로 읽힘
            la, lo = d['lat'].values.astype('f8'), d['lon'].values.astype('f8')
        if la[0] > la[-1]:
            la, v = la[::-1], v[::-1]
        # Niño 3.4(5°S~5°N, 170°W~120°W) — 지도용으로 자르기 전에 계산
        nino.append(C.area_mean(v, la, lo, C.NINO34['lat'], C.NINO34['lon']))
        sla = (la >= C.MAP_LAT[0]) & (la <= C.MAP_LAT[1])
        slo = (lo >= C.MAP_LON[0]) & (lo <= C.MAP_LON[1])
        if lat is None:
            lat, lon = la[sla], lo[slo]
        maps.append(v[sla][:, slo])
    maps = np.array(maps)
    C.save_work('ersst', time=np.array(tl), lat=lat, lon=lon, sst=maps, nino34=np.array(nino))
    print('ERSST: %d개월, 격자 %d×%d, 육지·결측 격자 %d개' % (len(tl), len(lat), len(lon), int(np.isnan(maps[0]).sum())))


if __name__ == '__main__':
    run()
