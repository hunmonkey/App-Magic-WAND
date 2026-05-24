const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const { runPowerShell } = require("../core/run-command");

const DELETE_TOKEN = "cleanup-confirmed";
const DETAIL_LIMIT = 12;
const PROGRESS_INTERVAL_MS = 180;

function envPath(name, fallback = "") {
  return String(process.env[name] || fallback || "").trim();
}

function windowsDir() {
  return envPath("WINDIR", envPath("SystemRoot", "C:\\Windows"));
}

function localAppData() {
  return envPath("LOCALAPPDATA", path.join(os.homedir(), "AppData", "Local"));
}

function roamingAppData() {
  return envPath("APPDATA", path.join(os.homedir(), "AppData", "Roaming"));
}

function tempDir() {
  return envPath("TEMP", envPath("TMP", path.join(localAppData(), "Temp")));
}

function makeTargets() {
  const win = windowsDir();
  const local = localAppData();
  const roaming = roamingAppData();
  const temp = tempDir();

  return [
    {
      id: "recycleBin",
      label: "휴지통",
      description: "Windows 휴지통에 남아 있는 삭제 대기 파일입니다.",
      kind: "recycle",
      roots: recycleBinRoots(),
      defaultSelected: true,
    },
    {
      id: "userTemp",
      label: "사용자 임시 파일",
      description: "프로그램이 잠깐 쓰고 남긴 사용자 TEMP 폴더 파일입니다.",
      roots: [temp],
      defaultSelected: true,
    },
    {
      id: "windowsTemp",
      label: "Windows 임시 폴더",
      description: "Windows가 임시로 보관하는 파일입니다. 관리자 권한이 필요할 수 있습니다.",
      roots: [path.join(win, "Temp")],
      defaultSelected: false,
    },
    {
      id: "browserCache",
      label: "브라우저 캐시",
      description: "Chrome, Edge, Firefox가 빠른 로딩을 위해 저장한 캐시입니다.",
      roots: browserCacheRoots(local, roaming),
      defaultSelected: true,
    },
    {
      id: "windowsUpdate",
      label: "Windows Update 잔여물",
      description: "업데이트 다운로드 후 남은 파일입니다. 관리자 권한이 필요할 수 있습니다.",
      roots: [path.join(win, "SoftwareDistribution", "Download")],
      defaultSelected: false,
    },
    {
      id: "systemLeftovers",
      label: "설치/삭제 후 남은 찌꺼기",
      description: "Windows Installer 패치 캐시처럼 정해진 안전 범위 안의 잔여 파일입니다.",
      roots: [path.join(win, "Installer", "$PatchCache$")],
      defaultSelected: false,
    },
    {
      id: "memoryDumps",
      label: "메모리 덤프 파일",
      description: "블루스크린이나 프로그램 오류 뒤에 남는 큰 진단 파일입니다.",
      roots: [path.join(win, "Minidump"), path.join(local, "CrashDumps")],
      files: [path.join(win, "Memory.dmp")],
      defaultSelected: false,
    },
  ];
}

function recycleBinRoots() {
  const roots = [];
  const systemDrive = envPath("SystemDrive", "C:");
  if (systemDrive) {
    roots.push(path.join(systemDrive + path.sep, "$Recycle.Bin"));
  }
  for (let code = 67; code <= 90; code += 1) {
    const drive = `${String.fromCharCode(code)}:\\$Recycle.Bin`;
    if (!roots.some((item) => item.toLowerCase() === drive.toLowerCase())) {
      roots.push(drive);
    }
  }
  return roots;
}

function browserCacheRoots(local, roaming) {
  const roots = [];
  const chromiumBases = [
    path.join(local, "Google", "Chrome", "User Data"),
    path.join(local, "Microsoft", "Edge", "User Data"),
  ];

  for (const base of chromiumBases) {
    roots.push(path.join(base, "Default", "Cache"));
    roots.push(path.join(base, "Default", "Code Cache"));
    roots.push(path.join(base, "Default", "GPUCache"));
  }

  roots.push(path.join(local, "Mozilla", "Firefox", "Profiles"));
  roots.push(path.join(roaming, "Mozilla", "Firefox", "Profiles"));
  return roots;
}

async function scanTargets(payload = [], event = null) {
  const { targetIds, jobId } = normalizeScanPayload(payload);
  const wanted = idSet(targetIds);
  const targets = makeTargets().filter((target) => !wanted || wanted.has(target.id));
  const result = [];
  const progress = createProgressReporter(event, jobId);

  for (const [index, target] of targets.entries()) {
    const counters = { bytes: 0, files: 0, folders: 0, errors: 0, samples: [], failures: [] };
    const rootPaths = [...(target.roots || []), ...(target.files || [])].filter(Boolean);
    progress({
      phase: "scan",
      percent: scanPercent(index, targets.length),
      message: `${target.label} 스캔을 시작합니다.`,
      currentPath: rootPaths[0] || "",
    }, true);
    for (const root of target.roots || []) {
      await scanPath(root, counters, { progress, target, index, total: targets.length });
    }
    for (const file of target.files || []) {
      await scanPath(file, counters, { progress, target, index, total: targets.length });
    }
    result.push({
      id: target.id,
      label: target.label,
      description: target.description,
      roots: rootPaths,
      samples: counters.samples,
      failures: counters.failures,
      bytes: counters.bytes,
      files: counters.files,
      folders: counters.folders,
      errors: counters.errors,
      defaultSelected: target.defaultSelected,
    });
    progress({
      phase: "scan",
      percent: scanPercent(index + 1, targets.length),
      message: `${target.label} 스캔을 마쳤습니다.`,
      currentPath: rootPaths[0] || "",
    }, true);
  }

  return {
    targets: result,
    totalBytes: result.reduce((sum, item) => sum + item.bytes, 0),
  };
}

async function scanPath(targetPath, counters, context = {}) {
  const safePath = String(targetPath || "").trim();
  if (!safePath) return;
  const { progress, target, index = 0, total = 1 } = context;

  progress?.({
    phase: "scan",
    percent: scanPercent(index, total),
    message: `${target?.label || "정리 대상"} 스캔 중입니다.`,
    currentPath: safePath,
  });

  let stats;
  try {
    stats = await fs.lstat(safePath);
  } catch (error) {
    if (!isMissingError(error)) {
      rememberFailure(counters, safePath, error, "접근 실패");
    }
    return;
  }

  if (stats.isSymbolicLink()) {
    return;
  }

  if (stats.isFile()) {
    counters.files += 1;
    counters.bytes += stats.size;
    rememberSample(counters, safePath, "file", stats.size);
    return;
  }

  if (!stats.isDirectory()) {
    return;
  }

  counters.folders += 1;
  rememberSample(counters, safePath, "folder", 0);
  let entries;
  try {
    entries = await fs.readdir(safePath);
  } catch (error) {
    rememberFailure(counters, safePath, error, "폴더 열기 실패");
    return;
  }

  for (const entry of entries) {
    await scanPath(path.join(safePath, entry), counters, context);
  }
}

async function runCleanup(event, payload = {}) {
  if (!payload?.confirmed || payload?.token !== DELETE_TOKEN) {
    throw new Error("삭제 확인이 필요합니다.");
  }

  const wanted = idSet(payload.targetIds);
  if (!wanted || wanted.size === 0) {
    throw new Error("정리할 항목을 선택해 주세요.");
  }

  const selected = makeTargets().filter((target) => wanted.has(target.id));
  if (!selected.length) {
    throw new Error("정리할 항목을 찾지 못했습니다.");
  }

  const before = await scanTargets(selected.map((target) => target.id));
  let done = 0;
  const details = [];

  for (const [index, target] of selected.entries()) {
    done += 1;
    sendProgress(event, {
      jobId: payload.jobId,
      targetId: target.id,
      phase: "running",
      percent: Math.max(5, Math.round(((done - 1) / selected.length) * 95)),
      message: `${target.label} 정리 중입니다.`,
    });

    const detail = await cleanTarget(target, {
      event,
      jobId: payload.jobId,
      index,
      total: selected.length,
    });
    details.push({ id: target.id, label: target.label, ...detail });
  }

  const after = await scanTargets(selected.map((target) => target.id));
  const reclaimedBytes = Math.max(0, before.totalBytes - after.totalBytes);
  sendProgress(event, {
    jobId: payload.jobId,
    phase: "done",
    percent: 100,
    message: "시스템 정리가 끝났습니다.",
  });

  return {
    before,
    after,
    reclaimedBytes,
    details,
  };
}

async function cleanTarget(target, context = {}) {
  if (target.kind === "recycle") {
    const recyclePath = (target.roots || []).find(Boolean) || "휴지통";
    reportCleanupProgress(context, target, recyclePath);
    try {
      await runPowerShell("Clear-RecycleBin -Force -ErrorAction Stop", 60000);
      return { removed: 1, failed: 0, removedItems: [pathDetail(recyclePath, "휴지통 비우기 완료")], failedItems: [] };
    } catch (error) {
      return { removed: 0, failed: 1, removedItems: [], failedItems: [pathDetail(recyclePath, describeError(error, "휴지통 비우기 실패"))] };
    }
  }

  let removed = 0;
  let failed = 0;
  const removedItems = [];
  const failedItems = [];

  for (const file of target.files || []) {
    reportCleanupProgress(context, target, file);
    if (!isSafeFile(file, target)) {
      failed += 1;
      addDetail(failedItems, pathDetail(file, "허용되지 않은 파일"));
      continue;
    }
    try {
      await fs.rm(file, { force: true, maxRetries: 2, retryDelay: 120 });
      removed += 1;
      addDetail(removedItems, pathDetail(file, "삭제 완료"));
    } catch (error) {
      failed += 1;
      addDetail(failedItems, pathDetail(file, describeError(error, "삭제 실패")));
    }
  }

  for (const root of target.roots || []) {
    const result = await cleanChildren(root, target, context);
    removed += result.removed;
    failed += result.failed;
    appendDetails(removedItems, result.removedItems);
    appendDetails(failedItems, result.failedItems);
  }

  return { removed, failed, removedItems, failedItems };
}

async function cleanChildren(root, cleanupTarget, context = {}) {
  try {
    assertSafeRoot(root);
  } catch (error) {
    return { removed: 0, failed: 1, removedItems: [], failedItems: [pathDetail(root, describeError(error, "안전 확인 실패"))] };
  }

  let entries;
  try {
    entries = await fs.readdir(root);
  } catch (error) {
    if (isMissingError(error)) {
      return { removed: 0, failed: 0, removedItems: [], failedItems: [] };
    }
    return { removed: 0, failed: 1, removedItems: [], failedItems: [pathDetail(root, describeError(error, "폴더 열기 실패"))] };
  }

  let removed = 0;
  let failed = 0;
  const removedItems = [];
  const failedItems = [];
  for (const entry of entries) {
    const childPath = path.join(root, entry);
    reportCleanupProgress(context, cleanupTarget, childPath);
    try {
      await fs.rm(childPath, { recursive: true, force: true, maxRetries: 2, retryDelay: 120 });
      removed += 1;
      addDetail(removedItems, pathDetail(childPath, "삭제 완료"));
    } catch (error) {
      failed += 1;
      addDetail(failedItems, pathDetail(childPath, describeError(error, "삭제 실패")));
    }
  }
  return { removed, failed, removedItems, failedItems };
}

function idSet(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  return new Set(values.map((value) => String(value || "").trim()).filter(Boolean));
}

function normalizeScanPayload(payload) {
  if (Array.isArray(payload)) {
    return { targetIds: payload, jobId: "" };
  }
  return {
    targetIds: Array.isArray(payload?.targetIds) ? payload.targetIds : [],
    jobId: cleanText(payload?.jobId),
  };
}

function createProgressReporter(event, jobId) {
  let lastSent = 0;
  return (payload, force = false) => {
    if (!jobId) return;
    const now = Date.now();
    if (!force && now - lastSent < PROGRESS_INTERVAL_MS) {
      return;
    }
    lastSent = now;
    sendProgress(event, { jobId, ...payload });
  };
}

function scanPercent(index, total) {
  if (!total) return 0;
  return Math.min(95, Math.max(1, Math.round((index / total) * 95)));
}

function rememberSample(counters, targetPath, type, bytes = 0) {
  if (counters.samples.length >= DETAIL_LIMIT) return;
  counters.samples.push(pathDetail(targetPath, type === "file" ? formatByteLabel(bytes) : "폴더"));
}

function rememberFailure(counters, targetPath, error, fallback) {
  counters.errors += 1;
  addDetail(counters.failures, pathDetail(targetPath, describeError(error, fallback)));
}

function addDetail(list, item) {
  if (Array.isArray(list) && list.length < DETAIL_LIMIT) {
    list.push(item);
  }
}

function appendDetails(target, items = []) {
  for (const item of items) {
    addDetail(target, item);
  }
}

function pathDetail(targetPath, note = "") {
  const text = String(targetPath || "").trim();
  return {
    name: path.basename(text) || text,
    path: text,
    note,
  };
}

function reportCleanupProgress(context, target, currentPath) {
  const now = Date.now();
  if (now - (context.lastProgressAt || 0) < PROGRESS_INTERVAL_MS) {
    return;
  }
  context.lastProgressAt = now;
  sendProgress(context.event, {
    jobId: context.jobId,
    targetId: target?.id,
    phase: "running",
    percent: Math.max(5, Math.round(((context.index || 0) / Math.max(1, context.total || 1)) * 95)),
    message: `${target?.label || "정리 대상"} 처리 중입니다.`,
    currentPath,
  });
}

function describeError(error, fallback = "실패") {
  const code = error?.code || "";
  if (code === "EACCES" || code === "EPERM") return "권한 부족 또는 보호된 파일";
  if (code === "EBUSY") return "다른 프로그램이 사용 중";
  if (code === "ENOENT" || code === "ENOTDIR") return "이미 없거나 경로 없음";
  if (code === "ENOTEMPTY") return "폴더가 비어 있지 않음";

  const message = cleanText(error?.message);
  if (message) {
    if (/access is denied|denied|unauthorized|permission/i.test(message)) return "권한 부족";
    if (/used by another process|being used|in use/i.test(message)) return "다른 프로그램이 사용 중";
    return message.split(/\r?\n/)[0].slice(0, 120);
  }
  return fallback;
}

function isMissingError(error) {
  return error?.code === "ENOENT" || error?.code === "ENOTDIR";
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function formatByteLabel(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`;
}

function assertSafeRoot(root) {
  const resolved = path.resolve(String(root || ""));
  const parsed = path.parse(resolved);
  if (!resolved || resolved.toLowerCase() === parsed.root.toLowerCase()) {
    throw new Error("루트 폴더는 정리할 수 없습니다.");
  }

  const allowed = makeTargets().flatMap((target) => target.roots || []).map((item) => path.resolve(item).toLowerCase());
  if (!allowed.includes(resolved.toLowerCase())) {
    throw new Error(`허용되지 않은 정리 경로입니다: ${resolved}`);
  }
}

function isSafeFile(file, target) {
  const resolved = path.resolve(String(file || "")).toLowerCase();
  return (target.files || []).some((item) => path.resolve(item).toLowerCase() === resolved);
}

function sendProgress(event, payload) {
  if (!event?.sender || event.sender.isDestroyed()) {
    return;
  }
  event.sender.send("cleanup:progress", payload);
}

function register(ipcMain) {
  ipcMain.handle("cleanup:scan", (event, payload) => scanTargets(payload, event));
  ipcMain.handle("cleanup:run", (event, payload) => runCleanup(event, payload));
}

module.exports = {
  register,
};
