#!/usr/bin/env sh
# Beanie AI launcher for Mac and Linux: ./start.sh
cd "$(dirname "$0")" || exit 1
PY="${BEANIE_PYTHON:-python3}"
if [ ! -x .venv/bin/python ]; then
  echo "Setting up Beanie AI (first time only)..."
  "$PY" -m venv .venv || { echo "Python 3.9 or newer is needed."; exit 1; }
fi
if ! cmp -s requirements.txt .venv/installed.txt; then
  .venv/bin/python -m pip install --disable-pip-version-check -q -r requirements.txt || exit 1
  cp requirements.txt .venv/installed.txt
fi
exec .venv/bin/python -m beanie_ai "$@"
