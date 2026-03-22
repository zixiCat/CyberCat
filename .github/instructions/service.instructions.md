---
name: Service Standards
description: Python service standards for code under service/. Use when editing backend logic, task orchestration, audio/tts pipelines, and UI integration in the local service app.
applyTo: 'service/**'
---

# Service Standards

## 1. Python & Coding Standards

- Target Python 3.11+ syntax already used in this repo.
- Keep functions small and single-purpose.
- Prefer explicit names over abbreviations.
- Avoid deeply nested control flow; return early on invalid states.
- Add type hints to public functions and service boundaries.
- Use dataclasses or TypedDict for structured payloads instead of loose dicts where practical.
- Raise specific exceptions with actionable messages; avoid bare `except`.
- Keep imports grouped: stdlib, third-party, local.

## 2. Service Architecture & Scripts

- **Service Modules:**
	- Keep orchestration in `service/` modules and push reusable logic into `utils/`.
	- Put constants in `constants/` and avoid magic literals in business logic.
	- Keep prompt templates in `prompts/`; do not inline large prompt text in Python modules.
	- Write outputs only to established output folders (`service/output/` or configured equivalents).
- **Scripts:**
	- Keep automation and one-off integrations in `scripts/` with clear folder names by source/platform.
	- Each script folder should include a short `README.md` for prerequisites, usage, and examples.
	- Avoid hardcoded machine-specific paths; prefer config values or environment variables.
	- Scripts must fail with clear error messages and non-zero exit codes when prerequisites are missing.
	- Reuse shared helpers from `utils/` where possible instead of duplicating parsing or I/O logic.

## 3. Reliability, Performance & File Hygiene

- Avoid blocking calls in hot paths when async/non-blocking alternatives are available.
- Add lightweight timing/log context around long-running external calls (LLM, TTS, I/O).
- Validate external input early and fail fast with clear errors.
- **Line Endings:** Enforce **LF** for all project files.
- **File Lines:** Keep each file under 300 lines when possible. If a module grows beyond this, split by responsibility.
