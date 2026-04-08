# Validation Checklist

## Frontend Changes

- Prefer `npm run build` for changes under `apps/chatbot`.
- If the change is interaction-heavy or layout-sensitive, also run `npm run start` when practical.
- Keep layout and spacing consistent with the existing Tailwind and Ant Design patterns.

## Python Service Changes

- Use the repo's configured Python environment before running Python commands.
- Run targeted syntax or focused execution checks for changed modules instead of broad, unrelated test runs.
- Keep outputs in the top-level `output` folder.

## Packaging Changes

- Use `npm run build:bundle` for the PyInstaller bundle only.
- Use `npm run build:win` for the full Windows installer.
- Inno Setup 6 is required for the full installer build.
- PyInstaller must be installed in the project Python environment.
- Do not reintroduce UPX compression for OpenSSL-related binaries.
- When building from Git Bash on Windows, ensure bundled `libssl-3-x64.dll` and `libcrypto-3-x64.dll` come from Python's DLLs, not Git's `mingw64` directory.

## GitHub Releases

- `gh release upload` only attaches assets. It does not populate or regenerate the release body.
- Prefer `gh release create ... --generate-notes` when creating a new release.
- GitHub builds the `What's Changed` section from merged pull request metadata. If the release range is mostly direct commits, generated notes may collapse to only `Full Changelog`.
- If the release already exists without notes, or generated notes are too sparse, write a short manual summary and apply it with `gh release edit <tag> --notes-file <file>` rather than leaving the body empty.
- Verify the published release page has a non-empty notes body after uploading assets.

## Integration Notes

- The service uses `openai-agents` with DashScope-compatible client wiring for model access.
- TTS defaults should stay aligned with the current qwen-tts model and voice mapping in `apps/service/src/constants/tts.py`.