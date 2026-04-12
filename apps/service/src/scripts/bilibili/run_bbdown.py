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
from service.bilibili_download_service import build_bilibili_download_command


def main(argv: list[str]) -> int:
    if not config_service.is_feature_enabled("bilibili"):
        print("Bilibili is disabled. Enable it in Settings > Features.", file=sys.stderr)
        return 2

    try:
        command, working_directory = build_bilibili_download_command(argv)
    except (FileNotFoundError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 2

    completed_process = subprocess.run(command, cwd=working_directory, check=False)
    return completed_process.returncode


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
