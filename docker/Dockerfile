FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git cron ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x scripts/deploy.sh scripts/home_fetch.sh scripts/*.py

COPY docker/crontab /etc/cron.d/bicing
RUN chmod 0644 /etc/cron.d/bicing

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV DB_PATH=/data/history.db
VOLUME ["/data"]

ENTRYPOINT ["/entrypoint.sh"]
