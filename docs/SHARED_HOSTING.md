# Hosting compartit sense Docker (Dinahosting)

Pensat per allotjament amb **Python 3.9+**, **SSH**, **cron** i (opcionalment) **Node** per construir el frontend. No cal Docker ni instal·lar paquets Python al panell: el pipeline d’ingestió/exportació funciona amb la **biblioteca estàndard**.

## Arquitectura

1. **Cron (Python)** cada ~30 min: `ingest.py` → `export.py` → opcionalment copia JSON a la web.
2. **Frontend estàtic** (Vite): es construeix amb Node i es puja a `public_html` (o equivalent).

GitHub Actions + Pages continua sent vàlid; això és una alternativa al mateix servidor web.

## 1. Pujar el projecte

Per SSH (exemple):

```bash
cd ~
git clone https://github.com/oscarsanchezdm/on-son-les-bicis.git
cd on-son-les-bicis
chmod +x scripts/setup_shared_hosting.sh scripts/run_update.sh
./scripts/setup_shared_hosting.sh
```

Assegura’t que existeix `public/data/static/barris.geojson` (ve amb el repo). No cal regenerar-lo al servidor.

## 2. Variables (`.env`)

```bash
cp .env.example .env
# BICING_TOKEN=...          # opcional; sense token usa GBFS
# WEB_DATA_DIR=/home/USUARI/public_html/data
# DB_RETENTION_DAYS=180     # prune de history.db (0 = off)
```

`WEB_DATA_DIR` ha d’apuntar a la carpeta `data` **dins** del lloc publicat (on el navegador carrega `/data/latest.json`).

Els polígons de barris (`public/data/static/barris.geojson`) ja venen al repositori en WGS84. **No cal** `pip` ni `pyproj` al servidor; només farien falta si es regenerés aquest fitxer des de la font UTM de l’Ajuntament.

## 3. Cron

Al panell de Dinahosting o amb `crontab -e`:

```cron
*/30 * * * * /home/USUARI/on-son-les-bicis/scripts/run_update.sh >> /home/USUARI/on-son-les-bicis/logs/bicing.log 2>&1
```

Comprova el path real de `python3` amb `which python3` si cal: `PYTHON=/usr/bin/python3.9 ./scripts/run_update.sh`.

## 4. Frontend amb Node

Dinahosting permet paquets Node. Al servidor (o en local i després puja `dist/`):

```bash
npm install
npm run build:root          # base=/  (domini o carpeta arrel)
# o: VITE_BASE=/subcarpeta/ npm run build
```

Copia el contingut de `dist/` a `public_html` (o la carpeta del domini). Després el cron actualitza només `data/` via `WEB_DATA_DIR` sense tornar a fer `npm run build`.

## 5. Limitacions

| Tema | Notes |
|------|--------|
| Python 3.9.2 | Compatible (sense sintaxi 3.10+ obligatòria al runtime) |
| `pip` / pyproj | **No calen** per al cron ni per als barris ja commitats. `pyproj` només si regeneres `barris.geojson` amb `--force` |
| Històric JSON | 30 dies a `public/data/history/hourly/` (el que veu la web) |
| SQLite | `db/history.db`; prune a 180 dies (`DB_RETENTION_DAYS`, `0` = off) |
| Open Data BCN | Requereix `BICING_TOKEN`; si falla o no hi ha token → GBFS |

## 6. Prova manual

```bash
./scripts/run_update.sh
tail -n 50 logs/bicing.log
ls -la public/data/latest.json
```
