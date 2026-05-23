const { app } = require("electron");
const fsSync = require("fs");
const fs = require("fs/promises");
const path = require("path");

const { getDataFileForRead, getDataFileForWrite } = require("../core/portable-data");
const { execFileAsync, runPowerShell } = require("../core/run-command");

const TOOLS_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "tools")
  : path.join(__dirname, "..", "..", "tools");
const SENSOR_HELPER_EXE = path.join(TOOLS_DIR, "hardware-probe", "MagicWandHardwareProbe.exe");
const SENSOR_HELPER_SCRIPT = path.join(TOOLS_DIR, "hardware-probe", "MagicWandHardwareProbe.ps1");

// 건강 점수 자체는 화면(renderer)에서 기존 점검 API를 모아 계산한다.
// 이 모듈은 그 결과 스냅샷을 저장/불러오기/삭제만 담당한다.
// 스냅샷은 전·후 비교(Before/After)와 점수 추세 양쪽에 함께 쓰인다.
const SNAPSHOT_FILE = "health_snapshots.json";
const BOOT_HISTORY_FILE = "boot_history.json";

function makeId() {
  return `snap-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalize(entry) {
  return {
    id: String(entry?.id ?? "").trim() || makeId(),
    label: String(entry?.label ?? "").trim(),
    createdAt: String(entry?.createdAt ?? "").trim(),
    score: Number.isFinite(entry?.score) ? entry.score : 0,
    grade: String(entry?.grade ?? "").trim(),
    items: Array.isArray(entry?.items)
      ? entry.items.map((item) => ({
          key: String(item?.key ?? "").trim(),
          label: String(item?.label ?? "").trim(),
          status: String(item?.status ?? "").trim(),
          penalty: Number.isFinite(item?.penalty) ? item.penalty : 0,
          detail: String(item?.detail ?? "").trim(),
        }))
      : [],
  };
}

async function list() {
  try {
    const text = await fs.readFile(await getDataFileForRead(app, SNAPSHOT_FILE), "utf-8");
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr.map(normalize) : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeAll(arr) {
  await fs.writeFile(await getDataFileForWrite(app, SNAPSHOT_FILE), JSON.stringify(arr, null, 2), "utf-8");
}

async function add(payload) {
  const entry = normalize({ ...payload, id: makeId(), createdAt: new Date().toISOString() });
  const arr = await list();
  arr.unshift(entry);
  // 스냅샷이 무한정 쌓이지 않도록 최근 50개만 유지한다.
  await writeAll(arr.slice(0, 50));
  return entry;
}

async function remove(id) {
  const safeId = String(id ?? "").trim();
  const next = (await list()).filter((item) => item.id !== safeId);
  await writeAll(next);
  return next;
}

async function bootTime() {
  if (process.platform !== "win32") {
    return { entries: [], stats: null, message: "부팅 속도 측정은 Windows에서 사용할 수 있습니다." };
  }

  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$events = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Diagnostics-Performance/Operational'; Id = 100 } -MaxEvents 10 -ErrorAction SilentlyContinue |
  ForEach-Object {
    $xml = [xml]$_.ToXml()
    $data = @{}
    foreach ($item in $xml.Event.EventData.Data) {
      $data[$item.Name] = [string]$item.'#text'
    }
    [pscustomobject]@{
      Time = $_.TimeCreated.ToString('o')
      BootDuration = [int64]$data.BootDuration
      MainPathBootTime = [int64]$data.MainPathBootTime
      BootPostBootTime = [int64]$data.BootPostBootTime
    }
  })
$events | ConvertTo-Json -Depth 4
`;

  let current = [];
  try {
    const output = (await runPowerShell(script, 30000)).trim();
    current = arrayify(output ? JSON.parse(output) : []).map(normalizeBootEntry).filter((entry) => entry.durationMs > 0);
  } catch (error) {
    return { entries: [], stats: null, message: `부팅 기록을 읽지 못했습니다: ${error.message}` };
  }

  const history = await mergeBootHistory(current);
  return {
    entries: history.slice(0, 10),
    stats: bootStats(history),
    message: history.length ? "최근 부팅 속도 기록을 불러왔습니다." : "부팅 속도 기록을 찾지 못했습니다.",
  };
}

async function mergeBootHistory(entries) {
  const existing = await readJsonArray(await getDataFileForRead(app, BOOT_HISTORY_FILE));
  const map = new Map();
  for (const entry of [...existing.map(normalizeBootEntry), ...entries]) {
    if (entry.time && entry.durationMs > 0) {
      map.set(entry.time, entry);
    }
  }
  const history = [...map.values()]
    .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
    .slice(0, 50);
  await fs.writeFile(await getDataFileForWrite(app, BOOT_HISTORY_FILE), JSON.stringify(history, null, 2), "utf-8");
  return history;
}

function normalizeBootEntry(entry) {
  const durationMs = Number(entry?.durationMs ?? entry?.BootDuration);
  const mainMs = Number(entry?.mainMs ?? entry?.MainPathBootTime);
  const postMs = Number(entry?.postMs ?? entry?.BootPostBootTime);
  return {
    time: String(entry?.time ?? entry?.Time ?? "").trim(),
    durationMs: Number.isFinite(durationMs) ? durationMs : 0,
    mainMs: Number.isFinite(mainMs) ? mainMs : 0,
    postMs: Number.isFinite(postMs) ? postMs : 0,
  };
}

function bootStats(entries) {
  const values = entries.map((entry) => entry.durationMs).filter((value) => value > 0);
  if (!values.length) return null;
  const latest = entries[0];
  const averageMs = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  return {
    latest,
    averageMs,
    bestMs: Math.min(...values),
    worstMs: Math.max(...values),
  };
}

async function temps() {
  if (process.platform !== "win32") {
    return { groups: [], sensors: [], message: "온도 확인은 Windows에서 사용할 수 있습니다." };
  }

  let sensors = [];
  let message = "";

  try {
    if (fsSync.existsSync(SENSOR_HELPER_EXE)) {
      const { stdout } = await execFileAsync(SENSOR_HELPER_EXE, ["--json"], { timeout: 20000, encoding: "utf8" });
      sensors = collectTemperatureSensors(JSON.parse(stdout.trim()));
    } else if (fsSync.existsSync(SENSOR_HELPER_SCRIPT)) {
      const stdout = await runPowerShell(`& '${escapePowerShellPath(SENSOR_HELPER_SCRIPT)}'`, 25000);
      sensors = collectTemperatureSensors(JSON.parse(stdout.trim()));
    } else {
      message = "센서 보조 진단기가 없어 Windows 기본 온도 센서만 확인합니다.";
    }
  } catch (error) {
    message = `센서 보조 진단기를 실행하지 못했습니다: ${error.message}`;
  }

  if (!sensors.length) {
    sensors = await readThermalZones();
  }

  const groups = groupTemperatureSensors(sensors);
  return {
    groups,
    sensors,
    message: groups.length ? (message || "온도 센서 값을 불러왔습니다.") : (message || "읽을 수 있는 온도 센서를 찾지 못했습니다."),
  };
}

async function readThermalZones() {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
@(Get-CimInstance -Namespace root/wmi MSAcpi_ThermalZoneTemperature |
  ForEach-Object {
    $c = [math]::Round((($_.CurrentTemperature / 10) - 273.15), 1)
    if ($c -gt -20 -and $c -lt 130) {
      [pscustomobject]@{ Name = [string]$_.InstanceName; Type = 'Temperature'; Value = [double]$c; HardwareName = 'Windows 온도 센서'; Category = 'os' }
    }
  }) | ConvertTo-Json -Depth 3
`;
  try {
    const output = (await runPowerShell(script, 15000)).trim();
    return arrayify(output ? JSON.parse(output) : []).map(normalizeSensor).filter((sensor) => Number.isFinite(sensor.value));
  } catch {
    return [];
  }
}

function collectTemperatureSensors(report) {
  const result = [];

  function walk(node, hardwareName = "", hardwareType = "") {
    if (!node || typeof node !== "object") {
      return;
    }

    const ownName = cleanText(node.Name ?? node.name ?? node.HardwareName ?? node.hardwareName) || hardwareName;
    const ownType = cleanText(node.HardwareType ?? node.hardwareType ?? node.Type ?? node.type) || hardwareType;
    const ownSensors = node.Sensors ?? node.sensors;
    if (Array.isArray(ownSensors)) {
      for (const sensor of ownSensors) {
        const normalized = normalizeSensor({
          ...sensor,
          HardwareName: sensor.HardwareName ?? sensor.hardwareName ?? ownName,
          HardwareType: sensor.HardwareType ?? sensor.hardwareType ?? ownType,
        });
        if (/temperature/i.test(normalized.type) && Number.isFinite(normalized.value)) {
          result.push(normalized);
        }
      }
    }

    const children = node.Hardware ?? node.hardware ?? node.Children ?? node.children ?? node.SubHardware ?? node.subHardware;
    if (Array.isArray(children)) {
      for (const child of children) {
        walk(child, ownName, ownType);
      }
    }
  }

  walk(report);
  return result;
}

function normalizeSensor(sensor) {
  const value = Number(sensor?.Value ?? sensor?.value);
  return {
    name: cleanText(sensor?.Name ?? sensor?.name),
    type: cleanText(sensor?.SensorType ?? sensor?.sensorType ?? sensor?.Type ?? sensor?.type),
    value: Number.isFinite(value) ? Math.round(value * 10) / 10 : NaN,
    hardwareName: cleanText(sensor?.HardwareName ?? sensor?.hardwareName),
    hardwareType: cleanText(sensor?.HardwareType ?? sensor?.hardwareType),
    category: cleanText(sensor?.Category ?? sensor?.category),
  };
}

function groupTemperatureSensors(sensors) {
  const groups = new Map();
  for (const sensor of sensors) {
    const id = sensor.category || inferSensorCategory(sensor);
    const list = groups.get(id) || [];
    list.push(sensor);
    groups.set(id, list);
  }

  return [...groups.entries()].map(([id, list]) => {
    const max = Math.max(...list.map((sensor) => sensor.value));
    return {
      id,
      label: categoryLabel(id),
      max,
      status: temperatureStatus(max),
      sensors: list
        .sort((left, right) => right.value - left.value)
        .slice(0, 8)
        .map((sensor) => ({
          name: sensor.name,
          value: sensor.value,
          hardwareName: sensor.hardwareName,
        })),
    };
  }).sort((left, right) => sortCategory(left.id) - sortCategory(right.id));
}

function inferSensorCategory(sensor) {
  const text = [sensor.hardwareType, sensor.hardwareName, sensor.name].map(cleanText).join(" ").toLowerCase();
  if (text.includes("cpu") || text.includes("processor") || text.includes("core")) return "cpu";
  if (text.includes("gpu") || text.includes("nvidia") || text.includes("radeon") || text.includes("graphics")) return "gpu";
  if (text.includes("memory") || text.includes("ram")) return "ram";
  if (text.includes("ssd") || text.includes("hdd") || text.includes("disk") || text.includes("nvme")) return "disk";
  return "os";
}

function categoryLabel(id) {
  if (id === "cpu") return "CPU";
  if (id === "gpu") return "GPU";
  if (id === "ram") return "RAM";
  if (id === "disk") return "저장장치";
  return "시스템";
}

function sortCategory(id) {
  return { cpu: 0, gpu: 1, ram: 2, disk: 3, os: 4 }[id] ?? 5;
}

function temperatureStatus(value) {
  if (value >= 90) return "fail";
  if (value >= 80) return "warn";
  return "ok";
}

async function readJsonArray(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf-8");
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function arrayify(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function escapePowerShellPath(value) {
  return String(value).replace(/'/g, "''");
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function register(ipcMain) {
  ipcMain.handle("health:listSnapshots", () => list());
  ipcMain.handle("health:saveSnapshot", (_event, payload) => add(payload));
  ipcMain.handle("health:deleteSnapshot", (_event, id) => remove(id));
  ipcMain.handle("health:bootTime", () => bootTime());
  ipcMain.handle("health:temps", () => temps());
}

module.exports = {
  register,
};
