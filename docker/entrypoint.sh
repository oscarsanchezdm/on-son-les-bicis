#!/bin/bash
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
  chmod 700 /root/.ssh
  ssh-keyscan github.com >> /root/.ssh/known_hosts 2>/dev/null || true
  export GIT_SSH_COMMAND="ssh -i /root/.ssh/id_ed25519 -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
fi

if [[ -d /app/.git ]]; then
  git -C /app config user.name "on-son-les-bicis-bot" || true
  git -C /app config user.email "bot@on-son-les-bicis.local" || true
  git -C /app remote set-url origin git@github.com:oscarsanchezdm/on-son-les-bicis.git || true
  git -C /app checkout main 2>/dev/null || true
  git -C /app pull --ff-only origin main 2>/dev/null || true
fi

touch /var/log/bicing-fetch.log
chmod 0644 /etc/cron.d/bicing
cron
tail -F /var/log/bicing-fetch.log
