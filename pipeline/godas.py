"""NCEP GODAS 월평균 수심별 수온(잠재 수온).

원자료: https://www.cpc.ncep.noaa.gov/products/GODAS/
NOAA PSL이 배포하는 netCDF 사본을 받는다.
  https://downloads.psl.noaa.gov/Datasets/godas/pottmp.YYYY.nc
변수 pottmp(K, 잠재 수온), 격자 경도 1° × 위도 1/3°(적도 부근), 수심 층 40개(5, 15, …, 225 m는 10 m 간격).
해양 관측(수온 프로파일 등)을 해양 모형에 동화한 '해양 재분석(분석) 자료'다.
0~500 m에서 잠재 수온과 현장 수온의 차이는 0.1 °C보다 작아 화면에서는 '수온'으로 부른다.

이 스크립트가 만드는 것(1991~2024 월별):
  section : 2°S~2°N 범위 격자의 수온을 먼저 평균한 경도-수심 단면 (°C). 범위 안의 위도 중 하나라도
            결측(육지)이면 그 칸은 결측으로 둔다.
  hc300   : 5°S~5°N, 130°E~80°W, 0~300 m 평균 수온 (검증용 — NOAA CPC 열용량 지수와 비교)
"""
import os

import numpy as np
import xarray as xr

import common as C

BASE = 'https://downloads.psl.noaa.gov/Datasets/godas/pottmp.%d.nc'


def mean_0_300(prof, depth):
    """연직 프로파일(…, depth)의 0~300 m 평균. 5 m 값이 해면까지 같다고 보고 층 사이는 선형 보간."""
    z = np.arange(0.5, 300, 1.0)
    d = np.concatenate([[0.0], depth])
    p = np.concatenate([prof[..., :1], prof], axis=-1)
    flat = p.reshape(-1, p.shape[-1])
    out = np.array([np.interp(z, d, row) if np.isfinite(row[d <= 310]).all() else np.full(z.shape, np.nan) for row in flat])
    return out.mean(axis=-1).reshape(p.shape[:-1])


def run(keep_raw=False):
    tl, sec, hc = [], [], []
    lon = depth = None
    for y in range(C.YEAR0, C.YEAR1 + 1):
        p = C.download(BASE % y, os.path.join(C.RAW, 'godas', 'pottmp.%d.nc' % y))
        with xr.open_dataset(p) as d:
            t = d['pottmp']
            assert t.attrs.get('units', '').upper().startswith('K'), t.attrs.get('units')
            la, lo, lev = d['lat'].values.astype('f8'), d['lon'].values.astype('f8'), d['level'].values.astype('f8')
            zsel = lev <= C.SEC_MAXDEPTH
            osel = (lo >= C.SEC_LON[0]) & (lo <= C.SEC_LON[1])
            box = (la >= -5.0 - 1e-6) & (la <= 5.0 + 1e-6)
            sub = t.isel(lat=np.where(box)[0], lon=np.where(osel)[0], level=np.where(zsel)[0]).values.astype('f8') - 273.15
            times = [str(x)[:7] for x in d['time'].values]
        lab = la[box]
        assert len(times) == 12 and times[0] == '%d-01' % y, times
        # 2°S~2°N 평균 단면: 위도 가중 평균, 범위 안 위도 중 결측이 있으면 결측
        ss = (lab >= C.SEC_LAT[0] - 1e-6) & (lab <= C.SEC_LAT[1] + 1e-6)
        w = np.cos(np.deg2rad(lab[ss]))
        s = (sub[:, :, ss, :] * w[None, None, :, None]).sum(axis=2) / w.sum()   # (12, depth, lon)
        # 5°S~5°N, 130°E~80°W, 0~300 m 평균(검증용)
        lsel = (lo[osel] >= 130) & (lo[osel] <= 280)
        wb = np.cos(np.deg2rad(lab))
        bm = (sub[:, :, :, lsel] * wb[None, None, :, None]).sum(axis=2) / wb.sum()  # (12, depth, lon)
        bm = np.nanmean(np.moveaxis(bm, 1, -1), axis=1)   # 경도 평균 (육지 경도는 제외)
        h = mean_0_300(bm, lev[zsel])
        tl += times
        sec.append(s)
        hc.append(h)
        if lon is None:
            lon, depth = lo[osel], lev[zsel]
        print('  GODAS %d 처리' % y)
        if not keep_raw:
            os.remove(p)   # 원자료가 커서(연 수백 MB) 처리한 해는 지운다
    sec = np.concatenate(sec)
    C.save_work('godas', time=np.array(tl), lon=lon, depth=depth, section=sec, hc300=np.concatenate(hc),
                lat_used=lab[ss])
    print('GODAS: %d개월, 단면 수심 %d층 × 경도 %d개, 단면 위도 %s' % (len(tl), len(depth), len(lon), np.round(lab[ss], 2)))


if __name__ == '__main__':
    run(keep_raw=bool(os.environ.get('KEEP_RAW')))
