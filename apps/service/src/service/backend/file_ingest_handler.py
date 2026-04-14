"""JSON wrappers for file-ingest actions exposed through QWebChannel."""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from PySide6.QtWidgets import QFileDialog

from service.file_ingest_service import file_ingest_service

FILE_INGEST_DIALOG_FILTER = "All files (*)"


def pick_file_ingest_paths() -> dict[str, Any]:
    selected_paths, _ = QFileDialog.getOpenFileNames(
        None,
        "Upload files into CyberCat",
        str(Path.home()),
        FILE_INGEST_DIALOG_FILTER,
    )
    normalized_paths = _normalize_selected_file_paths(selected_paths)
    if not normalized_paths:
        return {"ok": False, "cancelled": True}

    return {
        "ok": True,
        "sourceCount": len(normalized_paths),
        "paths": [str(path) for path in normalized_paths],
    }


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


def _normalize_selected_file_paths(raw_paths: list[str]) -> list[Path]:
    normalized_paths: list[Path] = []
    seen: set[str] = set()

    for raw_path in raw_paths:
        cleaned = str(raw_path or "").strip()
        if not cleaned:
            continue

        path = Path(cleaned).expanduser()
        try:
            resolved = path.resolve()
        except OSError:
            resolved = path

        dedupe_key = str(resolved).lower()
        if dedupe_key in seen or not resolved.is_file():
            continue

        seen.add(dedupe_key)
        normalized_paths.append(resolved)

    return normalized_paths
