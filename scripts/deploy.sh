#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${GIT_AUTHOR_NAME:-}" ]]; then
  export GIT_AUTHOR_NAME="on-son-les-bicis-bot"
  export GIT_AUTHOR_EMAIL="bot@on-son-les-bicis.local"
  export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
  export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
fi

git add public/data/latest.json public/data/barris-latest.json public/data/stations-latest.geojson public/data/meta.json public/data/history/

if git diff --staged --quiet; then
  echo "No data changes to commit"
  exit 0
fi

TS=$(python3 -c "import json; print(json.load(open('public/data/meta.json'))['last_updated'])")
git commit -m "Actualitza dades Bicing: ${TS}"
git push origin HEAD
