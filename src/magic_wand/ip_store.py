from __future__ import annotations

from dataclasses import asdict, dataclass
import ipaddress
import json
from pathlib import Path


@dataclass
class IpRecord:
    name: str
    ip_address: str
    location: str = ""
    memo: str = ""

    @classmethod
    def from_dict(cls, data: dict) -> "IpRecord":
        return cls(
            name=str(data.get("name", "")).strip(),
            ip_address=normalize_ip(str(data.get("ip_address", "")).strip()),
            location=str(data.get("location", "")).strip(),
            memo=str(data.get("memo", "")).strip(),
        )

    def to_dict(self) -> dict:
        return asdict(self)


def normalize_ip(value: str) -> str:
    """Return a clean IP string or raise ValueError for invalid input."""
    if not value:
        raise ValueError("IP 주소를 입력해 주세요.")

    try:
        return str(ipaddress.ip_address(value))
    except ValueError as exc:
        raise ValueError("올바른 IP 주소 형식이 아닙니다.") from exc


class IpStore:
    def __init__(self, file_path: Path) -> None:
        self.file_path = file_path

    def load(self) -> list[IpRecord]:
        if not self.file_path.exists():
            return []

        with self.file_path.open("r", encoding="utf-8") as file:
            raw_records = json.load(file)

        if not isinstance(raw_records, list):
            raise ValueError("IP 목록 파일 형식이 올바르지 않습니다.")

        return [IpRecord.from_dict(item) for item in raw_records]

    def save(self, records: list[IpRecord]) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        raw_records = [record.to_dict() for record in records]

        with self.file_path.open("w", encoding="utf-8") as file:
            json.dump(raw_records, file, ensure_ascii=False, indent=2)
