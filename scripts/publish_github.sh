#!/bin/bash
# Crea el repo a GitHub i configura el secret BICING_TOKEN (requereix gh CLI autenticat)
set -euo pipefail
REPO="oscarsanchezdm/on-son-les-bicis"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v gh >/dev/null 2>&1; then
  echo "Cal instal·lar GitHub CLI: https://cli.github.com/"
  echo "Alternativa manual:"
  echo "  1. Crea el repo $REPO a GitHub"
  echo "  2. git remote add origin https://github.com/$REPO.git"
  echo "  3. git push -u origin main"
  echo "  4. Afegeix secret BICING_TOKEN a Settings → Secrets → Actions"
  exit 1
fi

gh repo create "$REPO" --public --source="$ROOT" --remote=origin --push
gh secret set BICING_TOKEN --repo "$REPO" < "$ROOT/.env" 2>/dev/null || \
  gh secret set BICING_TOKEN --repo "$REPO" --body "$(grep BICING_TOKEN "$ROOT/.env" | cut -d= -f2-)"

echo "Repo publicat: https://github.com/$REPO"
echo "Activa GitHub Pages: Settings → Pages → Source: GitHub Actions"
