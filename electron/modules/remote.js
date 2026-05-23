const { app } = require("electron");
const fs = require("fs/promises");

const { getDataFileForRead } = require("../core/portable-data");
const { execFileAsync, runPowerShell, mapWithConcurrency } = require("../core/run-command");

const ACTIONS = new Set(["ping", "winrm", "inventory"]);

function normalizeAsset(entry) {
  return {
    id: String(entry?.id ?? "").trim(),
    assetTag: String(entry?.assetTag ?? "").trim(),
    name: String(entry?.name ?? "").trim(),
    ip: String(entry?.ip ?? "").trim(),
    location: String(entry?.location ?? "").trim(),
    owner: String(entry?.owner ?? "").trim(),
  };
}

async function loadTargets() {
  try {
    const text = await fs.readFile(await getDataFileForRead(app, "assets.json"), "utf-8");
    const list = JSON.parse(text);
    const targets = (Array.isArray(list) ? list : [])
      .map(normalizeAsset)
      .filter((item) => item.id && item.ip);
    return {
      targets,
      count: targets.length,
      messages: targets.length ? [] : ["자산 대장에 IP가 등록된 대상이 없습니다."],
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { targets: [], count: 0, messages: ["자산 대장이 아직 없습니다. 먼저 자산을 등록해 주세요."] };
    }
    throw error;
  }
}

async function run(event, payload = {}) {
  const action = String(payload.action || "").trim();
  if (!ACTIONS.has(action)) {
    throw new Error("지원하지 않는 원격 작업입니다.");
  }

  const selectedIds = new Set((payload.targetIds || []).map((id) => String(id || "").trim()).filter(Boolean));
  if (!selectedIds.size) {
    throw new Error("원격 작업 대상 PC를 선택해 주세요.");
  }

  const allTargets = (await loadTargets()).targets;
  const targets = allTargets.filter((target) => selectedIds.has(target.id));
  if (!targets.length) {
    throw new Error("선택한 대상 PC를 자산 대장에서 찾지 못했습니다.");
  }

  const jobId = String(payload.jobId || `remote-${Date.now()}`);
  let completed = 0;
  const results = await mapWithConcurrency(targets, 4, async (target, index) => {
    const result = await runTarget(action, target);
    completed += 1;
    sendResult(event, { jobId, index, completed, total: targets.length, ...result });
    return result;
  });

  return {
    jobId,
    action,
    total: targets.length,
    okCount: results.filter((item) => item.status === "ok").length,
    failCount: results.filter((item) => item.status === "fail").length,
    results,
  };
}

async function runTarget(action, target) {
  const base = { target, action, status: "fail", summary: "", detail: "" };
  if (!isSafeTarget(target.ip)) {
    return { ...base, summary: "대상 주소 확인 필요", detail: "IP 주소나 컴퓨터 이름에 허용되지 않은 문자가 있습니다." };
  }

  if (action === "ping") {
    return pingTarget(base);
  }
  if (action === "winrm") {
    return checkWinRm(base);
  }
  return readInventory(base);
}

async function pingTarget(base) {
  const args = process.platform === "win32"
    ? ["-n", "1", "-w", "900", base.target.ip]
    : ["-c", "1", "-W", "1", base.target.ip];
  try {
    await execFileAsync("ping", args, { timeout: 2500, encoding: "utf8" });
    return { ...base, status: "ok", summary: "응답 있음", detail: "ping 응답을 받았습니다." };
  } catch (error) {
    return {
      ...base,
      status: "fail",
      summary: "응답 없음",
      detail: "전원이 꺼져 있거나 방화벽에서 ping 응답을 막고 있을 수 있습니다.",
    };
  }
}

async function checkWinRm(base) {
  if (process.platform !== "win32") {
    return { ...base, summary: "Windows 전용", detail: "WinRM 확인은 Windows에서만 사용할 수 있습니다." };
  }

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$result = Test-NetConnection -ComputerName ${psQuote(base.target.ip)} -Port 5985 -InformationLevel Detailed
[pscustomobject]@{
  PingSucceeded = [bool]$result.PingSucceeded
  TcpTestSucceeded = [bool]$result.TcpTestSucceeded
  RemoteAddress = [string]$result.RemoteAddress
} | ConvertTo-Json -Depth 2
`;
  try {
    const output = (await runPowerShell(script, 15000)).trim();
    const result = output ? JSON.parse(output) : {};
    const tcpOk = result.TcpTestSucceeded === true;
    return {
      ...base,
      status: tcpOk ? "ok" : "fail",
      summary: tcpOk ? "WinRM 포트 열림" : "WinRM 포트 닫힘",
      detail: tcpOk
        ? "원격 PowerShell 통신 포트(5985)가 열려 있습니다."
        : "대상 PC에서 WinRM이 꺼져 있거나 방화벽에서 5985 포트를 막고 있을 수 있습니다.",
    };
  } catch (error) {
    return { ...base, summary: "WinRM 확인 실패", detail: error.message };
  }
}

async function readInventory(base) {
  if (process.platform !== "win32") {
    return { ...base, summary: "Windows 전용", detail: "원격 정보 조회는 Windows에서만 사용할 수 있습니다." };
  }

  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
Invoke-Command -ComputerName ${psQuote(base.target.ip)} -ScriptBlock {
  $cs = Get-CimInstance Win32_ComputerSystem
  $os = Get-CimInstance Win32_OperatingSystem
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  [pscustomobject]@{
    ComputerName = $env:COMPUTERNAME
    Manufacturer = [string]$cs.Manufacturer
    Model = [string]$cs.Model
    UserName = [string]$cs.UserName
    OsCaption = [string]$os.Caption
    OsVersion = [string]$os.Version
    LastBoot = $os.LastBootUpTime.ToString('yyyy-MM-dd HH:mm')
    Cpu = [string]$cpu.Name
    MemoryGB = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1)
  }
} | ConvertTo-Json -Depth 3
`;

  try {
    const output = (await runPowerShell(script, 30000)).trim();
    const data = output ? JSON.parse(output) : {};
    return {
      ...base,
      status: "ok",
      summary: data.ComputerName ? `${data.ComputerName} 정보 조회 성공` : "정보 조회 성공",
      detail: [
        data.OsCaption,
        data.Cpu,
        data.MemoryGB ? `RAM ${data.MemoryGB}GB` : "",
        data.LastBoot ? `부팅 ${data.LastBoot}` : "",
      ].filter(Boolean).join(" · "),
      data,
    };
  } catch (error) {
    return {
      ...base,
      summary: "원격 정보 조회 실패",
      detail: "WinRM, 권한, 방화벽, 대상 PC 전원 상태 중 하나가 맞지 않을 수 있습니다. " + error.message,
    };
  }
}

function isSafeTarget(value) {
  return /^[a-zA-Z0-9_.-]+$/.test(String(value || "").trim());
}

function psQuote(value) {
  return "'" + String(value ?? "").replace(/'/g, "''") + "'";
}

function sendResult(event, payload) {
  if (!event?.sender || event.sender.isDestroyed()) {
    return;
  }
  event.sender.send("remote:result", payload);
}

function register(ipcMain) {
  ipcMain.handle("remote:targets", () => loadTargets());
  ipcMain.handle("remote:run", (event, payload) => run(event, payload));
}

module.exports = {
  register,
};
