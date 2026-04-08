---
name: Service Standards
description: Python service standards for code under apps/service. Use when editing backend logic, agent orchestration, Qt bridge methods, task execution, voice input, TTS pipelines, or desktop UI integration.
applyTo: 'apps/service/**'
---

# Service Standards

## 1. Python & Coding Standards

- Target Python 3.12+ syntax and typing already required by this repo.
- Keep functions small and single-purpose.
- Prefer explicit names over abbreviations.
- Avoid deeply nested control flow; return early on invalid states.
- Add type hints to public functions, service boundaries, and structured payloads.
- Use dataclasses or TypedDict for structured payloads instead of loose dicts when it improves clarity.
- Raise specific exceptions with actionable messages; avoid bare `except`.
- Keep imports grouped: stdlib, third-party, local.

## 2. Service Architecture & Paths

- The desktop and service runtime lives under `apps/service/src`.
- Keep orchestration in `apps/service/src/service` and push reusable logic into `apps/service/src/utils`.
- Put constants in `apps/service/src/constants` and avoid magic literals in business logic.
- Keep prompt templates in `apps/service/src/prompts`; do not inline large prompt text in Python modules.
- Keep Qt window code in `apps/service/src/ui`.
- Optional integrations should be controlled by persisted feature flags in `config_service` rather than ad-hoc checks. Keep disabled modules dormant by guarding bridge methods first and lazily importing optional handlers only when the feature is enabled.
- Write outputs only to the top-level `output` folder.
- Keep automation and one-off integrations in `apps/service/src/scripts` with clear folder names by source or platform.
- New script folders that introduce external prerequisites should include a short `README.md` with prerequisites and usage notes.
- Avoid hardcoded machine-specific paths; prefer config values or environment variables.
- Scripts should fail with clear error messages and non-zero exit codes when prerequisites are missing.
- Reuse shared helpers from `apps/service/src/utils` where possible instead of duplicating parsing or I/O logic.

## 3. Reliability, Performance & File Hygiene

- Avoid blocking calls in hot paths when async/non-blocking alternatives are available.
- Add lightweight timing/log context around long-running external calls (LLM, TTS, I/O).
- Validate external input early and fail fast with clear errors.
- **Line Endings:** Enforce **LF** for all project files.
- **Module Size:** Prefer focused modules. If a file becomes difficult to navigate, split by responsibility instead of letting unrelated concerns accumulate.
