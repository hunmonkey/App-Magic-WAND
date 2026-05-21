const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const {
  isIPv4,
  runNetworkDiagnostics,
  scanAddressUsage,
  scanCurrentNetwork,
} = require("./network");

let mainWindow = null;

app.setName("Magic WAND");

function createWindow() {
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

app.whenReady().then(() => {
  registerIpcHandlers();
  Menu.setApplicationMenu(buildApplicationMenu());
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

function buildApplicationMenu() {
  return Menu.buildFromTemplate([
    {
      label: "파일",
      submenu: [
        {
          label: "종료",
          accelerator: "Alt+F4",
          click: () => app.quit(),
        },
      ],
    },
    {
      label: "창",
      submenu: [
        {
          label: "최소화",
          accelerator: "Ctrl+M",
          click: () => {
            getActiveWindow()?.minimize();
          },
        },
        {
          label: "최대화/복원",
          click: () => {
            const window = getActiveWindow();
            if (!window) {
              return;
            }

            if (window.isMaximized()) {
              window.unmaximize();
            } else {
              window.maximize();
            }
          },
        },
        {
          label: "기본 크기로 조정",
          click: () => {
            const window = getActiveWindow();
            if (!window) {
              return;
            }

            if (window.isMaximized()) {
              window.unmaximize();
            }
            window.setSize(1180, 760);
            window.center();
          },
        },
      ],
    },
  ]);
}

function getActiveWindow() {
  return BrowserWindow.getFocusedWindow() ?? mainWindow;
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function registerIpcHandlers() {
  ipcMain.handle("records:load", async () => {
    try {
      const text = await fs.readFile(getDataFilePath(), "utf-8");
      const records = JSON.parse(text);
      return Array.isArray(records) ? records.map(normalizeRecord) : [];
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  });

  ipcMain.handle("records:save", async (_event, records) => {
    const cleanRecords = Array.isArray(records) ? records.map(normalizeRecord) : [];
    const filePath = getDataFilePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(cleanRecords, null, 2), "utf-8");
    return cleanRecords;
  });

  ipcMain.handle("network:scan", async () => scanCurrentNetwork());
  ipcMain.handle("network:scan-addresses", async (_event, interfaceId) => scanAddressUsage(interfaceId));
  ipcMain.handle("network:diagnose", async (_event, interfaceId) => runNetworkDiagnostics(interfaceId));
  ipcMain.on("app:quit", () => {
    app.quit();
  });
}

function getDataFilePath() {
  if (app.isPackaged) {
    return path.join(app.getPath("userData"), "ip_records.json");
  }

  return path.join(app.getAppPath(), "data", "ip_records.json");
}

function normalizeRecord(record) {
  return {
    name: String(record?.name ?? "").trim(),
    ipAddress: normalizeIp(String(record?.ipAddress ?? record?.ip_address ?? "").trim()),
    location: String(record?.location ?? "").trim(),
    memo: String(record?.memo ?? "").trim(),
  };
}

function normalizeIp(value) {
  if (!isIPv4(value)) {
    throw new Error("올바른 IPv4 주소 형식이 아닙니다.");
  }
  return value
    .split(".")
    .map((part) => String(Number(part)))
    .join(".");
}
