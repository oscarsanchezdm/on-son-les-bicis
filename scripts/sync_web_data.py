#!/usr/bin/env python3
"""Copy exported data into the live web tree (shared hosting)."""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

from config import DATA_DIR, WEB_DATA_DIR

# Files/dirs the frontend reads at runtime
SYNC_ITEMS = (
    "latest.json",
    "barris-latest.json",
    "stations-latest.geojson",
    "meta.json",
    "last-source.json",
    "static",
    "history",
)


def sync(dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    for name in SYNC_ITEMS:
        src = DATA_DIR / name
        if not src.exists():
            continue
        target = dest / name
        if src.is_dir():
            if target.exists():
                shutil.rmtree(target)
            shutil.copytree(src, target)
        else:
            shutil.copy2(src, target)
        print(f"Synced {name} -> {target}")


def main() -> None:
    dest_raw = (sys.argv[1] if len(sys.argv) > 1 else "") or WEB_DATA_DIR
    if not dest_raw:
        print("WEB_DATA_DIR not set; skip sync (frontend data stays in public/data/)")
        return
    dest = Path(dest_raw).expanduser().resolve()
    sync(dest)
    print(f"Done: {dest}")


if __name__ == "__main__":
    main()
