const os = require("os");

const { runPowerShell } = require("../core/run-command");
const { formatBytes } = require("../core/format");

const HARDWARE_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$cs = Get-CimInstance Win32_ComputerSystem
$osInfo = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$bios = Get-CimInstance Win32_BIOS | Select-Object -First 1
$baseBoard = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object {
  [pscustomobject]@{
    Name = $_.Name
    AdapterRAM = if ($_.AdapterRAM) { [uint64]$_.AdapterRAM } else { 0 }
    CurrentHorizontalResolution = $_.CurrentHorizontalResolution
    CurrentVerticalResolution = $_.CurrentVerticalResolution
    CurrentRefreshRate = $_.CurrentRefreshRate
    VideoModeDescription = $_.VideoModeDescription
  }
})
$disks = @(Get-CimInstance Win32_DiskDrive | ForEach-Object {
  $drive = $_
  $letters = @()
  try {
    $partitions = @(Get-CimAssociatedInstance -InputObject $drive -ResultClassName Win32_DiskPartition)
    foreach ($partition in $partitions) {
      $logicalDisks = @(Get-CimAssociatedInstance -InputObject $partition -ResultClassName Win32_LogicalDisk)
      foreach ($logicalDisk in $logicalDisks) {
        if ($logicalDisk.DeviceID) { $letters += $logicalDisk.DeviceID }
      }
    }
  } catch {}
  [pscustomobject]@{
    Model = $drive.Model
    Manufacturer = $drive.Manufacturer
    Size = [int64]$drive.Size
    Status = $drive.Status
    DriveLetters = @($letters | Sort-Object -Unique)
  }
})
$memory = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
  [pscustomobject]@{
    Capacity = [int64]$_.Capacity
    Speed = $_.Speed
    Manufacturer = $_.Manufacturer
    DeviceLocator = $_.DeviceLocator
    BankLabel = $_.BankLabel
  }
})
$nics = @(Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled } | ForEach-Object {
  $config = $_
  $adapter = Get-CimInstance Win32_NetworkAdapter -Filter "Index = $($config.Index)" -ErrorAction SilentlyContinue | Select-Object -First 1
  [pscustomobject]@{
    Model = if ($adapter.Name) { $adapter.Name } else { $config.Description }
    MAC = $config.MACAddress
    IP = @($config.IPAddress | Where-Object { $_ -and $_ -notmatch ':' })
    Subnet = @($config.IPSubnet | Where-Object { $_ })
    Gateway = @($config.DefaultIPGateway | Where-Object { $_ })
    DNS = @($config.DNSServerSearchOrder | Where-Object { $_ })
    Speed = if ($adapter.Speed) { [uint64]$adapter.Speed } else { 0 }
  }
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
  CPUCurrentClock = $cpu.CurrentClockSpeed
  CPUMaxClock = $cpu.MaxClockSpeed
  BoardManufacturer = $baseBoard.Manufacturer
  BIOSVersion = $bios.SMBIOSBIOSVersion
  BIOSSerial = $bios.SerialNumber
  GPUs = $gpus
  Disks = $disks
  Memory = $memory
  NICs = $nics
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
    const stdout = await runPowerShell(HARDWARE_SCRIPT, 20000);
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
  const cpuClock = formatClockPair(raw.CPUCurrentClock, raw.CPUMaxClock);
  const cpuDetail = [raw.CPUCores ? `${raw.CPUCores}코어` : "", raw.CPULogical ? `${raw.CPULogical}스레드` : ""]
    .filter(Boolean)
    .join(" / ");

  return [
    {
      title: "기본 정보",
      items: [
        { label: "PC 이름", value: cleanText(raw.PCName) || os.hostname() },
        { label: "제조사", value: cleanText(raw.Manufacturer) },
        { label: "모델명", value: cleanText(raw.Model) },
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
        { label: "마지막 부팅일", value: cleanText(raw.LastBoot) },
      ],
    },
    {
      title: "CPU",
      items: [
        { label: "모델명", value: cleanText(raw.CPUName) },
        { label: "구성", value: cpuDetail || "확인 안 됨" },
        { label: "클럭 (현재/최대)", value: cpuClock },
      ],
    },
    {
      title: "RAM",
      items: [
        { label: "총 용량", value: formatBytes(raw.TotalMemory) },
        ...mapMemoryModules(raw.Memory),
      ],
    },
    {
      title: "VGA",
      items: mapGpus(raw.GPUs),
    },
    {
      title: "메인보드",
      items: [
        { label: "제조사", value: cleanText(raw.BoardManufacturer) },
        { label: "BIOS 버전", value: cleanText(raw.BIOSVersion) },
        { label: "BIOS 시리얼", value: cleanText(raw.BIOSSerial) },
      ],
    },
    {
      title: "저장장치",
      items: mapDisks(raw.Disks),
    },
    {
      title: "NIC",
      items: mapNics(raw.NICs),
    },
  ];
}

function mapMemoryModules(memory) {
  const modules = asArray(memory);
  if (modules.length === 0) {
    return [];
  }

  return modules.map((module, index) => {
    const speed = Number(module.Speed) ? `${module.Speed} MHz` : "";
    const maker = cleanText(module.Manufacturer);
    const slotName = cleanText(module.DeviceLocator) || cleanText(module.BankLabel) || `슬롯 ${index + 1}`;
    const detail = [formatBytes(module.Capacity), speed, maker].filter(Boolean).join(" · ");
    return { label: slotName, value: detail || "확인 안 됨" };
  });
}

function mapDisks(disks) {
  const list = asArray(disks);
  if (list.length === 0) {
    return [{ label: "저장장치", value: "확인 안 됨" }];
  }

  return list.map((disk, index) => ({
    label: `저장장치 ${index + 1}`,
    children: [
      { label: "모델명", value: cleanText(disk.Model) },
      { label: "제조사", value: cleanText(disk.Manufacturer) },
      { label: "용량", value: formatBytes(disk.Size) },
      { label: "현재상태", value: cleanText(disk.Status) },
      { label: "드라이브명", value: joinValues(disk.DriveLetters) },
    ],
  }));
}

function mapGpus(gpus) {
  const list = asArray(gpus);
  if (list.length === 0) {
    return [{ label: "모델명", value: "확인 안 됨" }];
  }

  return list.flatMap((gpu, index) => {
    const prefix = list.length > 1 ? ` ${index + 1}` : "";
    return [
      { label: `모델명${prefix}`, value: cleanText(gpu.Name) },
      { label: `VRAM${prefix}`, value: formatBytes(gpu.AdapterRAM) },
      { label: `클럭${prefix}`, value: "확인 안 됨" },
      { label: `온도${prefix}`, value: "확인 안 됨" },
      { label: `모니터 및 해상도${prefix}`, value: formatDisplay(gpu) },
    ];
  });
}

function mapNics(nics) {
  const list = asArray(nics);
  if (list.length === 0) {
    return [{ label: "NIC", value: "확인 안 됨" }];
  }

  return list.map((nic, index) => ({
    label: `NIC ${index + 1}`,
    children: [
      { label: "모델명", value: cleanText(nic.Model) },
      { label: "MAC", value: cleanText(nic.MAC) },
      { label: "IP", value: joinValues(nic.IP) },
      { label: "서브넷", value: joinValues(nic.Subnet) },
      { label: "게이트웨이", value: joinValues(nic.Gateway) },
      { label: "DNS", value: joinValues(nic.DNS) },
      { label: "링크속도", value: formatNetworkSpeed(nic.Speed) },
    ],
  }));
}

function formatClockPair(current, max) {
  const currentText = formatMhz(current);
  const maxText = formatMhz(max);
  if (currentText === "확인 안 됨" && maxText === "확인 안 됨") {
    return "확인 안 됨";
  }
  return `${currentText} / ${maxText}`;
}

function formatMhz(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return "확인 안 됨";
  }
  return `${(number / 1000).toFixed(2)} GHz`;
}

function formatDisplay(gpu) {
  const width = Number(gpu.CurrentHorizontalResolution);
  const height = Number(gpu.CurrentVerticalResolution);
  const refresh = Number(gpu.CurrentRefreshRate);
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return refresh > 0 ? `${width} x ${height} @ ${refresh}Hz` : `${width} x ${height}`;
  }
  return cleanText(gpu.VideoModeDescription) || "확인 안 됨";
}

function formatNetworkSpeed(value) {
  const bps = Number(value);
  if (!Number.isFinite(bps) || bps <= 0) {
    return "확인 안 됨";
  }

  if (bps >= 1000 ** 3) {
    return `${(bps / 1000 ** 3).toFixed(bps >= 10 * 1000 ** 3 ? 0 : 1)} Gbps`;
  }
  if (bps >= 1000 ** 2) {
    return `${(bps / 1000 ** 2).toFixed(0)} Mbps`;
  }
  return `${bps} bps`;
}

function joinValues(value) {
  const text = asArray(value).map(cleanText).filter(Boolean).join(", ");
  return text || "확인 안 됨";
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
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
        title: "CPU",
        items: [
          { label: "모델명", value: cleanText(cpu?.model) },
          { label: "구성", value: `${os.cpus()?.length ?? 0}스레드` },
        ],
      },
      {
        title: "RAM",
        items: [{ label: "총 용량", value: formatBytes(os.totalmem()) }],
      },
    ],
    messages: ["현재 Windows가 아니라서 기본 정보만 표시합니다. 자세한 사양은 Windows에서 확인할 수 있습니다."],
  };
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
