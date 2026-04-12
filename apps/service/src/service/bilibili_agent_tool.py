"""Agent tool that routes chat requests into CyberCat's Bilibili workflow."""

from __future__ import annotations

import json

from agents import function_tool

from service.agent_tools import register_tool
from service.bilibili_download_service import (
    run_bilibili_download,
    summarize_bilibili_download_failure,
)
from service.task_log_service import emit_task_log


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
        emit_task_log("stderr", str(exc))
        return json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False)

    payload = {
        "ok": result.ok,
        "returnCode": result.return_code,
        "targetSource": result.target_source,
        "targetUrl": result.target_url,
    }

    if not result.ok:
        payload["error"] = summarize_bilibili_download_failure(result)

    return json.dumps(
        payload,
        ensure_ascii=False,
    )
