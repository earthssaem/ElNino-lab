"""NOAA CPC 공식 ENSO 기록(계절별 엘니뇨·라니냐 판정)을 읽어 월별 상태로 정리한다.

- 공식 감시 지수: Relative Oceanic Niño Index (RONI, ERSST v6) — NWS Public Information Statement 26-05부터
  NOAA CPC가 ENSO 공식 감시·예측에 쓰는 지수.
    https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/
- 참고: 기존 ONI (ERSST v5) 표 — 역사적 참고용으로 계속 갱신된다.
    https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/oni/v5/
CPC 표에서 3개월 이동 평균이 ±0.5 °C 기준을 겹치는 5개 계절 이상 연속해서 넘은 계절이 빨강(엘니뇨)·파랑(라니냐)으로
칠해진다. 이 스크립트는 그 색(공식 판정)을 그대로 읽으며, 판정을 다시 계산하지 않는다.
계절(DJF, JFM, …)은 가운데 달에 대응시킨다(DJF → 1월, …, NDJ → 12월).
"""
import html
import os
import re

import numpy as np

import common as C

URLS = {
    'roni': 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/',
    'oni5': 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/oni/v5/',
}


def parse_roni(text):
    out = {}
    for y, row in re.findall(r'<th scope="row"><p>(\d{4})</p></th>(.*?)</tr>', text, re.S):
        cells = re.findall(r'<span class="roni-(warm|cold|normal)"[^>]*>([^<]*)</span>', row)
        for m, (cls, v) in enumerate(cells[:12]):
            if v.strip():
                out['%s-%02d' % (y, m + 1)] = (float(v), {'warm': 1, 'cold': -1, 'normal': 0}[cls])
    return out


def parse_oni5(text):
    out = {}
    for y, row in re.findall(r'<strong>(\d{4})</strong></font></td>(.*?)</tr>', text, re.S):
        cells = re.findall(r'<span style="color:(red|blue|black)">(?:<strong>)?<font[^>]*>([^<]*)</font>', row)
        for m, (col, v) in enumerate(cells[:12]):
            v = html.unescape(v).strip()
            if v and v != '\xa0':
                out['%s-%02d' % (y, m + 1)] = (float(v), {'red': 1, 'blue': -1, 'black': 0}[col])
    return out


def episodes(rec, months):
    """연속한 같은 부호의 공식 판정 달을 묶어 [(시작, 끝, +1|-1)]."""
    eps, cur = [], None
    for m in months:
        s = rec.get(m, (None, 0))[1]
        if cur and s == cur[2] and s != 0:
            cur[1] = m
        else:
            if cur and cur[2] != 0:
                eps.append(tuple(cur))
            cur = [m, m, s]
    if cur and cur[2] != 0:
        eps.append(tuple(cur))
    return eps


def run():
    res = {}
    for k, u in URLS.items():
        p = C.download(u, os.path.join(C.RAW, 'cpc', 'enso_%s.html' % k))
        text = open(p, encoding='utf-8', errors='replace').read()
        res[k] = parse_roni(text) if k == 'roni' else parse_oni5(text)
        if len(res[k]) < 400:
            raise RuntimeError('%s 표를 읽지 못했습니다(%d개월)' % (k, len(res[k])))
    tl = C.months()
    out = {'time': np.array(tl)}
    for k in res:
        out[k + '_value'] = np.array([res[k].get(m, (np.nan, 0))[0] for m in tl])
        out[k + '_state'] = np.array([res[k].get(m, (np.nan, 0))[1] for m in tl], dtype='i1')
    C.save_work('enso', **out)
    for k in res:
        print(k, [(a, b, '엘니뇨' if s > 0 else '라니냐') for a, b, s in episodes(res[k], tl)])


if __name__ == '__main__':
    run()
