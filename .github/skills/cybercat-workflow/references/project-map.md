# Project Map

## Top-Level Layout

- `apps/chatbot/`: Nx React frontend for the chatbot UI.
- `apps/service/`: Python desktop service app and packaging assets.
- `apps/service/src/main.py`: desktop and local service entry point.
- `apps/service/src/service/`: agent orchestration, backend, config, task, TTS, and voice listener services.
- `apps/service/src/ui/`: desktop window implementations.
- `apps/service/src/prompts/`: prompt presets.
- `apps/service/src/constants/tts.py`: TTS model and voice mapping.
- `apps/service/src/utils/`: shared helpers such as markdown rendering, notifications, and voice capture.
- `scripts/windows/build_installer.py`: bundle and installer build entry point.
- `installer/CyberCat.iss`: Inno Setup installer definition.

## Frontend Hotspots

- `apps/chatbot/src/pages/chatView/`: chat shell, message list, input, sidebar, and chat-specific hooks.
- `apps/chatbot/src/pages/settingsView/`: settings UI and speech lab.
- `apps/chatbot/src/pages/components/SettingsProfileButton.tsx`: profile-related settings entry.

## Service Hotspots

- `apps/service/src/main.py`: startup wiring.
- `apps/service/src/service/agent_service.py`: agent orchestration.
- `apps/service/src/service/task_service.py`: task execution and streaming workflow.
- `apps/service/src/service/backend_service.py`: backend integration.
- `apps/service/src/service/config_service.py`: persisted configuration.
- `apps/service/src/service/qwen_service.py`: model integration.
- `apps/service/src/service/qwen_tts_service.py`: TTS integration.
- `apps/service/src/service/voice_listener.py`: voice capture and shortcut handling.
- `apps/service/src/ui/main_window.py`: main desktop UI.
- `apps/service/src/ui/danmu_window.py`: overlay window behavior.

## Typical Task Mapping

- Message send or render issue: inspect `apps/chatbot/src/pages/chatView/**` and the related service task or backend modules.
- Voice recording or shortcut issue: inspect `apps/service/src/service/voice_listener.py`, `apps/service/src/utils/record_voice.py`, and any UI bridge points.
- TTS voice or model issue: inspect `apps/service/src/constants/tts.py`, `apps/service/src/service/qwen_tts_service.py`, and `apps/service/src/service/task_service.py`.
- Settings or profile issue: inspect `apps/chatbot/src/pages/settingsView/**`, `apps/chatbot/src/pages/components/SettingsProfileButton.tsx`, and `apps/service/src/service/config_service.py`.
- Installer or bundle issue: inspect `scripts/windows/build_installer.py`, `apps/service/CyberCat.spec`, and `installer/CyberCat.iss`.