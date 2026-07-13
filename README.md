# On són les bicis?

Eina periodística per visualitzar la disponibilitat de bicicletes del Bicing a Barcelona, per estació i per barri.

## Dades

- [Estat d'estacions Bicing (Open Data)](https://opendata-ajuntament.barcelona.cat/data/ca/dataset/estat-estacions-bicing) (font principal a GitHub Actions, requereix `BICING_TOKEN` — mateix API que [bicing-hassio](https://github.com/oscarsanchezdm/bicing-hassio))
- [GBFS Bicing](https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/gbfs.json) (fallback sense token si Open Data falla)
- [Informació d'estacions](https://opendata-ajuntament.barcelona.cat/data/ca/dataset/informacio-estacions-bicing)
- [Unitats administratives (barris)](https://opendata-ajuntament.barcelona.cat/data/ca/dataset/20170706-districtes-barris)
- [Superfície de barris](https://opendata-ajuntament.barcelona.cat/data/ca/dataset/est-superficie) (opcional)

### Mètriques

- **% bicis disponibles** = `(mecàniques + elèctriques) / capacity`
- **% ancoratges lliures** = `num_docks_available / capacity`
- Agregats per barri: suma de totes les estacions ACTIVE del barri

## Arquitectura

1. **GitHub Actions** (`fetch-data.yml`): cada **30 min** consulta Open Data BCN amb el secret `BICING_TOKEN` (mateixes URLs que bicing-hassio); si falla, usa GBFS com a fallback. Exporta JSON i fa commit a `public/data/`
2. **GitHub Pages** (`pages.yml`): frontend estàtic (Vite + Leaflet) que llegeix `public/data/*.json`. Es desplega en canvis de codi, **després de cada fetch** (`workflow_run`) i cada 30 min (`schedule`), perquè els commits automàtics de dades no disparen altres workflows.

El repo és **públic**, així que les Actions no consumeixen minuts de facturació.

### Històric (30 dies)

- Fitxers `history/hourly/YYYY-MM-DD-HH.json.gz`: agregats per **barri** i tuples compactes per **estació** (`v`: `[mecànica, elèctrica, total, ancoratges, FS]`)
- `station-ids.json`: ordre estable dels IDs (índex de `v`)
- El client carrega un sol fitxer horari sota demanda (selector de franja) i reconstrueix barris + estacions sense descarregar tot l’històric

## Publicar a GitHub

```bash
# 1. Crea el repo (amb GitHub CLI)
chmod +x scripts/publish_github.sh
./scripts/publish_github.sh

# O manualment:
# - Crea https://github.com/new → on-son-les-bicis
# - git remote add origin https://github.com/oscarsanchezdm/on-son-les-bicis.git
# - git push -u origin main
# - Settings → Secrets → BICING_TOKEN
# - Settings → Pages → Build: GitHub Actions
```

<!--
=============================================================================
DESACTIVAT (juliol 2026): desenvolupament local i servidor propi.
El pipeline actiu és 100% GitHub Actions + GitHub Pages.
Es conserva per futures consultes / reactivació.
=============================================================================

## Desenvolupament local

```bash
cp .env.example .env   # opcional: BICING_TOKEN només per fallback Open Data
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scripts/fetch_static_data.py
python scripts/init_db.py
python scripts/ingest.py
python scripts/export.py
npm install && npm run dev
```

## Desplegament al servidor (`10.10.100.104`)

```bash
# Genera deploy key i afegeix-la al repo GitHub (Settings → Deploy keys)
./scripts/setup_deploy_key.sh

# Provisiona el contenidor (requereix paramiko: pip install paramiko)
export INGEST_PASSWORD=cursor   # o la contrasenya real
export BICING_TOKEN=...         # o deixa que ho llegeixi de .env
python3 scripts/setup_server.py

# O manualment a /root/on-son-les-bicis:
git clone git@github.com:oscarsanchezdm/on-son-les-bicis.git .
cp .env.example .env   # afegir BICING_TOKEN
mkdir -p db deploy/ssh
cp deploy/ssh/id_ed25519 deploy/ssh/
docker compose up -d --build
```
-->

## Llicència

MIT — Dades © Ajuntament de Barcelona (CC BY 4.0)
