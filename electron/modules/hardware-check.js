const os = require("os");

const { runPowerShell } = require("../core/run-command");
const { formatBytes } = require("../core/format");

const CHECK_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$disks = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
  [pscustomobject]@{ Drive = $_.DeviceID; Size = [int64]$_.Size; Free = [int64]$_.FreeSpace }
})
$physical = @()
try {
  $physical = @(Get-PhysicalDisk | ForEach-Object {
    [pscustomobject]@{ Name = $_.FriendlyName; Health = [string]$_.HealthStatus; Operational = ($_.OperationalStatus -join ', ') }
  })
} catch {}
$osInfo = Get-CimInstance Win32_OperatingSystem
$battery = $null
$b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
if ($b) {
  $battery = [pscustomobject]@{ Charge = [int]$b.EstimatedChargeRemaining; Status = [int]$b.BatteryStatus }
}
$events = @()
try {
  $since = (Get-Date).AddDays(-3)
  $events = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Level = 1, 2; StartTime = $since } -MaxEvents 200 -ErrorAction SilentlyContinue |
    Where-Object { $_.ProviderName -match 'disk|Ntfs|volmgr|storahci|stornvme|nvme|Kernel-PnP|WHEA|cdrom' } |
    Select-Object -First 8 |
    ForEach-Object {
      [pscustomobject]@{ Time = $_.TimeCreated.ToString('yyyy-MM-dd HH:mm'); Provider = [string]$_.ProviderName; Id = [int]$_.Id }
    })
} catch {}
[pscustomobject]@{
  Disks = $disks
  PhysicalDisks = $physical
  MemTotalKB = [int64]$osInfo.TotalVisibleMemorySize
  MemFreeKB = [int64]$osInfo.FreePhysicalMemory
  Battery = $battery
  Events = $events
} | ConvertTo-Json -Depth 5
`;

function register(ipcMain) {
  ipcMain.handle("hardware:check", async () => checkHardware());
}

async function checkHardware() {
  if (process.platform !== "win32") {
    return fallbackCheck();
  }

  try {
    const raw = JSON.parse((await runPowerShell(CHECK_SCRIPT, 20000)).trim());
    const tests = [
      ...evaluateDisks(raw.Disks),
      ...evaluatePhysicalDisks(raw.PhysicalDisks),
      evaluateMemory(raw.MemTotalKB, raw.MemFreeKB),
      ...evaluateBattery(raw.Battery),
      evaluateEvents(raw.Events),
    ].filter(Boolean);

    return { summary: summarize(tests), tests, messages: [] };
  } catch (error) {
    return {
      summary: "하드웨어 점검을 끝내지 못했습니다.",
      tests: [],
      messages: [`하드웨어 정보를 읽지 못했습니다: ${error.message}`],
    };
  }
}

function evaluateDisks(disks) {
  const list = Array.isArray(disks) ? disks : [];
  if (list.length === 0) {
    return [
      {
        name: "디스크 여유 공간",
        status: "warn",
        detail: "고정 디스크 정보를 찾지 못했습니다.",
        hint: "디스크 연결 상태를 확인해 주세요.",
      },
    ];
  }

  return list.map((disk) => {
    const size = Number(disk.Size);
    const free = Number(disk.Free);
    const ratio = size > 0 ? free / size : 0;
    const percent = Math.round(ratio * 100);
    const status = ratio < 0.05 ? "fail" : ratio < 0.12 ? "warn" : "ok";

    return {
      name: `${disk.Drive} 여유 공간`,
      status,
      detail: `${formatBytes(free)} 남음 (전체 ${formatBytes(size)} 중 ${percent}%)`,
      hint:
        status === "ok"
          ? "여유 공간은 넉넉합니다."
          : "임시 파일 정리, 큰 파일 이동, 디스크 정리를 검토해 주세요.",
    };
  });
}

function evaluatePhysicalDisks(physical) {
  const list = Array.isArray(physical) ? physical : [];
  if (list.length === 0) {
    return [];
  }

  return list.map((disk) => {
    const health = cleanText(disk.Health) || "Unknown";
    const healthy = health.toLowerCase() === "healthy";

    return {
      name: `디스크 상태 · ${cleanText(disk.Name) || "이름 확인 안 됨"}`,
      status: healthy ? "ok" : "warn",
      detail: `건강 상태: ${health}${disk.Operational ? ` (${cleanText(disk.Operational)})` : ""}`,
      hint: healthy
        ? "디스크가 정상 상태로 보고됩니다."
        : "중요한 자료를 먼저 백업하고 디스크 교체를 검토해 주세요.",
    };
  });
}

function evaluateMemory(totalKb, freeKb) {
  const total = Number(totalKb) * 1024;
  const free = Number(freeKb) * 1024;
  if (!(total > 0)) {
    return null;
  }

  const usedRatio = (total - free) / total;
  const percent = Math.round(usedRatio * 100);
  const status = usedRatio > 0.92 ? "warn" : "ok";

  return {
    name: "메모리 사용량",
    status,
    detail: `${formatBytes(total - free)} 사용 중 / 전체 ${formatBytes(total)} (${percent}%)`,
    hint:
      status === "ok"
        ? "메모리 여유가 있습니다."
        : "사용량이 높습니다. 무거운 프로그램을 정리하면 빨라질 수 있습니다.",
  };
}

function evaluateBattery(battery) {
  if (!battery) {
    return [];
  }

  const charge = Number(battery.Charge);
  const status = charge > 0 && charge < 20 ? "warn" : "ok";

  return [
    {
      name: "배터리",
      status,
      detail: `현재 충전 ${Number.isFinite(charge) ? `${charge}%` : "확인 안 됨"} · 상태 코드 ${battery.Status}`,
      hint: status === "ok" ? "배터리 잔량은 충분합니다." : "충전기를 연결해 주세요.",
    },
  ];
}

function evaluateEvents(events) {
  const list = Array.isArray(events) ? events : [];
  if (list.length === 0) {
    return {
      name: "최근 하드웨어 오류 기록",
      status: "ok",
      detail: "최근 3일간 디스크·하드웨어 관련 오류 기록이 없습니다.",
      hint: "이벤트 로그에 큰 문제가 보이지 않습니다.",
    };
  }

  const lines = list.map((event) => `${event.Time} · ${cleanText(event.Provider)} (ID ${event.Id})`);
  return {
    name: "최근 하드웨어 오류 기록",
    status: "warn",
    detail: `최근 3일간 ${list.length}건의 관련 오류가 있습니다.\n${lines.join("\n")}`,
    hint: "반복되는 오류라면 해당 장치(디스크 등)의 연결과 상태를 점검해 주세요.",
  };
}

function summarize(tests) {
  if (tests.some((test) => test.status === "fail")) {
    return "바로 조치가 필요한 항목이 있습니다. 아래 빨간 항목을 먼저 확인해 주세요.";
  }
  if (tests.some((test) => test.status === "warn")) {
    return "확인이 필요한 항목이 있습니다. 아래 주의 항목을 살펴봐 주세요.";
  }
  if (tests.length > 0) {
    return "기본 하드웨어 점검은 정상입니다.";
  }
  return "점검할 항목을 찾지 못했습니다.";
}

function fallbackCheck() {
  const total = os.totalmem();
  const free = os.freemem();
  const usedRatio = total > 0 ? (total - free) / total : 0;

  return {
    summary: "현재 Windows가 아니라서 메모리 정보만 확인했습니다.",
    tests: [
      {
        name: "메모리 사용량",
        status: usedRatio > 0.92 ? "warn" : "ok",
        detail: `${formatBytes(total - free)} 사용 중 / 전체 ${formatBytes(total)}`,
        hint: "자세한 디스크·배터리·오류 점검은 Windows에서 확인할 수 있습니다.",
      },
    ],
    messages: ["디스크 상태, 배터리, 오류 기록 점검은 Windows에서만 동작합니다."],
  };
}

function cleanText(value) {
  const text = String(value ?? "").trim();
  if (!text || text.includes("\uFFFD")) {
    return "";
  }
  return text;
}

module.exports = {
  register,
};
