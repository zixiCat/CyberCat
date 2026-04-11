"""Persistent application settings backed by a local JSON file.

Reads from ``%APPDATA%/CyberCat/config.json`` (Windows) with a
fallback to environment variables / ``.env``.
"""

import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from utils.file_ingest_archive import normalize_file_ingest_folder_path

DEFAULT_FILE_INGEST_FOLDER = "inbox"
DEFAULT_FILE_INGEST_PURPOSE = (
    "General knowledge inbox. Route dropped material here when it does not fit a more specific "
    "archive folder."
)
LEGACY_FILE_INGEST_TARGET_FILE_KEY = "file_ingest_target_file"
LEGACY_FILE_INGEST_TARGET_PURPOSE_KEY = "file_ingest_target_purpose"
LEGACY_CUSTOM_PROMPT_KEY = "custom_prompt"
CUSTOM_PROMPTS_KEY = "custom_prompts"
LEGACY_CUSTOM_PROMPT_FILE = "Custom.md"
DEFAULT_CUSTOM_PROMPT_NAME = "Custom"
DEFAULT_CUSTOM_PROMPT_NAME_PREFIX = "Custom Prompt"


def _default_file_ingest_targets_json(
    folder_path: str | None = None,
    purpose: str | None = None,
) -> str:
    target_folder = _derive_legacy_file_ingest_folder(folder_path)
    target_purpose = str(purpose or "").strip() or DEFAULT_FILE_INGEST_PURPOSE
    return json.dumps(
        [
            {
                "id": "default-inbox",
                "folderPath": target_folder,
                "purpose": target_purpose,
            }
        ],
        ensure_ascii=False,
    )


def _derive_legacy_file_ingest_folder(raw_path: Any) -> str:
    cleaned = str(raw_path or "").strip().replace("\\", "/")
    if not cleaned:
        return DEFAULT_FILE_INGEST_FOLDER

    candidate = Path(cleaned)
    if candidate.is_absolute():
        if candidate.suffix:
            return candidate.parent.as_posix()
        return candidate.as_posix()

    parts = [part for part in candidate.parts if part not in {"", ".", ".."}]
    if not parts:
        return DEFAULT_FILE_INGEST_FOLDER

    last_segment = parts[-1]
    if candidate.suffix:
        folder_parts = parts[:-1]
        if folder_parts:
            return Path(*folder_parts).as_posix()
        return Path(last_segment).stem or DEFAULT_FILE_INGEST_FOLDER

    return Path(*parts).as_posix()


def _normalize_file_ingest_targets_json(raw_value: Any) -> str:
    if raw_value is None:
        return _default_file_ingest_targets_json()

    payload: Any = raw_value
    if isinstance(raw_value, str):
        stripped = raw_value.strip()
        if not stripped:
            return _default_file_ingest_targets_json()
        try:
            payload = json.loads(stripped)
        except json.JSONDecodeError as exc:
            raise ValueError("File ingest folders must be valid JSON.") from exc

    if not isinstance(payload, list):
        raise ValueError("File ingest folders must be saved as a list.")

    normalized_targets: list[dict[str, str]] = []
    seen_paths: set[str] = set()

    for index, item in enumerate(payload, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"File ingest folder #{index} is invalid.")

        raw_folder_path = str(item.get("folderPath") or "").strip()
        if not raw_folder_path:
            raise ValueError(f"File ingest folder #{index} is missing a folder path.")

        try:
            folder_path = normalize_file_ingest_folder_path(raw_folder_path)
        except ValueError as exc:
            raise ValueError(f"File ingest folder #{index}: {exc}") from exc

        dedupe_key = folder_path.lower()
        if dedupe_key in seen_paths:
            raise ValueError(f"Duplicate file ingest folder target: {folder_path}")

        normalized_targets.append(
            {
                "id": str(item.get("id") or "").strip() or f"file-ingest-{uuid.uuid4().hex[:8]}",
                "folderPath": folder_path,
                "purpose": str(item.get("purpose") or "").strip() or DEFAULT_FILE_INGEST_PURPOSE,
            }
        )
        seen_paths.add(dedupe_key)

    if not normalized_targets:
        raise ValueError("At least one file ingest folder is required.")

    return json.dumps(normalized_targets, ensure_ascii=False)


def _create_custom_prompt_record(
    index: int,
    *,
    prompt_id: Any = None,
    name: Any = None,
    content: Any = None,
) -> dict[str, str]:
    normalized_id = "".join(
        character
        for character in str(prompt_id or "").strip()
        if character.isalnum() or character in {"-", "_"}
    )
    prompt_name = str(name or "").strip() or f"{DEFAULT_CUSTOM_PROMPT_NAME_PREFIX} {index}"
    return {
        "id": normalized_id or f"custom-{uuid.uuid4().hex[:8]}",
        "name": prompt_name,
        "content": str(content or ""),
    }


def _collect_legacy_custom_prompt_values(raw_items: Any) -> list[str]:
    prompt_entries: list[tuple[int, str, str]] = []

    for raw_key, raw_value in raw_items:
        normalized_key = str(raw_key or "").strip()
        if not normalized_key:
            continue

        lowered_key = normalized_key.lower()
        if lowered_key != LEGACY_CUSTOM_PROMPT_KEY:
            continue

        prompt_content = str(raw_value or "").strip()
        if not prompt_content:
            continue

        prompt_entries.append(
            (
                0,
                lowered_key,
                prompt_content,
            )
        )

    prompt_entries.sort(key=lambda item: (item[0], item[1]))

    deduped_prompts: list[str] = []
    seen_contents: set[str] = set()
    for _, _, prompt_content in prompt_entries:
        if prompt_content in seen_contents:
            continue
        deduped_prompts.append(prompt_content)
        seen_contents.add(prompt_content)

    return deduped_prompts


def _default_custom_prompts_json(*legacy_prompts: Any) -> str:
    normalized_prompts = [
        str(raw_prompt or "").strip()
        for raw_prompt in legacy_prompts
        if str(raw_prompt or "").strip()
    ]
    if not normalized_prompts:
        return json.dumps([], ensure_ascii=False)

    return json.dumps(
        [
            _create_custom_prompt_record(
                index,
                prompt_id="custom-default" if index == 1 else None,
                name=DEFAULT_CUSTOM_PROMPT_NAME if index == 1 else None,
                content=prompt_content,
            )
            for index, prompt_content in enumerate(normalized_prompts, start=1)
        ],
        ensure_ascii=False,
    )


def _normalize_custom_prompts_json(raw_value: Any, *legacy_prompts: Any) -> str:
    if raw_value is None:
        return _default_custom_prompts_json(*legacy_prompts)

    payload: Any = raw_value
    if isinstance(raw_value, str):
        stripped = raw_value.strip()
        if not stripped:
            return _default_custom_prompts_json(*legacy_prompts)
        try:
            payload = json.loads(stripped)
        except json.JSONDecodeError as exc:
            raise ValueError("Custom prompts must be valid JSON.") from exc

    if not isinstance(payload, list):
        raise ValueError("Custom prompts must be saved as a list.")

    normalized_prompts = []
    for index, item in enumerate(payload, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Custom prompt #{index} is invalid.")

        normalized_prompts.append(
            _create_custom_prompt_record(
                index,
                prompt_id=item.get("id"),
                name=item.get("name"),
                content=item.get("content"),
            )
        )

    return json.dumps(normalized_prompts, ensure_ascii=False)


def load_custom_prompts(raw_value: Any, *legacy_prompts: Any) -> list[dict[str, str]]:
    normalized_value = _normalize_custom_prompts_json(raw_value, *legacy_prompts)
    payload = json.loads(normalized_value)
    return [
        {
            "id": str(item.get("id") or ""),
            "name": str(item.get("name") or ""),
            "content": str(item.get("content") or ""),
        }
        for item in payload
        if isinstance(item, dict)
    ]


# All recognised setting keys with their env-var names and defaults.
_FIELDS: dict[str, tuple[str, Any]] = {
    # key            -> (ENV_VAR_NAME, default_value)
    "feature_bilibili_enabled": ("FEATURE_BILIBILI_ENABLED", False),
    "feature_file_ingest_enabled": ("FEATURE_FILE_INGEST_ENABLED", False),
    "bilibili_cookie": ("BILIBILI_COOKIE", ""),
    "bilibili_url": ("BILIBILI_URL", ""),
    "file_ingest_targets": ("FILE_INGEST_TARGETS", _default_file_ingest_targets_json()),
    "custom_prompts": ("CUSTOM_PROMPTS", _default_custom_prompts_json()),
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

FEATURE_FIELD_KEYS: dict[str, str] = {
    "bilibili": "feature_bilibili_enabled",
    "file_ingest": "feature_file_ingest_enabled",
}

REQUIRED_KEYS = ["qwen_api_key", "openai_api_key", "openai_base_url", "openai_model"]
SCHEMA_VERSION = 7
DEFAULT_PROFILE_ID = "default"
DEFAULT_PROFILE_NAME = "Default"
LOCKED_QWEN_TTS_MODEL = "qwen-tts-latest"
SETTINGS_BACKUP_SUFFIX = ".json"
RESTORE_SNAPSHOT_SUFFIX = ".pre-restore"
TIMESTAMP_FILENAME_FORMAT = "%Y%m%d-%H%M%S"


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

    if os.getenv("FEATURE_BILIBILI_ENABLED") is None and _has_legacy_bilibili_settings(settings):
        settings["feature_bilibili_enabled"] = True

    if os.getenv("FILE_INGEST_TARGETS") is None and (
        os.getenv("FILE_INGEST_TARGET_FILE") or os.getenv("FILE_INGEST_TARGET_PURPOSE")
    ):
        settings["file_ingest_targets"] = _default_file_ingest_targets_json(
            os.getenv("FILE_INGEST_TARGET_FILE"),
            os.getenv("FILE_INGEST_TARGET_PURPOSE"),
        )

    if os.getenv("CUSTOM_PROMPTS") is None:
        legacy_prompt_values = _collect_legacy_custom_prompt_values(os.environ.items())
        if legacy_prompt_values:
            settings[CUSTOM_PROMPTS_KEY] = _default_custom_prompts_json(*legacy_prompt_values)

    return settings


def _has_legacy_bilibili_settings(settings: dict[str, Any]) -> bool:
    return any(
        bool(str(settings.get(key) or "").strip()) for key in ("bilibili_cookie", "bilibili_url")
    )


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
                if key == "file_ingest_targets":
                    active_settings[key] = _normalize_file_ingest_targets_json(value)
                    continue
                if key == CUSTOM_PROMPTS_KEY:
                    active_settings[key] = _normalize_custom_prompts_json(value)
                    continue
                active_settings[key] = self._coerce_setting_value(key, value, _FIELDS[key][1])

        self._persist()

    def get(self, key: str, fallback: Any = "") -> Any:
        return self._active_settings().get(key, fallback)

    def get_all(self) -> dict[str, Any]:
        """Return a copy of all settings (values masked for display are NOT masked here)."""
        return dict(self._active_settings())

    def get_bool(self, key: str, fallback: bool = False) -> bool:
        return bool(self._coerce_value(self._active_settings().get(key, fallback), fallback))

    def is_feature_enabled(self, feature_name: str) -> bool:
        field_key = FEATURE_FIELD_KEYS.get(feature_name)
        if field_key is None:
            raise ValueError(f"Unknown feature: {feature_name}")
        return self.get_bool(field_key)

    def get_feature_flags(self) -> dict[str, bool]:
        return {
            feature_name: self.get_bool(field_key)
            for feature_name, field_key in FEATURE_FIELD_KEYS.items()
        }

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
            "features": self.get_feature_flags(),
        }

    def get_storage_metadata(self) -> dict[str, Any]:
        path = _config_path()
        config_exists = path.is_file()
        last_modified_at: str | None = None

        if config_exists:
            try:
                last_modified_at = datetime.fromtimestamp(
                    path.stat().st_mtime,
                    tz=timezone.utc,
                ).isoformat()
            except OSError:
                last_modified_at = None

        active_profile = self.get_active_profile()
        return {
            "configPath": str(path),
            "configDirectory": str(path.parent),
            "configExists": config_exists,
            "lastModifiedAt": last_modified_at,
            "profileCount": len(self._profiles),
            "activeProfileId": active_profile["id"],
            "activeProfileName": active_profile["name"],
        }

    def backup_to(self, destination: Path) -> dict[str, Any]:
        backup_path = destination.expanduser()
        if not backup_path.suffix:
            backup_path = backup_path.with_suffix(SETTINGS_BACKUP_SUFFIX)

        backup_path.parent.mkdir(parents=True, exist_ok=True)
        backup_path.write_text(
            json.dumps(self._serialize_store(), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        return {
            "backupPath": str(backup_path),
            "info": self.get_storage_metadata(),
        }

    def restore_from(self, source: Path) -> dict[str, Any]:
        source_path = source.expanduser()
        if not source_path.is_file():
            raise ValueError(f"Backup file not found: {source_path}")

        try:
            payload = json.loads(source_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("Backup file is not valid JSON.") from exc
        except OSError as exc:
            raise ValueError(f"Unable to read backup file: {exc}") from exc

        if not isinstance(payload, dict):
            raise ValueError("Backup file must contain a JSON object.")
        if not self._is_settings_backup_payload(payload):
            raise ValueError("Selected file is not a CyberCat settings backup.")

        safety_backup_path = self._create_restore_snapshot()
        config_path = _config_path()
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        self.load()
        self._persist()
        return {
            "restoredFrom": str(source_path),
            "safetyBackupPath": str(safety_backup_path),
            "info": self.get_storage_metadata(),
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
        if key == CUSTOM_PROMPTS_KEY:
            return _normalize_custom_prompts_json(coerced_value)
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
        payload = self._serialize_store()
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    def _serialize_store(self) -> dict[str, Any]:
        return {
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

    def _is_settings_backup_payload(self, payload: dict[str, Any]) -> bool:
        if "profiles" in payload:
            return isinstance(payload.get("profiles"), (dict, list))

        legacy_keys = {
            LEGACY_CUSTOM_PROMPT_KEY,
            LEGACY_FILE_INGEST_TARGET_FILE_KEY,
            LEGACY_FILE_INGEST_TARGET_PURPOSE_KEY,
        }
        return any(key in payload for key in set(_FIELDS) | legacy_keys) or bool(
            _collect_legacy_custom_prompt_values(payload.items())
        )

    def _create_restore_snapshot(self) -> Path:
        config_path = _config_path()
        config_path.parent.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime(TIMESTAMP_FILENAME_FORMAT)
        snapshot_path = config_path.with_name(
            f"{config_path.stem}{RESTORE_SNAPSHOT_SUFFIX}-{timestamp}{config_path.suffix}"
        )
        snapshot_path.write_text(
            json.dumps(self._serialize_store(), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        return snapshot_path

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

            if "feature_bilibili_enabled" not in saved_settings and _has_legacy_bilibili_settings(
                saved_settings
            ):
                merged["feature_bilibili_enabled"] = True

            if (
                "file_ingest_targets" not in saved_settings
                or not str(saved_settings.get("file_ingest_targets") or "").strip()
            ) and (
                saved_settings.get(LEGACY_FILE_INGEST_TARGET_FILE_KEY)
                or saved_settings.get(LEGACY_FILE_INGEST_TARGET_PURPOSE_KEY)
            ):
                merged["file_ingest_targets"] = _default_file_ingest_targets_json(
                    saved_settings.get(LEGACY_FILE_INGEST_TARGET_FILE_KEY),
                    saved_settings.get(LEGACY_FILE_INGEST_TARGET_PURPOSE_KEY),
                )

            if (
                CUSTOM_PROMPTS_KEY not in saved_settings
                or not str(saved_settings.get(CUSTOM_PROMPTS_KEY) or "").strip()
            ):
                legacy_prompt_values = _collect_legacy_custom_prompt_values(saved_settings.items())
                if legacy_prompt_values:
                    merged[CUSTOM_PROMPTS_KEY] = _default_custom_prompts_json(*legacy_prompt_values)

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
