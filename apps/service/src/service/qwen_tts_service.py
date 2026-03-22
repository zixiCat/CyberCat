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
from constants.tts import AUTO_VOICE, get_all_voices, get_voice_model, normalize_voice_pool
from service.config_service import config_service


DEFAULT_QWEN_TTS_BASE_URL = "https://dashscope.aliyuncs.com/api/v1"


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
    def __init__(self):
        self.api_key = config_service.get("qwen_api_key")
        self.base_url = config_service.get("qwen_tts_base_url") or DEFAULT_QWEN_TTS_BASE_URL
        self.apply_base_url()
        self.default_voice = config_service.get("voice", AUTO_VOICE)
        self.sample_rate = 24000
        self.channels = 1
        self.voices = get_all_voices()
        self.random_voice_pool = normalize_voice_pool(config_service.get("random_voice_pool", ""))
        self._session_lock = threading.Lock()
        self._current_session: _PlaybackSession | None = None
        self._request_condition = threading.Condition()
        self._pending_request: _PlaybackRequest | None = None
        self._worker = threading.Thread(target=self._run_playback_loop, daemon=True)
        self._worker.start()

    def set_default_voice(self, voice: str):
        if voice != AUTO_VOICE and voice not in self.voices:
            raise ValueError(f"Unsupported voice: {voice}")
        self.default_voice = voice

    def get_default_voice(self) -> str:
        return self.default_voice

    def set_random_voice_pool(self, voices: list[str] | str | None):
        self.random_voice_pool = normalize_voice_pool(voices)

    def get_random_voice_pool(self) -> list[str]:
        return list(self.random_voice_pool)

    def set_base_url(self, base_url: str | None):
        self.base_url = base_url or DEFAULT_QWEN_TTS_BASE_URL
        self.apply_base_url()

    def apply_base_url(self):
        dashscope.base_http_api_url = self.base_url or DEFAULT_QWEN_TTS_BASE_URL

    def resolve_voice(self, voice: str | None = None) -> tuple[str, str]:
        selected_voice = voice or self.default_voice
        if selected_voice == AUTO_VOICE:
            voice_pool = self.random_voice_pool or self.voices
            selected_voice = random.choice(voice_pool)
        model = get_voice_model(selected_voice)
        return selected_voice, model

    def synthesize_text(self, text: str, voice: str | None = None) -> tuple[bytes, str, str]:
        if not self.api_key:
            raise ValueError("QWEN_API_KEY not found in environment variables")

        if not text or not text.strip():
            raise ValueError("Text is required for TTS synthesis")

        self.apply_base_url()
        selected_voice, model = self.resolve_voice(voice)
        response = dashscope.MultiModalConversation.call(
            model=model,
            api_key=self.api_key,
            language_type="English",
            text=text,
            voice=selected_voice,
            stream=True,
        )

        pcm_chunks: list[bytes] = []

        try:
            for chunk in response:
                if chunk.status_code != 200:
                    raise RuntimeError(f"{chunk.code}: {chunk.message}")

                audio_data = getattr(chunk.output, "audio", {}).get("data", None)
                if not audio_data:
                    continue

                pcm_chunks.append(decode_audio_chunk(audio_data))
        finally:
            if hasattr(response, "close"):
                try:
                    response.close()
                except Exception:
                    pass

        pcm_data = b"".join(pcm_chunks)
        if not pcm_data:
            raise RuntimeError("No audio returned from TTS service")

        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wav_file:
            wav_file.setnchannels(self.channels)
            wav_file.setsampwidth(2)
            wav_file.setframerate(self.sample_rate)
            wav_file.writeframes(pcm_data)

        return wav_buffer.getvalue(), selected_voice, model

    def _cleanup_session(self, session: _PlaybackSession):
        with session.cleanup_lock:
            cancelled = session.stop_event.is_set()
            player = session.player
            response = session.response
            session.player = None
            session.response = None

        if hasattr(response, "close"):
            try:
                response.close()
            except Exception:
                pass

        if player is None:
            return

        if cancelled:
            try:
                player.abort(ignore_errors=True)
            except TypeError:
                try:
                    player.abort()
                except Exception:
                    pass
            except Exception:
                pass
        else:
            try:
                player.stop(ignore_errors=True)
            except TypeError:
                try:
                    player.stop()
                except Exception:
                    pass
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

    def _cancel_session(self, session: _PlaybackSession):
        session.stop_event.set()

        with session.cleanup_lock:
            response = session.response
            session.response = None

        if hasattr(response, "close"):
            try:
                response.close()
            except Exception:
                pass

    def _write_audio(
        self, player: sd.OutputStream, audio_array: np.ndarray, session: _PlaybackSession
    ):
        chunk_size = 2048
        for start in range(0, len(audio_array), chunk_size):
            if session.stop_event.is_set():
                break
            player.write(audio_array[start : start + chunk_size])

    def _play_request(self, request: _PlaybackRequest, session: _PlaybackSession):
        try:
            self.apply_base_url()
            selected_voice, model = self.resolve_voice(request.voice)
            print(f"Using voice: {selected_voice} ({model})")

            response = dashscope.MultiModalConversation.call(
                model=model,
                api_key=self.api_key,
                language_type="English",
                text=request.text,
                voice=selected_voice,
                stream=True,
            )

            with session.cleanup_lock:
                session.response = response

            if session.stop_event.is_set():
                return

            player = sd.OutputStream(
                samplerate=self.sample_rate,
                channels=self.channels,
                dtype="int16",
            )
            session.player = player
            player.start()

            for chunk in response:
                if session.stop_event.is_set():
                    break

                if chunk.status_code == 200:
                    audio_data = getattr(chunk.output, "audio", {}).get("data", None)
                    if not audio_data:
                        continue

                    binary_content = decode_audio_chunk(audio_data)
                    audio_array = np.frombuffer(binary_content, dtype=np.int16)
                    try:
                        self._write_audio(player, audio_array, session)
                    except Exception:
                        if session.stop_event.is_set():
                            break
                        raise
                else:
                    print(f"Qwen-TTS Error: {chunk.code} - {chunk.message}")

        except Exception as e:
            if not session.stop_event.is_set():
                print(f"Qwen-TTS Exception: {e}")
        finally:
            self._cleanup_session(session)
            with self._session_lock:
                if self._current_session is session:
                    self._current_session = None

    def _run_playback_loop(self):
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

    def stop(self):
        with self._request_condition:
            self._pending_request = None

        with self._session_lock:
            session = self._current_session

        if session is not None:
            self._cancel_session(session)

    def speak(self, text: str, voice: str = None):
        """
        Synthesizes text to speech using Qwen-TTS and plays it immediately.
        """
        if not self.api_key:
            print("Error: QWEN_API_KEY not found in environment variables")
            return

        with self._request_condition:
            self._pending_request = _PlaybackRequest(text=text, voice=voice)
            self._request_condition.notify()

        with self._session_lock:
            session = self._current_session

        if session is not None:
            self._cancel_session(session)


qwen_tts_service = QwenTTSService()

if __name__ == "__main__":
    # Test
    qwen_tts_service.speak("Hello, this is a test of the Qwen text to speech service.")
