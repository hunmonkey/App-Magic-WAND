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
  },
  hardware: {
    check: () => ipcRenderer.invoke("hardware:check"),
  },
  threat: {
    scan: () => ipcRenderer.invoke("threat:scan"),
  },
  control: {
    getAdapters:    () => ipcRenderer.invoke("control:getAdapters"),
    applyConfig:    (name, cfg) => ipcRenderer.invoke("control:applyConfig", name, cfg),
    getComputerName: () => ipcRenderer.invoke("control:getComputerName"),
    renameComputer: (newName) => ipcRenderer.invoke("control:renameComputer", newName),
  },
  app: {
    quit: () => ipcRenderer.send("app:quit"),
  },
});
