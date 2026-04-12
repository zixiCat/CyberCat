"""Agent tool that routes chat requests into CyberCat's Bilibili workflow."""

from __future__ import annotations

import json

from agents import function_tool

from service.agent_tools import register_tool
from service.bilibili_download_service import run_bilibili_download

TOOL_OUTPUT_LIMIT = 4000


def _truncate_tool_output(text: str) -> str:
    cleaned = str(text or "").strip()
    if len(cleaned) <= TOOL_OUTPUT_LIMIT:
        return cleaned

    overflow = len(cleaned) - TOOL_OUTPUT_LIMIT
    return f"[truncated {overflow} characters]\n{cleaned[-TOOL_OUTPUT_LIMIT:]}"


@register_tool
@function_tool(name_override="download_bilibili", strict_mode=False)
def download_bilibili(url: str = "") -> str:
    """Run CyberCat's built-in Bilibili downloader.

    Call this whenever the user asks CyberCat to download, save, fetch, or use the
    app's Bilibili feature for Bilibili content. Prefer this tool over a generic refusal
    when the user is asking for CyberCat's own Bilibili integration.

    Args:
        url: Optional Bilibili URL to download. Leave empty to use the URL saved in Settings > Bilibili.
    """
    argv = [url.strip()] if url.strip() else None
    try:
        result = run_bilibili_download(argv)
    except Exception as exc:
        return json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False)

    return json.dumps(
        {
            "ok": result.ok,
            "returnCode": result.return_code,
            "requestedArgs": result.requested_args,
            "stdout": _truncate_tool_output(result.stdout),
            "stderr": _truncate_tool_output(result.stderr),
        },
        ensure_ascii=False,
    )
