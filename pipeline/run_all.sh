#!/usr/bin/env bash
# 공식 자료 내려받기 → 해역 자르기 → 중간 자료(work/*.npz)
set -euo pipefail
cd "$(dirname "$0")"
python3 gpcp.py
python3 ersst.py
python3 godas.py
python3 ncep_wind.py
python3 build_web.py
python3 validate.py
