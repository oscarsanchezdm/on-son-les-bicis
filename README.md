# On són les bicis?

Eina periodística per visualitzar la disponibilitat de bicicletes del Bicing a Barcelona, per estació i per barri.

## Dades

- [Estat d'estacions Bicing (Open Data)](https://opendata-ajuntament.barcelona.cat/data/ca/dataset/estat-estacions-bicing) (font principal, requereix `BICING_TOKEN` — mateix API que [bicing-hassio](https://github.com/oscarsanchezdm/bicing-hassio))
- [GBFS Bicing](https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/gbfs.json) (fallback sense token si Open Data falla)
- [Informació d'estacions](https://opendata-ajuntament.barcelona.cat/data/ca/dataset/informacio-estacions-bicing)
- [Unitats administratives (barris)](https://opendata-ajuntament.barcelona.cat/data/ca/dataset/20170706-districtes-barris)
- [Superfície de barris](https://opendata-ajuntament.barcelona.cat/data/ca/dataset/est-superficie) (opcional)

### Mètriques

- **% bicis disponibles** = `(mecàniques + elèctriques) / capacity`
- **% ancoratges lliures** = `num_docks_available / capacity`
- Agregats per barri: suma de totes les estacions ACTIVE del barri

## Arquitectura

Hi ha dues maneres de mantenir les dades al dia (escull-ne una):

1. **GitHub Actions** (`bicing.yml`): cada **30 min** (UTC, :07 i :37) consulta Open Data / GBFS, fa commit a `public/data/` i desplega a GitHub Pages. El job `ingest` no depèn de l’environment `github-pages` (només `deploy`).
2. **Hosting compartit sense Docker** (p. ex. Dinahosting): Python 3.9 + cron + web estàtica. Guia: [docs/SHARED_HOSTING.md](docs/SHARED_HOSTING.md).

El pipeline Python d’ingestió/exportació **no depèn de Docker** ni de `pip`: funciona amb la biblioteca estàndard (compatible amb Python 3.9.2). Node només cal per construir el frontend.

> **Nota (GitHub Actions):** el `schedule` és best-effort. Si deixa de disparar, ves a **Actions → Bicing** i comprova que el workflow estigui habilitat.

### Històric

- **Web (JSON):** `history/hourly/YYYY-MM-DD-HH.json.gz` es reté **30 dies** (selector de franja al client).
- **SQLite (`db/history.db`, hosting propi):** reté **180 dies** per defecte (`DB_RETENTION_DAYS`; `0` = sense prune). A GitHub Actions el DB és efímer.
- Tuples d’estació: `v` = `[mecànica, elèctrica, total, ancoratges, FS]`; `station-ids.json` fixa l’ordre dels IDs.

## Desenvolupament local (sense Docker)

```bash
cp .env.example .env   # opcional: BICING_TOKEN
python3 scripts/init_db.py
python3 scripts/ingest.py
python3 scripts/export.py
npm install && npm run dev
```

`pip install -r requirements.txt` és opcional (requests/dotenv/pyproj). El cron no els necessita. Per regenerar `barris.geojson` cal `pyproj` i `python3 scripts/fetch_static_data.py --force` (al servidor n’hi ha prou amb el fitxer ja inclòs al repo).

## Hosting compartit (Dinahosting)

```bash
./scripts/setup_shared_hosting.sh
# Cron:
# */30 * * * * /home/USUARI/on-son-les-bicis/scripts/run_update.sh >> .../logs/bicing.log 2>&1
npm install && npm run build:root   # puja dist/ a public_html
```

Detalls: [docs/SHARED_HOSTING.md](docs/SHARED_HOSTING.md).

## Publicar a GitHub Pages

```bash
chmod +x scripts/publish_github.sh
./scripts/publish_github.sh
# Settings → Secrets → BICING_TOKEN
# Settings → Pages → Build: GitHub Actions
```

Més: [docs/GITHUB_PAGES.md](docs/GITHUB_PAGES.md).

## Llicència

MIT — Dades © Ajuntament de Barcelona (CC BY 4.0)
