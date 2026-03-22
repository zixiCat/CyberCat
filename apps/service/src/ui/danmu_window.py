import random
from dataclasses import dataclass

from PySide6.QtCore import QElapsedTimer, QRect, Qt, QTimer
from PySide6.QtGui import QColor, QFont, QFontMetrics, QPainter
from PySide6.QtWidgets import QWidget


@dataclass
class DanmuItem:
    text: str
    x: float
    y: int
    width: int
    height: int
    speed: float
    text_color: QColor


class DanmuManager(QWidget):
    def __init__(self):
        super().__init__()
        # Frameless, transparent, stay on top, click-through
        self.setWindowFlags(
            Qt.FramelessWindowHint
            | Qt.WindowStaysOnTopHint
            | Qt.Tool
            | Qt.WindowTransparentForInput
        )
        self.setAttribute(Qt.WA_TranslucentBackground)

        # Cover the primary screen (or a large enough area)
        screen = self.screen().geometry()
        self._screen_rect = screen
        self._horizontal_buffer = 480
        self._vertical_ratio = 0.6
        overlay_height = max(1, int(screen.height() * self._vertical_ratio))
        overlay_y = screen.y() + max(0, (screen.height() - overlay_height) // 2)
        self.setGeometry(
            screen.x() - self._horizontal_buffer,
            overlay_y,
            screen.width() + self._horizontal_buffer * 2,
            overlay_height,
        )

        self.active_danmus = []
        self._row_count = 10
        self._row_height = max(1, overlay_height // self._row_count)
        self._current_row = 0
        self._cleanup_margin = 32
        self._font = QFont("Microsoft YaHei", 20, QFont.Bold)
        self._font_metrics = QFontMetrics(self._font)
        self._horizontal_padding = 42
        self._vertical_padding = 16
        self._outline_color = QColor(0, 0, 0, 170)
        self._outline_offsets = [(-1, 0), (0, -1), (0, 1), (1, 0)]

        self._frame_timer = QTimer(self)
        self._frame_timer.setInterval(16)
        self._frame_timer.setTimerType(Qt.PreciseTimer)
        self._frame_timer.timeout.connect(self._advance_danmus)
        self._frame_timer.start()

        self._elapsed_timer = QElapsedTimer()
        self._elapsed_timer.start()

    def add_danmu(self, text):
        if not text or not text.strip():
            return

        # Choose a row (track)
        row = self._current_row % self._row_count
        self._current_row += 1

        text = text.strip()
        width = self._font_metrics.horizontalAdvance(text) + self._horizontal_padding
        height = self._font_metrics.height() + self._vertical_padding
        y_pos = row * self._row_height + random.randint(0, 10)
        start_x = float(self._horizontal_buffer + self._screen_rect.width())

        self.active_danmus.append(
            DanmuItem(
                text=text,
                x=start_x,
                y=y_pos,
                width=width,
                height=height,
                speed=float(random.randint(220, 300)),
                text_color=QColor(255, 255, 255),
            )
        )
        self.update()

    def _advance_danmus(self):
        if not self.active_danmus:
            self._elapsed_timer.restart()
            return

        delta_seconds = min(self._elapsed_timer.restart() / 1000.0, 0.05)
        if delta_seconds <= 0:
            return

        next_items = []
        hide_boundary = self._horizontal_buffer - self._cleanup_margin
        for item in self.active_danmus:
            item.x -= item.speed * delta_seconds
            if item.x + item.width > hide_boundary:
                next_items.append(item)

        self.active_danmus = next_items
        self.update()

    def paintEvent(self, event):
        if not self.active_danmus:
            return

        painter = QPainter(self)
        painter.setRenderHint(QPainter.TextAntialiasing)
        painter.setFont(self._font)

        for item in self.active_danmus:
            text_rect = QRect(int(item.x), item.y, item.width, item.height)
            text_flags = Qt.AlignVCenter | Qt.TextSingleLine

            painter.setPen(self._outline_color)
            for offset_x, offset_y in self._outline_offsets:
                painter.drawText(text_rect.translated(offset_x, offset_y), text_flags, item.text)

            painter.setPen(item.text_color)
            painter.drawText(text_rect, text_flags, item.text)

    def clear(self):
        self.active_danmus = []
        self.update()
