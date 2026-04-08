"""Helpers for appending file-ingest output and storing job archives."""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from utils.output_paths import ensure_output_subdir

DEFAULT_FILE_INGEST_FOLDER = "inbox"
FILE_INGEST_ROOT_DIR = "file_ingest"
ARCHIVE_DIR_NAME = "_archives"
DATE_NOTE_FILENAME_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}(?:[_-](.+))?$")


@dataclass(slots=True)
class FileIngestSourceMeta:
    name: str
    original_path: str
    kind: str
    size_bytes: int
    truncated: bool = False


def get_file_ingest_root() -> Path:
    return ensure_output_subdir(FILE_INGEST_ROOT_DIR).resolve()


def normalize_file_ingest_folder_path(raw_path: str | None) -> str:
    cleaned = str(raw_path or "").strip().replace("\\", "/")
    if not cleaned:
        return DEFAULT_FILE_INGEST_FOLDER

    candidate = Path(cleaned).expanduser()
    if candidate.is_absolute():
        return candidate.resolve(strict=False).as_posix()

    parts = [part for part in candidate.parts if part not in {"", "."}]
    if not parts:
        return DEFAULT_FILE_INGEST_FOLDER
    if any(part == ".." for part in parts):
        raise ValueError("File ingest target folder cannot escape output/file_ingest/.")

    return Path(*parts).as_posix()


def resolve_file_ingest_folder(raw_path: str | None) -> tuple[str, Path]:
    normalized_folder_path = normalize_file_ingest_folder_path(raw_path)
    file_ingest_root = get_file_ingest_root()
    candidate = Path(normalized_folder_path)

    if candidate.is_absolute():
        folder_path = candidate.resolve(strict=False)
        relative_folder_path = folder_path.as_posix()
    else:
        relative_folder_path = normalized_folder_path
        folder_path = file_ingest_root.joinpath(relative_folder_path)

    folder_path.mkdir(parents=True, exist_ok=True)
    return relative_folder_path, folder_path


def normalize_file_ingest_note_suffix(raw_suffix: str | None) -> str:
    cleaned = str(raw_suffix or "").strip().replace("\\", "/")
    if not cleaned:
        return ""

    candidate = cleaned.rsplit("/", 1)[-1]
    if candidate.lower().endswith(".md"):
        candidate = candidate[:-3]

    date_match = DATE_NOTE_FILENAME_PATTERN.match(candidate)
    if date_match:
        candidate = date_match.group(1) or ""

    if not candidate:
        return ""

    normalized = unicodedata.normalize("NFKD", candidate)
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = normalized.strip().lower().replace(" ", "-")
    normalized = re.sub(r"[^a-z0-9_-]+", "-", normalized)
    normalized = re.sub(r"-{2,}", "-", normalized)
    normalized = re.sub(r"_{2,}", "_", normalized)
    return normalized.strip("-_")


def resolve_file_ingest_note_path(
    folder_path: str,
    collected_at: str,
    note_suffix: str | None = None,
) -> tuple[str, Path]:
    relative_folder_path, resolved_folder_path = resolve_file_ingest_folder(folder_path)
    note_filename = _build_note_filename(collected_at, note_suffix)
    note_path = resolved_folder_path / note_filename
    note_relative_path = Path(relative_folder_path).joinpath(note_filename).as_posix()
    return note_relative_path, note_path


def append_file_ingest_entry(target_path: Path, block_text: str) -> int:
    prefix = "\n\n" if target_path.exists() and target_path.stat().st_size > 0 else ""
    payload = f"{prefix}{block_text.strip()}\n"
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with target_path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(payload)
    return len(payload.encode("utf-8"))


def write_file_ingest_archive(
    *,
    job_id: str,
    created_at: str,
    configured_targets: list[dict[str, str]],
    sources: list[FileIngestSourceMeta],
    outputs: list[dict[str, Any]],
    warnings: list[str],
    summary: str,
) -> str:
    archive_dt = _parse_created_at(created_at)
    archive_dir = get_file_ingest_root().joinpath(
        ARCHIVE_DIR_NAME,
        archive_dt.strftime("%Y"),
        archive_dt.strftime("%m"),
    )
    archive_dir.mkdir(parents=True, exist_ok=True)
    archive_path = archive_dir / f"{job_id}.json"
    archive_payload = {
        "jobId": job_id,
        "createdAt": created_at,
        "configuredTargets": configured_targets,
        "sources": [asdict(source) for source in sources],
        "outputs": outputs,
        "warnings": warnings,
        "summary": summary,
    }
    with archive_path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(archive_payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    return archive_path.relative_to(get_file_ingest_root()).as_posix()


def _parse_created_at(created_at: str) -> datetime:
    try:
        return datetime.strptime(created_at, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return datetime.now()


def _build_note_filename(created_at: str, note_suffix: str | None) -> str:
    date_part = _parse_created_at(created_at).strftime("%Y-%m-%d")
    suffix = normalize_file_ingest_note_suffix(note_suffix)
    if suffix:
        return f"{date_part}_{suffix}.md"
    return f"{date_part}.md"
