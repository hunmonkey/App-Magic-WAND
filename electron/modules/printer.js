const { app, shell } = require("electron");
const childProcess = require("child_process");
const fs = require("fs/promises");
const path = require("path");

const { runPowerShell } = require("../core/run-command");
const { ensureDataSubdir } = require("../core/portable-data");

const TIMEOUT = 20000;
const DRIVER_STORE_DIR = "PrinterDriver";
const DRIVER_LINK_PAGE = "_Official_Driver_Links.html";
const INSTALL_TIMEOUT = 120000;
const DRIVER_FILE_EXTENSIONS = new Set([".inf", ".exe", ".msi"]);
const INSTALLER_EXTENSIONS = new Set([".exe", ".msi"]);
const INF_SKIP_SECTIONS = new Set([
  "version",
  "manufacturer",
  "strings",
  "destinationdirs",
  "sourcedisksfiles",
  "sourcedisksnames",
  "controlflags",
  "printerpackageinstallation",
  "printerpackageinstall",
  "defaultinstall",
  "defaultinstall.nt",
  "defaultinstall.ntamd64",
  "defaultinstall.ntx86",
]);
const BRAND_PATTERNS = [
  ["samsung", "Samsung"],
  ["삼성", "Samsung"],
  ["hp", "HP"],
  ["hewlett", "HP"],
  ["lg", "LG"],
  ["brother", "Brother"],
  ["canon", "Canon"],
  ["epson", "Epson"],
  ["xerox", "Xerox"],
  ["fuji", "Fuji"],
  ["kyocera", "Kyocera"],
  ["ricoh", "Ricoh"],
  ["lexmark", "Lexmark"],
  ["microsoft", "Microsoft"],
  ["hancom", "Hancom"],
  ["teamviewer", "TeamViewer"],
];
const MANUFACTURER_DRIVER_URLS = {
  brother: "https://www.brother-usa.com/brother-support/driver-downloads",
  canon: "https://sg.canon/en/support/0101227001",
  epson: "https://www.epson.com/support",
  fuji: "https://support-fb.fujifilm.com/setupDriverForm.do?d_lang=en&lang_code=en",
  fujifilm: "https://support-fb.fujifilm.com/setupDriverForm.do?d_lang=en&lang_code=en",
  hp: "https://support.hp.com/us-en/drivers/printers",
  kyocera: "https://www.kyoceradocumentsolutions.com/en/support-and-download/",
  lexmark: "https://support.lexmark.com/en_us/drivers-downloads.html",
  lg: "https://www.lg.com/us/support/software-firmware-drivers",
  microsoft: "https://support.microsoft.com/windows/download-and-install-the-latest-printer-drivers-4ff66446-a2ab-b77f-46f4-a6d3fe4bf661",
  ricoh: "https://www.ricoh.com/support/",
  samsung: "https://support.hp.com/us-en/drivers/printers",
  xerox: "https://www.support.xerox.com/en-gb/product/global-printer-driver/downloads?platform=all",
};
const MANUFACTURER_DRIVER_LINKS = [
  ["HP / Samsung", MANUFACTURER_DRIVER_URLS.hp],
  ["Canon", MANUFACTURER_DRIVER_URLS.canon],
  ["Brother", MANUFACTURER_DRIVER_URLS.brother],
  ["Epson", MANUFACTURER_DRIVER_URLS.epson],
  ["Ricoh", MANUFACTURER_DRIVER_URLS.ricoh],
  ["Xerox", MANUFACTURER_DRIVER_URLS.xerox],
  ["Kyocera", MANUFACTURER_DRIVER_URLS.kyocera],
  ["FUJIFILM", MANUFACTURER_DRIVER_URLS.fujifilm],
  ["Lexmark", MANUFACTURER_DRIVER_URLS.lexmark],
  ["LG", MANUFACTURER_DRIVER_URLS.lg],
  ["Microsoft printer driver help", MANUFACTURER_DRIVER_URLS.microsoft],
];

function psQuote(value) {
  return "'" + String(value ?? "").replace(/'/g, "''") + "'";
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeSearch(value) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function detectManufacturer(...values) {
  const text = normalizeSearch(values.filter(Boolean).join(" "));
  const found = BRAND_PATTERNS.find(([needle]) => text.includes(needle));
  return found ? found[1] : "";
}

function stripInfValue(value) {
  return clean(value)
    .replace(/^%|%$/g, "")
    .replace(/^"|"$/g, "")
    .replace(/\\"/g, "\"")
    .trim();
}

function safeFriendlyName(filePath) {
  return path.basename(filePath, path.extname(filePath)).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function isInsidePath(childPath, parentPath) {
  const child = path.resolve(childPath).toLowerCase();
  const parent = path.resolve(parentPath).toLowerCase();
  return child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
}

function makeDriverId(source, relativePath, model) {
  return Buffer.from([source, relativePath || "", model || ""].join("|"), "utf8").toString("base64url");
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

async function getDriverStoreDir() {
  return ensureDataSubdir(app, DRIVER_STORE_DIR);
}

async function openDriverStore() {
  const root = await getDriverStoreDir();
  const error = await shell.openPath(root);
  if (error) {
    throw new Error(error);
  }
  return { path: root };
}

async function openManufacturerHome(manufacturer) {
  const key = manufacturerKey(manufacturer);
  if (!key) {
    const linkPage = await ensureManufacturerLinkPage();
    const error = await shell.openPath(linkPage);
    if (error) {
      throw new Error(error);
    }
    return { ok: true, manufacturer: "", url: linkPage };
  }
  const url = MANUFACTURER_DRIVER_URLS[key];
  if (!url) {
    throw new Error("해당 제조사의 다운로드 센터 주소가 아직 등록되어 있지 않습니다.");
  }
  await shell.openExternal(url);
  return { ok: true, manufacturer: clean(manufacturer), url };
}

async function ensureManufacturerLinkPage() {
  const root = await getDriverStoreDir();
  const target = path.join(root, DRIVER_LINK_PAGE);
  await fs.writeFile(target, makeManufacturerLinkPage(), "utf8");
  return target;
}

function makeManufacturerLinkPage() {
  const links = MANUFACTURER_DRIVER_LINKS.map(([label, url]) => (
    `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`
  )).join("\n        ");
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <title>Magic WAND Printer Driver Links</title>
    <style>
      body { margin: 32px; color: #17202a; background: #f7fafc; font-family: "Malgun Gothic", Arial, sans-serif; line-height: 1.6; }
      main { max-width: 920px; margin: 0 auto; padding: 28px; background: #fff; border: 1px solid #ccd6e2; border-radius: 8px; }
      h1 { margin: 0 0 8px; font-size: 24px; }
      p { margin: 0 0 20px; color: #405064; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
      a { display: block; padding: 12px 14px; color: #123f8c; background: #e8f0ff; border: 1px solid #bdc8d6; border-radius: 8px; text-decoration: none; font-weight: 700; }
      a:hover { border-color: #2563eb; background: #dce9ff; }
      .note { margin-top: 20px; padding: 12px 14px; background: #fff2d8; border: 1px solid #f0c36a; border-radius: 8px; }
      code { padding: 2px 5px; background: #edf2f7; border-radius: 4px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Magic WAND printer driver links</h1>
      <p>Click one manufacturer at a time, download the driver from the official site, then put it into <code>MagicWAND_Data/PrinterDriver</code>.</p>
      <section class="grid">
        ${links}
      </section>
      <div class="note">If a driver downloads as a ZIP file, extract it first. Magic WAND finds visible <code>.inf</code>, <code>.exe</code>, and <code>.msi</code> files.</div>
    </main>
  </body>
</html>
`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function manufacturerKey(value) {
  const text = normalizeSearch(value);
  if (!text) return "";
  if (text.includes("samsung") || text.includes("삼성")) return "samsung";
  if (text.includes("hewlett") || /\bhp\b/.test(text)) return "hp";
  if (text.includes("brother")) return "brother";
  if (text.includes("canon")) return "canon";
  if (text.includes("epson")) return "epson";
  if (text.includes("xerox")) return "xerox";
  if (text.includes("fujifilm")) return "fujifilm";
  if (text.includes("fuji")) return "fuji";
  if (text.includes("ricoh")) return "ricoh";
  if (text.includes("kyocera")) return "kyocera";
  if (text.includes("lexmark")) return "lexmark";
  if (text.includes("microsoft")) return "microsoft";
  if (text.includes("lg")) return "lg";
  return text;
}

async function listDriverPackages(query = "") {
  const root = await getDriverStoreDir();
  const [localDrivers, registeredDrivers, inboxDrivers] = await Promise.all([
    listLocalDriverPackages(root),
    listWindowsPrinterDrivers(),
    listWindowsInboxPrinterDrivers(),
  ]);
  const windowsDrivers = mergeWindowsDrivers(registeredDrivers, inboxDrivers);
  const queryText = normalizeSearch(query);
  const drivers = [...localDrivers, ...windowsDrivers]
    .filter((item) => matchesQuery(item, queryText))
    .slice(0, 2000);

  return {
    root,
    drivers,
    localCount: localDrivers.length,
    windowsCount: windowsDrivers.length,
  };
}

async function listLocalDriverPackages(root) {
  const files = await collectDriverFiles(root);
  const drivers = [];
  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    const relativePath = path.relative(root, filePath);
    if (ext === ".inf") {
      const models = await extractInfModels(filePath);
      const names = models.length ? models : [safeFriendlyName(filePath)];
      for (const model of names.slice(0, 100)) {
        drivers.push({
          id: makeDriverId("inf", relativePath, model),
          source: "inf",
          sourceLabel: "보관함 INF",
          model,
          manufacturer: detectManufacturer(model, relativePath),
          fileName: path.basename(filePath),
          relativePath,
        });
      }
    } else if (INSTALLER_EXTENSIONS.has(ext)) {
      const model = safeFriendlyName(filePath);
      drivers.push({
        id: makeDriverId("installer", relativePath, model),
        source: "installer",
        sourceLabel: ext === ".msi" ? "MSI 설치파일" : "EXE 설치파일",
        model,
        manufacturer: detectManufacturer(model, relativePath),
        fileName: path.basename(filePath),
        relativePath,
      });
    }
  }
  return drivers.sort((a, b) => driverSortKey(a).localeCompare(driverSortKey(b), "ko-KR"));
}

async function collectDriverFiles(root) {
  const files = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(target);
      } else if (entry.isFile() && DRIVER_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(target);
      }
    }
  }
  await walk(root);
  return files;
}

async function extractInfModels(filePath) {
  try {
    const buffer = await fs.readFile(filePath);
    const text = decodeText(buffer);
    return parseInfModels(text);
  } catch {
    return [];
  }
}

function decodeText(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString("utf16le");
  }
  const sample = buffer.subarray(0, Math.min(buffer.length, 200));
  const nullCount = sample.filter((byte) => byte === 0).length;
  return nullCount > sample.length / 4 ? buffer.toString("utf16le") : buffer.toString("utf8");
}

function parseInfModels(text) {
  const strings = new Map();
  const tokens = [];
  let section = "";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/;.*$/, "").trim();
    if (!line) continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim().toLowerCase();
      continue;
    }
    const splitAt = line.indexOf("=");
    if (splitAt < 0) continue;

    const left = line.slice(0, splitAt).trim();
    const right = line.slice(splitAt + 1).trim();
    if (section === "strings" || section.startsWith("strings.")) {
      strings.set(left.toLowerCase(), stripInfValue(right));
      continue;
    }
    if (INF_SKIP_SECTIONS.has(section)) continue;
    if (left.startsWith("%") && left.endsWith("%")) {
      tokens.push({ type: "string", value: left.slice(1, -1).toLowerCase() });
      continue;
    }
    const quoted = left.match(/^"([^"]+)"/);
    const model = quoted ? quoted[1] : stripInfValue(left);
    if (model && !model.includes("%")) {
      tokens.push({ type: "literal", value: model });
    }
  }

  const result = [];
  const seen = new Set();
  for (const token of tokens) {
    const model = token.type === "string" ? strings.get(token.value) : token.value;
    const cleaned = clean(model);
    const key = cleaned.toLowerCase();
    if (cleaned && cleaned.length > 2 && !seen.has(key)) {
      result.push(cleaned);
      seen.add(key);
    }
  }
  return result;
}

async function listWindowsPrinterDrivers() {
  if (process.platform !== "win32") {
    return [];
  }
  const result = await runJson(
    wrap(`
  $list = Get-PrinterDriver | ForEach-Object {
    [pscustomobject]@{
      name         = $_.Name
      manufacturer = $_.Manufacturer
    }
  }
  $out = @{ ok = $true; drivers = @($list) }
`),
  ).catch(() => ({ ok: false, drivers: [] }));
  if (!result.ok) {
    return [];
  }
  return asArray(result.drivers)
    .map((item) => {
      const model = clean(item.name);
      return {
        id: makeDriverId("windows", "", model),
        source: "windows",
        sourceLabel: "Windows 등록됨",
        model,
        manufacturer: clean(item.manufacturer) || detectManufacturer(model),
        fileName: "",
        relativePath: "",
      };
    })
    .filter((item) => item.model)
    .sort((a, b) => driverSortKey(a).localeCompare(driverSortKey(b), "ko-KR"));
}

async function listWindowsInboxPrinterDrivers() {
  if (process.platform !== "win32") {
    return [];
  }
  const infDir = path.join(process.env.SystemRoot || "C:\\Windows", "INF");
  let entries = [];
  try {
    entries = await fs.readdir(infDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const candidates = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => {
      const lower = name.toLowerCase();
      return lower === "ntprint.inf" || lower === "ntprint4.inf" || lower.startsWith("prn");
    })
    .slice(0, 80);

  const drivers = [];
  for (const fileName of candidates) {
    const filePath = path.join(infDir, fileName);
    const models = await extractInfModels(filePath);
    for (const model of models.slice(0, 500)) {
      drivers.push({
        id: makeDriverId("inbox", fileName, model),
        source: "inbox",
        sourceLabel: "Windows 내장",
        model,
        manufacturer: detectManufacturer(model, fileName) || "기타",
        fileName,
        relativePath: "",
      });
    }
  }
  return drivers.sort((a, b) => driverSortKey(a).localeCompare(driverSortKey(b), "ko-KR"));
}

function mergeWindowsDrivers(registeredDrivers, inboxDrivers) {
  const result = [];
  const seen = new Set();
  for (const driver of [...registeredDrivers, ...inboxDrivers]) {
    const key = normalizeSearch(driver.model);
    if (!key || seen.has(key)) {
      continue;
    }
    result.push(driver);
    seen.add(key);
  }
  return result;
}

function matchesQuery(item, queryText) {
  if (!queryText) {
    return true;
  }
  const target = normalizeSearch([
    item.model,
    item.manufacturer,
    item.fileName,
    item.relativePath,
    item.sourceLabel,
  ].filter(Boolean).join(" "));
  return queryText.split(" ").every((word) => target.includes(word));
}

function driverSortKey(item) {
  const order = item.source === "inf" ? "0" : item.source === "installer" ? "1" : item.source === "inbox" ? "2" : "3";
  return `${order}-${item.manufacturer}-${item.model}-${item.relativePath}`;
}

async function installDriver(payload = {}) {
  if (process.platform !== "win32") {
    throw new Error("프린터 드라이버 설치는 Windows에서 사용할 수 있습니다.");
  }
  const source = clean(payload.source);
  if (source === "windows") {
    return installWindowsDriver(payload.model);
  }
  if (source === "inbox") {
    return installWindowsDriver(payload.model);
  }
  if (source === "inf") {
    const target = await resolveStoredDriverFile(payload.relativePath, [".inf"]);
    return installInfDriver(target, payload.model);
  }
  if (source === "installer") {
    const target = await resolveStoredDriverFile(payload.relativePath, [".exe", ".msi"]);
    return launchDriverInstaller(target);
  }
  throw new Error("설치할 드라이버 종류를 확인하지 못했습니다.");
}

async function resolveStoredDriverFile(relativePath, allowedExtensions) {
  const root = await getDriverStoreDir();
  const safeRelative = clean(relativePath);
  if (!safeRelative) {
    throw new Error("드라이버 파일 정보가 없습니다.");
  }
  const target = path.resolve(root, safeRelative);
  if (!isInsidePath(target, root)) {
    throw new Error("PrinterDriver 폴더 안의 파일만 설치할 수 있습니다.");
  }
  const ext = path.extname(target).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new Error("지원하지 않는 드라이버 파일 형식입니다.");
  }
  await fs.access(target);
  return target;
}

async function installWindowsDriver(model) {
  const driverName = clean(model);
  if (!driverName) {
    throw new Error("설치할 프린터 모델명을 입력해 주세요.");
  }
  const result = await runJson(
    wrap(`
  $name = ${psQuote(driverName)}
  Add-PrinterDriver -Name $name
  $out = @{ ok = $true; model = $name; mode = "windows" }
`),
    INSTALL_TIMEOUT,
  );
  if (!result.ok) {
    throw new Error(result.error || "Windows 내장 드라이버 설치에 실패했습니다. 모델명이 정확한지 확인해 주세요.");
  }
  return { ok: true, mode: "windows", model: driverName };
}

async function installInfDriver(infPath, model) {
  const driverName = clean(model);
  const result = await runJson(
    wrap(`
  $inf = ${psQuote(infPath)}
  if (-not (Test-Path -LiteralPath $inf)) { throw "INF 파일을 찾지 못했습니다." }
  $pnputil = Join-Path $env:SystemRoot "System32\\pnputil.exe"
  & $pnputil "/add-driver" $inf "/install" | Out-Null
  $exitCode = $LASTEXITCODE
  if (($exitCode -ne 0) -and ($exitCode -ne 3010)) {
    throw "pnputil 설치 실패 코드: $exitCode"
  }
  $addError = ""
  if (${driverName ? "$true" : "$false"}) {
    try {
      Add-PrinterDriver -Name ${psQuote(driverName)}
    } catch {
      $addError = $_.Exception.Message
    }
  }
  $out = @{ ok = $true; mode = "inf"; exitCode = $exitCode; model = ${psQuote(driverName)}; addError = $addError }
`),
    INSTALL_TIMEOUT,
  );
  if (!result.ok) {
    throw new Error(result.error || "INF 드라이버 설치에 실패했습니다.");
  }
  return {
    ok: true,
    mode: "inf",
    model: driverName,
    rebootRequired: result.exitCode === 3010,
    addError: clean(result.addError),
  };
}

function launchDriverInstaller(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const command = ext === ".msi" ? "msiexec.exe" : filePath;
  const args = ext === ".msi" ? ["/i", filePath] : [];
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve({
        ok: true,
        mode: "installer",
        fileName: path.basename(filePath),
      });
    });
  });
}

function register(ipcMain) {
  ipcMain.handle("printer:list", listPrinters);
  ipcMain.handle("printer:testPage", (_event, name) => testPage(name));
  ipcMain.handle("printer:clearQueue", (_event, name) => clearQueue(name));
  ipcMain.handle("printer:setDefault", (_event, name) => setDefault(name));
  ipcMain.handle("printer:restartSpooler", () => restartSpooler());
  ipcMain.handle("printer:listDrivers", (_event, query) => listDriverPackages(query));
  ipcMain.handle("printer:installDriver", (_event, payload) => installDriver(payload));
  ipcMain.handle("printer:openDriverStore", () => openDriverStore());
  ipcMain.handle("printer:openManufacturerHome", (_event, manufacturer) => openManufacturerHome(manufacturer));
}

module.exports = {
  register,
};
