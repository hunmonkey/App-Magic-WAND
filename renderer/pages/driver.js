(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#driverMenu");
  if (!menu || !ui) return;

  const refreshBtn = document.querySelector("#driverRefreshBtn");
  const summary = document.querySelector("#driverSummary");
  const tableBody = document.querySelector("#driverTableBody");
  const tableWrap = document.querySelector(".driver-table-wrap");
  const destInput = document.querySelector("#driverDest");
  const folderInput = document.querySelector("#driverFolderName");
  const pickDestBtn = document.querySelector("#driverPickDestBtn");
  const exportBtn = document.querySelector("#driverExportBtn");
  const openBtn = document.querySelector("#driverOpenBtn");
  const status = document.querySelector("#driverExportStatus");
  const progressBox = document.querySelector("#driverProgressBox");
  const progressFill = document.querySelector("#driverProgressFill");
  const progressText = document.querySelector("#driverProgressText");

  let loaded = false;
  let exporting = false;
  let currentJobId = "";
  let lastDestination = "";

  menu.addEventListener("click", async () => {
    ui.switchPage("#driverPage", menu);
    if (!loaded) {
      loaded = true;
      await setDefaultDestination();
      await loadDrivers();
    }
  });

  window.magicWand.driver.onProgress((payload) => {
    if (!payload || payload.jobId !== currentJobId) return;
    setProgress(payload.percent, payload.message);
  });

  refreshBtn.addEventListener("click", loadDrivers);
  pickDestBtn.addEventListener("click", pickDestination);
  exportBtn.addEventListener("click", exportDrivers);
  openBtn.addEventListener("click", () => {
    if (lastDestination) {
      window.magicWand.fileTools.openPath(lastDestination).catch((error) => ui.showToast(`폴더 열기 실패: ${error.message}`));
    }
  });

  async function setDefaultDestination() {
    try {
      const folders = await window.magicWand.fileTools.commonFolders();
      const downloads = folders.find((item) => item.key === "downloads") || folders[0];
      if (downloads && !destInput.value) {
        destInput.value = downloads.path;
      }
    } catch {}
  }

  async function loadDrivers() {
    refreshBtn.disabled = true;
    ui.setBusy(refreshBtn, true);
    summary.textContent = "드라이버 목록을 조회하는 중입니다.";
    tableBody.innerHTML = "";
    try {
      const result = await window.magicWand.driver.list();
      renderDrivers(result.drivers || []);
      summary.textContent = result.message || `드라이버 ${result.count || 0}개를 찾았습니다.`;
    } catch (error) {
      summary.textContent = "드라이버 목록 조회에 실패했습니다.";
      ui.showToast(`드라이버 목록 조회 실패: ${error.message}`);
    } finally {
      refreshBtn.disabled = false;
      ui.setBusy(refreshBtn, false);
    }
  }

  function renderDrivers(drivers) {
    tableBody.innerHTML = "";
    tableWrap.classList.toggle("empty", drivers.length === 0);
    for (const driver of drivers) {
      const row = document.createElement("tr");
      row.append(
        cell(driver.name || "이름 확인 안 됨"),
        cell(driver.manufacturer || "제조사 확인 안 됨"),
        cell([driver.version, driver.date].filter(Boolean).join(" · ")),
        cell(driver.infName || ""),
      );
      tableBody.append(row);
    }
  }

  async function pickDestination() {
    try {
      const result = await window.magicWand.fileTools.pickDestination();
      if (result.path) {
        destInput.value = result.path;
      }
    } catch (error) {
      ui.showToast(`폴더 선택 실패: ${error.message}`);
    }
  }

  async function exportDrivers() {
    if (exporting) return;
    const destinationDir = destInput.value.trim();
    if (!destinationDir) {
      ui.showToast("저장할 폴더를 선택해 주세요.");
      return;
    }

    exporting = true;
    currentJobId = `driver-${Date.now()}`;
    exportBtn.disabled = true;
    ui.setBusy(exportBtn, true);
    openBtn.disabled = true;
    status.textContent = "드라이버 백업을 준비하는 중입니다.";
    setProgress(0, "준비 중입니다.");

    try {
      const result = await window.magicWand.driver.export({
        jobId: currentJobId,
        destinationDir,
        folderName: folderInput.value.trim() || "MagicWAND_Drivers",
      });
      lastDestination = result.destination;
      openBtn.disabled = false;
      status.textContent = `백업 완료: ${result.destination} (${result.exportedCount || 0}개 파일)`;
      await ui.notifyComplete("드라이버 백업을 완료했습니다.", { achievementKey: "driversBackedUp" });
    } catch (error) {
      status.textContent = `백업 실패: ${error.message}`;
      ui.showToast(`드라이버 백업 실패: ${error.message}`);
    } finally {
      exporting = false;
      currentJobId = "";
      exportBtn.disabled = false;
      ui.setBusy(exportBtn, false);
    }
  }

  function setProgress(percent, message) {
    progressBox.hidden = false;
    progressFill.style.width = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
    progressText.textContent = message || "작업 중입니다.";
  }

  function cell(value) {
    const td = document.createElement("td");
    td.textContent = value;
    return td;
  }
})();
