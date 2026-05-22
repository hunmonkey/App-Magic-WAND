const { dialog, BrowserWindow } = require("electron");
const os = require("os");
const nodePath = require("path");
const { runPowerShell } = require("../core/run-command");

const TIMEOUT = 20000;
const ELEVATED_TIMEOUT = 120000;

function psQuote(value) {
  return "'" + String(value ?? "").replace(/'/g, "''") + "'";
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}

async function runJson(script, timeout = TIMEOUT) {
  const output = await runPowerShell(script, timeout);
  const text = (output || "").trim();
  if (!text) {
    return { ok: false, error: "응답이 비어 있습니다." };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: "결과를 해석하지 못했습니다." };
  }
}

function isPermissionError(error) {
  return /access is denied|access denied|denied|privilege|administrator|관리자|권한/i.test(String(error || ""));
}

function makeTempJsonPath() {
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return nodePath.join(os.tmpdir(), `magic-wand-share-${suffix}.json`);
}

async function runElevatedJson(body) {
  const resultPath = makeTempJsonPath();
  const elevatedScript = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$ErrorActionPreference = 'Stop'
$resultPath = ${psQuote(resultPath)}
try {
${body}
  $out = @{ ok = $true }
} catch {
  $out = @{ ok = $false; error = $_.Exception.Message }
}
$out | ConvertTo-Json -Depth 4 -Compress | Set-Content -LiteralPath $resultPath -Encoding UTF8
if ($out['ok']) { exit 0 }
exit 1
`;
  const encoded = Buffer.from(elevatedScript, "utf16le").toString("base64");
  return runJson(
    wrap(`
  $resultPath = ${psQuote(resultPath)}
  Remove-Item -LiteralPath $resultPath -Force -ErrorAction SilentlyContinue
  $proc = Start-Process -FilePath "powershell.exe" -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', ${psQuote(encoded)}) -Verb RunAs -WindowStyle Hidden -Wait -PassThru
  if (Test-Path -LiteralPath $resultPath) {
    $text = Get-Content -LiteralPath $resultPath -Raw
    Remove-Item -LiteralPath $resultPath -Force -ErrorAction SilentlyContinue
    $out = $text | ConvertFrom-Json
  } elseif ($proc.ExitCode -eq 0) {
    $out = @{ ok = $true }
  } else {
    $out = @{ ok = $false; error = '관리자 권한 승인이 취소되었거나 작업이 실패했습니다.' }
  }
`),
    ELEVATED_TIMEOUT,
  );
}

async function runShareAction(body, fallbackError) {
  const result = await runJson(
    wrap(`
${body}
  $out = @{ ok = $true }
`),
  );
  if (result.ok) {
    return { ok: true };
  }
  if (!isPermissionError(result.error)) {
    throw new Error(result.error || fallbackError);
  }

  const elevatedResult = await runElevatedJson(body);
  if (!elevatedResult.ok) {
    throw new Error(elevatedResult.error || fallbackError);
  }
  return { ok: true };
}

function wrap(body) {
  return `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$ErrorActionPreference = 'Stop'
try {
${body}
} catch {
  $out = @{ ok = $false; error = $_.Exception.Message }
}
$out | ConvertTo-Json -Depth 4 -Compress
`;
}

async function listShares() {
  const result = await runJson(
    wrap(`
  $list = Get-SmbShare | ForEach-Object {
    [pscustomobject]@{
      name        = $_.Name
      path        = $_.Path
      description = $_.Description
      special     = [bool]$_.Special
    }
  }
  $out = @{ ok = $true; shares = @($list) }
`),
  );
  if (!result.ok) {
    throw new Error(result.error || "공유 목록을 불러오지 못했습니다.");
  }
  return { shares: asArray(result.shares) };
}

async function browseFolder() {
  const win = BrowserWindow.getFocusedWindow();
  const picked = await dialog.showOpenDialog(win, {
    title: "공유할 폴더 선택",
    properties: ["openDirectory"],
  });
  if (picked.canceled || !picked.filePaths.length) {
    return { path: "" };
  }
  return { path: picked.filePaths[0] };
}

async function createShare(payload) {
  const { name, path: folderPath, description, fullAccess } = payload || {};
  if (!name || !folderPath) {
    throw new Error("공유 이름과 폴더 경로를 입력해 주세요.");
  }
  const accessLine = fullAccess
    ? "-FullAccess 'Everyone'"
    : "-ReadAccess 'Everyone'";
  await runShareAction(
    `  New-SmbShare -Name ${psQuote(name)} -Path ${psQuote(folderPath)} -Description ${psQuote(description || "")} ${accessLine} | Out-Null`,
    "폴더 공유에 실패했습니다. 관리자 권한이 필요할 수 있습니다.",
  );
  return { ok: true };
}

async function removeShare(name) {
  if (!name) {
    throw new Error("중지할 공유를 선택해 주세요.");
  }
  await runShareAction(
    `  Remove-SmbShare -Name ${psQuote(name)} -Force`,
    "공유 중지에 실패했습니다. 관리자 권한이 필요할 수 있습니다.",
  );
  return { ok: true };
}

function register(ipcMain) {
  ipcMain.handle("share:list", listShares);
  ipcMain.handle("share:browse", browseFolder);
  ipcMain.handle("share:create", (_event, payload) => createShare(payload));
  ipcMain.handle("share:remove", (_event, name) => removeShare(name));
}

module.exports = {
  register,
};
