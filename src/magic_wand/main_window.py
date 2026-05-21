from __future__ import annotations

from PySide6.QtCore import QObject, Qt, QThread, QTimer, Signal
from PySide6.QtWidgets import (
    QAbstractItemView,
    QApplication,
    QFormLayout,
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSizePolicy,
    QSplitter,
    QTableWidget,
    QTableWidgetItem,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from magic_wand.ip_store import IpRecord, IpStore, normalize_ip
from magic_wand.network_probe import NetworkInfo, scan_current_network


class NetworkScanWorker(QObject):
    finished = Signal(object)

    def run(self) -> None:
        try:
            info = scan_current_network()
        except Exception as exc:
            info = NetworkInfo(public_ip="", private_interfaces=[], messages=[str(exc)])

        self.finished.emit(info)


class MainWindow(QMainWindow):
    headers = ["이름", "IP 주소", "장소", "메모"]

    def __init__(self, store: IpStore) -> None:
        super().__init__()
        self.store = store
        self.records: list[IpRecord] = []
        self.selected_index: int | None = None
        self.network_scan_thread: QThread | None = None
        self.network_scan_worker: NetworkScanWorker | None = None

        self.setWindowTitle("Magic WAND")
        self._build_ui()
        self._connect_signals()
        self._load_records()
        QTimer.singleShot(0, self._scan_network)

    def _build_ui(self) -> None:
        root = QWidget()
        root_layout = QVBoxLayout(root)

        title = QLabel("Magic WAND")
        title.setObjectName("TitleLabel")
        root_layout.addWidget(title)

        splitter = QSplitter(Qt.Orientation.Horizontal)
        splitter.addWidget(self._build_form_panel())
        splitter.addWidget(self._build_table_panel())
        splitter.setSizes([340, 760])
        root_layout.addWidget(splitter, 1)

        self.setCentralWidget(root)
        self.statusBar().showMessage("준비됨")
        self._apply_style()

    def _build_form_panel(self) -> QWidget:
        panel = QWidget()
        panel.setMinimumWidth(300)
        layout = QVBoxLayout(panel)

        form = QFormLayout()
        self.name_input = QLineEdit()
        self.name_input.setPlaceholderText("예: 거실 공유기")
        self.ip_input = QLineEdit()
        self.ip_input.setPlaceholderText("예: 192.168.0.1")
        self.location_input = QLineEdit()
        self.location_input.setPlaceholderText("예: 거실")
        self.memo_input = QTextEdit()
        self.memo_input.setPlaceholderText("필요한 메모를 적어두세요.")
        self.memo_input.setFixedHeight(130)

        form.addRow("이름", self.name_input)
        form.addRow("IP 주소", self.ip_input)
        form.addRow("장소", self.location_input)
        form.addRow("메모", self.memo_input)
        layout.addLayout(form)

        button_row = QHBoxLayout()
        self.add_button = QPushButton("추가")
        self.update_button = QPushButton("수정")
        self.delete_button = QPushButton("삭제")
        self.clear_button = QPushButton("비우기")

        button_row.addWidget(self.add_button)
        button_row.addWidget(self.update_button)
        button_row.addWidget(self.delete_button)
        button_row.addWidget(self.clear_button)
        layout.addLayout(button_row)
        layout.addStretch()

        return panel

    def _build_table_panel(self) -> QWidget:
        panel = QWidget()
        layout = QVBoxLayout(panel)

        layout.addWidget(self._build_network_panel())

        search_row = QHBoxLayout()
        search_label = QLabel("검색")
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("이름, IP 주소, 장소, 메모 검색")
        search_row.addWidget(search_label)
        search_row.addWidget(self.search_input)
        layout.addLayout(search_row)

        self.table = QTableWidget(0, len(self.headers))
        self.table.setHorizontalHeaderLabels(self.headers)
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.verticalHeader().setVisible(False)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.table.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        layout.addWidget(self.table, 1)

        return panel

    def _build_network_panel(self) -> QWidget:
        group = QGroupBox("현재 네트워크 자동 조사")
        layout = QVBoxLayout(group)

        top_row = QHBoxLayout()
        self.network_status_label = QLabel("아직 조사하지 않았습니다.")
        self.network_status_label.setWordWrap(True)
        self.scan_button = QPushButton("다시 조사")
        top_row.addWidget(self.network_status_label, 1)
        top_row.addWidget(self.scan_button)
        layout.addLayout(top_row)

        grid = QGridLayout()
        self.public_ip_value = QLabel("확인 전")
        self.private_ip_value = QLabel("확인 전")
        self.network_range_value = QLabel("확인 전")

        for value_label in (
            self.public_ip_value,
            self.private_ip_value,
            self.network_range_value,
        ):
            value_label.setWordWrap(True)
            value_label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)

        grid.addWidget(QLabel("공인 IP"), 0, 0)
        grid.addWidget(self.public_ip_value, 0, 1)
        grid.addWidget(QLabel("사설 IP"), 1, 0)
        grid.addWidget(self.private_ip_value, 1, 1)
        grid.addWidget(QLabel("IP 대역"), 2, 0)
        grid.addWidget(self.network_range_value, 2, 1)
        grid.setColumnStretch(1, 1)
        layout.addLayout(grid)

        return group

    def _connect_signals(self) -> None:
        self.add_button.clicked.connect(self._add_record)
        self.update_button.clicked.connect(self._update_record)
        self.delete_button.clicked.connect(self._delete_record)
        self.clear_button.clicked.connect(self._clear_form)
        self.scan_button.clicked.connect(self._scan_network)
        self.search_input.textChanged.connect(self._refresh_table)
        self.table.itemSelectionChanged.connect(self._fill_form_from_selection)

    def _scan_network(self) -> None:
        if self.network_scan_thread is not None:
            return

        self.scan_button.setEnabled(False)
        self.network_status_label.setText("조사 중입니다...")
        self.public_ip_value.setText("확인 중")
        self.private_ip_value.setText("확인 중")
        self.network_range_value.setText("확인 중")
        QApplication.setOverrideCursor(Qt.CursorShape.WaitCursor)

        thread = QThread(self)
        worker = NetworkScanWorker()
        worker.moveToThread(thread)

        thread.started.connect(worker.run)
        worker.finished.connect(self._show_network_info)
        worker.finished.connect(thread.quit)
        worker.finished.connect(worker.deleteLater)
        thread.finished.connect(self._finish_network_scan)
        thread.finished.connect(thread.deleteLater)

        self.network_scan_thread = thread
        self.network_scan_worker = worker
        thread.start()

    def _show_network_info(self, info: NetworkInfo) -> None:
        self.public_ip_value.setText(info.public_ip or "확인 실패")

        if info.private_interfaces:
            private_lines = [
                f"{interface.name}: {interface.private_ip}"
                for interface in info.private_interfaces
            ]
            range_lines = []
            for interface in info.private_interfaces:
                gateway = f", 게이트웨이 {interface.gateway}" if interface.gateway else ""
                range_lines.append(f"{interface.name}: {interface.network_range}{gateway}")

            self.private_ip_value.setText("\n".join(private_lines))
            self.network_range_value.setText("\n".join(range_lines))
        else:
            self.private_ip_value.setText("확인된 사설 IP가 없습니다.")
            self.network_range_value.setText("확인된 IP 대역이 없습니다.")

        if info.messages:
            self.network_status_label.setText(" / ".join(info.messages))
        else:
            self.network_status_label.setText("조사 완료")

    def _finish_network_scan(self) -> None:
        QApplication.restoreOverrideCursor()
        self.scan_button.setEnabled(True)
        self.network_scan_thread = None
        self.network_scan_worker = None

    def closeEvent(self, event) -> None:
        if self.network_scan_thread is not None and self.network_scan_thread.isRunning():
            self.network_scan_thread.quit()
            self.network_scan_thread.wait(14000)

        super().closeEvent(event)

    def _load_records(self) -> None:
        try:
            self.records = self.store.load()
        except (OSError, ValueError) as exc:
            QMessageBox.warning(self, "불러오기 실패", str(exc))
            self.records = []

        self._refresh_table()
        self._update_buttons()

    def _save_records(self) -> bool:
        try:
            self.store.save(self.records)
        except OSError as exc:
            QMessageBox.warning(self, "저장 실패", f"IP 목록을 저장하지 못했습니다.\n\n{exc}")
            return False

        return True

    def _add_record(self) -> None:
        record = self._record_from_form()
        if record is None:
            return

        if self._find_ip_index(record.ip_address) is not None:
            QMessageBox.information(self, "중복 IP", "이미 등록된 IP 주소입니다.")
            return

        self.records.append(record)
        if self._save_records():
            self._clear_form()
            self._refresh_table()
            self.statusBar().showMessage("IP가 추가되었습니다.", 3000)

    def _update_record(self) -> None:
        if self.selected_index is None:
            QMessageBox.information(self, "선택 필요", "수정할 IP를 목록에서 선택해 주세요.")
            return

        record = self._record_from_form()
        if record is None:
            return

        duplicate_index = self._find_ip_index(record.ip_address)
        if duplicate_index is not None and duplicate_index != self.selected_index:
            QMessageBox.information(self, "중복 IP", "이미 등록된 IP 주소입니다.")
            return

        self.records[self.selected_index] = record
        if self._save_records():
            self._clear_form()
            self._refresh_table()
            self.statusBar().showMessage("IP가 수정되었습니다.", 3000)

    def _delete_record(self) -> None:
        if self.selected_index is None:
            QMessageBox.information(self, "선택 필요", "삭제할 IP를 목록에서 선택해 주세요.")
            return

        record = self.records[self.selected_index]
        answer = QMessageBox.question(
            self,
            "삭제 확인",
            f"{record.name} ({record.ip_address}) 항목을 삭제할까요?",
        )
        if answer != QMessageBox.StandardButton.Yes:
            return

        del self.records[self.selected_index]
        if self._save_records():
            self._clear_form()
            self._refresh_table()
            self.statusBar().showMessage("IP가 삭제되었습니다.", 3000)

    def _record_from_form(self) -> IpRecord | None:
        name = self.name_input.text().strip()
        ip_text = self.ip_input.text().strip()
        location = self.location_input.text().strip()
        memo = self.memo_input.toPlainText().strip()

        if not name:
            QMessageBox.information(self, "입력 필요", "이름을 입력해 주세요.")
            return None

        try:
            ip_address = normalize_ip(ip_text)
        except ValueError as exc:
            QMessageBox.information(self, "입력 확인", str(exc))
            return None

        return IpRecord(name=name, ip_address=ip_address, location=location, memo=memo)

    def _refresh_table(self) -> None:
        keyword = self.search_input.text().strip().lower()
        self.table.setRowCount(0)

        for index, record in enumerate(self.records):
            row_values = [record.name, record.ip_address, record.location, record.memo]
            haystack = " ".join(row_values).lower()
            if keyword and keyword not in haystack:
                continue

            row = self.table.rowCount()
            self.table.insertRow(row)
            for column, value in enumerate(row_values):
                item = QTableWidgetItem(value)
                item.setData(Qt.ItemDataRole.UserRole, index)
                self.table.setItem(row, column, item)

        self._update_buttons()

    def _fill_form_from_selection(self) -> None:
        selected_items = self.table.selectedItems()
        if not selected_items:
            self.selected_index = None
            self._update_buttons()
            return

        self.selected_index = selected_items[0].data(Qt.ItemDataRole.UserRole)
        record = self.records[self.selected_index]
        self.name_input.setText(record.name)
        self.ip_input.setText(record.ip_address)
        self.location_input.setText(record.location)
        self.memo_input.setPlainText(record.memo)
        self._update_buttons()

    def _clear_form(self) -> None:
        self.selected_index = None
        self.table.clearSelection()
        self.name_input.clear()
        self.ip_input.clear()
        self.location_input.clear()
        self.memo_input.clear()
        self._update_buttons()

    def _update_buttons(self) -> None:
        has_selection = self.selected_index is not None
        self.update_button.setEnabled(has_selection)
        self.delete_button.setEnabled(has_selection)

    def _find_ip_index(self, ip_address: str) -> int | None:
        for index, record in enumerate(self.records):
            if record.ip_address == ip_address:
                return index
        return None

    def _apply_style(self) -> None:
        self.setStyleSheet(
            """
            QWidget {
                font-size: 14px;
            }

            #TitleLabel {
                font-size: 24px;
                font-weight: 700;
                padding: 8px 0 12px 0;
            }

            QLineEdit,
            QTextEdit,
            QTableWidget {
                border: 1px solid #c8ccd2;
                border-radius: 6px;
                padding: 6px;
                background: #ffffff;
            }

            QPushButton {
                padding: 8px 12px;
                border-radius: 6px;
                border: 1px solid #aeb5bf;
                background: #f3f5f7;
            }

            QPushButton:hover {
                background: #e8edf3;
            }

            QPushButton:disabled {
                color: #8f98a3;
                background: #f0f1f2;
            }
            """
        )
