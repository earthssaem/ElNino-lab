# 자료 가공 파이프라인 (엘니뇨 실측자료 탐구실)

공식 기관의 원자료를 내려받아 태평양 해역만 잘라 내고, 1991~2020년 월별 평년값과 편차를 직접 계산한다.
임의로 만든 값이나 결측을 채운 값은 쓰지 않는다.

| 스크립트 | 자료 | 받는 곳 | 원자료 단위 | 종류 |
| --- | --- | --- | --- | --- |
| `ersst.py` | NOAA ERSST v5 해수면 온도, 2° | www.ncei.noaa.gov | °C | 관측 재구성 분석 |
| `godas.py` | NCEP GODAS 잠재 수온, 경도 1° × 위도 1/3°, 40층 | downloads.psl.noaa.gov | K → °C | 해양 재분석 |
| `era5.py` | ERA5 월평균 10 m 바람 u·v, 0.25° | NSF NCAR GDEX 사본 ds633.1(tds.gdex.ucar.edu, 2022년까지) + 그 뒤는 Copernicus CDS | m/s | 대기 재분석 |
| `gpcp.py` | GPCP Monthly v2.3(v02r03) 강수, 2.5° | NOAA NODD AWS 사본(원본과 같은 파일) | mm/day → mm/월 | 위성·우량계 분석 |

```bash
pip install -r requirements.txt
python3 validate.py     # 1단계 검증: validation/REPORT.md와 그림
./run_all.sh            # 원자료는 raw/, 중간 자료는 work/ (둘 다 저장소에 넣지 않음)
```

## 처리 원칙

- 기간 1991-01 ~ 2024-12, 평년 1991~2020년 같은 달 평균(`common.climatology`). 결측은 채우지 않고,
  30년 중 24년(80%, WMO 평년값 지침의 기준) 이상 자료가 있는 칸만 평년값을 만든다.
- 강수: mm/day × 그 달의 실제 일수 = mm/월.
- 수온 단면: 2°S~2°N 안의 GODAS 위도 격자(±0.17°, ±0.5°, … ±1.83°)를 먼저 위도 가중 평균한 뒤
  등온선과 편차를 계산한다. 범위 안 위도 중 하나라도 결측(육지)이면 그 칸은 결측.
- 바람 지도: ERA5 0.25° 격자점 중 2° 간격 점의 값을 그대로 뽑는다(평균·보간 없음).
  무역풍 지수는 0.25° 원자료 전체로 계산한 **이 프로젝트의 지역 평균값**이며 공식 기관 지수가 아니다.
- Niño 3.4: ERSST v5, 5°S~5°N·170°W~120°W 위도 가중 평균의 1991~2020년 기준 편차.

## 받을 때 주의

- NCAR 서버(tds.gdex.ucar.edu) 인증서는 emSign 루트를 쓴다. 운영 체제 인증서 목록이 오래되어 검증에 실패하면
  최신 `certifi` 묶음을 `SSL_CERT_FILE`로 지정한다(검증을 끄지 않는다).
- NCAR의 ERA5 월평균 사본은 2022년까지만 있다. 2023년 이후는 Copernicus CDS API 키(`~/.cdsapirc`)가 있어야 받으며,
  키가 없으면 그 해는 값을 만들지 않고 결측('자료 없음')으로 둔다.
- GODAS 원자료는 한 해에 약 100 MB라서 처리한 해는 지운다(`KEEP_RAW=1`이면 남김).

## 검증 결과

`validation/REPORT.md` 참고. Niño 3.4 편차는 NOAA CPC 공식 표와 408개월 모두 0.023 °C 이내로 일치하고,
2023년 12월 적도 수온 편차 단면은 CPC 월간 해양 브리핑 그림과 같은 모습이다(`validation/compare_cpc_2023-12.png`).
