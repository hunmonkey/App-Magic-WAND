const { app, Notification } = require("electron");
const fs = require("fs/promises");
const path = require("path");

function getDataDir() {
  if (app.isPackaged) {
    return app.getPath("userData");
  }
  return path.join(app.getAppPath(), "data");
}

function getFilePath() {
  return path.join(getDataDir(), "ui_settings.json");
}

function defaults() {
  return {
    soundEnabled: true,
    desktopNotificationEnabled: false,
  };
}

function normalize(value) {
  return {
    ...defaults(),
    soundEnabled: value?.soundEnabled !== false,
    desktopNotificationEnabled: value?.desktopNotificationEnabled === true,
  };
}

async function get() {
  try {
    const text = await fs.readFile(getFilePath(), "utf-8");
    return normalize(JSON.parse(text));
  } catch (error) {
    if (error.code === "ENOENT") {
      return defaults();
    }
    throw error;
  }
}

async function save(settings) {
  const normalized = normalize(settings);
  await fs.mkdir(getDataDir(), { recursive: true });
  await fs.writeFile(getFilePath(), JSON.stringify(normalized, null, 2), "utf-8");
  return normalized;
}

async function notify(payload) {
  const settings = await get();
  if (!settings.desktopNotificationEnabled || !Notification.isSupported()) {
    return { shown: false };
  }
  const title = String(payload?.title || "Magic WAND").trim();
  const body = String(payload?.body || "").trim();
  if (!body) {
    return { shown: false };
  }
  new Notification({ title, body }).show();
  return { shown: true };
}

function register(ipcMain) {
  ipcMain.handle("uiSettings:get", () => get());
  ipcMain.handle("uiSettings:save", (_event, settings) => save(settings));
  ipcMain.handle("uiSettings:notify", (_event, payload) => notify(payload));
}

module.exports = {
  register,
};
