#!/bin/bash
# Genera deploy key per al servidor (només escriptura al repo)
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)/deploy/ssh"
mkdir -p "$DIR"
if [[ ! -f "$DIR/id_ed25519" ]]; then
  ssh-keygen -t ed25519 -f "$DIR/id_ed25519" -N "" -C "on-son-les-bicis-ingest"
  echo "Clau pública (afegeix-la com a Deploy Key al repo GitHub):"
  cat "$DIR/id_ed25519.pub"
else
  echo "Deploy key ja existeix: $DIR/id_ed25519.pub"
  cat "$DIR/id_ed25519.pub"
fi
