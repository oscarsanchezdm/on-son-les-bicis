#!/usr/bin/env python3
"""Deploy on-son-les-bicis to the ingest server."""

from __future__ import annotations

import os
import sys

try:
    import paramiko
except ImportError:
    print("pip install paramiko", file=sys.stderr)
    sys.exit(1)

HOST = os.environ.get("INGEST_HOST", "10.10.100.104")
USER = os.environ.get("INGEST_USER", "cursor")
PASSWORD = os.environ.get("INGEST_PASSWORD", "cursor")
REMOTE_DIR = os.environ.get("INGEST_REMOTE_DIR", "/root/on-son-les-bicis")
REPO = os.environ.get("INGEST_REPO", "https://github.com/oscarsanchezdm/on-son-les-bicis.git")
TOKEN = os.environ.get("BICING_TOKEN", "")


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


def sudo_bash(client: paramiko.SSHClient, password: str, script: str, check: bool = True) -> None:
    escaped = script.replace("'", "'\"'\"'")
    run(client, f"echo {password!r} | sudo -S bash -lc '{escaped}'", check=check)


def main() -> None:
    if not TOKEN:
        print("Set BICING_TOKEN", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {USER}@{HOST}...")
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    run(client, f"echo {PASSWORD!r} | sudo -S mkdir -p {REMOTE_DIR}")

    if_code, _, _ = run(
        client,
        f"echo {PASSWORD!r} | sudo -S test -d {REMOTE_DIR}/.git",
        check=False,
    )
    if if_code == 0:
        sudo_bash(client, PASSWORD, f"cd {REMOTE_DIR} && git pull --ff-only")
    else:
        run(
            client,
            f"echo {PASSWORD!r} | sudo -S git clone {REPO} {REMOTE_DIR}",
        )

    sudo_bash(
        client,
        PASSWORD,
        f"printf '%s\\n' 'BICING_TOKEN={TOKEN}' > {REMOTE_DIR}/.env",
    )
    sudo_bash(client, PASSWORD, f"mkdir -p {REMOTE_DIR}/db {REMOTE_DIR}/deploy/ssh")
    sudo_bash(
        client,
        PASSWORD,
        f"chmod +x {REMOTE_DIR}/scripts/deploy.sh {REMOTE_DIR}/docker/entrypoint.sh",
    )

    sudo_bash(client, PASSWORD, f"cd {REMOTE_DIR} && docker compose build")
    sudo_bash(client, PASSWORD, f"cd {REMOTE_DIR} && docker compose up -d")
    sudo_bash(client, PASSWORD, f"cd {REMOTE_DIR} && docker compose ps", check=False)
    sudo_bash(client, PASSWORD, f"cd {REMOTE_DIR} && docker compose logs --tail=30", check=False)

    client.close()
    print(f"\nDesplegat a {HOST}:{REMOTE_DIR}")


if __name__ == "__main__":
    main()
