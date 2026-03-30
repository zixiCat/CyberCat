"""
CyberCat release helper.

Usage:
    uv run scripts/windows/release.py 1.0.0
    uv run scripts/windows/release.py 1.0.0 --build win
    uv run scripts/windows/release.py 1.0.0 --build win --publish --generate-notes
    uv run scripts/windows/release.py 1.0.0 --asset ./build-artifact.zip --publish --generate-notes
"""

from __future__ import annotations

import argparse
import os
import re
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_JSON = REPO_ROOT / "package.json"
CHATBOT_PACKAGE_JSON = REPO_ROOT / "apps" / "chatbot" / "package.json"
PACKAGE_LOCK = REPO_ROOT / "package-lock.json"
PYPROJECT = REPO_ROOT / "pyproject.toml"
ISS_FILE = REPO_ROOT / "installer" / "CyberCat.iss"
BUILD_SCRIPT = REPO_ROOT / "scripts" / "windows" / "build_installer.py"

SEMVER_PATTERN = re.compile(
    r"^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)" r"(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$"
)


def normalize_version(raw_value: str) -> str:
    value = raw_value.strip()
    if not SEMVER_PATTERN.fullmatch(value):
        raise argparse.ArgumentTypeError(
            "Version must be valid semver, for example 1.0.0 or v1.0.0."
        )
    return value[1:] if value.startswith("v") else value


def format_command(command: list[str]) -> str:
    if os.name == "nt":
        return subprocess.list2cmdline(command)
    return shlex.join(command)


def write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8", newline="\n")


def replace_version(
    text: str,
    pattern: str,
    version: str,
    *,
    label: str,
    flags: int = 0,
) -> str:
    compiled = re.compile(pattern, flags)
    updated_text, replacements = compiled.subn(
        lambda match: f"{match.group(1)}{version}{match.group(3)}",
        text,
        count=1,
    )
    if replacements != 1:
        raise RuntimeError(f"Could not update {label}.")
    return updated_text


def update_file(path: Path, version: str, updater) -> bool:
    original = path.read_text(encoding="utf-8")
    updated = updater(original, version)
    if updated == original:
        print(f"Already current: {path.relative_to(REPO_ROOT).as_posix()}")
        return False

    write_text(path, updated)
    print(f"Updated: {path.relative_to(REPO_ROOT).as_posix()}")
    return True


def update_package_json(text: str, version: str) -> str:
    return replace_version(
        text,
        r'("version"\s*:\s*")([^"]+)(")',
        version,
        label="package.json version",
    )


def update_package_lock(text: str, version: str) -> str:
    updated = replace_version(
        text,
        r'(\A\s*\{\s*"name"\s*:\s*"@cybercat/source"\s*,\s*"version"\s*:\s*")([^"]+)(")',
        version,
        label="package-lock.json root version",
        flags=re.DOTALL,
    )
    updated = replace_version(
        updated,
        r'(""\s*:\s*\{\s*"name"\s*:\s*"@cybercat/source"\s*,\s*"version"\s*:\s*")([^"]+)(")',
        version,
        label='package-lock.json packages[""] version',
        flags=re.DOTALL,
    )
    return replace_version(
        updated,
        r'("apps/chatbot"\s*:\s*\{\s*"name"\s*:\s*"@cybercat/chatbot"\s*,\s*"version"\s*:\s*")([^"]+)(")',
        version,
        label='package-lock.json packages["apps/chatbot"] version',
        flags=re.DOTALL,
    )


def update_pyproject(text: str, version: str) -> str:
    return replace_version(
        text,
        r'(^version\s*=\s*")([^"]+)(")',
        version,
        label="pyproject.toml version",
        flags=re.MULTILINE,
    )


def update_iss(text: str, version: str) -> str:
    return replace_version(
        text,
        r'(#define AppVersion ")([^"]+)(")',
        version,
        label="installer/CyberCat.iss AppVersion",
    )


def sync_versions(version: str) -> None:
    changed_files = 0
    changed_files += int(update_file(PACKAGE_JSON, version, update_package_json))
    changed_files += int(update_file(CHATBOT_PACKAGE_JSON, version, update_package_json))
    changed_files += int(update_file(PACKAGE_LOCK, version, update_package_lock))
    changed_files += int(update_file(PYPROJECT, version, update_pyproject))
    changed_files += int(update_file(ISS_FILE, version, update_iss))
    print(f"\nVersion sync complete: {version} ({changed_files} file(s) changed)")


def run_command(command: list[str], label: str) -> None:
    print(f"\n==> {label}")
    print(f"    $ {format_command(command)}")
    result = subprocess.run(command, cwd=REPO_ROOT)
    if result.returncode != 0:
        sys.exit(result.returncode)


def build_artifacts(build_target: str) -> None:
    if build_target == "none":
        return

    command = [sys.executable, str(BUILD_SCRIPT)]
    label = "Build the Windows installer"
    if build_target == "bundle":
        command.append("--bundle-only")
        label = "Build the PyInstaller bundle"

    run_command(command, label)


def normalize_asset_argument(asset: str) -> str:
    if asset.startswith("http://") or asset.startswith("https://"):
        return asset

    source = asset.split("#", 1)[0]
    if not Path(source).is_absolute():
        return Path(source).as_posix() + ("" if "#" not in asset else f"#{asset.split('#', 1)[1]}")

    resolved = Path(source).resolve()
    try:
        relative = resolved.relative_to(REPO_ROOT)
        return relative.as_posix() + ("" if "#" not in asset else f"#{asset.split('#', 1)[1]}")
    except ValueError:
        return str(resolved) + ("" if "#" not in asset else f"#{asset.split('#', 1)[1]}")


def default_release_asset(version: str) -> str:
    return f"build/CyberCat/installer/CyberCat-setup-{version}.exe"


def resolve_release_assets(version: str, build_target: str, assets: list[str]) -> list[str]:
    normalized = [normalize_asset_argument(asset) for asset in assets]
    if normalized or build_target == "bundle":
        return normalized
    return [default_release_asset(version)]


def asset_source_path(asset: str) -> Path | None:
    if asset.startswith("http://") or asset.startswith("https://"):
        return None

    source = asset.split("#", 1)[0]
    path = Path(source)
    if not path.is_absolute():
        path = REPO_ROOT / path
    return path


def ensure_assets_exist(assets: list[str]) -> None:
    missing_assets = []
    for asset in assets:
        source_path = asset_source_path(asset)
        if source_path is not None and not source_path.exists():
            missing_assets.append(asset)

    if missing_assets:
        missing_list = "\n".join(f"- {asset}" for asset in missing_assets)
        raise SystemExit(f"Missing release asset(s):\n{missing_list}")


def build_gh_release_command(version: str, args, assets: list[str]) -> list[str]:
    command = ["gh", "release", "create", f"v{version}"]
    command.extend(assets)
    if args.generate_notes:
        command.append("--generate-notes")
    if args.title:
        command.extend(["--title", args.title])
    if args.notes_file:
        command.extend(["--notes-file", args.notes_file])
    if args.draft:
        command.append("--draft")
    if args.prerelease:
        command.append("--prerelease")
    return command


def print_next_steps(
    version: str, build_target: str, gh_command: list[str], assets: list[str]
) -> None:
    print(f"\nTag: v{version}")
    if assets:
        print("Release assets:")
        for asset in assets:
            print(f"- {asset}")
    elif build_target == "bundle":
        print("Release assets: none selected. Add --asset if you want to upload a bundle artifact.")

    print("\nGitHub release command:")
    print(format_command(gh_command))


def publish_release(gh_command: list[str]) -> None:
    if shutil.which("gh") is None:
        raise SystemExit("GitHub CLI was not found on PATH.")
    run_command(gh_command, "Publish the GitHub release")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Sync versions and optionally publish a GitHub release"
    )
    parser.add_argument(
        "version", type=normalize_version, help="Release version, with or without a leading v"
    )
    parser.add_argument(
        "--build",
        choices=["none", "bundle", "win"],
        default="none",
        help="Optionally build the PyInstaller bundle or Windows installer after syncing versions",
    )
    parser.add_argument(
        "--asset",
        action="append",
        default=[],
        help="Release asset to upload with gh release create. Repeat for multiple assets.",
    )
    parser.add_argument(
        "--generate-notes",
        action="store_true",
        help="Pass --generate-notes to gh release create",
    )
    parser.add_argument("--title", help="Optional GitHub release title")
    parser.add_argument("--notes-file", help="Optional release notes file for gh release create")
    parser.add_argument("--draft", action="store_true", help="Create the GitHub release as a draft")
    parser.add_argument(
        "--prerelease", action="store_true", help="Mark the GitHub release as a prerelease"
    )
    parser.add_argument(
        "--publish",
        action="store_true",
        help="Run gh release create after syncing versions and optional build",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    version = args.version

    sync_versions(version)
    build_artifacts(args.build)

    assets = resolve_release_assets(version, args.build, args.asset)
    gh_command = build_gh_release_command(version, args, assets)
    print_next_steps(version, args.build, gh_command, assets)

    if args.publish:
        ensure_assets_exist(assets)
        publish_release(gh_command)


if __name__ == "__main__":
    main()
