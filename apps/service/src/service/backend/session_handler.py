"""Chat session persistence (save / load / delete)."""

import json
import sys
from pathlib import Path


def _history_dir() -> Path:
    if getattr(sys, "frozen", False):
        base = Path(sys.executable).resolve().parent
    else:
        base = Path(__file__).resolve().parents[2]
    history_dir = base / "output" / "history"
    history_dir.mkdir(parents=True, exist_ok=True)
    return history_dir


def _session_path(session_id: str) -> Path:
    safe_id = Path(session_id).name  # prevent path traversal
    return _history_dir() / f"{safe_id}.json"


def load_sessions() -> str:
    """Return all persisted sessions as a JSON string (list of objects)."""
    history_dir = _history_dir()
    sessions: list[dict] = []

    for path in sorted(history_dir.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                data.setdefault("id", path.stem)
                sessions.append(data)
        except (json.JSONDecodeError, OSError) as exc:
            print(f"[session] Skipping {path.name}: {exc}")

    return json.dumps(sessions, ensure_ascii=False)


def save_session(session_id: str, session_json: str) -> None:
    """Persist a single session to disk."""
    if not session_id or not session_id.strip():
        return

    try:
        data = json.loads(session_json)
    except json.JSONDecodeError as exc:
        print(f"[session] Invalid JSON for {session_id}: {exc}")
        return

    path = _session_path(session_id)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def delete_session(session_id: str) -> None:
    """Remove a session file from disk."""
    path = _session_path(session_id)
    if path.is_file():
        path.unlink()
