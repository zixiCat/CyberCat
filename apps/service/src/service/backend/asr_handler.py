"""ASR test recording coordination for the Speech Lab UI."""

import base64
import json
import os
import tempfile
import threading

from service.qwen_service import qwen_service

_asr_lock = threading.Lock()
_asr_recording = False
_asr_frames: list = []
_asr_stream = None

SAMPLE_RATE = 16000


def start_asr_test_recording() -> str:
    """Begin capturing audio for ASR testing. Returns JSON status."""
    global _asr_recording, _asr_frames, _asr_stream
    try:
        import sounddevice as sd

        with _asr_lock:
            if _asr_recording:
                return json.dumps({"ok": False, "error": "Already recording"})

            _asr_frames = []

            def _callback(indata, frames, time_info, status):
                if _asr_recording:
                    _asr_frames.append(indata.copy())

            _asr_stream = sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype="int16",
                callback=_callback,
            )
            _asr_stream.start()
            _asr_recording = True

        return json.dumps({"ok": True})
    except Exception as exc:
        return json.dumps({"ok": False, "error": str(exc)})


def stop_asr_test_recording() -> str:
    """Stop recording and transcribe the captured audio. Returns JSON result."""
    global _asr_recording, _asr_stream
    try:
        import numpy as np
        import wave

        with _asr_lock:
            if not _asr_recording:
                return json.dumps({"ok": False, "error": "Not recording"})

            _asr_recording = False
            if _asr_stream is not None:
                _asr_stream.stop()
                _asr_stream.close()
                _asr_stream = None

            if not _asr_frames:
                return json.dumps({"ok": False, "error": "No audio captured"})

            audio_data = np.concatenate(_asr_frames, axis=0)

        # Write to a temp WAV file for the ASR service
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        try:
            with wave.open(tmp.name, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(SAMPLE_RATE)
                wf.writeframes(audio_data.tobytes())

            text = qwen_service.transcribe_audio(tmp.name)
            return json.dumps({"ok": True, "text": text})
        finally:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass
    except Exception as exc:
        return json.dumps({"ok": False, "error": str(exc)})
