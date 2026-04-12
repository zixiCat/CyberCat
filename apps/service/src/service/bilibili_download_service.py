"""Helpers for CyberCat's local BBDown-backed Bilibili downloads."""

from __future__ import annotations

import subprocess
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Sequence, TextIO

from service.config_service import config_service
from service.task_log_service import emit_task_log

BILIBILI_FEATURE_DISABLED_ERROR = "Bilibili is disabled. Enable it in Settings > Features."
MISSING_BILIBILI_COOKIE_ERROR = (
    "No Bilibili cookie is configured in CyberCat. Open Settings > Bilibili and sign in first."
)
MISSING_BILIBILI_TARGET_ERROR = (
    "No Bilibili URL was provided and no bilibili_url is configured in CyberCat settings."
)
SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts" / "bilibili"

BilibiliTargetSource = Literal["settings", "argument"]


@dataclass(slots=True)
class BilibiliDownloadResult:
    ok: bool
    return_code: int
    target_source: BilibiliTargetSource
    target_url: str
    stdout: str
    stderr: str


def build_bilibili_download_command(
    argv: Sequence[str] | None = None,
) -> tuple[list[str], Path, BilibiliTargetSource, str]:
    if not config_service.is_feature_enabled("bilibili"):
        raise RuntimeError(BILIBILI_FEATURE_DISABLED_ERROR)

    cookie = str(config_service.get("bilibili_cookie") or "").strip()
    if not cookie:
        raise RuntimeError(MISSING_BILIBILI_COOKIE_ERROR)

    resolved_args, target_source, target_url = _resolve_download_args(argv)
    bbdown_path = _bbdown_executable_path()
    return [str(bbdown_path), "-c", cookie, *resolved_args], SCRIPT_DIR, target_source, target_url


def run_bilibili_download(argv: Sequence[str] | None = None) -> BilibiliDownloadResult:
    command, working_directory, target_source, target_url = build_bilibili_download_command(argv)
    emit_task_log("status", _build_download_start_message(target_source, target_url))

    completed_process = _run_bilibili_process(
        command,
        working_directory,
    )

    if completed_process.returncode == 0:
        emit_task_log("status", "BBDown finished successfully.")
    else:
        emit_task_log("stderr", f"BBDown exited with code {completed_process.returncode}.")

    return BilibiliDownloadResult(
        ok=completed_process.returncode == 0,
        return_code=completed_process.returncode,
        target_source=target_source,
        target_url=target_url,
        stdout=completed_process.stdout.strip(),
        stderr=completed_process.stderr.strip(),
    )


def _resolve_download_args(
    argv: Sequence[str] | None,
) -> tuple[list[str], BilibiliTargetSource, str]:
    resolved_args = [str(item).strip() for item in (argv or []) if str(item).strip()]
    if resolved_args:
        return resolved_args, "argument", resolved_args[0]

    stored_url = str(config_service.get("bilibili_url") or "").strip()
    if stored_url:
        return [stored_url], "settings", stored_url

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


def _run_bilibili_process(
    command: Sequence[str],
    working_directory: Path,
) -> subprocess.CompletedProcess[str]:
    process = subprocess.Popen(
        command,
        cwd=working_directory,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )

    stdout_chunks: list[str] = []
    stderr_chunks: list[str] = []
    stdout_thread = threading.Thread(
        target=_consume_process_stream,
        args=(process.stdout, stdout_chunks, "stdout"),
        daemon=True,
    )
    stderr_thread = threading.Thread(
        target=_consume_process_stream,
        args=(process.stderr, stderr_chunks, "stderr"),
        daemon=True,
    )
    stdout_thread.start()
    stderr_thread.start()

    return_code = process.wait()
    stdout_thread.join()
    stderr_thread.join()
    return subprocess.CompletedProcess(
        args=list(command),
        returncode=return_code,
        stdout="".join(stdout_chunks),
        stderr="".join(stderr_chunks),
    )


def _consume_process_stream(
    stream: TextIO | None,
    sink: list[str],
    source: str,
) -> None:
    if stream is None:
        return

    try:
        for raw_line in iter(stream.readline, ""):
            sink.append(raw_line)
            emit_task_log(source, raw_line)
    finally:
        stream.close()


def summarize_bilibili_download_failure(result: BilibiliDownloadResult) -> str:
    combined_output = "\n".join(part for part in (result.stderr, result.stdout) if part.strip())
    if MISSING_BILIBILI_TARGET_ERROR in combined_output:
        return MISSING_BILIBILI_TARGET_ERROR

    if MISSING_BILIBILI_COOKIE_ERROR in combined_output:
        return MISSING_BILIBILI_COOKIE_ERROR

    if BILIBILI_FEATURE_DISABLED_ERROR in combined_output:
        return BILIBILI_FEATURE_DISABLED_ERROR

    if "412" in combined_output and "Precondition Failed" in combined_output:
        source_note = (
            "CyberCat did use the URL saved in Settings > Bilibili"
            if result.target_source == "settings"
            else "CyberCat did use the Bilibili URL you provided"
        )
        return (
            f"{source_note}, but Bilibili returned HTTP 412 Precondition Failed. "
            "This usually means your Bilibili cookie/login needs to be refreshed in Settings > Bilibili."
        )

    detail = _pick_meaningful_failure_line(result.stderr, result.stdout)
    if not detail:
        detail = f"BBDown exited with code {result.return_code}."

    if result.target_source == "settings":
        return f"CyberCat did use the URL saved in Settings > Bilibili, but the download failed: {detail}"

    return f"The Bilibili download failed: {detail}"


def _build_download_start_message(target_source: BilibiliTargetSource, target_url: str) -> str:
    if target_source == "settings":
        return f"Starting BBDown download with the saved Settings URL: {target_url}"

    return f"Starting BBDown download for {target_url}"


def _pick_meaningful_failure_line(*texts: str) -> str:
    preferred_tokens = (
        "precondition failed",
        "forbidden",
        "unauthorized",
        "not_success",
        "statuscode",
        "error",
        "failed",
        "exception",
    )

    lines: list[str] = []
    for text in texts:
        lines.extend(line.strip() for line in str(text or "").splitlines() if line.strip())

    for token in preferred_tokens:
        for line in reversed(lines):
            if token in line.lower():
                return line

    for line in reversed(lines):
        if any(char.isascii() and char.isalnum() for char in line):
            return line

    return ""
