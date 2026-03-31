"""Qwen ASR (Automatic Speech Recognition) service.

Transcribes audio files to text via the DashScope OpenAI-compatible API
using the ``qwen3-asr-flash`` model.
"""

import base64
import os
import re
import time

from openai import OpenAI

from service.config_service import config_service

DEFAULT_ASR_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
ASR_MODEL = "qwen3-asr-flash"


def _parse_hotwords(raw: str) -> list[str]:
    return [w.strip() for w in re.split(r"[,\r\n]+", raw) if w.strip()]


class QwenASRService:
    """Transcribes audio files using Qwen-ASR via DashScope."""

    def __init__(self) -> None:
        self.api_key: str = config_service.get("qwen_api_key")
        self.base_url: str = config_service.get("qwen_asr_base_url") or DEFAULT_ASR_BASE_URL
        self.hotwords: list[str] = _parse_hotwords(config_service.get("qwen_hotwords", ""))

    def transcribe_audio(self, file_path: str) -> str:
        """Transcribe an audio file and return the recognised text."""
        if not self.api_key:
            return "Error: QWEN_API_KEY not configured"

        client = OpenAI(api_key=self.api_key, base_url=self.base_url)

        t0 = time.time()
        with open(file_path, "rb") as f:
            audio_b64 = base64.b64encode(f.read()).decode("utf-8")
        print(f"Audio base64 encode: {time.time() - t0:.4f}s")

        ext = os.path.splitext(file_path)[1].lstrip(".").lower()
        if ext == "m4a":
            ext = "mp3"
        data_uri = f"data:audio/{ext};base64,{audio_b64}"

        try:
            completion = client.chat.completions.create(
                model=ASR_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": [{"text": "Specific Words: OpenClaw, CyberCat, zixiCat"}],
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "input_audio", "input_audio": {"data": data_uri}},
                        ],
                    },
                ],
                extra_body={
                    "asr_options": {
                        "language": "en",
                        "enable_itn": True,
                        "phrase_list": self.hotwords or None,
                    },
                },
            )
            if completion.choices and completion.choices[0].message.content:
                return completion.choices[0].message.content
            return ""
        except Exception as exc:
            print(f"Qwen-ASR error: {exc}")
            return f"Error: {exc}"


qwen_service = QwenASRService()
