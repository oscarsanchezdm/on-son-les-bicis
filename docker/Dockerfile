FROM python:3.12-slim

# DESACTIVAT (juliol 2026): imatge per ingestió local. Pipeline actiu: GitHub Actions.

RUN apt-get update && apt-get install -y --no-install-recommends \
    git cron ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x scripts/deploy.sh scripts/*.py

COPY docker/crontab /etc/cron.d/bicing
RUN chmod 0644 /etc/cron.d/bicing && crontab /etc/cron.d/bicing

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV DB_PATH=/data/history.db
VOLUME ["/data"]

ENTRYPOINT ["/entrypoint.sh"]
