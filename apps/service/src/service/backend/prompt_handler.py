"""Prompt file discovery and loading."""

import json
import sys
from pathlib import Path

from service.config_service import (
    CUSTOM_PROMPTS_KEY,
    LEGACY_CUSTOM_PROMPT_FILE,
    config_service,
    load_custom_prompts,
)

CUSTOM_PROMPT_FILE_PREFIX = "Custom."
CUSTOM_PROMPT_FILE_SUFFIX = ".md"


def _custom_prompt_filename(prompt_id: str) -> str:
    return f"{CUSTOM_PROMPT_FILE_PREFIX}{prompt_id}{CUSTOM_PROMPT_FILE_SUFFIX}"


def _extract_custom_prompt_id(filename: str) -> str | None:
    if filename == LEGACY_CUSTOM_PROMPT_FILE:
        return "legacy-default"

    if not filename.startswith(CUSTOM_PROMPT_FILE_PREFIX) or not filename.endswith(
        CUSTOM_PROMPT_FILE_SUFFIX
    ):
        return None

    prompt_id = filename[len(CUSTOM_PROMPT_FILE_PREFIX) : -len(CUSTOM_PROMPT_FILE_SUFFIX)]
    return prompt_id or None


def _get_custom_prompts() -> list[dict[str, str]]:
    try:
        return load_custom_prompts(config_service.get(CUSTOM_PROMPTS_KEY, "[]"))
    except ValueError:
        return []


def _prompts_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent / "_internal" / "prompts"
    return Path(__file__).resolve().parents[2] / "prompts"


def get_available_prompts() -> str:
    """Return a JSON array of ``{"file", "name"}`` for each prompt preset."""
    prompts_dir = _prompts_dir()
    prompt_names: dict[str, str] = {}
    custom_prompts = _get_custom_prompts()

    if prompts_dir.is_dir():
        for path in prompts_dir.glob("*.md"):
            prompt_names[path.name] = path.stem

    for prompt in custom_prompts:
        prompt_names[_custom_prompt_filename(prompt["id"])] = prompt["name"]

    prompts = [
        {"file": filename, "name": name}
        for filename, name in sorted(prompt_names.items(), key=lambda item: item[1].lower())
    ]

    return json.dumps(prompts, ensure_ascii=False)


def get_prompt_content(filename: str) -> str:
    """Return the raw text of a prompt file."""
    safe_name = Path(filename).name  # prevent path traversal
    custom_prompts = _get_custom_prompts()
    custom_prompt_id = _extract_custom_prompt_id(safe_name)
    if custom_prompt_id == "legacy-default":
        return custom_prompts[0]["content"] if custom_prompts else ""

    if custom_prompt_id is not None:
        for prompt in custom_prompts:
            if prompt["id"] == custom_prompt_id:
                return prompt["content"]
        return ""

    path = _prompts_dir() / safe_name
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8")
