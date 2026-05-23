(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#fileToolsMenu");
  if (!menu || !ui) return;

  const pickFilesBtn = document.querySelector("#ftPickFiles");
  const pickFoldersBtn = document.querySelector("#ftPickFolders");
  const clearSourcesBtn = document.querySelector("#ftClearSources");
  const quickFoldersEl = document.querySelector("#ftQuickFolders");
  const sourceListEl = document.querySelector("#ftSourceList");
  const backupNameInput = document.querySelector("#ftBackupName");
  const backupDestInput = document.querySelector("#ftBackupDest");
  const pickBackupDestBtn = document.querySelector("#ftPickBackupDest");
  const backupBtn = document.querySelector("#ftBackupBtn");
  const cancelBackupBtn = document.querySelector("#ftCancelBackupBtn");
  const openBackupBtn = document.querySelector("#ftOpenBackupBtn");
  const backupStatus = document.querySelector("#ftBackupStatus");
  const backupProgressBox = document.querySelector("#ftBackupProgressBox");
  const backupProgressFill = document.querySelector("#ftBackupProgressFill");
  const backupProgressText = document.querySelector("#ftBackupProgressText");
  const transferDestInput = document.querySelector("#ftTransferDest");
  const pickTransferDestBtn = document.querySelector("#ftPickTransferDest");
  const savedPathSelect = document.querySelector("#ftSavedPathSelect");
  const useSavedPathBtn = document.querySelector("#ftUseSavedPathBtn");
  const saveTransferPathBtn = document.querySelector("#ftSaveTransferPathBtn");
  const deleteTransferPathBtn = document.querySelector("#ftDeleteTransferPathBtn");
  const packageNameInput = document.querySelector("#ftPackageName");
  const wrapFolderInput = document.querySelector("#ftWrapFolder");
  const transferBtn = document.querySelector("#ftTransferBtn");
  const cancelTransferBtn = document.querySelector("#ftCancelTransferBtn");
  const openTransferBtn = document.querySelector("#ftOpenTransferBtn");
  const transferStatus = document.querySelector("#ftTransferStatus");
  const transferProgressBox = document.querySelector("#ftTransferProgressBox");
  const transferProgressFill = document.querySelector("#ftTransferProgressFill");
  const transferProgressText = document.querySelector("#ftTransferProgressText");

  let sources = [];
  let commonLoaded = false;
  let settings = { transferPaths: [], shortcuts: [] };
  let lastBackupPath = "";
  let lastTransferPath = "";
  let currentBackupJobId = "";
  let currentTransferJobId = "";

  menu.addEventListener("click", async () => {
    ui.switchPage("#fileToolsPage", menu);
    if (!commonLoaded) {
      await loadCommonFolders();
      await loadSettings();
    }
  });

  window.magicWand.fileTools.onProgress(handleProgress);
  pickFilesBtn.addEventListener("click", async () => addPicked("pickFiles"));
  pickFoldersBtn.addEventListener("click", async () => addPicked("pickFolders"));
  clearSourcesBtn.addEventListener("click", () => {
    sources = [];
    renderSources();
  });
  pickBackupDestBtn.addEventListener("click", async () => pickDestination(backupDestInput));
  pickTransferDestBtn.addEventListener("click", async () => pickDestination(transferDestInput));
  useSavedPathBtn.addEventListener("click", useSavedPath);
  saveTransferPathBtn.addEventListener("click", saveTransferPath);
  deleteTransferPathBtn.addEventListener("click", deleteTransferPath);
  backupBtn.addEventListener("click", createBackup);
  cancelBackupBtn.addEventListener("click", () => cancelJob(currentBackupJobId));
  transferBtn.addEventListener("click", transferFiles);
  cancelTransferBtn.addEventListener("click", () => cancelJob(currentTransferJobId));
  openBackupBtn.addEventListener("click", () => openPath(lastBackupPath));
  openTransferBtn.addEventListener("click", () => openPath(lastTransferPath));

  renderSources();
  renderSavedPaths();

  async function loadCommonFolders() {
    commonLoaded = true;
    try {
      const folders = await window.magicWand.fileTools.commonFolders();
      quickFoldersEl.innerHTML = "";
      for (const folder of folders) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = folder.label;
        btn.title = folder.path;
        btn.addEventListener("click", () => addSources([folder.path]));
        quickFoldersEl.append(btn);
      }
      const downloads = folders.find((item) => item.key === "downloads") || folders[0];
      if (downloads && !backupDestInput.value) {
        backupDestInput.value = downloads.path;
      }
    } catch (err) {
      quickFoldersEl.innerHTML = `<p class="empty-inline">기본 폴더를 불러오지 못했습니다: ${err.message}</p>`;
    }
  }

  async function loadSettings() {
    try {
      settings = await window.magicWand.fileTools.loadSettings();
      renderSavedPaths();
    } catch (err) {
      ui.showToast(`저장된 업무 도구 설정을 불러오지 못했습니다: ${err.message}`);
    }
  }

  async function addPicked(method) {
    try {
      const result = await window.magicWand.fileTools[method]();
      addSources(result.paths || []);
    } catch (err) {
      ui.showToast(`선택 실패: ${err.message}`);
    }
  }

  function addSources(paths) {
    const seen = new Set(sources.map((item) => item.toLowerCase()));
    for (const item of paths) {
      const value = String(item || "").trim();
      if (value && !seen.has(value.toLowerCase())) {
        sources.push(value);
        seen.add(value.toLowerCase());
      }
    }
    renderSources();
  }

  function renderSources() {
    sourceListEl.innerHTML = "";
    if (!sources.length) {
      sourceListEl.innerHTML = "<p class='empty-inline'>선택한 파일이나 폴더가 없습니다.</p>";
      return;
    }
    sources.forEach((source, index) => {
      const item = document.createElement("article");
      item.className = "path-item";
      const text = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = baseName(source);
      const pathText = document.createElement("p");
      pathText.textContent = source;
      text.append(title, pathText);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "삭제";
      remove.addEventListener("click", () => {
        sources.splice(index, 1);
        renderSources();
      });
      item.append(text, remove);
      sourceListEl.append(item);
    });
  }

  async function pickDestination(input) {
    try {
      const result = await window.magicWand.fileTools.pickDestination();
      if (result.path) {
        input.value = result.path;
      }
    } catch (err) {
      ui.showToast(`폴더 선택 실패: ${err.message}`);
    }
  }

  async function createBackup() {
    if (!sources.length) {
      ui.showToast("백업할 파일이나 폴더를 먼저 선택해 주세요.");
      return;
    }
    currentBackupJobId = makeJobId("backup");
    backupBtn.disabled = true;
    ui.setBusy(backupBtn, true);
    cancelBackupBtn.disabled = false;
    backupBtn.textContent = "압축 중...";
    setProgress("backup", 0, "백업 준비 중입니다.");
    backupStatus.textContent = "ZIP 파일을 만드는 중입니다. 용량이 크면 시간이 걸릴 수 있습니다.";
    try {
      const result = await window.magicWand.fileTools.createBackup({
        jobId: currentBackupJobId,
        sources,
        destinationDir: backupDestInput.value.trim(),
        baseName: backupNameInput.value.trim(),
      });
      lastBackupPath = result.path;
      openBackupBtn.disabled = false;
      backupStatus.textContent = `백업 완료: ${result.name}`;
      await ui.notifyComplete("ZIP 백업을 완료했습니다.", { achievementKey: "backupsDone" });
    } catch (err) {
      backupStatus.textContent = `백업 실패: ${err.message}`;
      ui.showToast(`백업 실패: ${err.message}`);
    } finally {
      currentBackupJobId = "";
      backupBtn.disabled = false;
      ui.setBusy(backupBtn, false);
      cancelBackupBtn.disabled = true;
      backupBtn.textContent = "ZIP 백업";
    }
  }

  async function transferFiles() {
    if (!sources.length) {
      ui.showToast("전송할 파일이나 폴더를 먼저 선택해 주세요.");
      return;
    }
    currentTransferJobId = makeJobId("transfer");
    transferBtn.disabled = true;
    ui.setBusy(transferBtn, true);
    cancelTransferBtn.disabled = false;
    transferBtn.textContent = "전송 중...";
    setProgress("transfer", 0, "전송 준비 중입니다.");
    transferStatus.textContent = "선택한 내용을 복사하는 중입니다.";
    try {
      const result = await window.magicWand.fileTools.transfer({
        jobId: currentTransferJobId,
        sources,
        destination: transferDestInput.value.trim(),
        packageName: packageNameInput.value.trim(),
        wrapInFolder: wrapFolderInput.checked,
      });
      lastTransferPath = result.destination;
      openTransferBtn.disabled = false;
      transferStatus.textContent = `전송 완료: ${result.destination}`;
      await rememberTransferPath(transferDestInput.value.trim());
      await ui.notifyComplete("전송을 완료했습니다.", { achievementKey: "transfersDone" });
    } catch (err) {
      transferStatus.textContent = `전송 실패: ${err.message}`;
      ui.showToast(`전송 실패: ${err.message}`);
    } finally {
      currentTransferJobId = "";
      transferBtn.disabled = false;
      ui.setBusy(transferBtn, false);
      cancelTransferBtn.disabled = true;
      transferBtn.textContent = "전송";
    }
  }

  function handleProgress(payload) {
    if (!payload?.jobId) {
      return;
    }
    if (payload.jobId === currentBackupJobId) {
      setProgress("backup", payload.percent, progressMessage(payload));
    }
    if (payload.jobId === currentTransferJobId) {
      setProgress("transfer", payload.percent, progressMessage(payload));
    }
  }

  function setProgress(type, percent, message) {
    const fill = type === "backup" ? backupProgressFill : transferProgressFill;
    const text = type === "backup" ? backupProgressText : transferProgressText;
    const box = type === "backup" ? backupProgressBox : transferProgressBox;
    box.hidden = false;
    fill.style.width = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
    text.textContent = message || "작업 중입니다.";
  }

  function progressMessage(payload) {
    const base = payload.message || "작업 중입니다.";
    if (!payload.totalFiles) {
      return base;
    }
    const done = payload.copiedFiles ?? 0;
    const count = payload.phase === "done" ? payload.totalFiles : done;
    return `${base} (${count}/${payload.totalFiles}개${payload.totalBytes ? ` · ${formatBytes(payload.totalBytes)}` : ""})`;
  }

  async function cancelJob(jobId) {
    if (!jobId) return;
    try {
      await window.magicWand.fileTools.cancel(jobId);
    } catch (err) {
      ui.showToast(`취소 실패: ${err.message}`);
    }
  }

  function makeJobId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)}GB`;
    if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)}MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)}KB`;
    return `${value}B`;
  }

  function renderSavedPaths() {
    savedPathSelect.innerHTML = "";
    if (!settings.transferPaths.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "저장된 전송 경로가 없습니다.";
      savedPathSelect.append(option);
      useSavedPathBtn.disabled = true;
      deleteTransferPathBtn.disabled = true;
      return;
    }
    for (const item of settings.transferPaths) {
      const option = document.createElement("option");
      option.value = item;
      option.textContent = item;
      savedPathSelect.append(option);
    }
    useSavedPathBtn.disabled = false;
    deleteTransferPathBtn.disabled = false;
  }

  function useSavedPath() {
    if (savedPathSelect.value) {
      transferDestInput.value = savedPathSelect.value;
    }
  }

  async function saveTransferPath() {
    const value = transferDestInput.value.trim();
    if (!value) {
      ui.showToast("저장할 전송 대상 폴더를 먼저 입력해 주세요.");
      return;
    }
    await rememberTransferPath(value);
    ui.showToast("전송 경로를 저장했습니다.");
  }

  async function rememberTransferPath(value) {
    const pathValue = String(value || "").trim();
    if (!pathValue) return;
    const latest = await window.magicWand.fileTools.loadSettings();
    const next = [pathValue, ...latest.transferPaths.filter((item) => item.toLowerCase() !== pathValue.toLowerCase())];
    settings = await window.magicWand.fileTools.saveSettings({
      ...latest,
      transferPaths: next,
    });
    renderSavedPaths();
    savedPathSelect.value = pathValue;
  }

  async function deleteTransferPath() {
    const value = savedPathSelect.value;
    if (!value) return;
    const latest = await window.magicWand.fileTools.loadSettings();
    settings = await window.magicWand.fileTools.saveSettings({
      ...latest,
      transferPaths: latest.transferPaths.filter((item) => item !== value),
    });
    renderSavedPaths();
    ui.showToast("저장된 전송 경로를 삭제했습니다.");
  }

  async function openPath(targetPath) {
    if (!targetPath) return;
    try {
      await window.magicWand.fileTools.openPath(targetPath);
    } catch (err) {
      ui.showToast(`열기 실패: ${err.message}`);
    }
  }

  function baseName(targetPath) {
    return String(targetPath || "").split(/[\\/]/).filter(Boolean).at(-1) || targetPath;
  }
})();
