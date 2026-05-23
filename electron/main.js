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

app.setName("Magic WAND");

// 정품키 게이트는 패키징된 빌드에서만 강제한다.
// 개발 중(electron .)에는 건너뛴다. (MW_FORCE_GATE=1로 강제 가능)
function gateEnabled() {
  return app.isPackaged || process.env.MW_FORCE_GATE === "1";
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: "Magic WAND",
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    show: false,
    fullscreen: false,
    autoHideMenuBar: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    closable: true,
    backgroundColor: "#f4f7fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

function createLockWindow() {
  lockWindow = new BrowserWindow({
    title: "Magic WAND",
    width: 460,
    height: 580,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    backgroundColor: "#f4f7fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
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

  ipcMain.on("app:quit", () => {
    app.quit();
  });
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
