"""Settings backup and restore helpers for the desktop shell."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from PySide6.QtWidgets import QFileDialog

from service.config_service import config_service

BACKUP_DIALOG_FILTER = "CyberCat settings backup (*.json);;JSON files (*.json)"
RESTORE_DIALOG_FILTER = "JSON files (*.json);;All files (*)"
BACKUP_FILENAME_PREFIX = "cybercat-settings-backup"
TIMESTAMP_FILENAME_FORMAT = "%Y%m%d-%H%M%S"


def get_settings_backup_info() -> dict[str, Any]:
    return config_service.get_storage_metadata()


def backup_settings() -> dict[str, Any]:
    destination = _select_backup_destination()
    if destination is None:
        return {"ok": False, "cancelled": True}

    return {"ok": True, **config_service.backup_to(destination)}


def restore_settings() -> dict[str, Any]:
    source = _select_restore_source()
    if source is None:
        return {"ok": False, "cancelled": True}

    return {"ok": True, **config_service.restore_from(source)}


def _select_backup_destination() -> Path | None:
    default_path = _default_backup_path()
    selected_path, _ = QFileDialog.getSaveFileName(
        None,
        "Back up CyberCat settings",
        str(default_path),
        BACKUP_DIALOG_FILTER,
    )
    return _normalize_path(selected_path)


def _select_restore_source() -> Path | None:
    storage_info = config_service.get_storage_metadata()
    default_dir = Path(storage_info["configDirectory"])
    selected_path, _ = QFileDialog.getOpenFileName(
        None,
        "Restore CyberCat settings",
        str(default_dir),
        RESTORE_DIALOG_FILTER,
    )
    return _normalize_path(selected_path, add_json_suffix=False)


def _default_backup_path() -> Path:
    storage_info = config_service.get_storage_metadata()
    config_dir = Path(storage_info["configDirectory"])
    timestamp = datetime.now().strftime(TIMESTAMP_FILENAME_FORMAT)
    return config_dir / f"{BACKUP_FILENAME_PREFIX}-{timestamp}.json"


def _normalize_path(raw_path: str, add_json_suffix: bool = True) -> Path | None:
    cleaned = str(raw_path or "").strip()
    if not cleaned:
        return None

    normalized_path = Path(cleaned).expanduser()
    if add_json_suffix and not normalized_path.suffix:
        return normalized_path.with_suffix(".json")
    return normalized_path
