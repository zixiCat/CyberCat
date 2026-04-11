"""Prompt file discovery and loading."""

import json
from pathlib import Path

DEFAULT_PROMPT_FILE = "Default.md"
DEFAULT_PROMPT_NAME = "Default"


def get_available_prompts() -> str:
    """Return only the built-in blank default prompt preset."""
    return json.dumps(
        [{"file": DEFAULT_PROMPT_FILE, "name": DEFAULT_PROMPT_NAME}],
        ensure_ascii=False,
    )


def get_prompt_content(filename: str) -> str:
    """Return the raw text of the selected prompt preset."""
    safe_name = Path(filename).name  # prevent path traversal
    if safe_name != DEFAULT_PROMPT_FILE:
        return ""

    return ""
