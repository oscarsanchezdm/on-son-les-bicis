#!/usr/bin/env python3
"""Provision ingest container on the private server via SSH.

DESACTIVAT (juliol 2026): el pipeline és 100% GitHub Actions. Es conserva el script
per si cal reactivar desplegament local / servidor propi.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("Install paramiko: pip install paramiko", file=sys.stderr)
    sys.exit(1)

HOST = os.environ.get("INGEST_HOST", "10.10.100.104")
USER = os.environ.get("INGEST_USER", "cursor")
PASSWORD = os.environ.get("INGEST_PASSWORD", "cursor")
REMOTE_DIR = os.environ.get("INGEST_REMOTE_DIR", "/root/on-son-les-bicis")
ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    env_path = ROOT / ".env"
    token = os.environ.get("BICING_TOKEN", "")
    if not token and env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("BICING_TOKEN="):
                token = line.split("=", 1)[1].strip()
    if not token:
        print("Set BICING_TOKEN in environment", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {USER}@{HOST}...")
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    # Create directory and upload docker-compose + env
    commands = [
        f"mkdir -p {REMOTE_DIR}/db {REMOTE_DIR}/deploy/ssh",
        f"cat > {REMOTE_DIR}/.env <<'ENVEOF'\nBICING_TOKEN={token}\nENVEOF",
    ]
    for cmd in commands:
        stdin, stdout, stderr = client.exec_command(cmd)
        stdout.channel.recv_exit_status()

    sftp = client.open_sftp()
    for local_name in ["docker-compose.yml", "requirements.txt"]:
        sftp.put(str(ROOT / local_name), f"{REMOTE_DIR}/{local_name}")
    for local_dir in ["docker", "scripts"]:
        for path in (ROOT / local_dir).rglob("*"):
            if path.is_file():
                rel = path.relative_to(ROOT)
                remote = f"{REMOTE_DIR}/{rel.as_posix()}"
                client.exec_command(f"mkdir -p $(dirname {remote})")
                sftp.put(str(path), remote)
    sftp.close()

    deploy_cmds = [
        f"cd {REMOTE_DIR} && docker compose build",
        f"cd {REMOTE_DIR} && docker compose up -d",
    ]
    for cmd in deploy_cmds:
        print(f"Running: {cmd}")
        stdin, stdout, stderr = client.exec_command(cmd, get_pty=True)
        print(stdout.read().decode())
        err = stderr.read().decode()
        if err:
            print(err, file=sys.stderr)

    client.close()
    print(f"Server provisioned at {REMOTE_DIR}")


if __name__ == "__main__":
    main()
