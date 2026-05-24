const { shell } = require("electron");
const { runPowerShell } = require("../core/run-command");

// 마지막 업데이트 설치일, 재부팅 필요 여부, 대기 중 업데이트 수를 한 번에 조회한다.
// 대기 중 업데이트 조회(COM)는 환경에 따라 실패할 수 있어 -1로 안전하게 처리한다.
const STATUS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$last = Get-HotFix | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 1
$lastDate = if ($last) { $last.InstalledOn.ToString('yyyy-MM-dd') } else { '' }
$lastId = if ($last) { [string]$last.HotFixID } else { '' }
$reboot = Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired'
$pending = -1
try {
  $session = New-Object -ComObject Microsoft.Update.Session
  $searcher = $session.CreateUpdateSearcher()
  $found = $searcher.Search('IsInstalled=0 and IsHidden=0')
  $pending = [int]$found.Updates.Count
} catch { $pending = -1 }
[pscustomobject]@{ lastDate = $lastDate; lastId = $lastId; rebootRequired = [bool]$reboot; pendingCount = $pending } | ConvertTo-Json -Compress
`;

function daysSince(dateStr) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  return Math.round((Date.now() - date.getTime()) / 86400000);
}

function evaluate(raw) {
  const lastDate = String(raw.lastDate || "").trim();
  const lastId = String(raw.lastId || "").trim();
  const rebootRequired = raw.rebootRequired === true;
  const pendingCount = Number.isFinite(raw.pendingCount) ? raw.pendingCount : -1;

  let level = "ok";
  let message = "업데이트 상태가 양호합니다.";
  const age = daysSince(lastDate);

  if (rebootRequired) {
    level = "warn";
    message = "업데이트 적용을 위해 재부팅이 필요합니다.";
  } else if (pendingCount > 0) {
    level = "warn";
    message = `설치 대기 중인 업데이트가 ${pendingCount}개 있습니다.`;
  } else if (age !== null && age > 60) {
    level = "warn";
    message = `마지막 업데이트가 ${age}일 전입니다. 업데이트를 확인해 주세요.`;
  } else if (!lastDate) {
    level = "warn";
    message = "마지막 업데이트 날짜를 확인하지 못했습니다.";
  }

  return {
    lastDate: lastDate || "확인 안 됨",
    lastId: lastId || "확인 안 됨",
    rebootRequired,
    pendingText: pendingCount < 0 ? "확인 불가" : `${pendingCount}개`,
    level,
    message,
  };
}

async function status() {
  const out = await runPowerShell(STATUS_SCRIPT, 90000);
  let raw;
  try {
    raw = JSON.parse(String(out).trim() || "{}");
  } catch {
    raw = {};
  }
  return evaluate(raw);
}

function openSettings() {
  shell.openExternal("ms-settings:windowsupdate").catch(() => {});
  return { ok: true };
}

function register(ipcMain) {
  ipcMain.handle("winUpdate:status", () => status());
  ipcMain.handle("winUpdate:open", () => openSettings());
}

module.exports = {
  register,
};
