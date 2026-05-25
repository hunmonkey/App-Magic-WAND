(function () {
  const ui = window.MagicWand;
  const registerMenu = document.querySelector("#assetRegisterMenu");
  const listMenu = document.querySelector("#assetListMenu");
  if ((!registerMenu && !listMenu) || !ui || !window.magicWand?.asset) return;

  const api = window.magicWand.asset;
  const form = document.querySelector("#assetForm");
  const fields = {
    type: document.querySelector("#assetType"),
    assetTag: document.querySelector("#assetTag"),
    name: document.querySelector("#assetName"),
    manufacturer: document.querySelector("#assetManufacturer"),
    model: document.querySelector("#assetModel"),
    serialNumber: document.querySelector("#assetSerialNumber"),
    status: document.querySelector("#assetStatus"),
    department: document.querySelector("#assetDepartment"),
    owner: document.querySelector("#assetOwner"),
    location: document.querySelector("#assetLocation"),
    ip: document.querySelector("#assetIp"),
    purchaseDate: document.querySelector("#assetPurchaseDate"),
    purchaseAmount: document.querySelector("#assetPurchaseAmount"),
    evidence: document.querySelector("#assetEvidence"),
    warrantyEnd: document.querySelector("#assetWarrantyEnd"),
    pcCpu: document.querySelector("#assetCpu"),
    pcRam: document.querySelector("#assetRam"),
    motherboard: document.querySelector("#assetMotherboard"),
    vga: document.querySelector("#assetVga"),
    ssd: document.querySelector("#assetSsd"),
    hdd: document.querySelector("#assetHdd"),
    pcNic: document.querySelector("#assetNic"),
    power: document.querySelector("#assetPower"),
    pcOs: document.querySelector("#assetOs"),
    laptopScreenSize: document.querySelector("#assetScreenSize"),
    batteryHealth: document.querySelector("#assetBatteryHealth"),
    monitorScreenSize: document.querySelector("#assetMonitorScreenSize"),
    resolution: document.querySelector("#assetResolution"),
    panelType: document.querySelector("#assetPanelType"),
    ports: document.querySelector("#assetPorts"),
    connectedAsset: document.querySelector("#assetConnectedAsset"),
    printType: document.querySelector("#assetPrintType"),
    colorMode: document.querySelector("#assetColorMode"),
    connectionType: document.querySelector("#assetConnectionType"),
    tonerModel: document.querySelector("#assetTonerModel"),
    printCounter: document.querySelector("#assetPrintCounter"),
    scanFax: document.querySelector("#assetScanFax"),
    nasCpu: document.querySelector("#assetNasCpu"),
    nasRam: document.querySelector("#assetNasRam"),
    diskBays: document.querySelector("#assetDiskBays"),
    storage: document.querySelector("#assetStorage"),
    raid: document.querySelector("#assetRaid"),
    nasNic: document.querySelector("#assetNasNic"),
    nasOs: document.querySelector("#assetNasOs"),
    backupTarget: document.querySelector("#assetBackupTarget"),
    adminUrl: document.querySelector("#assetAdminUrl"),
    repairHistory: document.querySelector("#assetRepairHistory"),
    memo: document.querySelector("#assetMemo"),
  };
  const updateBtn = document.querySelector("#assetUpdateBtn");
  const deleteBtn = document.querySelector("#assetDeleteBtn");
  const clearBtn = document.querySelector("#assetClearBtn");
  const fillBtn = document.querySelector("#assetFillBtn");
  const newBtn = document.querySelector("#assetNewBtn");
  const searchInput = document.querySelector("#assetSearch");
  const typeFilter = document.querySelector("#assetTypeFilter");
  const departmentFilter = document.querySelector("#assetDepartmentFilter");
  const statusFilter = document.querySelector("#assetStatusFilter");
  const tableBody = document.querySelector("#assetTableBody");
  const tableWrap = document.querySelector(".asset-table-wrap");
  const countText = document.querySelector("#assetCount");
  const detailBody = document.querySelector("#assetDetailBody");
  const chart = document.querySelector("#assetChart");
  const chartNote = document.querySelector("#assetChartNote");
  const stats = {
    total: document.querySelector("#assetStatTotal"),
    amount: document.querySelector("#assetStatAmount"),
    warranty: document.querySelector("#assetStatWarranty"),
    department: document.querySelector("#assetStatDepartment"),
  };

  const TYPE_ORDER = ["pc", "laptop", "monitor", "mfp", "nas"];
  const ASSET_TYPES = {
    pc: "PC",
    laptop: "노트북",
    monitor: "모니터",
    mfp: "복합기",
    nas: "NAS",
  };
  const LEGACY_TYPE_MAP = {
    printer: "mfp",
    other: "pc",
  };
  const STATUS_ORDER = ["사용중", "보관", "수리중", "폐기 예정", "폐기"];
  const currencyFormatter = new Intl.NumberFormat("ko-KR");

  let assets = [];
  let selectedId = null;
  let loaded = false;
  let loadingPromise = null;
  let assetTypeSections = [];

  registerMenu?.addEventListener("click", openRegisterPage);
  listMenu?.addEventListener("click", openListPage);

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (selectedId) {
      updateAsset();
    } else {
      addAsset();
    }
  });
  fields.type?.addEventListener("change", updateAssetTypeFields);
  updateBtn?.addEventListener("click", updateAsset);
  deleteBtn?.addEventListener("click", deleteSelectedAsset);
  clearBtn?.addEventListener("click", clearForm);
  fillBtn?.addEventListener("click", fillFromPc);
  newBtn?.addEventListener("click", () => {
    clearForm(false);
    openRegisterPage();
  });
  searchInput?.addEventListener("input", debounce(renderListPage, 180));
  typeFilter?.addEventListener("change", renderListPage);
  departmentFilter?.addEventListener("change", renderListPage);
  statusFilter?.addEventListener("change", renderListPage);
  tableBody?.addEventListener("click", handleTableClick);

  assetTypeSections = [...document.querySelectorAll("[data-asset-fields]")].map((section) => ({
    element: section,
    supported: String(section.dataset.assetFields || "").split(/\s+/).filter(Boolean),
  }));
  updateAssetTypeFields();
  renderEmptyDetail();
  updateButtons();

  function openRegisterPage() {
    ui.switchPage("#assetRegisterPage", registerMenu);
    ensureLoaded();
  }

  function openListPage() {
    ui.switchPage("#assetListPage", listMenu);
    ensureLoaded();
  }

  function ensureLoaded() {
    if (loaded) return Promise.resolve();
    if (loadingPromise) return loadingPromise;
    loadingPromise = load();
    return loadingPromise;
  }

  async function load() {
    try {
      assets = (await api.load()).map(normalizeAsset);
      loaded = true;
      renderAll();
    } catch (error) {
      ui.showToast(`자산 목록을 불러오지 못했습니다: ${error.message}`);
    } finally {
      loadingPromise = null;
    }
  }

  async function persist(message) {
    try {
      assets = (await api.save(assets)).map(normalizeAsset);
      loaded = true;
      renderAll();
      ui.showToast(message);
      return true;
    } catch (error) {
      ui.showToast(`자산을 저장하지 못했습니다: ${error.message}`);
      return false;
    }
  }

  function assetFromForm() {
    const name = value(fields.name);
    if (!name) {
      ui.showToast("필수 입력 항목이 누락되었습니다: 장비명");
      fields.name?.focus();
      return null;
    }

    const type = normalizeAssetType(value(fields.type));
    const now = new Date().toISOString();
    const existing = selectedId ? assets.find((item) => item.id === selectedId) : null;
    const data = {
      id: selectedId || "",
      type,
      assetTag: value(fields.assetTag),
      name,
      manufacturer: value(fields.manufacturer),
      model: value(fields.model),
      serialNumber: value(fields.serialNumber),
      status: value(fields.status) || "사용중",
      department: value(fields.department),
      owner: value(fields.owner),
      location: value(fields.location),
      ip: value(fields.ip),
      purchaseDate: value(fields.purchaseDate),
      purchaseAmount: value(fields.purchaseAmount),
      evidence: value(fields.evidence),
      warrantyEnd: value(fields.warrantyEnd),
      cpu: type === "nas" ? value(fields.nasCpu) : pcLike(type) ? value(fields.pcCpu) : "",
      ram: type === "nas" ? value(fields.nasRam) : pcLike(type) ? value(fields.pcRam) : "",
      motherboard: pcLike(type) ? value(fields.motherboard) : "",
      vga: pcLike(type) ? value(fields.vga) : "",
      ssd: pcLike(type) ? value(fields.ssd) : "",
      hdd: pcLike(type) ? value(fields.hdd) : "",
      nic: type === "nas" ? value(fields.nasNic) : pcLike(type) ? value(fields.pcNic) : "",
      power: pcLike(type) ? value(fields.power) : "",
      os: type === "nas" ? value(fields.nasOs) : pcLike(type) ? value(fields.pcOs) : "",
      repairHistory: value(fields.repairHistory),
      memo: value(fields.memo),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    return Object.assign(data, getSpecializedFields(type));
  }

  function getSpecializedFields(type) {
    if (type === "laptop") {
      return {
        screenSize: value(fields.laptopScreenSize),
        batteryHealth: value(fields.batteryHealth),
      };
    }
    if (type === "monitor") {
      return {
        screenSize: value(fields.monitorScreenSize),
        resolution: value(fields.resolution),
        panelType: value(fields.panelType),
        ports: value(fields.ports),
        connectedAsset: value(fields.connectedAsset),
      };
    }
    if (type === "mfp") {
      return {
        printType: value(fields.printType),
        colorMode: value(fields.colorMode),
        connectionType: value(fields.connectionType),
        tonerModel: value(fields.tonerModel),
        printCounter: value(fields.printCounter),
        scanFax: value(fields.scanFax),
      };
    }
    if (type === "nas") {
      return {
        diskBays: value(fields.diskBays),
        storage: value(fields.storage),
        raid: value(fields.raid),
        backupTarget: value(fields.backupTarget),
        adminUrl: value(fields.adminUrl),
      };
    }
    return {};
  }

  async function addAsset() {
    const asset = assetFromForm();
    if (!asset) return;
    asset.id = makeId();
    assets.push(asset);
    if (await persist("자산을 등록했습니다.")) {
      clearForm(false);
    }
  }

  async function updateAsset() {
    if (!selectedId) {
      ui.showToast("수정할 자산을 목록에서 선택해 주세요.");
      return;
    }
    const asset = assetFromForm();
    if (!asset) return;
    const index = assets.findIndex((item) => item.id === selectedId);
    if (index === -1) {
      ui.showToast("선택한 자산을 찾지 못했습니다.");
      return;
    }
    assets[index] = asset;
    if (await persist("자산 정보를 수정했습니다.")) {
      clearForm(false);
    }
  }

  async function deleteSelectedAsset() {
    if (!selectedId) {
      ui.showToast("삭제할 자산을 선택해 주세요.");
      return;
    }
    const asset = assets.find((item) => item.id === selectedId);
    if (!asset) return;
    if (!(await ui.showConfirm(`'${asset.name}' 자산을 삭제할까요?`, { confirmText: "삭제" }))) {
      return;
    }
    assets = assets.filter((item) => item.id !== selectedId);
    selectedId = null;
    if (await persist("자산을 삭제했습니다.")) {
      clearForm(false);
      renderEmptyDetail();
    }
  }

  function clearForm(shouldRender = true) {
    selectedId = null;
    form?.reset();
    setValue(fields.type, "pc");
    setValue(fields.status, "사용중");
    updateAssetTypeFields();
    updateButtons();
    if (shouldRender) {
      renderAll();
    }
  }

  function selectAsset(id) {
    selectedId = id;
    const asset = assets.find((item) => item.id === id);
    if (!asset) return;
    renderDetail(asset);
    renderListPage();
    updateButtons();
  }

  function editAsset(asset) {
    fillForm(asset);
    openRegisterPage();
    ui.showToast("등록 화면에 선택한 자산 정보를 불러왔습니다.");
  }

  function fillForm(asset) {
    clearForm(false);
    selectedId = asset.id;
    const type = normalizeAssetType(asset.type);
    setValue(fields.type, type);
    setValue(fields.assetTag, asset.assetTag);
    setValue(fields.name, asset.name);
    setValue(fields.manufacturer, asset.manufacturer);
    setValue(fields.model, asset.model);
    setValue(fields.serialNumber, asset.serialNumber);
    setValue(fields.status, asset.status || "사용중");
    setValue(fields.department, asset.department);
    setValue(fields.owner, asset.owner);
    setValue(fields.location, asset.location);
    setValue(fields.ip, asset.ip);
    setValue(fields.purchaseDate, asset.purchaseDate);
    setValue(fields.purchaseAmount, asset.purchaseAmount);
    setValue(fields.evidence, asset.evidence);
    setValue(fields.warrantyEnd, asset.warrantyEnd);
    setValue(fields.repairHistory, asset.repairHistory);
    setValue(fields.memo, asset.memo);
    updateAssetTypeFields();

    if (type === "nas") {
      setValue(fields.nasCpu, asset.cpu);
      setValue(fields.nasRam, asset.ram);
      setValue(fields.nasNic, asset.nic);
      setValue(fields.nasOs, asset.os);
      setValue(fields.diskBays, asset.diskBays);
      setValue(fields.storage, asset.storage);
      setValue(fields.raid, asset.raid);
      setValue(fields.backupTarget, asset.backupTarget);
      setValue(fields.adminUrl, asset.adminUrl);
    } else if (pcLike(type)) {
      setValue(fields.pcCpu, asset.cpu);
      setValue(fields.pcRam, asset.ram);
      setValue(fields.motherboard, asset.motherboard);
      setValue(fields.vga, asset.vga);
      setValue(fields.ssd, asset.ssd);
      setValue(fields.hdd, asset.hdd);
      setValue(fields.pcNic, asset.nic);
      setValue(fields.power, asset.power);
      setValue(fields.pcOs, asset.os);
      setValue(fields.laptopScreenSize, type === "laptop" ? asset.screenSize : "");
      setValue(fields.batteryHealth, type === "laptop" ? asset.batteryHealth : "");
    } else if (type === "monitor") {
      setValue(fields.monitorScreenSize, asset.screenSize);
      setValue(fields.resolution, asset.resolution);
      setValue(fields.panelType, asset.panelType);
      setValue(fields.ports, asset.ports);
      setValue(fields.connectedAsset, asset.connectedAsset);
    } else if (type === "mfp") {
      setValue(fields.printType, asset.printType);
      setValue(fields.colorMode, asset.colorMode);
      setValue(fields.connectionType, asset.connectionType);
      setValue(fields.tonerModel, asset.tonerModel);
      setValue(fields.printCounter, asset.printCounter);
      setValue(fields.scanFax, asset.scanFax);
    }

    renderListPage();
    updateButtons();
  }

  function updateAssetTypeFields() {
    const type = normalizeAssetType(value(fields.type));
    for (const section of assetTypeSections) {
      section.element.hidden = !section.supported.includes(type);
    }
  }

  function renderAll() {
    updateDepartmentOptions();
    renderListPage();
    const selected = assets.find((item) => item.id === selectedId);
    if (selected) {
      renderDetail(selected);
    } else {
      renderEmptyDetail();
    }
    updateButtons();
  }

  function renderListPage() {
    const visible = getVisibleAssets();
    renderTable(visible);
    renderStats(visible);
    renderChart(visible);
  }

  function getVisibleAssets() {
    const keyword = value(searchInput).toLowerCase();
    const typeValue = value(typeFilter) || "all";
    const departmentValue = value(departmentFilter) || "all";
    const statusValue = value(statusFilter) || "all";

    return assets.filter((asset) => {
      if (typeValue !== "all" && normalizeAssetType(asset.type) !== typeValue) return false;
      if (departmentValue !== "all" && asset.department !== departmentValue) return false;
      if (statusValue !== "all" && asset.status !== statusValue) return false;
      if (!keyword) return true;
      return searchText(asset).includes(keyword);
    });
  }

  function renderTable(visible = getVisibleAssets()) {
    if (!tableBody || !tableWrap) return;
    const fragment = document.createDocumentFragment();

    for (const asset of visible) {
      const row = document.createElement("tr");
      row.dataset.id = asset.id;
      row.classList.toggle("selected", asset.id === selectedId);
      row.append(
        createCell(assetTypeLabel(asset.type)),
        createCell(asset.assetTag),
        createCell(asset.name),
        createCell(asset.department),
        createCell(asset.owner),
        createCell(asset.location),
        createCell(asset.ip),
        createCell(asset.status),
        createWarrantyCell(asset.warrantyEnd),
      );
      fragment.append(row);
    }

    tableBody.replaceChildren(fragment);
    tableWrap.classList.toggle("empty", visible.length === 0);
    if (countText) {
      countText.textContent = assets.length
        ? `전체 ${assets.length}건 중 ${visible.length}건을 표시합니다.`
        : "등록한 자산을 검색하고 관리합니다.";
    }
  }

  function renderStats(visible) {
    const totalAmount = visible.reduce((sum, asset) => sum + numberValue(asset.purchaseAmount), 0);
    const warrantySoon = visible.filter((asset) => {
      const days = daysUntil(asset.warrantyEnd);
      return days !== null && days <= 30;
    }).length;
    const departments = new Set(visible.map((asset) => asset.department).filter(Boolean));

    if (stats.total) stats.total.textContent = `${visible.length}대`;
    if (stats.amount) stats.amount.textContent = `${currencyFormatter.format(totalAmount)}원`;
    if (stats.warranty) stats.warranty.textContent = `${warrantySoon}대`;
    if (stats.department) stats.department.textContent = `${departments.size}곳`;
  }

  function renderChart(visible) {
    if (!chart) return;
    const counts = new Map(TYPE_ORDER.map((type) => [type, 0]));
    for (const asset of visible) {
      const type = normalizeAssetType(asset.type);
      counts.set(type, (counts.get(type) || 0) + 1);
    }
    const max = Math.max(1, ...counts.values());
    const fragment = document.createDocumentFragment();

    for (const type of TYPE_ORDER) {
      const count = counts.get(type) || 0;
      const row = document.createElement("div");
      row.className = "asset-chart-row";

      const label = document.createElement("span");
      label.className = "asset-chart-label";
      label.textContent = assetTypeLabel(type);

      const track = document.createElement("div");
      track.className = "asset-chart-track";
      const bar = document.createElement("span");
      bar.className = "asset-chart-bar";
      bar.style.width = `${Math.round((count / max) * 100)}%`;
      track.append(bar);

      const valueEl = document.createElement("span");
      valueEl.className = "asset-chart-value";
      valueEl.textContent = String(count);

      row.append(label, track, valueEl);
      fragment.append(row);
    }

    chart.replaceChildren(fragment);
    if (chartNote) {
      chartNote.textContent = visible.length ? "장비 종류별 보유 수" : "표시할 자산이 없습니다";
    }
  }

  function updateDepartmentOptions() {
    if (!departmentFilter) return;
    const current = departmentFilter.value || "all";
    const departments = [...new Set(assets.map((asset) => asset.department).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "ko-KR", { numeric: true }));
    const fragment = document.createDocumentFragment();
    fragment.append(option("all", "전체"));
    for (const department of departments) {
      fragment.append(option(department, department));
    }
    departmentFilter.replaceChildren(fragment);
    departmentFilter.value = departments.includes(current) ? current : "all";
  }

  function renderEmptyDetail() {
    if (!detailBody) return;
    const empty = document.createElement("p");
    empty.className = "asset-detail-empty";
    empty.textContent = "목록에서 자산을 선택하면 상세 정보가 표시됩니다.";
    detailBody.replaceChildren(empty);
  }

  function renderDetail(asset) {
    if (!detailBody) return;
    const card = document.createElement("div");
    card.className = "asset-detail-card";

    const head = document.createElement("div");
    head.className = "asset-detail-head";
    const title = document.createElement("strong");
    title.textContent = asset.name || "(장비명 없음)";
    const tag = document.createElement("span");
    tag.textContent = asset.assetTag ? `자산번호 ${asset.assetTag}` : "자산번호 없음";
    head.append(title, tag);
    card.append(head);

    const warranty = buildWarrantyBadge(asset.warrantyEnd);
    if (warranty) card.append(warranty);

    card.append(
      buildInfoGrid([
        ["종류", assetTypeLabel(asset.type)],
        ["상태", asset.status],
        ["제조사", asset.manufacturer],
        ["모델명", asset.model],
        ["시리얼", asset.serialNumber],
        ["IP", asset.ip],
        ["사용부서", asset.department],
        ["사용자", asset.owner],
        ["위치", asset.location],
        ["구입일", asset.purchaseDate],
        ["구입금액", asset.purchaseAmount ? `${currencyFormatter.format(numberValue(asset.purchaseAmount))}원` : ""],
        ["보증 만료", asset.warrantyEnd],
      ]),
    );

    appendSpecBlocks(card, asset);
    addBlockIfValue(card, "증빙서류", asset.evidence);
    addBlockIfValue(card, "수리이력", asset.repairHistory);
    addBlockIfValue(card, "메모", asset.memo);
    addBlockIfValue(card, "최종 수정", formatDateTime(asset.updatedAt));

    const actions = document.createElement("div");
    actions.className = "asset-detail-actions";
    if (pcLike(asset.type)) {
      const checkBtn = document.createElement("button");
      checkBtn.type = "button";
      checkBtn.textContent = "이 자산으로 통합 점검";
      checkBtn.addEventListener("click", () => startCheckForAsset(asset));
      actions.append(checkBtn);
    }
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "수정 화면으로 이동";
    editBtn.addEventListener("click", () => editAsset(asset));
    const pdfBtn = document.createElement("button");
    pdfBtn.type = "button";
    pdfBtn.textContent = "PDF 저장";
    pdfBtn.addEventListener("click", () => saveAssetPdf(asset));
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "danger-action";
    removeBtn.textContent = "삭제";
    removeBtn.addEventListener("click", deleteSelectedAsset);
    actions.append(editBtn, pdfBtn, removeBtn);
    card.append(actions);

    detailBody.replaceChildren(card);
  }

  function appendSpecBlocks(card, asset) {
    const type = normalizeAssetType(asset.type);
    if (pcLike(type)) {
      addBlockIfValue(card, "PC·노트북 사양", compactLines([
        ["CPU", asset.cpu],
        ["RAM", asset.ram],
        ["메인보드", asset.motherboard],
        ["그래픽카드", asset.vga],
        ["SSD", asset.ssd],
        ["HDD", asset.hdd],
        ["NIC", asset.nic],
        ["파워", asset.power],
        ["운영체제", asset.os],
        ["화면 크기", type === "laptop" ? asset.screenSize : ""],
        ["배터리 상태", type === "laptop" ? asset.batteryHealth : ""],
      ]));
      return;
    }
    if (type === "monitor") {
      addBlockIfValue(card, "모니터 정보", compactLines([
        ["화면 크기", asset.screenSize],
        ["해상도", asset.resolution],
        ["패널/주사율", asset.panelType],
        ["입력 포트", asset.ports],
        ["연결 PC", asset.connectedAsset],
      ]));
      return;
    }
    if (type === "mfp") {
      addBlockIfValue(card, "복합기 정보", compactLines([
        ["인쇄 방식", asset.printType],
        ["컬러 지원", asset.colorMode],
        ["연결 방식", asset.connectionType],
        ["토너/잉크 모델", asset.tonerModel],
        ["누적 매수", asset.printCounter],
        ["스캔/FAX", asset.scanFax],
      ]));
      return;
    }
    if (type === "nas") {
      addBlockIfValue(card, "NAS 정보", compactLines([
        ["CPU", asset.cpu],
        ["RAM", asset.ram],
        ["베이 수", asset.diskBays],
        ["저장장치 구성", asset.storage],
        ["RAID", asset.raid],
        ["NIC", asset.nic],
        ["운영체제", asset.os],
        ["백업 대상", asset.backupTarget],
        ["관리 주소", asset.adminUrl],
      ]));
    }
  }

  function buildWarrantyBadge(warrantyEnd) {
    if (!warrantyEnd) return null;
    const days = daysUntil(warrantyEnd);
    if (days === null) return null;
    const badge = document.createElement("span");
    badge.className = "admin-badge";
    if (days < 0) {
      badge.classList.add("bad");
      badge.textContent = `보증 만료 (${Math.abs(days)}일 지남 · ${warrantyEnd})`;
    } else if (days <= 30) {
      badge.classList.add("warn");
      badge.textContent = `보증 만료 ${days}일 전 (${warrantyEnd})`;
    } else {
      badge.classList.add("ok");
      badge.textContent = `보증 정상 (${days}일 남음 · ${warrantyEnd})`;
    }
    return badge;
  }

  function buildInfoGrid(pairs) {
    const grid = document.createElement("div");
    grid.className = "asset-detail-info";
    for (const [label, valueText] of pairs) {
      const cell = document.createElement("div");
      const span = document.createElement("span");
      span.textContent = label;
      const strong = document.createElement("strong");
      strong.textContent = valueText || "-";
      cell.append(span, strong);
      grid.append(cell);
    }
    return grid;
  }

  function addBlockIfValue(parent, label, valueText) {
    if (!valueText) return;
    parent.append(buildBlock(label, valueText));
  }

  function buildBlock(label, valueText) {
    const block = document.createElement("div");
    block.className = "asset-detail-block";
    const span = document.createElement("span");
    span.textContent = label;
    const p = document.createElement("p");
    p.textContent = valueText;
    block.append(span, p);
    return block;
  }

  function handleTableClick(event) {
    const row = event.target.closest("tr[data-id]");
    if (!row) return;
    selectAsset(row.dataset.id);
  }

  function createCell(valueText) {
    const cell = document.createElement("td");
    cell.textContent = valueText || "";
    return cell;
  }

  function createWarrantyCell(warrantyEnd) {
    const cell = createCell(warrantyEnd);
    const days = daysUntil(warrantyEnd);
    if (days === null) return cell;
    if (days < 0) {
      cell.classList.add("warranty-expired");
      cell.title = "보증 만료됨";
    } else if (days <= 30) {
      cell.classList.add("warranty-soon");
      cell.title = `보증 만료 ${days}일 전`;
    }
    return cell;
  }

  async function fillFromPc() {
    if (!fillBtn) return;
    fillBtn.disabled = true;
    ui.setBusy(fillBtn, true);
    const original = fillBtn.textContent;
    fillBtn.textContent = "불러오는 중...";
    try {
      const [hw, net] = await Promise.all([
        window.magicWand.system.hardware(),
        window.magicWand.network.scan(),
      ]);
      const primary = net.primaryInterface || (net.privateInterfaces || [])[0] || {};
      setValue(fields.type, "pc");
      updateAssetTypeFields();
      if (net.pcName && !value(fields.name)) setValue(fields.name, net.pcName);
      if (primary.privateIp && !value(fields.ip)) setValue(fields.ip, primary.privateIp);
      fillPcSpecFromHardware(hw.groups || []);
      ui.showToast("현재 PC 정보를 채웠습니다. 내용을 확인 후 등록하세요.");
    } catch (error) {
      ui.showToast(`PC 정보를 불러오지 못했습니다: ${error.message}`);
    } finally {
      fillBtn.disabled = false;
      ui.setBusy(fillBtn, false);
      fillBtn.textContent = original;
    }
  }

  function fillPcSpecFromHardware(groups) {
    const items = flattenHardwareItems(groups);
    setIfEmpty(fields.pcCpu, findHardwareValue(items, ["프로세서", "CPU"]));
    setIfEmpty(fields.pcRam, findHardwareValue(items, ["메모리", "RAM"]));
    setIfEmpty(fields.vga, findHardwareValue(items, ["그래픽", "GPU", "비디오"]));
    setIfEmpty(fields.pcOs, findHardwareValue(items, ["운영체제", "OS"]));
    const diskText = findHardwareValue(items, ["디스크", "SSD", "HDD", "저장"]);
    if (diskText && !value(fields.ssd) && !value(fields.hdd)) {
      setValue(fields.ssd, diskText);
    }
  }

  function flattenHardwareItems(groups) {
    const result = [];
    const visit = (item, groupTitle = "") => {
      const label = [groupTitle, item.label].filter(Boolean).join(" ");
      if (item.value) {
        result.push({ label, value: String(item.value) });
      }
      for (const child of item.children || []) {
        visit(child, groupTitle);
      }
    };
    for (const group of groups) {
      for (const item of group.items || []) {
        visit(item, group.title || "");
      }
    }
    return result;
  }

  function findHardwareValue(items, keywords) {
    const found = items.find((item) => keywords.some((keyword) => item.label.includes(keyword)));
    return found ? `${found.label.replace(/\s+/g, " ").trim()}: ${found.value}` : "";
  }

  function startCheckForAsset(asset) {
    document.querySelector("#integratedCheckMenu")?.click();
    const tagInput = document.querySelector("#icAssetTag");
    const customerInput = document.querySelector("#icCustomer");
    if (tagInput) tagInput.value = asset.assetTag || "";
    if (customerInput && !customerInput.value.trim()) {
      customerInput.value = asset.owner || asset.department || asset.location || "";
    }
    ui.showToast("통합 점검 화면에 자산 정보를 채웠습니다.");
  }

  function saveAssetPdf(asset) {
    const defaultFileName = ["자산 상세", asset.assetTag, asset.name].filter(Boolean).join("_");
    ui.exportPdf({ defaultFileName: defaultFileName || "자산 상세" });
  }

  function normalizeAsset(entry) {
    const type = normalizeAssetType(entry?.type);
    const normalized = {
      id: valueOf(entry?.id) || makeId(),
      type,
      assetTag: valueOf(entry?.assetTag),
      name: valueOf(entry?.name),
      manufacturer: valueOf(entry?.manufacturer),
      model: valueOf(entry?.model || entry?.spec),
      serialNumber: valueOf(entry?.serialNumber),
      status: valueOf(entry?.status) || "사용중",
      department: valueOf(entry?.department),
      owner: valueOf(entry?.owner),
      location: valueOf(entry?.location),
      ip: valueOf(entry?.ip),
      purchaseDate: valueOf(entry?.purchaseDate),
      purchaseAmount: valueOf(entry?.purchaseAmount),
      evidence: valueOf(entry?.evidence),
      warrantyEnd: valueOf(entry?.warrantyEnd),
      cpu: valueOf(entry?.cpu || (type === "pc" ? entry?.spec : "")),
      ram: valueOf(entry?.ram),
      motherboard: valueOf(entry?.motherboard),
      vga: valueOf(entry?.vga),
      ssd: valueOf(entry?.ssd),
      hdd: valueOf(entry?.hdd),
      nic: valueOf(entry?.nic),
      power: valueOf(entry?.power),
      os: valueOf(entry?.os),
      screenSize: valueOf(entry?.screenSize),
      resolution: valueOf(entry?.resolution),
      panelType: valueOf(entry?.panelType),
      ports: valueOf(entry?.ports),
      connectedAsset: valueOf(entry?.connectedAsset),
      batteryHealth: valueOf(entry?.batteryHealth),
      printType: valueOf(entry?.printType),
      colorMode: valueOf(entry?.colorMode),
      connectionType: valueOf(entry?.connectionType),
      tonerModel: valueOf(entry?.tonerModel),
      printCounter: valueOf(entry?.printCounter),
      scanFax: valueOf(entry?.scanFax),
      diskBays: valueOf(entry?.diskBays),
      storage: valueOf(entry?.storage),
      raid: valueOf(entry?.raid),
      backupTarget: valueOf(entry?.backupTarget),
      adminUrl: valueOf(entry?.adminUrl),
      repairHistory: valueOf(entry?.repairHistory),
      memo: valueOf(entry?.memo),
      createdAt: valueOf(entry?.createdAt),
      updatedAt: valueOf(entry?.updatedAt),
    };
    return normalized;
  }

  function searchText(asset) {
    return [
      assetTypeLabel(asset.type),
      asset.assetTag,
      asset.name,
      asset.manufacturer,
      asset.model,
      asset.serialNumber,
      asset.department,
      asset.owner,
      asset.location,
      asset.ip,
      asset.status,
      asset.cpu,
      asset.ram,
      asset.os,
      asset.memo,
    ]
      .join(" ")
      .toLowerCase();
  }

  function compactLines(pairs) {
    return pairs
      .filter(([, valueText]) => valueText)
      .map(([label, valueText]) => `${label}: ${valueText}`)
      .join("\n");
  }

  function option(valueText, label) {
    const opt = document.createElement("option");
    opt.value = valueText;
    opt.textContent = label;
    return opt;
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr);
    if (Number.isNaN(target.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
  }

  function updateButtons() {
    const hasSelection = selectedId !== null && assets.some((item) => item.id === selectedId);
    if (updateBtn) updateBtn.disabled = !hasSelection;
    if (deleteBtn) deleteBtn.disabled = !hasSelection;
  }

  function pcLike(type) {
    const normalized = normalizeAssetType(type);
    return normalized === "pc" || normalized === "laptop";
  }

  function normalizeAssetType(type) {
    const raw = valueOf(type);
    const mapped = LEGACY_TYPE_MAP[raw] || raw;
    return ASSET_TYPES[mapped] ? mapped : "pc";
  }

  function assetTypeLabel(type) {
    return ASSET_TYPES[normalizeAssetType(type)];
  }

  function makeId() {
    return `asset-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function value(element) {
    return element?.value?.trim() || "";
  }

  function valueOf(raw) {
    return String(raw ?? "").trim();
  }

  function setValue(element, raw) {
    if (element) element.value = raw || "";
  }

  function setIfEmpty(element, raw) {
    if (element && raw && !value(element)) {
      element.value = raw;
    }
  }

  function numberValue(raw) {
    const number = Number(String(raw || "").replace(/,/g, ""));
    return Number.isFinite(number) ? number : 0;
  }

  function formatDateTime(iso) {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ko-KR");
  }

  function debounce(fn, delay) {
    let timer = null;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), delay);
    };
  }
})();
