const { app } = require("electron");
const fs = require("fs/promises");

const { runPowerShell } = require("../core/run-command");
const { getDataFileForRead, getDataFileForWrite } = require("../core/portable-data");

// 비활성화한 시작 항목은 레지스트리에서 빼되, 되돌릴 수 있도록 이 파일에 보관한다.
const DATA_FILE = "startup_disabled.json";

const SCOPES = {
  HKCU: "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
  HKLM: "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
  HKLM32: "HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Run",
};

const SCOPE_LABEL = {
  HKCU: "현재 사용자",
  HKLM: "모든 사용자",
  HKLM32: "모든 사용자(32비트)",
};

function psQuote(value) {
  return "'" + String(value ?? "").replace(/'/g, "''") + "'";
}

const LIST_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$keys = @(
  @{ scope = 'HKCU';   path = '${SCOPES.HKCU}' },
  @{ scope = 'HKLM';   path = '${SCOPES.HKLM}' },
  @{ scope = 'HKLM32'; path = '${SCOPES.HKLM32}' }
)
$items = @()
foreach ($k in $keys) {
  if (Test-Path $k.path) {
    $props = Get-ItemProperty -Path $k.path
    foreach ($p in $props.PSObject.Properties) {
      if ($p.Name -notmatch '^PS') {
        $items += [pscustomobject]@{ scope = $k.scope; name = $p.Name; command = [string]$p.Value }
      }
    }
  }
}
$items | ConvertTo-Json -Compress
`;

async function readDisabled() {
  try {
    const text = await fs.readFile(await getDataFileForRead(app, DATA_FILE), "utf-8");
    const list = JSON.parse(text);
    return Array.isArray(list) ? list : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    return [];
  }
}

async function writeDisabled(list) {
  await fs.writeFile(await getDataFileForWrite(app, DATA_FILE), JSON.stringify(list, null, 2), "utf-8");
}

function toArray(parsed) {
  if (!parsed) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function list() {
  let enabled = [];
  try {
    const out = await runPowerShell(LIST_SCRIPT, 30000);
    enabled = toArray(JSON.parse(String(out).trim() || "[]"));
  } catch {
    enabled = [];
  }

  const enabledItems = enabled
    .filter((item) => item && item.name)
    .map((item) => ({
      scope: item.scope,
      scopeLabel: SCOPE_LABEL[item.scope] || item.scope,
      name: String(item.name),
      command: String(item.command || ""),
      enabled: true,
    }));

  const enabledKeys = new Set(enabledItems.map((item) => `${item.scope}|${item.name.toLowerCase()}`));
  const disabled = await readDisabled();
  const disabledItems = disabled
    .filter((item) => item && item.name && !enabledKeys.has(`${item.scope}|${String(item.name).toLowerCase()}`))
    .map((item) => ({
      scope: item.scope,
      scopeLabel: SCOPE_LABEL[item.scope] || item.scope,
      name: String(item.name),
      command: String(item.command || ""),
      enabled: false,
    }));

  return [...enabledItems, ...disabledItems].sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

async function toggle(_event, payload = {}) {
  const { scope, name, command = "", action } = payload;
  const path = SCOPES[scope];
  if (!path) {
    throw new Error("알 수 없는 시작 항목 위치입니다.");
  }
  if (!name) {
    throw new Error("시작 항목 이름이 없습니다.");
  }

  if (action === "disable") {
    await runPowerShell(
      `$ErrorActionPreference='Stop'; Remove-ItemProperty -LiteralPath ${psQuote(path)} -Name ${psQuote(name)}`,
      30000,
    );
    const disabled = await readDisabled();
    if (!disabled.some((item) => item.scope === scope && String(item.name).toLowerCase() === name.toLowerCase())) {
      disabled.push({ scope, name, command });
      await writeDisabled(disabled);
    }
  } else if (action === "enable") {
    await runPowerShell(
      `$ErrorActionPreference='Stop'; Set-ItemProperty -LiteralPath ${psQuote(path)} -Name ${psQuote(name)} -Value ${psQuote(command)}`,
      30000,
    );
    const disabled = await readDisabled();
    await writeDisabled(disabled.filter((item) => !(item.scope === scope && String(item.name).toLowerCase() === name.toLowerCase())));
  } else {
    throw new Error("알 수 없는 동작입니다.");
  }

  return list();
}

function register(ipcMain) {
  ipcMain.handle("startup:list", () => list());
  ipcMain.handle("startup:toggle", (event, payload) => toggle(event, payload));
}

module.exports = {
  register,
};
