"""Run BBDown with the Bilibili cookie stored in CyberCat's local settings."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SERVICE_SRC_DIR = Path(__file__).resolve().parents[2]
if str(SERVICE_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC_DIR))

from service.config_service import config_service


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


def main(argv: list[str]) -> int:
    cookie = str(config_service.get("bilibili_cookie") or "").strip()
    if not cookie:
        print(
            "No Bilibili cookie is configured in CyberCat. Open Settings > Bilibili and sign in first.",
            file=sys.stderr,
        )
        return 2

    if not argv:
        stored_url = str(config_service.get("bilibili_url") or "").strip()
        if stored_url:
            argv = [stored_url]
        else:
            print(
                "Usage: python run_bbdown.py [url-or-bbdown-args...]\n"
                "No URL provided and no bilibili_url configured in CyberCat settings.",
                file=sys.stderr,
            )
            return 2

    bbdown_path = _bbdown_executable_path()
    command = [str(bbdown_path), "-c", cookie, *argv]
    completed_process = subprocess.run(command, cwd=SCRIPT_DIR, check=False)
    return completed_process.returncode


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
