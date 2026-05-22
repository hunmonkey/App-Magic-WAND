const { runPowerShell } = require("../core/run-command");

const TIMEOUT = 20000;

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

async function listPrinters() {
  const result = await runJson(
    wrap(`
  $default = (Get-CimInstance -ClassName Win32_Printer -Filter "Default=True" | Select-Object -First 1).Name
  $list = Get-Printer | ForEach-Object {
    [pscustomobject]@{
      name      = $_.Name
      status    = "$($_.PrinterStatus)"
      driver    = $_.DriverName
      port      = $_.PortName
      shared    = [bool]$_.Shared
      isDefault = ($_.Name -eq $default)
    }
  }
  $out = @{ ok = $true; printers = @($list) }
`),
  );
  if (!result.ok) {
    throw new Error(result.error || "프린터 목록을 불러오지 못했습니다.");
  }
  return { printers: asArray(result.printers) };
}

async function testPage(name) {
  const result = await runJson(
    wrap(`
  $name = ${psQuote(name)}
  if (-not (Get-Printer -Name $name -ErrorAction SilentlyContinue)) { throw "프린터를 찾을 수 없습니다." }
  $arg = '/n"' + $name + '"'
  $proc = Start-Process -FilePath "$env:SystemRoot\\System32\\rundll32.exe" -ArgumentList @('printui.dll,PrintUIEntry','/k',$arg) -WindowStyle Hidden -Wait -PassThru
  Start-Sleep -Milliseconds 800
  $job = @(Get-PrintJob -PrinterName $name -ErrorAction SilentlyContinue)
  $out = @{ ok = $true; queued = ($job.Count -gt 0) }
`),
  );
  if (!result.ok) {
    throw new Error(result.error || "테스트 페이지 인쇄에 실패했습니다.");
  }
  return { queued: result.queued === true };
}

async function clearQueue(name) {
  const result = await runJson(
    wrap(`
  $jobs = @(Get-PrintJob -PrinterName ${psQuote(name)} -ErrorAction SilentlyContinue)
  $count = $jobs.Count
  if ($count -gt 0) { $jobs | Remove-PrintJob }
  $out = @{ ok = $true; removed = $count }
`),
  );
  if (!result.ok) {
    throw new Error(result.error || "대기 문서를 정리하지 못했습니다.");
  }
  return { removed: result.removed ?? 0 };
}

async function setDefault(name) {
  const result = await runJson(
    wrap(`
  $net = New-Object -ComObject WScript.Network
  $net.SetDefaultPrinter(${psQuote(name)})
  $out = @{ ok = $true }
`),
  );
  if (!result.ok) {
    throw new Error(result.error || "기본 프린터로 설정하지 못했습니다.");
  }
  return { ok: true };
}

async function restartSpooler() {
  const result = await runJson(
    wrap(`
  Restart-Service -Name Spooler -Force
  $out = @{ ok = $true }
`),
  );
  if (!result.ok) {
    throw new Error(result.error || "인쇄 스풀러를 재시작하지 못했습니다. 관리자 권한이 필요할 수 있습니다.");
  }
  return { ok: true };
}

function register(ipcMain) {
  ipcMain.handle("printer:list", listPrinters);
  ipcMain.handle("printer:testPage", (_event, name) => testPage(name));
  ipcMain.handle("printer:clearQueue", (_event, name) => clearQueue(name));
  ipcMain.handle("printer:setDefault", (_event, name) => setDefault(name));
  ipcMain.handle("printer:restartSpooler", () => restartSpooler());
}

module.exports = {
  register,
};
