"""Persistent application settings backed by a local JSON file.

Reads from ``%APPDATA%/CyberCat/config.json`` (Windows) with a
fallback to environment variables / ``.env``.
"""

import json
import os
import sys
import uuid
from pathlib import Path
from typing import Any

# All recognised setting keys with their env-var names and defaults.
_FIELDS: dict[str, tuple[str, Any]] = {
    # key            -> (ENV_VAR_NAME, default_value)
    "qwen_api_key": ("QWEN_API_KEY", ""),
    "qwen_asr_base_url": (
        "QWEN_ASR_BASE_URL",
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    "qwen_tts_base_url": ("QWEN_TTS_BASE_URL", "https://dashscope.aliyuncs.com/api/v1"),
    "qwen_tts_model": ("QWEN_TTS_MODEL", "qwen-tts-latest"),
    "voice": ("VOICE", "auto"),
    "random_voice_pool": ("RANDOM_VOICE_POOL", ""),
    "qwen_hotwords": ("QWEN_HOTWORDS", "CyberCat,zixiCat,OpenClaw"),
    "openai_api_key": ("OPENAI_API_KEY", ""),
    "openai_base_url": ("OPENAI_BASE_URL", ""),
    "openai_model": ("OPENAI_MODEL", ""),
    "openai_enable_thinking": ("OPENAI_ENABLE_THINKING", False),
}

REQUIRED_KEYS = ["qwen_api_key", "openai_api_key", "openai_base_url", "openai_model"]
SCHEMA_VERSION = 2
DEFAULT_PROFILE_ID = "default"
DEFAULT_PROFILE_NAME = "Default"
LOCKED_QWEN_TTS_MODEL = "qwen-tts-latest"


def _config_dir() -> Path:
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return base / "CyberCat"


def _config_path() -> Path:
    return _config_dir() / "config.json"


def _default_settings() -> dict[str, Any]:
    settings: dict[str, Any] = {}
    for key, (env_var, default) in _FIELDS.items():
        env_value = os.getenv(env_var)
        settings[key] = (
            ConfigService._coerce_value(env_value, default) if env_value is not None else default
        )
    return settings


class ConfigService:
    def __init__(self) -> None:
        self._profiles: dict[str, dict[str, Any]] = {}
        self._active_profile_id = DEFAULT_PROFILE_ID
        self.load()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def load(self) -> None:
        """Load config from disk, falling back to env vars."""
        default_settings = _default_settings()
        self._profiles = {
            DEFAULT_PROFILE_ID: {
                "name": DEFAULT_PROFILE_NAME,
                "settings": dict(default_settings),
            }
        }
        self._active_profile_id = DEFAULT_PROFILE_ID

        path = _config_path()
        if path.is_file():
            try:
                saved = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(saved, dict):
                    if "profiles" in saved:
                        self._load_profile_store(saved, default_settings)
                    else:
                        self._profiles = {
                            DEFAULT_PROFILE_ID: {
                                "name": DEFAULT_PROFILE_NAME,
                                "settings": self._merge_settings(saved, default_settings),
                            }
                        }
                        self._active_profile_id = DEFAULT_PROFILE_ID
            except (json.JSONDecodeError, OSError) as exc:
                print(f"[config] Failed to read {path}: {exc}")

    def save(self, updates: dict[str, Any]) -> None:
        """Merge *updates* into the config and persist to disk."""
        active_settings = self._active_settings()
        for key, value in updates.items():
            if key in _FIELDS:
                active_settings[key] = self._coerce_setting_value(key, value, _FIELDS[key][1])

        self._persist()

    def get(self, key: str, fallback: Any = "") -> Any:
        return self._active_settings().get(key, fallback)

    def get_all(self) -> dict[str, Any]:
        """Return a copy of all settings (values masked for display are NOT masked here)."""
        return dict(self._active_settings())

    def get_bool(self, key: str, fallback: bool = False) -> bool:
        return bool(self._coerce_value(self._active_settings().get(key, fallback), fallback))

    def is_configured(self) -> bool:
        """Return True if all required keys have non-empty values."""
        active_settings = self._active_settings()
        return all(bool(active_settings.get(key)) for key in REQUIRED_KEYS)

    def get_status(self) -> dict[str, Any]:
        """Return a status dict suitable for sending to the frontend."""
        return {
            "configured": self.is_configured(),
            "missing": [key for key in REQUIRED_KEYS if not self._active_settings().get(key)],
            "activeProfileId": self._active_profile_id,
        }

    def get_profiles_summary(self) -> dict[str, Any]:
        return {
            "activeProfileId": self._active_profile_id,
            "profiles": [
                {
                    "id": profile_id,
                    "name": str(profile.get("name") or DEFAULT_PROFILE_NAME),
                }
                for profile_id, profile in self._profiles.items()
            ],
        }

    def create_profile(self, name: str | None = None) -> dict[str, Any]:
        profile_name = self._normalize_profile_name(name)
        if not profile_name:
            profile_name = self._next_profile_name()
        self._ensure_unique_profile_name(profile_name)

        profile_id = f"profile_{uuid.uuid4().hex[:8]}"
        self._profiles[profile_id] = {
            "name": profile_name,
            "settings": dict(self._active_settings()),
        }
        self._active_profile_id = profile_id
        self._persist()
        return {"id": profile_id, "name": profile_name}

    def rename_profile(self, profile_id: str, name: str) -> None:
        profile = self._require_profile(profile_id)
        profile_name = self._normalize_profile_name(name)
        if not profile_name:
            raise ValueError("Profile name cannot be empty.")
        self._ensure_unique_profile_name(profile_name, exclude_profile_id=profile_id)
        profile["name"] = profile_name
        self._persist()

    def delete_profile(self, profile_id: str) -> str:
        self._require_profile(profile_id)
        if len(self._profiles) <= 1:
            raise ValueError("At least one settings profile must remain.")

        del self._profiles[profile_id]
        if self._active_profile_id == profile_id:
            self._active_profile_id = next(iter(self._profiles))
        self._persist()
        return self._active_profile_id

    def set_active_profile(self, profile_id: str) -> None:
        self._require_profile(profile_id)
        self._active_profile_id = profile_id
        self._persist()

    def get_active_profile(self) -> dict[str, str]:
        profile = self._require_profile(self._active_profile_id)
        return {
            "id": self._active_profile_id,
            "name": str(profile.get("name") or DEFAULT_PROFILE_NAME),
        }

    @staticmethod
    def _coerce_value(value: Any, default: Any) -> Any:
        if isinstance(default, bool):
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                return value.strip().lower() in {"1", "true", "yes", "on"}
            return bool(value)

        if value is None:
            return default

        return str(value)

    @staticmethod
    def _coerce_setting_value(key: str, value: Any, default: Any) -> Any:
        coerced_value = ConfigService._coerce_value(value, default)
        if key == "qwen_tts_model":
            return LOCKED_QWEN_TTS_MODEL
        return coerced_value

    def _active_settings(self) -> dict[str, Any]:
        profile = self._profiles.get(self._active_profile_id)
        if not isinstance(profile, dict):
            profile = self._profiles[DEFAULT_PROFILE_ID]
            self._active_profile_id = DEFAULT_PROFILE_ID
        settings = profile.get("settings")
        if not isinstance(settings, dict):
            settings = dict(_default_settings())
            profile["settings"] = settings
        return settings

    def _persist(self) -> None:
        path = _config_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": SCHEMA_VERSION,
            "active_profile_id": self._active_profile_id,
            "profiles": [
                {
                    "id": profile_id,
                    "name": str(profile.get("name") or DEFAULT_PROFILE_NAME),
                    "settings": dict(profile.get("settings") or {}),
                }
                for profile_id, profile in self._profiles.items()
            ],
        }
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    def _load_profile_store(self, saved: dict[str, Any], default_settings: dict[str, Any]) -> None:
        loaded_profiles: dict[str, dict[str, Any]] = {}
        raw_profiles = saved.get("profiles")

        if isinstance(raw_profiles, dict):
            raw_profile_items = [
                {"id": profile_id, **profile}
                for profile_id, profile in raw_profiles.items()
                if isinstance(profile, dict)
            ]
        elif isinstance(raw_profiles, list):
            raw_profile_items = [profile for profile in raw_profiles if isinstance(profile, dict)]
        else:
            raw_profile_items = []

        for index, raw_profile in enumerate(raw_profile_items, start=1):
            profile_id = str(raw_profile.get("id") or f"profile_{index}").strip()
            profile_name = (
                self._normalize_profile_name(raw_profile.get("name")) or f"Profile {index}"
            )
            raw_settings = raw_profile.get("settings")
            loaded_profiles[profile_id] = {
                "name": profile_name,
                "settings": self._merge_settings(raw_settings, default_settings),
            }

        if not loaded_profiles:
            loaded_profiles = {
                DEFAULT_PROFILE_ID: {
                    "name": DEFAULT_PROFILE_NAME,
                    "settings": dict(default_settings),
                }
            }

        self._profiles = loaded_profiles
        requested_active_profile = str(saved.get("active_profile_id") or "").strip()
        self._active_profile_id = (
            requested_active_profile
            if requested_active_profile in self._profiles
            else next(iter(self._profiles))
        )

    def _merge_settings(
        self, saved_settings: Any, default_settings: dict[str, Any]
    ) -> dict[str, Any]:
        merged = dict(default_settings)
        if isinstance(saved_settings, dict):
            for key, (_, default) in _FIELDS.items():
                if key in saved_settings and saved_settings[key] is not None:
                    merged[key] = self._coerce_setting_value(key, saved_settings[key], default)
        return merged

    def _require_profile(self, profile_id: str) -> dict[str, Any]:
        profile = self._profiles.get(profile_id)
        if not isinstance(profile, dict):
            raise ValueError(f"Unknown settings profile: {profile_id}")
        return profile

    def _normalize_profile_name(self, name: Any) -> str:
        return str(name or "").strip()

    def _ensure_unique_profile_name(self, name: str, exclude_profile_id: str | None = None) -> None:
        normalized_name = name.strip().lower()
        for profile_id, profile in self._profiles.items():
            if profile_id == exclude_profile_id:
                continue
            existing_name = str(profile.get("name") or "").strip().lower()
            if existing_name == normalized_name:
                raise ValueError(f'Profile name "{name}" already exists.')

    def _next_profile_name(self) -> str:
        taken_names = {
            str(profile.get("name") or "").strip().lower() for profile in self._profiles.values()
        }
        index = 2
        candidate = "Profile"
        while candidate.lower() in taken_names:
            candidate = f"Profile {index}"
            index += 1
        return candidate


config_service = ConfigService()
