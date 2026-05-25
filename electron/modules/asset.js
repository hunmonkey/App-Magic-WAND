const { app } = require("electron");
const fs = require("fs/promises");
const { getDataFileForRead, getDataFileForWrite } = require("../core/portable-data");

// 자산 정보는 아직 DB가 필요할 만큼 크지 않으므로 단일 JSON 배열로 보관한다.
const DATA_FILE = "assets.json";
const ASSET_TYPES = new Set(["pc", "laptop", "monitor", "mfp", "nas"]);
const LEGACY_TYPE_MAP = {
  printer: "mfp",
  other: "pc",
};

const STRING_FIELDS = [
  "id",
  "type",
  "assetTag",
  "name",
  "manufacturer",
  "model",
  "serialNumber",
  "status",
  "department",
  "owner",
  "location",
  "ip",
  "purchaseDate",
  "purchaseAmount",
  "evidence",
  "warrantyEnd",
  "cpu",
  "ram",
  "motherboard",
  "vga",
  "ssd",
  "hdd",
  "nic",
  "power",
  "os",
  "screenSize",
  "resolution",
  "panelType",
  "ports",
  "connectedAsset",
  "batteryHealth",
  "printType",
  "colorMode",
  "connectionType",
  "tonerModel",
  "printCounter",
  "scanFax",
  "diskBays",
  "storage",
  "raid",
  "backupTarget",
  "adminUrl",
  "repairHistory",
  "memo",
  "createdAt",
  "updatedAt",
];

function normalize(entry) {
  const normalized = {};
  for (const field of STRING_FIELDS) {
    normalized[field] = String(entry?.[field] ?? "").trim();
  }
  normalized.id = normalized.id || makeId();
  normalized.type = normalizeType(entry?.type);
  normalized.status = normalized.status || "사용중";

  // 예전 "사양·모델" 한 줄 입력값은 새 상세 사양 칸으로 최대한 보존한다.
  if (!normalized.model && entry?.spec) {
    normalized.model = String(entry.spec).trim();
  }
  if (!normalized.cpu && entry?.spec && normalized.type === "pc") {
    normalized.cpu = String(entry.spec).trim();
  }

  return normalized;
}

function normalizeType(type) {
  const value = String(type ?? "").trim();
  const mapped = LEGACY_TYPE_MAP[value] || value;
  return ASSET_TYPES.has(mapped) ? mapped : "pc";
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
