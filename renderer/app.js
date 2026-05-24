const elements = {
  quitButton: document.querySelector("#quitButton"),
  ipManagementPage: document.querySelector("#ipManagementPage"),
  form: document.querySelector("#recordForm"),
  nameInput: document.querySelector("#nameInput"),
  ipInput: document.querySelector("#ipInput"),
  locationInput: document.querySelector("#locationInput"),
  memoInput: document.querySelector("#memoInput"),
  addButton: document.querySelector("#addButton"),
  updateButton: document.querySelector("#updateButton"),
  deleteButton: document.querySelector("#deleteButton"),
  clearButton: document.querySelector("#clearButton"),
  scanButton: document.querySelector("#scanButton"),
  usageScanButton: document.querySelector("#usageScanButton"),
  diagnosticButton: document.querySelector("#diagnosticButton"),
  interfaceSelect: document.querySelector("#interfaceSelect"),
  searchInput: document.querySelector("#searchInput"),
  publicIpValue: document.querySelector("#publicIpValue"),
  pcNameValue: document.querySelector("#pcNameValue"),
  primaryIpValue: document.querySelector("#primaryIpValue"),
  networkRangeValue: document.querySelector("#networkRangeValue"),
  pcInfoBody: document.querySelector("#pcInfoBody"),
  diagnosticResults: document.querySelector("#diagnosticResults"),
  usageRangeChip: document.querySelector("#usageRangeChip"),
  usedCountChip: document.querySelector("#usedCountChip"),
  freeCountChip: document.querySelector("#freeCountChip"),
  addressGrid: document.querySelector("#addressGrid"),
  usedDeviceList: document.querySelector("#usedDeviceList"),
  tableBody: document.querySelector("#recordTableBody"),
  tableWrap: document.querySelector(".table-wrap"),
  quitDialog: document.querySelector("#quitDialog"),
  quitConfirmButton: document.querySelector("#quitConfirmButton"),
  quitCancelButton: document.querySelector("#quitCancelButton"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmDialogTitle: document.querySelector("#confirmDialogTitle"),
  confirmOkButton: document.querySelector("#confirmOkButton"),
  confirmCancelButton: document.querySelector("#confirmCancelButton"),
  toast: document.querySelector("#toast"),
};

let records = [];
let selectedIndex = null;
let selectedInterfaceId = "";
let networkInfo = null;
let toastTimer = null;
let quitConfirmed = false;
let confirmResolve = null;
let commandPalette = null;
let commandInput = null;
let commandList = null;
let commandItems = [];
let menuCommands = [];
let dataCommands = [];
let commandActiveIndex = 0;
let uiSettings = { soundEnabled: true, desktopNotificationEnabled: false };
let soundContext = null;
let achievementState = null;

window.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  setOverviewIdle();
  renderTable();

  window.setTimeout(() => {
    loadUiSettings();
    refreshAchievements();
    loadRecords();
  }, 0);
});

function bindEvents() {
  elements.quitButton.addEventListener("click", () => {
    showQuitDialog();
  });
  elements.quitConfirmButton.addEventListener("click", confirmQuit);
  elements.quitCancelButton.addEventListener("click", hideQuitDialog);
  elements.quitDialog.addEventListener("click", (event) => {
    if (event.target === elements.quitDialog) {
      hideQuitDialog();
    }
  });
  elements.confirmOkButton.addEventListener("click", () => closeConfirm(true));
  elements.confirmCancelButton.addEventListener("click", () => closeConfirm(false));
  elements.confirmDialog.addEventListener("click", (event) => {
    if (event.target === elements.confirmDialog) {
      closeConfirm(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openCommandPalette();
      return;
    }
    if (commandPalette && !commandPalette.hidden) {
      handleCommandPaletteKey(event);
      return;
    }
    if (event.key !== "Escape") {
      return;
    }
    if (!elements.confirmDialog.hidden) {
      closeConfirm(false);
    } else if (!elements.quitDialog.hidden) {
      hideQuitDialog();
    }
  });
  window.magicWand.app.onQuitRequested(showQuitDialog);
  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addRecord();
  });
  elements.updateButton.addEventListener("click", updateRecord);
  elements.deleteButton.addEventListener("click", deleteRecord);
  elements.clearButton.addEventListener("click", clearForm);
  elements.scanButton.addEventListener("click", refreshNetworkInfo);
  elements.usageScanButton.addEventListener("click", scanAddressUsage);
  elements.diagnosticButton.addEventListener("click", runDiagnostics);
  elements.interfaceSelect.addEventListener("change", () => {
    selectedInterfaceId = elements.interfaceSelect.value;
    renderNetworkOverview();
    renderPcInfo();
  });
  elements.searchInput.addEventListener("input", renderTable);
}

window.addEventListener("beforeunload", (event) => {
  if (quitConfirmed) {
    return;
  }

  event.preventDefault();
  event.returnValue = false;
  showQuitDialog();
});

function switchPage(pageSelector, menuButton) {
  const targetPage = document.querySelector(pageSelector);
  if (!targetPage) {
    return;
  }
  document.querySelectorAll(".main-content .page").forEach((page) => {
    page.classList.toggle("active", page === targetPage);
  });
  document.querySelectorAll(".side-nav .menu-link").forEach((link) => {
    if (!link.classList.contains("danger")) {
      link.classList.toggle("active", link === menuButton);
    }
  });
  window.MagicWandMenu?.activate(menuButton);
}

function createCommandPalette() {
  commandPalette = document.createElement("div");
  commandPalette.className = "command-palette";
  commandPalette.hidden = true;
  commandPalette.innerHTML = `
    <section class="command-box" role="dialog" aria-modal="true">
      <label class="command-input-label" for="commandPaletteInput">검색어</label>
      <input id="commandPaletteInput" type="search" autocomplete="off" />
      <div id="commandPaletteList" class="command-list"></div>
      <div class="command-footer">
        <label><input id="soundToggle" type="checkbox" /> 소리</label>
        <label><input id="desktopNotifyToggle" type="checkbox" /> 바탕화면 알림</label>
      </div>
    </section>
  `;
  document.body.append(commandPalette);
  commandInput = commandPalette.querySelector("#commandPaletteInput");
  commandList = commandPalette.querySelector("#commandPaletteList");
  commandInput.addEventListener("input", () => renderCommandList());
  commandPalette.addEventListener("click", (event) => {
    if (event.target === commandPalette) {
      closeCommandPalette();
    }
  });
  commandPalette.querySelector("#soundToggle").addEventListener("change", saveUiSettingsFromPalette);
  commandPalette.querySelector("#desktopNotifyToggle").addEventListener("change", saveUiSettingsFromPalette);
}

function collectCommands() {
  const headings = new Map();
  document.querySelectorAll(".menu-group").forEach((group) => {
    const heading = group.querySelector(".menu-heading")?.textContent?.trim() || "";
    group.querySelectorAll(".menu-link:not(.danger)").forEach((button) => headings.set(button, heading));
  });
  menuCommands = [...document.querySelectorAll(".side-nav .menu-link:not(.danger)")].map((button) => ({
    label: button.textContent.trim(),
    group: headings.get(button) || "",
    button,
  }));
  commandItems = [...menuCommands, ...dataCommands];
}

// 자산·양식지 문서·빠른 메모를 검색 대상에 추가한다. (제목/이름/태그/메모로 찾아 해당 화면으로 이동)
// 정품키 등 민감정보는 인덱싱하지 않는다.
async function loadDataCommands() {
  const next = [];
  try {
    const assets = await window.magicWand.asset.load();
    for (const asset of assets) {
      const label = asset.name || asset.assetTag || asset.ip || "(이름 없는 자산)";
      next.push({
        label,
        group: "자산",
        searchText: [asset.assetTag, asset.name, asset.ip, asset.location, asset.owner, asset.memo].join(" "),
        run: () => navigateAndSearch("#assetMenu", "#assetSearch", asset.name || asset.assetTag || asset.ip || ""),
      });
    }
  } catch {
    // 자산을 불러오지 못해도 메뉴 검색은 동작해야 하므로 조용히 넘어간다.
  }
  try {
    const docs = await window.magicWand.formMaker.list();
    for (const doc of docs) {
      const label = doc.title || "(제목 없는 문서)";
      next.push({
        label,
        group: "양식지",
        searchText: doc.title || "",
        run: () => navigateAndSearch("#formManagerMenu", "#fmgSearch", doc.title || ""),
      });
    }
  } catch {
    // 양식지 목록 실패도 무시한다.
  }
  try {
    const admin = await window.magicWand.adminWork.load();
    for (const note of admin.notes || []) {
      const label = note.title || "(제목 없는 메모)";
      next.push({
        label,
        group: "빠른 메모",
        searchText: [note.title, note.relatedTo, note.body].join(" "),
        run: () => navigateAdminNote(note.id),
      });
    }
  } catch {
    // 행정 메모를 불러오지 못해도 기본 메뉴 검색은 계속 사용할 수 있어야 한다.
  }
  dataCommands = next;
  commandItems = [...menuCommands, ...dataCommands];
}

// 해당 화면으로 이동한 뒤, 그 화면 검색칸에 키워드를 채워 항목을 바로 찾게 한다.
function navigateAndSearch(menuSelector, searchSelector, term) {
  document.querySelector(menuSelector)?.click();
  if (!searchSelector || !term) {
    return;
  }
  window.setTimeout(() => {
    const input = document.querySelector(searchSelector);
    if (input) {
      input.value = term;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, 60);
}

async function navigateAdminNote(noteId) {
  const menu = document.querySelector("#adminWorkMenu");
  menu?.click();
  if (window.AdminWork && typeof window.AdminWork.openNote === "function") {
    await window.AdminWork.openNote(noteId);
    return;
  }
  window.setTimeout(() => {
    document.querySelector('[data-admin-tab="notes"]')?.click();
  }, 60);
}

function openCommandPalette() {
  if (!commandPalette) {
    createCommandPalette();
  }
  collectCommands();
  commandPalette.hidden = false;
  commandInput.value = "";
  commandActiveIndex = 0;
  updateSettingsToggles();
  renderCommandList();
  commandInput.focus();
  loadDataCommands().then(() => {
    if (commandPalette && !commandPalette.hidden) {
      renderCommandList();
    }
  });
}

function closeCommandPalette() {
  if (!commandPalette) return;
  commandPalette.hidden = true;
}

function renderCommandList() {
  const keyword = commandInput.value.trim().toLowerCase();
  // 검색어가 없으면 메뉴만 보여주고, 입력하면 자산·문서까지 함께 검색한다.
  const pool = keyword ? commandItems : menuCommands;
  const visible = pool.filter((item) => {
    const text = `${item.group} ${item.label} ${item.searchText || ""}`.toLowerCase();
    return !keyword || text.includes(keyword);
  });
  commandActiveIndex = Math.min(commandActiveIndex, Math.max(0, visible.length - 1));
  commandList.innerHTML = "";
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty-inline";
    empty.textContent = "검색 결과가 없습니다.";
    commandList.append(empty);
    return;
  }
  visible.forEach((item, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "command-item";
    btn.classList.toggle("active", index === commandActiveIndex);
    btn.innerHTML = `<span></span><strong></strong>`;
    btn.querySelector("span").textContent = item.group;
    btn.querySelector("strong").textContent = item.label;
    btn.addEventListener("click", () => runCommand(item));
    commandList.append(btn);
  });
}

function handleCommandPaletteKey(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeCommandPalette();
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const count = commandList.querySelectorAll(".command-item").length;
    if (!count) return;
    commandActiveIndex = (commandActiveIndex + (event.key === "ArrowDown" ? 1 : -1) + count) % count;
    renderCommandList();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const items = commandList.querySelectorAll(".command-item");
    items[commandActiveIndex]?.click();
  }
}

async function runCommand(item) {
  closeCommandPalette();
  if (typeof item.run === "function") {
    await item.run();
  } else if (item.button) {
    item.button.click();
  }
  await bumpAchievement("commandsUsed");
}

async function loadUiSettings() {
  try {
    uiSettings = await window.magicWand.uiSettings.get();
  } catch {
    uiSettings = { soundEnabled: true, desktopNotificationEnabled: false };
  }
}

async function saveUiSettingsFromPalette() {
  uiSettings = {
    soundEnabled: commandPalette.querySelector("#soundToggle").checked,
    desktopNotificationEnabled: commandPalette.querySelector("#desktopNotifyToggle").checked,
  };
  try {
    uiSettings = await window.magicWand.uiSettings.save(uiSettings);
  } catch (error) {
    showToast(`알림 설정 저장 실패: ${error.message}`);
  }
}

function updateSettingsToggles() {
  commandPalette.querySelector("#soundToggle").checked = uiSettings.soundEnabled !== false;
  commandPalette.querySelector("#desktopNotifyToggle").checked = uiSettings.desktopNotificationEnabled === true;
}

function showQuitDialog() {
  elements.quitDialog.hidden = false;
  elements.quitConfirmButton.focus();
}

function hideQuitDialog() {
  elements.quitDialog.hidden = true;
  elements.quitButton.focus();
}

function confirmQuit() {
  quitConfirmed = true;
  window.magicWand.app.quit();
}

function showConfirm(message, options = {}) {
  const { confirmText = "확인", danger = true } = options;
  elements.confirmDialogTitle.textContent = message;
  elements.confirmOkButton.textContent = confirmText;
  elements.confirmOkButton.classList.toggle("danger-action", danger);
  elements.confirmDialog.hidden = false;
  elements.confirmOkButton.focus();
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}

function closeConfirm(result) {
  if (elements.confirmDialog.hidden) {
    return;
  }
  elements.confirmDialog.hidden = true;
  if (confirmResolve) {
    const resolve = confirmResolve;
    confirmResolve = null;
    resolve(result);
  }
}

async function loadRecords() {
  try {
    records = await window.magicWand.ipRecords.load();
    renderTable();
  } catch (error) {
    showToast(`IP 목록을 불러오지 못했습니다: ${error.message}`);
  }
}

async function saveRecords(message) {
  try {
    records = await window.magicWand.ipRecords.save(records);
    renderTable();
    showToast(message);
    return true;
  } catch (error) {
    showToast(`IP 목록을 저장하지 못했습니다: ${error.message}`);
    return false;
  }
}

async function addRecord() {
  const record = recordFromForm();
  if (!record) {
    return;
  }

  if (findIpIndex(record.ipAddress) !== null) {
    showToast("이미 등록된 IP 주소입니다.");
    return;
  }

  records.push(record);
  if (await saveRecords("등록 완료")) {
    clearForm();
  }
}

async function updateRecord() {
  if (selectedIndex === null) {
    showToast("수정할 IP를 목록에서 선택해 주세요.");
    return;
  }

  const record = recordFromForm();
  if (!record) {
    return;
  }

  const duplicateIndex = findIpIndex(record.ipAddress);
  if (duplicateIndex !== null && duplicateIndex !== selectedIndex) {
    showToast("이미 등록된 IP 주소입니다.");
    return;
  }

  records[selectedIndex] = record;
  if (await saveRecords("수정 완료")) {
    clearForm();
  }
}

async function deleteRecord() {
  if (selectedIndex === null) {
    showToast("삭제할 IP를 목록에서 선택해 주세요.");
    return;
  }

  const record = records[selectedIndex];
  const ok = await showConfirm(`${record.name} (${record.ipAddress}) 항목을 삭제할까요?`, { confirmText: "삭제" });
  if (!ok) {
    return;
  }

  records.splice(selectedIndex, 1);
  if (await saveRecords("삭제 완료")) {
    clearForm();
  }
}

function recordFromForm() {
  const name = elements.nameInput.value.trim();
  const ipAddress = normalizeIp(elements.ipInput.value.trim());
  const location = elements.locationInput.value.trim();
  const memo = elements.memoInput.value.trim();

  if (!name) {
    showToast("이름을 입력해 주세요.");
    elements.nameInput.focus();
    return null;
  }

  if (!ipAddress) {
    showToast("올바른 IPv4 주소를 입력해 주세요.");
    elements.ipInput.focus();
    return null;
  }

  return {
    name,
    ipAddress,
    location,
    memo,
  };
}

function renderTable() {
  const keyword = elements.searchInput.value.trim().toLowerCase();
  elements.tableBody.innerHTML = "";

  const visibleRecords = records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => {
      const text = [record.name, record.ipAddress, record.location, record.memo]
        .join(" ")
        .toLowerCase();
      return !keyword || text.includes(keyword);
    });

  for (const { record, index } of visibleRecords) {
    const row = document.createElement("tr");
    row.dataset.index = String(index);
    if (index === selectedIndex) {
      row.classList.add("selected");
    }

    row.append(
      createCell(record.name),
      createCell(record.ipAddress),
      createCell(record.location),
      createCell(record.memo),
    );

    row.addEventListener("click", () => selectRecord(index));
    elements.tableBody.append(row);
  }

  elements.tableWrap.classList.toggle("empty", visibleRecords.length === 0);
  updateButtons();
}

function createCell(value) {
  const cell = document.createElement("td");
  cell.textContent = value || "";
  return cell;
}

function selectRecord(index) {
  selectedIndex = index;
  const record = records[index];
  elements.nameInput.value = record.name;
  elements.ipInput.value = record.ipAddress;
  elements.locationInput.value = record.location;
  elements.memoInput.value = record.memo;
  renderTable();
}

function clearForm() {
  selectedIndex = null;
  elements.form.reset();
  renderTable();
}

function updateButtons() {
  const hasSelection = selectedIndex !== null;
  elements.updateButton.disabled = !hasSelection;
  elements.deleteButton.disabled = !hasSelection;
}

async function refreshNetworkInfo() {
  elements.scanButton.disabled = true;
  setBusy(elements.scanButton, true);
  setOverviewLoading();

  try {
    networkInfo = await window.magicWand.network.scan();
    if (!selectedInterfaceId) {
      selectedInterfaceId = networkInfo.primaryInterface?.id ?? networkInfo.privateInterfaces?.[0]?.id ?? "";
    }
    renderNetworkOverview();
    renderInterfaceSelect();
    renderPcInfo();
  } catch (error) {
    setOverviewFailed();
    showToast(`네트워크 정보 조사 실패: ${error.message}`);
  } finally {
    elements.scanButton.disabled = false;
    setBusy(elements.scanButton, false);
  }
}

function setOverviewIdle() {
  elements.publicIpValue.textContent = "확인 전";
  elements.pcNameValue.textContent = "확인 전";
  elements.primaryIpValue.textContent = "확인 전";
  elements.networkRangeValue.textContent = "확인 전";
  elements.pcInfoBody.innerHTML = "";
  elements.pcInfoBody.append(createEmptyState("새로고침 버튼을 눌러 네트워크 정보를 확인하세요."));
}

function setOverviewLoading() {
  elements.publicIpValue.textContent = "확인 중";
  elements.pcNameValue.textContent = "확인 중";
  elements.primaryIpValue.textContent = "확인 중";
  elements.networkRangeValue.textContent = "확인 중";
  elements.pcInfoBody.innerHTML = "";
  elements.pcInfoBody.append(createLoadingState("네트워크 정보를 확인하는 중입니다."));
}

function setOverviewFailed() {
  elements.publicIpValue.textContent = "확인 실패";
  elements.pcNameValue.textContent = "확인 실패";
  elements.primaryIpValue.textContent = "확인 실패";
  elements.networkRangeValue.textContent = "확인 실패";
}

function renderNetworkOverview() {
  const primary = getSelectedInterface() ?? networkInfo.primaryInterface;
  elements.publicIpValue.textContent = networkInfo.publicIp || "확인 실패";
  elements.pcNameValue.textContent = networkInfo.pcName || "확인 실패";
  elements.primaryIpValue.textContent = primary?.privateIp || "확인 실패";
  elements.networkRangeValue.textContent = primary?.networkRange || "확인 실패";
}

function renderInterfaceSelect() {
  const interfaces = networkInfo?.privateInterfaces ?? [];
  if (!interfaces.some((item) => item.id === selectedInterfaceId)) {
    selectedInterfaceId = networkInfo?.primaryInterface?.id ?? interfaces[0]?.id ?? "";
  }

  elements.interfaceSelect.innerHTML = "";

  for (const item of interfaces) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.name} · ${item.privateIp}`;
    elements.interfaceSelect.append(option);
  }

  elements.interfaceSelect.disabled = interfaces.length === 0;
  elements.interfaceSelect.value = selectedInterfaceId;
}

function renderPcInfo() {
  const interfaces = networkInfo?.privateInterfaces ?? [];
  const selected = getSelectedInterface();

  elements.pcInfoBody.innerHTML = "";
  if (!interfaces.length) {
    elements.pcInfoBody.append(createEmptyState("표시할 PC IP 정보가 없습니다."));
    return;
  }

  for (const item of interfaces) {
    const block = document.createElement("article");
    block.className = "interface-item";
    if (selected?.id === item.id) {
      block.classList.add("active");
    }
    block.innerHTML = `
      <div>
        <strong></strong>
        <span></span>
      </div>
      <dl>
        <div><dt>사설 IP</dt><dd></dd></div>
        <div><dt>대역</dt><dd></dd></div>
        <div><dt>게이트웨이</dt><dd></dd></div>
        <div><dt>DNS</dt><dd></dd></div>
      </dl>
    `;
    block.querySelector("strong").textContent = item.name;
    block.querySelector("span").textContent = item.description || "설명 없음";
    const values = block.querySelectorAll("dd");
    values[0].textContent = item.privateIp;
    values[1].textContent = item.networkRange;
    values[2].textContent = item.gateway || "확인 안 됨";
    values[3].textContent = item.dnsServers?.length ? item.dnsServers.join(", ") : "확인 안 됨";
    block.addEventListener("click", () => {
      selectedInterfaceId = item.id;
      elements.interfaceSelect.value = item.id;
      renderNetworkOverview();
      renderPcInfo();
    });
    elements.pcInfoBody.append(block);
  }
}

async function scanAddressUsage() {
  elements.usageScanButton.disabled = true;
  setBusy(elements.usageScanButton, true);
  elements.addressGrid.innerHTML = "";
  elements.usedDeviceList.innerHTML = "";
  elements.usageRangeChip.textContent = "대역: 조사 중";
  elements.usedCountChip.textContent = "사용: 0";
  elements.freeCountChip.textContent = "비어 있음: 0";

  try {
    const result = await window.magicWand.network.scanAddresses(selectedInterfaceId);
    renderAddressUsage(result);
  } catch (error) {
    elements.addressGrid.append(createEmptyState("IP 대역 스캔에 실패했습니다."));
    showToast(`IP 대역 스캔 실패: ${error.message}`);
  } finally {
    elements.usageScanButton.disabled = false;
    setBusy(elements.usageScanButton, false);
  }
}

function renderAddressUsage(result) {
  elements.usageRangeChip.textContent = `대역: ${result.scannedRange || "확인 실패"}`;
  elements.usedCountChip.textContent = `사용: ${result.usedCount}`;
  elements.freeCountChip.textContent = `비어 있음: ${result.freeCount}`;

  elements.addressGrid.innerHTML = "";
  for (const host of result.hosts ?? []) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `address-cell ${host.status}`;
    if (host.role) {
      cell.classList.add(host.role);
    }
    cell.textContent = host.ip.split(".").at(-1);
    cell.title = makeHostTitle(host);
    cell.addEventListener("click", () => fillIpFromHost(host));
    elements.addressGrid.append(cell);
  }

  renderUsedDeviceList(result.hosts ?? []);
}

function makeHostTitle(host) {
  const lines = [host.ip, host.status === "used" ? "사용 중" : "비어 있음"];
  if (host.role === "self") {
    lines.push("현재 PC");
  }
  if (host.role === "gateway") {
    lines.push("게이트웨이");
  }
  if (host.name) {
    lines.push(`장비명: ${host.name}`);
  }
  if (host.macAddress) {
    lines.push(`MAC: ${host.macAddress}`);
  }
  return lines.join("\n");
}

function fillIpFromHost(host) {
  elements.ipInput.value = host.ip;
  if (host.name && !elements.nameInput.value.trim()) {
    elements.nameInput.value = host.name;
  }
}

function renderUsedDeviceList(hosts) {
  const usedHosts = hosts.filter((host) => host.status === "used");
  elements.usedDeviceList.innerHTML = "";

  if (!usedHosts.length) {
    elements.usedDeviceList.append(createEmptyState("응답한 장비가 없습니다."));
    return;
  }

  for (const host of usedHosts) {
    const item = document.createElement("article");
    item.className = "used-device";
    item.innerHTML = `
      <strong></strong>
      <span></span>
      <small></small>
    `;
    item.querySelector("strong").textContent = host.ip;
    item.querySelector("span").textContent = host.name || roleLabel(host.role) || "장비명 확인 안 됨";
    item.querySelector("small").textContent = host.macAddress || "MAC 확인 안 됨";
    elements.usedDeviceList.append(item);
  }
}

async function runDiagnostics() {
  elements.diagnosticButton.disabled = true;
  setBusy(elements.diagnosticButton, true);
  elements.diagnosticResults.innerHTML = "";
  elements.diagnosticResults.append(createLoadingState("진단 중입니다."));

  try {
    const result = await window.magicWand.network.diagnose(selectedInterfaceId);
    renderDiagnostics(result);
  } catch (error) {
    elements.diagnosticResults.innerHTML = "";
    elements.diagnosticResults.append(createEmptyState(`진단 실패: ${error.message}`));
  } finally {
    elements.diagnosticButton.disabled = false;
    setBusy(elements.diagnosticButton, false);
  }
}

function renderDiagnostics(result) {
  renderTestList(elements.diagnosticResults, result.tests);
}

function renderTestList(container, tests) {
  container.innerHTML = "";

  for (const test of tests ?? []) {
    const item = document.createElement("article");
    item.className = `diagnostic-item ${test.status}`;
    item.innerHTML = `
      <div>
        <strong></strong>
        <span></span>
      </div>
      <p></p>
    `;
    item.querySelector("strong").textContent = test.name;
    item.querySelector("span").textContent = statusLabel(test.status);
    item.querySelector("p").textContent = `${test.detail} ${test.hint ?? ""}`.trim();
    container.append(item);
  }
}

function getSelectedInterface() {
  const interfaces = networkInfo?.privateInterfaces ?? [];
  return interfaces.find((item) => item.id === selectedInterfaceId) ?? null;
}

function roleLabel(role) {
  if (role === "self") {
    return "현재 PC";
  }
  if (role === "gateway") {
    return "게이트웨이";
  }
  return "";
}

function statusLabel(status) {
  if (status === "ok") {
    return "정상";
  }
  if (status === "warn") {
    return "주의";
  }
  return "문제";
}

function createEmptyState(message) {
  const element = document.createElement("p");
  element.className = "empty-inline";
  element.textContent = message;
  return element;
}

function createLoadingState(message) {
  const element = document.createElement("p");
  element.className = "empty-inline busy-inline";
  const spinner = document.createElement("span");
  spinner.className = "busy-spinner";
  spinner.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.textContent = message;
  element.append(spinner, text);
  return element;
}

function setBusy(element, isBusy) {
  if (!element) {
    return;
  }
  element.classList.toggle("is-busy", Boolean(isBusy));
  if (isBusy) {
    element.setAttribute("aria-busy", "true");
  } else {
    element.removeAttribute("aria-busy");
  }
}

function findIpIndex(ipAddress) {
  const index = records.findIndex((record) => record.ipAddress === ipAddress);
  return index === -1 ? null : index;
}

function normalizeIp(value) {
  if (!isIPv4(value)) {
    return "";
  }
  return value
    .split(".")
    .map((part) => String(Number(part)))
    .join(".");
}

function isIPv4(value) {
  const parts = String(value).split(".");
  if (parts.length !== 4) {
    return false;
  }

  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return false;
    }
    const number = Number(part);
    return number >= 0 && number <= 255;
  });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2600);
}

async function notifyComplete(message, options = {}) {
  showToast(message);
  if (uiSettings.soundEnabled !== false) {
    playCompleteSound();
  }
  if (uiSettings.desktopNotificationEnabled) {
    window.magicWand.uiSettings.notify({ title: "Magic WAND", body: message }).catch(() => {});
  }
  if (options.achievementKey) {
    await bumpAchievement(options.achievementKey);
  }
}

async function exportPdf(options = {}) {
  try {
    const result = await window.magicWand.export.toPdf(options);
    if (!result.canceled) {
      showToast("PDF 저장 완료");
    }
    return result;
  } catch (error) {
    showToast(`PDF 저장 실패: ${error.message}`);
    return { canceled: true, error: error.message };
  }
}

function playCompleteSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    soundContext = soundContext || new AudioContext();
    const osc = soundContext.createOscillator();
    const gain = soundContext.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, soundContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, soundContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, soundContext.currentTime + 0.22);
    osc.connect(gain).connect(soundContext.destination);
    osc.start();
    osc.stop(soundContext.currentTime + 0.24);
  } catch {}
}

async function refreshAchievements() {
  try {
    achievementState = await window.magicWand.achievements.get();
    renderAchievements();
  } catch {
    achievementState = null;
  }
}

async function bumpAchievement(key) {
  try {
    achievementState = await window.magicWand.achievements.bump({ key });
    renderAchievements();
    for (const badge of achievementState.newBadges || []) {
      showToast(`새 배지: ${badge.label}`);
    }
    return achievementState;
  } catch {
    return achievementState;
  }
}

function renderAchievements() {
  const stats = document.querySelector("#achievementStats");
  const badges = document.querySelector("#achievementBadges");
  if (!stats || !badges || !achievementState) return;
  stats.innerHTML = "";
  [
    ["점검", achievementState.checksDone],
    ["백업", achievementState.backupsDone],
    ["정리", achievementState.cleanupsDone],
    ["명령", achievementState.commandsUsed],
  ].forEach(([label, value]) => {
    const item = document.createElement("span");
    item.textContent = `${label} ${Number(value || 0)}`;
    stats.append(item);
  });

  badges.innerHTML = "";
  const badgeDetails = achievementState.badgeDetails || [];
  if (!badgeDetails.length) {
    const empty = document.createElement("p");
    empty.className = "empty-inline";
    empty.textContent = "아직 획득한 배지가 없습니다.";
    badges.append(empty);
    return;
  }
  for (const badge of badgeDetails) {
    const chip = document.createElement("span");
    chip.title = badge.description || "";
    chip.textContent = badge.label;
    badges.append(chip);
  }
}

window.MagicWand = {
  switchPage,
  showToast,
  notifyComplete,
  exportPdf,
  bumpAchievement,
  refreshAchievements,
  showConfirm,
  renderTestList,
  statusLabel,
  createLoadingState,
  setBusy,
};
