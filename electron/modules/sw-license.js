const { app } = require("electron");
const fs = require("fs/promises");
const path = require("path");

function getDataDir() {
  if (app.isPackaged) {
    return app.getPath("userData");
  }
  return path.join(app.getAppPath(), "data");
}

function getFilePath() {
  return path.join(getDataDir(), "sw_licenses.json");
}

function makeId() {
  return `swlic-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalize(entry) {
  const seats = Number(entry?.seats);
  return {
    id: String(entry?.id ?? "").trim() || makeId(),
    product: String(entry?.product ?? "").trim(),
    vendor: String(entry?.vendor ?? "").trim(),
    key: String(entry?.key ?? "").trim(),
    seats: Number.isFinite(seats) && seats > 0 ? Math.floor(seats) : 1,
    purchaseDate: String(entry?.purchaseDate ?? "").trim(),
    expireDate: String(entry?.expireDate ?? "").trim(),
    note: String(entry?.note ?? "").trim(),
    updatedAt: String(entry?.updatedAt ?? "").trim(),
  };
}

async function list() {
  try {
    const text = await fs.readFile(getFilePath(), "utf-8");
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr.map(normalize) : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeAll(items) {
  await fs.mkdir(getDataDir(), { recursive: true });
  await fs.writeFile(getFilePath(), JSON.stringify(items.map(normalize), null, 2), "utf-8");
}

async function save(payload) {
  const entry = normalize({ ...payload, updatedAt: new Date().toISOString() });
  if (!entry.product) {
    throw new Error("제품명을 입력해 주세요.");
  }

  const items = await list();
  const index = items.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    items[index] = entry;
  } else {
    items.unshift(entry);
  }
  await writeAll(items);
  return items;
}

async function remove(id) {
  const safeId = String(id ?? "").trim();
  const items = (await list()).filter((item) => item.id !== safeId);
  await writeAll(items);
  return items;
}

function register(ipcMain) {
  ipcMain.handle("swLicense:list", () => list());
  ipcMain.handle("swLicense:save", (_event, payload) => save(payload));
  ipcMain.handle("swLicense:delete", (_event, id) => remove(id));
}

module.exports = {
  register,
};
