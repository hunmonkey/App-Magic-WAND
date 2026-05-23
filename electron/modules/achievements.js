const { app } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const BADGES = [
  { id: "first-check", label: "첫 점검", description: "점검을 처음 완료했습니다.", test: (s) => s.checksDone >= 1 },
  { id: "ten-checks", label: "점검 10회", description: "점검을 10회 완료했습니다.", test: (s) => s.checksDone >= 10 },
  { id: "first-backup", label: "첫 백업", description: "백업 작업을 처음 완료했습니다.", test: (s) => s.backupsDone >= 1 },
  { id: "first-cleanup", label: "첫 정리", description: "시스템 정리를 처음 완료했습니다.", test: (s) => s.cleanupsDone >= 1 },
  { id: "first-license", label: "라이선스 등록", description: "소프트웨어 라이선스를 저장했습니다.", test: (s) => s.licensesSaved >= 1 },
  { id: "night-owl", label: "야간 점검", description: "늦은 시간에도 꼼꼼히 점검했습니다.", test: (s) => s.nightRuns >= 1 },
];

function getDataDir() {
  if (app.isPackaged) {
    return app.getPath("userData");
  }
  return path.join(app.getAppPath(), "data");
}

function getFilePath() {
  return path.join(getDataDir(), "achievements.json");
}

function initialState() {
  return {
    checksDone: 0,
    backupsDone: 0,
    transfersDone: 0,
    cleanupsDone: 0,
    driversBackedUp: 0,
    licensesSaved: 0,
    commandsUsed: 0,
    nightRuns: 0,
    badges: [],
    updatedAt: "",
  };
}

function normalize(value) {
  return {
    ...initialState(),
    ...Object.fromEntries(
      Object.entries(value || {}).filter(([key]) => key !== "badges").map(([key, val]) => [key, Number.isFinite(Number(val)) ? Number(val) : val]),
    ),
    badges: Array.isArray(value?.badges) ? value.badges.filter(Boolean).map(String) : [],
    updatedAt: String(value?.updatedAt || "").trim(),
  };
}

async function readState() {
  try {
    const text = await fs.readFile(getFilePath(), "utf-8");
    return normalize(JSON.parse(text));
  } catch (error) {
    if (error.code === "ENOENT") {
      return initialState();
    }
    throw error;
  }
}

async function writeState(state) {
  await fs.mkdir(getDataDir(), { recursive: true });
  await fs.writeFile(getFilePath(), JSON.stringify(state, null, 2), "utf-8");
}

function applyBadges(state) {
  const before = new Set(state.badges);
  const after = new Set(state.badges);
  for (const badge of BADGES) {
    if (badge.test(state)) {
      after.add(badge.id);
    }
  }
  state.badges = [...after];
  return state.badges.filter((id) => !before.has(id)).map((id) => BADGES.find((badge) => badge.id === id)).filter(Boolean);
}

async function get() {
  const state = await readState();
  return {
    ...state,
    badgeDetails: state.badges.map((id) => BADGES.find((badge) => badge.id === id)).filter(Boolean),
  };
}

async function bump(payload = {}) {
  const key = String(payload.key || "").trim();
  if (!key || !(key in initialState())) {
    throw new Error("알 수 없는 도전과제 항목입니다.");
  }
  const amount = Math.max(1, Number(payload.amount) || 1);
  const state = await readState();
  state[key] = Number(state[key] || 0) + amount;
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 6) {
    state.nightRuns = Number(state.nightRuns || 0) + 1;
  }
  state.updatedAt = new Date().toISOString();
  const newBadges = applyBadges(state);
  await writeState(state);
  return {
    ...(await get()),
    newBadges,
  };
}

function register(ipcMain) {
  ipcMain.handle("achv:get", () => get());
  ipcMain.handle("achv:bump", (_event, payload) => bump(payload));
}

module.exports = {
  register,
};
