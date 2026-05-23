const { BrowserWindow, dialog } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const { runPowerShell } = require("../core/run-command");

function eventHint(event) {
  const provider = String(event.provider || "").toLowerCase();
  const id = Number(event.id);

  if (provider.includes("kernel-power") && id === 41) {
    return "전원이 갑자기 꺼졌거나 강제 종료된 기록입니다. 전원, 배터리, 과열 여부를 확인해 주세요.";
  }
  if ((provider.includes("disk") || provider.includes("stor") || provider.includes("ntfs")) && [7, 51, 55, 129, 153].includes(id)) {
    return "디스크나 저장장치 연결 문제일 수 있습니다. SMART 점검과 케이블 상태를 함께 확인해 주세요.";
  }
  if (provider.includes("whea") && [17, 18, 19].includes(id)) {
    return "CPU, RAM, 그래픽카드, PCIe 장치 같은 하드웨어 쪽 경고일 수 있습니다.";
  }
  if (provider.includes("service control manager") && [7000, 7001, 7009, 7031, 7034].includes(id)) {
    return "Windows 서비스가 시작되지 않았거나 중간에 종료된 기록입니다. 반복되는 서비스 이름을 확인해 주세요.";
  }
  if (provider.includes("distributedcom") && id === 10016) {
    return "권한 관련 흔한 Windows 로그입니다. 같은 시간대의 다른 오류와 함께 봐야 합니다.";
  }
  if (provider.includes("application error") && id === 1000) {
    return "프로그램이 비정상 종료된 기록입니다. 같은 프로그램 이름이 반복되는지 확인해 주세요.";
  }
  if (provider.includes("display") || provider.includes("nvlddmkm") || provider.includes("amdkmdag")) {
    return "그래픽 드라이버가 멈췄거나 다시 시작된 흔적일 수 있습니다.";
  }
  return "같은 공급자와 이벤트 ID가 반복되는지 확인해 원인을 좁혀보세요.";
}

async function scan(options = {}) {
  if (process.platform !== "win32") {
    return { events: [], groups: [], message: "이벤트 로그 조회는 Windows에서 사용할 수 있습니다." };
  }

  const days = Math.max(1, Math.min(30, Number(options.days) || 7));
  const maxEvents = Math.max(50, Math.min(1000, Number(options.maxEvents) || 300));
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$since = (Get-Date).AddDays(-${days})
$events = @(Get-WinEvent -FilterHashtable @{ LogName = @('System','Application'); Level = 2,3; StartTime = $since } -MaxEvents ${maxEvents} -ErrorAction SilentlyContinue |
  ForEach-Object {
    [pscustomobject]@{
      Time = $_.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss')
      Log = [string]$_.LogName
      Level = [string]$_.LevelDisplayName
      Provider = [string]$_.ProviderName
      Id = [int]$_.Id
      Message = ([string]$_.Message -replace '\\s+', ' ').Trim()
    }
  })
$events | ConvertTo-Json -Depth 4
`;

  const output = (await runPowerShell(script, 45000)).trim();
  const events = arrayify(output ? JSON.parse(output) : []).map((item) => ({
    time: clean(item.Time),
    log: clean(item.Log),
    level: clean(item.Level),
    provider: clean(item.Provider),
    id: Number(item.Id) || 0,
    message: clean(item.Message).slice(0, 600),
  }));

  const groups = groupEvents(events);
  return {
    days,
    events,
    groups,
    message: events.length ? `최근 ${days}일 동안 오류/경고 ${events.length}건을 찾았습니다.` : `최근 ${days}일 동안 오류/경고 기록이 없습니다.`,
  };
}

function groupEvents(events) {
  const map = new Map();
  for (const event of events) {
    const key = [event.log, event.level, event.provider, event.id].join("|");
    const found = map.get(key) || {
      log: event.log,
      level: event.level,
      provider: event.provider,
      id: event.id,
      count: 0,
      firstTime: event.time,
      lastTime: event.time,
      sample: event.message,
      hint: eventHint(event),
    };
    found.count += 1;
    found.firstTime = event.time;
    map.set(key, found);
  }
  return [...map.values()].sort((left, right) => right.count - left.count || String(right.lastTime).localeCompare(String(left.lastTime))).slice(0, 12);
}

async function saveText(event, text) {
  const body = String(text || "").trim();
  if (!body) {
    throw new Error("저장할 이벤트 로그 내용이 없습니다.");
  }

  const window = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(window, {
    title: "이벤트 로그 TXT 저장",
    defaultPath: `Event_Log_${new Date().toISOString().slice(0, 10)}.txt`,
    filters: [{ name: "Text File", extensions: ["txt"] }],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  await fs.mkdir(path.dirname(result.filePath), { recursive: true });
  await fs.writeFile(result.filePath, `\uFEFF${body}\n`, "utf-8");
  return { canceled: false, filePath: result.filePath };
}

function clean(value) {
  return String(value ?? "").trim();
}

function arrayify(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function register(ipcMain) {
  ipcMain.handle("eventLog:scan", (_event, options) => scan(options));
  ipcMain.handle("eventLog:saveText", (event, text) => saveText(event, text));
}

module.exports = {
  register,
};
