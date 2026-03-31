"""Simple audio recorder using sounddevice.

Creates timestamped WAV files in ``output/audio/``.
"""

import os
import time
import wave
from datetime import datetime

import numpy as np
import sounddevice as sd

SAMPLE_RATE = 16000
MIN_DURATION = 0.5  # seconds — recordings shorter than this are discarded
OUTPUT_DIR = os.path.join(os.getcwd(), "output", "audio")
os.makedirs(OUTPUT_DIR, exist_ok=True)


class SimpleRecorder:
    """Push-to-talk style recorder: ``start()`` → ``stop()`` → WAV path."""

    def __init__(self) -> None:
        self._recording = False
        self._frames: list[np.ndarray] = []
        self._stream: sd.InputStream | None = None
        self._start_time = 0.0

    def start(self) -> None:
        if self._recording:
            return
        try:
            print("Recording...")
            self._frames = []
            self._start_time = time.time()
            self._stream = sd.InputStream(
                samplerate=SAMPLE_RATE, channels=1, dtype="int16", callback=self._callback
            )
            self._stream.start()
            self._recording = True
        except Exception as exc:
            print(f"Error starting recording: {exc}")

    def stop(self) -> str | None:
        if not self._recording:
            return None

        self._recording = False
        duration = time.time() - self._start_time
        print("Stopped recording.")

        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None

        if duration < MIN_DURATION:
            print(f"Recording too short ({duration:.2f}s), discarding.")
            self._frames = []
            return None

        if self._frames:
            return self._save_wav()
        return None

    def _callback(self, indata, frames, time_info, status) -> None:
        if self._recording:
            self._frames.append(indata.copy())

    def _save_wav(self) -> str | None:
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filepath = os.path.join(OUTPUT_DIR, f"record_{timestamp}.wav")
            audio_data = np.concatenate(self._frames, axis=0)
            with wave.open(filepath, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(SAMPLE_RATE)
                wf.writeframes(audio_data.tobytes())
            print(f"Saved to {filepath}")
            return filepath
        except Exception as exc:
            print(f"Error saving WAV: {exc}")
            return None


recorder = SimpleRecorder()
