const { shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");

const SYSTEM32 = path.join(process.env.SystemRoot || "C:\\Windows", "System32");

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

  // 점검 : Printer
  addPrinter: {
    command: "rundll32.exe",
    args: ["printui.dll,PrintUIEntry", "/il"],
  },
  printerTroubleshoot: {
    command: "msdt.exe",
    args: ["-id", "PrinterDiagnostic"],
  },

  // 점검 : Share
  sharedFolders: {
    path: path.join(SYSTEM32, "fsmgmt.msc"),
  },
  networkSharing: {
    command: "control.exe",
    args: ["/name", "Microsoft.NetworkAndSharingCenter"],
  },

  // 점검 : Security
  userAccounts: {
    command: "netplwiz.exe",
    args: [],
  },
  localUsers: {
    path: path.join(SYSTEM32, "lusrmgr.msc"),
  },
  signInOptions: {
    url: "ms-settings:signinoptions",
  },
  bitlocker: {
    command: "control.exe",
    args: ["/name", "Microsoft.BitLockerDriveEncryption"],
  },
  diskManagement: {
    path: path.join(SYSTEM32, "diskmgmt.msc"),
  },
  recycleBin: {
    command: "explorer.exe",
    args: ["shell:RecycleBinFolder"],
  },
  diskCleanup: {
    command: "cleanmgr.exe",
    args: [],
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

  if (tool.url) {
    await shell.openExternal(tool.url);
    return { ok: true };
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
