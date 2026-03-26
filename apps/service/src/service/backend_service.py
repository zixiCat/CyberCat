import json
import os
import wave
import datetime
import base64
import tempfile
import threading
from PySide6.QtCore import QObject, Signal, Slot
from constants.tts import get_voice_options, normalize_voice_pool
from service.config_service import config_service
from service.qwen_service import parse_hotwords, qwen_service
from service.qwen_tts_service import decode_audio_chunk, qwen_tts_service
from service.task_service import task_service
from utils.record_voice import recorder


class BackendService(QObject):
    """Exposes backend functionality to the frontend via QWebChannel."""

    # Paths
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    OUTPUT_DIR = os.path.join(BASE_DIR, "output")
    AUDIO_DIR = os.path.join(OUTPUT_DIR, "audio")
    HISTORY_DIR = os.path.join(OUTPUT_DIR, "history")
    PROMPTS_DIR = os.path.join(BASE_DIR, "prompts")

    # Signals to send data to frontend
    task_started = Signal(int, str)
    segment_text_chunk = Signal(int, str)
    segment_audio_chunk = Signal(int, str)
    segment_finished = Signal(int, str)
    task_finished = Signal()
    tts_test_started = Signal(str)
    tts_test_finished = Signal(str, str)

    # Global danmu signal
    show_danmu = Signal(str)

    # Signals for window management
    minimize_requested = Signal()
    maximize_requested = Signal()
    close_requested = Signal()
    drag_requested = Signal()
    window_state_changed = Signal(bool)

    def __init__(self):
        super().__init__()
        self.active_system_prompt = ""
        # Ensure directories exist
        os.makedirs(self.AUDIO_DIR, exist_ok=True)
        os.makedirs(self.HISTORY_DIR, exist_ok=True)
        os.makedirs(self.PROMPTS_DIR, exist_ok=True)
        # Connect task_service signals to our slots to ensure thread safety
        task_service.task_started.connect(self._on_task_started)
        task_service.segment_text_chunk.connect(self._on_segment_text_chunk)
        task_service.segment_audio_chunk.connect(self._on_segment_audio_chunk)
        task_service.segment_ready.connect(self._on_segment_ready)
        task_service.task_finished.connect(self._on_task_finished)
        task_service.segment_finished.connect(self._on_segment_finished)

    @Slot(str)
    def set_active_system_prompt(self, prompt_content: str):
        """Sets the system prompt to be used for future tasks."""
        self.active_system_prompt = prompt_content
        print(f"Active system prompt updated (length: {len(prompt_content)})")

    @Slot(result=str)
    def get_voice_options(self):
        """Returns voice selection options for the frontend."""
        return json.dumps(get_voice_options())

    @Slot(result=str)
    def get_active_voice(self):
        """Returns the active TTS voice value."""
        return qwen_tts_service.get_default_voice()

    @Slot(str)
    def set_active_voice(self, voice: str):
        """Sets the active TTS voice for all service speech output."""
        try:
            qwen_tts_service.set_default_voice(voice)
            config_service.save({"voice": voice})
            print(f"Active voice updated: {voice}")
        except ValueError as exc:
            print(f"Error setting active voice: {exc}")

    @Slot(result=str)
    def get_random_voice_pool(self):
        """Returns the random voice pool used when active voice is Auto."""
        return json.dumps(qwen_tts_service.get_random_voice_pool())

    @Slot(str)
    def set_random_voice_pool(self, voices_json: str):
        """Sets the pool of voices eligible for Auto voice selection."""
        try:
            raw_voices = json.loads(voices_json)
            voice_pool = normalize_voice_pool(raw_voices)
            qwen_tts_service.set_random_voice_pool(voice_pool)
            config_service.save({"random_voice_pool": ",".join(voice_pool)})
            print(f"Random voice pool updated: {voice_pool}")
        except Exception as exc:
            print(f"Error setting random voice pool: {exc}")

    # ------------------------------------------------------------------
    # Settings (persisted to %APPDATA%/CyberCat/config.json)
    # ------------------------------------------------------------------

    @Slot(result=str)
    def get_settings(self):
        """Return all settings as JSON."""
        return json.dumps(config_service.get_all())

    @Slot(result=str)
    def get_settings_profiles(self):
        """Return the list of named settings profiles and the active profile."""
        return json.dumps(config_service.get_profiles_summary())

    @Slot(result=str)
    def get_config_status(self):
        """Return config status: {configured: bool, missing: [str]}."""
        return json.dumps(config_service.get_status())

    @Slot(str, result=str)
    def save_settings(self, settings_json: str):
        """Save settings and reinitialise services that depend on them."""
        try:
            updates = json.loads(settings_json)
            config_service.save(updates)
            self._apply_config()
            return json.dumps({"ok": True})
        except Exception as e:
            print(f"Error saving settings: {e}")
            return json.dumps({"ok": False, "error": str(e)})

    @Slot(str, result=str)
    def create_settings_profile(self, profile_name: str):
        """Create and activate a new settings profile cloned from the current one."""
        try:
            profile = config_service.create_profile(profile_name)
            self._apply_config()
            return json.dumps({"ok": True, "profile": profile})
        except Exception as e:
            print(f"Error creating settings profile: {e}")
            return json.dumps({"ok": False, "error": str(e)})

    @Slot(str, str, result=str)
    def rename_settings_profile(self, profile_id: str, profile_name: str):
        """Rename an existing settings profile."""
        try:
            config_service.rename_profile(profile_id, profile_name)
            return json.dumps({"ok": True})
        except Exception as e:
            print(f"Error renaming settings profile: {e}")
            return json.dumps({"ok": False, "error": str(e)})

    @Slot(str, result=str)
    def delete_settings_profile(self, profile_id: str):
        """Delete a settings profile and fall back to another remaining profile."""
        try:
            active_profile_id = config_service.delete_profile(profile_id)
            self._apply_config()
            return json.dumps({"ok": True, "activeProfileId": active_profile_id})
        except Exception as e:
            print(f"Error deleting settings profile: {e}")
            return json.dumps({"ok": False, "error": str(e)})

    @Slot(str, result=str)
    def select_settings_profile(self, profile_id: str):
        """Activate a settings profile and apply it to running services."""
        try:
            config_service.set_active_profile(profile_id)
            self._apply_config()
            return json.dumps({"ok": True})
        except Exception as e:
            print(f"Error selecting settings profile: {e}")
            return json.dumps({"ok": False, "error": str(e)})

    def _apply_config(self):
        """Push current config values into the live services."""
        # Update QwenASR
        qwen_service.api_key = config_service.get("qwen_api_key")
        qwen_service.base_url = config_service.get("qwen_asr_base_url") or qwen_service.base_url
        hotwords_str = config_service.get("qwen_hotwords", "")
        qwen_service.hotwords = parse_hotwords(hotwords_str)
        # Update QwenTTS
        qwen_tts_service.api_key = config_service.get("qwen_api_key")
        qwen_tts_service.set_base_url(config_service.get("qwen_tts_base_url"))
        qwen_tts_service.set_default_voice(config_service.get("voice", "auto"))
        qwen_tts_service.set_random_voice_pool(config_service.get("random_voice_pool", ""))
        # Update LLM agent configuration
        task_service.reload_config()

    @Slot(str, str)
    def save_session(self, session_id: str, session_json: str):
        """Save session JSON to a file."""
        try:
            filepath = os.path.join(self.HISTORY_DIR, f"{session_id}.json")
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(session_json)
        except Exception as e:
            print(f"Error saving session: {e}")

    @Slot(result=str)
    def load_sessions(self):
        """Load all sessions from the history directory."""
        sessions = []
        try:
            for filename in os.listdir(self.HISTORY_DIR):
                if filename.endswith(".json"):
                    filepath = os.path.join(self.HISTORY_DIR, filename)
                    with open(filepath, "r", encoding="utf-8") as f:
                        sessions.append(json.loads(f.read()))
        except Exception as e:
            print(f"Error loading sessions: {e}")
        return json.dumps(sessions)

    @Slot(str)
    def delete_session(self, session_id: str):
        """Delete a session file."""
        try:
            filepath = os.path.join(self.HISTORY_DIR, f"{session_id}.json")
            if os.path.exists(filepath):
                os.remove(filepath)
        except Exception as e:
            print(f"Error deleting session: {e}")

    @Slot(str, result=str)
    def save_audio_segment(self, base64_audio: str):
        """Saves a base64 PCM chunk to a .wav file and returns the filename."""
        try:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            filename = f"record_{timestamp}.wav"
            filepath = os.path.join(self.AUDIO_DIR, filename)

            # Decode base64 to bytes (PCM 16-bit 24kHz)
            audio_data = decode_audio_chunk(base64_audio)

            with wave.open(filepath, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)  # 16-bit
                wf.setframerate(24000)
                wf.writeframes(audio_data)

            return filename
        except Exception as e:
            print(f"Error saving audio segment: {e}")
            return ""

    @Slot(str, result=str)
    def save_audio_chunks(self, audio_chunks_json: str):
        """Saves multiple base64 PCM chunks as a single .wav file and returns the filename."""
        try:
            chunks = json.loads(audio_chunks_json)
            if not isinstance(chunks, list) or not chunks:
                return ""

            audio_data = b"".join(decode_audio_chunk(chunk) for chunk in chunks if chunk)
            if not audio_data:
                return ""

            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            filename = f"record_{timestamp}.wav"
            filepath = os.path.join(self.AUDIO_DIR, filename)

            with wave.open(filepath, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(24000)
                wf.writeframes(audio_data)

            return filename
        except Exception as e:
            print(f"Error saving audio chunks: {e}")
            return ""

    @Slot(str, str, result=str)
    def test_tts(self, text: str, voice: str):
        """Synthesizes text to a WAV payload for frontend testing."""
        try:
            wav_bytes, selected_voice, model = qwen_tts_service.synthesize_text(text, voice or None)
            return json.dumps(
                {
                    "ok": True,
                    "audioBase64": base64.b64encode(wav_bytes).decode("utf-8"),
                    "voice": selected_voice,
                    "model": model,
                }
            )
        except Exception as exc:
            print(f"Error running TTS test: {exc}")
            return json.dumps({"ok": False, "error": str(exc)})

    @Slot(str, str, str)
    def start_tts_test(self, request_id: str, text: str, voice: str):
        """Starts a frontend TTS test without blocking the web UI thread."""
        self.tts_test_started.emit(request_id)
        threading.Thread(
            target=self._run_tts_test,
            args=(request_id, text, voice),
            daemon=True,
        ).start()

    def _run_tts_test(self, request_id: str, text: str, voice: str):
        try:
            wav_bytes, selected_voice, model = qwen_tts_service.synthesize_text(text, voice or None)
            result_json = json.dumps(
                {
                    "ok": True,
                    "audioBase64": base64.b64encode(wav_bytes).decode("utf-8"),
                    "voice": selected_voice,
                    "model": model,
                }
            )
        except Exception as exc:
            print(f"Error running async TTS test: {exc}")
            result_json = json.dumps({"ok": False, "error": str(exc)})

        self.tts_test_finished.emit(request_id, result_json)

    @Slot(str, str, result=str)
    def transcribe_audio_base64(self, audio_base64: str, extension: str):
        """Transcribes uploaded/recorded audio sent from the web UI."""
        temp_path = ""
        try:
            normalized_extension = (extension or "wav").strip().lower().lstrip(".") or "wav"
            audio_bytes = base64.b64decode(audio_base64)

            with tempfile.NamedTemporaryFile(
                delete=False,
                suffix=f".{normalized_extension}",
                dir=self.AUDIO_DIR,
            ) as temp_file:
                temp_file.write(audio_bytes)
                temp_path = temp_file.name

            transcription = qwen_service.transcribe_audio(temp_path)
            if isinstance(transcription, list):
                transcription = "\n".join(str(part) for part in transcription)

            if isinstance(transcription, str) and transcription.startswith("Error:"):
                return json.dumps({"ok": False, "error": transcription})

            return json.dumps({"ok": True, "text": str(transcription or "")})
        except Exception as exc:
            print(f"Error running ASR test: {exc}")
            return json.dumps({"ok": False, "error": str(exc)})
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

    @Slot(result=str)
    def start_asr_test_recording(self):
        """Starts native desktop audio recording for the ASR test UI."""
        try:
            recorder.start()
            if not recorder.recording:
                raise RuntimeError("Microphone recording could not be started.")

            return json.dumps({"ok": True})
        except Exception as exc:
            print(f"Error starting ASR test recording: {exc}")
            return json.dumps({"ok": False, "error": str(exc)})

    @Slot(result=str)
    def stop_asr_test_recording(self):
        """Stops native desktop audio recording and returns the captured WAV payload."""
        try:
            audio_path = recorder.stop()
            if not audio_path:
                return json.dumps(
                    {
                        "ok": False,
                        "error": "Recording was too short or no audio was captured.",
                    }
                )

            with open(audio_path, "rb") as audio_file:
                audio_base64 = base64.b64encode(audio_file.read()).decode("utf-8")

            return json.dumps(
                {
                    "ok": True,
                    "audioBase64": audio_base64,
                    "filename": os.path.basename(audio_path),
                    "extension": "wav",
                }
            )
        except Exception as exc:
            print(f"Error stopping ASR test recording: {exc}")
            return json.dumps({"ok": False, "error": str(exc)})

    @Slot(str, result=str)
    def get_audio_file(self, filename: str):
        """Reads a .wav file and returns base64 encoded audio data."""
        try:
            filepath = os.path.join(self.AUDIO_DIR, filename)
            if os.path.exists(filepath):
                with open(filepath, "rb") as f:
                    return base64.b64encode(f.read()).decode("utf-8")
        except Exception as e:
            print(f"Error reading audio file: {e}")
        return ""

    @Slot()
    def start_drag(self):
        self.drag_requested.emit()

    @Slot()
    def minimize_window(self):
        self.minimize_requested.emit()

    @Slot()
    def maximize_window(self):
        self.maximize_requested.emit()

    @Slot()
    def close_window(self):
        self.close_requested.emit()

    def set_window_maximized(self, maximized: bool):
        self.window_state_changed.emit(maximized)

    @Slot(int, str)
    def _on_task_started(self, task_id: int, prompt: str):
        print(f"Task started: {task_id} with prompt: {prompt}")
        self.task_started.emit(task_id, prompt)

    @Slot(int, str)
    def _on_segment_text_chunk(self, segment_id: int, chunk: str):
        self.segment_text_chunk.emit(segment_id, chunk)

    @Slot(int, str)
    def _on_segment_finished(self, segment_id: int, text: str):
        self.segment_finished.emit(segment_id, text)

    @Slot(int, str)
    def _on_segment_ready(self, segment_id: int, text: str):
        if text and text.strip():
            self.show_danmu.emit(text)

    @Slot(int, str)
    def _on_segment_audio_chunk(self, segment_id: int, chunk: str):
        self.segment_audio_chunk.emit(segment_id, chunk)

    @Slot()
    def _on_task_finished(self):
        self.task_finished.emit()

    @Slot(result=str)
    def get_available_prompts(self):
        """Returns a JSON list of available prompt filenames."""
        try:
            files = [f for f in os.listdir(self.PROMPTS_DIR) if f.endswith(".md")]
            return json.dumps(files)
        except Exception as e:
            print(f"Error listing prompts: {e}")
            return json.dumps([])

    @Slot(str, result=str)
    def get_prompt_content(self, filename: str):
        """Returns the content of a specific prompt file."""
        try:
            filepath = os.path.join(self.PROMPTS_DIR, filename)
            if os.path.exists(filepath):
                with open(filepath, "r", encoding="utf-8") as f:
                    return f.read()
        except Exception as e:
            print(f"Error reading prompt {filename}: {e}")
        return ""

    @Slot(str)
    @Slot(str, str)
    @Slot(str, str, str)
    def start_task(self, text: str, system_prompt: str = None, history_json: str = None):
        """Called from frontend or backend to start a task."""
        print(f"Starting task with text: {text}")
        prompt = system_prompt if system_prompt is not None else self.active_system_prompt
        task_service.start_task(text, prompt, history_json)

    @Slot()
    def stop_task(self):
        """Stops the current running task."""
        print("Stopping task...")
        task_service.stop_task()
