"""JSON wrappers for file-ingest actions exposed through QWebChannel."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from service.file_ingest_service import file_ingest_service


def start_file_ingest(
    file_paths: list[str],
    *,
    on_started: Callable[[dict[str, Any]], None] | None = None,
    on_finished: Callable[[dict[str, Any]], None] | None = None,
) -> str:
    try:
        result = file_ingest_service.start_job(
            file_paths,
            on_started=on_started,
            on_finished=on_finished,
        )
        return json.dumps(result, ensure_ascii=False)
    except Exception as exc:
        return json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False)