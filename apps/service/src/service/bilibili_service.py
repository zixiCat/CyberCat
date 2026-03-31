"""Bilibili WEB cookie management and QR login helpers for BBDown workflows."""

from __future__ import annotations

import json
import secrets
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from service.config_service import config_service

BILIBILI_COOKIE_KEY = "bilibili_cookie"
DESKTOP_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/135.0.0.0 Safari/537.36"
)
WEB_QR_GENERATE_URL = (
    "https://passport.bilibili.com/x/passport-login/web/qrcode/generate" "?source=main-fe-header"
)
WEB_QR_POLL_URL = (
    "https://passport.bilibili.com/x/passport-login/web/qrcode/poll"
    "?qrcode_key={qrcode_key}&source=main-fe-header"
)
WEB_NAV_URL = "https://api.bilibili.com/x/web-interface/nav"
DEFAULT_TIMEOUT_SECONDS = 10
LOGIN_SESSION_TTL_SECONDS = 300
QR_WAITING_SCAN = 86101
QR_WAITING_CONFIRM = 86090
QR_EXPIRED = 86038


@dataclass(slots=True)
class BilibiliQrLoginSession:
    session_id: str
    qrcode_key: str
    qrcode_url: str
    created_at: float


class BilibiliAuthService:
    def __init__(self) -> None:
        self._sessions: dict[str, BilibiliQrLoginSession] = {}
        self._lock = threading.Lock()

    def get_cookie(self) -> str:
        return str(config_service.get(BILIBILI_COOKIE_KEY) or "").strip()

    def get_status(self) -> dict[str, Any]:
        cookie = self.get_cookie()
        status = self._build_local_status(cookie)
        if not cookie:
            return status

        try:
            remote_status = self._check_remote_login(cookie)
        except Exception as exc:
            status["remoteError"] = str(exc)
            return status

        status.update(remote_status)
        return status

    def start_qr_login(self) -> dict[str, Any]:
        payload = self._request_json(WEB_QR_GENERATE_URL)
        data = payload.get("data")
        if not isinstance(data, dict):
            raise RuntimeError("Bilibili QR login did not return session data.")

        qrcode_url = str(data.get("url") or "").strip()
        qrcode_key = str(data.get("qrcode_key") or "").strip()
        if not qrcode_url or not qrcode_key:
            raise RuntimeError("Bilibili QR login did not return a usable QR code.")

        session = BilibiliQrLoginSession(
            session_id=secrets.token_hex(12),
            qrcode_key=qrcode_key,
            qrcode_url=qrcode_url,
            created_at=time.time(),
        )
        with self._lock:
            self._cleanup_sessions_locked(time.time())
            self._sessions[session.session_id] = session

        return {
            "state": "waiting_scan",
            "sessionId": session.session_id,
            "qrUrl": session.qrcode_url,
            "expiresInSeconds": LOGIN_SESSION_TTL_SECONDS,
        }

    def poll_qr_login(self, session_id: str) -> dict[str, Any]:
        session = self._get_session(session_id)
        payload = self._request_json(WEB_QR_POLL_URL.format(qrcode_key=session.qrcode_key))
        data = payload.get("data")
        if not isinstance(data, dict):
            raise RuntimeError("Bilibili QR login returned an unexpected payload.")

        code = self._coerce_int(data.get("code"))
        if code == QR_WAITING_SCAN:
            return {
                "state": "waiting_scan",
                "sessionId": session.session_id,
                "qrUrl": session.qrcode_url,
            }

        if code == QR_WAITING_CONFIRM:
            return {
                "state": "waiting_confirm",
                "sessionId": session.session_id,
                "qrUrl": session.qrcode_url,
            }

        if code == QR_EXPIRED:
            self._delete_session(session.session_id)
            return {"state": "expired", "sessionId": session.session_id}

        login_url = str(data.get("url") or "").strip()
        if not login_url:
            raise RuntimeError("Bilibili QR login did not return the final login URL.")

        cookie = self._login_url_to_cookie(login_url)
        config_service.save({BILIBILI_COOKIE_KEY: cookie})
        self._delete_session(session.session_id)
        return {
            "state": "success",
            "sessionId": session.session_id,
            "status": self.get_status(),
        }

    def _get_session(self, session_id: str) -> BilibiliQrLoginSession:
        now = time.time()
        with self._lock:
            self._cleanup_sessions_locked(now)
            session = self._sessions.get(session_id)
            if session is None:
                raise ValueError("Bilibili QR login session expired or was not found.")
            return session

    def _delete_session(self, session_id: str) -> None:
        with self._lock:
            self._sessions.pop(session_id, None)

    def _cleanup_sessions_locked(self, now: float) -> None:
        expired_session_ids = [
            session_id
            for session_id, session in self._sessions.items()
            if now - session.created_at > LOGIN_SESSION_TTL_SECONDS
        ]
        for session_id in expired_session_ids:
            self._sessions.pop(session_id, None)

    def _check_remote_login(self, cookie: str) -> dict[str, Any]:
        payload = self._request_json(
            WEB_NAV_URL,
            headers={
                "Cookie": cookie,
                "Referer": "https://www.bilibili.com/",
            },
        )
        data = payload.get("data")
        if not isinstance(data, dict):
            raise RuntimeError("Bilibili login status did not return account data.")

        is_login = bool(data.get("isLogin"))
        username = str(data.get("uname") or "").strip()
        remote_user_id = str(data.get("mid") or "").strip()
        return {
            "remoteChecked": True,
            "state": "authenticated" if is_login else "logged_out",
            "username": username,
            "userId": remote_user_id,
            "checkedAt": self._to_iso_timestamp(time.time()),
        }

    def _build_local_status(self, cookie: str) -> dict[str, Any]:
        if not cookie:
            return {
                "configured": False,
                "state": "not_configured",
                "remoteChecked": False,
                "hasSessData": False,
                "userId": "",
                "username": "",
                "expiresAt": None,
            }

        cookie_fields = self._parse_cookie_fields(cookie)
        expires_raw = cookie_fields.get("Expires", "")
        expires_at = None
        if expires_raw.isdigit():
            expires_at = self._to_iso_timestamp(int(expires_raw))

        return {
            "configured": True,
            "state": "configured",
            "remoteChecked": False,
            "hasSessData": bool(cookie_fields.get("SESSDATA")),
            "userId": str(cookie_fields.get("DedeUserID") or "").strip(),
            "username": "",
            "expiresAt": expires_at,
        }

    def _request_json(self, url: str, headers: dict[str, str] | None = None) -> dict[str, Any]:
        request_headers = {
            "User-Agent": DESKTOP_USER_AGENT,
            "Accept": "application/json, text/plain, */*",
        }
        if headers:
            request_headers.update(headers)

        request = Request(url, headers=request_headers)
        try:
            with urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
                payload_text = response.read().decode("utf-8")
        except HTTPError as exc:
            response_text = exc.read().decode("utf-8", errors="ignore").strip()
            detail = response_text or str(exc.reason)
            raise RuntimeError(f"Bilibili request failed ({exc.code}): {detail}") from exc
        except URLError as exc:
            raise RuntimeError(f"Bilibili request failed: {exc.reason}") from exc

        try:
            payload = json.loads(payload_text)
        except json.JSONDecodeError as exc:
            raise RuntimeError("Bilibili returned invalid JSON.") from exc

        if not isinstance(payload, dict):
            raise RuntimeError("Bilibili returned an unexpected response.")

        top_level_code = self._coerce_int(payload.get("code"))
        if top_level_code not in (None, 0):
            message = str(payload.get("message") or payload.get("msg") or "Unknown error.").strip()
            raise RuntimeError(f"Bilibili request failed ({top_level_code}): {message}")

        return payload

    @staticmethod
    def _parse_cookie_fields(cookie: str) -> dict[str, str]:
        fields: dict[str, str] = {}
        for segment in cookie.split(";"):
            key, separator, value = segment.strip().partition("=")
            if not separator or not key:
                continue
            fields[key.strip()] = value.strip()
        return fields

    @staticmethod
    def _login_url_to_cookie(login_url: str) -> str:
        query = urlsplit(login_url).query.strip()
        if not query:
            raise RuntimeError("Bilibili login response did not include cookie data.")
        return query.replace("&", ";").replace(",", "%2C")

    @staticmethod
    def _coerce_int(value: Any) -> int | None:
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.strip().lstrip("-").isdigit():
            return int(value)
        return None

    @staticmethod
    def _to_iso_timestamp(timestamp: float | int) -> str:
        return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()


bilibili_auth_service = BilibiliAuthService()
