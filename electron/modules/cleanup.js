const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const { runPowerShell } = require("../core/run-command");

const DELETE_TOKEN = "cleanup-confirmed";

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

async function scanTargets(targetIds = []) {
  const wanted = idSet(targetIds);
  const targets = makeTargets().filter((target) => !wanted || wanted.has(target.id));
  const result = [];

  for (const target of targets) {
    const counters = { bytes: 0, files: 0, folders: 0, errors: 0 };
    for (const root of target.roots || []) {
      await scanPath(root, counters);
    }
    for (const file of target.files || []) {
      await scanPath(file, counters);
    }
    result.push({
      id: target.id,
      label: target.label,
      description: target.description,
      bytes: counters.bytes,
      files: counters.files,
      folders: counters.folders,
      errors: counters.errors,
      defaultSelected: target.defaultSelected,
    });
  }

  return {
    targets: result,
    totalBytes: result.reduce((sum, item) => sum + item.bytes, 0),
  };
}

async function scanPath(targetPath, counters) {
  const safePath = String(targetPath || "").trim();
  if (!safePath) return;

  let stats;
  try {
    stats = await fs.lstat(safePath);
  } catch {
    return;
  }

  if (stats.isSymbolicLink()) {
    return;
  }

  if (stats.isFile()) {
    counters.files += 1;
    counters.bytes += stats.size;
    return;
  }

  if (!stats.isDirectory()) {
    return;
  }

  counters.folders += 1;
  let entries;
  try {
    entries = await fs.readdir(safePath);
  } catch {
    counters.errors += 1;
    return;
  }

  for (const entry of entries) {
    await scanPath(path.join(safePath, entry), counters);
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

  for (const target of selected) {
    done += 1;
    sendProgress(event, {
      jobId: payload.jobId,
      targetId: target.id,
      phase: "running",
      percent: Math.max(5, Math.round(((done - 1) / selected.length) * 95)),
      message: `${target.label} 정리 중입니다.`,
    });

    const detail = await cleanTarget(target);
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

async function cleanTarget(target) {
  if (target.kind === "recycle") {
    await runPowerShell("Clear-RecycleBin -Force -ErrorAction SilentlyContinue", 60000).catch(() => "");
    return { removed: 0, failed: 0 };
  }

  let removed = 0;
  let failed = 0;

  for (const file of target.files || []) {
    if (!isSafeFile(file, target)) {
      failed += 1;
      continue;
    }
    try {
      await fs.rm(file, { force: true, maxRetries: 2, retryDelay: 120 });
      removed += 1;
    } catch {
      failed += 1;
    }
  }

  for (const root of target.roots || []) {
    const result = await cleanChildren(root);
    removed += result.removed;
    failed += result.failed;
  }

  return { removed, failed };
}

async function cleanChildren(root) {
  assertSafeRoot(root);
  let entries;
  try {
    entries = await fs.readdir(root);
  } catch {
    return { removed: 0, failed: 0 };
  }

  let removed = 0;
  let failed = 0;
  for (const entry of entries) {
    const target = path.join(root, entry);
    try {
      await fs.rm(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 120 });
      removed += 1;
    } catch {
      failed += 1;
    }
  }
  return { removed, failed };
}

function idSet(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  return new Set(values.map((value) => String(value || "").trim()).filter(Boolean));
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
  ipcMain.handle("cleanup:scan", (_event, targetIds) => scanTargets(targetIds));
  ipcMain.handle("cleanup:run", (event, payload) => runCleanup(event, payload));
}

module.exports = {
  register,
};
