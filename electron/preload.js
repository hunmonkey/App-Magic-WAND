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
    repair: (action, interfaceName) => ipcRenderer.invoke("network:repair", action, interfaceName),
    scanRange: (startIp, endIp) => ipcRenderer.invoke("network:scan-range", startIp, endIp),
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
  printer: {
    list: () => ipcRenderer.invoke("printer:list"),
    testPage: (name) => ipcRenderer.invoke("printer:testPage", name),
    clearQueue: (name) => ipcRenderer.invoke("printer:clearQueue", name),
    setDefault: (name) => ipcRenderer.invoke("printer:setDefault", name),
    restartSpooler: () => ipcRenderer.invoke("printer:restartSpooler"),
  },
  share: {
    list: () => ipcRenderer.invoke("share:list"),
    browse: () => ipcRenderer.invoke("share:browse"),
    create: (payload) => ipcRenderer.invoke("share:create", payload),
    remove: (name) => ipcRenderer.invoke("share:remove", name),
  },
  security: {
    activation: () => ipcRenderer.invoke("security:activation"),
    bitlocker: () => ipcRenderer.invoke("security:bitlocker"),
    productKey: () => ipcRenderer.invoke("security:productKey"),
    saveProductKeyText: (text) => ipcRenderer.invoke("security:saveProductKeyText", text),
    localUsers: () => ipcRenderer.invoke("security:localUsers"),
    browse: () => ipcRenderer.invoke("security:browse"),
    setHidden: (payload) => ipcRenderer.invoke("security:setHidden", payload),
  },
  secureErase: {
    listDrives: () => ipcRenderer.invoke("secure-erase:listDrives"),
    pick: (type) => ipcRenderer.invoke("secure-erase:pick", type),
    run: (payload) => ipcRenderer.invoke("secure-erase:run", payload),
    onProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("secure-erase:progress", listener);
      return () => ipcRenderer.removeListener("secure-erase:progress", listener);
    },
  },
  formMaker: {
    save: (payload) => ipcRenderer.invoke("form-maker:save", payload),
    list: () => ipcRenderer.invoke("form-maker:list"),
    read: (id) => ipcRenderer.invoke("form-maker:read", id),
    write: (payload) => ipcRenderer.invoke("form-maker:write", payload),
    delete: (id) => ipcRenderer.invoke("form-maker:delete", id),
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
