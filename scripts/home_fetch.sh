#!/bin/bash
# Ingestió Open Data + export + push (servidor de casa, cada 30 min via cron al contenidor)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== $(date -Is) home_fetch start ==="

python3 scripts/ingest.py
python3 scripts/export.py
"$ROOT/scripts/deploy.sh"

echo "=== $(date -Is) home_fetch done ==="
