const { runPowerShell } = require("../core/run-command");

// 복구(쓰기) 동작은 이 토큰이 있어야만 실행한다. 검사(읽기)는 토큰이 필요 없다.
const FIX_TOKEN = "recovery-fix-confirmed";

// 안전을 위해 이동식(USB/SD) 디스크만 대상으로 한다. 시스템 드라이브는 제외.
const VOLUMES_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$sys = $env:SystemDrive.TrimEnd(':')
$out = @()
foreach ($v in Get-Volume) {
  if (-not $v.DriveLetter) { continue }
  $letter = [string]$v.DriveLetter
  if ($letter -eq $sys) { continue }
  $bus = ''
  try {
    $part = Get-Partition -DriveLetter $v.DriveLetter -ErrorAction Stop
    $disk = Get-Disk -Number $part.DiskNumber -ErrorAction Stop
    $bus = [string]$disk.BusType
  } catch {}
  if ($v.DriveType -eq 'Removable' -or $bus -eq 'USB' -or $bus -eq 'SD') {
    $out += [pscustomobject]@{
      letter = $letter
      label = [string]$v.FileSystemLabel
      fs = [string]$v.FileSystem
      health = [string]$v.HealthStatus
      sizeGB = [math]::Round($v.Size / 1GB, 1)
      bus = $bus
    }
  }
}
$out | ConvertTo-Json -Compress
`;

const RESULT_KO = {
  NoErrorsFound: "오류가 발견되지 않았습니다.",
  NoErrorsNeedRescan: "다시 검사가 필요합니다.",
  ErrorsFound: "오류가 발견되었습니다. 복구(고치기)를 실행해 주세요.",
  ErrorsRepaired: "오류를 복구했습니다.",
  ScanRequired: "복구 전에 검사가 필요합니다.",
};

function toArray(parsed) {
  if (!parsed) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

function validLetter(letter) {
  return /^[A-Za-z]$/.test(String(letter || ""));
}

async function listVolumes() {
  const out = await runPowerShell(VOLUMES_SCRIPT, 30000);
  let parsed;
  try {
    parsed = JSON.parse(String(out).trim() || "[]");
  } catch {
    parsed = [];
  }
  return toArray(parsed)
    .filter((item) => item && item.letter)
    .map((item) => ({
      letter: String(item.letter),
      label: String(item.label || ""),
      fs: String(item.fs || ""),
      health: String(item.health || ""),
      sizeGB: Number(item.sizeGB) || 0,
      bus: String(item.bus || ""),
    }));
}

// 선택한 드라이브가 실제로 이동식 목록에 있는지 다시 확인한다. (시스템 디스크 보호)
async function assertRemovable(letter) {
  const volumes = await listVolumes();
  if (!volumes.some((volume) => volume.letter.toUpperCase() === String(letter).toUpperCase())) {
    throw new Error("이동식 디스크 목록에서 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.");
  }
}

async function checkFix(_event, payload = {}) {
  const { letter, mode } = payload;
  if (!validLetter(letter)) {
    throw new Error("올바른 드라이브가 아닙니다.");
  }
  await assertRemovable(letter);

  if (mode === "fix") {
    if (payload.token !== FIX_TOKEN) {
      throw new Error("복구 확인이 필요합니다.");
    }
    const out = await runPowerShell(
      `$ErrorActionPreference='Stop'; "$(Repair-Volume -DriveLetter ${letter} -OfflineScanAndFix)"`,
      300000,
    );
    return interpret(out);
  }

  // 기본은 읽기 전용 검사
  const out = await runPowerShell(
    `$ErrorActionPreference='Stop'; "$(Repair-Volume -DriveLetter ${letter} -Scan)"`,
    300000,
  );
  return interpret(out);
}

function interpret(out) {
  const code = String(out).trim();
  const known = RESULT_KO[code];
  return {
    code,
    message: known || (code ? `검사 결과: ${code}` : "결과를 확인하지 못했습니다."),
    healthy: code === "NoErrorsFound" || code === "ErrorsRepaired",
  };
}

function register(ipcMain) {
  ipcMain.handle("recovery:volumes", () => listVolumes());
  ipcMain.handle("recovery:checkFix", (event, payload) => checkFix(event, payload));
}

module.exports = {
  register,
};
