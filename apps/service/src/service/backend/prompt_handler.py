"""Prompt file discovery and loading."""

import json
import sys
from pathlib import Path

from service.config_service import config_service

LANG_ASS_PROMPT_FILE = "LangAss.md"
LANG_ASS_PROMPT_KEY = "lang_ass_prompt"


def _prompts_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent / "_internal" / "prompts"
    return Path(__file__).resolve().parents[2] / "prompts"


def get_available_prompts() -> str:
    """Return a JSON array of ``{"file", "name"}`` for each prompt preset."""
    prompts_dir = _prompts_dir()
    prompt_names: dict[str, str] = {}

    if prompts_dir.is_dir():
        for path in prompts_dir.glob("*.md"):
            prompt_names[path.name] = path.stem

    prompt_names.setdefault(LANG_ASS_PROMPT_FILE, Path(LANG_ASS_PROMPT_FILE).stem)

    prompts = [
        {"file": filename, "name": name}
        for filename, name in sorted(prompt_names.items(), key=lambda item: item[1].lower())
    ]

    return json.dumps(prompts, ensure_ascii=False)


def get_prompt_content(filename: str) -> str:
    """Return the raw text of a prompt file."""
    safe_name = Path(filename).name  # prevent path traversal
    if safe_name == LANG_ASS_PROMPT_FILE:
        configured_prompt = config_service.get(LANG_ASS_PROMPT_KEY, "")
        if isinstance(configured_prompt, str) and configured_prompt.strip():
            return configured_prompt

    path = _prompts_dir() / safe_name
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8")
