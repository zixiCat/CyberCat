"""Pronounce selected text via Ctrl+Shift+0 global hotkey.

Copies the currently selected text from any application, then speaks it
through the Qwen TTS service.
"""

import threading
import time

import pyperclip
from pynput import keyboard

from service.qwen_tts_service import qwen_tts_service

_lock = threading.Lock()
_request_lock = threading.Lock()
_controller = keyboard.Controller()
_latest_request_id = 0

_MODIFIER_KEYS = (
    keyboard.Key.alt,
    keyboard.Key.alt_l,
    keyboard.Key.alt_r,
    keyboard.Key.shift,
    keyboard.Key.shift_l,
    keyboard.Key.shift_r,
)
_CLIPBOARD_POLL_TIMEOUT = 1.0
_CLIPBOARD_POLL_INTERVAL = 0.05
_HOTKEYS = {
    "<ctrl>+<shift>+0": lambda: _on_hotkey(),
    "<ctrl>+<shift>+)": lambda: _on_hotkey(),
}


def _next_request_id() -> int:
    global _latest_request_id
    with _request_lock:
        _latest_request_id += 1
        return _latest_request_id


def _is_latest(request_id: int) -> bool:
    with _request_lock:
        return request_id == _latest_request_id


def _capture_selected_text(request_id: int) -> str:
    """Send Ctrl+C and poll the clipboard for the newly copied text."""
    with _lock:
        if not _is_latest(request_id):
            return ""

        time.sleep(0.05)
        old_clipboard = pyperclip.paste()

        try:
            pyperclip.copy("")
            time.sleep(0.05)

            # Release lingering modifier keys from the hotkey
            for mod in _MODIFIER_KEYS:
                try:
                    _controller.release(mod)
                except Exception:
                    pass
            time.sleep(0.05)

            with _controller.pressed(keyboard.Key.ctrl):
                _controller.tap("c")

            # Poll clipboard
            deadline = time.time() + _CLIPBOARD_POLL_TIMEOUT
            while time.time() < deadline:
                if not _is_latest(request_id):
                    return ""
                time.sleep(_CLIPBOARD_POLL_INTERVAL)
                text = pyperclip.paste()
                if text:
                    return text

            if _is_latest(request_id):
                print("Nothing selected — no text captured.")
            return ""
        finally:
            try:
                pyperclip.copy(old_clipboard)
            except Exception as exc:
                print(f"Warning: could not restore clipboard: {exc}")


def _handle(request_id: int) -> None:
    qwen_tts_service.stop()
    text = _capture_selected_text(request_id)
    if not text or not _is_latest(request_id):
        return
    print(f"Selected: {text}")
    qwen_tts_service.speak(text)


def _on_hotkey() -> None:
    request_id = _next_request_id()
    threading.Thread(target=_handle, args=(request_id,), daemon=True).start()


def start_service() -> keyboard.GlobalHotKeys:
    """Start the pronounce hotkey listener (daemon thread)."""
    print("Pronunciation service started! Press Ctrl+Shift+0 to pronounce selected text.")
    listener = keyboard.GlobalHotKeys(_HOTKEYS)
    listener.daemon = True
    listener.start()
    return listener
