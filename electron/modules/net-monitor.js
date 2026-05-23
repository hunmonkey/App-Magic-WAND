const { runPowerShell } = require("../core/run-command");

const monitors = new Map();

function psQuote(value) {
  return "'" + String(value ?? "").replace(/'/g, "''") + "'";
}

function clampInterval(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 2000;
  return Math.max(1000, Math.min(10000, Math.round(number)));
}

async function start(event, options = {}) {
  const sender = event.sender;
  const key = sender.id;
  stopByKey(key);

  const state = {
    sender,
    timer: null,
    busy: false,
    lastStats: null,
    intervalMs: clampInterval(options.intervalMs),
    targetHost: String(options.targetHost || "1.1.1.1").trim() || "1.1.1.1",
    interfaceName: String(options.interfaceName || "").trim(),
  };
  monitors.set(key, state);

  const run = () => tick(key).catch(() => {});
  run();
  state.timer = setInterval(run, state.intervalMs);
  sender.once("destroyed", () => stopByKey(key));
  return { ok: true, intervalMs: state.intervalMs, targetHost: state.targetHost };
}

function stop(event) {
  return stopByKey(event.sender.id);
}

function stopByKey(key) {
  const state = monitors.get(key);
  if (!state) {
    return { stopped: false };
  }
  if (state.timer) {
    clearInterval(state.timer);
  }
  monitors.delete(key);
  return { stopped: true };
}

async function tick(key) {
  const state = monitors.get(key);
  if (!state || state.busy || !state.sender || state.sender.isDestroyed()) {
    return;
  }

  state.busy = true;
  try {
    const [stats, ping] = await Promise.all([
      readAdapterStats(state.interfaceName),
      pingHost(state.targetHost),
    ]);
    const now = Date.now();
    const speed = calculateSpeed(state.lastStats, stats, now);
    state.lastStats = { ...stats, time: now };
    send(state, {
      timestamp: new Date(now).toISOString(),
      interfaceName: stats.name,
      linkSpeed: stats.linkSpeed,
      targetHost: state.targetHost,
      online: ping.online,
      latencyMs: ping.latencyMs,
      lossPercent: ping.online ? 0 : 100,
      downloadBps: speed.downloadBps,
      uploadBps: speed.uploadBps,
    });
  } catch (error) {
    send(state, {
      timestamp: new Date().toISOString(),
      targetHost: state.targetHost,
      online: false,
      latencyMs: null,
      lossPercent: 100,
      downloadBps: 0,
      uploadBps: 0,
      error: error.message,
    });
  } finally {
    state.busy = false;
  }
}

async function readAdapterStats(interfaceName) {
  if (process.platform !== "win32") {
    return { name: "Network", linkSpeed: "", receivedBytes: 0, sentBytes: 0 };
  }

  const nameFilter = interfaceName ? `$adapter = Get-NetAdapter -Name ${psQuote(interfaceName)} -ErrorAction SilentlyContinue` : "$adapter = $null";
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
${nameFilter}
if (-not $adapter) {
  $adapter = Get-NetAdapter -ErrorAction SilentlyContinue |
    Where-Object { $_.Status -eq 'Up' -and $_.HardwareInterface } |
    Sort-Object InterfaceMetric |
    Select-Object -First 1
}
if (-not $adapter) {
  $adapter = Get-NetAdapter -ErrorAction SilentlyContinue |
    Where-Object { $_.Status -eq 'Up' } |
    Select-Object -First 1
}
if (-not $adapter) { throw '사용 중인 네트워크 어댑터를 찾지 못했습니다.' }
$stats = Get-NetAdapterStatistics -Name $adapter.Name -ErrorAction Stop
[pscustomobject]@{
  Name = [string]$adapter.Name
  LinkSpeed = [string]$adapter.LinkSpeed
  ReceivedBytes = [int64]$stats.ReceivedBytes
  SentBytes = [int64]$stats.SentBytes
} | ConvertTo-Json -Depth 3
`;
  const output = (await runPowerShell(script, 8000)).trim();
  const data = JSON.parse(output);
  return {
    name: String(data.Name || "").trim(),
    linkSpeed: String(data.LinkSpeed || "").trim(),
    receivedBytes: Number(data.ReceivedBytes) || 0,
    sentBytes: Number(data.SentBytes) || 0,
  };
}

async function pingHost(targetHost) {
  if (process.platform !== "win32") {
    return { online: false, latencyMs: null };
  }

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$reply = @(Test-Connection -ComputerName ${psQuote(targetHost)} -Count 1 -ErrorAction SilentlyContinue | Select-Object -First 1)
if ($reply.Count -gt 0) {
  $latency = $reply[0].ResponseTime
  if ($null -eq $latency) { $latency = $reply[0].Latency }
  [pscustomobject]@{ Online = $true; LatencyMs = [double]$latency } | ConvertTo-Json -Depth 2
} else {
  [pscustomobject]@{ Online = $false; LatencyMs = $null } | ConvertTo-Json -Depth 2
}
`;
  const output = (await runPowerShell(script, 5000)).trim();
  const data = output ? JSON.parse(output) : {};
  const latency = data.LatencyMs == null ? NaN : Number(data.LatencyMs);
  return {
    online: Boolean(data.Online),
    latencyMs: Number.isFinite(latency) ? latency : null,
  };
}

function calculateSpeed(previous, current, now) {
  if (!previous) {
    return { downloadBps: 0, uploadBps: 0 };
  }
  const seconds = Math.max(0.001, (now - previous.time) / 1000);
  return {
    downloadBps: Math.max(0, Math.round((current.receivedBytes - previous.receivedBytes) / seconds)),
    uploadBps: Math.max(0, Math.round((current.sentBytes - previous.sentBytes) / seconds)),
  };
}

function send(state, payload) {
  if (!state.sender || state.sender.isDestroyed()) {
    return;
  }
  state.sender.send("netMonitor:tick", payload);
}

function register(ipcMain) {
  ipcMain.handle("netMonitor:start", (event, options) => start(event, options));
  ipcMain.handle("netMonitor:stop", (event) => stop(event));
}

module.exports = {
  register,
};
