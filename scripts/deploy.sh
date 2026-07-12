#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-on-son-les-bicis-bot}"
export GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-bot@on-son-les-bicis.local}"
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"

if [[ -f /root/.ssh/id_ed25519 ]]; then
  export GIT_SSH_COMMAND="ssh -i /root/.ssh/id_ed25519 -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
fi

git add public/data

if git diff --staged --quiet; then
  echo "No data changes to commit"
  exit 0
fi

TS=$(python3 -c "import json; print(json.load(open('public/data/meta.json'))['last_updated'])")
git commit -m "Actualitza dades Bicing (casa): ${TS}"

for attempt in 1 2 3 4; do
  if git pull --rebase origin main && git push origin main; then
    exit 0
  fi
  git rebase --abort 2>/dev/null || true
  if [[ "$attempt" -eq 4 ]]; then
    echo "Failed to push after ${attempt} attempts" >&2
    exit 1
  fi
  sleep $((attempt * 4))
done
