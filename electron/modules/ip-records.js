const { app } = require("electron");
const fs = require("fs/promises");

const { getDataFileForRead, getDataFileForWrite } = require("../core/portable-data");
const { isIPv4 } = require("./network");

function register(ipcMain) {
  ipcMain.handle("records:load", async () => {
    try {
      const text = await fs.readFile(await getDataFileForRead(app, "ip_records.json"), "utf-8");
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
    const filePath = await getDataFileForWrite(app, "ip_records.json");
    await fs.writeFile(filePath, JSON.stringify(cleanRecords, null, 2), "utf-8");
    return cleanRecords;
  });
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
