#!/usr/bin/env python3
"""Desplega ingestió Open Data al servidor de casa via SSH.

Executar des d'una màquina a la LAN (no des del cloud agent):
  export BICING_TOKEN=...
  python3 scripts/deploy_remote.py
"""

from __future__ import annotations

import os
import shlex
import sys
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("pip install paramiko", file=sys.stderr)
    sys.exit(1)

HOST = os.environ.get("INGEST_HOST", "10.10.100.104")
USER = os.environ.get("INGEST_USER", "cursor")
PASSWORD = os.environ.get("INGEST_PASSWORD", "cursor")
ROOT = Path(__file__).resolve().parents[1]
SETUP_SCRIPT = ROOT / "scripts" / "setup_home_ingest.sh"


def load_token() -> str:
    token = os.environ.get("BICING_TOKEN", "")
    if token:
        return token
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("BICING_TOKEN="):
                return line.split("=", 1)[1].strip()
    return ""


def run(client: paramiko.SSHClient, cmd: str, check: bool = True) -> tuple[int, str, str]:
    print(f"$ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, get_pty=True)
    out = stdout.read().decode()
    err = stderr.read().decode()
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    if check and code != 0:
        raise RuntimeError(f"Command failed ({code}): {cmd}")
    return code, out, err


def main() -> None:
    token = load_token()
    if not token:
        print("Set BICING_TOKEN in environment or .env", file=sys.stderr)
        sys.exit(1)

    if not SETUP_SCRIPT.is_file():
        print(f"Missing {SETUP_SCRIPT}", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {USER}@{HOST}...")
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    remote_cmd = (
        f"export BICING_TOKEN={shlex.quote(token)}; "
        f"export REPO_DIR={shlex.quote(os.environ.get('INGEST_REMOTE_DIR', '$HOME/on-son-les-bicis'))}; "
        "bash -s"
    )
    stdin, stdout, stderr = client.exec_command(remote_cmd, get_pty=True)
    stdin.write(SETUP_SCRIPT.read_text())
    stdin.channel.shutdown_write()

    out = stdout.read().decode()
    err = stderr.read().decode()
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    client.close()

    if code != 0:
        print(f"Setup failed ({code})", file=sys.stderr)
        sys.exit(code)

    print(f"\nDesplegat a {HOST}. Cron cada 30 min dins el contenidor Docker.")


if __name__ == "__main__":
    main()
