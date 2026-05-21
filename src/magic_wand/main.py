from __future__ import annotations

from pathlib import Path
import sys

from PySide6.QtWidgets import QApplication

from magic_wand.ip_store import IpStore
from magic_wand.main_window import MainWindow


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName("Magic WAND")

    project_root = Path(__file__).resolve().parents[2]
    store = IpStore(project_root / "data" / "ip_records.json")

    window = MainWindow(store)
    window.resize(1100, 680)
    window.show()

    return app.exec()
