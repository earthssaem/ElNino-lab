"""ERA5 월평균 10 m 바람(u10, v10).

자료 이름: ERA5 monthly averaged data on single levels (ECMWF/Copernicus C3S)
  https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels-monthly-means
받는 곳(둘 중 하나):
  1) Copernicus CDS API — ~/.cdsapirc(무료 계정 키)가 있으면 사용
  2) 같은 ERA5 월평균 자료를 NSF NCAR가 netCDF로 다시 배포하는 사본(RDA/GDEX ds633.1, 0.25°)
     https://tds.gdex.ucar.edu/thredds/fileServer/files/g/d633001_nc/e5.moda.an.sfc/YYYY/
       e5.moda.an.sfc.128_165_10u.ll025sc.YYYY010100_YYYY120100.nc  (128_166_10v는 v)
관측을 모형에 동화한 '재분석 자료'. 단위 m/s. u>0 서풍(동쪽으로 부는 바람), u<0 동풍(서쪽으로 부는 바람).

만드는 것(1991~2024 월별):
  u, v       : 지도용 — 원자료 0.25° 격자점 중 2° 간격 점의 값을 그대로 뽑음(평균·보간 없음)
  idx_<지역> : 지역 평균 u10 — 0.25° 원자료 전체로 위도 가중 평균 (이 프로젝트가 직접 계산한 값)
"""
import os

import numpy as np
import xarray as xr

import common as C

HOSTS = ['https://tds.gdex.ucar.edu/thredds/fileServer/files/g/d633001_nc/e5.moda.an.sfc',
         'https://thredds.rda.ucar.edu/thredds/fileServer/files/g/d633001_nc/e5.moda.an.sfc']
CODES = {'u': '128_165_10u', 'v': '128_166_10v'}


def fetch_year_ncar(y, comp):
    name = 'e5.moda.an.sfc.%s.ll025sc.%d010100_%d120100.nc' % (CODES[comp], y, y)
    dest = os.path.join(C.RAW, 'era5', name)
    last = None
    for h in HOSTS:
        try:
            return C.download('%s/%d/%s' % (h, y, name), dest)
        except RuntimeError as e:
            last = e
    raise last


def fetch_cds():
    import cdsapi  # noqa: PLC0415
    dest = os.path.join(C.RAW, 'era5', 'era5_moda_10m_wind_pacific_%d_%d.nc' % (C.YEAR0, C.YEAR1))
    if not os.path.exists(dest):
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        cdsapi.Client().retrieve('reanalysis-era5-single-levels-monthly-means', {
            'product_type': ['monthly_averaged_reanalysis'],
            'variable': ['10m_u_component_of_wind', '10m_v_component_of_wind'],
            'year': [str(y) for y in range(C.YEAR0, C.YEAR1 + 1)],
            'month': ['%02d' % m for m in range(1, 13)], 'time': ['00:00'],
            'area': [31, 99, -31, -69], 'data_format': 'netcdf', 'download_format': 'unarchived',
        }, dest)
    return dest


def pick(d, names):
    for n in names:
        if n in d:
            return d[n]
    three = [k for k, v in d.data_vars.items() if v.ndim == 3]
    if len(three) == 1:
        return d[three[0]]
    raise KeyError('바람 변수를 찾지 못했습니다: %s' % list(d.data_vars))


def norm(da):
    """좌표 이름·순서를 (time, lat 오름차순, lon 0~360)으로 맞춘다."""
    ren = {k: v for k, v in {'latitude': 'lat', 'longitude': 'lon', 'valid_time': 'time'}.items() if k in da.dims}
    da = da.rename(ren)
    da = da.assign_coords(lon=(da['lon'] % 360)).sortby('lon').sortby('lat')
    return da


def process(u, v):
    tl = [str(x)[:7] for x in u['time'].values]
    la, lo = u['lat'].values.astype('f8'), u['lon'].values.astype('f8')
    uu, vv = u.values.astype('f8'), v.values.astype('f8')
    idx = {r['id']: C.area_mean(uu, la, lo, r['lat'], r['lon']) for r in C.WIND_REGIONS}
    tla = np.arange(C.MAP_LAT[0], C.MAP_LAT[1] + 0.1, 2.0)
    tlo = np.arange(C.MAP_LON[0], C.MAP_LON[1] + 0.1, 2.0)
    ia = [int(np.where(np.abs(la - x) < 1e-3)[0][0]) for x in tla]   # 정확히 그 격자점만(보간 없음)
    io = [int(np.where(np.abs(lo - x) < 1e-3)[0][0]) for x in tlo]
    return tl, tla, tlo, uu[:, ia][:, :, io], vv[:, ia][:, :, io], idx


def run():
    parts = []
    if os.path.exists(os.path.expanduser('~/.cdsapirc')) or os.environ.get('CDSAPI_KEY'):
        p = fetch_cds()
        with xr.open_dataset(p) as d:
            parts.append(process(norm(pick(d, ['u10'])).load(), norm(pick(d, ['v10'])).load()))
        source = 'Copernicus CDS'
    else:
        for y in range(C.YEAR0, C.YEAR1 + 1):
            pu, pv = fetch_year_ncar(y, 'u'), fetch_year_ncar(y, 'v')
            with xr.open_dataset(pu) as du, xr.open_dataset(pv) as dv:
                u = norm(pick(du, ['VAR_10U', 'u10']))
                v = norm(pick(dv, ['VAR_10V', 'v10']))
                box = dict(lat=slice(-31, 31), lon=slice(99, 291))
                parts.append(process(u.sel(**box).load(), v.sel(**box).load()))
            print('  ERA5 %d 처리' % y)
        source = 'NSF NCAR RDA/GDEX ds633.1'
    tl = sum([p[0] for p in parts], [])
    assert tl == C.months(), '월 순서가 맞지 않습니다'
    out = dict(time=np.array(tl), lat=parts[0][1], lon=parts[0][2],
               u=np.concatenate([p[3] for p in parts]), v=np.concatenate([p[4] for p in parts]),
               source=np.array(source))
    for r in C.WIND_REGIONS:
        out['idx_' + r['id']] = np.concatenate([p[5][r['id']] for p in parts])
    C.save_work('era5', **out)
    print('ERA5(%s): %d개월' % (source, len(tl)))


if __name__ == '__main__':
    run()
