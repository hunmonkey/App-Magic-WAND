"use strict";

const { dialog, BrowserWindow } = require("electron");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");

const { runPowerShell } = require("../core/run-command");

const CHUNK = 4 * 1024 * 1024; // 4MB 단위로 덮어쓰기
const FILL_FILE_CHUNKS = 256; // 빈 공간 채우기용 임시 파일 1개 ≈ 1GB
const FREESPACE_DIR = "__mw_freespace_wipe__";

// 삭제 방식별 덮어쓰기 패턴
function passesFor(method) {
  // dod: 0x00 → 0xFF → 무작위 (DoD 5220.22-M 3회)
  // zero: 0x00 1회 (빠른 1회)
  return method === "dod" ? ["zero", "one", "random"] : ["zero"];
}

function fillBuffer(buf, len, kind) {
  if (kind === "random") {
    crypto.randomFillSync(buf, 0, len);
  } else {
    buf.fill(kind === "one" ? 0xff : 0x00, 0, len);
  }
}

// 파일 1개를 패턴으로 덮어쓴 뒤 삭제
async function overwriteAndRemove(filePath, method) {
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return;
  }
  if (stat.isFile() && stat.size > 0) {
    try { await fsp.chmod(filePath, 0o666); } catch { /* 읽기전용 해제 실패는 무시 */ }
    const fd = await fsp.open(filePath, "r+");
    try {
      const buf = Buffer.alloc(CHUNK);
      for (const kind of passesFor(method)) {
        let written = 0;
        while (written < stat.size) {
          const len = Math.min(CHUNK, stat.size - written);
          fillBuffer(buf, len, kind);
          await fd.write(buf, 0, len, written);
          written += len;
        }
        await fd.sync();
      }
    } finally {
      await fd.close();
    }
  }
  await fsp.rm(filePath, { force: true });
}

// 폴더/파일을 재귀적으로 영구 삭제. 잠긴 파일은 건너뛰고 개수만 집계.
async function shredTree(target, method, report) {
  let st;
  try {
    st = await fsp.lstat(target);
  } catch {
    return;
  }
  if (st.isDirectory() && !st.isSymbolicLink()) {
    let entries = [];
    try { entries = await fsp.readdir(target); } catch { return; }
    for (const entry of entries) {
      await shredTree(path.join(target, entry), method, report);
    }
    try { await fsp.rmdir(target); } catch { report.skip(); }
  } else {
    try {
      await overwriteAndRemove(target, method);
      report.file();
    } catch {
      report.skip();
    }
  }
}

// 드라이브의 빈 공간을 패턴으로 채워 이전에 지운 데이터의 흔적을 덮어씀
async function wipeFreeSpace(driveLetter, method, report) {
  const dir = path.join(driveLetter + "\\", FREESPACE_DIR);
  const passes = passesFor(method);
  for (let p = 0; p < passes.length; p++) {
    const kind = passes[p];
    await fsp.mkdir(dir, { recursive: true });
    let idx = 0;
    let stop = false;
    while (!stop) {
      const tmp = path.join(dir, `fill_${idx}.tmp`);
      let fd = null;
      try {
        fd = await fsp.open(tmp, "w");
        const buf = Buffer.alloc(CHUNK);
        for (let n = 0; n < FILL_FILE_CHUNKS; n++) {
          fillBuffer(buf, CHUNK, kind);
          await fd.write(buf, 0, CHUNK);
        }
        await fd.sync();
      } catch (err) {
        // 디스크가 가득 차면(ENOSPC) 이번 패스 종료
        stop = true;
        if (err && err.code !== "ENOSPC") {
          // 예기치 못한 오류여도 디스크를 가득 채운 채로 두지 않도록 정리 후 종료
        }
      } finally {
        if (fd) { try { await fd.close(); } catch { /* noop */ } }
      }
      idx += 1;
      report.free(p + 1, passes.length, idx);
    }
    // 이번 패스에서 채운 임시 파일 제거 → 다음 패스/정상 사용을 위해 공간 회수
    try { await fsp.rm(dir, { recursive: true, force: true }); } catch { /* noop */ }
  }
}

function makeReporter(sender) {
  let files = 0;
  let skipped = 0;
  let last = 0;
  const emit = (payload) => {
    try { sender.send("secure-erase:progress", payload); } catch { /* 창이 닫힌 경우 무시 */ }
  };
  return {
    info(text) { emit({ phase: "info", text }); },
    file() {
      files += 1;
      const now = Date.now();
      if (now - last > 150) { last = now; emit({ phase: "overwrite", files, skipped }); }
    },
    skip() { skipped += 1; },
    free(pass, total, idx) {
      emit({ phase: "freespace", pass, total, sizeGb: idx, files, skipped });
    },
    summary() { return { files, skipped }; },
  };
}

async function listDrives() {
  if (process.platform !== "win32") {
    return { drives: [] };
  }
  const systemDrive = String(process.env.SystemDrive || "C:").toUpperCase();
  const appDrive = String(path.parse(process.cwd()).root || "").replace(/\\$/, "").toUpperCase();
  const script = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$list = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=2 OR DriveType=3' | ForEach-Object {
  [pscustomobject]@{
    letter     = ($_.DeviceID).TrimEnd(':').ToUpper()
    label      = $_.VolumeName
    fileSystem = $_.FileSystem
    sizeGb     = if ($_.Size) { [math]::Round($_.Size / 1GB, 1) } else { 0 }
    freeGb     = if ($_.FreeSpace) { [math]::Round($_.FreeSpace / 1GB, 1) } else { 0 }
    removable  = ($_.DriveType -eq 2)
  }
})
ConvertTo-Json -InputObject $list -Compress
`.trim();

  try {
    const raw = (await runPowerShell(script, 10000)).trim();
    if (!raw) return { drives: [] };
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    const drives = items.map((d) => {
      const letter = String(d.letter || "").toUpperCase();
      return {
        letter,
        label: d.label || "",
        fileSystem: d.fileSystem || "",
        sizeGb: Number(d.sizeGb) || 0,
        freeGb: Number(d.freeGb) || 0,
        removable: Boolean(d.removable),
        isSystem: `${letter}:` === systemDrive || `${letter}:` === appDrive,
      };
    });
    return { drives };
  } catch (err) {
    return { drives: [], messages: [`드라이브 목록을 불러오지 못했습니다: ${err.message}`] };
  }
}

function methodLabel(method) {
  return method === "dod" ? "DoD 5220.22-M (3회 덮어쓰기)" : "빠른 1회 (0으로 덮어쓰기)";
}

async function confirmDestructive(message, detail) {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showMessageBox(win, {
    type: "warning",
    buttons: ["취소", "영구 삭제 진행"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: "복구 불가 영구 삭제 확인",
    message,
    detail,
  });
  return result.response === 1;
}

async function erase(event, payload) {
  if (process.platform !== "win32") {
    throw new Error("Windows 전용 기능입니다.");
  }
  const { mode, method } = payload || {};
  const report = makeReporter(event.sender);

  if (mode === "path") {
    const target = String(payload.path || "").trim();
    if (!target) throw new Error("삭제할 파일 또는 폴더를 먼저 선택해 주세요.");
    if (!fs.existsSync(target)) throw new Error("선택한 경로를 찾을 수 없습니다.");

    const ok = await confirmDestructive(
      `선택한 항목을 복구 불가능하게 영구 삭제할까요?`,
      `대상: ${target}\n방식: ${methodLabel(method)}\n\n이 작업은 되돌릴 수 없습니다.`,
    );
    if (!ok) return { canceled: true };

    report.info("파일을 덮어쓰는 중입니다...");
    await shredTree(target, method, report);
    return { ok: true, ...report.summary() };
  }

  if (mode === "drive") {
    const letter = String(payload.drive || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (!letter) throw new Error("와이프할 드라이브를 선택해 주세요.");

    const systemDrive = String(process.env.SystemDrive || "C:").toUpperCase();
    const appDrive = String(path.parse(process.cwd()).root || "").replace(/\\$/, "").toUpperCase();
    if (`${letter}:` === systemDrive || `${letter}:` === appDrive) {
      throw new Error("Windows가 설치된 드라이브 또는 이 앱이 실행 중인 드라이브는 와이프할 수 없습니다.");
    }
    const root = `${letter}:\\`;
    if (!fs.existsSync(root)) throw new Error(`${letter}: 드라이브를 찾을 수 없습니다.`);

    const ok = await confirmDestructive(
      `${letter}: 드라이브 전체를 복구 불가능하게 와이프할까요?`,
      `${letter}: 드라이브의 모든 파일과 빈 공간을 ${methodLabel(method)} 방식으로 덮어씁니다.\n\n` +
        "드라이브 안의 모든 데이터가 영구 삭제되며 되돌릴 수 없습니다.",
    );
    if (!ok) return { canceled: true };

    report.info(`${letter}: 드라이브의 파일을 덮어쓰는 중입니다...`);
    let entries = [];
    try { entries = await fsp.readdir(root); } catch { /* noop */ }
    for (const entry of entries) {
      if (entry === FREESPACE_DIR) continue;
      await shredTree(path.join(root, entry), method, report);
    }
    report.info("빈 공간을 덮어쓰는 중입니다... (시간이 오래 걸릴 수 있습니다)");
    await wipeFreeSpace(letter + ":", method, report);
    return { ok: true, drive: letter, ...report.summary() };
  }

  throw new Error("알 수 없는 삭제 대상입니다.");
}

async function pickTarget(type) {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win, {
    title: type === "folder" ? "삭제할 폴더 선택" : "삭제할 파일 선택",
    properties: [type === "folder" ? "openDirectory" : "openFile"],
  });
  if (result.canceled || !result.filePaths.length) {
    return { path: "" };
  }
  return { path: result.filePaths[0] };
}

function register(ipcMain) {
  ipcMain.handle("secure-erase:listDrives", () => listDrives());
  ipcMain.handle("secure-erase:pick", (_event, type) => pickTarget(type));
  ipcMain.handle("secure-erase:run", (event, payload) => erase(event, payload));
}

module.exports = { register };
