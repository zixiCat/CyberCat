---
name: Global Engineering Standards
description: Shared cross-project standards that apply to all files in this repository.
applyTo: "**"
---

# Global Standards

- Keep this file for repository-wide rules and reusable patterns.
- **Line Endings:** Use LF line endings for all text files in the repository.
- When creating Git commits, use `type: summary` subjects without scoped parentheses. Do not use formats like `type(scope): summary` unless the user explicitly asks for that style.
- **File Size and Structure:** Prefer small, focused source files. Treat 300 lines as a review threshold rather than a hard limit. When editing a large file, extract a helper, smaller module, or other focused abstraction if it materially improves readability, maintainability, or testability. Do not refactor only to satisfy a line-count target.
