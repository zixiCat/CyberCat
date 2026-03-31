"""Audio file I/O for saving and retrieving TTS audio segments."""

import base64
import json
import os
import sys
import wave
from pathlib import Path

SAMPLE_RATE = 24000
CHANNELS = 1
SAMPLE_WIDTH = 2


def _output_audio_dir() -> Path:
    if getattr(sys, "frozen", False):
        base = Path(sys.executable).resolve().parent
    else:
        base = Path(__file__).resolve().parents[2]
    audio_dir = base / "output" / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    return audio_dir


def save_audio_chunks(chunks_json: str) -> str:
    """Decode a JSON array of base64 PCM chunks and write a WAV file.

    Returns a JSON string ``{"filename": "<name>.wav"}`` on success,
    or ``{"error": "..."}`` on failure.
    """
    try:
        chunks = json.loads(chunks_json)
        if not isinstance(chunks, list) or not chunks:
            return json.dumps({"error": "No audio chunks provided"})

        pcm_data = b"".join(base64.b64decode(chunk) for chunk in chunks)
        if not pcm_data:
            return json.dumps({"error": "Empty audio data"})

        import time

        filename = f"tts_{int(time.time() * 1000)}.wav"
        filepath = _output_audio_dir() / filename

        with wave.open(str(filepath), "wb") as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(SAMPLE_WIDTH)
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(pcm_data)

        return json.dumps({"filename": filename})
    except Exception as exc:
        return json.dumps({"error": str(exc)})


def get_audio_file(filename: str) -> str:
    """Return the base64-encoded contents of *filename* from the audio dir.

    Returns a JSON string with ``audioBase64`` on success or ``error``.
    """
    try:
        filepath = _output_audio_dir() / os.path.basename(filename)
        if not filepath.is_file():
            return json.dumps({"error": f"Audio file not found: {filename}"})

        audio_bytes = filepath.read_bytes()
        return json.dumps({"audioBase64": base64.b64encode(audio_bytes).decode("utf-8")})
    except Exception as exc:
        return json.dumps({"error": str(exc)})
