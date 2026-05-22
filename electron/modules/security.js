const fs = require("fs").promises;
const { dialog, BrowserWindow } = require("electron");
const { runPowerShell } = require("../core/run-command");

const TIMEOUT = 25000;

function psQuote(value) {
  return "'" + String(value ?? "").replace(/'/g, "''") + "'";
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}

async function runJson(script) {
  const output = await runPowerShell(script, TIMEOUT);
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

async function activation() {
  const result = await runJson(
    wrap(`
  $os = Get-CimInstance Win32_OperatingSystem
  $lic = Get-CimInstance SoftwareLicensingProduct -Filter "ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f' AND PartialProductKey IS NOT NULL" | Select-Object -First 1
  $statusText = switch ([int]$lic.LicenseStatus) {
    0 { '미인증' }
    1 { '정품 인증됨' }
    2 { '초기 유예 기간' }
    3 { '추가 유예 기간' }
    4 { '비정품 유예' }
    5 { '알림 모드' }
    6 { '연장 유예' }
    default { '확인 불가' }
  }
  $out = @{
    ok        = $true
    status    = $statusText
    edition   = $os.Caption
    version   = $os.Version
    build     = "$($os.BuildNumber)"
  }
`),
  );
  if (!result.ok) {
    throw new Error(result.error || "정품 인증 상태를 확인하지 못했습니다.");
  }
  return result;
}

async function bitlocker() {
  const result = await runJson(
    wrap(`
  if (-not (Get-Command Get-BitLockerVolume -ErrorAction SilentlyContinue)) {
    throw "이 PC에서 BitLocker 정보를 사용할 수 없습니다."
  }
  $list = Get-BitLockerVolume | ForEach-Object {
    [pscustomobject]@{
      mount   = $_.MountPoint
      status  = "$($_.ProtectionStatus)"
      percent = [int]$_.EncryptionPercentage
    }
  }
  $out = @{ ok = $true; volumes = @($list) }
`),
  );
  if (!result.ok) {
    if (/액세스|거부|denied|권한|elevat|administrator/i.test(result.error || "")) {
      throw new Error("드라이브 암호화 상태는 관리자 권한으로 실행해야 확인할 수 있습니다. 앱을 관리자 권한으로 실행한 뒤 다시 시도해 주세요.");
    }
    throw new Error(result.error || "드라이브 암호화 상태를 확인하지 못했습니다.");
  }
  return { volumes: asArray(result.volumes) };
}

async function productKey() {
  const result = await runJson(
    wrap(`
  function ConvertTo-WindowsKey {
    param([byte[]]$DigitalProductId)
    $map = 'BCDFGHJKMPQRTVWXY2346789'
    $offset = 52
    $bytes = $DigitalProductId[$offset..($offset + 14)]
    $isWin8 = [int](($bytes[14] -shr 3) -band 1)
    $bytes[14] = [byte](($bytes[14] -band 0xF7) -bor (($isWin8 -band 1) -shl 2))
    $chars = @()
    for ($i = 24; $i -ge 0; $i--) {
      $r = 0
      for ($j = 14; $j -ge 0; $j--) {
        $r = ($r -shl 8) -bor $bytes[$j]
        $bytes[$j] = [byte][math]::Floor($r / 24)
        $r = $r % 24
      }
      $chars = ,($map[$r]) + $chars
    }
    $keyStr = -join $chars
    if ($isWin8 -eq 1) {
      $last = $chars.Count - 1
      $keyStr = $keyStr.Remove(0, 1)
      $keyStr = $keyStr.Insert($last, 'N')
    }
    ($keyStr -replace '(.{5})(?=.)', '$1-')
  }
  $os = Get-CimInstance Win32_OperatingSystem
  $oem = (Get-CimInstance -ClassName SoftwareLicensingService).OA3xOriginalProductKey
  $key = ''
  $source = 'none'
  if ($oem) {
    $key = "$oem"
    $source = 'firmware'
  } else {
    try {
      $dpid = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion' -Name DigitalProductId -ErrorAction Stop).DigitalProductId
      if ($dpid) {
        $key = ConvertTo-WindowsKey ([byte[]]$dpid)
        $source = 'registry'
      }
    } catch { }
  }
  $out = @{ ok = $true; key = $key; source = $source; edition = $os.Caption }
`),
  );
  if (!result.ok) {
    throw new Error(result.error || "제품 키를 확인하지 못했습니다.");
  }
  return { key: result.key || "", source: result.source || "none", edition: result.edition || "" };
}

async function saveProductKeyText(event, text) {
  const body = String(text ?? "").trim();
  if (!body) {
    throw new Error("저장할 제품 키 내용이 없습니다.");
  }
  const window = BrowserWindow.fromWebContents(event.sender);
  const stamp = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog(window, {
    title: "운영체제 CD-KEY TXT 저장",
    defaultPath: `Windows_CDKEY_${stamp}.txt`,
    filters: [{ name: "Text File", extensions: ["txt"] }],
  });
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }
  await fs.writeFile(result.filePath, "﻿" + body + "\n", "utf-8");
  return { canceled: false, filePath: result.filePath };
}

async function localUsers() {
  const result = await runJson(
    wrap(`
  $list = Get-LocalUser | ForEach-Object {
    [pscustomobject]@{
      name        = $_.Name
      enabled     = [bool]$_.Enabled
      description = $_.Description
    }
  }
  $out = @{ ok = $true; users = @($list) }
`),
  );
  if (!result.ok) {
    throw new Error(result.error || "사용자 계정을 불러오지 못했습니다.");
  }
  return { users: asArray(result.users) };
}

async function browseFolder() {
  const win = BrowserWindow.getFocusedWindow();
  const picked = await dialog.showOpenDialog(win, {
    title: "대상 폴더 선택",
    properties: ["openDirectory"],
  });
  if (picked.canceled || !picked.filePaths.length) {
    return { path: "" };
  }
  return { path: picked.filePaths[0] };
}

async function setHidden(payload) {
  const { path, hidden } = payload || {};
  if (!path) {
    throw new Error("대상 폴더를 먼저 선택해 주세요.");
  }
  const flag = hidden ? "+h" : "-h";
  const result = await runJson(
    wrap(`
  $p = ${psQuote(path)}
  if (-not (Test-Path -LiteralPath $p)) { throw "경로를 찾을 수 없습니다." }
  & attrib ${flag} $p
  $out = @{ ok = $true }
`),
  );
  if (!result.ok) {
    throw new Error(result.error || "숨김 설정을 변경하지 못했습니다.");
  }
  return { ok: true };
}

function register(ipcMain) {
  ipcMain.handle("security:activation", () => activation());
  ipcMain.handle("security:bitlocker", () => bitlocker());
  ipcMain.handle("security:productKey", () => productKey());
  ipcMain.handle("security:saveProductKeyText", (event, text) => saveProductKeyText(event, text));
  ipcMain.handle("security:localUsers", () => localUsers());
  ipcMain.handle("security:browse", () => browseFolder());
  ipcMain.handle("security:setHidden", (_event, payload) => setHidden(payload));
}

module.exports = {
  register,
};
