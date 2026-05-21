const childProcess = require("child_process");
const dns = require("dns").promises;
const https = require("https");
const os = require("os");

const MAX_SCAN_HOSTS = 254;
const PING_CONCURRENCY = 36;
const NAME_CONCURRENCY = 12;

async function scanCurrentNetwork() {
  const messages = [];
  const privateInterfaces = await getPrivateInterfaces();
  const publicIp = await fetchPublicIp(messages);
  const primaryInterface = pickPrimaryInterface(privateInterfaces);

  if (privateInterfaces.length === 0) {
    messages.push("확인된 사설 IP가 없습니다.");
  }

  return {
    publicIp,
    pcName: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    primaryInterface,
    privateInterfaces,
    messages,
  };
}

async function scanAddressUsage(interfaceId) {
  const privateInterfaces = await getPrivateInterfaces();
  const target = findInterface(privateInterfaces, interfaceId) ?? pickPrimaryInterface(privateInterfaces);

  if (!target) {
    return {
      interface: null,
      scannedRange: "",
      totalHosts: 0,
      usedCount: 0,
      freeCount: 0,
      skippedCount: 0,
      hosts: [],
      messages: ["스캔할 사설 네트워크를 찾지 못했습니다."],
    };
  }

  const scanPlan = buildScanPlan(target);
  const pingResults = await mapWithConcurrency(scanPlan.hosts, PING_CONCURRENCY, async (ip) => ({
    ip,
    alive: await pingHost(ip, 450),
  }));
  const arpMap = await getArpTable();
  const aliveIps = new Set(
    pingResults
      .filter((item) => item.alive || arpMap.has(item.ip) || item.ip === target.privateIp)
      .map((item) => item.ip),
  );

  const names = await resolveHostNames([...aliveIps], target);
  const hosts = scanPlan.hosts.map((ip) => {
    const isSelf = ip === target.privateIp;
    const isGateway = Boolean(target.gateway && ip === target.gateway);
    const used = aliveIps.has(ip) || isSelf || isGateway;

    return {
      ip,
      status: used ? "used" : "free",
      role: isSelf ? "self" : isGateway ? "gateway" : "",
      name: names.get(ip) ?? "",
      macAddress: arpMap.get(ip) ?? "",
    };
  });

  const usedCount = hosts.filter((host) => host.status === "used").length;
  const messages = [...scanPlan.messages];
  if (usedCount === 0) {
    messages.push("응답한 장비가 없습니다. 방화벽 때문에 ping 응답이 막힌 장비는 비어 있는 것처럼 보일 수 있습니다.");
  }

  return {
    interface: target,
    scannedRange: scanPlan.scannedRange,
    totalHosts: hosts.length,
    usedCount,
    freeCount: hosts.length - usedCount,
    skippedCount: scanPlan.skippedCount,
    hosts,
    messages,
  };
}

async function runNetworkDiagnostics(interfaceId) {
  const messages = [];
  const privateInterfaces = await getPrivateInterfaces();
  const target = findInterface(privateInterfaces, interfaceId) ?? pickPrimaryInterface(privateInterfaces);
  const tests = [];

  if (!target) {
    tests.push({
      name: "PC 사설 IP 확인",
      status: "fail",
      detail: "현재 PC에서 사용 중인 사설 IP를 찾지 못했습니다.",
      hint: "랜선, 와이파이 연결, 네트워크 어댑터 사용 여부를 먼저 확인해 주세요.",
    });

    return {
      summary: "PC가 공유기에서 주소를 받지 못한 상태로 보입니다.",
      tests,
      messages,
    };
  }

  tests.push({
    name: "PC 사설 IP 확인",
    status: "ok",
    detail: `${target.name}에서 ${target.privateIp} 주소를 사용 중입니다.`,
    hint: "PC가 내부 네트워크에 연결되어 있습니다.",
  });

  let gatewayOk = false;
  if (target.gateway) {
    gatewayOk = await pingHost(target.gateway, 700);
    tests.push({
      name: "공유기 연결 확인",
      status: gatewayOk ? "ok" : "fail",
      detail: gatewayOk
        ? `게이트웨이 ${target.gateway}에 응답이 있습니다.`
        : `게이트웨이 ${target.gateway}에서 응답이 없습니다.`,
      hint: gatewayOk
        ? "PC와 공유기 사이 연결은 정상으로 보입니다."
        : "랜선, 와이파이 신호, 공유기 전원, IP 대역이 맞는지 확인해 주세요.",
    });
  } else {
    tests.push({
      name: "공유기 주소 확인",
      status: "warn",
      detail: "게이트웨이 주소를 확인하지 못했습니다.",
      hint: "수동 IP 설정이 잘못되었거나 네트워크 정보 조회가 제한되었을 수 있습니다.",
    });
  }

  const internetIpOk = await pingHost("1.1.1.1", 900);
  tests.push({
    name: "인터넷 통로 확인",
    status: internetIpOk ? "ok" : "fail",
    detail: internetIpOk ? "외부 IP 1.1.1.1에 응답이 있습니다." : "외부 IP 1.1.1.1에 응답이 없습니다.",
    hint: internetIpOk
      ? "공유기 밖 인터넷 통로는 열려 있습니다."
      : "공유기 WAN, 모뎀, 인터넷 회선 상태를 확인해 주세요.",
  });

  const dnsResult = await lookupDns("www.google.com");
  tests.push({
    name: "DNS 이름 변환 확인",
    status: dnsResult.ok ? "ok" : "fail",
    detail: dnsResult.ok
      ? `www.google.com이 ${dnsResult.address} 주소로 변환되었습니다.`
      : `도메인 이름을 IP로 바꾸지 못했습니다. ${dnsResult.error}`,
    hint: dnsResult.ok
      ? "DNS 설정은 정상으로 보입니다."
      : "DNS 서버를 공유기 주소, 1.1.1.1, 8.8.8.8 등으로 바꿔 테스트해 보세요.",
  });

  const publicIp = await fetchPublicIp(messages);
  tests.push({
    name: "공인 IP 확인",
    status: publicIp ? "ok" : "warn",
    detail: publicIp ? `현재 공인 IP는 ${publicIp}입니다.` : "공인 IP 조회 사이트에 접속하지 못했습니다.",
    hint: publicIp
      ? "외부 웹 요청도 정상으로 보입니다."
      : "인터넷이 느리거나 보안 프로그램, 방화벽, DNS 문제일 수 있습니다.",
  });

  return {
    summary: summarizeDiagnostics(tests, Boolean(target.gateway), gatewayOk, internetIpOk, dnsResult.ok),
    tests,
    messages,
  };
}

async function getPrivateInterfaces() {
  const osItems = getInterfacesFromOs();
  const windowsItems = process.platform === "win32" ? await getInterfacesFromPowerShell() : [];
  const detailsByIp = new Map(windowsItems.map((item) => [item.privateIp, item]));

  const merged = osItems.map((item) => ({
    ...item,
    ...(detailsByIp.get(item.privateIp) ?? {}),
  }));

  for (const item of windowsItems) {
    if (!merged.some((current) => current.privateIp === item.privateIp)) {
      merged.push(item);
    }
  }

  return dedupeInterfaces(merged)
    .map((item) => ({
      ...item,
      id: makeInterfaceId(item),
    }))
    .sort(compareInterfaces);
}

function getInterfacesFromOs() {
  const interfaces = os.networkInterfaces();
  const result = [];

  for (const [name, items] of Object.entries(interfaces)) {
    for (const item of items ?? []) {
      if (item.family !== "IPv4" || item.internal || !isPrivateIPv4(item.address)) {
        continue;
      }

      const prefixLength = getPrefixLength(item);
      result.push({
        id: "",
        name,
        description: "",
        privateIp: item.address,
        netmask: item.netmask ?? "",
        prefixLength,
        networkRange: getNetworkRange(item.address, prefixLength),
        gateway: "",
        dnsServers: [],
        macAddress: item.mac && item.mac !== "00:00:00:00:00:00" ? item.mac : "",
      });
    }
  }

  return result;
}

async function getInterfacesFromPowerShell() {
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$dnsMap = @{}
Get-DnsClientServerAddress -AddressFamily IPv4 | ForEach-Object {
  $dnsMap[[string]$_.InterfaceIndex] = @($_.ServerAddresses)
}
$items = Get-NetIPConfiguration | ForEach-Object {
  $gateway = ''
  if ($_.IPv4DefaultGateway) {
    $gateway = ($_.IPv4DefaultGateway | Select-Object -First 1).NextHop
  }
  $dns = @()
  if ($dnsMap.ContainsKey([string]$_.InterfaceIndex)) {
    $dns = @($dnsMap[[string]$_.InterfaceIndex])
  }
  foreach ($addr in $_.IPv4Address) {
    if ($addr.IPAddress -and $null -ne $addr.PrefixLength -and $addr.IPAddress -ne '127.0.0.1') {
      [pscustomobject]@{
        Name = $_.InterfaceAlias
        Description = $_.InterfaceDescription
        InterfaceIndex = $_.InterfaceIndex
        IPAddress = $addr.IPAddress
        PrefixLength = [int]$addr.PrefixLength
        Gateway = $gateway
        DnsServers = $dns
      }
    }
  }
}
$items | ConvertTo-Json -Depth 5
`;

  try {
    const stdout = await runPowerShell(script, 6000);
    const text = stdout.trim();
    if (!text) {
      return [];
    }

    const raw = JSON.parse(text);
    const items = Array.isArray(raw) ? raw : [raw];
    return items.map(interfaceFromPowerShell).filter(Boolean);
  } catch {
    return [];
  }
}

function interfaceFromPowerShell(item) {
  const privateIp = String(item?.IPAddress ?? "").trim();
  const prefixLength = Number(item?.PrefixLength);

  if (!isPrivateIPv4(privateIp) || !Number.isInteger(prefixLength)) {
    return null;
  }

  const dnsServerValues = Array.isArray(item.DnsServers)
    ? item.DnsServers
    : item.DnsServers
      ? [item.DnsServers]
      : [];
  const dnsServers = dnsServerValues.map((value) => String(value).trim()).filter(Boolean);

  return {
    id: "",
    name: cleanText(item.Name) || cleanText(item.Description) || `네트워크 ${item.InterfaceIndex ?? ""}`.trim(),
    description: cleanText(item.Description),
    privateIp,
    netmask: prefixToNetmask(prefixLength),
    prefixLength,
    networkRange: getNetworkRange(privateIp, prefixLength),
    gateway: String(item.Gateway ?? "").trim(),
    dnsServers,
    macAddress: "",
  };
}

function buildScanPlan(target) {
  const messages = [];
  const prefixLength = Number.isInteger(target.prefixLength) ? target.prefixLength : 24;
  const hostCount = prefixLength >= 31 ? 0 : 2 ** (32 - prefixLength) - 2;
  let scanPrefix = prefixLength;

  if (hostCount > MAX_SCAN_HOSTS || prefixLength < 24) {
    scanPrefix = 24;
    messages.push("네트워크 대역이 커서 현재 PC 주변 254개 주소만 먼저 조사했습니다.");
  }

  const networkNumber = getNetworkNumber(target.privateIp, scanPrefix);
  const scanHostCount = scanPrefix >= 31 ? 0 : Math.min(MAX_SCAN_HOSTS, 2 ** (32 - scanPrefix) - 2);
  const hosts = [];

  if (scanHostCount === 0) {
    hosts.push(target.privateIp);
  } else {
    for (let offset = 1; offset <= scanHostCount; offset += 1) {
      hosts.push(numberToIPv4((networkNumber + offset) >>> 0));
    }
  }

  return {
    hosts,
    scannedRange: `${numberToIPv4(networkNumber)}/${scanPrefix}`,
    skippedCount: Math.max(0, hostCount - hosts.length),
    messages,
  };
}

async function resolveHostNames(ips, target) {
  const names = new Map();
  names.set(target.privateIp, os.hostname());
  if (target.gateway) {
    names.set(target.gateway, "Gateway");
  }

  await mapWithConcurrency(ips, NAME_CONCURRENCY, async (ip) => {
    if (names.has(ip)) {
      return;
    }

    const name = await reverseDns(ip);
    if (name) {
      names.set(ip, name);
    }
  });

  return names;
}

async function reverseDns(ip) {
  try {
    const result = await withTimeout(dns.reverse(ip), 700);
    return result?.[0] ?? "";
  } catch {
    return "";
  }
}

async function getArpTable() {
  try {
    const { stdout } = await execFileAsync("arp", ["-a"], { timeout: 4000 });
    const map = new Map();
    for (const line of stdout.split(/\r?\n/)) {
      const match = line.match(/(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-fA-F:-]{11,17})/);
      if (match) {
        map.set(match[1], match[2].replaceAll("-", ":").toLowerCase());
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

async function pingHost(ip, timeoutMs) {
  const args =
    process.platform === "win32"
      ? ["-n", "1", "-w", String(timeoutMs), ip]
      : ["-c", "1", "-W", "1", ip];

  try {
    await execFileAsync("ping", args, { timeout: timeoutMs + 900 });
    return true;
  } catch {
    return false;
  }
}

async function lookupDns(hostname) {
  try {
    const result = await withTimeout(dns.lookup(hostname, { family: 4 }), 3500);
    return { ok: true, address: result.address, error: "" };
  } catch (error) {
    return { ok: false, address: "", error: error.message };
  }
}

function fetchPublicIp(messages) {
  return new Promise((resolve) => {
    const request = https.get(
      "https://api.ipify.org?format=json",
      {
        headers: {
          "User-Agent": "Magic WAND",
        },
        timeout: 5000,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            const payload = JSON.parse(body);
            const publicIp = String(payload.ip ?? "").trim();
            resolve(isIPv4(publicIp) ? publicIp : "");
          } catch (error) {
            messages.push(`공인 IP 응답을 읽지 못했습니다: ${error.message}`);
            resolve("");
          }
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("요청 시간이 초과되었습니다."));
    });
    request.on("error", (error) => {
      messages.push(`공인 IP를 확인하지 못했습니다: ${error.message}`);
      resolve("");
    });
  });
}

function summarizeDiagnostics(tests, hasGateway, gatewayOk, internetIpOk, dnsOk) {
  if (tests.some((test) => test.name === "PC 사설 IP 확인" && test.status === "fail")) {
    return "PC가 내부 네트워크 주소를 받지 못했습니다.";
  }
  if (hasGateway && !gatewayOk) {
    return "PC와 공유기 사이 연결 문제일 가능성이 큽니다.";
  }
  if (gatewayOk && !internetIpOk) {
    return "공유기 밖 인터넷 회선 또는 모뎀 쪽 문제일 가능성이 큽니다.";
  }
  if (internetIpOk && !dnsOk) {
    return "인터넷 통로는 열려 있지만 DNS 설정에 문제가 있을 가능성이 큽니다.";
  }
  if (tests.every((test) => test.status === "ok")) {
    return "기본 네트워크 점검은 정상입니다.";
  }
  return "일부 항목을 확인하지 못했습니다. 아래 결과를 순서대로 확인해 주세요.";
}

function findInterface(interfaces, interfaceId) {
  if (!interfaceId) {
    return null;
  }
  return interfaces.find((item) => item.id === interfaceId) ?? null;
}

function pickPrimaryInterface(interfaces) {
  return interfaces.find((item) => item.gateway && !isVirtualInterface(item)) ?? interfaces[0] ?? null;
}

function compareInterfaces(left, right) {
  const leftVirtual = isVirtualInterface(left) ? 1 : 0;
  const rightVirtual = isVirtualInterface(right) ? 1 : 0;
  if (leftVirtual !== rightVirtual) {
    return leftVirtual - rightVirtual;
  }
  if (Boolean(left.gateway) !== Boolean(right.gateway)) {
    return left.gateway ? -1 : 1;
  }
  return left.name.localeCompare(right.name, "ko");
}

function isVirtualInterface(item) {
  const text = `${item.name} ${item.description}`.toLowerCase();
  return text.includes("vethernet") || text.includes("virtual") || text.includes("vmware") || text.includes("hyper-v");
}

function dedupeInterfaces(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = item.privateIp;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

function makeInterfaceId(item) {
  return `${item.name}|${item.privateIp}|${item.networkRange}`;
}

function getNetworkRange(ipAddress, prefixLength) {
  if (!Number.isInteger(prefixLength)) {
    return "대역 확인 필요";
  }
  const networkNumber = getNetworkNumber(ipAddress, prefixLength);
  return `${numberToIPv4(networkNumber)}/${prefixLength}`;
}

function getNetworkNumber(ipAddress, prefixLength) {
  const ipNumber = ipv4ToNumber(ipAddress);
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (ipNumber & mask) >>> 0;
}

function getPrefixLength(item) {
  if (typeof item.cidr === "string" && item.cidr.includes("/")) {
    const prefix = Number(item.cidr.split("/")[1]);
    if (Number.isInteger(prefix) && prefix >= 0 && prefix <= 32) {
      return prefix;
    }
  }

  if (isIPv4(item.netmask)) {
    return netmaskToPrefix(item.netmask);
  }

  return null;
}

function netmaskToPrefix(netmask) {
  const binary = netmask
    .split(".")
    .map((part) => Number(part).toString(2).padStart(8, "0"))
    .join("");

  const zeroIndex = binary.indexOf("0");
  return zeroIndex === -1 ? 32 : zeroIndex;
}

function prefixToNetmask(prefixLength) {
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return numberToIPv4(mask);
}

function isPrivateIPv4(value) {
  if (!isIPv4(value)) {
    return false;
  }

  const [first, second] = value.split(".").map(Number);
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isIPv4(value) {
  const parts = String(value).split(".");
  if (parts.length !== 4) {
    return false;
  }

  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return false;
    }
    const number = Number(part);
    return number >= 0 && number <= 255;
  });
}

function ipv4ToNumber(value) {
  return value.split(".").reduce((total, part) => ((total << 8) + Number(part)) >>> 0, 0);
}

function numberToIPv4(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

function cleanText(value) {
  const text = String(value ?? "").trim();
  if (!text || text.includes("\uFFFD")) {
    return "";
  }
  return text;
}

function runPowerShell(script, timeout) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return execFileAsync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    { encoding: "utf8", timeout },
  ).then((result) => result.stdout);
}

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    childProcess.execFile(
      file,
      args,
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8,
        ...options,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }

        resolve({ stdout, stderr });
      },
    );
  });
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), timeoutMs);
    }),
  ]);
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

module.exports = {
  scanCurrentNetwork,
  scanAddressUsage,
  runNetworkDiagnostics,
  isIPv4,
  isPrivateIPv4,
};
