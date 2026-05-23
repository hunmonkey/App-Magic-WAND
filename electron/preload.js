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
    routerInfo: () => ipcRenderer.invoke("network:router-info"),
    openRouter: (url) => ipcRenderer.invoke("network:open-router", url),
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
  fileTools: {
    pickFiles: () => ipcRenderer.invoke("file-tools:pickFiles"),
    pickFolders: () => ipcRenderer.invoke("file-tools:pickFolders"),
    pickDestination: () => ipcRenderer.invoke("file-tools:pickDestination"),
    pickIcon: () => ipcRenderer.invoke("file-tools:pickIcon"),
    commonFolders: () => ipcRenderer.invoke("file-tools:commonFolders"),
    loadSettings: () => ipcRenderer.invoke("file-tools:loadSettings"),
    saveSettings: (settings) => ipcRenderer.invoke("file-tools:saveSettings", settings),
    createBackup: (payload) => ipcRenderer.invoke("file-tools:createBackup", payload),
    transfer: (payload) => ipcRenderer.invoke("file-tools:transfer", payload),
    cancel: (jobId) => ipcRenderer.invoke("file-tools:cancel", jobId),
    openPath: (targetPath) => ipcRenderer.invoke("file-tools:openPath", targetPath),
    createShortcut: (payload) => ipcRenderer.invoke("file-tools:createShortcut", payload),
    onProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("file-tools:progress", listener);
      return () => ipcRenderer.removeListener("file-tools:progress", listener);
    },
  },
  asset: {
    load: () => ipcRenderer.invoke("asset:load"),
    save: (list) => ipcRenderer.invoke("asset:save", list),
  },
  health: {
    bootTime: () => ipcRenderer.invoke("health:bootTime"),
    temps: () => ipcRenderer.invoke("health:temps"),
    listSnapshots: () => ipcRenderer.invoke("health:listSnapshots"),
    saveSnapshot: (payload) => ipcRenderer.invoke("health:saveSnapshot", payload),
    deleteSnapshot: (id) => ipcRenderer.invoke("health:deleteSnapshot", id),
  },
  cleanup: {
    scan: (targetIds) => ipcRenderer.invoke("cleanup:scan", targetIds),
    run: (payload) => ipcRenderer.invoke("cleanup:run", payload),
    onProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("cleanup:progress", listener);
      return () => ipcRenderer.removeListener("cleanup:progress", listener);
    },
  },
  driver: {
    list: () => ipcRenderer.invoke("driver:list"),
    export: (payload) => ipcRenderer.invoke("driver:export", payload),
    onProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("driver:progress", listener);
      return () => ipcRenderer.removeListener("driver:progress", listener);
    },
  },
  eventLog: {
    scan: (options) => ipcRenderer.invoke("eventLog:scan", options),
    saveText: (text) => ipcRenderer.invoke("eventLog:saveText", text),
  },
  swLicense: {
    list: () => ipcRenderer.invoke("swLicense:list"),
    save: (payload) => ipcRenderer.invoke("swLicense:save", payload),
    delete: (id) => ipcRenderer.invoke("swLicense:delete", id),
  },
  netMonitor: {
    start: (options) => ipcRenderer.invoke("netMonitor:start", options),
    stop: () => ipcRenderer.invoke("netMonitor:stop"),
    onTick: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("netMonitor:tick", listener);
      return () => ipcRenderer.removeListener("netMonitor:tick", listener);
    },
  },
  uiSettings: {
    get: () => ipcRenderer.invoke("uiSettings:get"),
    save: (settings) => ipcRenderer.invoke("uiSettings:save", settings),
    notify: (payload) => ipcRenderer.invoke("uiSettings:notify", payload),
  },
  achievements: {
    get: () => ipcRenderer.invoke("achv:get"),
    bump: (payload) => ipcRenderer.invoke("achv:bump", payload),
  },
  remote: {
    targets: () => ipcRenderer.invoke("remote:targets"),
    run: (payload) => ipcRenderer.invoke("remote:run", payload),
    onResult: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("remote:result", listener);
      return () => ipcRenderer.removeListener("remote:result", listener);
    },
  },
  adminWork: {
    load: () => ipcRenderer.invoke("adminWork:load"),
    save: (payload) => ipcRenderer.invoke("adminWork:save", payload),
  },
  license: {
    status: () => ipcRenderer.invoke("license:status"),
    login: (account, password) => ipcRenderer.invoke("license:login", { account, password }),
    unlock: () => ipcRenderer.invoke("license:unlock"),
    quit: () => ipcRenderer.send("license:quit"),
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
