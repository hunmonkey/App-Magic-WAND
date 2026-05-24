(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#printerMenu");
  if (!menu || !ui) return;

  const page = document.querySelector("#printerPage");
  const listEl = document.querySelector("#printerList");
  const selectedEl = document.querySelector("#printerSelected");
  const hintEl = page.querySelector(".printer-hint");
  const refreshBtn = document.querySelector("#printerRefresh");
  const testBtn = document.querySelector("#printerTestBtn");
  const defaultBtn = document.querySelector("#printerDefaultBtn");
  const clearBtn = document.querySelector("#printerClearBtn");
  const queueBtn = document.querySelector("#printerQueueBtn");
  const spoolerBtn = document.querySelector("#printerSpoolerBtn");
  const driverSearchInput = document.querySelector("#printerDriverSearch");
  const driverSearchBtn = document.querySelector("#printerDriverSearchBtn");
  const driverFolderBtn = document.querySelector("#printerDriverFolderBtn");
  const driverListEl = document.querySelector("#printerDriverList");
  const driverInstallBtn = document.querySelector("#printerDriverInstallBtn");
  const builtinInstallBtn = document.querySelector("#printerBuiltinInstallBtn");
  const driverStatusEl = document.querySelector("#printerDriverStatus");

  let printers = [];
  let selectedName = "";
  let driverPackages = [];
  let selectedDriverId = "";
  let installingDriver = false;

  listEl.append(emptyState("새로고침 버튼을 눌러 프린터 목록을 불러오세요."));
  driverListEl.append(emptyState("모델명을 입력하거나 보관함 전체를 조회하세요."));

  menu.addEventListener("click", () => {
    ui.switchPage("#printerPage", menu);
  });

  refreshBtn.addEventListener("click", loadPrinters);
  testBtn.addEventListener("click", testPage);
  defaultBtn.addEventListener("click", () => runAction(defaultBtn, "setDefault", "기본 프린터로 설정했습니다."));
  clearBtn.addEventListener("click", clearQueue);
  queueBtn.addEventListener("click", () => openTool("printers"));
  spoolerBtn.addEventListener("click", restartSpooler);
  driverSearchBtn.addEventListener("click", loadDriverPackages);
  driverSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      loadDriverPackages();
    }
  });
  driverFolderBtn.addEventListener("click", openDriverStore);
  driverInstallBtn.addEventListener("click", installSelectedDriver);
  builtinInstallBtn.addEventListener("click", installBuiltinDriver);
  bindToolButtons(page);

  async function loadPrinters() {
    refreshBtn.disabled = true;
    ui.setBusy(refreshBtn, true);
    listEl.innerHTML = "";
    listEl.append(ui.createLoadingState("프린터를 찾는 중입니다."));
    try {
      const result = await window.magicWand.printer.list();
      printers = result.printers || [];
      renderList();
    } catch (err) {
      listEl.innerHTML = "";
      listEl.append(emptyState(`프린터 목록을 불러오지 못했습니다: ${err.message}`));
    } finally {
      refreshBtn.disabled = false;
      ui.setBusy(refreshBtn, false);
    }
  }

  function renderList() {
    listEl.innerHTML = "";
    if (!printers.length) {
      listEl.append(emptyState("연결된 프린터가 없습니다."));
      clearSelection();
      return;
    }
    for (const p of printers) {
      const card = document.createElement("article");
      card.className = "tool-card";
      if (p.name === selectedName) card.classList.add("active");

      const head = document.createElement("div");
      head.className = "tool-card-head";
      const name = document.createElement("strong");
      name.textContent = p.name;
      const badge = document.createElement("span");
      badge.className = `tool-badge ${p.isDefault ? "ok" : "muted"}`;
      badge.textContent = p.isDefault ? "기본" : statusLabel(p.status);
      head.append(name, badge);

      const meta = document.createElement("p");
      meta.className = "tool-meta";
      meta.textContent = `포트 ${p.port || "—"} · ${p.driver || "드라이버 확인 안 됨"}${p.shared ? " · 공유 중" : ""}`;

      card.append(head, meta);
      card.addEventListener("click", () => selectPrinter(p.name));
      listEl.append(card);
    }
    if (selectedName && !printers.some((p) => p.name === selectedName)) {
      clearSelection();
    }
  }

  function selectPrinter(name) {
    selectedName = name;
    renderList();
    renderSelected();
  }

  function renderSelected() {
    const p = printers.find((item) => item.name === selectedName);
    selectedEl.innerHTML = "";
    if (!p) {
      clearSelection();
      return;
    }
    hintEl.textContent = "";
    [
      ["이름", p.name],
      ["상태", statusLabel(p.status)],
      ["기본 프린터", p.isDefault ? "예" : "아니오"],
      ["포트", p.port || "확인 안 됨"],
      ["드라이버", p.driver || "확인 안 됨"],
      ["공유", p.shared ? "공유 중" : "공유 안 함"],
    ].forEach(([label, value]) => {
      const div = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      div.append(dt, dd);
      selectedEl.append(div);
    });
    testBtn.disabled = false;
    defaultBtn.disabled = false;
    clearBtn.disabled = false;
  }

  function clearSelection() {
    selectedName = "";
    selectedEl.innerHTML = "";
    hintEl.textContent = "목록에서 프린터를 먼저 선택해 주세요.";
    testBtn.disabled = true;
    defaultBtn.disabled = true;
    clearBtn.disabled = true;
  }

  async function runAction(btn, method, successMsg) {
    if (!selectedName) return;
    const original = btn.textContent;
    btn.disabled = true;
    ui.setBusy(btn, true);
    btn.textContent = "처리 중...";
    try {
      await window.magicWand.printer[method](selectedName);
      ui.showToast(successMsg);
      if (method === "setDefault") await loadPrinters();
    } catch (err) {
      ui.showToast(`오류: ${err.message}`);
    } finally {
      ui.setBusy(btn, false);
      btn.textContent = original;
      btn.disabled = !selectedName;
    }
  }

  async function testPage() {
    if (!selectedName) return;
    const original = testBtn.textContent;
    testBtn.disabled = true;
    ui.setBusy(testBtn, true);
    testBtn.textContent = "인쇄 중...";
    try {
      const r = await window.magicWand.printer.testPage(selectedName);
      ui.showToast(r.queued ? "테스트 페이지를 인쇄 대기열에 보냈습니다." : "테스트 페이지 인쇄를 요청했습니다.");
    } catch (err) {
      ui.showToast(`테스트 페이지 인쇄 실패: ${err.message}`);
    } finally {
      ui.setBusy(testBtn, false);
      testBtn.textContent = original;
      testBtn.disabled = !selectedName;
    }
  }

  async function clearQueue() {
    if (!selectedName) return;
    clearBtn.disabled = true;
    ui.setBusy(clearBtn, true);
    try {
      const result = await window.magicWand.printer.clearQueue(selectedName);
      ui.showToast(`대기 문서 ${result.removed}건을 취소했습니다.`);
    } catch (err) {
      ui.showToast(`오류: ${err.message}`);
    } finally {
      ui.setBusy(clearBtn, false);
      clearBtn.disabled = !selectedName;
    }
  }

  async function restartSpooler() {
    spoolerBtn.disabled = true;
    ui.setBusy(spoolerBtn, true);
    const original = spoolerBtn.textContent;
    spoolerBtn.textContent = "재시작 중...";
    try {
      await window.magicWand.printer.restartSpooler();
      ui.showToast("인쇄 스풀러를 재시작했습니다.");
    } catch (err) {
      ui.showToast(`오류: ${err.message}`);
    } finally {
      ui.setBusy(spoolerBtn, false);
      spoolerBtn.textContent = original;
      spoolerBtn.disabled = false;
    }
  }

  async function loadDriverPackages() {
    selectedDriverId = "";
    driverInstallBtn.disabled = true;
    driverSearchBtn.disabled = true;
    ui.setBusy(driverSearchBtn, true);
    driverListEl.innerHTML = "";
    driverListEl.append(ui.createLoadingState("프린터 드라이버를 찾는 중입니다."));
    driverStatusEl.textContent = "PrinterDriver 보관함과 Windows 등록 드라이버를 확인하는 중입니다.";
    try {
      const result = await window.magicWand.printer.listDrivers(driverSearchInput.value.trim());
      driverPackages = result.drivers || [];
      renderDriverPackages();
      driverStatusEl.textContent = `보관함 ${result.localCount || 0}개, Windows 등록 ${result.windowsCount || 0}개 중 ${driverPackages.length}개를 표시했습니다.`;
    } catch (err) {
      driverPackages = [];
      driverListEl.innerHTML = "";
      driverListEl.append(emptyState(`드라이버 조회 실패: ${err.message}`));
      driverStatusEl.textContent = "드라이버 조회에 실패했습니다.";
    } finally {
      driverSearchBtn.disabled = false;
      ui.setBusy(driverSearchBtn, false);
    }
  }

  function renderDriverPackages() {
    driverListEl.innerHTML = "";
    if (!driverPackages.length) {
      driverListEl.append(emptyState("표시할 드라이버가 없습니다."));
      driverInstallBtn.disabled = true;
      return;
    }
    for (const driver of driverPackages) {
      const card = document.createElement("article");
      card.className = "tool-card";
      if (driver.id === selectedDriverId) card.classList.add("active");

      const head = document.createElement("div");
      head.className = "tool-card-head";
      const name = document.createElement("strong");
      name.textContent = driver.model || driver.fileName || "모델명 확인 안 됨";
      const badge = document.createElement("span");
      badge.className = `tool-badge ${driver.source === "inf" ? "ok" : driver.source === "installer" ? "warn" : "muted"}`;
      badge.textContent = driver.sourceLabel || "드라이버";
      head.append(name, badge);

      const meta = document.createElement("p");
      meta.className = "tool-meta";
      meta.textContent = driverMeta(driver);

      card.append(head, meta);
      card.addEventListener("click", () => selectDriverPackage(driver.id));
      driverListEl.append(card);
    }
  }

  function selectDriverPackage(id) {
    selectedDriverId = id;
    renderDriverPackages();
    driverInstallBtn.disabled = installingDriver || !selectedDriverId;
  }

  function driverMeta(driver) {
    const parts = [];
    if (driver.manufacturer) parts.push(driver.manufacturer);
    if (driver.source === "windows") {
      parts.push("Windows에 등록된 드라이버");
    } else if (driver.relativePath) {
      parts.push(driver.relativePath);
    } else if (driver.fileName) {
      parts.push(driver.fileName);
    }
    return parts.join(" · ") || "정보 확인 안 됨";
  }

  async function openDriverStore() {
    driverFolderBtn.disabled = true;
    ui.setBusy(driverFolderBtn, true);
    try {
      const result = await window.magicWand.printer.openDriverStore();
      driverStatusEl.textContent = `보관함 위치: ${result.path}`;
    } catch (err) {
      ui.showToast(`보관함 열기 실패: ${err.message}`);
    } finally {
      ui.setBusy(driverFolderBtn, false);
      driverFolderBtn.disabled = false;
    }
  }

  async function installSelectedDriver() {
    const selected = driverPackages.find((driver) => driver.id === selectedDriverId);
    if (!selected) {
      ui.showToast("설치할 드라이버를 먼저 선택해 주세요.");
      return;
    }
    await installDriver(selected, driverInstallBtn);
  }

  async function installBuiltinDriver() {
    const model = driverSearchInput.value.trim();
    if (!model) {
      ui.showToast("Windows 내장 드라이버로 설치할 모델명을 입력해 주세요.");
      return;
    }
    await installDriver({ source: "windows", model }, builtinInstallBtn);
  }

  async function installDriver(payload, button) {
    if (installingDriver) return;
    installingDriver = true;
    const original = button.textContent;
    setDriverInstallBusy(true, button);
    button.textContent = payload.source === "installer" ? "설치 창 여는 중..." : "설치 중...";
    driverStatusEl.textContent = "프린터 드라이버 설치를 시작했습니다.";
    try {
      const result = await window.magicWand.printer.installDriver({
        source: payload.source,
        model: payload.model,
        relativePath: payload.relativePath,
      });
      if (result.mode === "installer") {
        driverStatusEl.textContent = `${result.fileName || "설치파일"} 설치 창을 열었습니다.`;
        ui.showToast("제조사 드라이버 설치 창을 열었습니다.");
      } else {
        const message = result.rebootRequired
          ? "드라이버 설치를 완료했습니다. 재부팅이 필요할 수 있습니다."
          : "프린터 드라이버 설치를 완료했습니다.";
        driverStatusEl.textContent = result.addError
          ? `${message} 단, 모델 등록 확인 메시지: ${result.addError}`
          : message;
        ui.showToast(message);
        await loadDriverPackages();
      }
    } catch (err) {
      driverStatusEl.textContent = `드라이버 설치 실패: ${err.message}`;
      ui.showToast(`드라이버 설치 실패: ${err.message}`);
    } finally {
      button.textContent = original;
      setDriverInstallBusy(false, button);
      installingDriver = false;
    }
  }

  function setDriverInstallBusy(isBusy, busyButton) {
    [driverSearchBtn, driverFolderBtn, driverInstallBtn, builtinInstallBtn].forEach((btn) => {
      btn.disabled = isBusy;
      ui.setBusy(btn, btn === busyButton && isBusy);
    });
    if (!isBusy) {
      driverInstallBtn.disabled = !selectedDriverId;
    }
  }

  function statusLabel(status) {
    if (!status) return "상태 확인 안 됨";
    if (/normal/i.test(status)) return "정상";
    if (/offline/i.test(status)) return "오프라인";
    if (/error/i.test(status)) return "오류";
    return status;
  }

  function emptyState(message) {
    const el = document.createElement("p");
    el.className = "empty-inline";
    el.textContent = message;
    return el;
  }

  function bindToolButtons(root) {
    root.querySelectorAll("[data-windows-tool]").forEach((btn) => {
      btn.addEventListener("click", () => openTool(btn.dataset.windowsTool));
    });
  }

  async function openTool(name) {
    try {
      await window.magicWand.system.openWindowsTool(name);
    } catch (err) {
      ui.showToast(`도구 실행 실패: ${err.message}`);
    }
  }
})();
