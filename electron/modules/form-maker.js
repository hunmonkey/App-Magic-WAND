const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const { ensureDataSubdir, getDataSubdirPath, getLegacyFilePath, migrateLegacySubdir } = require("../core/portable-data");

const STORE_DIR = "form_documents";
const LEGACY_FILE = "form_documents.json";

function getDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

// 문서가 많아질 것을 대비해, 본문은 문서별 .html 파일에 저장하고
// 목록은 가벼운 index.json(메타데이터만)으로 따로 관리한다.
function getStoreDir() {
  return getDataSubdirPath(app, STORE_DIR);
}

function getLegacyDocumentsFilePath() {
  return getLegacyFilePath(app, LEGACY_FILE);
}

function getIndexPath() {
  return path.join(getStoreDir(), "index.json");
}

function getDocPath(id) {
  return path.join(getStoreDir(), `${id}.html`);
}

function sanitizeId(id) {
  return String(id ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
}

function makeId() {
  return `doc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeEntry(entry) {
  return {
    id: sanitizeId(entry?.id),
    title: String(entry?.title ?? "").trim(),
    createdAt: String(entry?.createdAt ?? "").trim(),
    updatedAt: String(entry?.updatedAt ?? "").trim(),
  };
}

async function ensureDir() {
  await ensureDataSubdir(app, STORE_DIR);
}

async function readIndex() {
  await migrateLegacy();
  try {
    const text = await fs.readFile(getIndexPath(), "utf-8");
    const list = JSON.parse(text);
    return Array.isArray(list) ? list.map(normalizeEntry).filter((entry) => entry.id) : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeIndex(list) {
  await ensureDir();
  await fs.writeFile(getIndexPath(), JSON.stringify(list, null, 2), "utf-8");
}

// 이전 단일 파일(form_documents.json)이 있으면 문서별 파일 구조로 한 번 이전한다.
async function migrateLegacy() {
  await migrateLegacySubdir(app, STORE_DIR);

  try {
    await fs.access(getIndexPath());
    return;
  } catch {
    // index.json이 없을 때만 이전을 시도한다.
  }

  let text;
  try {
    text = await fs.readFile(getLegacyDocumentsFilePath(), "utf-8");
  } catch {
    return;
  }

  let docs;
  try {
    docs = JSON.parse(text);
  } catch {
    return;
  }
  if (!Array.isArray(docs) || !docs.length) {
    return;
  }

  await ensureDir();
  const index = [];
  for (const doc of docs) {
    const id = sanitizeId(doc?.id) || makeId();
    await fs.writeFile(getDocPath(id), String(doc?.html ?? ""), "utf-8");
    index.push({
      id,
      title: String(doc?.title ?? "").trim(),
      createdAt: String(doc?.createdAt ?? "").trim(),
      updatedAt: String(doc?.updatedAt ?? "").trim(),
    });
  }
  await fs.writeFile(getIndexPath(), JSON.stringify(index, null, 2), "utf-8");
  await fs.rename(getLegacyDocumentsFilePath(), `${getLegacyDocumentsFilePath()}.bak`).catch(() => {});
}

async function listDocs() {
  return readIndex();
}

async function readDoc(id) {
  const safeId = sanitizeId(id);
  const index = await readIndex();
  const entry = index.find((item) => item.id === safeId);

  let html = "";
  try {
    html = await fs.readFile(getDocPath(safeId), "utf-8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  if (!entry) {
    return { id: safeId, title: "", html, createdAt: "", updatedAt: "" };
  }
  return { ...entry, html };
}

// payload: { id?, title, html? }
// html이 없으면(이름 변경 등) 본문은 그대로 두고 메타데이터만 갱신한다.
async function writeDoc(payload) {
  const { id, title, html } = payload || {};
  const index = await readIndex();
  const now = new Date().toISOString();

  let safeId = sanitizeId(id);
  let entry = safeId ? index.find((item) => item.id === safeId) : null;

  if (entry) {
    entry.title = String(title ?? "").trim();
    entry.updatedAt = now;
  } else {
    safeId = safeId || makeId();
    entry = { id: safeId, title: String(title ?? "").trim(), createdAt: now, updatedAt: now };
    index.push(entry);
  }

  if (html !== undefined) {
    await ensureDir();
    await fs.writeFile(getDocPath(safeId), String(html), "utf-8");
  }
  await writeIndex(index);
  return entry;
}

async function deleteDoc(id) {
  const safeId = sanitizeId(id);
  const index = await readIndex();
  const next = index.filter((item) => item.id !== safeId);
  await writeIndex(next);
  await fs.rm(getDocPath(safeId), { force: true });
  return next;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[<>&]/g, (char) => {
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    return "&amp;";
  });
}

function buildHtmlDocument(title, bodyHtml) {
  const safeTitle = escapeHtml(String(title || "").trim() || "양식지");
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<title>${safeTitle}</title>
<style>
  body { margin: 0; background: #edf2f7; color: #17202a; font-family: "Malgun Gothic", "맑은 고딕", sans-serif; }
  .sheet { max-width: 780px; margin: 24px auto; padding: 56px 60px; background: #fff; box-shadow: 0 1px 8px rgba(16, 32, 51, 0.18); line-height: 1.6; }
  .sheet table { border-collapse: collapse; margin: 8px 0; }
  .sheet td, .sheet th { border: 1px solid #99a7b8; padding: 6px 10px; word-break: break-word; overflow-wrap: anywhere; }
  .sheet img { max-width: 100%; }
  @media print { body { background: #fff; } .sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; } }
</style>
</head>
<body>
<div class="sheet">
${bodyHtml}
</div>
</body>
</html>
`;
}

async function saveDocument(event, payload) {
  const { html, title } = payload || {};
  const body = String(html ?? "").trim();
  if (!body) {
    throw new Error("저장할 문서 내용이 없습니다.");
  }

  const window = BrowserWindow.fromWebContents(event.sender);
  const baseName = (String(title || "").trim() || "양식지").replace(/[\\/:*?"<>|]/g, "_");
  const result = await dialog.showSaveDialog(window, {
    title: "양식지 HTML 저장",
    defaultPath: `${baseName}_${getDateStamp()}.html`,
    filters: [{ name: "HTML File", extensions: ["html"] }],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  // 일부 프로그램이 UTF-8을 EUC-KR로 잘못 인식하지 않도록 BOM을 붙여 내보낸다.
  await fs.writeFile(result.filePath, "﻿" + buildHtmlDocument(title, body), "utf-8");
  return { canceled: false, filePath: result.filePath };
}

function register(ipcMain) {
  ipcMain.handle("form-maker:save", (event, payload) => saveDocument(event, payload));
  ipcMain.handle("form-maker:list", () => listDocs());
  ipcMain.handle("form-maker:read", (_event, id) => readDoc(id));
  ipcMain.handle("form-maker:write", (_event, payload) => writeDoc(payload));
  ipcMain.handle("form-maker:delete", (_event, id) => deleteDoc(id));
}

module.exports = {
  register,
};
