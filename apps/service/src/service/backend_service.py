"""Thin QObject facade exposed to the React frontend via QWebChannel.

All business logic lives in handler modules under ``service.backend``.
This class only wires Qt signals/slots to those handlers.
"""

import json

from PySide6.QtCore import QObject, Signal, Slot

from constants.tts import get_voice_options
from service.backend.asr_handler import start_asr_test_recording, stop_asr_test_recording
from service.backend.audio_handler import get_audio_file, save_audio_chunks
from service.backend.prompt_handler import get_available_prompts, get_prompt_content
from service.backend.settings_backup_handler import (
    backup_settings,
    get_settings_backup_info,
    restore_settings,
)
from service.backend.session_handler import (
    delete_session,
    load_sessions,
    save_session,
)
from service.backend.tts_handler import run_tts_test
from service.config_service import config_service
from service.qwen_service import qwen_service
from service.qwen_tts_service import qwen_tts_service
from service.task_service import task_service

BILIBILI_FEATURE_DISABLED_ERROR = "Bilibili is disabled. Enable it in Settings > Features."
FILE_INGEST_FEATURE_DISABLED_ERROR = "File ingest is disabled. Enable it in Settings > Features."


def _bilibili_disabled_status() -> str:
    return json.dumps(
        {
            "featureEnabled": False,
            "configured": False,
            "state": "not_configured",
            "remoteChecked": False,
            "hasSessData": False,
            "userId": "",
            "username": "",
            "expiresAt": None,
        }
    )


def _bilibili_disabled_result() -> str:
    return json.dumps({"ok": False, "error": BILIBILI_FEATURE_DISABLED_ERROR})


def _file_ingest_disabled_result() -> str:
    return json.dumps({"ok": False, "error": FILE_INGEST_FEATURE_DISABLED_ERROR})


def _reload_runtime_settings() -> None:
    task_service.reload_config()
    qwen_service.reload_config()
    qwen_tts_service.reload_config()


class BackendService(QObject):
    """Single QWebChannel-registered object bridging React ↔ Python."""

    # ── Signals forwarded from TaskService ────────────────────────
    task_started = Signal(int, str)
    task_log = Signal(int, str, str)
    segment_text_chunk = Signal(int, str)
    segment_audio_chunk = Signal(int, str)
    segment_finished = Signal(int)
    task_finished = Signal()

    # ── Window chrome signals ─────────────────────────────────────
    minimize_requested = Signal()
    maximize_requested = Signal()
    close_requested = Signal()
    drag_requested = Signal()
    window_state_changed = Signal(bool)

    # ── TTS test signals ──────────────────────────────────────────
    tts_test_started = Signal(str)
    tts_test_finished = Signal(str, str)

    # ── Danmu signal ──────────────────────────────────────────────
    show_danmu = Signal(str)

    # ── File ingest signals ───────────────────────────────────────
    file_ingest_started = Signal(str)
    file_ingest_finished = Signal(str)

    def __init__(self) -> None:
        super().__init__()
        self._active_system_prompt: str = ""
        self._connect_task_signals()

    # ── Task delegation ───────────────────────────────────────────

    @Slot(str, str, str)
    def start_task(self, text: str, system_prompt: str = "", history_json: str = "") -> None:
        prompt = system_prompt or self._active_system_prompt
        task_service.reload_config()
        task_service.start_task(text, system_prompt=prompt, history_json=history_json)

    @Slot()
    def stop_task(self) -> None:
        task_service.stop_task()

    # ── Window chrome ─────────────────────────────────────────────

    @Slot()
    def start_drag(self) -> None:
        self.drag_requested.emit()

    @Slot()
    def minimize_window(self) -> None:
        self.minimize_requested.emit()

    @Slot()
    def maximize_window(self) -> None:
        self.maximize_requested.emit()

    @Slot()
    def close_window(self) -> None:
        self.close_requested.emit()

    def set_window_maximized(self, maximized: bool) -> None:
        self.window_state_changed.emit(maximized)

    # ── Config / settings ─────────────────────────────────────────

    @Slot(result=str)
    def get_config_status(self) -> str:
        return json.dumps(config_service.get_status())

    @Slot(result=str)
    def get_settings(self) -> str:
        return json.dumps(config_service.get_all())

    @Slot(str, result=str)
    def save_settings(self, settings_json: str) -> str:
        try:
            updates = json.loads(settings_json)
            config_service.save(updates)
            _reload_runtime_settings()
            return json.dumps({"ok": True})
        except Exception as exc:
            return json.dumps({"ok": False, "error": str(exc)})

    @Slot(result=str)
    def get_settings_backup_info(self) -> str:
        try:
            return json.dumps(get_settings_backup_info())
        except Exception as exc:
            return json.dumps({"ok": False, "error": str(exc)})

    @Slot(result=str)
    def backup_settings(self) -> str:
        try:
            return json.dumps(backup_settings())
        except Exception as exc:
            return json.dumps({"ok": False, "error": str(exc)})

    @Slot(result=str)
    def restore_settings(self) -> str:
        try:
            result = restore_settings()
            if result.get("ok"):
                _reload_runtime_settings()
            return json.dumps(result)
        except Exception as exc:
            return json.dumps({"ok": False, "error": str(exc)})

    # ── Bilibili auth ────────────────────────────────────────────

    @Slot(result=str)
    def get_bilibili_auth_status(self) -> str:
        if not config_service.is_feature_enabled("bilibili"):
            return _bilibili_disabled_status()

        from service.backend.bilibili_handler import get_bilibili_auth_status

        return get_bilibili_auth_status()

    @Slot(result=str)
    def start_bilibili_qr_login(self) -> str:
        if not config_service.is_feature_enabled("bilibili"):
            return _bilibili_disabled_result()

        from service.backend.bilibili_handler import start_bilibili_qr_login

        return start_bilibili_qr_login()

    @Slot(str, result=str)
    def poll_bilibili_qr_login(self, session_id: str) -> str:
        if not config_service.is_feature_enabled("bilibili"):
            return _bilibili_disabled_result()

        from service.backend.bilibili_handler import poll_bilibili_qr_login

        return poll_bilibili_qr_login(session_id)

    # ── File ingest ───────────────────────────────────────────────

    def can_accept_file_ingest(self) -> bool:
        return config_service.is_feature_enabled("file_ingest")

    def handle_native_file_drop(self, paths: list[str]) -> str:
        return self._start_file_ingest(paths)

    @Slot(result=str)
    def pick_file_ingest_paths(self) -> str:
        if not config_service.is_feature_enabled("file_ingest"):
            return _file_ingest_disabled_result()

        from service.backend.file_ingest_handler import pick_file_ingest_paths

        return json.dumps(pick_file_ingest_paths(), ensure_ascii=False)

    @Slot(str, result=str)
    def start_file_ingest(self, paths_json: str) -> str:
        try:
            payload = json.loads(paths_json)
        except json.JSONDecodeError:
            return json.dumps({"ok": False, "error": "Invalid file ingest payload."})

        if not isinstance(payload, list):
            return json.dumps({"ok": False, "error": "File ingest payload must be a list."})

        return self._start_file_ingest(payload)

    # ── Settings profiles ─────────────────────────────────────────

    @Slot(result=str)
    def get_settings_profiles(self) -> str:
        return json.dumps(config_service.get_profiles_summary())

    @Slot(str, result=str)
    def create_settings_profile(self, profile_name: str) -> str:
        try:
            result = config_service.create_profile(profile_name or None)
            return json.dumps({"ok": True, **result})
        except Exception as exc:
            return json.dumps({"ok": False, "error": str(exc)})

    @Slot(str, str, result=str)
    def rename_settings_profile(self, profile_id: str, profile_name: str) -> str:
        try:
            config_service.rename_profile(profile_id, profile_name)
            return json.dumps({"ok": True})
        except Exception as exc:
            return json.dumps({"ok": False, "error": str(exc)})

    @Slot(str, result=str)
    def delete_settings_profile(self, profile_id: str) -> str:
        try:
            was_active_profile = config_service.get_active_profile()["id"] == profile_id
            new_active = config_service.delete_profile(profile_id)
            if was_active_profile:
                _reload_runtime_settings()
            return json.dumps({"ok": True, "activeProfileId": new_active})
        except Exception as exc:
            return json.dumps({"ok": False, "error": str(exc)})

    @Slot(str, result=str)
    def select_settings_profile(self, profile_id: str) -> str:
        try:
            config_service.set_active_profile(profile_id)
            _reload_runtime_settings()
            return json.dumps({"ok": True})
        except Exception as exc:
            return json.dumps({"ok": False, "error": str(exc)})

    # ── Prompts ───────────────────────────────────────────────────

    @Slot(result=str)
    def get_available_prompts(self) -> str:
        return get_available_prompts()

    @Slot(str, result=str)
    def get_prompt_content(self, filename: str) -> str:
        return get_prompt_content(filename)

    @Slot(str)
    def set_active_system_prompt(self, content: str) -> None:
        self._active_system_prompt = content

    # ── Sessions ──────────────────────────────────────────────────

    @Slot(result=str)
    def load_sessions(self) -> str:
        return load_sessions()

    @Slot(str, str)
    def save_session(self, session_id: str, session_json: str) -> None:
        save_session(session_id, session_json)

    @Slot(str)
    def delete_session(self, session_id: str) -> None:
        delete_session(session_id)

    # ── Audio files ───────────────────────────────────────────────

    @Slot(str, result=str)
    def get_audio_file(self, filename: str) -> str:
        return get_audio_file(filename)

    @Slot(str, result=str)
    def save_audio_chunks(self, chunks_json: str) -> str:
        return save_audio_chunks(chunks_json)

    # ── Voice / TTS ───────────────────────────────────────────────

    @Slot(result=str)
    def get_voice_options(self) -> str:
        return json.dumps(get_voice_options())

    @Slot(result=str)
    def get_active_voice(self) -> str:
        return json.dumps({"voice": qwen_tts_service.get_default_voice()})

    @Slot(str)
    def set_active_voice(self, voice: str) -> None:
        qwen_tts_service.set_default_voice(voice)

    @Slot(result=str)
    def get_random_voice_pool(self) -> str:
        return json.dumps(qwen_tts_service.get_random_voice_pool())

    @Slot(str)
    def set_random_voice_pool(self, voices_json: str) -> None:
        try:
            voices = json.loads(voices_json)
            qwen_tts_service.set_random_voice_pool(voices)
        except json.JSONDecodeError:
            pass

    # ── TTS / ASR testing ─────────────────────────────────────────

    @Slot(str, str, str)
    def start_tts_test(self, request_id: str, text: str, voice: str) -> None:
        run_tts_test(
            request_id,
            text,
            voice,
            on_started=self.tts_test_started,
            on_finished=self.tts_test_finished,
        )

    @Slot(result=str)
    def start_asr_test_recording(self) -> str:
        return start_asr_test_recording()

    @Slot(result=str)
    def stop_asr_test_recording(self) -> str:
        return stop_asr_test_recording()

    # ── ASR transcription ─────────────────────────────────────────

    @Slot(str, str, result=str)
    def transcribe_audio_base64(self, audio_base64: str, extension: str) -> str:
        try:
            import base64 as b64
            import os
            import tempfile

            from service.qwen_service import qwen_service

            audio_bytes = b64.b64decode(audio_base64)
            tmp = tempfile.NamedTemporaryFile(suffix=f".{extension}", delete=False)
            try:
                tmp.write(audio_bytes)
                tmp.close()
                text = qwen_service.transcribe_audio(tmp.name)
                return json.dumps({"ok": True, "text": text})
            finally:
                try:
                    os.unlink(tmp.name)
                except OSError:
                    pass
        except Exception as exc:
            return json.dumps({"ok": False, "error": str(exc)})

    # ── Internal wiring ───────────────────────────────────────────

    def _connect_task_signals(self) -> None:
        """Forward TaskService signals through this QObject."""
        task_service.task_started.connect(self.task_started)
        task_service.task_log.connect(self.task_log)
        task_service.segment_text_chunk.connect(self.segment_text_chunk)
        task_service.segment_audio_chunk.connect(self.segment_audio_chunk)
        task_service.segment_finished.connect(self._on_segment_finished)
        task_service.task_finished.connect(self.task_finished)

    def _on_segment_finished(self, segment_id: int, _text: str) -> None:
        """TaskService emits (id, text) but the frontend only expects (id)."""
        self.segment_finished.emit(segment_id)

    def _start_file_ingest(self, raw_paths: list[str]) -> str:
        if not config_service.is_feature_enabled("file_ingest"):
            return _file_ingest_disabled_result()

        from service.backend.file_ingest_handler import start_file_ingest

        return start_file_ingest(
            [str(path) for path in raw_paths],
            on_started=lambda payload: self.file_ingest_started.emit(
                json.dumps(payload, ensure_ascii=False)
            ),
            on_finished=lambda payload: self.file_ingest_finished.emit(
                json.dumps(payload, ensure_ascii=False)
            ),
        )
