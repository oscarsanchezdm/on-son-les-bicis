"""Track which Bicing API feed was used for the latest ingest."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from config import DATA_DIR

LAST_SOURCE_PATH = DATA_DIR / "last-source.json"


def write_last_source(source: str) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    LAST_SOURCE_PATH.write_text(
        json.dumps(
            {
                "source": source,
                "recorded_at": datetime.now(timezone.utc).isoformat(),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def read_last_source(default: str = "GBFS (B:SM)") -> str:
    if not LAST_SOURCE_PATH.exists():
        return default
    try:
        payload = json.loads(LAST_SOURCE_PATH.read_text(encoding="utf-8"))
        source = payload.get("source")
        if isinstance(source, str) and source.strip():
            return source.strip()
    except (json.JSONDecodeError, OSError):
        pass
    return default
