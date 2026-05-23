const fs = require("fs/promises");
const path = require("path");

const { runPowerShell } = require("../core/run-command");

function psQuote(value) {
  return "'" + String(value ?? "").replace(/'/g, "''") + "'";
}

function dateStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function safeName(value, fallback) {
  const text = String(value || fallback || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ");
  return text || fallback;
}

async function listDrivers() {
  if (process.platform !== "win32") {
    return { drivers: [], message: "드라이버 목록 조회는 Windows에서 사용할 수 있습니다." };
  }

  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
Get-CimInstance Win32_PnPSignedDriver |
  Where-Object { $_.DeviceName } |
  Select-Object DeviceName, Manufacturer, DriverVersion, DriverDate, InfName, DeviceClass |
  Sort-Object DeviceClass, DeviceName |
  ConvertTo-Json -Depth 3
`;
  const output = (await runPowerShell(script, 45000)).trim();
  const rows = output ? JSON.parse(output) : [];
  const drivers = arrayify(rows).map((item) => ({
    name: clean(item.DeviceName),
    manufacturer: clean(item.Manufacturer),
    version: clean(item.DriverVersion),
    date: normalizeDate(item.DriverDate),
    infName: clean(item.InfName),
    className: clean(item.DeviceClass),
  }));
  return { drivers, count: drivers.length };
}

async function exportDrivers(event, payload = {}) {
  if (process.platform !== "win32") {
    throw new Error("드라이버 백업은 Windows에서 사용할 수 있습니다.");
  }

  const destinationDir = String(payload.destinationDir || "").trim();
  if (!destinationDir) {
    throw new Error("저장할 폴더를 선택해 주세요.");
  }

  const folderName = safeName(payload.folderName, `MagicWAND_Drivers_${dateStamp()}`);
  const targetDir = path.join(destinationDir, folderName);
  await fs.mkdir(targetDir, { recursive: true });

  sendProgress(event, {
    jobId: payload.jobId,
    phase: "preparing",
    percent: 10,
    message: "드라이버 백업 폴더를 준비했습니다.",
  });

  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
Export-WindowsDriver -Online -Destination ${psQuote(targetDir)} | Out-Null
`;

  sendProgress(event, {
    jobId: payload.jobId,
    phase: "running",
    percent: 45,
    message: "Windows 드라이버를 추출하는 중입니다.",
  });

  await runPowerShell(script, 10 * 60 * 1000);
  const exportedCount = await countFiles(targetDir);

  sendProgress(event, {
    jobId: payload.jobId,
    phase: "done",
    percent: 100,
    message: "드라이버 백업이 완료됐습니다.",
  });

  return {
    destination: targetDir,
    exportedCount,
  };
}

async function countFiles(root) {
  let count = 0;
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(target);
      } else if (entry.isFile()) {
        count += 1;
      }
    }
  }
  await walk(root);
  return count;
}

function normalizeDate(value) {
  const text = clean(value);
  if (!text) return "";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toISOString().slice(0, 10);
}

function clean(value) {
  return String(value ?? "").trim();
}

function arrayify(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function sendProgress(event, payload) {
  if (!event?.sender || event.sender.isDestroyed()) {
    return;
  }
  event.sender.send("driver:progress", payload);
}

function register(ipcMain) {
  ipcMain.handle("driver:list", () => listDrivers());
  ipcMain.handle("driver:export", (event, payload) => exportDrivers(event, payload));
}

module.exports = {
  register,
};
