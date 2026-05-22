const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("magicWand", {
  ipRecords: {
    load: () => ipcRenderer.invoke("records:load"),
    save: (records) => ipcRenderer.invoke("records:save", records),
  },
  network: {
    scan: () => ipcRenderer.invoke("network:scan"),
    scanAddresses: (interfaceId) => ipcRenderer.invoke("network:scan-addresses", interfaceId),
    diagnose: (interfaceId) => ipcRenderer.invoke("network:diagnose", interfaceId),
  },
  system: {
    hardware: () => ipcRenderer.invoke("system:hardware"),
    software: () => ipcRenderer.invoke("system:software"),
    uninstallSoftware: (id) => ipcRenderer.invoke("system:uninstall-software", id),
    saveHardwareText: (text) => ipcRenderer.invoke("system:save-hardware-text", text),
    saveSoftwareText: (text) => ipcRenderer.invoke("system:save-software-text", text),
    openWindowsTool: (toolName) => ipcRenderer.invoke("windows-tools:open", toolName),
  },
  hardware: {
    check: (runId) => ipcRenderer.invoke("hardware:check", runId),
    onCheckProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("hardware:check-progress", listener);
      return () => ipcRenderer.removeListener("hardware:check-progress", listener);
    },
    saveText: (payload) => ipcRenderer.invoke("hardware:save-check-text", payload),
  },
  threat: {
    scan: (runId, options) => ipcRenderer.invoke("threat:scan", runId, options),
    folderRoots: () => ipcRenderer.invoke("threat:folder-roots"),
    folderChildren: (folderPath) => ipcRenderer.invoke("threat:folder-children", folderPath),
    onScanProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("threat:scan-progress", listener);
      return () => ipcRenderer.removeListener("threat:scan-progress", listener);
    },
  },
  control: {
    getAdapters:    () => ipcRenderer.invoke("control:getAdapters"),
    applyConfig:    (name, cfg) => ipcRenderer.invoke("control:applyConfig", name, cfg),
    getComputerName: () => ipcRenderer.invoke("control:getComputerName"),
    renameComputer: (newName) => ipcRenderer.invoke("control:renameComputer", newName),
  },
  app: {
    quit: () => ipcRenderer.send("app:quit"),
    onQuitRequested: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("app:request-quit-confirmation", listener);
      return () => ipcRenderer.removeListener("app:request-quit-confirmation", listener);
    },
  },
});
