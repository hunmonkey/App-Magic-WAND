(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#cleanupMenu");
  if (!menu || !ui) return;

  const api = window.magicWand.cleanup;
  const scanBtn = document.querySelector("#cleanupScanBtn");
  const runBtn = document.querySelector("#cleanupRunBtn");
  const targetList = document.querySelector("#cleanupTargetList");
  const resultList = document.querySelector("#cleanupResultList");
  const detailList = document.querySelector("#cleanupDetailList");
  const summary = document.querySelector("#cleanupSummary");
  const status = document.querySelector("#cleanupStatus");
  const progressBox = document.querySelector("#cleanupProgressBox");
  const progressFill = document.querySelector("#cleanupProgressFill");
  const progressText = document.querySelector("#cleanupProgressText");

  let scanning = false;
  let running = false;
  let scanItems = [];
  let currentJobId = "";

  menu.addEventListener("click", () => {
    ui.switchPage("#cleanupPage", menu);
  });

  api.onProgress((payload) => {
    if (!payload || payload.jobId !== currentJobId) return;
    setProgress(payload.percent, payload.message);
  });

  scanBtn.addEventListener("click", scan);
  runBtn.addEventListener("click", runCleanup);

  async function scan() {
    if (scanning || running) return;
    scanning = true;
    scanBtn.disabled = true;
    ui.setBusy(scanBtn, true);
    runBtn.disabled = true;
    summary.textContent = "용량을 계산하는 중입니다.";
    resultList.innerHTML = "";
    resultList.append(ui.createLoadingState("삭제 없이 스캔만 진행 중입니다."));

    try {
      const selected = getSelectedIds();
      const result = await api.scan();
      scanItems = result.targets || [];
      renderTargets(selected);
      renderResults(scanItems);
      summary.textContent = `정리 가능 용량: ${formatBytes(result.totalBytes || 0)}`;
      runBtn.disabled = getSelectedIds().length === 0;
    } catch (error) {
      summary.textContent = "스캔에 실패했습니다.";
      resultList.innerHTML = "";
      resultList.append(empty(`스캔 실패: ${error.message}`));
      ui.showToast(`시스템 정리 스캔 실패: ${error.message}`);
    } finally {
      scanning = false;
      scanBtn.disabled = false;
      ui.setBusy(scanBtn, false);
    }
  }

  function renderTargets(selectedBefore) {
    const selected = selectedBefore.length ? new Set(selectedBefore) : null;
    targetList.innerHTML = "";
    for (const item of scanItems) {
      const label = document.createElement("label");
      label.className = "cleanup-target";
      label.innerHTML = `
        <input type="checkbox" />
        <span>
          <strong></strong>
          <small></small>
        </span>
        <em></em>
      `;
      const input = label.querySelector("input");
      input.value = item.id;
      input.checked = selected ? selected.has(item.id) : Boolean(item.defaultSelected);
      input.addEventListener("change", () => {
        runBtn.disabled = running || getSelectedIds().length === 0;
      });
      label.querySelector("strong").textContent = item.label;
      label.querySelector("small").textContent = item.description;
      label.querySelector("em").textContent = formatBytes(item.bytes || 0);
      targetList.append(label);
    }
  }

  function renderResults(items) {
    resultList.innerHTML = "";
    if (!items.length) {
      resultList.append(empty("정리 가능한 항목이 없습니다."));
      return;
    }
    for (const item of items) {
      const card = document.createElement("article");
      card.className = "cleanup-result-card";
      card.innerHTML = `
        <div><strong></strong><span></span></div>
        <p></p>
      `;
      card.querySelector("strong").textContent = item.label;
      card.querySelector("span").textContent = formatBytes(item.bytes || 0);
      card.querySelector("p").textContent = `파일 ${item.files || 0}개 · 폴더 ${item.folders || 0}개${item.errors ? ` · 접근 실패 ${item.errors}곳` : ""}`;
      resultList.append(card);
    }
  }

  async function runCleanup() {
    const ids = getSelectedIds();
    if (!ids.length) {
      ui.showToast("정리할 항목을 선택해 주세요.");
      return;
    }

    const ok = await ui.showConfirm(
      `선택한 ${ids.length}개 항목의 파일을 삭제할까요? 실행 후에는 되돌리기 어렵습니다.`,
      { confirmText: "정리" },
    );
    if (!ok) return;

    running = true;
    currentJobId = `cleanup-${Date.now()}`;
    scanBtn.disabled = true;
    runBtn.disabled = true;
    ui.setBusy(runBtn, true);
    detailList.innerHTML = "";
    detailList.append(ui.createLoadingState("정리 중입니다."));
    status.textContent = "선택한 항목을 정리하는 중입니다.";
    setProgress(0, "정리 준비 중입니다.");

    try {
      const result = await api.run({
        jobId: currentJobId,
        targetIds: ids,
        confirmed: true,
        token: "cleanup-confirmed",
      });
      scanItems = result.after?.targets || scanItems;
      renderTargets(ids);
      renderResults(scanItems);
      renderDetails(result);
      summary.textContent = `정리 후 남은 용량: ${formatBytes(result.after?.totalBytes || 0)}`;
      status.textContent = `정리 완료 · 확보한 용량 ${formatBytes(result.reclaimedBytes || 0)}`;
      await ui.notifyComplete("시스템 정리가 완료됐습니다.", { achievementKey: "cleanupsDone" });
    } catch (error) {
      status.textContent = `정리 실패: ${error.message}`;
      detailList.innerHTML = "";
      detailList.append(empty(`정리 실패: ${error.message}`));
      ui.showToast(`시스템 정리 실패: ${error.message}`);
    } finally {
      running = false;
      currentJobId = "";
      scanBtn.disabled = false;
      runBtn.disabled = getSelectedIds().length === 0;
      ui.setBusy(runBtn, false);
    }
  }

  function renderDetails(result) {
    detailList.innerHTML = "";
    for (const item of result.details || []) {
      const card = document.createElement("article");
      card.className = "cleanup-result-card";
      card.innerHTML = `<div><strong></strong><span></span></div><p></p>`;
      card.querySelector("strong").textContent = item.label;
      card.querySelector("span").textContent = item.failed ? "일부 실패" : "완료";
      card.querySelector("p").textContent = `처리 ${item.removed || 0}개${item.failed ? ` · 실패 ${item.failed}개` : ""}`;
      detailList.append(card);
    }
  }

  function getSelectedIds() {
    return [...targetList.querySelectorAll("input[type='checkbox']:checked")].map((input) => input.value);
  }

  function setProgress(percent, message) {
    progressBox.hidden = false;
    progressFill.style.width = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
    progressText.textContent = message || "작업 중입니다.";
  }

  function empty(message) {
    const p = document.createElement("p");
    p.className = "empty-inline";
    p.textContent = message;
    return p;
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let size = value / 1024;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`;
  }
})();
