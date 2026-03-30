# Release Workflow

This project uses [scripts/windows/release.py](scripts/windows/release.py) as the release helper.

## What It Does

- Syncs the version in `package.json`
- Syncs the version in `apps/chatbot/package.json`
- Syncs the version in `package-lock.json`
- Syncs the version in `pyproject.toml`
- Syncs the version in `installer/CyberCat.iss`
- Optionally builds the bundle or Windows installer
- Optionally runs `gh release create`

## Common Commands

- Sync version only: `npm run release -- 1.0.0`
- Sync version and build the bundle: `npm run release:bundle -- 1.0.0`
- Sync version and build the installer: `npm run release:win -- 1.0.0`
- Sync version, build the installer, and publish: `npm run release:win -- 1.0.0 --publish --generate-notes`

## Custom Release Assets

If you want to upload a custom asset, pass `--asset` one or more times.

- Upload a zip file: `npm run release -- 1.0.0 --publish --generate-notes --asset ./build-artifact.zip`
- Upload multiple assets: `npm run release -- 1.0.0 --publish --asset ./a.zip --asset ./b.exe`

If you do not pass `--publish`, the script only prints the `gh release create` command so you can review it first.

## Direct GitHub CLI Equivalent

For a custom zip upload, the generated command is equivalent to:

```bash
gh release create v1.0.0 ./build-artifact.zip --generate-notes
```

## Notes

- The version argument accepts either `1.0.0` or `v1.0.0`
- `release:win` builds the installer through the existing Windows packaging flow
- `release:bundle` builds only the PyInstaller bundle