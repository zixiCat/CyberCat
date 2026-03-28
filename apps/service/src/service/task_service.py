import asyncio
import base64
import json
import time
import threading
from queue import Empty, Queue
from typing import Any

import dashscope
from PySide6.QtCore import QObject, Signal

from service.agent_service import agent_service
from service.config_service import config_service
from service.qwen_tts_service import decode_audio_chunk, qwen_tts_service

MAX_HISTORY_MESSAGES = 20


class TaskService(QObject):
    task_started = Signal(int, str)
    segment_text_chunk = Signal(int, str)
    segment_audio_chunk = Signal(int, str)
    segment_ready = Signal(int, str)
    segment_finished = Signal(int, str)  # Signal when a full sentence/segment is done
    task_finished = Signal()

    def __init__(self):
        super().__init__()
        self.model_name = ""
        qwen_tts_service.apply_base_url()
        self._task_counter = 0
        self._counter_lock = threading.Lock()
        self._stream_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._tts_queue = Queue()
        self._pending_segments = 0
        self._pending_segments_lock = threading.Lock()
        self._pending_segments_done = threading.Event()
        self._pending_segments_done.set()
        self._current_stream = None
        self._tts_worker = threading.Thread(target=self._tts_worker_loop, daemon=True)
        self._tts_worker.start()
        self.reload_config()

    def reload_config(self):
        """Refresh model settings from the persisted config."""
        agent_service.reload_config()
        self.model_name = agent_service.model_name

    def start_task(self, text: str, system_prompt: str = None, history_json: str = None):
        """Starts the task in a background thread to avoid blocking the GUI."""
        self._stop_event.clear()
        threading.Thread(
            target=self._run_task_thread,
            args=(text, system_prompt, history_json),
            daemon=True,
        ).start()

    def stop_task(self):
        """Stops the current running task."""
        self._stop_event.set()
        with self._stream_lock:
            current_stream = self._current_stream
        if current_stream is not None:
            current_stream.cancel()
        self._clear_pending_tts()

    def _run_task_thread(self, text: str, system_prompt: str = None, history_json: str = None):
        asyncio.run(self._run_task(text, system_prompt, history_json))

    async def _run_task(self, text: str, system_prompt: str = None, history_json: str = None):
        print(f"Task started with text: {text}")
        try:
            with self._counter_lock:
                self._task_counter += 1
                task_id = self._task_counter

            self.task_started.emit(task_id, text)
            input_items = self._build_input_items(text, history_json)

            print(f"DEBUG: Starting agent stream for model {self.model_name}")
            llm_request_started_at = time.perf_counter()
            response = agent_service.run_streamed(input_items, system_prompt)
            with self._stream_lock:
                self._current_stream = response

            sentence_buffer = ""
            delimiters = set([".", "。", "!", "！", "?", "？", "\n"])
            first_stream_chunk_logged = False
            first_text_token_logged = False

            local_segment_index = 1
            current_segment_id = task_id * 10000 + local_segment_index

            print("DEBUG: Entering agent stream loop")
            async for event in response.stream_events():
                if self._stop_event.is_set():
                    print("Task stopped by user during agent stream.")
                    break

                if not first_stream_chunk_logged:
                    first_stream_chunk_logged = True
                    self._log_llm_latency(
                        "first stream chunk",
                        llm_request_started_at,
                        time.perf_counter(),
                    )

                if event.type == "run_item_stream_event":
                    self._log_run_item_event(event)
                    continue

                content = self._extract_stream_content(event)
                if not content:
                    continue

                if not first_text_token_logged:
                    first_text_token_logged = True
                    self._log_llm_latency(
                        "first text token",
                        llm_request_started_at,
                        time.perf_counter(),
                    )

                for char in content:
                    if self._stop_event.is_set():
                        break
                    sentence_buffer += char
                    self.segment_text_chunk.emit(current_segment_id, char)

                    if char in delimiters:
                        sentence = sentence_buffer.strip()
                        if sentence:
                            self.segment_ready.emit(current_segment_id, sentence)
                            self._enqueue_tts_segment(current_segment_id, sentence)
                        sentence_buffer = ""
                        local_segment_index += 1
                        current_segment_id = task_id * 10000 + local_segment_index

            # Process any remaining text if not stopped
            if not self._stop_event.is_set():
                sentence = sentence_buffer.strip()
                if sentence:
                    self.segment_ready.emit(current_segment_id, sentence)
                    self._enqueue_tts_segment(current_segment_id, sentence)
                self._pending_segments_done.wait()

        except Exception as e:
            print(f"Task error: {e}")
        finally:
            with self._stream_lock:
                self._current_stream = None
            self.task_finished.emit()

    def _build_input_items(
        self,
        text: str,
        history_json: str = None,
    ) -> list[dict[str, str]]:
        messages = self._parse_history_messages(history_json)
        messages.append({"role": "user", "content": text})
        return messages

    def _parse_history_messages(self, history_json: str = None) -> list[dict[str, str]]:
        if not history_json:
            return []

        try:
            payload = json.loads(history_json)
        except json.JSONDecodeError as error:
            print(f"Failed to parse chat history: {error}")
            return []

        if not isinstance(payload, list):
            return []

        messages: list[dict[str, str]] = []
        for item in payload:
            normalized = self._normalize_history_message(item)
            if normalized is not None:
                messages.append(normalized)

        return messages[-MAX_HISTORY_MESSAGES:]

    def _normalize_history_message(self, item: Any) -> dict[str, str] | None:
        if not isinstance(item, dict):
            return None

        role = item.get("role")
        content = item.get("content")
        if role not in {"user", "assistant"} or not isinstance(content, str):
            return None

        normalized_content = content.strip()
        if not normalized_content:
            return None

        return {"role": role, "content": normalized_content}

    def _enqueue_tts_segment(self, segment_id: int, text: str):
        with self._pending_segments_lock:
            self._pending_segments += 1
            self._pending_segments_done.clear()
        self._tts_queue.put((segment_id, text))

    def _complete_tts_segment(self):
        with self._pending_segments_lock:
            self._pending_segments = max(0, self._pending_segments - 1)
            if self._pending_segments == 0:
                self._pending_segments_done.set()

    def _clear_pending_tts(self):
        while True:
            try:
                self._tts_queue.get_nowait()
            except Empty:
                break
            else:
                self._tts_queue.task_done()
                self._complete_tts_segment()

    def _tts_worker_loop(self):
        while True:
            segment_id, text = self._tts_queue.get()
            try:
                if not self._stop_event.is_set():
                    self._synthesize_and_stream_audio(segment_id, text)
                    if not self._stop_event.is_set():
                        self.segment_finished.emit(segment_id, text)
            finally:
                self._complete_tts_segment()
                self._tts_queue.task_done()

    def _synthesize_and_stream_audio(self, segment_id: int, text: str):
        print(f"DEBUG: Synthesizing audio for segment {segment_id}: {text}")
        try:
            qwen_tts_service.apply_base_url()
            selected_voice, model = qwen_tts_service.resolve_voice()
            response = dashscope.MultiModalConversation.call(
                api_key=config_service.get("qwen_api_key"),
                model=model,
                language_type="English",
                text=text,
                voice=selected_voice,
                stream=True,
            )

            for chunk in response:
                if self._stop_event.is_set():
                    print("Task stopped by user during TTS stream.")
                    break
                if chunk.status_code == 200:
                    audio_data = getattr(chunk.output, "audio", {}).get("data", None)
                    if audio_data:
                        pcm_audio = decode_audio_chunk(audio_data)
                        normalized_audio = base64.b64encode(pcm_audio).decode("utf-8")
                        self.segment_audio_chunk.emit(segment_id, normalized_audio)
                else:
                    print(f"TTS Error: {chunk.code} - {chunk.message}")
        except Exception as e:
            print(f"TTS Exception: {e}")

    def _extract_stream_content(self, event) -> str:
        if event.type != "raw_response_event":
            return ""

        data = getattr(event, "data", None)
        data_type = getattr(data, "type", "")
        if data_type not in {"response.output_text.delta", "response.text.delta"}:
            return ""

        delta = getattr(data, "delta", None)
        return delta if isinstance(delta, str) else ""

    def _log_run_item_event(self, event) -> None:
        item = getattr(event, "item", None)
        item_type = getattr(item, "type", "")
        if item_type == "tool_call_item":
            raw_item = getattr(item, "raw_item", None)
            tool_name = getattr(raw_item, "name", "unknown")
            print(f"Agent tool call: {tool_name}")
        elif item_type == "tool_call_output_item":
            output = str(getattr(item, "output", ""))
            truncated_output = output[:200]
            print(f"Agent tool output: {truncated_output}")

    def _normalize_delta_text(self, value) -> str:
        if isinstance(value, str):
            return value

        if isinstance(value, list):
            text_parts = []
            for item in value:
                if isinstance(item, str):
                    text_parts.append(item)
                    continue

                if isinstance(item, dict):
                    text = item.get("text")
                    if isinstance(text, str):
                        text_parts.append(text)
                    continue

                text = getattr(item, "text", None)
                if isinstance(text, str):
                    text_parts.append(text)

            return "".join(text_parts)

        return ""

    def _supports_thinking(self) -> bool:
        model_name = str(self.model_name or "").strip().lower()
        return "qwen" in model_name

    def _log_llm_latency(self, label: str, started_at: float, ended_at: float):
        latency_ms = (ended_at - started_at) * 1000
        print(f"LLM latency [{label}]: {latency_ms:.2f} ms")


task_service = TaskService()
