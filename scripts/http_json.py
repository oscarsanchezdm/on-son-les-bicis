"""Minimal JSON HTTP client (stdlib urllib; optional requests)."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any


def fetch_json(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout: float = 30,
    retries: int = 3,
    allow_redirects: bool = True,
) -> dict[str, Any]:
    """GET JSON. Retries on transient failures. Prefer stdlib so no pip is required."""
    hdrs = dict(headers or {})
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            return _fetch_once(
                url,
                headers=hdrs,
                timeout=timeout,
                allow_redirects=allow_redirects,
            )
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt < retries:
                time.sleep(2 * attempt)

    raise RuntimeError(
        f"Failed to fetch {url} after {retries} attempts: {last_error}"
    ) from last_error


def _fetch_once(
    url: str,
    *,
    headers: dict[str, str],
    timeout: float,
    allow_redirects: bool,
) -> dict[str, Any]:
    try:
        import requests

        resp = requests.get(
            url,
            headers=headers,
            timeout=timeout,
            allow_redirects=allow_redirects,
        )
        if not allow_redirects and resp.status_code in {301, 302, 303, 307, 308}:
            location = resp.headers.get("Location", "")
            raise RuntimeError(
                f"Redirected to {location or 'unknown'} — token invàlid o bot detection"
            )
        if not resp.ok:
            raise RuntimeError(f"HTTP {resp.status_code} from {url}: {resp.text[:300]}")
        try:
            return resp.json()
        except json.JSONDecodeError as exc:
            snippet = resp.text[:300].replace("\n", " ")
            raise RuntimeError(
                f"Non-JSON response from {url} (HTTP {resp.status_code}): {snippet}"
            ) from exc
    except ImportError:
        pass

    req = urllib.request.Request(url, headers=headers, method="GET")
    opener = urllib.request.build_opener()
    if not allow_redirects:
        class _NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: N802
                return None

        opener = urllib.request.build_opener(_NoRedirect)

    try:
        with opener.open(req, timeout=timeout) as resp:
            status = getattr(resp, "status", None) or resp.getcode()
            body = resp.read()
            text = body.decode("utf-8", errors="replace")
            if status and status >= 400:
                raise RuntimeError(f"HTTP {status} from {url}: {text[:300]}")
            try:
                return json.loads(text)
            except json.JSONDecodeError as exc:
                raise RuntimeError(
                    f"Non-JSON response from {url} (HTTP {status}): {text[:300]}"
                ) from exc
    except urllib.error.HTTPError as exc:
        if not allow_redirects and exc.code in {301, 302, 303, 307, 308}:
            location = exc.headers.get("Location", "")
            raise RuntimeError(
                f"Redirected to {location or 'unknown'} — token invàlid o bot detection"
            ) from exc
        body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        raise RuntimeError(f"HTTP {exc.code} from {url}: {body[:300]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error fetching {url}: {exc}") from exc
