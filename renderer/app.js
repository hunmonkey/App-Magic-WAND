const elements = {
  ipManagementMenu: document.querySelector("#ipManagementMenu"),
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
  networkStatus: document.querySelector("#networkStatus"),
  publicIpValue: document.querySelector("#publicIpValue"),
  pcNameValue: document.querySelector("#pcNameValue"),
  primaryIpValue: document.querySelector("#primaryIpValue"),
  networkRangeValue: document.querySelector("#networkRangeValue"),
  pcInfoSummary: document.querySelector("#pcInfoSummary"),
  pcInfoBody: document.querySelector("#pcInfoBody"),
  diagnosticSummary: document.querySelector("#diagnosticSummary"),
  diagnosticResults: document.querySelector("#diagnosticResults"),
  usageStatus: document.querySelector("#usageStatus"),
  usageRangeChip: document.querySelector("#usageRangeChip"),
  usedCountChip: document.querySelector("#usedCountChip"),
  freeCountChip: document.querySelector("#freeCountChip"),
  addressGrid: document.querySelector("#addressGrid"),
  usedDeviceList: document.querySelector("#usedDeviceList"),
  recordCount: document.querySelector("#recordCount"),
  tableBody: document.querySelector("#recordTableBody"),
  tableWrap: document.querySelector(".table-wrap"),
  toast: document.querySelector("#toast"),
};

let records = [];
let selectedIndex = null;
let selectedInterfaceId = "";
let networkInfo = null;
let toastTimer = null;

window.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  await loadRecords();
  await refreshNetworkInfo();
});

function bindEvents() {
  elements.ipManagementMenu.addEventListener("click", showIpManagementPage);
  elements.quitButton.addEventListener("click", () => {
    window.magicWand.quitApp();
  });
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

function showIpManagementPage() {
  elements.ipManagementPage.classList.add("active");
  elements.ipManagementMenu.classList.add("active");
}

async function loadRecords() {
  try {
    records = await window.magicWand.loadRecords();
    renderTable();
  } catch (error) {
    showToast(`IP 목록을 불러오지 못했습니다: ${error.message}`);
  }
}

async function saveRecords(message) {
  try {
    records = await window.magicWand.saveRecords(records);
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
  if (await saveRecords("IP가 추가되었습니다.")) {
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
  if (await saveRecords("IP가 수정되었습니다.")) {
    clearForm();
  }
}

async function deleteRecord() {
  if (selectedIndex === null) {
    showToast("삭제할 IP를 목록에서 선택해 주세요.");
    return;
  }

  const record = records[selectedIndex];
  const ok = window.confirm(`${record.name} (${record.ipAddress}) 항목을 삭제할까요?`);
  if (!ok) {
    return;
  }

  records.splice(selectedIndex, 1);
  if (await saveRecords("IP가 삭제되었습니다.")) {
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

  elements.recordCount.textContent = `${records.length}개 등록됨`;
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
  elements.networkStatus.textContent = "현재 정보를 조사 중입니다...";
  setOverviewLoading();

  try {
    networkInfo = await window.magicWand.scanNetwork();
    if (!selectedInterfaceId) {
      selectedInterfaceId = networkInfo.primaryInterface?.id ?? networkInfo.privateInterfaces?.[0]?.id ?? "";
    }
    renderNetworkOverview();
    renderInterfaceSelect();
    renderPcInfo();
  } catch (error) {
    elements.networkStatus.textContent = `조사 실패: ${error.message}`;
    setOverviewFailed();
  } finally {
    elements.scanButton.disabled = false;
  }
}

function setOverviewLoading() {
  elements.publicIpValue.textContent = "확인 중";
  elements.pcNameValue.textContent = "확인 중";
  elements.primaryIpValue.textContent = "확인 중";
  elements.networkRangeValue.textContent = "확인 중";
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
  elements.networkStatus.textContent = networkInfo.messages?.length
    ? networkInfo.messages.join(" / ")
    : "조사 완료";
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
  elements.pcInfoSummary.textContent = interfaces.length
    ? `${interfaces.length}개 네트워크 연결 확인`
    : "확인된 네트워크 연결이 없습니다.";

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
  elements.usageStatus.textContent = "IP 대역을 조사 중입니다...";
  elements.addressGrid.innerHTML = "";
  elements.usedDeviceList.innerHTML = "";
  elements.usageRangeChip.textContent = "대역: 조사 중";
  elements.usedCountChip.textContent = "사용: 0";
  elements.freeCountChip.textContent = "비어 있음: 0";

  try {
    const result = await window.magicWand.scanAddressUsage(selectedInterfaceId);
    renderAddressUsage(result);
  } catch (error) {
    elements.usageStatus.textContent = `스캔 실패: ${error.message}`;
  } finally {
    elements.usageScanButton.disabled = false;
  }
}

function renderAddressUsage(result) {
  elements.usageStatus.textContent = result.messages?.length
    ? result.messages.join(" / ")
    : `${result.totalHosts}개 주소 조사 완료`;
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
  elements.diagnosticSummary.textContent = "진단 중입니다...";
  elements.diagnosticResults.innerHTML = "";

  try {
    const result = await window.magicWand.runDiagnostics(selectedInterfaceId);
    renderDiagnostics(result);
  } catch (error) {
    elements.diagnosticSummary.textContent = `진단 실패: ${error.message}`;
  } finally {
    elements.diagnosticButton.disabled = false;
  }
}

function renderDiagnostics(result) {
  elements.diagnosticSummary.textContent = result.summary || "진단 완료";
  elements.diagnosticResults.innerHTML = "";

  for (const test of result.tests ?? []) {
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
    item.querySelector("p").textContent = `${test.detail} ${test.hint}`;
    elements.diagnosticResults.append(item);
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
