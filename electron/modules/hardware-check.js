const fs = require("fs");
const fsPromises = require("fs/promises");
const os = require("os");
const path = require("path");

const { app, BrowserWindow, dialog } = require("electron");

const { execFileAsync, runPowerShell } = require("../core/run-command");
const { formatBytes } = require("../core/format");

// 개발 중에는 프로젝트 루트의 tools/, 패키지에서는 resources/tools/ 를 사용한다.
const TOOLS_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "tools")
  : path.join(__dirname, "..", "..", "tools");
const SMARTCTL_CANDIDATES = [
  path.join(TOOLS_DIR, "smartctl", "smartctl.exe"),
  path.join(TOOLS_DIR, "smartmontools", "bin", "smartctl.exe"),
  "smartctl",
];
const SENSOR_HELPER_EXE = path.join(TOOLS_DIR, "hardware-probe", "MagicWandHardwareProbe.exe");
const SENSOR_HELPER_SCRIPT = path.join(TOOLS_DIR, "hardware-probe", "MagicWandHardwareProbe.ps1");
const NVIDIA_SMI_CANDIDATES = [
  process.env.NVIDIA_SMI_PATH,
  "nvidia-smi",
  path.join(process.env.ProgramFiles || "C:\\Program Files", "NVIDIA Corporation", "NVSMI", "nvidia-smi.exe"),
  path.join(process.env.ProgramW6432 || "C:\\Program Files", "NVIDIA Corporation", "NVSMI", "nvidia-smi.exe"),
  path.join(process.env.SystemRoot || "C:\\Windows", "System32", "nvidia-smi.exe"),
];
const CATEGORY_ORDER = {
  cpu: 0,
  ram: 1,
  vga: 2,
  ssd: 3,
  hdd: 4,
  nic: 5,
  os: 6,
  other: 7,
};

const CHECK_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$since3 = (Get-Date).AddDays(-3)
$since7 = (Get-Date).AddDays(-7)

$cpu = $null
try {
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1 | ForEach-Object {
    [pscustomobject]@{
      Name = [string]$_.Name
      Load = [int]$_.LoadPercentage
      CurrentClock = [int]$_.CurrentClockSpeed
      MaxClock = [int]$_.MaxClockSpeed
      Cores = [int]$_.NumberOfCores
      Threads = [int]$_.NumberOfLogicalProcessors
    }
  }
} catch {}

$disks = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
  $relatedDrives = @()
  try {
    $partitions = @(Get-CimAssociatedInstance -InputObject $_ -Association Win32_LogicalDiskToPartition -ErrorAction SilentlyContinue)
    foreach ($partition in $partitions) {
      $relatedDrives += @(Get-CimAssociatedInstance -InputObject $partition -Association Win32_DiskDriveToDiskPartition -ErrorAction SilentlyContinue)
    }
  } catch {}

  $drive = $relatedDrives | Select-Object -First 1
  [pscustomobject]@{
    Drive = $_.DeviceID
    Size = [int64]$_.Size
    Free = [int64]$_.FreeSpace
    Model = [string]$drive.Model
    MediaType = [string]$drive.MediaType
    InterfaceType = [string]$drive.InterfaceType
  }
})

$physical = @()
try {
  $physical = @(Get-PhysicalDisk | ForEach-Object {
    [pscustomobject]@{
      Name = $_.FriendlyName
      MediaType = [string]$_.MediaType
      Health = [string]$_.HealthStatus
      Operational = ($_.OperationalStatus -join ', ')
      Size = [int64]$_.Size
    }
  })
} catch {}

$osInfo = Get-CimInstance Win32_OperatingSystem
$battery = $null
$b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
if ($b) {
  $battery = [pscustomobject]@{ Charge = [int]$b.EstimatedChargeRemaining; Status = [int]$b.BatteryStatus }
}

$nics = @()
try {
  $nics = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue |
    Where-Object { $_.Status -ne 'Disabled' } |
    ForEach-Object {
      [pscustomobject]@{
        Name = [string]$_.Name
        Description = [string]$_.InterfaceDescription
        Status = [string]$_.Status
        LinkSpeed = [string]$_.LinkSpeed
        MacAddress = [string]$_.MacAddress
      }
    })
} catch {
  try {
    $nics = @(Get-CimInstance Win32_NetworkAdapter -Filter "PhysicalAdapter=True" -ErrorAction SilentlyContinue |
      Where-Object { $_.NetConnectionStatus -ne $null } |
      ForEach-Object {
        [pscustomobject]@{
          Name = [string]$_.NetConnectionID
          Description = [string]$_.Name
          Status = [string]$_.NetConnectionStatus
          LinkSpeed = ''
          MacAddress = [string]$_.MACAddress
        }
      })
  } catch {}
}

function Convert-Event($event) {
  [pscustomobject]@{
    Time = $event.TimeCreated.ToString('yyyy-MM-dd HH:mm')
    Provider = [string]$event.ProviderName
    Id = [int]$event.Id
  }
}

$storageEvents = @()
try {
  $storageEvents = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Level = 1, 2; StartTime = $since3 } -MaxEvents 300 -ErrorAction SilentlyContinue |
    Where-Object { $_.ProviderName -match 'disk|Ntfs|volmgr|storahci|stornvme|nvme|cdrom' } |
    Select-Object -First 8 |
    ForEach-Object { Convert-Event $_ })
} catch {}

$wheaEvents = @()
try {
  $wheaEvents = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WHEA-Logger'; StartTime = $since7 } -MaxEvents 12 -ErrorAction SilentlyContinue |
    Select-Object -First 8 |
    ForEach-Object { Convert-Event $_ })
} catch {}

$gpuEvents = @()
try {
  $gpuEvents = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Level = 1, 2, 3; StartTime = $since7 } -MaxEvents 500 -ErrorAction SilentlyContinue |
    Where-Object { $_.ProviderName -match 'Display|nvlddmkm|amdkmdag|amdwddmg|igfx|LiveKernelEvent' } |
    Select-Object -First 8 |
    ForEach-Object { Convert-Event $_ })
} catch {}

$powerEvents = @()
try {
  $powerEvents = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = 41; StartTime = $since7 } -MaxEvents 8 -ErrorAction SilentlyContinue |
    ForEach-Object { Convert-Event $_ })
} catch {}

$memoryEvents = @()
try {
  $memoryEvents = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-MemoryDiagnostics-Results'; StartTime = $since7 } -MaxEvents 4 -ErrorAction SilentlyContinue |
    ForEach-Object {
      [pscustomobject]@{
        Time = $_.TimeCreated.ToString('yyyy-MM-dd HH:mm')
        Provider = [string]$_.ProviderName
        Id = [int]$_.Id
        Message = [string]$_.Message
      }
    })
} catch {}

$thermalZones = @()
try {
  $thermalZones = @(Get-CimInstance -Namespace root/wmi MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue |
    ForEach-Object {
      $celsius = [math]::Round((($_.CurrentTemperature / 10) - 273.15), 1)
      if ($celsius -gt -20 -and $celsius -lt 130) {
        [pscustomobject]@{ Name = [string]$_.InstanceName; Celsius = [double]$celsius }
      }
    })
} catch {}

[pscustomobject]@{
  Cpu = $cpu
  Disks = $disks
  PhysicalDisks = $physical
  MemTotalKB = [int64]$osInfo.TotalVisibleMemorySize
  MemFreeKB = [int64]$osInfo.FreePhysicalMemory
  Battery = $battery
  Nics = $nics
  StorageEvents = $storageEvents
  WheaEvents = $wheaEvents
  GpuEvents = $gpuEvents
  PowerEvents = $powerEvents
  MemoryEvents = $memoryEvents
  ThermalZones = $thermalZones
} | ConvertTo-Json -Depth 6
`;

function register(ipcMain) {
  ipcMain.handle("hardware:check", async (event, runId) => checkHardware(createProgressSender(event, runId)));
  ipcMain.handle("hardware:save-check-text", async (event, payload) => saveCheckText(event, payload));
}

function createProgressSender(event, runId) {
  if (!event?.sender?.send) {
    return null;
  }

  return (payload) => event.sender.send("hardware:check-progress", { runId, ...payload });
}

async function saveCheckText(event, payload) {
  const body = String(payload?.text ?? "").trim();
  if (!body) {
    throw new Error("저장할 점검 내용이 없습니다.");
  }

  const window = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(window, {
    title: cleanText(payload?.title) || "점검 결과 TXT 저장",
    defaultPath: normalizeTextFileName(payload?.defaultPath) || `Check_Result_${getDateStamp()}.txt`,
    filters: [{ name: "Text File", extensions: ["txt"] }],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  await fsPromises.writeFile(result.filePath, `\uFEFF${body}\n`, "utf-8");
  return { canceled: false, filePath: result.filePath };
}

async function checkHardware(sendProgress = null) {
  if (process.platform !== "win32") {
    return fallbackCheck();
  }

  try {
    const progressTests = [];
    const progressMessages = [];
    const publish = () => publishProgress(sendProgress, progressTests, progressMessages);
    const raw = JSON.parse((await runPowerShell(CHECK_SCRIPT, 30000)).trim());
    progressTests.push(
      ...[
        evaluateCpu(raw.Cpu),
        ...evaluateDisks(raw.Disks),
        ...evaluatePhysicalDisks(raw.PhysicalDisks),
        evaluateMemory(raw.MemTotalKB, raw.MemFreeKB),
        ...evaluateBattery(raw.Battery),
        ...evaluateNics(raw.Nics),
        evaluateThermalZones(raw.ThermalZones),
        evaluateStorageEvents(raw.StorageEvents),
        evaluateWheaEvents(raw.WheaEvents),
        evaluateMemoryDiagnosticEvents(raw.MemoryEvents),
        evaluateGpuEvents(raw.GpuEvents),
        evaluatePowerEvents(raw.PowerEvents),
      ].filter(Boolean),
    );
    publish();

    const smartResult = await collectSmartTests();
    progressTests.push(...smartResult.tests);
    progressMessages.push(...smartResult.messages);
    publish();

    const sensorResult = await collectSensorHelperTests();
    progressTests.push(...sensorResult.tests);
    progressMessages.push(...sensorResult.messages);
    publish();

    const nvidiaResult = await collectNvidiaSmiTests();
    progressTests.push(...nvidiaResult.tests);
    progressMessages.push(...nvidiaResult.messages);
    publish();

    const tests = orderHardwareTests(progressTests);
    const messages = progressMessages.filter(Boolean);
    return { summary: summarize(tests), tests, messages };
  } catch (error) {
    return {
      summary: "하드웨어 점검을 끝내지 못했습니다.",
      tests: [],
      messages: [`하드웨어 정보를 읽지 못했습니다: ${error.message}`],
    };
  }
}

function evaluateCpu(cpu) {
  if (!cpu) {
    return {
      category: "cpu",
      name: "CPU 상태",
      status: "warn",
      detail: "CPU 정보를 찾지 못했습니다.",
      hint: "Windows 장치 관리자에서 CPU가 정상 인식되는지 확인해 주세요.",
    };
  }

  const load = Number(cpu.Load);
  const status = Number.isFinite(load) && load >= 95 ? "warn" : "ok";
  const detail = [
    cleanText(cpu.Name) || "이름 확인 안 됨",
    Number.isFinite(Number(cpu.Cores)) ? `${cpu.Cores}코어` : "",
    Number.isFinite(Number(cpu.Threads)) ? `${cpu.Threads}스레드` : "",
    Number.isFinite(Number(cpu.CurrentClock)) ? `현재 클럭 ${cpu.CurrentClock}MHz` : "",
    Number.isFinite(Number(cpu.MaxClock)) ? `최대 클럭 ${cpu.MaxClock}MHz` : "",
    Number.isFinite(load) ? `사용률 ${load}%` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    category: "cpu",
    name: "CPU 상태",
    status,
    detail,
    hint: status === "ok" ? "CPU가 정상적으로 인식되고 있습니다." : "CPU 사용률이 매우 높습니다. 실행 중인 작업을 확인해 주세요.",
  };
}

function evaluateDisks(disks) {
  const list = Array.isArray(disks) ? disks : [];
  if (list.length === 0) {
    return [
      {
        category: "ssd",
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
      category: inferStorageCategory(disk),
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
    const operational = cleanText(disk.Operational);
    const mediaType = cleanText(disk.MediaType);
    const healthy = health.toLowerCase() === "healthy";
    const detail = [`건강 상태: ${health}`, operational ? `동작 상태: ${operational}` : "", mediaType ? `종류: ${mediaType}` : ""]
      .filter(Boolean)
      .join(" · ");

    return {
      category: inferStorageCategory(disk),
      name: `디스크 상태 · ${cleanText(disk.Name) || "이름 확인 안 됨"}`,
      status: healthy ? "ok" : "warn",
      detail,
      hint: healthy
        ? "Windows가 디스크를 정상 상태로 보고합니다."
        : "중요한 자료를 먼저 백업하고 디스크 교체를 검토해 주세요.",
    };
  });
}

async function collectSmartTests() {
  const smartctl = await findExecutable(SMARTCTL_CANDIDATES);
  if (!smartctl) {
    return {
      tests: [],
      messages: ["SMART 상세 도구(smartctl.exe)가 없어 기본 디스크 상태만 확인했습니다."],
    };
  }

  try {
    const scan = await execJsonAllowError(smartctl, ["--scan-open", "-j"], 15000);
    const devices = Array.isArray(scan?.devices) ? scan.devices.slice(0, 10) : [];
    if (devices.length === 0) {
      return {
        tests: [],
        messages: ["SMART 상세 점검에서 확인할 디스크를 찾지 못했습니다."],
      };
    }

    const tests = [];
    const messages = [];
    for (const device of devices) {
      try {
        const args = ["-a", "-j"];
        if (device.type) {
          args.push("-d", String(device.type));
        }
        args.push(device.name);
        const report = await execJsonAllowError(smartctl, args, 15000);
        tests.push(evaluateSmartReport(report, device));
      } catch (error) {
        messages.push(`SMART 상세 점검 실패: ${cleanText(device.name) || "알 수 없는 디스크"} (${error.message})`);
      }
    }

    return { tests: tests.filter(Boolean), messages };
  } catch (error) {
    return {
      tests: [],
      messages: [`SMART 상세 점검을 실행하지 못했습니다: ${error.message}`],
    };
  }
}

function evaluateSmartReport(report, device) {
  const model =
    cleanText(report?.model_name) ||
    cleanText(report?.device?.model_name) ||
    cleanText(report?.scsi_model_name) ||
    cleanText(device?.info_name) ||
    cleanText(device?.name) ||
    "이름 확인 안 됨";
  const passed = report?.smart_status?.passed;
  const temp = Number(report?.temperature?.current ?? report?.nvme_smart_health_information_log?.temperature);
  const hours = Number(report?.power_on_time?.hours);
  const nvmeHealth = report?.nvme_smart_health_information_log ?? {};
  const percentUsed = Number(nvmeHealth.percentage_used);
  const mediaErrors = Number(nvmeHealth.media_errors);
  const toolErrors = arrayify(report?.smartctl?.messages)
    .filter((message) => cleanText(message.severity).toLowerCase() === "error")
    .map((message) => cleanText(message.string))
    .filter(Boolean);
  const warnings = [];
  const failures = [];

  if (toolErrors.length > 0) {
    warnings.push(`SMART 읽기 실패: ${toolErrors[0]}`);
  }
  if (passed === false) {
    failures.push("SMART 자체 판정 실패");
  }
  if (Number.isFinite(temp)) {
    if (temp >= 95) {
      failures.push(`온도 매우 높음(${temp}°C)`);
    } else if (temp >= 80) {
      warnings.push(`온도 높음(${temp}°C)`);
    }
  }
  if (Number.isFinite(percentUsed)) {
    if (percentUsed >= 100) {
      failures.push(`예상 수명 사용량 ${percentUsed}%`);
    } else if (percentUsed >= 80) {
      warnings.push(`예상 수명 사용량 ${percentUsed}%`);
    }
  }
  if (Number.isFinite(mediaErrors) && mediaErrors > 0) {
    warnings.push(`미디어 오류 ${mediaErrors}건`);
  }

  const attributes = getAtaAttributes(report);
  addAttributeFinding(attributes, "Current_Pending_Sector", failures, "대기 중인 불량 섹터");
  addAttributeFinding(attributes, "Offline_Uncorrectable", failures, "복구 불가 섹터");
  addAttributeFinding(attributes, "Reported_Uncorrect", warnings, "보고된 복구 불가 오류");
  addAttributeFinding(attributes, "Reallocated_Sector_Ct", warnings, "재배치된 섹터");
  addAttributeFinding(attributes, "UDMA_CRC_Error_Count", warnings, "케이블/전송 오류");

  const status = failures.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "ok";
  const detail = [
    cleanText(device?.name),
    passed === true ? "SMART: 정상" : passed === false ? "SMART: 이상" : "SMART: 판정 없음",
    Number.isFinite(temp) ? `온도: ${temp}°C` : "",
    Number.isFinite(hours) ? `사용 시간: ${hours.toLocaleString("ko-KR")}시간` : "",
    Number.isFinite(percentUsed) ? `수명 사용량: ${percentUsed}%` : "",
    ...failures,
    ...warnings,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    category: inferStorageCategory({ ...report, ...device, Model: model }),
    name: `SMART 상세 · ${model}`,
    status,
    detail,
    hint:
      status === "ok"
        ? "디스크 자체 진단값에서 큰 이상은 보이지 않습니다."
        : "중요 자료를 먼저 백업하고, 관리자 권한 실행 상태에서도 같은 경고가 반복되는지 확인해 주세요.",
  };
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
    category: "ram",
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
      category: "os",
      name: "배터리",
      status,
      detail: `현재 충전 ${Number.isFinite(charge) ? `${charge}%` : "확인 안 됨"} · 상태 코드 ${battery.Status}`,
      hint: status === "ok" ? "배터리 잔량은 충분합니다." : "충전기를 연결해 주세요.",
    },
  ];
}

function evaluateNics(nics) {
  const list = arrayify(nics).filter((nic) => cleanText(nic.Name) || cleanText(nic.Description));
  if (list.length === 0) {
    return [
      {
        category: "nic",
        name: "NIC 상태",
        status: "warn",
        detail: "물리 네트워크 어댑터 정보를 찾지 못했습니다.",
        hint: "장치 관리자에서 네트워크 어댑터가 정상 인식되는지 확인해 주세요.",
      },
    ];
  }

  return list.map((nic) => {
    const statusText = cleanText(nic.Status) || "Unknown";
    const isUp = statusText.toLowerCase() === "up" || statusText === "2";
    const detail = [
      cleanText(nic.Description),
      `상태: ${statusText}`,
      cleanText(nic.LinkSpeed) ? `속도: ${cleanText(nic.LinkSpeed)}` : "",
      cleanText(nic.MacAddress) ? `MAC: ${cleanText(nic.MacAddress)}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      category: "nic",
      name: `NIC 상태 · ${cleanText(nic.Name) || cleanText(nic.Description)}`,
      status: isUp ? "ok" : "warn",
      detail,
      hint: isUp ? "네트워크 어댑터가 연결 상태로 보고됩니다." : "사용하지 않는 포트라면 정상일 수 있고, 필요한 연결이라면 케이블과 어댑터 상태를 확인해 주세요.",
    };
  });
}

function evaluateThermalZones(thermalZones) {
  const zones = arrayify(thermalZones).filter((zone) => Number.isFinite(Number(zone.Celsius)));
  if (zones.length === 0) {
    return null;
  }

  const max = Math.max(...zones.map((zone) => Number(zone.Celsius)));
  const status = max >= 95 ? "fail" : max >= 85 ? "warn" : "ok";
  const lines = zones.slice(0, 4).map((zone) => `${cleanText(zone.Name) || "센서"} ${Number(zone.Celsius)}°C`);

  return {
    category: "os",
    name: "Windows 온도 센서",
    status,
    detail: lines.join(" · "),
    hint:
      status === "ok"
        ? "Windows가 제공한 온도값은 정상 범위입니다."
        : "온도가 높습니다. 먼지, 통풍, 팬 동작 상태를 확인해 주세요.",
  };
}

async function collectSensorHelperTests() {
  if (!fs.existsSync(SENSOR_HELPER_EXE) && !fs.existsSync(SENSOR_HELPER_SCRIPT)) {
    return {
      tests: [],
      messages: ["센서 보조 진단기(LibreHardwareMonitor 기반)가 아직 포함되지 않아 CPU 온도는 제한적으로 확인합니다."],
    };
  }

  try {
    const stdout = fs.existsSync(SENSOR_HELPER_EXE)
      ? (await execFileAsync(SENSOR_HELPER_EXE, ["--json"], { timeout: 15000, encoding: "utf8" })).stdout
      : await runPowerShell(`& '${escapePowerShellPath(SENSOR_HELPER_SCRIPT)}'`, 20000);
    const report = JSON.parse(stdout.trim());
    return { tests: evaluateSensorReport(report), messages: [] };
  } catch (error) {
    return {
      tests: [
        {
          category: "os",
          name: "센서 보조 진단",
          status: "warn",
          detail: "센서 보조 진단기를 실행하지 못했습니다.",
          hint: error.message,
        },
      ],
      messages: [],
    };
  }
}

function evaluateSensorReport(report) {
  const sensors = collectSensors(report);
  const temperatureSensors = sensors
    .filter((sensor) => /temperature/i.test(cleanText(sensor.type)))
    .filter((sensor) => Number.isFinite(Number(sensor.value)));

  if (temperatureSensors.length === 0) {
    return [];
  }

  const groups = new Map();
  for (const sensor of temperatureSensors) {
    const category = inferSensorCategory(sensor);
    const list = groups.get(category) ?? [];
    list.push(sensor);
    groups.set(category, list);
  }

  return [...groups.entries()].map(([category, group]) => {
    const limited = group.slice(0, 8);
    const max = Math.max(...limited.map((sensor) => Number(sensor.value)));
    const status = max >= 95 ? "fail" : max >= 85 ? "warn" : "ok";
    const detail = limited
      .map((sensor) => {
        const hardwareName = cleanText(sensor.hardwareName) || "센서";
        const sensorName = cleanText(sensor.name);
        return `${hardwareName}${sensorName ? ` ${sensorName}` : ""}: ${Number(sensor.value).toFixed(1)}°C`;
      })
      .join(" · ");

    return {
      category,
      name: `${categoryLabel(category)} 센서 온도`,
      status,
      detail,
      hint:
        status === "ok"
          ? "보조 진단기가 읽은 온도값은 정상 범위입니다."
          : "온도가 높습니다. 통풍, 팬, 장시간 고부하 작업 여부를 확인해 주세요.",
    };
  });
}

async function collectNvidiaSmiTests() {
  const nvidiaSmi = await findExecutable(NVIDIA_SMI_CANDIDATES);
  if (!nvidiaSmi) {
    return { tests: [], messages: [] };
  }

  try {
    const query = [
      "name",
      "temperature.gpu",
      "utilization.gpu",
      "memory.total",
      "memory.used",
      "power.draw",
      "clocks.current.graphics",
      "pstate",
    ].join(",");
    const { stdout } = await execFileAsync(
      nvidiaSmi,
      [`--query-gpu=${query}`, "--format=csv,noheader,nounits"],
      { timeout: 10000, encoding: "utf8" },
    );
    const tests = stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(evaluateNvidiaSmiRow);

    return { tests, messages: [] };
  } catch (error) {
    return {
      tests: [
        {
          category: "vga",
          name: "NVIDIA GPU 상태",
          status: "warn",
          detail: "nvidia-smi는 찾았지만 상태를 읽지 못했습니다.",
          hint: error.message,
        },
      ],
      messages: [],
    };
  }
}

function evaluateNvidiaSmiRow(line, index) {
  const [name, tempText, utilText, totalText, usedText, powerText, clockText, pstate] = line
    .split(",")
    .map((part) => part.trim());
  const temp = Number(tempText);
  const utilization = Number(utilText);
  const totalMemory = Number(totalText);
  const usedMemory = Number(usedText);
  const power = Number(powerText);
  const clock = Number(clockText);
  const memoryRatio = totalMemory > 0 ? usedMemory / totalMemory : 0;
  const status = temp >= 95 ? "fail" : temp >= 85 || memoryRatio >= 0.95 ? "warn" : "ok";
  const detail = [
    Number.isFinite(temp) ? `온도: ${temp}°C` : "",
    Number.isFinite(utilization) ? `사용률: ${utilization}%` : "",
    totalMemory > 0 ? `VRAM: ${usedMemory}MB / ${totalMemory}MB` : "",
    Number.isFinite(power) ? `전력: ${power}W` : "",
    Number.isFinite(clock) ? `클럭: ${clock}MHz` : "",
    pstate ? `상태: ${pstate}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    category: "vga",
    name: `NVIDIA GPU 상태 · ${cleanText(name) || `GPU ${index + 1}`}`,
    status,
    detail,
    hint:
      status === "ok"
        ? "NVIDIA 드라이버가 보고한 GPU 상태는 정상 범위입니다."
        : "GPU 온도나 메모리 사용량이 높습니다. 팬, 통풍, 실행 중인 그래픽 작업을 확인해 주세요.",
  };
}

function evaluateStorageEvents(events) {
  const list = arrayify(events);
  if (list.length === 0) {
    return {
      category: "ssd",
      name: "저장장치 오류 기록",
      status: "ok",
      detail: "최근 3일간 디스크·저장장치 관련 심각 오류 기록이 없습니다.",
      hint: "이벤트 로그에 큰 문제가 보이지 않습니다.",
    };
  }

  return eventTest("저장장치 오류 기록", list, "warn", "반복되는 오류라면 디스크 연결 상태와 SMART 값을 함께 확인해 주세요.", "ssd");
}

function evaluateWheaEvents(events) {
  const list = arrayify(events);
  if (list.length === 0) {
    return {
      category: "cpu",
      name: "CPU/RAM/WHEA 오류 기록",
      status: "ok",
      detail: "최근 7일간 WHEA 하드웨어 오류 기록이 없습니다.",
      hint: "CPU, RAM, PCIe 장치 쪽의 큰 오류 기록은 보이지 않습니다.",
    };
  }

  return eventTest("CPU/RAM/WHEA 오류 기록", list, "warn", "WHEA 오류가 반복되면 메모리 검사, 온도 확인, 장치 드라이버 점검이 필요합니다.", "cpu");
}

function evaluateMemoryDiagnosticEvents(events) {
  const list = arrayify(events);
  if (list.length === 0) {
    return {
      category: "ram",
      name: "Windows 메모리 진단 기록",
      status: "ok",
      detail: "최근 7일간 Windows 메모리 진단의 오류 결과가 없습니다.",
      hint: "최근에 메모리 진단을 실행하지 않았다면 기록이 없을 수 있습니다.",
    };
  }

  const failed = list.some((event) => /hardware problems|문제|오류|detected/i.test(cleanText(event.Message)));
  return eventTest(
    "Windows 메모리 진단 기록",
    list,
    failed ? "warn" : "ok",
    failed ? "메모리 진단에서 문제가 보이면 RAM 재장착 또는 교체 검토가 필요합니다." : "메모리 진단 결과에 오류 문구는 보이지 않습니다.",
    "ram",
  );
}

function evaluateGpuEvents(events) {
  const list = arrayify(events);
  if (list.length === 0) {
    return {
      category: "vga",
      name: "그래픽 드라이버 오류 기록",
      status: "ok",
      detail: "최근 7일간 그래픽 드라이버 관련 심각 오류 기록이 없습니다.",
      hint: "화면 깜빡임, 드라이버 재시작 같은 흔적은 보이지 않습니다.",
    };
  }

  return eventTest("그래픽 드라이버 오류 기록", list, "warn", "화면 꺼짐이나 드라이버 재시작이 반복되면 그래픽 드라이버와 온도를 확인해 주세요.", "vga");
}

function evaluatePowerEvents(events) {
  const list = arrayify(events);
  if (list.length === 0) {
    return {
      category: "os",
      name: "비정상 종료 기록",
      status: "ok",
      detail: "최근 7일간 갑작스러운 전원 차단 기록이 없습니다.",
      hint: "전원 쪽의 큰 이상 기록은 보이지 않습니다.",
    };
  }

  return eventTest("비정상 종료 기록", list, "warn", "갑작스러운 종료가 반복되면 전원 어댑터, 배터리, 과열 여부를 확인해 주세요.", "os");
}

function eventTest(name, list, status, hint, category = "os") {
  const lines = list.slice(0, 8).map((event) => `${event.Time} · ${cleanText(event.Provider)} (ID ${event.Id})`);
  return {
    category,
    name,
    status,
    detail: `${list.length}건의 관련 기록이 있습니다.\n${lines.join("\n")}`,
    hint,
  };
}

function orderHardwareTests(tests) {
  return tests
    .map((test, index) => ({ test, index }))
    .sort((left, right) => {
      const leftOrder = CATEGORY_ORDER[left.test.category] ?? CATEGORY_ORDER.other;
      const rightOrder = CATEGORY_ORDER[right.test.category] ?? CATEGORY_ORDER.other;
      return leftOrder - rightOrder || left.index - right.index;
    })
    .map(({ test }) => test);
}

function publishProgress(sendProgress, tests, messages) {
  if (!sendProgress) {
    return;
  }

  const orderedTests = orderHardwareTests(tests.filter(Boolean));
  sendProgress({
    summary: summarize(orderedTests),
    tests: orderedTests,
    messages: messages.filter(Boolean),
  });
}

function inferStorageCategory(value) {
  const text = [
    value?.MediaType,
    value?.media_type,
    value?.Model,
    value?.model_name,
    value?.Name,
    value?.name,
    value?.protocol,
    value?.InterfaceType,
  ]
    .map(cleanText)
    .join(" ")
    .toLowerCase();

  if (text.includes("hdd") || text.includes("rotational")) {
    return "hdd";
  }
  if (text.includes("ssd") || text.includes("nvme") || text.includes("solid state")) {
    return "ssd";
  }
  return "ssd";
}

function inferSensorCategory(sensor) {
  const text = [sensor?.hardwareType, sensor?.hardwareName, sensor?.name]
    .map(cleanText)
    .join(" ")
    .toLowerCase();

  if (text.includes("cpu") || text.includes("processor") || text.includes("core ultra") || text.includes("intel core")) {
    return "cpu";
  }
  if (text.includes("gpu") || text.includes("nvidia") || text.includes("radeon") || text.includes("graphics")) {
    return "vga";
  }
  if (text.includes("memory") || text.includes("ram")) {
    return "ram";
  }
  return "os";
}

function categoryLabel(category) {
  if (category === "cpu") {
    return "CPU";
  }
  if (category === "ram") {
    return "RAM";
  }
  if (category === "vga") {
    return "VGA";
  }
  if (category === "nic") {
    return "NIC";
  }
  return "OS";
}

function summarize(tests) {
  if (tests.some((test) => test.status === "fail")) {
    return "바로 조치가 필요한 항목이 있습니다. 아래 빨간 항목을 먼저 확인해 주세요.";
  }
  if (tests.some((test) => test.status === "warn")) {
    return "확인이 필요한 항목이 있습니다. 아래 주의 항목을 살펴봐 주세요.";
  }
  if (tests.length > 0) {
    return "하드웨어 점검은 정상입니다.";
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
        category: "ram",
        name: "메모리 사용량",
        status: usedRatio > 0.92 ? "warn" : "ok",
        detail: `${formatBytes(total - free)} 사용 중 / 전체 ${formatBytes(total)}`,
        hint: "자세한 디스크·배터리·오류 점검은 Windows에서 확인할 수 있습니다.",
      },
    ],
    messages: ["디스크 상태, 배터리, 오류 기록 점검은 Windows에서만 동작합니다."],
  };
}

async function findExecutable(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    if (looksLikePath(candidate)) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      continue;
    }

    try {
      const { stdout } = await execFileAsync("where.exe", [candidate], { timeout: 5000, encoding: "utf8" });
      const found = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (found) {
        return found;
      }
    } catch {}
  }

  return "";
}

function looksLikePath(value) {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.includes("\\") || value.includes("/");
}

function normalizeTextFileName(value) {
  const raw = path.basename(cleanText(value));
  if (!raw) {
    return "";
  }

  return raw.toLowerCase().endsWith(".txt") ? raw : `${raw}.txt`;
}

function getDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function escapePowerShellPath(value) {
  return String(value).replace(/'/g, "''");
}

async function execJsonAllowError(file, args, timeout) {
  try {
    const { stdout } = await execFileAsync(file, args, { timeout, encoding: "utf8" });
    return parseJsonOutput(stdout);
  } catch (error) {
    if (error.stdout) {
      return parseJsonOutput(error.stdout);
    }
    throw error;
  }
}

function parseJsonOutput(output) {
  const text = String(output ?? "").trim();
  if (!text) {
    throw new Error("도구가 빈 결과를 반환했습니다.");
  }
  return JSON.parse(text);
}

function getAtaAttributes(report) {
  const table = report?.ata_smart_attributes?.table;
  if (!Array.isArray(table)) {
    return new Map();
  }

  return new Map(
    table.map((attribute) => [
      cleanText(attribute.name),
      Number(attribute.raw?.value ?? String(attribute.raw?.string ?? "").replace(/[^\d].*$/, "")),
    ]),
  );
}

function addAttributeFinding(attributes, key, target, label) {
  const value = attributes.get(key);
  if (Number.isFinite(value) && value > 0) {
    target.push(`${label} ${value}건`);
  }
}

function collectSensors(report) {
  const sensors = [];

  function walk(node, hardwareName = "") {
    if (!node || typeof node !== "object") {
      return;
    }

    const ownHardwareName = cleanText(node.Name ?? node.name ?? node.HardwareName ?? node.hardwareName) || hardwareName;
    const ownSensors = node.Sensors ?? node.sensors;
    if (Array.isArray(ownSensors)) {
      for (const sensor of ownSensors) {
        sensors.push({
          name: sensor.Name ?? sensor.name,
          type: sensor.SensorType ?? sensor.sensorType ?? sensor.Type ?? sensor.type,
          value: sensor.Value ?? sensor.value,
          hardwareName: sensor.HardwareName ?? sensor.hardwareName ?? ownHardwareName,
        });
      }
    }

    const nested = node.Hardware ?? node.hardware ?? node.Children ?? node.children ?? node.SubHardware ?? node.subHardware;
    if (Array.isArray(nested)) {
      for (const child of nested) {
        walk(child, ownHardwareName);
      }
    }
  }

  walk(report);
  return sensors;
}

function arrayify(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
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
