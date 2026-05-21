const { app } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const { isIPv4 } = require("./network");

function register(ipcMain) {
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

module.exports = {
  register,
};
