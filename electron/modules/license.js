// 정품키 실행 게이트
// - 정품키(.lic) 서명검증 + 만료확인
// - 계정/암호 검증 (정품키 안에 해시로 서명되어 있음)
// - 시계 되돌리기 방어: 마지막 로그인 시각보다 과거면 1회 경고, 2회째 영구 잠금
// - 마스터 해제키로만 잠금 해제
//
// ⚠️ 한계: 오프라인 포터블 특성상 코드 자체를 패치하는 전문가는 막지 못함.
//    코드 보호(asar/bytenode)로 난이도만 올린다. (설계 합의 사항)
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ──────────────────────────────────────────────────────────────
// 앱에 내장되는 검증용 공개키.
// 재훈 님이 `node tools/keygen/generate-keys.js` 실행 후 생성된
// tools/keygen/public.pem 의 내용을 아래에 그대로 붙여넣으세요.
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAuKxxpHmTlVqDmVOOQspet/iIlZWHQ2HrmZhe9lJb02A=
-----END PUBLIC KEY-----`;

// 상태 저장 변조 방지용 비밀값 (코드 보호로 가려짐)
const STATE_SECRET = "mw-state-2f9c1a7b40e84d6f-do-not-share";

const GRACE_SEC = 600; // 시계 오차 허용치(10분). 이보다 더 과거여야 위반으로 셈.
const LICENSE_FILE = "magicwand.lic";
const STATE_FILE = ".mwstate";

const sec = () => Math.floor(Date.now() / 1000);

function hasPublicKey() {
  return PUBLIC_KEY_PEM.includes("BEGIN PUBLIC KEY") && !PUBLIC_KEY_PEM.includes("__PASTE_PUBLIC_KEY_HERE__");
}

// ── 정품키 서명검증: 통과 시 payload 객체, 실패 시 null
function verifyLicense(licString) {
  try {
    const lic = JSON.parse(licString);
    const payloadBuf = Buffer.from(lic.payload, "base64url");
    const sig = Buffer.from(lic.sig, "base64url");
    const pub = crypto.createPublicKey(PUBLIC_KEY_PEM);
    if (!crypto.verify(null, payloadBuf, pub, sig)) return null;
    return JSON.parse(payloadBuf.toString("utf8"));
  } catch {
    return null;
  }
}

// ── 계정/암호 검증 (정품키 payload 안의 scrypt 해시와 대조)
function checkPassword(payload, account, password) {
  try {
    if (!payload || payload.account !== account) return false;
    const salt = Buffer.from(payload.salt, "hex");
    const expected = Buffer.from(payload.passHash, "hex");
    const actual = crypto.scryptSync(String(password), salt, expected.length);
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// ── 시계 되돌리기 판정 (순수 함수, 테스트 대상)
// 반환: { state(갱신본), clockWarning, lockedNow }
function applyClockCheck(state, now) {
  if (state.locked) return { state, clockWarning: false, lockedNow: false };
  if (state.lastSeen && now < state.lastSeen - GRACE_SEC) {
    const strikes = (state.strikes || 0) + 1;
    if (strikes >= 2) {
      return { state: { ...state, strikes, locked: true }, clockWarning: false, lockedNow: true };
    }
    return { state: { ...state, strikes }, clockWarning: true, lockedNow: false };
  }
  return { state, clockWarning: false, lockedNow: false };
}

// ── 상태 봉인/개봉 (HMAC으로 변조 감지)
function sealState(state) {
  const d = JSON.stringify(state);
  const m = crypto.createHmac("sha256", STATE_SECRET).update(d).digest("hex");
  return JSON.stringify({ d, m });
}
function openState(raw) {
  try {
    const { d, m } = JSON.parse(raw);
    const calc = crypto.createHmac("sha256", STATE_SECRET).update(d).digest("hex");
    if (calc !== m) return null;
    return JSON.parse(d);
  } catch {
    return null;
  }
}

// ── 상태 저장 위치 (여러 곳에 분산 → 한 곳 지워도 다른 곳에서 복원)
function stateLocations(app) {
  const locs = [];
  const portableDir = getPortableDir();
  if (portableDir) {
    locs.push(path.join(portableDir, STATE_FILE));
  }
  try {
    locs.push(path.join(path.dirname(process.execPath), STATE_FILE));
  } catch {}
  try {
    locs.push(path.join(app.getPath("userData"), STATE_FILE));
  } catch {}
  return locs;
}

function loadState(app) {
  const merged = { lastSeen: 0, strikes: 0, locked: false };
  for (const loc of stateLocations(app)) {
    try {
      const s = openState(fs.readFileSync(loc, "utf8"));
      if (!s) continue;
      merged.lastSeen = Math.max(merged.lastSeen, s.lastSeen || 0);
      merged.strikes = Math.max(merged.strikes, s.strikes || 0);
      merged.locked = merged.locked || !!s.locked;
    } catch {}
  }
  return merged;
}

function saveState(app, state) {
  const sealed = sealState(state);
  for (const loc of stateLocations(app)) {
    try {
      fs.mkdirSync(path.dirname(loc), { recursive: true });
      fs.writeFileSync(loc, sealed);
    } catch {}
  }
}

// ── 정품키 파일 찾기 (포터블 exe 옆 → userData → 리소스)
function findLicense(app) {
  const cands = [
    path.join(path.dirname(process.execPath), LICENSE_FILE),
    path.join(app.getPath("userData"), LICENSE_FILE),
  ];
  const portableDir = getPortableDir();
  if (portableDir) {
    cands.unshift(path.join(portableDir, LICENSE_FILE));
  }
  if (process.resourcesPath) cands.push(path.join(process.resourcesPath, LICENSE_FILE));
  for (const c of cands) {
    try {
      if (fs.existsSync(c)) return fs.readFileSync(c, "utf8");
    } catch {}
  }
  return null;
}

function getPortableDir() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return process.env.PORTABLE_EXECUTABLE_DIR;
  }
  if (process.env.PORTABLE_EXECUTABLE_FILE) {
    return path.dirname(process.env.PORTABLE_EXECUTABLE_FILE);
  }
  return "";
}

// ── 앱 시작 시 평가
// status: ok-needs-login | no-license | invalid | expired | locked | no-public-key
function evaluateStartup(app) {
  if (!hasPublicKey()) return { status: "no-public-key" };

  const now = sec();
  const state = loadState(app);

  const clock = applyClockCheck(state, now);
  if (clock.lockedNow) {
    saveState(app, clock.state);
    return { status: "locked", reason: "clock" };
  }
  if (state.locked) return { status: "locked" };
  if (clock.clockWarning) saveState(app, clock.state);

  const licRaw = findLicense(app);
  if (!licRaw) return { status: "no-license", clockWarning: clock.clockWarning };

  const payload = verifyLicense(licRaw);
  if (!payload || payload.type !== "license") return { status: "invalid", clockWarning: clock.clockWarning };
  if (payload.exp && now >= payload.exp) return { status: "expired", exp: payload.exp, clockWarning: clock.clockWarning };

  return { status: "ok-needs-login", account: payload.account, exp: payload.exp, clockWarning: clock.clockWarning };
}

// ── 로그인 시도 (계정/암호 제출 시). 성공하면 lastSeen 갱신.
function tryLogin(app, account, password) {
  const licRaw = findLicense(app);
  const payload = licRaw && verifyLicense(licRaw);
  if (!payload || payload.type !== "license") return { ok: false, reason: "invalid" };
  const now = sec();
  if (payload.exp && now >= payload.exp) return { ok: false, reason: "expired" };
  if (!checkPassword(payload, account, password)) return { ok: false, reason: "bad-credentials" };

  const state = loadState(app);
  state.lastSeen = Math.max(state.lastSeen || 0, now);
  saveState(app, state);
  return { ok: true, exp: payload.exp };
}

// ── 마스터 해제키로 잠금 해제
function tryUnlock(app, unlockRaw) {
  const payload = verifyLicense(unlockRaw);
  if (!payload || payload.type !== "master-unlock") return { ok: false };
  saveState(app, { lastSeen: sec(), strikes: 0, locked: false });
  return { ok: true };
}

module.exports = {
  // 게이트용
  evaluateStartup,
  tryLogin,
  tryUnlock,
  findLicense,
  // 순수 함수 (단위 테스트/재사용)
  verifyLicense,
  checkPassword,
  applyClockCheck,
  hasPublicKey,
  GRACE_SEC,
};
