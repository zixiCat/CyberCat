"""JSON wrappers for Bilibili auth actions exposed through QWebChannel."""

import json

from service.bilibili_service import bilibili_auth_service


def get_bilibili_auth_status() -> str:
    return json.dumps(bilibili_auth_service.get_status(), ensure_ascii=False)


def start_bilibili_qr_login() -> str:
    try:
        result = bilibili_auth_service.start_qr_login()
        return json.dumps({"ok": True, **result}, ensure_ascii=False)
    except Exception as exc:
        return json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False)


def poll_bilibili_qr_login(session_id: str) -> str:
    try:
        result = bilibili_auth_service.poll_qr_login(session_id)
        return json.dumps({"ok": True, **result}, ensure_ascii=False)
    except Exception as exc:
        return json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False)
