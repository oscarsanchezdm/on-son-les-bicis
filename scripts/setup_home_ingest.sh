#!/bin/bash
# Provisiona ingestió Open Data al servidor de casa (10.10.100.104).
# Executar DES del servidor o via: ssh cursor@10.10.100.104 'bash -s' < scripts/setup_home_ingest.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/oscarsanchezdm/on-son-les-bicis.git}"
REPO_DIR="${REPO_DIR:-$HOME/on-son-les-bicis}"

if [[ -z "${BICING_TOKEN:-}" ]]; then
  echo "Cal exportar BICING_TOKEN abans d'executar aquest script." >&2
  echo "  export BICING_TOKEN=..." >&2
  exit 1
fi

if ! command -v docker >/dev/null; then
  echo "Docker no trobat. Instal·la Docker abans de continuar." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose no disponible." >&2
  exit 1
fi

if [[ -d "$REPO_DIR/.git" ]]; then
  echo "Actualitzant $REPO_DIR..."
  git -C "$REPO_DIR" fetch origin main
  git -C "$REPO_DIR" checkout main
  git -C "$REPO_DIR" pull --ff-only origin main
else
  echo "Clonant repositori a $REPO_DIR..."
  git clone "$REPO_URL" "$REPO_DIR"
fi

cd "$REPO_DIR"

printf 'BICING_TOKEN=%s\n' "$BICING_TOKEN" > .env
chmod 600 .env

mkdir -p db deploy/ssh
if [[ ! -f deploy/ssh/id_ed25519 ]]; then
  echo "Generant deploy key per push a GitHub..."
  ssh-keygen -t ed25519 -f deploy/ssh/id_ed25519 -N "" -C "on-son-les-bicis-ingest@$(hostname)"
  echo ""
  echo "Afegeix aquesta clau com a Deploy Key (write) al repo GitHub:"
  cat deploy/ssh/id_ed25519.pub
  echo ""
fi

chmod +x scripts/deploy.sh scripts/home_fetch.sh docker/entrypoint.sh

echo "Construint i arrencant el contenidor..."
docker compose build
docker compose up -d

echo ""
docker compose ps
echo ""
echo "Ingestió programada cada 30 min dins el contenidor (cron a /etc/cron.d/bicing)."
echo "Logs: docker compose logs -f"
echo "Prova manual: docker compose exec ingest /app/scripts/home_fetch.sh"
