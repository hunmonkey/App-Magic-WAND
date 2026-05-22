"use strict";
const { runPowerShell } = require("../core/run-command");
const os = require("os");

const GET_ADAPTERS_SCRIPT = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$list = @(Get-NetAdapter | Sort-Object Status,Name | ForEach-Object {
  $idx = $_.InterfaceIndex
  $ip  = Get-NetIPAddress  -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1
  $gw  = Get-NetRoute      -InterfaceIndex $idx -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1
  $if  = Get-NetIPInterface -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction SilentlyContinue
  $dns = @(Get-DnsClientServerAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ServerAddresses)
  $ip6 = Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv6 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^fe80' -and $_.IPAddress -ne '::1' } | Select-Object -First 1
  [pscustomobject]@{
    name        = $_.Name
    description = $_.InterfaceDescription
    status      = [string]$_.Status
    mac         = $_.MacAddress
    ip          = if ($ip) { $ip.IPAddress }         else { '' }
    prefix      = if ($ip) { [int]$ip.PrefixLength } else { 0 }
    gateway     = if ($gw) { $gw.NextHop }           else { '' }
    dns         = ($dns -join ',')
    dhcp        = if ($if) { $if.Dhcp -eq 'Enabled' } else { $true }
    ipv6        = if ($ip6) { $ip6.IPAddress }        else { '' }
  }
})
ConvertTo-Json -InputObject $list -Compress
`.trim();

const GET_COMPUTER_NAME_SCRIPT = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
(Get-CimInstance Win32_ComputerSystem).Name`;

async function getNetworkAdapters() {
  if (process.platform !== "win32") {
    return { adapters: fallbackAdapters(), messages: ["Windows 전용 기능입니다."] };
  }
  try {
    const raw = (await runPowerShell(GET_ADAPTERS_SCRIPT, 15000)).trim();
    if (!raw) return { adapters: [], messages: ["어댑터 정보를 가져올 수 없습니다."] };
    const parsed = JSON.parse(raw);
    const adapters = Array.isArray(parsed) ? parsed : [parsed];
    return { adapters, messages: [] };
  } catch (err) {
    return { adapters: [], messages: [`조회 실패: ${err.message}`] };
  }
}

async function applyNetworkConfig(adapterName, config) {
  if (process.platform !== "win32") throw new Error("Windows 전용 기능입니다.");
  if (!adapterName) throw new Error("어댑터 이름이 없습니다.");

  const alias = adapterName.replace(/'/g, "''");
  let script;

  if (config.dhcp) {
    script = [
      "$ErrorActionPreference = 'Stop'",
      `Set-NetIPInterface -InterfaceAlias '${alias}' -Dhcp Enabled -Confirm:$false`,
      `Set-DnsClientServerAddress -InterfaceAlias '${alias}' -ResetServerAddresses`,
      "Write-Output 'ok'",
    ].join("\n");
  } else {
    const ip = (config.ip || "").trim();
    const prefix = parseInt(config.prefix, 10);
    const gateway = (config.gateway || "").trim();
    const rawDns = (config.dns || "").trim();

    if (!ip || !prefix || !gateway) {
      throw new Error("IP 주소, 접두사 길이, 기본 게이트웨이를 모두 입력하세요.");
    }

    const dnsLine = rawDns
      ? `Set-DnsClientServerAddress -InterfaceAlias '${alias}' -ServerAddresses @(${rawDns.split(",").map(d => `'${d.trim()}'`).join(",")})`
      : `Set-DnsClientServerAddress -InterfaceAlias '${alias}' -ResetServerAddresses`;

    script = [
      "$ErrorActionPreference = 'Stop'",
      `Set-NetIPInterface -InterfaceAlias '${alias}' -Dhcp Disabled -Confirm:$false -ErrorAction SilentlyContinue`,
      `Get-NetIPAddress -InterfaceAlias '${alias}' -AddressFamily IPv4 -ErrorAction SilentlyContinue | Remove-NetIPAddress -Confirm:$false -ErrorAction SilentlyContinue`,
      `Get-NetRoute -InterfaceAlias '${alias}' -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue`,
      `New-NetIPAddress -InterfaceAlias '${alias}' -IPAddress '${ip}' -PrefixLength ${prefix} -DefaultGateway '${gateway}'`,
      dnsLine,
      "Write-Output 'ok'",
    ].join("\n");
  }

  const result = await runPowerShell(script, 30000);
  if (!result.includes("ok")) {
    if (/access.denied|privilege/i.test(result)) throw new Error("관리자 권한이 필요합니다.");
    throw new Error("설정 적용 중 오류가 발생했습니다.");
  }
  return { ok: true };
}

async function getComputerName() {
  if (process.platform !== "win32") {
    return { name: os.hostname(), messages: [] };
  }
  try {
    const name = (await runPowerShell(GET_COMPUTER_NAME_SCRIPT, 5000)).trim();
    return { name, messages: [] };
  } catch (err) {
    return { name: os.hostname(), messages: [`조회 실패: ${err.message}`] };
  }
}

async function renameComputer(newName) {
  if (process.platform !== "win32") throw new Error("Windows 전용 기능입니다.");
  if (!newName || !/^[A-Za-z0-9]([A-Za-z0-9-]{0,13}[A-Za-z0-9])?$/.test(newName)) {
    throw new Error("컴퓨터 이름은 영문·숫자·하이픈만 허용하며 최대 15자입니다.");
  }
  const safeName = newName.replace(/'/g, "''");
  const script = `Rename-Computer -NewName '${safeName}' -Force\nWrite-Output 'ok'`;
  const result = await runPowerShell(script, 15000);
  if (!result.includes("ok")) {
    if (/access.denied|privilege/i.test(result)) throw new Error("관리자 권한이 필요합니다.");
    throw new Error("이름 변경 중 오류가 발생했습니다.");
  }
  return { ok: true };
}

function fallbackAdapters() {
  const interfaces = os.networkInterfaces();
  return Object.entries(interfaces)
    .filter(([, addrs]) => addrs?.some(a => a.family === "IPv4" && !a.internal))
    .map(([name, addrs]) => {
      const addr = addrs.find(a => a.family === "IPv4" && !a.internal);
      return {
        name,
        description: name,
        status: "Up",
        mac: addr?.mac || "",
        ip: addr?.address || "",
        prefix: addr ? maskToCidr(addr.netmask) : 0,
        gateway: "",
        dns: "",
        dhcp: true,
      };
    });
}

function maskToCidr(mask) {
  if (!mask) return 0;
  return mask.split(".").reduce((acc, oct) => {
    let n = parseInt(oct, 10);
    let bits = 0;
    while (n > 0) { bits += n & 1; n >>= 1; }
    return acc + bits;
  }, 0);
}

function register(ipcMain) {
  ipcMain.handle("control:getAdapters",    getNetworkAdapters);
  ipcMain.handle("control:applyConfig",    (_, name, cfg) => applyNetworkConfig(name, cfg));
  ipcMain.handle("control:getComputerName", getComputerName);
  ipcMain.handle("control:renameComputer", (_, newName) => renameComputer(newName));
}

module.exports = { register };
