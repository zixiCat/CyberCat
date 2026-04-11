import ctypes
import os
import sys
from pathlib import Path

from PySide6.QtCore import QEvent, QRect, QSettings, QUrl, Qt
from PySide6.QtGui import QCursor, QDesktopServices
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QMainWindow

if sys.platform == "win32":
    GWL_STYLE = -16
    GWL_EXSTYLE = -20
    WS_CAPTION = 0x00C00000
    WS_EX_APPWINDOW = 0x00040000
    WS_EX_TOOLWINDOW = 0x00000080
    SWP_NOMOVE = 0x0002
    SWP_NOSIZE = 0x0001
    SWP_NOZORDER = 0x0004
    SWP_FRAMECHANGED = 0x0020

HTTP_URL_SCHEMES = {"http", "https"}
NAVIGATION_TYPE_LINK_CLICKED = QWebEnginePage.NavigationType.NavigationTypeLinkClicked


def should_open_externally(
    url: QUrl, navigation_type: QWebEnginePage.NavigationType
) -> bool:
    return navigation_type == NAVIGATION_TYPE_LINK_CLICKED and url.scheme() in HTTP_URL_SCHEMES


class DesktopWebPage(QWebEnginePage):
    def acceptNavigationRequest(self, url, navigation_type, is_main_frame):
        if should_open_externally(url, navigation_type):
            QDesktopServices.openUrl(url)
            return False

        return super().acceptNavigationRequest(url, navigation_type, is_main_frame)

    def createWindow(self, _window_type):
        return ExternalLinkPage(self.profile(), self)


class ExternalLinkPage(QWebEnginePage):
    def acceptNavigationRequest(self, url, navigation_type, is_main_frame):
        if url.scheme() in HTTP_URL_SCHEMES:
            QDesktopServices.openUrl(url)

        self.deleteLater()
        return False


class MainWindow(QMainWindow):
    """Main application window hosting the React frontend."""

    def __init__(self, backend_service):
        super().__init__()
        self.backend = backend_service
        self._normal_geometry = None
        self._settings = QSettings("CyberCat", "Desktop")
        self._win32_caption_applied = False

        self.setWindowTitle("CyberCat")
        self.resize(320, 480)
        self.setMinimumSize(320, 480)
        self._restore_window_geometry()

        self.browser = QWebEngineView()
        self.browser.setPage(DesktopWebPage(parent=self.browser))
        self.browser.setAcceptDrops(False)
        self.browser.installEventFilter(self)
        self.setCentralWidget(self.browser)
        self.setAcceptDrops(True)

        # Setup QWebChannel
        self.channel = QWebChannel()
        self.channel.registerObject("backend", self.backend)
        self.browser.page().setWebChannel(self.channel)

        self.backend.minimize_requested.connect(self.showMinimized)
        self.backend.maximize_requested.connect(self.toggle_maximized)
        self.backend.close_requested.connect(self.close)
        self.backend.drag_requested.connect(self.start_window_drag)

        # Enable remote debugging and cross-origin access
        settings = self.browser.page().settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.AllowRunningInsecureContent, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)

        # Load the React app
        # Packaged exe: load bundled static files from _internal/frontend/
        # Development:  use http://localhost:4100
        if getattr(sys, "frozen", False):
            base_dir = os.path.dirname(sys.executable)
            index_path = os.path.join(base_dir, "_internal", "frontend", "index.html")
            self.browser.setUrl(QUrl.fromLocalFile(index_path))
        else:
            self.browser.setUrl(QUrl("http://localhost:4100/#/chat"))

    def changeEvent(self, event):
        if event.type() == QEvent.WindowStateChange:
            if not self.isMaximized() and not self.isMinimized():
                self._normal_geometry = self.geometry()
            self.backend.set_window_maximized(self.isMaximized())

        super().changeEvent(event)

    def showEvent(self, event):
        self._apply_custom_caption_if_needed()
        if self._normal_geometry is None and not self.isMaximized():
            self._normal_geometry = self.geometry()
        self.backend.set_window_maximized(self.isMaximized())
        super().showEvent(event)

    def moveEvent(self, event):
        self._persist_window_geometry()
        super().moveEvent(event)

    def eventFilter(self, watched, event):
        if watched is self.browser and event.type() in {
            QEvent.DragEnter,
            QEvent.DragMove,
            QEvent.Drop,
        }:
            if event.type() in {QEvent.DragEnter, QEvent.DragMove}:
                self._handle_file_drag_event(event)
            else:
                self._handle_file_drop_event(event)
            return event.isAccepted()
        return super().eventFilter(watched, event)

    def dragEnterEvent(self, event):
        self._handle_file_drag_event(event)

    def dragMoveEvent(self, event):
        self._handle_file_drag_event(event)

    def dropEvent(self, event):
        self._handle_file_drop_event(event)

    def resizeEvent(self, event):
        if not self.isMaximized() and not self.isMinimized():
            self._normal_geometry = self.geometry()
        self._persist_window_geometry()
        super().resizeEvent(event)

    def closeEvent(self, event):
        self._persist_window_geometry()
        super().closeEvent(event)

    def start_window_drag(self):
        window_handle = self.windowHandle()
        if window_handle is None or not hasattr(window_handle, "startSystemMove"):
            return

        if self.isMaximized():
            cursor_pos = QCursor.pos()
            normal_geometry = self._normal_geometry

            self.showNormal()

            restored_geometry = normal_geometry or self.geometry()
            restored_width = restored_geometry.width()
            restored_height = restored_geometry.height()
            screen = self.screen().availableGeometry() if self.screen() else None
            screen_left = screen.left() if screen else cursor_pos.x()
            screen_top = screen.top() if screen else cursor_pos.y()
            relative_x = 0.5

            if screen and screen.width() > 0:
                relative_x = (cursor_pos.x() - screen.left()) / screen.width()
                relative_x = min(max(relative_x, 0.15), 0.85)

            target_x = int(cursor_pos.x() - restored_width * relative_x)
            target_y = int(cursor_pos.y() - 18)

            if screen:
                target_x = max(screen_left, min(target_x, screen.right() - restored_width + 1))
                target_y = max(screen_top, target_y)

            self.setGeometry(target_x, target_y, restored_width, restored_height)

        window_handle.startSystemMove()

    def toggle_maximized(self):
        if self.isMaximized():
            self.showNormal()
            return

        if not self.isMinimized():
            self._normal_geometry = self.geometry()
        self.showMaximized()

    def _persist_window_geometry(self):
        if not self.isVisible():
            return

        geometry = (
            self._normal_geometry
            if self.isMaximized() and self._normal_geometry
            else self.geometry()
        )
        self._settings.setValue("window/geometry", geometry)
        self._settings.setValue("window/maximized", self.isMaximized())
        self._settings.sync()

    def _restore_window_geometry(self):
        saved_geometry = self._settings.value("window/geometry", type=QRect)
        if saved_geometry is not None:
            if (
                saved_geometry.width() >= self.minimumWidth()
                and saved_geometry.height() >= self.minimumHeight()
            ):
                self.setGeometry(saved_geometry)
                self._normal_geometry = saved_geometry

        if self._settings.value("window/maximized", False, type=bool):
            self.showMaximized()

    def _apply_custom_caption_if_needed(self):
        if self._win32_caption_applied or sys.platform != "win32":
            return

        hwnd = int(self.winId())
        if hwnd == 0:
            return

        user32 = ctypes.windll.user32
        get_window_long = user32.GetWindowLongW
        set_window_long = user32.SetWindowLongW
        set_window_pos = user32.SetWindowPos

        get_window_long.argtypes = [ctypes.c_void_p, ctypes.c_int]
        get_window_long.restype = ctypes.c_long
        set_window_long.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_long]
        set_window_long.restype = ctypes.c_long
        set_window_pos.argtypes = [
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_uint,
        ]

        style = get_window_long(hwnd, GWL_STYLE)
        if style & WS_CAPTION:
            style &= ~WS_CAPTION
            set_window_long(hwnd, GWL_STYLE, style)

        ex_style = get_window_long(hwnd, GWL_EXSTYLE)
        ex_style |= WS_EX_APPWINDOW
        ex_style &= ~WS_EX_TOOLWINDOW
        set_window_long(hwnd, GWL_EXSTYLE, ex_style)

        set_window_pos(
            hwnd,
            0,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
        )

        self._win32_caption_applied = True

    def _handle_file_drag_event(self, event):
        if self._can_accept_file_drop(event):
            event.acceptProposedAction()
            return
        event.ignore()

    def _handle_file_drop_event(self, event):
        if not self._can_accept_file_drop(event):
            event.ignore()
            return

        paths = self._extract_local_file_paths(event.mimeData().urls())
        if not paths:
            event.ignore()
            return

        self.backend.handle_native_file_drop(paths)
        event.acceptProposedAction()

    def _can_accept_file_drop(self, event) -> bool:
        if not self.backend.can_accept_file_ingest():
            return False
        mime_data = event.mimeData()
        return bool(
            mime_data and mime_data.hasUrls() and self._extract_local_file_paths(mime_data.urls())
        )

    def _extract_local_file_paths(self, urls) -> list[str]:
        file_paths: list[str] = []
        for url in urls or []:
            if not url.isLocalFile():
                continue

            local_path = url.toLocalFile()
            if not local_path:
                continue

            path = Path(local_path)
            if path.is_file():
                file_paths.append(str(path.resolve()))

        return file_paths
