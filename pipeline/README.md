# 자료 가공 파이프라인 (엘니뇨 실측자료 탐구실)

공식 기관의 원자료를 내려받아 태평양 해역만 잘라 내고, 1991~2020년 월별 평년값과 편차를 직접 계산한다.
임의로 만든 값이나 결측을 채운 값은 쓰지 않는다.

| 스크립트 | 자료 | 받는 곳 | 원자료 단위 | 종류 |
| --- | --- | --- | --- | --- |
| `ersst.py` | NOAA ERSST v5 해수면 온도, 2° | www.ncei.noaa.gov | °C | 관측 재구성 분석 |
| `godas.py` | NCEP GODAS 잠재 수온, 경도 1° × 위도 1/3°, 40층 | downloads.psl.noaa.gov | K → °C | 해양 재분석 |
| `ncep_wind.py` | NCEP/NCAR Reanalysis 1 월평균 10 m 바람 u·v, T62 가우스 격자(1.875° × 약 1.9°) | downloads.psl.noaa.gov | m/s | 대기 재분석 |
| `gpcp.py` | GPCP Monthly v2.3(v02r03) 강수, 2.5° | NOAA NODD AWS 사본(원본과 같은 파일) | mm/day → mm/월 | 위성·우량계 분석 |

```bash
pip install -r requirements.txt
python3 validate.py     # 1단계 검증: validation/REPORT.md와 그림
./run_all.sh            # 원자료는 raw/, 중간 자료는 work/ (둘 다 저장소에 넣지 않음)
```

## 웹앱용 자료 (`build_web.py` → `observatory/data/`)

| 파일 | 내용 |
| --- | --- |
| `meta.json` | 사례·월 목록, 격자 좌표, 정수 배율(scale), 해역 정의 |
| `clim.json` | 1991~2020 월별 평년값(해수면 온도, 강수, u, v, 단면) |
| `case-1997.json` 등 | 사례 기간(앞뒤 해 포함) 월별 실제 값 |
| `series.json` | 1991~2024 Niño 3.4(값·편차), 무역풍 지역 평균(값·편차) |

값은 `정수 × scale`(해수면 온도·단면 0.01 °C, 강수 0.1 mm/월, 바람 0.01 m/s)이고 결측은 `null`이다.

## 처리 원칙

- 기간 1991-01 ~ 2024-12, 평년 1991~2020년 같은 달 평균(`common.climatology`). 결측은 채우지 않고,
  30년 중 24년(80%, WMO 평년값 지침의 기준) 이상 자료가 있는 칸만 평년값을 만든다.
- 강수: mm/day × 그 달의 실제 일수 = mm/월.
- 수온 단면: 2°S~2°N 안의 GODAS 위도 격자 12개(±0.17°, ±0.5°, … ±1.83°) 중 그 달·그 수심에서 값이 있는
  해양 격자만 위도 가중 평균한 뒤 등온선과 편차를 계산한다. 육지 격자는 빼고 남은 해양 격자의 실제 값은 그대로 쓰며,
  빠진 격자를 보간·생성하지 않는다. 유효 격자가 0개면 결측. 칸마다 평균에 쓴 격자 수(`count`, `ocean_count`)를
  함께 저장하고, 해양 격자가 6개 미만(`SEC_MIN_OCEAN`)인 칸은 웹앱에서 '대표성 낮음'(빗금)으로 표시한다.
  비교용으로 이전 규칙(하나라도 결측이면 결측)의 단면 `section_strict`도 저장한다.
- 바람: 1991~2024 전 기간을 NCEP/NCAR Reanalysis 1 하나로 가공한다(ERA5와 섞지 않음). 지도에는 원자료 격자점 값을
  그대로 쓴다(보간·평균 없음). 무역풍 지수는 5°S~5°N 격자의 10 m 동서 바람(u) 위도 가중 평균으로
  **이 프로젝트가 직접 계산한 값**이며 공식 기관 지수가 아니다. 경도 범위는 NOAA CPC 850 hPa 무역풍 지수와 같다
  (서 135°E~180°, 중앙 175°W~140°W, 동 135°W~120°W).
- 검증용으로 같은 R1의 850 hPa 바람으로 CPC 무역풍 지수를 재현한다(`ncep_wind.run_850`).
- Niño 3.4: ERSST v5, 5°S~5°N·170°W~120°W 위도 가중 평균의 1991~2020년 기준 편차.

## 받을 때 주의

- GODAS 원자료는 한 해에 약 100 MB라서 처리한 해는 지운다(`KEEP_RAW=1`이면 남김).
- 검증용 R1 850 hPa 파일은 약 440 MB다.
- ERA5(Copernicus CDS)는 쓰지 않는다. NCEP/NCAR 자료를 받을 수 없게 되면 다른 자료로 몰래 바꾸지 말고
  CDS API(`reanalysis-era5-single-levels-monthly-means`)로 1991~2024 전 기간을 다시 가공한다.

## 검증 결과

`validation/REPORT.md` 참고. Niño 3.4 편차는 NOAA CPC 공식 표와 408개월 모두 0.023 °C 이내로 일치하고,
2023년 12월 적도 수온 편차 단면은 CPC 월간 해양 브리핑 그림과 같은 모습이다(`validation/compare_cpc_2023-12.png`).
같은 R1 850 hPa 자료로 계산한 무역풍 지수는 CPC 공식 지수와 상관계수 0.998~0.9995로 일치한다.
