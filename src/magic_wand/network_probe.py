from __future__ import annotations

import base64
from dataclasses import dataclass
import ipaddress
import json
import platform
import socket
import subprocess
import urllib.request


@dataclass(frozen=True)
class NetworkInterface:
    name: str
    private_ip: str
    prefix_length: int | None
    network_range: str
    gateway: str = ""


@dataclass(frozen=True)
class NetworkInfo:
    public_ip: str
    private_interfaces: list[NetworkInterface]
    messages: list[str]


_PRIVATE_IPV4_NETWORKS = (
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
)


def scan_current_network() -> NetworkInfo:
    messages: list[str] = []
    interfaces: list[NetworkInterface] = []

    if platform.system() == "Windows":
        interfaces = _scan_windows_private_interfaces(messages)

    if not interfaces:
        fallback = _detect_primary_private_ip()
        if fallback:
            interfaces = [fallback]
            messages.append("IP 대역은 확인하지 못했고, 현재 사용 중인 사설 IP만 확인했습니다.")

    public_ip = _fetch_public_ip(messages)
    return NetworkInfo(
        public_ip=public_ip,
        private_interfaces=_dedupe_interfaces(interfaces),
        messages=messages,
    )


def _scan_windows_private_interfaces(messages: list[str]) -> list[NetworkInterface]:
    script = r"""
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$items = Get-NetIPConfiguration | ForEach-Object {
    $gateway = ''
    if ($_.IPv4DefaultGateway) {
        $gateway = ($_.IPv4DefaultGateway | Select-Object -First 1).NextHop
    }

    foreach ($addr in $_.IPv4Address) {
        if ($addr.IPAddress -and $null -ne $addr.PrefixLength -and $addr.IPAddress -ne '127.0.0.1') {
            [pscustomobject]@{
                InterfaceAlias = $_.InterfaceAlias
                InterfaceDescription = $_.InterfaceDescription
                InterfaceIndex = $_.InterfaceIndex
                IPAddress = $addr.IPAddress
                PrefixLength = [int]$addr.PrefixLength
                Gateway = $gateway
            }
        }
    }
}
$items | ConvertTo-Json -Depth 4
"""
    encoded_script = base64.b64encode(script.encode("utf-16le")).decode("ascii")
    command = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encoded_script,
    ]

    creation_flags = 0
    if hasattr(subprocess, "CREATE_NO_WINDOW"):
        creation_flags = subprocess.CREATE_NO_WINDOW

    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            creationflags=creation_flags,
            timeout=8,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        messages.append(f"윈도우 네트워크 정보를 읽지 못했습니다: {exc}")
        return []

    if completed.returncode != 0:
        detail = _decode_process_output(completed.stderr).strip()
        detail = detail or _decode_process_output(completed.stdout).strip()
        messages.append(f"윈도우 네트워크 정보를 읽지 못했습니다: {detail}")
        return []

    output = _decode_process_output(completed.stdout).strip()
    if not output:
        return []

    try:
        raw_items = json.loads(output)
    except json.JSONDecodeError as exc:
        messages.append(f"윈도우 네트워크 정보를 해석하지 못했습니다: {exc}")
        return []

    if isinstance(raw_items, dict):
        raw_items = [raw_items]

    interfaces: list[NetworkInterface] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue

        interface = _interface_from_windows_item(item, messages)
        if interface is not None:
            interfaces.append(interface)

    return interfaces


def _interface_from_windows_item(
    item: dict,
    messages: list[str],
) -> NetworkInterface | None:
    ip_text = str(item.get("IPAddress", "")).strip()
    prefix_text = str(item.get("PrefixLength", "")).strip()

    try:
        address = ipaddress.ip_address(ip_text)
        prefix_length = int(prefix_text)
    except ValueError:
        messages.append(f"{ip_text} 정보를 IP 주소로 해석하지 못했습니다.")
        return None

    if address.version != 4 or not _is_rfc1918_private(address):
        return None

    try:
        network = ipaddress.ip_network(f"{address}/{prefix_length}", strict=False)
    except ValueError:
        network_range = "대역 확인 실패"
    else:
        network_range = str(network)

    name = _pick_interface_name(item)

    return NetworkInterface(
        name=name,
        private_ip=str(address),
        prefix_length=prefix_length,
        network_range=network_range,
        gateway=str(item.get("Gateway", "")).strip(),
    )


def _detect_primary_private_ip() -> NetworkInterface | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            ip_text = sock.getsockname()[0]
    except OSError:
        return None

    try:
        address = ipaddress.ip_address(ip_text)
    except ValueError:
        return None

    if address.version != 4 or not _is_rfc1918_private(address):
        return None

    return NetworkInterface(
        name="기본 네트워크",
        private_ip=str(address),
        prefix_length=None,
        network_range="대역 확인 필요",
    )


def _fetch_public_ip(messages: list[str]) -> str:
    request = urllib.request.Request(
        "https://api.ipify.org?format=json",
        headers={"User-Agent": "Magic WAND"},
    )

    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, TimeoutError, json.JSONDecodeError) as exc:
        messages.append(f"공인 IP를 확인하지 못했습니다: {exc}")
        return ""

    ip_text = str(payload.get("ip", "")).strip()
    try:
        ipaddress.ip_address(ip_text)
    except ValueError:
        messages.append("공인 IP 응답 형식이 올바르지 않습니다.")
        return ""

    return ip_text


def _dedupe_interfaces(interfaces: list[NetworkInterface]) -> list[NetworkInterface]:
    seen: set[tuple[str, str]] = set()
    result: list[NetworkInterface] = []

    for interface in interfaces:
        key = (interface.private_ip, interface.network_range)
        if key in seen:
            continue
        seen.add(key)
        result.append(interface)

    return result


def _decode_process_output(data: bytes) -> str:
    if not data:
        return ""

    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        return data.decode("utf-16", errors="replace")

    if b"\x00" in data[:40]:
        return data.decode("utf-16-le", errors="replace")

    for encoding in ("utf-8-sig", "cp949", "mbcs"):
        try:
            return data.decode(encoding)
        except (LookupError, UnicodeDecodeError):
            continue

    return data.decode("utf-8", errors="replace")


def _pick_interface_name(item: dict) -> str:
    alias = _clean_display_text(str(item.get("InterfaceAlias", "")).strip())
    if alias:
        return alias

    description = _clean_display_text(str(item.get("InterfaceDescription", "")).strip())
    if description:
        return description

    interface_index = str(item.get("InterfaceIndex", "")).strip()
    if interface_index:
        return f"네트워크 {interface_index}"

    return "네트워크"


def _clean_display_text(value: str) -> str:
    if not value or "\ufffd" in value:
        return ""

    return "".join(char for char in value if char.isprintable()).strip()


def _is_rfc1918_private(address: ipaddress._BaseAddress) -> bool:
    return any(address in network for network in _PRIVATE_IPV4_NETWORKS)
