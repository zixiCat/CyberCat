"""Orchestrates LLM streaming and TTS synthesis for a single chat task.

Responsibilities:
- Run the agent stream in a background thread
- Split streamed text into sentences
- Queue sentences for TTS synthesis
- Emit Qt signals consumed by BackendService
"""

import asyncio
import base64
import json
import time
import threading
import unicodedata
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
    segment_finished = Signal(int, str)
    task_finished = Signal()

    def __init__(self) -> None:
        super().__init__()
        self._task_counter = 0
        self._counter_lock = threading.Lock()
        self._stream_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._current_stream = None

        # TTS pipeline
        self._tts_queue: Queue[tuple[int, str]] = Queue()
        self._pending_segments = 0
        self._pending_lock = threading.Lock()
        self._pending_done = threading.Event()
        self._pending_done.set()
        threading.Thread(target=self._tts_worker_loop, daemon=True).start()

    # ── Public API ────────────────────────────────────────────────

    def reload_config(self) -> None:
        agent_service.reload_config()

    def start_task(
        self,
        text: str,
        system_prompt: str | None = None,
        history_json: str | None = None,
    ) -> None:
        self._stop_event.clear()
        threading.Thread(
            target=self._run_task_thread,
            args=(text, system_prompt, history_json),
            daemon=True,
        ).start()

    def stop_task(self) -> None:
        self._stop_event.set()
        with self._stream_lock:
            stream = self._current_stream
        if stream is not None:
            stream.cancel()
        self._drain_tts_queue()

    # ── Task execution ────────────────────────────────────────────

    def _run_task_thread(
        self,
        text: str,
        system_prompt: str | None,
        history_json: str | None,
    ) -> None:
        asyncio.run(self._run_task(text, system_prompt, history_json))

    async def _run_task(
        self,
        text: str,
        system_prompt: str | None,
        history_json: str | None,
    ) -> None:
        print(f"Task started: {text}")
        try:
            task_id = self._next_task_id()
            self.task_started.emit(task_id, text)

            messages = _parse_history(history_json)
            messages.append({"role": "user", "content": text})

            t0 = time.perf_counter()
            response = agent_service.run_streamed(messages, system_prompt)
            with self._stream_lock:
                self._current_stream = response

            sentence_buf = ""
            seg_index = 1
            seg_id = task_id * 10000 + seg_index
            first_chunk_logged = False
            first_text_logged = False
            pending_boundary = False

            async for event in response.stream_events():
                if self._stop_event.is_set():
                    break

                if not first_chunk_logged:
                    first_chunk_logged = True
                    _log_latency("first stream chunk", t0)

                if event.type == "run_item_stream_event":
                    _log_run_item(event)
                    continue

                content = _extract_text_delta(event)
                if not content:
                    continue

                if not first_text_logged:
                    first_text_logged = True
                    _log_latency("first text token", t0)

                for char in content:
                    if self._stop_event.is_set():
                        break

                    if pending_boundary:
                        if (
                            char.isspace()
                            or _is_sentence_suffix_char(char)
                            or _is_sentence_delimiter(char)
                        ):
                            sentence_buf += char
                            self.segment_text_chunk.emit(seg_id, char)
                            continue

                        if _should_close_sentence(sentence_buf, char):
                            sentence = sentence_buf.strip()
                            if sentence:
                                self.segment_ready.emit(seg_id, sentence)
                                self._enqueue_tts(seg_id, sentence)
                            sentence_buf = ""
                            seg_index += 1
                            seg_id = task_id * 10000 + seg_index

                        pending_boundary = False

                    sentence_buf += char
                    self.segment_text_chunk.emit(seg_id, char)

                    if _is_sentence_delimiter(char):
                        pending_boundary = True

            # Flush remaining text
            if not self._stop_event.is_set():
                sentence = sentence_buf.strip()
                if sentence:
                    self.segment_ready.emit(seg_id, sentence)
                    self._enqueue_tts(seg_id, sentence)
                self._pending_done.wait()

        except Exception as exc:
            print(f"Task error: {exc}")
        finally:
            with self._stream_lock:
                self._current_stream = None
            self.task_finished.emit()

    def _next_task_id(self) -> int:
        with self._counter_lock:
            self._task_counter += 1
            return self._task_counter

    # ── TTS pipeline ──────────────────────────────────────────────

    def _enqueue_tts(self, segment_id: int, text: str) -> None:
        with self._pending_lock:
            self._pending_segments += 1
            self._pending_done.clear()
        self._tts_queue.put((segment_id, text))

    def _complete_tts(self) -> None:
        with self._pending_lock:
            self._pending_segments = max(0, self._pending_segments - 1)
            if self._pending_segments == 0:
                self._pending_done.set()

    def _drain_tts_queue(self) -> None:
        while True:
            try:
                self._tts_queue.get_nowait()
            except Empty:
                break
            else:
                self._tts_queue.task_done()
                self._complete_tts()

    def _tts_worker_loop(self) -> None:
        while True:
            segment_id, text = self._tts_queue.get()
            try:
                if not self._stop_event.is_set():
                    self._synthesize_segment(segment_id, text)
                    if not self._stop_event.is_set():
                        self.segment_finished.emit(segment_id, text)
            finally:
                self._complete_tts()
                self._tts_queue.task_done()

    def _synthesize_segment(self, segment_id: int, text: str) -> None:
        try:
            qwen_tts_service.apply_base_url()
            voice, model = qwen_tts_service.resolve_voice()
            response = dashscope.MultiModalConversation.call(
                api_key=config_service.get("qwen_api_key"),
                model=model,
                language_type="English",
                text=text,
                voice=voice,
                stream=True,
            )

            for chunk in response:
                if self._stop_event.is_set():
                    break
                if chunk.status_code == 200:
                    raw = getattr(chunk.output, "audio", {}).get("data")
                    if raw:
                        pcm = decode_audio_chunk(raw)
                        b64 = base64.b64encode(pcm).decode("utf-8")
                        self.segment_audio_chunk.emit(segment_id, b64)
                else:
                    print(f"TTS error: {chunk.code} - {chunk.message}")
        except Exception as exc:
            print(f"TTS exception: {exc}")


# ── Module-level helpers (no state) ───────────────────────────────


def _parse_history(history_json: str | None) -> list[dict[str, str]]:
    if not history_json:
        return []
    try:
        payload = json.loads(history_json)
    except json.JSONDecodeError as exc:
        print(f"Failed to parse chat history: {exc}")
        return []

    if not isinstance(payload, list):
        return []

    messages: list[dict[str, str]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = item.get("content")
        if role not in {"user", "assistant"} or not isinstance(content, str):
            continue
        text = content.strip()
        if text:
            messages.append({"role": role, "content": text})

    return messages[-MAX_HISTORY_MESSAGES:]


def _should_close_sentence(sentence_text: str, next_char: str | None) -> bool:
    delimiter, sentence_body = _split_sentence_delimiter(sentence_text)
    if delimiter is None:
        return False

    if delimiter == "\n":
        return True

    next_meaningful = None if next_char is None or next_char.isspace() else next_char
    previous_char = _last_non_whitespace_char(sentence_body)

    if delimiter in {".", "。"}:
        if (
            previous_char
            and previous_char.isdigit()
            and next_meaningful
            and next_meaningful.isdigit()
        ):
            return False
        if next_meaningful and next_meaningful.islower():
            return False

    return True


def _split_sentence_delimiter(sentence_text: str) -> tuple[str | None, str]:
    stripped = sentence_text.rstrip()
    while stripped and _is_sentence_suffix_char(stripped[-1]):
        stripped = stripped[:-1].rstrip()

    if not stripped:
        return None, ""

    delimiter = stripped[-1]
    if not _is_sentence_delimiter(delimiter):
        return None, stripped

    return delimiter, stripped[:-1]


def _last_non_whitespace_char(text: str) -> str | None:
    stripped = text.rstrip()
    return stripped[-1] if stripped else None


def _is_sentence_delimiter(char: str) -> bool:
    return char in {".", "。", "!", "！", "?", "？", "\n"}


def _is_sentence_suffix_char(char: str) -> bool:
    if char in {'"', "'"}:
        return True

    return unicodedata.category(char) in {"Pe", "Pf"}


def _extract_text_delta(event) -> str:
    if event.type != "raw_response_event":
        return ""
    data = getattr(event, "data", None)
    data_type = getattr(data, "type", "")
    if data_type not in {"response.output_text.delta", "response.text.delta"}:
        return ""
    delta = getattr(data, "delta", None)
    return delta if isinstance(delta, str) else ""


def _log_run_item(event) -> None:
    item = getattr(event, "item", None)
    item_type = getattr(item, "type", "")
    if item_type == "tool_call_item":
        raw = getattr(item, "raw_item", None)
        print(f"Agent tool call: {getattr(raw, 'name', 'unknown')}")
    elif item_type == "tool_call_output_item":
        output = str(getattr(item, "output", ""))[:200]
        print(f"Agent tool output: {output}")


def _log_latency(label: str, started_at: float) -> None:
    ms = (time.perf_counter() - started_at) * 1000
    print(f"LLM latency [{label}]: {ms:.2f} ms")


task_service = TaskService()
