const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");

const ipRecords = require("./modules/ip-records");
const network = require("./modules/network");
const systemInfo = require("./modules/system-info");

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
  ipRecords.register(ipcMain);
  network.register(ipcMain);
  systemInfo.register(ipcMain);

  ipcMain.on("app:quit", () => {
    app.quit();
  });
}
