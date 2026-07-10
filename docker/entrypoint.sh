#!/bin/bash
# =============================================================================
# DESACTIVAT (juliol 2026): ingestió local via Docker. Pipeline actiu: GitHub Actions.
# =============================================================================
set -euo pipefail

if [[ ! -f /data/history.db ]]; then
  python /app/scripts/init_db.py
fi

if [[ ! -f /app/public/data/static/barris.geojson ]]; then
  python /app/scripts/fetch_static_data.py
fi

if [[ -f /root/.ssh/id_ed25519 ]]; then
  eval "$(ssh-agent -s)" >/dev/null
  ssh-add /root/.ssh/id_ed25519
  mkdir -p /root/.ssh
  ssh-keyscan github.com >> /root/.ssh/known_hosts 2>/dev/null || true
  export GIT_SSH_COMMAND="ssh -i /root/.ssh/id_ed25519 -o IdentitiesOnly=yes"
fi

# Initial data pull if repo is mounted
if [[ -d /app/.git ]]; then
  git -C /app config user.name "on-son-les-bicis-bot" || true
  git -C /app config user.email "bot@on-son-les-bicis.local" || true
  git -C /app remote set-url origin git@github.com:oscarsanchezdm/on-son-les-bicis.git || true
fi

touch /var/log/bicing-ingest.log /var/log/bicing-export.log /var/log/bicing-deploy.log
cron
tail -F /var/log/bicing-ingest.log /var/log/bicing-export.log /var/log/bicing-deploy.log
