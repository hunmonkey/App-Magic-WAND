const os = require("os");

const { runPowerShell } = require("../core/run-command");

const HARDWARE_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$cs = Get-CimInstance Win32_ComputerSystem
$osInfo = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$bios = Get-CimInstance Win32_BIOS | Select-Object -First 1
$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name })
$disks = @(Get-CimInstance Win32_DiskDrive | ForEach-Object {
  [pscustomobject]@{ Model = $_.Model; Size = [int64]$_.Size }
})
$memory = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
  [pscustomobject]@{ Capacity = [int64]$_.Capacity; Speed = $_.Speed; Manufacturer = $_.Manufacturer }
})
[pscustomobject]@{
  Manufacturer = $cs.Manufacturer
  Model = $cs.Model
  PCName = $env:COMPUTERNAME
  UserName = $cs.UserName
  TotalMemory = [int64]$cs.TotalPhysicalMemory
  OSCaption = $osInfo.Caption
  OSVersion = $osInfo.Version
  OSBuild = $osInfo.BuildNumber
  OSArch = $osInfo.OSArchitecture
  InstallDate = if ($osInfo.InstallDate) { $osInfo.InstallDate.ToString('yyyy-MM-dd') } else { '' }
  LastBoot = if ($osInfo.LastBootUpTime) { $osInfo.LastBootUpTime.ToString('yyyy-MM-dd HH:mm') } else { '' }
  CPUName = $cpu.Name
  CPUCores = $cpu.NumberOfCores
  CPULogical = $cpu.NumberOfLogicalProcessors
  CPUClock = $cpu.MaxClockSpeed
  BIOSVersion = $bios.SMBIOSBIOSVersion
  BIOSSerial = $bios.SerialNumber
  GPUs = $gpus
  Disks = $disks
  Memory = $memory
} | ConvertTo-Json -Depth 5
`;

const SOFTWARE_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$paths = @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$items = foreach ($p in $paths) {
  Get-ItemProperty $p -ErrorAction SilentlyContinue
}
$items |
  Where-Object { $_.DisplayName -and -not $_.SystemComponent } |
  Select-Object @{ N = 'Name'; E = { $_.DisplayName } },
    @{ N = 'Version'; E = { $_.DisplayVersion } },
    @{ N = 'Publisher'; E = { $_.Publisher } },
    @{ N = 'InstallDate'; E = { $_.InstallDate } } |
  Sort-Object Name -Unique |
  ConvertTo-Json -Depth 3
`;

function register(ipcMain) {
  ipcMain.handle("system:hardware", async () => getHardwareInfo());
  ipcMain.handle("system:software", async () => getSoftwareList());
}

async function getHardwareInfo() {
  if (process.platform !== "win32") {
    return fallbackHardware();
  }

  try {
    const stdout = await runPowerShell(HARDWARE_SCRIPT, 12000);
    const raw = JSON.parse(stdout.trim());
    return { groups: mapHardwareGroups(raw), messages: [] };
  } catch (error) {
    const fallback = fallbackHardware();
    return {
      groups: fallback.groups,
      messages: [`PC 사양을 자세히 읽지 못했습니다: ${error.message}`],
    };
  }
}

async function getSoftwareList() {
  if (process.platform !== "win32") {
    return {
      items: [],
      count: 0,
      messages: ["설치 소프트웨어 목록은 Windows에서만 조회할 수 있습니다."],
    };
  }

  try {
    const stdout = await runPowerShell(SOFTWARE_SCRIPT, 20000);
    const text = stdout.trim();
    if (!text) {
      return { items: [], count: 0, messages: ["설치된 소프트웨어를 찾지 못했습니다."] };
    }

    const raw = JSON.parse(text);
    const list = Array.isArray(raw) ? raw : [raw];
    const items = list
      .map((item) => ({
        name: cleanText(item.Name),
        version: cleanText(item.Version),
        publisher: cleanText(item.Publisher),
        installDate: formatInstallDate(item.InstallDate),
      }))
      .filter((item) => item.name);

    return { items, count: items.length, messages: [] };
  } catch (error) {
    return { items: [], count: 0, messages: [`설치 소프트웨어 목록을 읽지 못했습니다: ${error.message}`] };
  }
}

function mapHardwareGroups(raw) {
  const cpuClock = Number(raw.CPUClock) ? `${(Number(raw.CPUClock) / 1000).toFixed(2)} GHz` : "확인 안 됨";
  const cpuDetail = [raw.CPUCores ? `${raw.CPUCores}코어` : "", raw.CPULogical ? `${raw.CPULogical}스레드` : ""]
    .filter(Boolean)
    .join(" / ");

  return [
    {
      title: "기본 정보",
      items: [
        { label: "PC 이름", value: cleanText(raw.PCName) || os.hostname() },
        { label: "제조사", value: cleanText(raw.Manufacturer) },
        { label: "모델", value: cleanText(raw.Model) },
        { label: "로그인 사용자", value: cleanText(raw.UserName) },
      ],
    },
    {
      title: "운영체제",
      items: [
        { label: "이름", value: cleanText(raw.OSCaption) },
        { label: "버전", value: [cleanText(raw.OSVersion), cleanText(raw.OSArch)].filter(Boolean).join(" · ") },
        { label: "빌드", value: cleanText(raw.OSBuild) },
        { label: "설치일", value: cleanText(raw.InstallDate) },
        { label: "마지막 부팅", value: cleanText(raw.LastBoot) },
      ],
    },
    {
      title: "프로세서",
      items: [
        { label: "CPU", value: cleanText(raw.CPUName) },
        { label: "구성", value: cpuDetail || "확인 안 됨" },
        { label: "최대 클럭", value: cpuClock },
      ],
    },
    {
      title: "메모리",
      items: [
        { label: "총 용량", value: formatBytes(raw.TotalMemory) },
        ...mapMemoryModules(raw.Memory),
      ],
    },
    {
      title: "저장장치",
      items: mapDisks(raw.Disks),
    },
    {
      title: "그래픽 · BIOS",
      items: [
        { label: "그래픽", value: mapGpuNames(raw.GPUs) },
        { label: "BIOS 버전", value: cleanText(raw.BIOSVersion) },
        { label: "BIOS 시리얼", value: cleanText(raw.BIOSSerial) },
      ],
    },
  ];
}

function mapMemoryModules(memory) {
  const modules = Array.isArray(memory) ? memory : [];
  if (modules.length === 0) {
    return [];
  }

  return modules.map((module, index) => {
    const speed = Number(module.Speed) ? `${module.Speed} MHz` : "";
    const maker = cleanText(module.Manufacturer);
    const detail = [formatBytes(module.Capacity), speed, maker].filter(Boolean).join(" · ");
    return { label: `슬롯 ${index + 1}`, value: detail || "확인 안 됨" };
  });
}

function mapDisks(disks) {
  const list = Array.isArray(disks) ? disks : [];
  if (list.length === 0) {
    return [{ label: "디스크", value: "확인 안 됨" }];
  }

  return list.map((disk, index) => ({
    label: `디스크 ${index + 1}`,
    value: [cleanText(disk.Model), formatBytes(disk.Size)].filter(Boolean).join(" · ") || "확인 안 됨",
  }));
}

function mapGpuNames(gpus) {
  const names = (Array.isArray(gpus) ? gpus : [gpus])
    .map((name) => cleanText(name))
    .filter(Boolean);
  return names.length ? names.join(", ") : "확인 안 됨";
}

function fallbackHardware() {
  const cpu = os.cpus()?.[0];
  return {
    groups: [
      {
        title: "기본 정보",
        items: [
          { label: "PC 이름", value: os.hostname() },
          { label: "운영체제", value: `${os.type()} ${os.release()}` },
        ],
      },
      {
        title: "프로세서",
        items: [
          { label: "CPU", value: cleanText(cpu?.model) },
          { label: "논리 프로세서", value: String(os.cpus()?.length ?? 0) },
        ],
      },
      {
        title: "메모리",
        items: [{ label: "총 용량", value: formatBytes(os.totalmem()) }],
      },
    ],
    messages: ["현재 Windows가 아니라서 기본 정보만 표시합니다. 자세한 사양은 Windows에서 확인할 수 있습니다."],
  };
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "확인 안 됨";
  }

  const gb = bytes / 1024 ** 3;
  if (gb >= 1024) {
    return `${(gb / 1024).toFixed(2)} TB`;
  }
  return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
}

function formatInstallDate(value) {
  const text = String(value ?? "").trim();
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }
  return text;
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
