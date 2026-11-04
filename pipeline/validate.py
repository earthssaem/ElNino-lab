"""1단계 검증: 직접 계산한 값과 NOAA CPC 공식 자료 비교, 수온 단면 그림 생성.

- Niño 3.4 편차(ERSST v5, 1991~2020 기준) ↔ CPC 공식 표 ersst5.nino.mth.91-20.ascii
- GODAS 2°S~2°N 수온 편차 단면 ↔ CPC 월간 해양 브리핑 그림(같은 자료·같은 평년)
- 20 °C 등온선 깊이(현재·같은 달 평년)
결과: validation/*.png, validation/REPORT.md
"""
import os
import sys

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.colors import BoundaryNorm  # noqa: E402

import common as C  # noqa: E402

VAL = os.path.join(C.ROOT, 'validation')
CPC_NINO = os.environ.get('CPC_NINO', os.path.join(C.RAW, 'cpc', 'ersst5.nino.mth.91-20.ascii'))


def iso_depth(profile, depth, target=20.0):
    """위에서부터 내려가며 수온이 target 이상 → 미만으로 바뀌는 첫 두 층 사이를 선형 보간.
    결측 층을 만나거나 교차가 없으면 NaN(측정 불가)."""
    for k in range(len(depth) - 1):
        a, b = profile[k], profile[k + 1]
        if not (np.isfinite(a) and np.isfinite(b)):
            return np.nan
        if a >= target > b:
            return depth[k] + (a - target) / (a - b) * (depth[k + 1] - depth[k])
    return np.nan


def iso_line(sec, depth, target=20.0):
    return np.array([iso_depth(sec[:, i], depth, target) for i in range(sec.shape[1])])


def lon_label(x):
    x = x % 360
    return '%d°E' % x if x <= 180 else '%d°W' % (360 - x)


def nino_check(lines):
    d = C.load_work('ersst')
    t = list(d['time'])
    n = d['nino34']
    cl = C.climatology(n, t)
    an = n - np.array([cl[int(x[5:7]) - 1] for x in t])
    cpc = {}
    for line in open(CPC_NINO).read().splitlines()[1:]:
        p = line.split()
        cpc['%04d-%02d' % (int(p[0]), int(p[1]))] = (float(p[8]), float(p[9]))
    com = [x for x in t if x in cpc]
    a = np.array([an[t.index(x)] for x in com])
    b = np.array([cpc[x][1] for x in com])
    lines += ['## 1. Niño 3.4 해수면 온도 편차 (ERSST v5) ↔ NOAA CPC 공식 값', '',
              '- 비교 개월 수: %d (%s ~ %s)' % (len(com), com[0], com[-1]),
              '- 최대 차이 %.3f °C, 평균 절대 차이 %.4f °C, 상관계수 %.5f' % (abs(a - b).max(), abs(a - b).mean(), np.corrcoef(a, b)[0, 1]),
              '', '| 월 | 직접 계산 | CPC 공식 |', '| --- | --- | --- |']
    for x in ['1997-12', '2015-11', '2015-12', '2023-06', '2023-12', '2024-01']:
        lines.append('| %s | %+.2f | %+.2f |' % (x, an[t.index(x)], cpc[x][1]))
    lines.append('')
    fig, ax = plt.subplots(figsize=(10, 3.2))
    xs = np.arange(len(com))
    ax.plot(xs, b, color='0.6', lw=3, label='CPC official (ERSSTv5, 1991-2020)')
    ax.plot(xs, a, color='C3', lw=1, label='this pipeline')
    ax.axhline(0, color='k', lw=0.5)
    ax.set_xticks(xs[::24])
    ax.set_xticklabels([com[i][:4] for i in xs[::24]])
    ax.set_ylabel('Nino3.4 anomaly (°C)')
    ax.legend(loc='upper left', fontsize=8)
    fig.tight_layout()
    fig.savefig(os.path.join(VAL, 'nino34_vs_cpc.png'), dpi=110)
    plt.close(fig)


def godas_check(lines):
    g = C.load_work('godas')
    t = list(g['time'])
    sec, lon, depth = g['section'], g['lon'], g['depth']
    clim = C.climatology(sec, t)
    lines += ['## 2. GODAS 적도(2°S~2°N 평균) 수온 단면', '',
              '- 단면에 쓴 위도 격자: %s' % ', '.join('%.2f' % x for x in g['lat_used']),
              '- 수심 층(≤%.0f m): %s' % (C.SEC_MAXDEPTH, ', '.join('%.0f' % x for x in depth)),
              '- 경도: %.1f ~ %.1f°E, %d개' % (lon[0], lon[-1], len(lon))]
    land = ~np.isfinite(sec).any(axis=(0, 1))                 # 모든 달·모든 층이 결측인 경도 = 육지
    holes = [(t[i], int((~np.isfinite(sec[i][:, ~land])).sum())) for i in range(len(t))]
    holes = [h for h in holes if h[1]]
    lines += ['- 육지(항상 결측)로 빠지는 경도: %s' % ', '.join('%.1f' % x for x in lon[land]),
              '- 바다인데 결측인 칸이 있는 달: %s (값을 채우지 않고 \'자료 없음\'으로 둠)'
              % (', '.join('%s(%d칸)' % h for h in holes[:6]) + (' 외 %d개월' % (len(holes) - 6) if len(holes) > 6 else '') if holes else '없음')]
    cc = C.clim_count(sec, t)[:, :, ~land]
    lines += ['- 평년값: 30년이 모두 있는 칸 %.1f%%, 24~29년으로 계산한 칸 %d개, 24년 미만이라 평년값 결측인 칸 %d개'
              % (100.0 * (cc == 30).mean(), int(((cc >= 24) & (cc < 30)).sum()), int((cc < 24).sum())), '']

    # (a) CPC 브리핑과 같은 형식의 편차 단면 (0~300 m)
    lev = [-5, -4, -3, -2, -1, -0.5, 0.5, 1, 2, 3, 4, 5]
    cmap = plt.get_cmap('RdBu_r', len(lev) - 1)
    norm = BoundaryNorm(lev, cmap.N)
    months = ['1997-12', '2015-12', '2022-12', '2023-12']
    fig, axs = plt.subplots(len(months), 1, figsize=(8, 2.6 * len(months)))
    for ax, ym in zip(axs, months):
        i = t.index(ym)
        an = sec[i] - clim[int(ym[5:7]) - 1]
        pc = ax.pcolormesh(lon, depth, np.ma.masked_invalid(an), cmap=cmap, norm=norm, shading='nearest')
        cs = ax.contour(lon, depth, np.ma.masked_invalid(an), levels=[-2, -1, 1, 2, 4], colors='k', linewidths=0.5)
        ax.clabel(cs, fmt='%g', fontsize=6)
        ax.plot(lon, iso_line(sec[i], depth), 'k-', lw=1.6)
        ax.plot(lon, iso_line(clim[int(ym[5:7]) - 1], depth), 'k--', lw=1.2)
        ax.set_ylim(300, 0)
        ax.set_xlim(120, 285)
        ax.set_title('%s  GODAS temp anomaly 2S-2N (clim 1991-2020); 20°C isotherm: solid=month, dashed=clim' % ym, fontsize=8)
        ax.set_xticks(range(120, 286, 30))
        ax.set_xticklabels([lon_label(x) for x in range(120, 286, 30)], fontsize=7)
        ax.set_ylabel('depth (m)', fontsize=7)
        fig.colorbar(pc, ax=ax, pad=0.01, ticks=lev)
    fig.tight_layout()
    fig.savefig(os.path.join(VAL, 'godas_anomaly_sections.png'), dpi=110)
    plt.close(fig)

    # (b) 실제 수온 단면 0~500 m
    months2 = ['2022-12', '2023-06', '2023-12', '1997-12']
    fig, axs = plt.subplots(len(months2), 1, figsize=(8, 2.6 * len(months2)))
    for ax, ym in zip(axs, months2):
        i = t.index(ym)
        pc = ax.pcolormesh(lon, depth, np.ma.masked_invalid(sec[i]), cmap='turbo', vmin=8, vmax=31, shading='nearest')
        cs = ax.contour(lon, depth, np.ma.masked_invalid(sec[i]), levels=range(10, 31, 2), colors='w', linewidths=0.4)
        ax.clabel(cs, fmt='%d', fontsize=6)
        ax.plot(lon, iso_line(sec[i], depth), 'k-', lw=1.8)
        ax.plot(lon, iso_line(clim[int(ym[5:7]) - 1], depth), 'k--', lw=1.2)
        ax.set_ylim(500, 0)
        ax.set_xlim(120, 285)
        ax.set_title('%s  GODAS temperature 2S-2N (°C); black solid: 20°C (month), dashed: 20°C (clim)' % ym, fontsize=8)
        ax.set_xticks(range(120, 286, 30))
        ax.set_xticklabels([lon_label(x) for x in range(120, 286, 30)], fontsize=7)
        fig.colorbar(pc, ax=ax, pad=0.01)
    fig.tight_layout()
    fig.savefig(os.path.join(VAL, 'godas_temperature_sections.png'), dpi=110)
    plt.close(fig)

    # (c) 20 °C 등온선 깊이 표
    pts = [140, 160, 180, 200, 220, 240, 260]
    lines += ['### 20 °C 등온선 깊이 (m, 현재 / 같은 달 평년)', '',
              '| 월 | ' + ' | '.join(lon_label(p) for p in pts) + ' |', '|---' * (len(pts) + 1) + '|']
    for ym in ['2022-12', '2023-06', '2023-12', '1997-12', '2015-12']:
        i = t.index(ym)
        cur = iso_line(sec[i], depth)
        cl = iso_line(clim[int(ym[5:7]) - 1], depth)
        cells = []
        for p in pts:
            j = int(np.argmin(np.abs(lon - (p + 0.5))))
            cells.append('%s / %s' % tuple('측정 불가' if not np.isfinite(v) else '%.0f' % v for v in (cur[j], cl[j])))
        lines.append('| %s | %s |' % (ym, ' | '.join(cells)))
    lines.append('')

    # (d) 자동 점검
    dec = clim[11]
    w = int(np.argmin(np.abs(lon - 150.5)))
    e = int(np.argmin(np.abs(lon - 260.5)))
    zc = iso_line(dec, depth)
    checks = [
        ('평년(12월) 표층 수온: 서태평양(150°E) > 동태평양(100°W)', dec[0, w] > dec[0, e], '%.2f vs %.2f °C' % (dec[0, w], dec[0, e])),
        ('평년 20 °C 등온선: 서쪽이 동쪽보다 깊음', zc[w] > zc[e], '%.0f m vs %.0f m' % (zc[w], zc[e])),
        ('수온이 깊이에 따라 대체로 감소(평년 150°E)', np.all(np.diff(dec[:, w]) < 0.3), ''),
        ('2023-12 동태평양(100°W) 20 °C 등온선이 평년보다 깊음',
         iso_line(sec[t.index('2023-12')], depth)[e] > zc[e], ''),
    ]
    lines += ['### 자동 점검', '']
    for name, ok, info in checks:
        lines.append('- %s %s %s' % ('✅' if ok else '❌', name, info))
    lines.append('')
    return clim


def cpc_compare(lines):
    """CPC 월간 해양 브리핑(2024년 1월호, 2023년 12월 GODAS 편차 단면, 1991~2020 평년)과 나란히 놓기."""
    pdf = os.path.join(C.RAW, 'cpc', 'global_ocean_monitoring_2024_01.pdf')
    if not os.path.exists(pdf):
        C.download('https://www.cpc.ncep.noaa.gov/products/GODAS/ocean_briefing_gif/global_ocean_monitoring_2024_01.pdf', pdf)
    import pypdfium2 as pdfium  # noqa: PLC0415
    page = pdfium.PdfDocument(pdf)[6]                       # 7쪽: Longitude-Depth Temperature Anomaly in 2S-2N
    img = page.render(scale=160 / 72).to_pil().crop((270, 120, 790, 580))
    g = C.load_work('godas')
    t = list(g['time'])
    sec, lon, depth = g['section'], g['lon'], g['depth']
    clim = C.climatology(sec, t)
    i = t.index('2023-12')
    an = sec[i] - clim[11]
    lev = [-5, -4, -3, -2, -1, -0.5, 0.5, 1, 2, 3, 4, 5]
    cmap = plt.get_cmap('RdYlBu_r', len(lev) - 1)
    fig, axs = plt.subplots(2, 1, figsize=(6.4, 8.6), gridspec_kw={'height_ratios': [1.05, 1]})
    axs[0].imshow(img)
    axs[0].axis('off')
    axs[0].set_title('NOAA CPC Global Ocean Monitoring (Jan 2024), p.7', fontsize=9)
    ax = axs[1]
    ax.set_facecolor('0.45')
    ax.pcolormesh(lon, depth, np.ma.masked_invalid(an), cmap=cmap, norm=BoundaryNorm(lev, cmap.N), shading='nearest')
    cs = ax.contour(lon, depth, np.ma.masked_invalid(an), levels=[-2, 0, 1, 2, 4], colors='k', linewidths=0.6)
    ax.clabel(cs, fmt='%g', fontsize=7)
    ax.set_xlim(112, 296)
    ax.set_ylim(300, 0)
    ax.set_xticks([120, 150, 180, 210, 240, 270])
    ax.set_xticklabels(['120E', '150E', '180', '150W', '120W', '90W'])
    ax.set_title('This pipeline: GODAS pottmp, 2S-2N mean, DEC 2023 minus 1991-2020 DEC', fontsize=9)
    fig.tight_layout()
    fig.savefig(os.path.join(VAL, 'compare_cpc_2023-12.png'), dpi=110)
    plt.close(fig)
    lines += ['## 3. NOAA CPC 공식 그림과 비교 (2023년 12월)', '',
              '`compare_cpc_2023-12.png` — 위: CPC 월간 해양 브리핑 2024년 1월호 7쪽(GODAS, 2°S~2°N, 1991~2020 평년), '
              '아래: 이 파이프라인. 회색은 자료 없음(육지).', '']


def main():
    os.makedirs(VAL, exist_ok=True)
    lines = ['# 1단계 검증 보고서', '', '이 파일은 `pipeline/validate.py`가 만든다.', '']
    nino_check(lines)
    if C.load_work('godas') is not None:
        godas_check(lines)
        cpc_compare(lines)
    with open(os.path.join(VAL, 'REPORT.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    sys.exit(main())
