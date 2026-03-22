"""
CyberCat Windows build & installer script.

Usage:
    uv run scripts/windows/build_installer.py                # full build + installer
    uv run scripts/windows/build_installer.py --bundle-only  # PyInstaller bundle only
    uv run scripts/windows/build_installer.py --skip-frontend # skip npm build
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_JSON = REPO_ROOT / "package.json"
SPEC_FILE = REPO_ROOT / "apps" / "service" / "CyberCat.spec"
ISS_FILE = REPO_ROOT / "installer" / "CyberCat.iss"
SOURCE_ICON_PNG = REPO_ROOT / "CyberCat.png"
GENERATED_ICON_ICO = REPO_ROOT / "build" / "CyberCat" / "CyberCat.ico"

PYINSTALLER_WORKPATH = REPO_ROOT / "build" / "CyberCat" / "pyinstaller"
PYINSTALLER_DISTPATH = REPO_ROOT / "build" / "CyberCat" / "bundle"
BUNDLED_APP = PYINSTALLER_DISTPATH / "CyberCat"

# Inno Setup auto-download config
INNO_VERSION = "6.7.1"
INNO_TAG = f"is-{INNO_VERSION.replace('.', '_')}"
INNO_URL = (
    f"https://github.com/jrsoftware/issrc/releases/download/"
    f"{INNO_TAG}/innosetup-{INNO_VERSION}.exe"
)
INNO_TOOLS_DIR = REPO_ROOT / ".tools" / "innosetup"
ISCC_CACHE = INNO_TOOLS_DIR / "ISCC.exe"


def get_app_version() -> str:
    """Read version from package.json (single source of truth)."""
    data = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    return data.get("version", "0.1.0")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def run(cmd: list[str], label: str, *, shell: bool = False) -> None:
    print(f"\n==> {label}")
    print(f"    $ {' '.join(cmd)}")
    result = subprocess.run(
        cmd,
        cwd=REPO_ROOT,
        env={**os.environ, "CI": "1", "NX_TUI": "false"},
        shell=shell,
    )
    if result.returncode != 0:
        print(f"    FAILED (exit {result.returncode})")
        sys.exit(result.returncode)


def ensure_windows_icon() -> None:
    """Generate a Windows .ico from the repository PNG artwork."""
    if not SOURCE_ICON_PNG.is_file():
        return

    GENERATED_ICON_ICO.parent.mkdir(parents=True, exist_ok=True)

    from PySide6.QtGui import QImage

    image = QImage(str(SOURCE_ICON_PNG))
    if image.isNull():
        print(f"    Warning: could not load icon source {SOURCE_ICON_PNG}")
        return

    if not image.save(str(GENERATED_ICON_ICO), "ICO"):
        print(f"    Warning: could not generate {GENERATED_ICON_ICO}")
        return

    print(f"    Prepared Windows icon: {GENERATED_ICON_ICO}")


# ---------------------------------------------------------------------------
# Build steps
# ---------------------------------------------------------------------------
def build_frontend() -> None:
    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    run([npm, "run", "build", "--", "--skipSync"], "Build the React frontend", shell=True)


def build_bundle() -> None:
    ensure_windows_icon()
    run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--distpath",
            str(PYINSTALLER_DISTPATH),
            "--workpath",
            str(PYINSTALLER_WORKPATH),
            str(SPEC_FILE),
        ],
        "Build the desktop bundle with PyInstaller",
    )


# ---------------------------------------------------------------------------
# Inno Setup resolution
# ---------------------------------------------------------------------------
def _find_iscc() -> Path | None:
    """Try several common locations for ISCC.exe."""
    # 1. Environment override
    env_path = os.environ.get("INNO_SETUP_PATH")
    if env_path and Path(env_path).is_file():
        return Path(env_path)

    # 2. Cached install under .tools/
    if ISCC_CACHE.is_file():
        return ISCC_CACHE

    # 3. On PATH
    found = shutil.which("ISCC")
    if found:
        return Path(found)

    # 4. Default install locations
    for candidate in [
        Path(r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe"),
        Path(r"C:\Program Files\Inno Setup 6\ISCC.exe"),
    ]:
        if candidate.is_file():
            return candidate

    return None


def _download_file(url: str, dest: Path) -> None:
    """Download a file following redirects."""
    print(f"    Downloading {url}")
    urllib.request.urlretrieve(url, dest)  # noqa: S310 — trusted URL
    print(f"    Saved to {dest}")


def resolve_inno_setup() -> Path:
    """Return ISCC.exe path, downloading Inno Setup if needed."""
    found = _find_iscc()
    if found:
        return found

    print(f"\n==> Inno Setup not found — downloading v{INNO_VERSION} (one-time setup)")
    tools_dir = REPO_ROOT / ".tools"
    tools_dir.mkdir(parents=True, exist_ok=True)

    installer_path = tools_dir / f"innosetup-{INNO_VERSION}.exe"
    _download_file(INNO_URL, installer_path)

    print("    Running silent install…")
    result = subprocess.run(
        [
            str(installer_path),
            "/VERYSILENT",
            "/SUPPRESSMSGBOXES",
            f"/DIR={INNO_TOOLS_DIR}",
            "/NOICONS",
            "/NORESTART",
        ],
    )
    if result.returncode != 0 or not ISCC_CACHE.is_file():
        print("    Inno Setup silent install failed.")
        print("    Set INNO_SETUP_PATH to ISCC.exe and retry.")
        sys.exit(1)

    print(f"    Inno Setup installed to {INNO_TOOLS_DIR}")
    return ISCC_CACHE


def build_installer(version: str) -> None:
    iscc = resolve_inno_setup()
    run(
        [
            str(iscc),
            f"/DAppVersion={version}",
            f"/DBundleSourceDir={BUNDLED_APP}",
            str(ISS_FILE),
        ],
        "Build the Windows installer with Inno Setup",
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    if sys.platform != "win32":
        print("Windows packaging is only supported on Windows.")
        sys.exit(1)

    parser = argparse.ArgumentParser(description="Build CyberCat Windows installer")
    parser.add_argument(
        "--bundle-only",
        action="store_true",
        help="Only produce the PyInstaller bundle (skip installer)",
    )
    parser.add_argument(
        "--skip-frontend",
        action="store_true",
        help="Skip the React frontend build step",
    )
    args = parser.parse_args()

    version = get_app_version()
    print(f"CyberCat v{version}  •  Python {sys.version}")

    if not args.skip_frontend:
        build_frontend()

    build_bundle()

    if not args.bundle_only:
        build_installer(version)

    print("\nDone!")


if __name__ == "__main__":
    main()
