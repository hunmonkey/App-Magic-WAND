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
  const makerSelect = document.querySelector("#printerMakerSelect");
  const modelSelect = document.querySelector("#printerModelSelect");
  const driverRefreshBtn = document.querySelector("#printerDriverRefreshBtn");
  const driverFolderBtn = document.querySelector("#printerDriverFolderBtn");
  const driverListEl = document.querySelector("#printerDriverList");
  const driverInstallBtn = document.querySelector("#printerDriverInstallBtn");
  const manufacturerHomeBtn = document.querySelector("#printerManufacturerHomeBtn");
  const driverStatusEl = document.querySelector("#printerDriverStatus");

  let printers = [];
  let selectedName = "";
  let driverPackages = [];
  let selectedMaker = "";
  let selectedDriverId = "";
  let installingDriver = false;
  let driverCatalogLoaded = false;
  const PREFERRED_MAKERS = ["Samsung", "LG", "HP", "Brother", "Canon", "Epson", "Fuji", "Xerox", "Ricoh", "Kyocera", "Microsoft", "Hancom"];

  listEl.append(emptyState("새로고침 버튼을 눌러 프린터 목록을 불러오세요."));
  resetDriverPicker("드라이버 목록을 새로고침하면 제조사와 모델을 선택할 수 있습니다.");

  menu.addEventListener("click", () => {
    ui.switchPage("#printerPage", menu);
  });

  refreshBtn.addEventListener("click", loadPrinters);
  testBtn.addEventListener("click", testPage);
  defaultBtn.addEventListener("click", () => runAction(defaultBtn, "setDefault", "기본 프린터로 설정했습니다."));
  clearBtn.addEventListener("click", clearQueue);
  queueBtn.addEventListener("click", () => openTool("printers"));
  spoolerBtn.addEventListener("click", restartSpooler);
  driverRefreshBtn.addEventListener("click", loadDriverPackages);
  makerSelect.addEventListener("input", handleMakerChange);
  makerSelect.addEventListener("change", handleMakerChange);
  modelSelect.addEventListener("change", () => selectDriverPackage(modelSelect.value));
  driverFolderBtn.addEventListener("click", openDriverStore);
  driverInstallBtn.addEventListener("click", installSelectedDriver);
  manufacturerHomeBtn.addEventListener("click", openManufacturerHome);
  listEl.addEventListener("click", handlePrinterListClick);
  driverListEl.addEventListener("click", handleDriverListClick);
  bindToolButtons(page);

  function handleMakerChange() {
    selectMaker(makerSelect.value);
  }

  async function loadPrinters() {
    refreshBtn.disabled = true;
    ui.setBusy(refreshBtn, true);
    listEl.replaceChildren(ui.createLoadingState("프린터를 찾는 중입니다."));
    try {
      const result = await window.magicWand.printer.list();
      printers = result.printers || [];
      renderList();
    } catch (err) {
      listEl.replaceChildren(emptyState(`프린터 목록을 불러오지 못했습니다: ${err.message}`));
    } finally {
      refreshBtn.disabled = false;
      ui.setBusy(refreshBtn, false);
    }
  }

  function renderList() {
    if (!printers.length) {
      listEl.replaceChildren(emptyState("연결된 프린터가 없습니다."));
      clearSelection();
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const p of printers) {
      const card = document.createElement("article");
      card.className = "tool-card";
      card.dataset.name = p.name;
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
      fragment.append(card);
    }
    listEl.replaceChildren(fragment);
    if (selectedName && !printers.some((p) => p.name === selectedName)) {
      clearSelection();
    }
  }

  function handlePrinterListClick(event) {
    const card = event.target.closest(".tool-card[data-name]");
    if (card) {
      selectPrinter(card.dataset.name);
    }
  }

  function selectPrinter(name) {
    selectedName = name;
    renderList();
    renderSelected();
  }

  function renderSelected() {
    const p = printers.find((item) => item.name === selectedName);
    if (!p) {
      clearSelection();
      return;
    }
    hintEl.textContent = "";
    const fragment = document.createDocumentFragment();
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
      fragment.append(div);
    });
    selectedEl.replaceChildren(fragment);
    testBtn.disabled = false;
    defaultBtn.disabled = false;
    clearBtn.disabled = false;
  }

  function clearSelection() {
    selectedName = "";
    selectedEl.replaceChildren();
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
    selectedMaker = "";
    selectedDriverId = "";
    driverInstallBtn.disabled = true;
    manufacturerHomeBtn.disabled = false;
    driverRefreshBtn.disabled = true;
    ui.setBusy(driverRefreshBtn, true);
    makerSelect.disabled = true;
    modelSelect.disabled = true;
    driverListEl.replaceChildren(ui.createLoadingState("프린터 드라이버 목록을 만드는 중입니다."));
    driverStatusEl.textContent = "제조사와 모델 목록을 새로 만드는 중입니다.";
    try {
      const result = await window.magicWand.printer.listDrivers("");
      driverPackages = normalizeDriverPackages(result.drivers || []);
      driverCatalogLoaded = true;
      renderMakerOptions();
      modelSelect.replaceChildren(option("", "제조사를 먼저 선택하세요"));
      modelSelect.disabled = true;
      driverListEl.replaceChildren(emptyState("제조사를 선택하세요."));
      driverStatusEl.textContent = `보관함 ${result.localCount || 0}개, Windows ${result.windowsCount || 0}개 모델을 불러왔습니다. 제조사를 선택하세요.`;
    } catch (err) {
      driverPackages = [];
      driverCatalogLoaded = false;
      resetDriverPicker(`드라이버 조회 실패: ${err.message}`);
      driverStatusEl.textContent = "드라이버 조회에 실패했습니다.";
    } finally {
      driverRefreshBtn.disabled = false;
      ui.setBusy(driverRefreshBtn, false);
      makerSelect.disabled = !driverCatalogLoaded;
    }
  }

  function normalizeDriverPackages(drivers) {
    return drivers
      .filter((driver) => driver && driver.model)
      .map((driver) => ({
        ...driver,
        manufacturer: manufacturerOf(driver),
      }))
      .sort((a, b) => {
        const maker = a.manufacturer.localeCompare(b.manufacturer, "ko-KR");
        if (maker) return maker;
        return String(a.model).localeCompare(String(b.model), "ko-KR");
      });
  }

  function renderMakerOptions() {
    const fragment = document.createDocumentFragment();
    fragment.append(option("", "제조사 선택"));
    const found = unique(driverPackages.map((driver) => driver.manufacturer))
      .filter((maker) => driversForMaker(maker).length > 0);
    const makers = found.sort((a, b) => {
      const aIndex = PREFERRED_MAKERS.indexOf(a);
      const bIndex = PREFERRED_MAKERS.indexOf(b);
      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      }
      return a.localeCompare(b, "ko-KR");
    });
    for (const maker of makers) {
      const count = driversForMaker(maker).length;
      fragment.append(option(maker, `${maker} (${count})`));
    }
    if (!makers.length) {
      fragment.append(option("", "표시할 제조사 없음"));
    }
    makerSelect.replaceChildren(fragment);
  }

  function resetDriverPicker(message) {
    makerSelect.disabled = true;
    makerSelect.replaceChildren(option("", "제조사 선택"));
    modelSelect.replaceChildren(option("", "모델 선택"));
    modelSelect.disabled = true;
    manufacturerHomeBtn.disabled = false;
    driverListEl.replaceChildren(emptyState(message));
    driverStatusEl.textContent = message;
  }

  function selectMaker(maker) {
    selectedMaker = maker;
    selectedDriverId = "";
    renderModelOptions();
    renderDriverPackages();
    driverInstallBtn.disabled = true;
    manufacturerHomeBtn.disabled = false;
    if (!maker) {
      driverStatusEl.textContent = "제조사를 선택하면 설치 가능한 모델이 표시됩니다.";
      return;
    }
    const count = driversForMaker(maker).length;
    driverStatusEl.textContent = count
      ? `${maker} 모델 ${count}개를 찾았습니다. 모델을 선택하세요.`
      : `${maker} 모델을 찾지 못했습니다. 보관함에 해당 제조사 드라이버 파일을 넣은 뒤 새로고침하세요.`;
  }

  function renderModelOptions() {
    if (!selectedMaker) {
      modelSelect.replaceChildren(option("", "제조사를 먼저 선택하세요"));
      modelSelect.disabled = true;
      return;
    }
    const drivers = driversForMaker(selectedMaker);
    if (!drivers.length) {
      modelSelect.replaceChildren(option("", "등록된 모델 없음"));
      modelSelect.disabled = true;
      return;
    }
    const fragment = document.createDocumentFragment();
    fragment.append(option("", "모델 선택"));
    for (const driver of drivers) {
      fragment.append(option(driver.id, `${driver.model} · ${driver.sourceLabel || "드라이버"}`));
    }
    modelSelect.replaceChildren(fragment);
    modelSelect.disabled = false;
  }

  function renderDriverPackages() {
    if (!selectedMaker) {
      driverListEl.replaceChildren(emptyState("제조사를 선택하세요."));
      driverInstallBtn.disabled = true;
      return;
    }
    const drivers = driversForMaker(selectedMaker);
    if (!drivers.length) {
      driverListEl.replaceChildren(emptyState("선택한 제조사에 표시할 모델이 없습니다."));
      driverInstallBtn.disabled = true;
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const driver of drivers) {
      const card = document.createElement("article");
      card.className = "tool-card";
      card.dataset.id = driver.id;
      if (driver.id === selectedDriverId) card.classList.add("active");

      const head = document.createElement("div");
      head.className = "tool-card-head";
      const name = document.createElement("strong");
      name.textContent = driver.model || driver.fileName || "모델명 확인 안 됨";
      const badge = document.createElement("span");
      badge.className = `tool-badge ${driverSourceClass(driver)}`;
      badge.textContent = driver.sourceLabel || "드라이버";
      head.append(name, badge);

      const meta = document.createElement("p");
      meta.className = "tool-meta";
      meta.textContent = driverMeta(driver);

      card.append(head, meta);
      fragment.append(card);
    }
    driverListEl.replaceChildren(fragment);
  }

  function handleDriverListClick(event) {
    const card = event.target.closest(".tool-card[data-id]");
    if (card) {
      selectDriverPackage(card.dataset.id);
    }
  }

  function selectDriverPackage(id) {
    selectedDriverId = id;
    if (modelSelect.value !== id) {
      modelSelect.value = id;
    }
    renderDriverPackages();
    driverInstallBtn.disabled = installingDriver || !selectedDriverId;
    const selected = selectedDriver();
    if (selected) {
      driverStatusEl.textContent = `${selected.manufacturer} ${selected.model} 드라이버를 선택했습니다.`;
    }
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

  async function openManufacturerHome() {
    const maker = selectedMaker || makerSelect.value;
    manufacturerHomeBtn.disabled = true;
    ui.setBusy(manufacturerHomeBtn, true);
    try {
      await window.magicWand.printer.openManufacturerHome(maker);
      driverStatusEl.textContent = maker
        ? `${maker} 드라이버 다운로드 센터를 열었습니다.`
        : "제조사 드라이버 다운로드 모음 페이지를 열었습니다.";
    } catch (err) {
      ui.showToast(`제조사 홈페이지 열기 실패: ${err.message}`);
    } finally {
      ui.setBusy(manufacturerHomeBtn, false);
      manufacturerHomeBtn.disabled = false;
    }
  }

  async function installSelectedDriver() {
    const selected = selectedDriver();
    if (!selected) {
      ui.showToast("설치할 제조사와 모델을 먼저 선택해 주세요.");
      return;
    }
    await installDriver(selected, driverInstallBtn);
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
    [driverRefreshBtn, driverFolderBtn, driverInstallBtn, manufacturerHomeBtn].forEach((btn) => {
      btn.disabled = isBusy;
      ui.setBusy(btn, btn === busyButton && isBusy);
    });
    makerSelect.disabled = isBusy || !driverCatalogLoaded;
    modelSelect.disabled = isBusy || !selectedMaker || driversForMaker(selectedMaker).length === 0;
    manufacturerHomeBtn.disabled = isBusy;
    if (!isBusy) {
      driverInstallBtn.disabled = !selectedDriverId;
    }
  }

  function selectedDriver() {
    return driverPackages.find((driver) => driver.id === selectedDriverId);
  }

  function driversForMaker(maker) {
    const key = makerKey(maker);
    if (!key) return [];
    return driverPackages.filter((driver) => makerKey(driver.manufacturer) === key);
  }

  function manufacturerOf(driver) {
    const text = `${driver.manufacturer || ""} ${driver.model || ""} ${driver.fileName || ""}`.toLowerCase();
    const manufacturer = cleanText(driver.manufacturer);
    if (text.includes("samsung") || text.includes("삼성")) return "Samsung";
    if (text.includes("brother")) return "Brother";
    if (text.includes("hewlett") || /\bhp\b/.test(text)) return "HP";
    if (text.includes("canon")) return "Canon";
    if (text.includes("epson")) return "Epson";
    if (text.includes("xerox")) return "Xerox";
    if (text.includes("fuji")) return "Fuji";
    if (text.includes("ricoh")) return "Ricoh";
    if (text.includes("kyocera")) return "Kyocera";
    if (text.includes("microsoft")) return "Microsoft";
    if (text.includes("hancom")) return "Hancom";
    if (text.includes("teamviewer")) return "TeamViewer";
    if (text.includes("lg")) return "LG";
    return manufacturer || "기타";
  }

  function cleanText(value) {
    return String(value || "").trim();
  }

  function makerKey(value) {
    return cleanText(value).toLowerCase().replace(/\s+/g, " ");
  }

  function driverSourceClass(driver) {
    if (driver.source === "inf") return "ok";
    if (driver.source === "installer") return "warn";
    return "muted";
  }

  function unique(values) {
    const result = [];
    const seen = new Set();
    for (const value of values) {
      const text = String(value || "").trim();
      const key = text.toLowerCase();
      if (text && !seen.has(key)) {
        result.push(text);
        seen.add(key);
      }
    }
    return result;
  }

  function option(value, label) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    return opt;
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
