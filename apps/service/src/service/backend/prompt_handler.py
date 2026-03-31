"""Prompt file discovery and loading."""

import json
import sys
from pathlib import Path


def _prompts_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent / "_internal" / "prompts"
    return Path(__file__).resolve().parents[2] / "prompts"


def get_available_prompts() -> str:
    """Return a JSON array of ``{"file", "name"}`` for each prompt preset."""
    prompts_dir = _prompts_dir()
    prompts: list[dict[str, str]] = []

    if prompts_dir.is_dir():
        for path in sorted(prompts_dir.glob("*.md")):
            prompts.append({"file": path.name, "name": path.stem})

    return json.dumps(prompts, ensure_ascii=False)


def get_prompt_content(filename: str) -> str:
    """Return the raw text of a prompt file."""
    safe_name = Path(filename).name  # prevent path traversal
    path = _prompts_dir() / safe_name
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8")
