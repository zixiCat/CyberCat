"""Qwen TTS (Text-to-Speech) service.

Handles:
- One-shot WAV synthesis via ``synthesize_text()``
- Live streaming playback via ``speak()`` / ``stop()``
- Voice selection and random voice pools
"""

import io
import wave
import base64
import random
import threading
from dataclasses import dataclass, field
from typing import Any

import dashscope
import numpy as np
import sounddevice as sd

from constants.tts import (
    AUTO_VOICE,
    coerce_voice_selection,
    get_all_voices,
    get_voice_model,
    normalize_voice_pool,
)
from service.config_service import config_service

DEFAULT_TTS_BASE_URL = "https://dashscope.aliyuncs.com/api/v1"
SAMPLE_RATE = 24000
CHANNELS = 1
PLAYBACK_CHUNK_SIZE = 2048


def decode_audio_chunk(audio_data: str) -> bytes:
    binary_content = base64.b64decode(audio_data)

    if not binary_content.startswith(b"RIFF") or binary_content[8:12] != b"WAVE":
        return binary_content

    try:
        with wave.open(io.BytesIO(binary_content), "rb") as wav_file:
            return wav_file.readframes(wav_file.getnframes())
    except wave.Error:
        return binary_content


@dataclass
class _PlaybackSession:
    stop_event: threading.Event = field(default_factory=threading.Event)
    cleanup_lock: threading.Lock = field(default_factory=threading.Lock)
    player: sd.OutputStream | None = None
    response: Any = None


@dataclass
class _PlaybackRequest:
    text: str
    voice: str | None = None


class QwenTTSService:
    """Qwen-based TTS with streaming playback support."""

    def __init__(self) -> None:
        self.api_key: str = config_service.get("qwen_api_key")
        self.base_url: str = config_service.get("qwen_tts_base_url") or DEFAULT_TTS_BASE_URL
        self.apply_base_url()

        self.voices: list[str] = []
        self.default_voice: str = AUTO_VOICE
        self.random_voice_pool: list[str] = []
        self.refresh_voice_catalog(
            default_voice=config_service.get("voice", AUTO_VOICE),
            random_voice_pool=config_service.get("random_voice_pool", ""),
        )

        # Playback thread state
        self._session_lock = threading.Lock()
        self._current_session: _PlaybackSession | None = None
        self._request_condition = threading.Condition()
        self._pending_request: _PlaybackRequest | None = None
        threading.Thread(target=self._run_playback_loop, daemon=True).start()

    def refresh_voice_catalog(
        self,
        default_voice: str | None = None,
        random_voice_pool: list[str] | str | None = None,
    ):
        self.voices = get_all_voices()
        next_default_voice = self.default_voice if default_voice is None else default_voice
        self.default_voice = coerce_voice_selection(next_default_voice)
        next_random_voice_pool = (
            self.random_voice_pool if random_voice_pool is None else random_voice_pool
        )
        self.random_voice_pool = normalize_voice_pool(next_random_voice_pool)

    def set_default_voice(self, voice: str):
        self.voices = get_all_voices()
        if voice != AUTO_VOICE and voice not in self.voices:
            raise ValueError(f"Unsupported voice: {voice}")
        self.default_voice = voice

    def get_default_voice(self) -> str:
        return self.default_voice

    def set_random_voice_pool(self, voices: list[str] | str | None):
        self.voices = get_all_voices()
        self.random_voice_pool = normalize_voice_pool(voices)

    def get_random_voice_pool(self) -> list[str]:
        return list(self.random_voice_pool)

    def set_base_url(self, base_url: str | None) -> None:
        self.base_url = base_url or DEFAULT_TTS_BASE_URL
        self.apply_base_url()

    def apply_base_url(self) -> None:
        dashscope.base_http_api_url = self.base_url or DEFAULT_TTS_BASE_URL

    def resolve_voice(self, voice: str | None = None) -> tuple[str, str]:
        self.voices = get_all_voices()
        selected_voice = voice or self.default_voice
        if selected_voice == AUTO_VOICE:
            voice_pool = self.random_voice_pool or self.voices
            selected_voice = random.choice(voice_pool)
        model = get_voice_model(selected_voice)
        return selected_voice, model

    def synthesize_text(self, text: str, voice: str | None = None) -> tuple[bytes, str, str]:
        """Synthesize *text* to a WAV byte buffer. Returns ``(wav_bytes, voice, model)``."""
        if not self.api_key:
            raise ValueError("QWEN_API_KEY not configured")
        if not text or not text.strip():
            raise ValueError("Text is required for TTS synthesis")

        self.apply_base_url()
        selected_voice, model = self.resolve_voice(voice)
        response = self._call_tts(text, selected_voice, model)

        pcm_chunks: list[bytes] = []
        try:
            for chunk in response:
                if chunk.status_code != 200:
                    raise RuntimeError(f"{chunk.code}: {chunk.message}")
                raw = getattr(chunk.output, "audio", {}).get("data")
                if raw:
                    pcm_chunks.append(decode_audio_chunk(raw))
        finally:
            _close_response(response)

        pcm_data = b"".join(pcm_chunks)
        if not pcm_data:
            raise RuntimeError("No audio returned from TTS service")

        return _pcm_to_wav(pcm_data), selected_voice, model

    def _cleanup_session(self, session: _PlaybackSession) -> None:
        with session.cleanup_lock:
            cancelled = session.stop_event.is_set()
            player = session.player
            response = session.response
            session.player = None
            session.response = None

        _close_response(response)

        if player is not None:
            _close_player(player, abort=cancelled)

    def _cancel_session(self, session: _PlaybackSession) -> None:
        session.stop_event.set()
        with session.cleanup_lock:
            response = session.response
            session.response = None
        _close_response(response)

    def _write_audio(
        self, player: sd.OutputStream, audio_array: np.ndarray, session: _PlaybackSession
    ) -> None:
        for start in range(0, len(audio_array), PLAYBACK_CHUNK_SIZE):
            if session.stop_event.is_set():
                break
            player.write(audio_array[start : start + PLAYBACK_CHUNK_SIZE])

    def _play_request(self, request: _PlaybackRequest, session: _PlaybackSession) -> None:
        try:
            self.apply_base_url()
            selected_voice, model = self.resolve_voice(request.voice)
            print(f"Using voice: {selected_voice} ({model})")

            response = self._call_tts(request.text, selected_voice, model)
            with session.cleanup_lock:
                session.response = response

            if session.stop_event.is_set():
                return

            player = sd.OutputStream(samplerate=SAMPLE_RATE, channels=CHANNELS, dtype="int16")
            session.player = player
            player.start()

            for chunk in response:
                if session.stop_event.is_set():
                    break
                if chunk.status_code == 200:
                    raw = getattr(chunk.output, "audio", {}).get("data")
                    if not raw:
                        continue
                    pcm = decode_audio_chunk(raw)
                    audio_array = np.frombuffer(pcm, dtype=np.int16)
                    try:
                        self._write_audio(player, audio_array, session)
                    except Exception:
                        if session.stop_event.is_set():
                            break
                        raise
                else:
                    print(f"TTS error: {chunk.code} - {chunk.message}")
        except Exception as exc:
            if not session.stop_event.is_set():
                print(f"TTS exception: {exc}")
        finally:
            self._cleanup_session(session)
            with self._session_lock:
                if self._current_session is session:
                    self._current_session = None

    def _call_tts(self, text: str, voice: str, model: str):
        """Issue a streaming TTS request to DashScope."""
        return dashscope.MultiModalConversation.call(
            model=model,
            api_key=self.api_key,
            language_type="English",
            text=text,
            voice=voice,
            stream=True,
        )

    def _run_playback_loop(self) -> None:
        while True:
            with self._request_condition:
                while self._pending_request is None:
                    self._request_condition.wait()
                request = self._pending_request
                self._pending_request = None

            session = _PlaybackSession()
            with self._session_lock:
                self._current_session = session
            self._play_request(request, session)

    def stop(self) -> None:
        """Cancel any pending or active playback."""
        with self._request_condition:
            self._pending_request = None
        with self._session_lock:
            session = self._current_session
        if session is not None:
            self._cancel_session(session)

    def speak(self, text: str, voice: str | None = None) -> None:
        """Queue *text* for immediate TTS playback, cancelling any current speech."""
        if not self.api_key:
            print("Error: QWEN_API_KEY not configured")
            return

        with self._request_condition:
            self._pending_request = _PlaybackRequest(text=text, voice=voice)
            self._request_condition.notify()

        with self._session_lock:
            session = self._current_session
        if session is not None:
            self._cancel_session(session)


# ── Module-level helpers ──────────────────────────────────────────


def _pcm_to_wav(pcm_data: bytes) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm_data)
    return buf.getvalue()


def _close_response(response: Any) -> None:
    if response is not None and hasattr(response, "close"):
        try:
            response.close()
        except Exception:
            pass


def _close_player(player: sd.OutputStream, *, abort: bool = False) -> None:
    try:
        if abort:
            try:
                player.abort(ignore_errors=True)
            except TypeError:
                player.abort()
        else:
            try:
                player.stop(ignore_errors=True)
            except TypeError:
                player.stop()
    except Exception:
        pass

    try:
        player.close(ignore_errors=True)
    except TypeError:
        try:
            player.close()
        except Exception:
            pass
    except Exception:
        pass


qwen_tts_service = QwenTTSService()
