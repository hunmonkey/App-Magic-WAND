const { app } = require("electron");
const fs = require("fs/promises");
const { getDataFileForRead, getDataFileForWrite } = require("../core/portable-data");

// 자산 대장은 form-maker처럼 파일을 나눌 만큼 무겁지 않으므로
// ip-records와 같은 단일 JSON 배열로 보관한다.
const DATA_FILE = "assets.json";

function normalize(entry) {
  return {
    id: String(entry?.id ?? "").trim() || makeId(),
    assetTag: String(entry?.assetTag ?? "").trim(),
    name: String(entry?.name ?? "").trim(),
    ip: String(entry?.ip ?? "").trim(),
    spec: String(entry?.spec ?? "").trim(),
    location: String(entry?.location ?? "").trim(),
    owner: String(entry?.owner ?? "").trim(),
    purchaseDate: String(entry?.purchaseDate ?? "").trim(),
    warrantyEnd: String(entry?.warrantyEnd ?? "").trim(),
    memo: String(entry?.memo ?? "").trim(),
    updatedAt: String(entry?.updatedAt ?? "").trim(),
  };
}

function makeId() {
  return `asset-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

async function load() {
  try {
    const text = await fs.readFile(await getDataFileForRead(app, DATA_FILE), "utf-8");
    const list = JSON.parse(text);
    return Array.isArray(list) ? list.map(normalize) : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function save(list) {
  const normalized = Array.isArray(list) ? list.map(normalize) : [];
  await fs.writeFile(await getDataFileForWrite(app, DATA_FILE), JSON.stringify(normalized, null, 2), "utf-8");
  return normalized;
}

function register(ipcMain) {
  ipcMain.handle("asset:load", () => load());
  ipcMain.handle("asset:save", (_event, list) => save(list));
}

module.exports = {
  register,
};
