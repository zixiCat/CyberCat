import sys
from pathlib import Path

from dotenv import load_dotenv
from PySide6.QtGui import QIcon
from PySide6.QtWidgets import QApplication

# Load environment variables before importing services
load_dotenv()


def _resolve_app_icon() -> Path | None:
    if getattr(sys, "frozen", False):
        packaged_icon = (
            Path(sys.executable).resolve().parent / "_internal" / "frontend" / "CyberCat.png"
        )
        if packaged_icon.exists():
            return packaged_icon

    repo_icon = Path(__file__).resolve().parents[3] / "CyberCat.png"
    if repo_icon.exists():
        return repo_icon

    return None


def main():
    """Entry point for the CyberCat desktop application."""
    app = QApplication(sys.argv)
    app_icon = _resolve_app_icon()
    if app_icon is not None:
        app.setWindowIcon(QIcon(str(app_icon)))

    from service.backend_service import BackendService
    from pronounce_service import start_service as start_pronounce_service
    from service.voice_listener import VoiceListener
    from ui.main_window import MainWindow
    from ui.danmu_window import DanmuManager

    # Initialize services
    backend_service = BackendService()
    voice_listener = VoiceListener(backend_service)

    # Initialize Danmu Manager (starts hidden; auto-shows when items arrive)
    danmu_manager = DanmuManager()
    backend_service.show_danmu.connect(danmu_manager.add_danmu)

    # Initialize UI
    window = MainWindow(backend_service)
    window.show()

    # Start background listeners
    voice_listener.start()
    start_pronounce_service()

    # Run application event loop
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
