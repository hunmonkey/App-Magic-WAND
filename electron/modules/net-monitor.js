const https = require("https");
const { execFileAsync } = require("../core/run-command");

const monitors = new Map();

const SPEED_HOST = "speed.cloudflare.com";
const DOWNLOAD_URL = "https://speed.cloudflare.com/__down";
const UPLOAD_URL = "https://speed.cloudflare.com/__up";
const MB = 1024 * 1024;

const DOWNLOAD_DURATION_MS = 6500;
const UPLOAD_DURATION_MS = 5000;
// Cloudflare rejects some binary MiB download sizes, including 16 MiB, with 403.
const DOWNLOAD_BLOCK_BYTES = 25_000_000;
const UPLOAD_BLOCK_BYTES = 4 * MB;
const MAX_DOWNLOAD_BYTES = 150_000_000;
const MAX_UPLOAD_BYTES = 48 * MB;
const DOWNLOAD_CONCURRENCY = 4;
const UPLOAD_CONCURRENCY = 2;

async function start(event) {
  const sender = event.sender;
  const key = sender.id;
  stopByKey(key);

  const state = {
    sender,
    cancelled: false,
    requests: new Set(),
    bestDownloadBps: 0,
    bestUploadBps: 0,
    latencyMs: null,
  };
  monitors.set(key, state);

  runSpeedTest(key).catch((error) => {
    if (!state.cancelled) {
      send(state, {
        phase: "error",
        done: true,
        targetHost: SPEED_HOST,
        error: error.message,
      });
    }
  }).finally(() => {
    if (monitors.get(key) === state) {
      monitors.delete(key);
    }
  });

  sender.once("destroyed", () => stopByKey(key));
  return { ok: true, targetHost: SPEED_HOST };
}

function stop(event) {
  return stopByKey(event.sender.id, true);
}

function stopByKey(key, notify = false) {
  const state = monitors.get(key);
  if (!state) {
    return { stopped: false };
  }
  state.cancelled = true;
  for (const request of state.requests) {
    request.destroy(new Error("cancelled"));
  }
  state.requests.clear();
  monitors.delete(key);
  if (notify) {
    send(state, {
      phase: "stopped",
      done: true,
      targetHost: SPEED_HOST,
      message: "회선 속도 측정을 중지했습니다.",
    });
  }
  return { stopped: true };
}

async function runSpeedTest(key) {
  const state = monitors.get(key);
  if (!state) return;

  send(state, {
    phase: "latency",
    progress: 5,
    targetHost: SPEED_HOST,
    message: "지연시간을 확인하는 중입니다.",
    downloadBps: 0,
    uploadBps: 0,
  });

  state.latencyMs = await measureLatency(state);
  ensureRunning(state);
  send(state, {
    phase: "latency",
    progress: 12,
    targetHost: SPEED_HOST,
    latencyMs: state.latencyMs,
    message: "지연시간 확인을 완료했습니다.",
    downloadBps: 0,
    uploadBps: 0,
  });

  state.bestDownloadBps = await measureDownload(state);
  ensureRunning(state);
  state.bestUploadBps = await measureUpload(state);
  ensureRunning(state);

  send(state, {
    phase: "done",
    done: true,
    progress: 100,
    targetHost: SPEED_HOST,
    latencyMs: state.latencyMs,
    downloadBps: state.bestDownloadBps,
    uploadBps: state.bestUploadBps,
    message: "회선 속도 측정을 완료했습니다.",
  });
}

async function measureLatency(state) {
  const samples = [];
  for (let index = 0; index < 3; index += 1) {
    ensureRunning(state);
    const startedAt = Date.now();
    try {
      await downloadOnce(state, 0, 3000);
      samples.push(Date.now() - startedAt);
    } catch {
      const ping = await pingHost(SPEED_HOST);
      if (ping.latencyMs != null) {
        samples.push(ping.latencyMs);
      }
    }
  }
  samples.sort((a, b) => a - b);
  return samples.length ? samples[Math.floor(samples.length / 2)] : null;
}

async function measureDownload(state) {
  return measureThroughput({
    state,
    phase: "download",
    label: "다운로드 속도를 측정하는 중입니다.",
    startProgress: 15,
    endProgress: 65,
    durationMs: DOWNLOAD_DURATION_MS,
    maxBytes: MAX_DOWNLOAD_BYTES,
    blockBytes: DOWNLOAD_BLOCK_BYTES,
    concurrency: DOWNLOAD_CONCURRENCY,
    runner: downloadOnce,
  });
}

async function measureUpload(state) {
  return measureThroughput({
    state,
    phase: "upload",
    label: "업로드 속도를 측정하는 중입니다.",
    startProgress: 68,
    endProgress: 96,
    durationMs: UPLOAD_DURATION_MS,
    maxBytes: MAX_UPLOAD_BYTES,
    blockBytes: UPLOAD_BLOCK_BYTES,
    concurrency: UPLOAD_CONCURRENCY,
    runner: uploadOnce,
  });
}

async function measureThroughput(options) {
  const {
    state,
    phase,
    label,
    startProgress,
    endProgress,
    durationMs,
    maxBytes,
    blockBytes,
    concurrency,
    runner,
  } = options;

  let completedBytes = 0;
  let scheduledBytes = 0;
  let bestBps = 0;
  let lastSentAt = 0;
  const startedAt = Date.now();
  const deadline = startedAt + durationMs;

  const report = (force = false) => {
    const now = Date.now();
    if (!force && now - lastSentAt < 450) return;
    lastSentAt = now;
    const elapsedMs = Math.max(1, now - startedAt);
    const currentBps = Math.round((completedBytes / elapsedMs) * 1000);
    bestBps = Math.max(bestBps, currentBps);
    const ratio = Math.min(1, elapsedMs / durationMs);
    send(state, {
      phase,
      progress: Math.round(startProgress + (endProgress - startProgress) * ratio),
      targetHost: SPEED_HOST,
      latencyMs: state.latencyMs,
      downloadBps: phase === "download" ? currentBps : state.bestDownloadBps,
      uploadBps: phase === "upload" ? currentBps : 0,
      message: label,
      bytesUsed: completedBytes,
    });
  };

  const worker = async () => {
    while (!state.cancelled && Date.now() < deadline && scheduledBytes < maxBytes) {
      const bytes = Math.min(blockBytes, maxBytes - scheduledBytes);
      scheduledBytes += bytes;
      try {
        const transferred = await runner(state, bytes, Math.max(2500, deadline - Date.now() + 2500));
        completedBytes += transferred;
        report();
      } catch (error) {
        ensureRunning(state);
        if (Date.now() < deadline && completedBytes === 0) {
          throw error;
        }
        break;
      }
    }
  };

  report(true);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (completedBytes === 0) {
    throw new Error(`${phase} speed test failed`);
  }
  report(true);
  return bestBps;
}

function downloadOnce(state, bytes, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = `${DOWNLOAD_URL}?during=download&bytes=${Math.max(0, Math.round(bytes))}`;
    const request = https.get(url, { headers: { "User-Agent": "Magic WAND" } }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`download failed: ${response.statusCode}`));
        return;
      }

      let received = 0;
      response.on("data", (chunk) => {
        received += chunk.length;
      });
      response.on("end", () => resolve(received));
    });

    trackRequest(state, request, timeoutMs, reject);
  });
}

function uploadOnce(state, bytes, timeoutMs) {
  return new Promise((resolve, reject) => {
    const payloadSize = Math.max(0, Math.round(bytes));
    const request = https.request(
      UPLOAD_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(payloadSize),
          "User-Agent": "Magic WAND",
        },
      },
      (response) => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          reject(new Error(`upload failed: ${response.statusCode}`));
          return;
        }
        response.resume();
        response.on("end", () => resolve(payloadSize));
      },
    );

    trackRequest(state, request, timeoutMs, reject);
    writeUploadBody(request, payloadSize);
  });
}

function writeUploadBody(request, totalBytes) {
  const chunk = Buffer.alloc(Math.min(256 * 1024, Math.max(1, totalBytes)));
  let written = 0;

  const writeNext = () => {
    while (written < totalBytes) {
      const size = Math.min(chunk.length, totalBytes - written);
      written += size;
      if (!request.write(size === chunk.length ? chunk : chunk.subarray(0, size))) {
        request.once("drain", writeNext);
        return;
      }
    }
    request.end();
  };

  writeNext();
}

function trackRequest(state, request, timeoutMs, reject) {
  state.requests.add(request);
  const cleanup = () => state.requests.delete(request);

  request.setTimeout(timeoutMs, () => {
    request.destroy(new Error("timeout"));
  });
  request.on("close", cleanup);
  request.on("error", (error) => {
    cleanup();
    reject(error);
  });
}

async function pingHost(targetHost) {
  const args =
    process.platform === "win32"
      ? ["-n", "1", "-w", "900", targetHost]
      : ["-c", "1", "-W", "1", targetHost];

  try {
    const { stdout } = await execFileAsync("ping", args, { encoding: "utf8", timeout: 1800 });
    return { online: true, latencyMs: parsePingLatency(stdout) };
  } catch {
    return { online: false, latencyMs: null };
  }
}

function parsePingLatency(output) {
  const text = String(output || "");
  const direct = text.match(/(?:time|시간)\s*[=<]\s*(\d+(?:\.\d+)?)\s*ms/i);
  if (direct) {
    return Math.max(1, Number(direct[1]) || 1);
  }
  const average = text.match(/(?:average|평균)\s*=\s*(\d+(?:\.\d+)?)\s*ms/i);
  if (average) {
    return Math.max(1, Number(average[1]) || 1);
  }
  return null;
}

function ensureRunning(state) {
  if (state.cancelled) {
    throw new Error("cancelled");
  }
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
