const { runPowerShell } = require("../core/run-command");

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
  ipcMain.handle("threat:scan", async () => scanThreats());
}

async function scanThreats() {
  if (process.platform !== "win32") {
    return {
      items: [],
      summary: "의심 프로그램 점검은 Windows에서만 동작합니다.",
      messages: ["이 점검은 백신을 대체하지 않습니다. Windows에서 1차 점검 용도로 사용하세요."],
    };
  }

  try {
    const raw = JSON.parse((await runPowerShell(SCAN_SCRIPT, 20000)).trim());
    const items = [
      ...flagSoftware(raw.Software),
      ...flagProcesses(raw.Processes),
      ...flagStartup(raw.Startup),
    ];

    return { items, summary: summarize(items), messages: [] };
  } catch (error) {
    return {
      items: [],
      summary: "의심 프로그램 점검을 끝내지 못했습니다.",
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
    const path = cleanText(proc.Path);
    const keyword = matchKeyword(`${name} ${path}`);

    if (keyword) {
      items.push({
        name: name || path,
        source: "실행 중 프로그램",
        status: "fail",
        reason: `의심 키워드 "${keyword}" 포함`,
        detail: path,
      });
    } else if (isTempPath(path)) {
      items.push({
        name: name || path,
        source: "실행 중 프로그램",
        status: "warn",
        reason: "임시 폴더에서 실행 중",
        detail: path,
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
    return "뚜렷한 의심 항목을 찾지 못했습니다. (이 점검은 백신을 대체하지 않습니다.)";
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
