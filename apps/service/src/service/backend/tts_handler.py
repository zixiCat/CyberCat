"""TTS test coordination for the Speech Lab UI."""

import base64
import json
import threading

from PySide6.QtCore import Signal

from service.qwen_tts_service import qwen_tts_service


def run_tts_test(
    request_id: str,
    text: str,
    voice: str,
    on_started: Signal,
    on_finished: Signal,
) -> None:
    """Synthesize *text* in a background thread and emit test signals."""

    def _worker() -> None:
        on_started.emit(request_id)
        try:
            voice_arg = voice if voice and voice != "auto" else None
            wav_bytes, used_voice, used_model = qwen_tts_service.synthesize_text(
                text, voice=voice_arg
            )
            audio_b64 = base64.b64encode(wav_bytes).decode("utf-8")
            result = json.dumps(
                {
                    "ok": True,
                    "audioBase64": audio_b64,
                    "voice": used_voice,
                    "model": used_model,
                }
            )
        except Exception as exc:
            result = json.dumps({"ok": False, "error": str(exc)})

        on_finished.emit(request_id, result)

    threading.Thread(target=_worker, daemon=True).start()
