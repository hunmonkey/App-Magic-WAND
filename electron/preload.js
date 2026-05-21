const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("magicWand", {
  loadRecords: () => ipcRenderer.invoke("records:load"),
  saveRecords: (records) => ipcRenderer.invoke("records:save", records),
  scanNetwork: () => ipcRenderer.invoke("network:scan"),
  scanAddressUsage: (interfaceId) => ipcRenderer.invoke("network:scan-addresses", interfaceId),
  runDiagnostics: (interfaceId) => ipcRenderer.invoke("network:diagnose", interfaceId),
  quitApp: () => ipcRenderer.send("app:quit"),
});
