#!/usr/bin/env bash
# First-time setup on shared hosting (Dinahosting-style: SSH + cron, no Docker).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PYTHON="${PYTHON:-python3}"
command -v "$PYTHON" >/dev/null || { echo "Need python3 on PATH"; exit 1; }

echo "==> Python: $($PYTHON --version 2>&1)"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env — add BICING_TOKEN if you use Open Data BCN (GBFS works without it)."
fi

# Optional venv (recommended if pip --user is allowed)
if [[ "${SKIP_VENV:-}" != "1" ]] && "$PYTHON" -m venv --help >/dev/null 2>&1; then
  if [[ ! -d .venv ]]; then
    echo "==> Creating .venv"
    "$PYTHON" -m venv .venv || echo "venv failed; continuing with system Python (stdlib-only pipeline)"
  fi
fi

PY="$PYTHON"
if [[ -x .venv/bin/python ]]; then
  PY="$ROOT/.venv/bin/python"
  echo "==> Using $PY"
  # Optional deps for GitHub Actions parity; pipeline works without them
  if "$PY" -m pip --version >/dev/null 2>&1; then
    "$PY" -m pip install --upgrade pip >/dev/null
    "$PY" -m pip install -r requirements.txt || \
      echo "pip install failed — OK: ingest/export use the standard library only"
  fi
fi

mkdir -p db logs
"$PY" scripts/init_db.py
if [[ ! -f public/data/static/barris.geojson ]]; then
  echo "Missing public/data/static/barris.geojson — clone the full repo or run fetch_static_data.py where pyproj is available."
  exit 1
fi

"$PY" scripts/ingest.py
"$PY" scripts/export.py

chmod +x scripts/run_update.sh scripts/setup_shared_hosting.sh

echo
echo "Setup done. Cron example (every 30 minutes):"
echo "  */30 * * * * $ROOT/scripts/run_update.sh >> $ROOT/logs/bicing.log 2>&1"
echo
echo "Frontend (Node on the host or build locally and upload dist/):"
echo "  npm install && VITE_BASE=/ npm run build"
echo "  # copy dist/* to public_html (and set WEB_DATA_DIR in .env to .../data)"
