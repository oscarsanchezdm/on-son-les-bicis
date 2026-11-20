#!/usr/bin/env bash
# Cron entrypoint for shared hosting (no Docker).
# Example crontab (every 30 min):
#   */30 * * * * /home/USER/on-son-les-bicis/scripts/run_update.sh >> /home/USER/logs/bicing.log 2>&1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

PYTHON="${PYTHON:-}"
if [[ -z "$PYTHON" ]]; then
  if [[ -x "$ROOT/.venv/bin/python" ]]; then
    PYTHON="$ROOT/.venv/bin/python"
  elif command -v python3 >/dev/null 2>&1; then
    PYTHON="$(command -v python3)"
  else
    echo "python3 not found" >&2
    exit 1
  fi
fi

mkdir -p "$ROOT/db" "$ROOT/logs"

"$PYTHON" "$ROOT/scripts/init_db.py"
"$PYTHON" "$ROOT/scripts/ingest.py"
"$PYTHON" "$ROOT/scripts/export.py"
"$PYTHON" "$ROOT/scripts/sync_web_data.py"

echo "OK $(date -u +%Y-%m-%dT%H:%M:%SZ)"
