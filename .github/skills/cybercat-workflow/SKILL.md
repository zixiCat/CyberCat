---
name: cybercat-workflow
description: 'Work on the CyberCat Windows desktop app across the React chatbot UI, Python service, voice input, TTS, OpenAI/Qwen integrations, Windows packaging, and GitHub release publishing. Use when implementing features, debugging chat or speech behavior, tracing frontend-to-service flows, validating build and installer changes, or publishing a GitHub release in this repo.'
argument-hint: 'Describe the CyberCat feature, bug, or workflow to handle'
---

# CyberCat Workflow

Use this skill when the task is specific to CyberCat and the agent needs repo-aware workflow guidance instead of rediscovering the project layout from scratch.

## Best For

- Chat UI changes in `apps/chatbot`
- Settings, speech lab, session, or audio UX work
- Python service changes in `apps/service/src/service`, `apps/service/src/ui`, or `apps/service/src/utils`
- Voice recording, TTS, and agent orchestration work
- Windows packaging and installer tasks
- GitHub release publishing and release notes verification

## Procedure

1. Classify the task with the [project map](./references/project-map.md).
2. Load the relevant repo constraints before editing:
   - All project files use LF line endings.
   - Frontend work in `apps/chatbot/**` should follow the existing React 19, `react-use`, Ant Design 6, Tailwind, and Qt WebChannel bridge patterns already used in the app.
   - Service work in `apps/service/**` should keep orchestration in service modules, prompts in `apps/service/src/prompts`, shared helpers in `apps/service/src/utils`, and generated files in the top-level `output` folder.
3. Read only the files needed for the requested workflow. Prefer minimal, targeted edits over broad refactors.
4. For cross-layer issues, trace the flow end-to-end:
   - UI entry points and hooks in `apps/chatbot/src/pages/**`
   - Desktop and service orchestration in `apps/service/src/service/**`
   - Window behavior in `apps/service/src/ui/**`
   - Build and installer logic in `scripts/windows/**` and `installer/**`
5. Validate only the surfaces touched by the change using the [validation checklist](./references/validation.md).
6. If the task includes packaging or release work, review the packaging and GitHub release caveats in the validation reference before building or publishing.
7. Treat GitHub release notes as part of the deliverable, not an optional extra:
   - `gh release upload` only adds assets; it does not create or refresh the release body.
   - Prefer `gh release create --generate-notes` when creating a new release.
   - If GitHub only generates a bare `Full Changelog` line, add a short manual summary instead of leaving the release without a meaningful `What's Changed` section.

## Working Notes

- Top-level web commands are `npm run start` and `npm run build`.
- Windows packaging commands are `npm run build:bundle` and `npm run build:win`.
- Python dependencies are managed with `uv` via `pyproject.toml`.
- This skill complements the repo instructions; it does not replace them.

## References

- [Project Map](./references/project-map.md)
- [Validation Checklist](./references/validation.md)