---
name: Global Engineering Standards
description: Shared cross-project standards that apply to all files in this repository.
applyTo: "**"
---

# Global Standards

- Keep this file for repository-wide rules and reusable patterns.
- **Line Endings:** Use LF line endings for all text files in the repository.
- When creating Git commits, use `type: summary` subjects without scoped parentheses. Do not use formats like `type(scope): summary` unless the user explicitly asks for that style.
- **Validation:** After making changes, validate the affected behavior yourself before finishing. When the change affects a browser-accessible user flow and the app can be run locally, use the browser tools to exercise the main path and confirm the result. If browser validation is not feasible, explain the blocker and state what you verified instead.
- **Browser Page Reuse:** When a relevant page is already open in the VS Code integrated browser, prefer reusing that page if it already matches the needed app or target URL. Only open a new browser page when no suitable page exists or when a separate clean session is necessary.
- **File Size and Structure:** Prefer small, focused source files. Treat 300 lines as a review threshold rather than a hard limit. When editing a large file, extract a helper, smaller module, or other focused abstraction if it materially improves readability, maintainability, or testability. Do not refactor only to satisfy a line-count target.
- **Web/Service Streaming:** When the web client connects to the service for command execution, logs, or other live updates, use `sse.js` on the frontend and Server-Sent Events from Fastify. Do not replace this path with polling or plain `fetch` for live service communication.