import os
import wave
import sounddevice as sd
import numpy as np
import time
from datetime import datetime

# Configuration
RATE = 16000
OUTPUT_DIR = os.path.join(os.getcwd(), "output", "audio")

if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR, exist_ok=True)


class SimpleRecorder:
    def __init__(self):
        self.recording = False
        self.frames = []
        self.stream = None
        self.last_filename = None
        self.start_time = 0

    def start(self):
        if self.recording:
            return
        try:
            print(f"Recording...")
            self.frames = []
            self.start_time = time.time()
            self.stream = sd.InputStream(
                samplerate=RATE, channels=1, dtype="int16", callback=self.callback
            )
            self.stream.start()
            self.recording = True
        except Exception as e:
            print(f"Error starting stream: {e}")

    def callback(self, indata, frames, time, status):
        if self.recording:
            self.frames.append(indata.copy())

    def stop(self):
        if not self.recording:
            return
        self.recording = False
        duration = time.time() - self.start_time
        print("Stopped recording.")
        if self.stream:
            self.stream.stop()
            self.stream.close()
            self.stream = None

        if duration < 0.5:
            print(f"Recording too short ({duration:.2f}s), discarding.")
            self.frames = []
            return None

        if self.frames:
            return self.save_wav()
        return None

    def save_wav(self):
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = os.path.join(OUTPUT_DIR, f"record_{timestamp}.wav")
            audio_data = np.concatenate(self.frames, axis=0)
            with wave.open(filename, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(RATE)
                wf.writeframes(audio_data.tobytes())
            print(f"Saved to {filename}")
            self.last_filename = filename
            return filename
        except Exception as e:
            print(f"Error saving WAV: {e}")
            return None


recorder = SimpleRecorder()

if __name__ == "__main__":
    from pynput import keyboard as kb

    pressed: set = set()
    _Z = kb.KeyCode.from_char('z')
    _X = kb.KeyCode.from_char('x')

    def _on_press(key):
        pressed.add(key)
        if _Z in pressed and _X in pressed:
            recorder.start()
        if key == kb.Key.esc:
            return False

    def _on_release(key):
        pressed.discard(key)
        if _Z not in pressed or _X not in pressed:
            if recorder.recording:
                recorder.stop()

    print("Hold 'z+x' to record. Press 'Esc' to exit.")
    with kb.Listener(on_press=_on_press, on_release=_on_release) as lst:
        lst.join()
