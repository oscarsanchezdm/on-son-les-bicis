# On són les bicis?

Eina periodística per visualitzar la disponibilitat de bicicletes del Bicing a Barcelona, per estació i per barri.

## Dades

- [Estat d'estacions Bicing](https://opendata-ajuntament.barcelona.cat/data/ca/dataset/estat-estacions-bicing) (temps real, token)
- [Informació d'estacions](https://opendata-ajuntament.barcelona.cat/data/ca/dataset/informacio-estacions-bicing)
- [Unitats administratives (barris)](https://opendata-ajuntament.barcelona.cat/data/ca/dataset/20170706-districtes-barris)
- [Superfície de barris](https://opendata-ajuntament.barcelona.cat/data/ca/dataset/est-superficie) (opcional)

### Mètriques

- **% bicis disponibles** = `(mecàniques + elèctriques) / capacity`
- **% ancoratges lliures** = `num_docks_available / capacity`
- Agregats per barri: suma de totes les estacions ACTIVE del barri

## Arquitectura

1. **Servidor privat** (`10.10.100.104`): contenidor Docker amb cron cada 10 min → SQLite → export JSON → `git push`
2. **GitHub Pages**: frontend estàtic (Vite + Leaflet) que llegeix `public/data/*.json`
3. **GitHub Actions**: deploy del frontend + fallback de dades si el servidor no actualitza

## Desenvolupament local

```bash
cp .env.example .env   # afegir BICING_TOKEN
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scripts/fetch_static_data.py
python scripts/init_db.py
python scripts/ingest.py
python scripts/export.py
npm install && npm run dev
```

## Desplegament al servidor

```bash
# A /root/on-son-les-bicis
cp .env.example .env
# Configurar BICING_TOKEN i deploy key a deploy/ssh/
docker compose up -d --build
```

## Llicència

MIT — Dades © Ajuntament de Barcelona (CC BY 4.0)
