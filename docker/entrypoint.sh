#!/bin/bash
set -euo pipefail

if [[ ! -f /data/history.db ]]; then
  python /app/scripts/init_db.py
fi

if [[ ! -f /app/public/data/static/barris.geojson ]]; then
  python /app/scripts/fetch_static_data.py
fi

# Configure git for deploy if mounted
if [[ -f /root/.ssh/id_ed25519 ]]; then
  eval "$(ssh-agent -s)"
  ssh-add /root/.ssh/id_ed25519
  mkdir -p /root/.ssh
  ssh-keyscan github.com >> /root/.ssh/known_hosts 2>/dev/null || true
fi

touch /var/log/bicing-ingest.log /var/log/bicing-export.log /var/log/bicing-deploy.log
cron
tail -F /var/log/bicing-ingest.log /var/log/bicing-export.log /var/log/bicing-deploy.log
