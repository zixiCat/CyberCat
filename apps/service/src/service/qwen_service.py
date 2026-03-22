import base64
import os
import re
import time
from openai import OpenAI
from service.config_service import config_service


DEFAULT_QWEN_ASR_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"


def parse_hotwords(hotwords_str: str) -> list[str]:
    return [word.strip() for word in re.split(r"[,\r\n]+", hotwords_str) if word.strip()]


class QwenASRService:
    def __init__(self):
        self.api_key = config_service.get("qwen_api_key")
        self.base_url = config_service.get("qwen_asr_base_url") or DEFAULT_QWEN_ASR_BASE_URL

        # Get hotwords from config
        hotwords_str = config_service.get("qwen_hotwords", "")
        self.hotwords = parse_hotwords(hotwords_str)

        if not self.api_key:
            # We don't raise here to allow the app to start even if this provider isn't used
            pass

    def transcribe_audio(self, file_path: str) -> str:
        """
        Transcribes audio file to text using Qwen-ASR via DashScope OpenAI compatible API.
        """
        if not self.api_key:
            return "Error: QWEN_API_KEY not found in environment variables"

        try:
            client = OpenAI(
                api_key=self.api_key,
                base_url=self.base_url,
            )

            # Read and encode the audio file
            # DashScope's input_audio.data supports base64 string
            start_time = time.time()
            with open(file_path, "rb") as audio_file:
                audio_data = base64.b64encode(audio_file.read()).decode("utf-8")
            end_time = time.time()
            print(f"Time consumed from wav to base64: {end_time - start_time:.4f}s")

            # Identify format from extension
            ext = os.path.splitext(file_path)[1].lower().replace(".", "")
            if ext == "m4a":
                ext = "mp3"  # DashScope might prefer standard names, but usually detects or takes the string

            format_prefix = f"data:audio/{ext};base64,"

            completion = client.chat.completions.create(
                model="qwen3-asr-flash",
                messages=[
                    {
                        "role": "system",
                        "content": [{"text": "Specific Words: OpenClaw, CyberCat, zixiCat"}],
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_audio",
                                "input_audio": {"data": f"{format_prefix}{audio_data}"},
                            }
                        ],
                    },
                ],
                extra_body={
                    "asr_options": {
                        "language": "en",
                        "enable_itn": True,  # Normalized text (e.g. 1st instead of first)
                        "phrase_list": self.hotwords if self.hotwords else None,
                    }
                },
            )

            if completion.choices and completion.choices[0].message.content:
                return completion.choices[0].message.content
            return ""

        except Exception as e:
            print(f"Qwen-ASR Error: {e}")
            return f"Error: {str(e)}"


qwen_service = QwenASRService()
