const childProcess = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const DATA_DIR_NAME = "MagicWAND_Data";
const hiddenDirs = new Set();

function getPortableExecutableDir() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return process.env.PORTABLE_EXECUTABLE_DIR;
  }
  if (process.env.PORTABLE_EXECUTABLE_FILE) {
    return path.dirname(process.env.PORTABLE_EXECUTABLE_FILE);
  }
  return "";
}

function getDataRoot(app) {
  const portableDir = getPortableExecutableDir();
  if (portableDir) {
    return portableDir;
  }
  if (app?.isPackaged) {
    return path.dirname(process.execPath);
  }
  return app.getAppPath();
}

function getDataDir(app) {
  return path.join(getDataRoot(app), DATA_DIR_NAME);
}

function getLegacyDataDir(app) {
  if (app?.isPackaged) {
    return app.getPath("userData");
  }
  return path.join(app.getAppPath(), "data");
}

function getDataFilePath(app, filename) {
  return path.join(getDataDir(app), filename);
}

function getDataSubdirPath(app, dirname) {
  return path.join(getDataDir(app), dirname);
}

function getLegacyFilePath(app, filename) {
  return path.join(getLegacyDataDir(app), filename);
}

function getLegacySubdirPath(app, dirname) {
  return path.join(getLegacyDataDir(app), dirname);
}

function hideDir(dir) {
  if (process.platform !== "win32" || hiddenDirs.has(dir)) {
    return;
  }
  try {
    childProcess.execFileSync("attrib", ["+h", dir], { windowsHide: true, stdio: "ignore" });
    hiddenDirs.add(dir);
  } catch {
    // Hiding is a convenience, not a reason to block saving user data.
  }
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function ensureDataDirSync(app) {
  const dir = getDataDir(app);
  fs.mkdirSync(dir, { recursive: true });
  hideDir(dir);
  return dir;
}

async function ensureDataDir(app) {
  const dir = getDataDir(app);
  await fsp.mkdir(dir, { recursive: true });
  hideDir(dir);
  return dir;
}

async function migrateLegacyFile(app, filename, legacyPath = getLegacyFilePath(app, filename)) {
  const targetPath = getDataFilePath(app, filename);
  if ((await pathExists(targetPath)) || path.resolve(targetPath) === path.resolve(legacyPath)) {
    return targetPath;
  }
  try {
    await fsp.access(legacyPath);
    await ensureDataDir(app);
    await fsp.copyFile(legacyPath, targetPath);
  } catch {
    // Missing old data is normal for new portable installs.
  }
  return targetPath;
}

async function migrateLegacySubdir(app, dirname, legacyPath = getLegacySubdirPath(app, dirname)) {
  const targetPath = getDataSubdirPath(app, dirname);
  if ((await pathExists(targetPath)) || path.resolve(targetPath) === path.resolve(legacyPath)) {
    return targetPath;
  }
  try {
    await fsp.access(legacyPath);
    await ensureDataDir(app);
    await fsp.cp(legacyPath, targetPath, { recursive: true });
  } catch {
    // Missing old data is normal for new portable installs.
  }
  return targetPath;
}

async function getDataFileForRead(app, filename) {
  return migrateLegacyFile(app, filename);
}

async function getDataFileForWrite(app, filename) {
  await ensureDataDir(app);
  return migrateLegacyFile(app, filename);
}

async function ensureDataSubdir(app, dirname) {
  await migrateLegacySubdir(app, dirname);
  await ensureDataDir(app);
  const targetPath = getDataSubdirPath(app, dirname);
  await fsp.mkdir(targetPath, { recursive: true });
  return targetPath;
}

module.exports = {
  DATA_DIR_NAME,
  ensureDataDir,
  ensureDataDirSync,
  ensureDataSubdir,
  getDataDir,
  getDataFileForRead,
  getDataFileForWrite,
  getDataFilePath,
  getDataRoot,
  getDataSubdirPath,
  getLegacyDataDir,
  getLegacyFilePath,
  getLegacySubdirPath,
  migrateLegacyFile,
  migrateLegacySubdir,
};
