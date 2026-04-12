"""Helpers for CyberCat's local BBDown-backed Bilibili downloads."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from service.config_service import config_service

BILIBILI_FEATURE_DISABLED_ERROR = "Bilibili is disabled. Enable it in Settings > Features."
MISSING_BILIBILI_COOKIE_ERROR = (
    "No Bilibili cookie is configured in CyberCat. Open Settings > Bilibili and sign in first."
)
MISSING_BILIBILI_TARGET_ERROR = (
    "No Bilibili URL was provided and no bilibili_url is configured in CyberCat settings."
)
SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts" / "bilibili"


@dataclass(slots=True)
class BilibiliDownloadResult:
    ok: bool
    return_code: int
    requested_args: list[str]
    stdout: str
    stderr: str


def build_bilibili_download_command(argv: Sequence[str] | None = None) -> tuple[list[str], Path]:
    if not config_service.is_feature_enabled("bilibili"):
        raise RuntimeError(BILIBILI_FEATURE_DISABLED_ERROR)

    cookie = str(config_service.get("bilibili_cookie") or "").strip()
    if not cookie:
        raise RuntimeError(MISSING_BILIBILI_COOKIE_ERROR)

    resolved_args = _resolve_download_args(argv)
    bbdown_path = _bbdown_executable_path()
    return [str(bbdown_path), "-c", cookie, *resolved_args], SCRIPT_DIR


def run_bilibili_download(argv: Sequence[str] | None = None) -> BilibiliDownloadResult:
    command, working_directory = build_bilibili_download_command(argv)
    completed_process = subprocess.run(
        command,
        cwd=working_directory,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return BilibiliDownloadResult(
        ok=completed_process.returncode == 0,
        return_code=completed_process.returncode,
        requested_args=list(command[3:]),
        stdout=completed_process.stdout.strip(),
        stderr=completed_process.stderr.strip(),
    )


def _resolve_download_args(argv: Sequence[str] | None) -> list[str]:
    resolved_args = [str(item).strip() for item in (argv or []) if str(item).strip()]
    if resolved_args:
        return resolved_args

    stored_url = str(config_service.get("bilibili_url") or "").strip()
    if stored_url:
        return [stored_url]

    raise RuntimeError(MISSING_BILIBILI_TARGET_ERROR)


def _bbdown_executable_path() -> Path:
    windows_path = SCRIPT_DIR / "BBDown.exe"
    if windows_path.is_file():
        return windows_path

    fallback_path = SCRIPT_DIR / "BBDown"
    if fallback_path.is_file():
        return fallback_path

    raise FileNotFoundError(
        f"BBDown executable not found in {SCRIPT_DIR}. Expected BBDown.exe or BBDown."
    )
