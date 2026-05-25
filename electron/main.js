const { app, BrowserWindow, ipcMain, Menu, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const ipRecords = require("./modules/ip-records");
const network = require("./modules/network");
const systemInfo = require("./modules/system-info");
const hardwareCheck = require("./modules/hardware-check");
const threatScan = require("./modules/threat-scan");
const controlPanel = require("./modules/control-panel");
const windowsTools = require("./modules/windows-tools");
const printer = require("./modules/printer");
const share = require("./modules/share");
const security = require("./modules/security");
const secureErase = require("./modules/secure-erase");
const formMaker = require("./modules/form-maker");
const fileTools = require("./modules/file-tools");
const fileRename = require("./modules/file-rename");
const settingsBackup = require("./modules/settings-backup");
const winUpdate = require("./modules/win-update");
const startupApps = require("./modules/startup-apps");
const recovery = require("./modules/recovery");
const asset = require("./modules/asset");
const health = require("./modules/health");
const cleanup = require("./modules/cleanup");
const driver = require("./modules/driver");
const eventLog = require("./modules/event-log");
const swLicense = require("./modules/sw-license");
const netMonitor = require("./modules/net-monitor");
const uiSettings = require("./modules/ui-settings");
const achievements = require("./modules/achievements");
const remote = require("./modules/remote");
const adminWork = require("./modules/admin-work");
const license = require("./modules/license");

let mainWindow = null;
let lockWindow = null;
let lastGate = null;
const WINDOW_TITLE = "Magic WAND";

app.setName(WINDOW_TITLE);

function getWindowIcon() {
  const iconPath = path.join(__dirname, "..", "build", "LOGO.png");
  return fs.existsSync(iconPath) ? iconPath : undefined;
}

// 정품키 게이트는 패키징된 빌드에서만 강제한다.
// 개발 중(electron .)에는 건너뛴다. (MW_FORCE_GATE=1로 강제 가능)
function gateEnabled() {
  return app.isPackaged || process.env.MW_FORCE_GATE === "1";
}

function createMainWindow() {
  const windowIcon = getWindowIcon();
  mainWindow = new BrowserWindow({
    title: WINDOW_TITLE,
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    show: false,
    frame: false,
    fullscreen: false,
    autoHideMenuBar: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    closable: true,
    backgroundColor: "#f4f7fb",
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("page-title-updated", (event) => {
    event.preventDefault();
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

function createLockWindow() {
  const windowIcon = getWindowIcon();
  lockWindow = new BrowserWindow({
    title: WINDOW_TITLE,
    width: 460,
    height: 580,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    backgroundColor: "#f4f7fb",
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  lockWindow.on("page-title-updated", (event) => {
    event.preventDefault();
  });

  lockWindow.loadFile(path.join(__dirname, "..", "renderer", "lock.html"));
}

// 로그인/해제 성공 → 잠금 창을 닫고 본 화면으로 전환
function enterApp() {
  createMainWindow();
  if (lockWindow && !lockWindow.isDestroyed()) {
    lockWindow.close();
  }
  lockWindow = null;
}

app.whenReady().then(() => {
  registerIpcHandlers();
  registerLicenseHandlers();
  Menu.setApplicationMenu(null);

  if (!gateEnabled()) {
    createMainWindow();
  } else {
    lastGate = license.evaluateStartup(app);
    createLockWindow();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (!gateEnabled() || mainWindow) {
        createMainWindow();
      } else {
        createLockWindow();
      }
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function registerIpcHandlers() {
  ipRecords.register(ipcMain);
  network.register(ipcMain);
  systemInfo.register(ipcMain);
  hardwareCheck.register(ipcMain);
  threatScan.register(ipcMain);
  controlPanel.register(ipcMain);
  windowsTools.register(ipcMain);
  printer.register(ipcMain);
  share.register(ipcMain);
  security.register(ipcMain);
  secureErase.register(ipcMain);
  formMaker.register(ipcMain);
  fileTools.register(ipcMain);
  fileRename.register(ipcMain);
  settingsBackup.register(ipcMain);
  winUpdate.register(ipcMain);
  startupApps.register(ipcMain);
  recovery.register(ipcMain);
  asset.register(ipcMain);
  health.register(ipcMain);
  cleanup.register(ipcMain);
  driver.register(ipcMain);
  eventLog.register(ipcMain);
  swLicense.register(ipcMain);
  netMonitor.register(ipcMain);
  uiSettings.register(ipcMain);
  achievements.register(ipcMain);
  remote.register(ipcMain);
  adminWork.register(ipcMain);

  ipcMain.handle("export:pdf", exportPdf);

  ipcMain.on("window:minimize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
  });

  ipcMain.on("window:toggle-maximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !win.isMaximizable()) return;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.on("window:close", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });

  ipcMain.on("app:quit", () => {
    app.quit();
  });
}

function sanitizeFileName(value, fallback) {
  const text = String(value || "").trim() || fallback;
  return text
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 90)
    .trim() || fallback;
}

async function exportPdf(event, payload = {}) {
  payload = payload || {};
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    throw new Error("PDF로 저장할 창을 찾지 못했습니다.");
  }

  const defaultName = `${sanitizeFileName(payload.defaultFileName, "MagicWAND_문서")}.pdf`;
  const picked = await dialog.showSaveDialog(win, {
    title: "PDF 저장",
    defaultPath: path.join(app.getPath("documents"), defaultName),
    filters: [{ name: "PDF 문서", extensions: ["pdf"] }],
  });
  if (picked.canceled || !picked.filePath) {
    return { canceled: true };
  }

  let filePath = picked.filePath;
  if (path.extname(filePath).toLowerCase() !== ".pdf") {
    filePath += ".pdf";
  }

  const data = await win.webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
    pageSize: "A4",
  });
  await fs.promises.writeFile(filePath, data);
  return { canceled: false, filePath };
}

function registerLicenseHandlers() {
  // 잠금 창이 로드되며 현재 상태를 조회
  ipcMain.handle("license:status", () => lastGate || { status: "ok-needs-login" });

  // 계정/암호 로그인
  ipcMain.handle("license:login", (_event, { account, password }) => {
    const result = license.tryLogin(app, account, password);
    if (result.ok) enterApp();
    return result;
  });

  // 마스터 해제키 파일 선택 → 잠금 해제
  ipcMain.handle("license:unlock", async () => {
    const picked = await dialog.showOpenDialog(lockWindow, {
      title: "마스터 해제키 선택",
      filters: [{ name: "정품키 파일", extensions: ["lic"] }],
      properties: ["openFile"],
    });
    if (picked.canceled || !picked.filePaths[0]) return { ok: false, reason: "canceled" };
    let raw;
    try {
      raw = fs.readFileSync(picked.filePaths[0], "utf8");
    } catch {
      return { ok: false, reason: "read-error" };
    }
    const result = license.tryUnlock(app, raw);
    if (result.ok) lastGate = license.evaluateStartup(app);
    return { ...result, status: lastGate ? lastGate.status : undefined };
  });

  // 잠금 화면에서 종료
  ipcMain.on("license:quit", () => app.quit());
}
