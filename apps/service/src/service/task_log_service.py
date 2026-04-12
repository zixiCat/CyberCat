"""Transient runtime log routing for the active desktop task."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import contextmanager
import threading

TaskLogEmitter = Callable[[str, str], None]

_active_task_lock = threading.Lock()
_active_task_emitter: TaskLogEmitter | None = None


@contextmanager
def bind_task_log_emitter(emitter: TaskLogEmitter) -> Iterator[None]:
    global _active_task_emitter

    with _active_task_lock:
        previous_emitter = _active_task_emitter
        _active_task_emitter = emitter

    try:
        yield
    finally:
        with _active_task_lock:
            _active_task_emitter = previous_emitter


def emit_task_log(source: str, message: str) -> None:
    cleaned_lines = [line.rstrip() for line in str(message or "").splitlines() if line.strip()]
    if not cleaned_lines:
        return

    with _active_task_lock:
        emitter = _active_task_emitter

    if emitter is None:
        return

    resolved_source = str(source or "status").strip() or "status"
    for line in cleaned_lines:
        emitter(resolved_source, line)
