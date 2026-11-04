"""NCEP/NCAR Reanalysis 1 월평균 10 m 바람(u, v).

자료: NOAA PSL, NCEP-NCAR Reanalysis 1 (Kalnay et al. 1996)
  https://psl.noaa.gov/data/gridded/data.ncep.reanalysis.html
  https://downloads.psl.noaa.gov/Datasets/ncep.reanalysis.derived/surface_gauss/uwnd.10m.mon.mean.nc
  https://downloads.psl.noaa.gov/Datasets/ncep.reanalysis.derived/surface_gauss/vwnd.10m.mon.mean.nc
T62 가우스 격자(경도 1.875°, 위도 약 1.9°), 월평균, m/s. 관측을 대기 모형에 동화한 '재분석 자료'.
u>0: 서풍(서→동으로 부는 바람), u<0: 동풍(동→서로 부는 바람, 무역풍). v>0: 남풍(남→북으로 부는 바람).
1991~2024 전 기간을 이 자료 하나로 가공한다(ERA5 등 다른 재분석과 섞지 않음).

만드는 것(1991~2024 월별):
  u, v       : 지도용 — 원자료 격자점 값 그대로(30°S~30°N, 100°E~290°E 안의 점, 보간·평균 없음)
  idx_<지역> : 지역 평균 u10 — 이 프로젝트가 직접 계산한 값(5°S~5°N 안의 격자, 위도 가중 평균).
               경도 범위는 NOAA CPC 850 hPa 무역풍 지수 해역과 같지만 고도(10 m)가 다르다.
"""
import os

import numpy as np
import xarray as xr

import common as C

BASE = 'https://downloads.psl.noaa.gov/Datasets/ncep.reanalysis.derived/surface_gauss/%s.10m.mon.mean.nc'


def read(var):
    p = C.download(BASE % var, os.path.join(C.RAW, 'ncep', '%s.10m.mon.mean.nc' % var))
    with xr.open_dataset(p) as d:
        da = d[var]
        assert da.attrs.get('units') == 'm/s', da.attrs.get('units')
        assert da.attrs.get('level_desc') == '10 m', da.attrs.get('level_desc')
        da = da.sel(time=slice('%d-01-01' % C.YEAR0, '%d-12-31' % C.YEAR1)).sortby('lat').load()
    tl = [str(x)[:7] for x in da['time'].values]
    assert tl == C.months(), '월 목록이 1991-01~2024-12와 다릅니다'
    v = da.values.astype('f8')
    lo, hi = da.attrs['valid_range']
    v[(v < lo) | (v > hi)] = np.nan     # 유효 범위 밖은 결측(채우지 않음)
    return tl, da['lat'].values.astype('f8'), da['lon'].values.astype('f8'), v


P850 = 'https://downloads.psl.noaa.gov/Datasets/ncep.reanalysis.derived/pressure/uwnd.mon.mean.nc'


def run_850():
    """검증용: 같은 R1의 850 hPa 동서 바람으로 NOAA CPC 무역풍 지수(wpac850·cpac850·epac850)와 같은
    방법(5°S~5°N, 같은 경도 범위 평균, 동풍을 양수로)으로 계산해 CPC 공식 값과 비교한다."""
    p = C.download(P850, os.path.join(C.RAW, 'ncep', 'uwnd.mon.mean.pressure.nc'))
    with xr.open_dataset(p) as d:
        u = d['uwnd'].sel(level=850, time=slice('1979-01-01', '%d-12-31' % C.YEAR1)).sortby('lat').load()
    la, lo = u['lat'].values.astype('f8'), u['lon'].values.astype('f8')
    out = {'time': np.array([str(x)[:7] for x in u['time'].values])}
    for r in C.WIND_REGIONS:
        out['easterly_' + r['id']] = -C.area_mean(u.values.astype('f8'), la, lo, r['lat'], r['lon'])
    C.save_work('wind850', **out)
    print('R1 850 hPa 무역풍 지수(검증용): %d개월' % len(out['time']))


def run():
    tl, la, lo, u = read('uwnd')
    _, la2, lo2, v = read('vwnd')
    assert np.allclose(la, la2) and np.allclose(lo, lo2)
    idx = {r['id']: C.area_mean(u, la, lo, r['lat'], r['lon']) for r in C.WIND_REGIONS}
    sla = (la >= C.MAP_LAT[0]) & (la <= C.MAP_LAT[1])
    slo = (lo >= C.MAP_LON[0]) & (lo <= C.MAP_LON[1])
    out = dict(time=np.array(tl), lat=la[sla], lon=lo[slo], u=u[:, sla][:, :, slo], v=v[:, sla][:, :, slo])
    for r in C.WIND_REGIONS:
        out['idx_' + r['id']] = idx[r['id']]
    C.save_work('wind', **out)
    print('NCEP/NCAR R1 10 m 바람: %d개월, 지도 격자 %d×%d, 결측 %d개'
          % (len(tl), sla.sum(), slo.sum(), int(np.isnan(out['u']).sum() + np.isnan(out['v']).sum())))


if __name__ == '__main__':
    run()
    run_850()
