import time
import threading
from pynput import keyboard
from win11toast import toast
from utils.record_voice import recorder
from service.qwen_service import qwen_service as transcription_service

# Hotkeys: sets of pynput KeyCode/Key that must all be pressed simultaneously
# z+x  -> notify flow,  x+c -> direct flow
_HOTKEY_NOTIFY = {keyboard.KeyCode.from_char("z"), keyboard.KeyCode.from_char("x")}
_HOTKEY_DIRECT = {keyboard.KeyCode.from_char("x"), keyboard.KeyCode.from_char("c")}

HOTKEY_NOTIFY = "z+x"
HOTKEY_DIRECT = "x+c"


class VoiceListener:
    """Handles background voice recording and transcription."""

    def __init__(self, backend_service):
        self.backend = backend_service
        self._pressed: set = set()
        self._lock = threading.Lock()

    def start(self):
        """Runs the keyboard listener in a background thread."""
        listener = keyboard.Listener(
            on_press=self._on_press,
            on_release=self._on_release,
        )
        listener.daemon = True
        listener.start()
        threading.Thread(target=self._recording_loop, daemon=True).start()

    def _on_press(self, key):
        with self._lock:
            self._pressed.add(key)

    def _on_release(self, key):
        with self._lock:
            self._pressed.discard(key)

    def _is_hotkey(self, hotkey_set: set) -> bool:
        with self._lock:
            return hotkey_set.issubset(self._pressed)

    def _recording_loop(self):
        print("--- CyberCat Voice Service ---")
        print(f"Hold '{HOTKEY_NOTIFY}' for ASR with notification")
        print(f"Hold '{HOTKEY_DIRECT}' for immediate AI task")
        STOP_TEXT = "Did you say that? I'll do it right now. Click to stop."

        while True:
            active_key = None
            if self._is_hotkey(_HOTKEY_NOTIFY):
                active_key = HOTKEY_NOTIFY
            elif self._is_hotkey(_HOTKEY_DIRECT):
                active_key = HOTKEY_DIRECT

            if active_key:
                hotkey_set = _HOTKEY_NOTIFY if active_key == HOTKEY_NOTIFY else _HOTKEY_DIRECT
                recorder.start()
                # Wait while the hotkey is held
                while self._is_hotkey(hotkey_set):
                    time.sleep(0.01)

                # Key released, stop recording and get filename
                audio_file = recorder.stop()

                if audio_file:
                    start_time = time.time()
                    print("Transcribing using qwen...")
                    try:
                        text = transcription_service.transcribe_audio(audio_file)
                        end_time = time.time()
                        print(f"Transcription completed in {end_time - start_time:.2f} seconds")
                        print(f"Transcription: {text}")

                        # If x+c was used, or if text starts with "cybercat", send immediately
                        if active_key == HOTKEY_DIRECT or text.lower().strip().startswith(
                            "cybercat"
                        ):
                            if active_key == HOTKEY_DIRECT:
                                print("Immediate AI task requested via x+c.")
                            else:
                                print("Quick response detected via 'cybercat' keyword.")
                            self.backend.start_task(text)
                        else:
                            # Show confirmation toast
                            result = toast(
                                text,
                                button=STOP_TEXT,
                            )

                            # Logic from z.py: check if user clicked stop
                            if (
                                isinstance(result, dict)
                                and result.get("arguments", "")[5:] == STOP_TEXT
                            ):
                                print("User clicked the stop button! Cancelled.")
                            else:
                                print("User confirmed (or ignored). Starting task...")
                                self.backend.start_task(text)

                    except Exception as e:
                        print(f"Transcription error: {e}")

            time.sleep(0.01)
