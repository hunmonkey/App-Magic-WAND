const fs = require("fs/promises");
const path = require("path");
const { BrowserWindow, dialog } = require("electron");

// 적용(실제 변경) 요청은 이 토큰이 있어야만 동작한다. (실수 방지)
const APPLY_TOKEN = "file-rename-confirmed";

// 시스템/보호 폴더 — 이 안의 파일은 이름을 바꾸지 않는다.
function protectedRoots() {
  const sysDrive = String(process.env.SystemDrive || "C:").trim();
  const win = String(process.env.WINDIR || process.env.SystemRoot || `${sysDrive}\\Windows`).trim();
  return [
    win,
    path.join(`${sysDrive}\\`, "Program Files"),
    path.join(`${sysDrive}\\`, "Program Files (x86)"),
    path.join(`${sysDrive}\\`, "ProgramData"),
  ].map((root) => path.resolve(root).toLowerCase());
}

function isProtected(folder) {
  const resolved = path.resolve(String(folder || ""));
  const parsed = path.parse(resolved);
  if (!resolved || resolved.toLowerCase() === parsed.root.toLowerCase()) {
    return true; // 드라이브 루트 자체는 금지
  }
  const lower = resolved.toLowerCase();
  return protectedRoots().some((root) => lower === root || lower.startsWith(root + path.sep));
}

async function pickFolder(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: "이름을 바꿀 파일이 있는 폴더 선택",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }
  return { canceled: false, folder: result.filePaths[0] };
}

// 폴더 안의 파일 목록을 모은다. 숨김/시스템 파일은 제외한다.
async function collectFiles(folder, includeSubfolders) {
  const files = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isFile()) {
        files.push({ dir, name: entry.name });
      } else if (entry.isDirectory() && includeSubfolders) {
        await walk(full);
      }
    }
  }

  await walk(path.resolve(folder));
  return files;
}

// 규칙을 적용해 새 파일명을 만든다. name은 확장자를 포함한 파일명이다.
function applyRules(name, rules, seqIndex) {
  const dot = name.lastIndexOf(".");
  let base = dot > 0 ? name.slice(0, dot) : name;
  let ext = dot > 0 ? name.slice(dot + 1) : "";

  if (rules.find) {
    base = base.split(rules.find).join(rules.replaceWith || "");
  }
  if (rules.trimSpaces) {
    base = base.replace(/\s+/g, " ").trim();
  }
  if (rules.caseMode === "lower") {
    base = base.toLowerCase();
  } else if (rules.caseMode === "upper") {
    base = base.toUpperCase();
  }
  if (rules.prefix) {
    base = rules.prefix + base;
  }
  if (rules.suffix) {
    base += rules.suffix;
  }
  if (rules.sequence && rules.sequence.enabled) {
    const padding = Math.max(1, Number(rules.sequence.padding) || 1);
    const start = Number(rules.sequence.start) || 1;
    const num = String(start + seqIndex).padStart(padding, "0");
    base = rules.sequence.position === "prefix" ? `${num}_${base}` : `${base}_${num}`;
  }
  if (rules.extensionTo && rules.extensionTo.trim()) {
    ext = rules.extensionTo.trim().replace(/^\./, "");
  }

  return ext ? `${base}.${ext}` : base;
}

// 같은 폴더 안에서 결과 이름이 겹치거나 비어 있으면 충돌로 표시한다.
function markConflicts(items) {
  let conflicts = 0;
  const byDir = new Map();
  for (const item of items) {
    const key = item.dir;
    if (!byDir.has(key)) byDir.set(key, []);
    byDir.get(key).push(item);
  }

  for (const list of byDir.values()) {
    const targetCount = new Map();
    for (const item of list) {
      const key = item.to.toLowerCase();
      targetCount.set(key, (targetCount.get(key) || 0) + 1);
    }
    for (const item of list) {
      if (!item.changed) {
        continue;
      }
      if (!item.to) {
        item.conflict = true;
        item.reason = "빈 이름";
      } else if (/[\\/:*?"<>|]/.test(item.to)) {
        item.conflict = true;
        item.reason = "사용할 수 없는 문자";
      } else if (targetCount.get(item.to.toLowerCase()) > 1) {
        item.conflict = true;
        item.reason = "이름 중복";
      }
      if (item.conflict) {
        conflicts += 1;
      }
    }
  }
  return conflicts;
}

async function preview(_event, payload = {}) {
  const { folder, rules = {}, includeSubfolders = false } = payload;
  if (!folder) {
    throw new Error("폴더를 먼저 선택해 주세요.");
  }
  const files = await collectFiles(folder, includeSubfolders);
  const items = files.map((file, index) => {
    const to = applyRules(file.name, rules, index);
    return { dir: file.dir, from: file.name, to, changed: to !== file.name, conflict: false, reason: "" };
  });
  const conflictCount = markConflicts(items);
  return {
    folder,
    total: items.length,
    changedCount: items.filter((item) => item.changed && !item.conflict).length,
    conflictCount,
    hasConflict: conflictCount > 0,
    items,
  };
}

async function apply(_event, payload = {}) {
  if (payload.token !== APPLY_TOKEN) {
    throw new Error("변경 확인이 필요합니다.");
  }
  const { folder, items = [] } = payload;
  if (!folder) {
    throw new Error("폴더 정보가 없습니다.");
  }
  if (isProtected(folder)) {
    throw new Error("시스템 폴더의 파일은 변경할 수 없습니다.");
  }

  const targets = items.filter((item) => item.changed && !item.conflict && item.to);
  let renamed = 0;
  let failed = 0;
  const failures = [];

  // 폴더별로 임시 이름 → 최종 이름 2단계로 바꿔, 서로 이름을 맞바꾸는 충돌을 막는다.
  const byDir = new Map();
  for (const item of targets) {
    const dir = item.dir || folder;
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(item);
  }

  for (const [dir, list] of byDir) {
    const staged = [];
    for (const item of list) {
      const fromPath = path.join(dir, item.from);
      const tmpPath = path.join(dir, `__mwtmp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`);
      try {
        await fs.rename(fromPath, tmpPath);
        staged.push({ tmpPath, to: item.to, from: item.from });
      } catch (error) {
        failed += 1;
        failures.push({ from: item.from, message: error.message });
      }
    }
    for (const entry of staged) {
      try {
        await fs.rename(entry.tmpPath, path.join(dir, entry.to));
        renamed += 1;
      } catch (error) {
        failed += 1;
        failures.push({ from: entry.from, to: entry.to, message: error.message });
        // 최종 변경 실패 시 원래 이름으로 되돌린다.
        await fs.rename(entry.tmpPath, path.join(dir, entry.from)).catch(() => {});
      }
    }
  }

  return { renamed, failed, failures };
}

function register(ipcMain) {
  ipcMain.handle("fileRename:pickFolder", (event) => pickFolder(event));
  ipcMain.handle("fileRename:preview", (event, payload) => preview(event, payload));
  ipcMain.handle("fileRename:apply", (event, payload) => apply(event, payload));
}

module.exports = {
  register,
};
