import threading
import time

import pyperclip
from pynput import keyboard

from service.qwen_tts_service import qwen_tts_service

_lock = threading.Lock()
_request_lock = threading.Lock()
_controller = keyboard.Controller()
_latest_request_id = 0
_HOTKEYS = {
    "<ctrl>+<shift>+0": lambda: on_alt_0(),
    "<ctrl>+<shift>+)": lambda: on_alt_0(),
}


def _next_request_id() -> int:
    global _latest_request_id
    with _request_lock:
        _latest_request_id += 1
        return _latest_request_id


def _is_latest_request(request_id: int) -> bool:
    with _request_lock:
        return request_id == _latest_request_id


def _capture_selected_text(request_id: int) -> str:
    with _lock:
        if not _is_latest_request(request_id):
            return ""

        time.sleep(0.05)

        old_clipboard = pyperclip.paste()
        try:
            pyperclip.copy("")
            time.sleep(0.05)

            # Release any lingering modifier keys (Alt/Shift from the hotkey are
            # suppressed by GlobalHotKeys, leaving them "pressed" from Chrome's view)
            for mod in (
                keyboard.Key.alt,
                keyboard.Key.alt_l,
                keyboard.Key.alt_r,
                keyboard.Key.shift,
                keyboard.Key.shift_l,
                keyboard.Key.shift_r,
            ):
                try:
                    _controller.release(mod)
                except Exception:
                    pass
            time.sleep(0.05)

            # Send Ctrl+C to copy selected text
            with _controller.pressed(keyboard.Key.ctrl):
                _controller.tap("c")

            # Poll clipboard for up to 1 s instead of a fixed 0.3 s sleep
            selected_text = ""
            deadline = time.time() + 1.0
            while time.time() < deadline:
                if not _is_latest_request(request_id):
                    return ""
                time.sleep(0.05)
                text = pyperclip.paste()
                if text:
                    selected_text = text
                    break

            if not selected_text and _is_latest_request(request_id):
                print("Nothing selected — no text captured.")

            return selected_text
        finally:
            try:
                pyperclip.copy(old_clipboard)
            except Exception as e:
                print(f"Warning: Could not restore clipboard: {e}")


def _handle(request_id: int):
    qwen_tts_service.stop()
    selected_text = _capture_selected_text(request_id)
    if not selected_text or not _is_latest_request(request_id):
        return

    print(f"Selected: {selected_text}")
    qwen_tts_service.speak(selected_text)


def on_alt_0():
    # Run in a thread so the hotkey listener isn't blocked during TTS
    request_id = _next_request_id()
    threading.Thread(target=_handle, args=(request_id,), daemon=True).start()


def start_service():
    print("Pronunciation service started! Press Ctrl+Shift+0 to pronounce selected text.")
    listener = keyboard.GlobalHotKeys(_HOTKEYS)
    listener.daemon = True
    listener.start()
    return listener


def run_service():
    with keyboard.GlobalHotKeys(_HOTKEYS) as listener:
        listener.join()


if __name__ == "__main__":
    run_service()
