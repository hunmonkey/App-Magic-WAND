const fs = require("fs");
const os = require("os");
const path = require("path");

const { app } = require("electron");

const { execFileAsync, runPowerShell } = require("../core/run-command");

// 개발 중에는 프로젝트 루트의 tools/, 패키지에서는 resources/tools/ 를 사용한다.
const TOOLS_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "tools")
  : path.join(__dirname, "..", "..", "tools");
const YARA_EXE = path.join(TOOLS_DIR, "yara", "yara64.exe");
const YARA_RULES = path.join(TOOLS_DIR, "yara", "rules", "magic-wand-suspicious.yar");
const DEFENDER_TIMEOUT = 180000;
const YARA_TIMEOUT = 120000;
const SCAN_TARGET_LIMIT = 6;
const YARA_MAX_FILES = 400;
const YARA_MAX_BYTES = 80 * 1024 * 1024;
const YARA_CANDIDATE_EXTENSIONS = new Set([
  ".exe",
  ".dll",
  ".scr",
  ".com",
  ".bat",
  ".cmd",
  ".ps1",
  ".vbs",
  ".vbe",
  ".js",
  ".jse",
  ".wsf",
  ".wsh",
  ".hta",
  ".msi",
  ".lnk",
]);

const SUSPICIOUS_KEYWORDS = [
  "keygen",
  "crack",
  "kmspico",
  "kms activator",
  "cheat engine",
  "hacktool",
  "패치크랙",
];

const TEMP_PATH_HINTS = ["\\temp\\", "\\windows\\temp\\"];
const YARA_RULE_DESCRIPTIONS = {
  MagicWand_Crack_Keygen_Tool: {
    status: "fail",
    reason: "YARA 룰: 크랙·키젠·인증 우회 흔적",
  },
  MagicWand_Suspicious_Script: {
    status: "warn",
    reason: "YARA 룰: 의심 스크립트 명령 흔적",
  },
  MagicWand_Remote_Admin_Abuse_Hint: {
    status: "warn",
    reason: "YARA 룰: 원격 제어 악용 가능 흔적",
  },
};

const SCAN_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$procs = @(Get-Process | Where-Object { $_.Path } | ForEach-Object {
  [pscustomobject]@{ Name = $_.ProcessName; Path = $_.Path }
} | Sort-Object Path -Unique)
$startup = @()
try {
  $startup = @(Get-CimInstance Win32_StartupCommand | ForEach-Object {
    [pscustomobject]@{ Name = $_.Name; Command = $_.Command; Location = $_.Location }
  })
} catch {}
$paths = @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$software = @()
foreach ($p in $paths) {
  $software += Get-ItemProperty $p -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName } |
    ForEach-Object { $_.DisplayName }
}
$software = @($software | Sort-Object -Unique)
[pscustomobject]@{ Processes = $procs; Startup = $startup; Software = $software } | ConvertTo-Json -Depth 4
`;

function register(ipcMain) {
  ipcMain.handle("threat:scan", async (event, runId, options) => scanThreats(createProgressSender(event, runId), options));
  ipcMain.handle("threat:folder-roots", async () => listFolderRoots());
  ipcMain.handle("threat:folder-children", async (_event, folderPath) => listFolderChildren(folderPath));
}

function createProgressSender(event, runId) {
  if (!event?.sender?.send) {
    return null;
  }

  return (payload) => event.sender.send("threat:scan-progress", { runId, ...payload });
}

function listFolderRoots() {
  if (process.platform !== "win32") {
    return [{ name: "/", path: "/", hasChildren: true }];
  }

  const roots = [];
  for (let code = 65; code <= 90; code += 1) {
    const drive = `${String.fromCharCode(code)}:\\`;
    try {
      if (fs.existsSync(drive)) {
        roots.push({ name: drive, path: drive, hasChildren: true });
      }
    } catch {}
  }

  return roots;
}

function listFolderChildren(folderPath) {
  const root = cleanText(folderPath);
  if (!root) {
    return [];
  }

  let entries;
  try {
    const stat = fs.statSync(root);
    if (!stat.isDirectory()) {
      return [];
    }
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const childPath = path.join(root, entry.name);
      return {
        name: entry.name,
        path: childPath,
        hasChildren: folderMayHaveChildren(childPath),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko-KR", { numeric: true }));
}

function folderMayHaveChildren(folderPath) {
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    return entries.some((entry) => entry.isDirectory());
  } catch {
    return false;
  }
}

async function scanThreats(sendProgress = null, options = {}) {
  if (process.platform !== "win32") {
    return {
      items: [],
      summary: "위험 소프트웨어 점검은 Windows에서만 동작합니다.",
      messages: ["이 점검은 백신을 대체하지 않습니다. Windows에서 1차 점검 용도로 사용하세요."],
    };
  }

  try {
    const customTargets = normalizeCustomTargets(options?.targets);
    const targetLabel = customTargets.length > 0 ? `사용자 지정 폴더 ${customTargets.length}개` : "기본 검사대상";
    publishProgress(sendProgress, "기본 점검 정보를 수집하고 있습니다.", "프로세스, 시작프로그램, 설치 프로그램 목록");
    const raw = JSON.parse((await runPowerShell(SCAN_SCRIPT, 20000)).trim());
    publishProgress(sendProgress, "기본 점검 정보를 수집했습니다.", `${countItems(raw.Processes)}개 프로세스, ${countItems(raw.Startup)}개 시작 항목, ${countItems(raw.Software)}개 설치 프로그램`);
    const baseItems = [
      ...flagSoftware(raw.Software),
      ...flagProcesses(raw.Processes),
      ...flagStartup(raw.Startup),
    ];
    publishProgress(sendProgress, "키워드 기반 1차 점검을 완료했습니다.", `의심 후보 ${baseItems.length}개`);
    publishProgress(sendProgress, "검사대상 폴더를 확인했습니다.", targetLabel);
    const defenderResult = await runDefenderScan(raw, sendProgress, customTargets);
    const yaraResult = await runYaraScan(raw, sendProgress, customTargets);
    const items = dedupeItems([...baseItems, ...defenderResult.items, ...yaraResult.items]);
    const messages = [...defenderResult.messages, ...yaraResult.messages].filter(Boolean);
    publishProgress(sendProgress, "위험 소프트웨어 점검을 마무리하고 있습니다.", `최종 의심 후보 ${items.length}개`);

    return { items, summary: summarize(items), messages };
  } catch (error) {
    return {
      items: [],
      summary: "위험 소프트웨어 점검을 끝내지 못했습니다.",
      messages: [`점검 정보를 읽지 못했습니다: ${error.message}`],
    };
  }
}

function flagSoftware(software) {
  const list = Array.isArray(software) ? software : [];
  const items = [];

  for (const rawName of list) {
    const name = cleanText(rawName);
    const keyword = matchKeyword(name);
    if (keyword) {
      items.push({
        name,
        source: "설치 프로그램",
        status: "fail",
        reason: `의심 키워드 "${keyword}" 포함`,
        detail: "정품 인증 우회·크랙류로 보이는 이름입니다.",
      });
    }
  }

  return items;
}

function flagProcesses(processes) {
  const list = Array.isArray(processes) ? processes : [];
  const items = [];

  for (const proc of list) {
    const name = cleanText(proc.Name);
    const pathText = cleanText(proc.Path);
    const keyword = matchKeyword(`${name} ${pathText}`);

    if (keyword) {
      items.push({
        name: name || pathText,
        source: "실행 중 프로그램",
        status: "fail",
        reason: `의심 키워드 "${keyword}" 포함`,
        detail: pathText,
      });
    } else if (isTempPath(pathText)) {
      items.push({
        name: name || pathText,
        source: "실행 중 프로그램",
        status: "warn",
        reason: "임시 폴더에서 실행 중",
        detail: pathText,
      });
    }
  }

  return items;
}

function flagStartup(startup) {
  const list = Array.isArray(startup) ? startup : [];
  const items = [];

  for (const entry of list) {
    const name = cleanText(entry.Name);
    const command = cleanText(entry.Command);
    const keyword = matchKeyword(`${name} ${command}`);

    if (keyword) {
      items.push({
        name: name || command,
        source: "자동 시작",
        status: "fail",
        reason: `의심 키워드 "${keyword}" 포함`,
        detail: command,
      });
    } else if (isTempPath(command)) {
      items.push({
        name: name || command,
        source: "자동 시작",
        status: "warn",
        reason: "임시 폴더에서 자동 실행",
        detail: command,
      });
    }
  }

  return items;
}

async function runDefenderScan(raw, sendProgress = null, customTargets = []) {
  const defender = findDefenderExecutable();
  if (!defender) {
    publishProgress(sendProgress, "Microsoft Defender 검사를 건너뜁니다.", "Defender 명령줄 도구를 찾지 못했습니다.");
    return {
      items: [],
      messages: ["Microsoft Defender 명령줄 도구를 찾지 못해 Defender 검사는 건너뛰었습니다."],
    };
  }

  const targets = getScanTargets(raw, customTargets).slice(0, SCAN_TARGET_LIMIT);
  if (targets.length === 0) {
    publishProgress(sendProgress, "Microsoft Defender 검사를 건너뜁니다.", "검사할 대상 폴더를 찾지 못했습니다.");
    return { items: [], messages: ["Microsoft Defender로 검사할 대상 폴더를 찾지 못했습니다."] };
  }

  publishProgress(sendProgress, "Microsoft Defender 검사를 시작합니다.", `${targets.length}개 대상`);
  const items = [];
  let completed = 0;
  for (const target of targets) {
    const args = ["-Scan", "-ScanType", "3", "-File", target.path, "-DisableRemediation", "-Timeout", "1"];
    publishProgress(sendProgress, `Microsoft Defender 검사 중: ${target.label}`, target.path);
    try {
      const { stdout, stderr } = await execFileAsync(defender, args, { timeout: DEFENDER_TIMEOUT, encoding: "utf8" });
      completed += 1;
      const output = trimOutput(`${stdout}\n${stderr}`);
      if (hasDefenderDetection(output)) {
        items.push({
          name: `Microsoft Defender 탐지 · ${target.label}`,
          source: "Microsoft Defender",
          status: "fail",
          reason: "Defender 검사 출력에서 위협 탐지 문구 확인",
          detail: output,
        });
      }
      publishProgress(sendProgress, `Microsoft Defender 검사 완료: ${target.label}`, output ? "검사 출력 확인 완료" : "탐지 문구 없음");
    } catch (error) {
      const output = trimOutput(`${error.stdout ?? ""}\n${error.stderr ?? ""}`) || error.message;
      const detected = hasDefenderDetection(output);
      items.push({
        name: detected ? `Microsoft Defender 탐지 · ${target.label}` : `Microsoft Defender 검사 실패 · ${target.label}`,
        source: "Microsoft Defender",
        status: detected ? "fail" : "warn",
        reason: detected ? "Defender 검사 출력에서 위협 탐지 문구 확인" : "Defender 검사를 정상 완료하지 못함",
        detail: output,
      });
      publishProgress(sendProgress, `Microsoft Defender 검사 확인 필요: ${target.label}`, output);
    }
  }

  return {
    items,
    messages: [`Microsoft Defender 검사 완료: ${completed}/${targets.length}개 대상`],
  };
}

async function runYaraScan(raw, sendProgress = null, customTargets = []) {
  if (!fs.existsSync(YARA_EXE) || !fs.existsSync(YARA_RULES)) {
    publishProgress(sendProgress, "YARA 룰 검사를 건너뜁니다.", "YARA 실행 파일 또는 룰 파일을 찾지 못했습니다.");
    return {
      items: [],
      messages: ["YARA 실행 파일 또는 룰 파일이 없어 YARA 검사는 건너뛰었습니다."],
    };
  }

  const targets = getScanTargets(raw, customTargets).slice(0, SCAN_TARGET_LIMIT);
  if (targets.length === 0) {
    publishProgress(sendProgress, "YARA 룰 검사를 건너뜁니다.", "검사할 대상 폴더를 찾지 못했습니다.");
    return { items: [], messages: ["YARA로 검사할 대상 폴더를 찾지 못했습니다."] };
  }

  const files = collectYaraCandidateFiles(targets);
  if (files.length === 0) {
    publishProgress(sendProgress, "YARA 룰 검사를 건너뜁니다.", "검사 대상 폴더에서 실행 파일이나 스크립트 파일을 찾지 못했습니다.");
    return { items: [], messages: ["YARA 검사 대상 파일이 없어 YARA 검사는 건너뛰었습니다."] };
  }

  const listPath = writeYaraScanList(files);
  publishProgress(sendProgress, "YARA 룰 검사를 시작합니다.", `${files.length}개 실행 파일/스크립트 대상`);
  const items = [];
  try {
    publishProgress(sendProgress, "YARA 룰 검사 중", `${files[0]} 외 ${Math.max(0, files.length - 1)}개 파일`);
    const { stdout } = await execFileAsync(YARA_EXE, ["--scan-list", YARA_RULES, listPath], {
      timeout: YARA_TIMEOUT,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 16,
    });
    const matches = parseYaraOutput(stdout);
    items.push(...matches);
    publishProgress(sendProgress, "YARA 룰 검사 완료", matches.length > 0 ? `탐지 ${matches.length}개` : "탐지 없음");
  } catch (error) {
    const output = trimOutput(error.stdout ?? "");
    if (output) {
      const matches = parseYaraOutput(output);
      items.push(...matches);
      publishProgress(sendProgress, "YARA 룰 검사 완료", `탐지 ${matches.length}개`);
    } else {
      items.push({
        name: "YARA 검사 실패",
        source: "YARA",
        status: "warn",
        reason: "YARA 검사를 정상 완료하지 못함",
        detail: trimOutput(error.stderr ?? error.message),
      });
      publishProgress(sendProgress, "YARA 룰 검사 확인 필요", trimOutput(error.stderr ?? error.message));
    }
  } finally {
    removeQuietly(listPath);
  }

  return {
    items,
    messages: [`YARA 룰 검사 완료: ${files.length}개 실행 파일/스크립트 대상`],
  };
}

function parseYaraOutput(output) {
  const items = [];
  const lines = String(output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const [ruleName, ...rest] = line.split(/\s+/);
    const matchedPath = rest.join(" ");
    if (!isYaraCandidateFile(matchedPath)) {
      continue;
    }

    const rule = YARA_RULE_DESCRIPTIONS[ruleName] ?? {
      status: "warn",
      reason: `YARA 룰 매칭: ${ruleName}`,
    };

    items.push({
      name: `YARA 탐지 · ${ruleName}`,
      source: "YARA",
      status: rule.status,
      reason: rule.reason,
      detail: matchedPath,
    });
  }

  return items;
}

function collectYaraCandidateFiles(targets) {
  const files = [];
  const seen = new Set();

  for (const target of targets) {
    collectPath(target.path);
    if (files.length >= YARA_MAX_FILES) {
      break;
    }
  }

  return files;

  function collectPath(targetPath) {
    if (files.length >= YARA_MAX_FILES) {
      return;
    }

    let stat;
    try {
      stat = fs.statSync(targetPath);
    } catch {
      return;
    }

    if (stat.isFile()) {
      addFile(targetPath, stat);
      return;
    }

    if (!stat.isDirectory()) {
      return;
    }

    let entries;
    try {
      entries = fs.readdirSync(targetPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= YARA_MAX_FILES) {
        return;
      }
      collectPath(path.join(targetPath, entry.name));
    }
  }

  function addFile(filePath, stat) {
    if (!isYaraCandidateFile(filePath) || stat.size > YARA_MAX_BYTES) {
      return;
    }

    const normalized = path.resolve(filePath).toLowerCase();
    if (seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    files.push(filePath);
  }
}

function isYaraCandidateFile(filePath) {
  const extension = path.extname(cleanText(filePath)).toLowerCase();
  return YARA_CANDIDATE_EXTENSIONS.has(extension);
}

function writeYaraScanList(files) {
  const listPath = path.join(os.tmpdir(), `magic-wand-yara-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(listPath, files.join(os.EOL), "utf8");
  return listPath;
}

function removeQuietly(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {}
}

function getScanTargets(raw, customTargets = []) {
  if (customTargets.length > 0) {
    return uniqueExistingTargets(
      customTargets.map((targetPath, index) => ({
        label: `사용자 지정 ${index + 1}`,
        path: targetPath,
      })),
    );
  }

  const targets = [
    { label: "다운로드", path: path.join(os.homedir(), "Downloads") },
    { label: "사용자 임시 폴더", path: os.tmpdir() },
    { label: "Windows 임시 폴더", path: path.join(process.env.SystemRoot || "C:\\Windows", "Temp") },
    {
      label: "사용자 시작프로그램",
      path: path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup"),
    },
    {
      label: "공용 시작프로그램",
      path: path.join(process.env.ProgramData || "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs", "StartUp"),
    },
    ...getStartupFileTargets(raw.Startup),
  ];

  return uniqueExistingTargets(targets);
}

function normalizeCustomTargets(targets) {
  const list = Array.isArray(targets) ? targets : [];
  const normalized = [];
  const seen = new Set();

  for (const target of list) {
    const targetPath = cleanText(target);
    if (!targetPath || !fs.existsSync(targetPath)) {
      continue;
    }

    let stat;
    try {
      stat = fs.statSync(targetPath);
    } catch {
      continue;
    }

    if (!stat.isDirectory()) {
      continue;
    }

    const resolved = path.resolve(targetPath);
    const key = resolved.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(resolved);
  }

  return normalized;
}

function getStartupFileTargets(startup) {
  return (Array.isArray(startup) ? startup : [])
    .map((entry) => ({
      label: `자동 시작 파일 · ${cleanText(entry.Name) || "이름 없음"}`,
      path: extractCommandPath(cleanText(entry.Command)),
    }))
    .filter((target) => target.path);
}

function extractCommandPath(command) {
  if (!command) {
    return "";
  }

  const quoted = command.match(/"([^"]+\.(?:exe|dll|ps1|bat|cmd|vbs|js|msi))"/i);
  if (quoted) {
    return quoted[1];
  }

  const unquoted = command.match(/[a-zA-Z]:\\[^\s]+\.(?:exe|dll|ps1|bat|cmd|vbs|js|msi)/i);
  return unquoted?.[0] ?? "";
}

function uniqueExistingTargets(targets) {
  const seen = new Set();
  const result = [];

  for (const target of targets) {
    const targetPath = cleanText(target.path);
    if (!targetPath || !fs.existsSync(targetPath)) {
      continue;
    }

    const normalized = path.resolve(targetPath).toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push({ label: target.label, path: targetPath });
  }

  return result;
}

function findDefenderExecutable() {
  const candidates = [];
  const platformRoot = path.join(process.env.ProgramData || "C:\\ProgramData", "Microsoft", "Windows Defender", "Platform");

  try {
    const platformDirs = fs
      .readdirSync(platformRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();

    for (const dir of platformDirs) {
      candidates.push(path.join(platformRoot, dir, "MpCmdRun.exe"));
    }
  } catch {}

  candidates.push(path.join(process.env.ProgramFiles || "C:\\Program Files", "Windows Defender", "MpCmdRun.exe"));

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? "";
}

function hasDefenderDetection(output) {
  const text = String(output ?? "").toLowerCase();
  if (!text || text.includes("found no threats") || text.includes("no threats")) {
    return false;
  }

  return /threat|detected|malware|virus|found|위협|탐지|악성/.test(text);
}

function publishProgress(sendProgress, message, detail = "") {
  if (!sendProgress) {
    return;
  }

  sendProgress({
    message,
    detail,
    time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  });
}

function countItems(value) {
  return Array.isArray(value) ? value.length : value ? 1 : 0;
}

function dedupeItems(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = [item.source, item.name, item.reason, item.detail].map(cleanText).join("|").toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}

function trimOutput(output) {
  const text = String(output ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  return text.length > 900 ? `${text.slice(0, 900)}...` : text;
}

function matchKeyword(text) {
  const lower = String(text ?? "").toLowerCase();
  return SUSPICIOUS_KEYWORDS.find((keyword) => lower.includes(keyword)) ?? "";
}

function isTempPath(text) {
  const lower = String(text ?? "").toLowerCase();
  return TEMP_PATH_HINTS.some((hint) => lower.includes(hint));
}

function summarize(items) {
  if (items.length === 0) {
    return "뚜렷한 의심 항목을 찾지 못했습니다. (Defender와 YARA 보조 검사를 포함했습니다.)";
  }

  const danger = items.filter((item) => item.status === "fail").length;
  if (danger > 0) {
    return `의심 항목 ${items.length}개를 찾았습니다(강한 의심 ${danger}개). 반드시 백신 검사와 함께 확인해 주세요.`;
  }
  return `주의해서 볼 항목 ${items.length}개가 있습니다. 백신 검사와 함께 확인해 주세요.`;
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
