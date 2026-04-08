"""Helpers for resolving runtime-safe output locations."""

import sys
from pathlib import Path


def get_runtime_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


def get_output_root() -> Path:
    output_root = get_runtime_base_dir() / "output"
    output_root.mkdir(parents=True, exist_ok=True)
    return output_root


def ensure_output_subdir(*segments: str) -> Path:
    target_dir = get_output_root().joinpath(*segments)
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir
