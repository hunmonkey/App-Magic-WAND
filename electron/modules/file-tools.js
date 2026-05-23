const { app, BrowserWindow, dialog, shell } = require("electron");
const childProcess = require("child_process");
const fs = require("fs/promises");
const path = require("path");

const { getDataFileForRead, getDataFileForWrite } = require("../core/portable-data");

const jobs = new Map();

function psQuote(value) {
  return "'" + String(value ?? "").replace(/'/g, "''") + "'";
}

function sanitizeFileName(value, fallback) {
  const safe = String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ");
  return safe || fallback;
}

function dateStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "_",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

const SETTINGS_FILE = "file_tools_settings.json";

async function loadSettings() {
  try {
    const text = await fs.readFile(await getDataFileForRead(app, SETTINGS_FILE), "utf-8");
    return normalizeSettings(JSON.parse(text));
  } catch (error) {
    if (error.code === "ENOENT") {
      return normalizeSettings({});
    }
    throw error;
  }
}

async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  await fs.writeFile(await getDataFileForWrite(app, SETTINGS_FILE), JSON.stringify(normalized, null, 2), "utf-8");
  return normalized;
}

function normalizeSettings(settings) {
  const shortcuts = normalizeShortcuts(settings?.shortcuts).slice(0, 100);
  let shortcutSets = normalizeShortcutSets(settings?.shortcutSets).slice(0, 50);
  if (!shortcutSets.length && shortcuts.length) {
    shortcutSets = [{
      id: "default",
      name: "기본 세트",
      shortcuts,
      createdAt: "",
      updatedAt: "",
    }];
  }

  return {
    transferPaths: uniqueStrings(settings?.transferPaths).slice(0, 20),
    shortcuts,
    shortcutSets,
  };
}

function uniqueStrings(values) {
  const result = [];
  const seen = new Set();
  for (const value of values ?? []) {
    const text = String(value ?? "").trim();
    const key = text.toLowerCase();
    if (text && !seen.has(key)) {
      result.push(text);
      seen.add(key);
    }
  }
  return result;
}

function normalizeShortcuts(values) {
  const result = [];
  const seen = new Set();
  for (const item of values ?? []) {
    const name = String(item?.name ?? "").trim();
    const url = String(item?.url ?? "").trim();
    const iconPath = String(item?.iconPath ?? "").trim();
    const key = `${name.toLowerCase()}|${url.toLowerCase()}`;
    if (name && url && !seen.has(key)) {
      result.push({ name, url, iconPath });
      seen.add(key);
    }
  }
  return result;
}

function normalizeShortcutSets(values) {
  const result = [];
  const seen = new Set();
  for (const item of values ?? []) {
    const shortcuts = normalizeShortcuts(item?.shortcuts).slice(0, 100);
    const name = String(item?.name ?? "").trim();
    const id = sanitizeSettingId(item?.id || name);
    if (!id || !name || !shortcuts.length || seen.has(id)) {
      continue;
    }
    result.push({
      id,
      name,
      shortcuts,
      createdAt: String(item?.createdAt ?? "").trim(),
      updatedAt: String(item?.updatedAt ?? "").trim(),
    });
    seen.add(id);
  }
  return result;
}

function sanitizeSettingId(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureExistingPaths(paths) {
  const result = [];
  for (const item of paths ?? []) {
    const target = String(item ?? "").trim();
    if (!target) {
      continue;
    }
    if (!(await pathExists(target))) {
      throw new Error(`경로를 찾지 못했습니다: ${target}`);
    }
    result.push(target);
  }
  if (!result.length) {
    throw new Error("파일이나 폴더를 먼저 선택해 주세요.");
  }
  return result;
}

async function pickFiles(event) {
  const window = BrowserWindow.fromWebContents(event.sender);
  const picked = await dialog.showOpenDialog(window, {
    title: "백업할 파일 선택",
    properties: ["openFile", "multiSelections"],
  });
  return { paths: picked.canceled ? [] : picked.filePaths };
}

async function pickFolders(event) {
  const window = BrowserWindow.fromWebContents(event.sender);
  const picked = await dialog.showOpenDialog(window, {
    title: "백업할 폴더 선택",
    properties: ["openDirectory", "multiSelections"],
  });
  return { paths: picked.canceled ? [] : picked.filePaths };
}

async function pickDestination(event) {
  const window = BrowserWindow.fromWebContents(event.sender);
  const picked = await dialog.showOpenDialog(window, {
    title: "저장할 폴더 선택",
    properties: ["openDirectory", "createDirectory"],
  });
  return { path: picked.canceled ? "" : picked.filePaths[0] };
}

async function pickIcon(event) {
  const window = BrowserWindow.fromWebContents(event.sender);
  const picked = await dialog.showOpenDialog(window, {
    title: "바로가기 아이콘 선택",
    properties: ["openFile"],
    filters: [
      { name: "Icon Files", extensions: ["ico"] },
      { name: "Windows Program / Library", extensions: ["exe", "dll"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  return { path: picked.canceled ? "" : picked.filePaths[0] };
}

function commonFolders() {
  const names = [
    ["desktop", "바탕화면"],
    ["documents", "문서"],
    ["downloads", "다운로드"],
    ["pictures", "사진"],
  ];
  const folders = names
    .map(([key, label]) => {
      try {
        return { key, label, path: app.getPath(key) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (process.env.USERPROFILE) {
    folders.push({ key: "userprofile", label: "사용자 폴더", path: process.env.USERPROFILE });
  }
  if (process.env.SystemRoot) {
    folders.push({ key: "windows", label: "Windows 폴더", path: process.env.SystemRoot });
  }
  return folders;
}

async function createBackup(event, payload) {
  const jobId = getJobId(payload, "backup");
  jobs.set(jobId, { type: "backup", cancelled: false, sender: event.sender });
  try {
    const sources = await ensureExistingPaths(payload?.sources);
    const destinationDir = String(payload?.destinationDir ?? "").trim();
    if (!destinationDir) {
      throw new Error("백업 파일을 저장할 폴더를 선택해 주세요.");
    }
    await fs.mkdir(destinationDir, { recursive: true });

    const baseName = sanitizeFileName(payload?.baseName, "MagicWAND_Backup");
    const destinationPath = await uniquePath(path.join(destinationDir, `${baseName}_${dateStamp()}.zip`));
    const totals = await countSources(sources, jobId);
    sendProgress(event, jobId, {
      phase: "preparing",
      percent: 5,
      message: `원본 확인 완료: 파일 ${totals.files}개`,
      totalFiles: totals.files,
      totalBytes: totals.bytes,
    });

    const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$sources = @(ConvertFrom-Json -InputObject ${psQuote(JSON.stringify(sources))})
Compress-Archive -LiteralPath $sources -DestinationPath ${psQuote(destinationPath)} -Force
`;
    sendProgress(event, jobId, {
      phase: "running",
      percent: 35,
      message: "ZIP 파일을 만드는 중입니다.",
      totalFiles: totals.files,
      totalBytes: totals.bytes,
    });
    await runPowerShellJob(event, jobId, script, destinationPath);
    sendProgress(event, jobId, {
      phase: "done",
      percent: 100,
      message: "ZIP 백업이 완료됐습니다.",
      totalFiles: totals.files,
      totalBytes: totals.bytes,
    });
    return { path: destinationPath, name: path.basename(destinationPath) };
  } catch (error) {
    jobs.delete(jobId);
    throw error;
  }
}

async function runPowerShellJob(event, jobId, script, generatedPath) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return new Promise((resolve, reject) => {
    const existingJob = jobs.get(jobId) ?? { type: "backup", cancelled: false, sender: event.sender };
    if (existingJob.cancelled) {
      reject(new Error("작업이 취소됐습니다."));
      return;
    }
    const child = childProcess.execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      {
        windowsHide: true,
        encoding: "utf8",
        timeout: 10 * 60 * 1000,
        maxBuffer: 1024 * 1024 * 8,
      },
      async (error, stdout, stderr) => {
        const job = jobs.get(jobId);
        jobs.delete(jobId);
        if (job?.cancelled) {
          if (generatedPath) {
            await fs.rm(generatedPath, { force: true }).catch(() => {});
          }
          reject(new Error("작업이 취소됐습니다."));
          return;
        }
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve();
      },
    );
    jobs.set(jobId, { ...existingJob, child, generatedPath, sender: event.sender });
  });
}

async function transfer(event, payload) {
  const jobId = getJobId(payload, "transfer");
  const sources = await ensureExistingPaths(payload?.sources);
  const destination = String(payload?.destination ?? "").trim();
  if (!destination) {
    throw new Error("전송할 대상 폴더를 입력해 주세요.");
  }

  const wrapInFolder = Boolean(payload?.wrapInFolder);
  const packageName = sanitizeFileName(payload?.packageName, "MagicWAND_Transfer");
  const targetRoot = wrapInFolder ? path.join(destination, `${packageName}_${dateStamp()}`) : destination;
  await fs.mkdir(targetRoot, { recursive: true });
  jobs.set(jobId, { type: "transfer", cancelled: false, sender: event.sender });

  try {
    const plan = await buildCopyPlan(sources, targetRoot, jobId);
    sendProgress(event, jobId, {
      phase: "preparing",
      percent: 3,
      message: `복사 목록 준비 완료: 파일 ${plan.totalFiles}개`,
      copiedFiles: 0,
      totalFiles: plan.totalFiles,
      copiedBytes: 0,
      totalBytes: plan.totalBytes,
    });

    for (const dir of plan.directories) {
      assertNotCancelled(jobId);
      await fs.mkdir(dir, { recursive: true });
    }

    let copiedFiles = 0;
    let copiedBytes = 0;
    for (const file of plan.files) {
      assertNotCancelled(jobId);
      await fs.mkdir(path.dirname(file.to), { recursive: true });
      await fs.copyFile(file.from, file.to);
      copiedFiles += 1;
      copiedBytes += file.size;
      sendProgress(event, jobId, {
        phase: "running",
        percent: progressPercent(copiedFiles, plan.totalFiles),
        message: `${path.basename(file.to)} 복사 완료`,
        copiedFiles,
        totalFiles: plan.totalFiles,
        copiedBytes,
        totalBytes: plan.totalBytes,
      });
    }

    sendProgress(event, jobId, {
      phase: "done",
      percent: 100,
      message: "전송이 완료됐습니다.",
      copiedFiles,
      totalFiles: plan.totalFiles,
      copiedBytes,
      totalBytes: plan.totalBytes,
    });
    return { destination: targetRoot, copied: plan.targets };
  } finally {
    jobs.delete(jobId);
  }
}

function getJobId(payload, fallback) {
  return sanitizeFileName(payload?.jobId, `${fallback}-${Date.now()}`);
}

function sendProgress(event, jobId, payload) {
  if (!event?.sender || event.sender.isDestroyed()) {
    return;
  }
  event.sender.send("file-tools:progress", { jobId, ...payload });
}

function progressPercent(done, total) {
  if (!total) {
    return 100;
  }
  return Math.max(5, Math.min(99, Math.round((done / total) * 100)));
}

function assertNotCancelled(jobId) {
  if (jobs.get(jobId)?.cancelled) {
    throw new Error("작업이 취소됐습니다.");
  }
}

async function countSources(sources, jobId) {
  let files = 0;
  let bytes = 0;
  for (const source of sources) {
    assertNotCancelled(jobId);
    const stats = await fs.stat(source);
    if (stats.isDirectory()) {
      const result = await countDirectory(source, jobId);
      files += result.files;
      bytes += result.bytes;
    } else {
      files += 1;
      bytes += stats.size;
    }
  }
  return { files, bytes };
}

async function countDirectory(dir, jobId) {
  let files = 0;
  let bytes = 0;
  assertNotCancelled(jobId);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    assertNotCancelled(jobId);
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const result = await countDirectory(target, jobId);
      files += result.files;
      bytes += result.bytes;
    } else if (entry.isFile()) {
      const stats = await fs.stat(target);
      files += 1;
      bytes += stats.size;
    }
  }
  return { files, bytes };
}

async function buildCopyPlan(sources, targetRoot, jobId) {
  const directories = [];
  const files = [];
  const targets = [];
  let totalBytes = 0;

  for (const source of sources) {
    assertNotCancelled(jobId);
    if (isInsidePath(targetRoot, source)) {
      throw new Error("전송 대상 폴더가 원본 폴더 안에 있습니다. 다른 위치를 선택해 주세요.");
    }
    const target = await uniquePath(path.join(targetRoot, path.basename(source)));
    targets.push(target);
    const stats = await fs.stat(source);
    if (stats.isDirectory()) {
      directories.push(target);
      await collectCopyEntries(source, target, directories, files, jobId);
    } else {
      files.push({ from: source, to: target, size: stats.size });
      totalBytes += stats.size;
    }
  }

  totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  return {
    directories,
    files,
    targets,
    totalFiles: files.length,
    totalBytes,
  };
}

async function collectCopyEntries(sourceDir, targetDir, directories, files, jobId) {
  assertNotCancelled(jobId);
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    assertNotCancelled(jobId);
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      directories.push(target);
      await collectCopyEntries(source, target, directories, files, jobId);
    } else if (entry.isFile()) {
      const stats = await fs.stat(source);
      files.push({ from: source, to: target, size: stats.size });
    }
  }
}

function cancelJob(jobId) {
  const job = jobs.get(String(jobId ?? ""));
  if (!job) {
    return { cancelled: false };
  }
  job.cancelled = true;
  if (job.child && !job.child.killed) {
    job.child.kill();
  }
  return { cancelled: true };
}

async function uniquePath(targetPath) {
  if (!(await pathExists(targetPath))) {
    return targetPath;
  }
  const dir = path.dirname(targetPath);
  const ext = path.extname(targetPath);
  const base = path.basename(targetPath, ext);
  for (let index = 2; index < 1000; index += 1) {
    const next = path.join(dir, `${base} (${index})${ext}`);
    if (!(await pathExists(next))) {
      return next;
    }
  }
  throw new Error("같은 이름의 파일이 너무 많습니다. 이름을 바꿔 다시 시도해 주세요.");
}

function isInsidePath(childPath, parentPath) {
  const child = path.resolve(childPath).toLowerCase();
  const parent = path.resolve(parentPath).toLowerCase();
  return child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
}

async function openPath(_event, targetPath) {
  const target = String(targetPath ?? "").trim();
  if (!target) {
    throw new Error("열 경로가 없습니다.");
  }
  const error = await shell.openPath(target);
  if (error) {
    throw new Error(error);
  }
  return { ok: true };
}

async function createShortcut(payload) {
  const rawUrl = String(payload?.url ?? "").trim();
  const name = sanitizeFileName(payload?.name, "웹 바로가기");
  const folder = String(payload?.folder ?? "").trim() || app.getPath("desktop");
  const url = normalizeUrl(rawUrl);
  const iconPath = String(payload?.iconPath ?? "").trim();
  if (iconPath && !(await pathExists(iconPath))) {
    throw new Error(`아이콘 파일을 찾지 못했습니다: ${iconPath}`);
  }
  await fs.mkdir(folder, { recursive: true });
  const filePath = await uniquePath(path.join(folder, `${name}.url`));
  const content = [
    "[InternetShortcut]",
    `URL=${shortcutValue(url)}`,
    iconPath ? `IconFile=${shortcutValue(iconPath)}` : "",
    "IconIndex=0",
    "",
  ].filter((line) => line !== "").join("\r\n");
  await fs.writeFile(filePath, content, "utf-8");
  return { path: filePath, name: path.basename(filePath) };
}

function shortcutValue(value) {
  return String(value ?? "").replace(/[\r\n]/g, "");
}

function normalizeUrl(value) {
  if (!value) {
    throw new Error("웹사이트 주소를 입력해 주세요.");
  }
  const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error();
    }
    return parsed.toString();
  } catch {
    throw new Error("올바른 웹사이트 주소를 입력해 주세요.");
  }
}

function register(ipcMain) {
  ipcMain.handle("file-tools:pickFiles", pickFiles);
  ipcMain.handle("file-tools:pickFolders", pickFolders);
  ipcMain.handle("file-tools:pickDestination", pickDestination);
  ipcMain.handle("file-tools:pickIcon", pickIcon);
  ipcMain.handle("file-tools:commonFolders", commonFolders);
  ipcMain.handle("file-tools:loadSettings", loadSettings);
  ipcMain.handle("file-tools:saveSettings", (_event, settings) => saveSettings(settings));
  ipcMain.handle("file-tools:createBackup", (event, payload) => createBackup(event, payload));
  ipcMain.handle("file-tools:transfer", (event, payload) => transfer(event, payload));
  ipcMain.handle("file-tools:cancel", (_event, jobId) => cancelJob(jobId));
  ipcMain.handle("file-tools:openPath", openPath);
  ipcMain.handle("file-tools:createShortcut", (_event, payload) => createShortcut(payload));
}

module.exports = {
  register,
};
