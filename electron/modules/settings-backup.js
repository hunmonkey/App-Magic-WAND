const { app, BrowserWindow, dialog } = require("electron");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const { runPowerShell } = require("../core/run-command");
const { getDataDir, ensureDataDir } = require("../core/portable-data");

// 복원(덮어쓰기) 요청은 이 토큰이 있어야만 동작한다.
const RESTORE_TOKEN = "settings-restore-confirmed";

// 정품키·인증 파일은 기기에 종속되고 민감하므로 백업/복원에서 모두 제외한다.
const EXCLUDE = new Set(["magicwand.lic", ".mwstate", ".mwsecret"]);

function psQuote(value) {
  return "'" + String(value ?? "").replace(/'/g, "''") + "'";
}

function dateStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

async function exportBackup(event) {
  const dataDir = getDataDir(app);

  let entries;
  try {
    entries = await fsp.readdir(dataDir, { withFileTypes: true });
  } catch {
    throw new Error("백업할 설정 자료가 아직 없습니다.");
  }

  const includePaths = entries
    .filter((entry) => !EXCLUDE.has(entry.name.toLowerCase()))
    .map((entry) => path.join(dataDir, entry.name));
  if (!includePaths.length) {
    throw new Error("백업할 자료가 없습니다.");
  }

  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    title: "설정 백업 저장",
    defaultPath: `MagicWAND_설정백업_${dateStamp()}.zip`,
    filters: [{ name: "ZIP 압축", extensions: ["zip"] }],
  });
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  const sources = includePaths.map(psQuote).join(", ");
  await runPowerShell(
    `$ErrorActionPreference='Stop'; Compress-Archive -LiteralPath ${sources} -DestinationPath ${psQuote(result.filePath)} -Force`,
    120000,
  );
  return { canceled: false, filePath: result.filePath, count: includePaths.length };
}

async function importBackup(event, payload = {}) {
  if (payload.token !== RESTORE_TOKEN) {
    throw new Error("복원 확인이 필요합니다.");
  }

  const win = BrowserWindow.fromWebContents(event.sender);
  const picked = await dialog.showOpenDialog(win, {
    title: "복원할 설정 백업(ZIP) 선택",
    filters: [{ name: "ZIP 압축", extensions: ["zip"] }],
    properties: ["openFile"],
  });
  if (picked.canceled || !picked.filePaths[0]) {
    return { canceled: true };
  }

  const dataDir = await ensureDataDir(app);
  const tempDir = path.join(os.tmpdir(), `mw_restore_${Date.now()}`);
  await fsp.mkdir(tempDir, { recursive: true });

  try {
    await runPowerShell(
      `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath ${psQuote(picked.filePaths[0])} -DestinationPath ${psQuote(tempDir)} -Force`,
      120000,
    );

    // 정품키·인증 파일은 복원하지 않는다.
    await fsp.cp(tempDir, dataDir, {
      recursive: true,
      force: true,
      filter: (src) => !EXCLUDE.has(path.basename(src).toLowerCase()),
    });

    const restoredEntries = await fsp.readdir(tempDir).catch(() => []);
    const restored = restoredEntries.filter((name) => !EXCLUDE.has(name.toLowerCase())).length;
    return { canceled: false, restored };
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function register(ipcMain) {
  ipcMain.handle("settingsBackup:export", (event) => exportBackup(event));
  ipcMain.handle("settingsBackup:import", (event, payload) => importBackup(event, payload));
}

module.exports = {
  register,
};
