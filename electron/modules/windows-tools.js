const { shell } = require("electron");
const { spawn } = require("child_process");

const TOOLS = {
  controlPanel: {
    command: "control.exe",
    args: [],
  },
  networkConnections: {
    command: "control.exe",
    args: ["ncpa.cpl"],
  },
  printers: {
    command: "control.exe",
    args: ["printers"],
  },
  programs: {
    command: "control.exe",
    args: ["appwiz.cpl"],
  },
  cmd: {
    path: process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
  },
};

function register(ipcMain) {
  ipcMain.handle("windows-tools:open", async (_event, toolName) => openWindowsTool(toolName));
}

async function openWindowsTool(toolName) {
  if (process.platform !== "win32") {
    throw new Error("Windows에서만 사용할 수 있습니다.");
  }

  const tool = TOOLS[toolName];
  if (!tool) {
    throw new Error("알 수 없는 도구입니다.");
  }

  if (tool.path) {
    const error = await shell.openPath(tool.path);
    if (error) {
      throw new Error(error);
    }
    return { ok: true };
  }

  return new Promise((resolve, reject) => {
    const child = spawn(tool.command, tool.args, {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });

    child.once("error", (error) => {
      reject(error);
    });

    child.once("spawn", () => {
      child.unref();
      resolve({ ok: true });
    });
  });
}

module.exports = {
  register,
};
