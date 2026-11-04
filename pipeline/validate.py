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

LAND = []
try:
    import json as _json
    _src = open(os.path.join(os.path.dirname(C.ROOT), 'js', 'land.js'), encoding='utf-8').read()
    LAND = _json.loads(_src[_src.index('ENSO_LAND=') + 10:_src.rindex(']') + 1])
except (OSError, ValueError):
    pass

VAL = os.path.join(C.ROOT, 'validation')
CPC_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/'


def cpc_file(name):
    return C.download(CPC_URL + name, os.path.join(C.RAW, 'cpc', name))


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


def lon_label1(x):
    return '%.1f°E' % x if x <= 180 else '%.1f°W' % (360 - x)


def nino_check(lines):
    d = C.load_work('ersst')
    t = list(d['time'])
    n = d['nino34']
    cl = C.climatology(n, t)
    an = n - np.array([cl[int(x[5:7]) - 1] for x in t])
    cpc = {}
    for line in open(cpc_file('ersst5.nino.mth.91-20.ascii')).read().splitlines()[1:]:
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
    oc, cnt, nlat = g['ocean_count'], g['count'], len(g['lat_used'])
    lines += ['- 위도 평균 규칙: 그 달·그 수심에서 값이 있는 해양 격자만 위도 가중 평균(육지 격자 제외). '
              '유효 격자가 0개면 결측. 빠진 격자를 보간·생성하지 않음.',
              '- 해양 격자가 하나도 없어 결측인 경도(표층 기준): %s' % ', '.join('%.1f' % x for x in lon[oc[0] == 0]), '']
    # 경도별 해양 격자 수(표층·100 m·300 m)
    zsel = [int(np.argmin(np.abs(depth - z))) for z in (5, 105, 303, 459)]
    part = np.where(((oc > 0) & (oc < nlat)).any(axis=0))[0]
    lines += ['### 해양 격자가 일부만 있는 경도 (평균에 쓴 위도 격자 수 / %d)' % nlat, '',
              '| 경도 | ' + ' | '.join('%.0f m' % depth[k] for k in zsel) + ' | 대표성 |', '|---' * (len(zsel) + 2) + '|']
    for i in part:
        low = any(0 < oc[k, i] < C.SEC_MIN_OCEAN for k in zsel)
        lines.append('| %s | %s | %s |' % (lon_label1(lon[i]),
                     ' | '.join(str(int(oc[k, i])) for k in zsel), '낮음(%d개 미만 칸 있음)' % C.SEC_MIN_OCEAN if low else '보통'))
    sporadic = (cnt < oc[None]) & (oc[None] > 0)
    nsp = sporadic.reshape(len(t), -1).sum(axis=1)
    lines += ['', '- 해양 격자인데 그 달 원자료가 결측이라 평균에서 빠진 경우: %d개월에서 모두 %d칸 (그 칸은 남은 격자로 평균, 남은 격자가 없으면 결측)'
              % (int((nsp > 0).sum()), int(nsp.sum())),
              '- 대표성 낮음 기준: 위도 격자 %d개 중 해양 격자가 %d개 미만인 칸(웹앱 단면에 빗금으로 표시)' % (nlat, C.SEC_MIN_OCEAN)]
    st = g['section_strict']
    both = np.isfinite(st) & np.isfinite(sec)
    lines += ['- 이전 규칙과의 차이: 이전에도 값이 있던 칸의 최대 차이 %.2e °C (같은 칸은 값이 그대로), '
              '이번에 새로 값이 생긴 칸 %d개(월×수심×경도 합계)' % (np.abs(st[both] - sec[both]).max(), int((np.isfinite(sec) & ~np.isfinite(st)).sum()))]
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


def before_after(lines):
    """수정 전(위도 하나라도 결측이면 결측) ↔ 수정 후(유효 해양 격자만 평균) 단면 비교 그림."""
    g = C.load_work('godas')
    t = list(g['time'])
    lon, depth, oc = g['lon'], g['depth'], g['ocean_count']
    new, old = g['section'], g['section_strict']
    cn, co = C.climatology(new, t), C.climatology(old, t)
    lev = [-5, -4, -3, -2, -1, -0.5, 0.5, 1, 2, 3, 4, 5]
    cmapA = plt.get_cmap('RdBu_r', len(lev) - 1)
    rows = [('2023-12', 'temp'), ('2023-12', 'anom'), ('1997-12', 'temp'), ('1997-12', 'anom')]
    fig, axs = plt.subplots(len(rows), 2, figsize=(13, 2.7 * len(rows)))
    low = (oc > 0) & (oc < C.SEC_MIN_OCEAN)
    for r, (ym, kind) in enumerate(rows):
        i, m = t.index(ym), int(ym[5:7]) - 1
        for c, (name, sec, clim) in enumerate([('BEFORE (any missing lat -> missing)', old, co), ('AFTER (valid ocean cells only)', new, cn)]):
            ax = axs[r, c]
            ax.set_facecolor('0.55')
            if kind == 'temp':
                pc = ax.pcolormesh(lon, depth, np.ma.masked_invalid(sec[i]), cmap='turbo', vmin=8, vmax=31, shading='nearest')
                ax.set_ylim(500, 0)
            else:
                pc = ax.pcolormesh(lon, depth, np.ma.masked_invalid(sec[i] - clim[m]), cmap=cmapA, norm=BoundaryNorm(lev, cmapA.N), shading='nearest')
                ax.set_ylim(300, 0)
            ax.plot(lon, iso_line(sec[i], depth), 'k-', lw=1.6)
            ax.plot(lon, iso_line(clim[m], depth), 'k--', lw=1.1)
            if c == 1:
                ax.contourf(lon, depth, low.astype(float), levels=[0.5, 1.5], colors='none', hatches=['////'])
            ax.set_xlim(120, 285)
            ax.set_xticks(range(120, 286, 20))
            ax.set_xticklabels([lon_label(x) for x in range(120, 286, 20)], fontsize=6.5)
            ax.axvspan(130.5, 138.5, ymin=0, ymax=1, fill=False, ec='m', lw=1.2, ls=':')
            ax.set_title('%s  %s  %s' % (ym, 'temperature' if kind == 'temp' else 'anomaly (clim 1991-2020)', name), fontsize=8)
            fig.colorbar(pc, ax=ax, pad=0.01)
    fig.suptitle('GODAS 2S-2N mean section: magenta box = 130.5-138.5E (north of New Guinea); hatch = fewer than %d of 12 latitude cells are ocean' % C.SEC_MIN_OCEAN, fontsize=9)
    fig.tight_layout()
    fig.savefig(os.path.join(VAL, 'section_before_after.png'), dpi=105)
    plt.close(fig)
    pts = [124.5, 128.5, 131.5, 133.5, 135.5, 137.5, 140.5]
    lines += ['## 2-1. 뉴기니 북쪽 위도 평균 규칙 수정 전후', '',
              '`section_before_after.png` — 왼쪽 수정 전, 오른쪽 수정 후(2023년 12월·1997년 12월, 실제 수온과 편차).', '',
              '| 월 | 경도 | 해양 격자(표층) | 20 ℃ 등온선 수정 전 | 수정 후 | 같은 달 평년(수정 후) |', '| --- | --- | --- | --- | --- | --- |']
    for ym in ['2023-12', '1997-12']:
        i, m = t.index(ym), int(ym[5:7]) - 1
        a, b, cc = iso_line(old[i], depth), iso_line(new[i], depth), iso_line(cn[m], depth)
        for p in pts:
            j = int(np.argmin(np.abs(lon - p)))
            f = lambda v: '측정 불가' if not np.isfinite(v) else '%.0f m' % v
            lines.append('| %s | %.1f°E | %d/12 | %s | %s | %s |' % (ym, lon[j], oc[0, j], f(a[j]), f(b[j]), f(cc[j])))
    lines.append('')


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
    oc = g['ocean_count']
    ax.contourf(lon, depth, ((oc > 0) & (oc < C.SEC_MIN_OCEAN)).astype(float), levels=[0.5, 1.5], colors='none', hatches=['////'])
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


CPC_WIND = {'west': 'wpac850', 'central': 'cpac850', 'east': 'epac850'}


def parse_cpc_wind(path):
    out, sec = {}, None
    for line in open(path).read().splitlines():
        if 'ORIGINAL' in line:
            sec = 'orig'
        elif 'ANOMALY' in line:
            sec = 'anom'
        elif 'STANDARDIZED' in line:
            sec = 'std'
        p = line.split()
        if sec and len(p) == 13 and p[0].isdigit():
            for m in range(12):
                v = float(p[m + 1])
                if v > -99:
                    out.setdefault(sec, {})['%s-%02d' % (p[0], m + 1)] = v
    return out


def wind_check(lines):
    w = C.load_work('wind')
    w8 = C.load_work('wind850')
    t = list(w['time'])
    lines += ['## 4. 무역풍 (NCEP/NCAR Reanalysis 1, 1991~2024 전 기간 같은 자료)', '',
              '- 10 m 바람 격자: T62 가우스 격자, 경도 1.875° × 위도 약 1.9°, 지도 범위 안 %d×%d점, 단위 m/s'
              % (len(w['lat']), len(w['lon'])),
              '- 결측: u %d개, v %d개' % (int(np.isnan(w['u']).sum()), int(np.isnan(w['v']).sum())), '',
              '### 4-1. 가공 방법 검증: 같은 R1 850 hPa 자료로 NOAA CPC 무역풍 지수 재현', '',
              'CPC 지수는 R1(CDAS)의 850 hPa 동서 바람을 5°N~5°S에서 평균하고 동풍을 양수로 나타낸 값이다. '
              '같은 방법으로 직접 계산해 CPC 공식 값과 비교했다(해역·부호·날짜 대응 확인).', '',
              '| 해역 | CPC 파일 | 개월 | 상관계수 | 평균 차이 | 최대 차이 |', '| --- | --- | --- | --- | --- | --- |']
    t8 = list(w8['time'])
    fig, axs = plt.subplots(3, 1, figsize=(10, 7.5), sharex=True)
    for ax, r in zip(axs, C.WIND_REGIONS):
        c = parse_cpc_wind(cpc_file(CPC_WIND[r['id']]))
        x = w8['easterly_' + r['id']]
        com = [m for m in t8 if m in c['orig']]
        a = np.array([x[t8.index(m)] for m in com])
        b = np.array([c['orig'][m] for m in com])
        lines.append('| %s (%s) | %s | %d | %.4f | %+.3f m/s | %.2f m/s |' % (
            r['name'], '%g~%g°E' % r['lon'], CPC_WIND[r['id']], len(com), np.corrcoef(a, b)[0, 1], (a - b).mean(), abs(a - b).max()))
        # 10 m 지수 편차(1991~2020) vs CPC 850 hPa 편차(1981~2010 기준, 공식 표)
        u10 = w['idx_' + r['id']]
        cl = C.climatology(u10, t)
        an10 = u10 - np.array([cl[int(m[5:7]) - 1] for m in t])
        com2 = [m for m in t if m in c['anom']]
        p = np.array([-an10[t.index(m)] for m in com2])     # 동풍 강화 = 양수로 맞춤
        q = np.array([c['anom'][m] for m in com2])
        r['corr10'] = np.corrcoef(p, q)[0, 1]
        xs = np.arange(len(com2))
        ax.plot(xs, q, color='0.6', lw=2.2, label='CPC 850 hPa trade wind index anomaly (official)')
        ax.plot(xs, p * 2, color='C0', lw=1, label='this pipeline: R1 10 m u anomaly x(-2)')
        ax.axhline(0, color='k', lw=0.5)
        ax.set_ylabel('m/s')
        ax.set_title('%s  corr=%.2f' % (r['id'], r['corr10']), fontsize=8)
        ax.legend(fontsize=7, loc='lower left')
        ax.set_xticks(xs[::36])
        ax.set_xticklabels([com2[i][:4] for i in xs[::36]])
    fig.tight_layout()
    fig.savefig(os.path.join(VAL, 'wind_index_vs_cpc.png'), dpi=110)
    plt.close(fig)
    lines += ['', '### 4-2. 10 m 지수와 CPC 850 hPa 지수의 관계', '',
              '고도가 달라 값의 크기는 같지 않으므로 편차의 상관만 본다(10 m는 1991~2020, CPC 표는 1981~2010 평년 기준).', '']
    for r in C.WIND_REGIONS:
        lines.append('- %s: 상관계수 %.2f' % (r['name'], r['corr10']))
    lines += ['', '### 4-3. 대표 엘니뇨 시기의 10 m 동서 바람 (m/s, 괄호는 1991~2020 같은 달 평년 대비 편차)', '',
              '| 월 | ' + ' | '.join(r['name'] for r in C.WIND_REGIONS) + ' | Niño 3.4 편차 |', '|---' * 5 + '|']
    e = C.load_work('ersst')
    nc = C.climatology(e['nino34'], t)
    na = e['nino34'] - np.array([nc[int(m[5:7]) - 1] for m in t])
    for ym in ['1996-12', '1997-03', '1997-06', '1997-12', '1998-06', '2014-12', '2015-06', '2015-12',
               '2022-12', '2023-06', '2023-12', '2024-06']:
        i = t.index(ym)
        cells = []
        for r in C.WIND_REGIONS:
            x = w['idx_' + r['id']]
            cl = C.climatology(x, t)
            cells.append('%+.1f (%+.1f)' % (x[i], x[i] - cl[int(ym[5:7]) - 1]))
        lines.append('| %s | %s | %+.2f °C |' % (ym, ' | '.join(cells), na[i]))
    # 화살표 지도 점검 그림
    la, lo = w['lat'], w['lon']
    cu, cv = C.climatology(w['u'], t), C.climatology(w['v'], t)
    fig, axs = plt.subplots(2, 1, figsize=(10, 6.5))
    for ax, (ttl, uu, vv) in zip(axs, [('DEC climatology 1991-2020', cu[11], cv[11]),
                                         ('DEC 1997', w['u'][t.index('1997-12')], w['v'][t.index('1997-12')])]):
        ax.quiver(lo[::2], la[::2], uu[::2, ::2], vv[::2, ::2], scale=150, width=0.0022)
        ax.quiverkey(ax.quiver([], [], [], []) if False else ax.collections[0], 0.92, 1.04, 5, '5 m/s', labelpos='E')
        for ring in LAND:
            ax.plot(ring[0::2], ring[1::2], color='0.5', lw=0.5)
        ax.set_xlim(100, 290)
        ax.set_ylim(-30, 30)
        ax.set_aspect('equal')
        ax.set_title('NCEP/NCAR R1 10 m wind, ' + ttl, fontsize=9)
    fig.tight_layout()
    fig.savefig(os.path.join(VAL, 'wind_map_check.png'), dpi=110)
    plt.close(fig)
    i = t.index('1997-12')
    j0, k0 = int(np.argmin(np.abs(la - 0.95))), int(np.argmin(np.abs(lo - 200.6)))
    j1 = int(np.argmin(np.abs(la + 10.5)))
    k1 = int(np.argmin(np.abs(lo - 249.4)))     # 110°W (남태평양 수렴대 SPCZ를 피한 동태평양)
    j2 = int(np.argmin(np.abs(la - 12.4)))
    checks = [('평년(12월) 적도 160°W 부근은 동풍(u<0)', cu[11][j0, k0] < 0, 'u=%.2f m/s' % cu[11][j0, k0]),
              ('평년 남반구 10°S·110°W 부근은 남동 무역풍(u<0, v>0)', cu[11][j1, k1] < 0 and cv[11][j1, k1] > 0,
               'u=%.2f, v=%.2f' % (cu[11][j1, k1], cv[11][j1, k1])),
              ('평년 북반구 12°N·160°W 부근은 북동 무역풍(u<0, v<0)', cu[11][j2, k0] < 0 and cv[11][j2, k0] < 0,
               'u=%.2f, v=%.2f' % (cu[11][j2, k0], cv[11][j2, k0])),
              ('1997-12 중앙 태평양 지수: 평년보다 약하지만 여전히 동풍', -0 > w['idx_central'][i] > C.climatology(w['idx_central'], t)[11],
               '%.2f m/s (평년 %.2f)' % (w['idx_central'][i], C.climatology(w['idx_central'], t)[11]))]
    lines += ['', '### 4-4. 자동 점검', '']
    for name, ok, info in checks:
        lines.append('- %s %s %s' % ('✅' if ok else '❌', name, info))
    lines.append('')


def main():
    os.makedirs(VAL, exist_ok=True)
    lines = ['# 1단계 검증 보고서', '', '이 파일은 `pipeline/validate.py`가 만든다.', '']
    nino_check(lines)
    if C.load_work('godas') is not None:
        godas_check(lines)
        before_after(lines)
        cpc_compare(lines)
    if C.load_work('wind') is not None:
        wind_check(lines)
    with open(os.path.join(VAL, 'REPORT.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    sys.exit(main())
