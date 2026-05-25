const { app, Notification } = require("electron");
const fs = require("fs/promises");
const { getDataFileForRead, getDataFileForWrite } = require("../core/portable-data");

const DATA_FILE = "ui_settings.json";

function defaults() {
  return {
    soundEnabled: true,
    desktopNotificationEnabled: false,
    animationEnabled: true,
  };
}

function normalize(value) {
  return {
    ...defaults(),
    soundEnabled: value?.soundEnabled !== false,
    desktopNotificationEnabled: value?.desktopNotificationEnabled === true,
    animationEnabled: value?.animationEnabled !== false,
  };
}

async function get() {
  try {
    const text = await fs.readFile(await getDataFileForRead(app, DATA_FILE), "utf-8");
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
  await fs.writeFile(await getDataFileForWrite(app, DATA_FILE), JSON.stringify(normalized, null, 2), "utf-8");
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
