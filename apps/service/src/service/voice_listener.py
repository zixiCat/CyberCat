"""Background voice recording triggered by global hotkeys.

Hotkeys:
- ``alt+z`` → Record, transcribe, show toast for confirmation
- ``alt+x`` → Record, transcribe, start task immediately
"""

import time
import threading

from pynput import keyboard
from win11toast import toast

from utils.record_voice import recorder
from service.qwen_service import qwen_service

type TrackedKey = keyboard.Key | keyboard.KeyCode
type HotkeyChord = tuple[frozenset[TrackedKey], ...]

_ALT_KEYS = frozenset({keyboard.Key.alt, keyboard.Key.alt_l, keyboard.Key.alt_r})
_HOTKEY_NOTIFY: HotkeyChord = (_ALT_KEYS, frozenset({keyboard.KeyCode.from_char("z")}))
_HOTKEY_DIRECT: HotkeyChord = (_ALT_KEYS, frozenset({keyboard.KeyCode.from_char("x")}))

HOTKEY_NOTIFY_LABEL = "alt+z"
HOTKEY_DIRECT_LABEL = "alt+x"
_STOP_BUTTON_TEXT = "Did you say that? I'll do it right now. Click to stop."


class VoiceListener:
    """Captures audio via hotkeys, transcribes, and dispatches tasks."""

    def __init__(self, backend_service) -> None:
        self._backend = backend_service
        self._pressed: set[TrackedKey] = set()
        self._lock = threading.Lock()

    def start(self) -> None:
        listener = keyboard.Listener(
            on_press=self._on_press,
            on_release=self._on_release,
        )
        listener.daemon = True
        listener.start()
        threading.Thread(target=self._recording_loop, daemon=True).start()

    # ── Key tracking ──────────────────────────────────────────────

    def _on_press(self, key) -> None:
        with self._lock:
            self._pressed.add(key)

    def _on_release(self, key) -> None:
        with self._lock:
            self._pressed.discard(key)

    def _is_hotkey_active(self, hotkey: HotkeyChord) -> bool:
        with self._lock:
            return all(any(key in self._pressed for key in group) for group in hotkey)

    # ── Main loop ─────────────────────────────────────────────────

    def _recording_loop(self) -> None:
        print("--- CyberCat Voice Service ---")
        print(f"Hold '{HOTKEY_NOTIFY_LABEL}' for ASR with confirmation")
        print(f"Hold '{HOTKEY_DIRECT_LABEL}' for immediate AI task")

        while True:
            hotkey = self._detect_active_hotkey()
            if hotkey is None:
                time.sleep(0.01)
                continue

            is_direct = hotkey is _HOTKEY_DIRECT
            audio_file = self._record_while_held(hotkey)
            if not audio_file:
                continue

            self._transcribe_and_dispatch(audio_file, direct=is_direct)

    def _detect_active_hotkey(self) -> HotkeyChord | None:
        if self._is_hotkey_active(_HOTKEY_NOTIFY):
            return _HOTKEY_NOTIFY
        if self._is_hotkey_active(_HOTKEY_DIRECT):
            return _HOTKEY_DIRECT
        return None

    def _record_while_held(self, hotkey: HotkeyChord) -> str | None:
        recorder.start()
        while self._is_hotkey_active(hotkey):
            time.sleep(0.01)
        return recorder.stop()

    def _transcribe_and_dispatch(self, audio_file: str, *, direct: bool) -> None:
        t0 = time.time()
        print("Transcribing...")
        try:
            text = qwen_service.transcribe_audio(audio_file)
            print(f"Transcription ({time.time() - t0:.2f}s): {text}")
        except Exception as exc:
            print(f"Transcription error: {exc}")
            return

        if not text or not text.strip():
            return

        if direct or text.lower().strip().startswith("cybercat"):
            label = f"{HOTKEY_DIRECT_LABEL} direct" if direct else "'cybercat' keyword"
            print(f"Immediate task via {label}.")
            self._backend.start_task(text)
            return

        result = toast(text, button=_STOP_BUTTON_TEXT)
        if isinstance(result, dict) and result.get("arguments", "")[5:] == _STOP_BUTTON_TEXT:
            print("User cancelled via toast.")
        else:
            print("User confirmed. Starting task...")
            self._backend.start_task(text)
