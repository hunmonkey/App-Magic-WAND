(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#adminWorkMenu");
  if (!menu || !ui) return;

  const api = window.magicWand.adminWork;
  const tabs = document.querySelectorAll(".admin-tab-button");
  const panels = document.querySelectorAll(".admin-tab-panel");
  const statOpen = document.querySelector("#adminStatOpen");
  const statDue = document.querySelector("#adminStatDue");
  const statSupply = document.querySelector("#adminStatSupply");
  const statContract = document.querySelector("#adminStatContract");
  const statPurchase = document.querySelector("#adminStatPurchase");
  const statVendor = document.querySelector("#adminStatVendor");

  const dashUrgentList = document.querySelector("#adminDashUrgentList");
  const dashStockList = document.querySelector("#adminDashStockList");
  const dashPurchaseList = document.querySelector("#adminDashPurchaseList");
  const dashContractList = document.querySelector("#adminDashContractList");

  const requestForm = document.querySelector("#adminRequestForm");
  const requestDeleteBtn = document.querySelector("#adminRequestDeleteBtn");
  const requestClearBtn = document.querySelector("#adminRequestClearBtn");
  const requestBody = document.querySelector("#adminRequestBody");
  const requestWrap = document.querySelector("#adminRequestWrap");

  const checklistForm = document.querySelector("#adminChecklistForm");
  const checklistTemplate = document.querySelector("#adminChecklistTemplate");
  const checklistList = document.querySelector("#adminChecklistList");

  const vendorForm = document.querySelector("#adminVendorForm");
  const vendorDeleteBtn = document.querySelector("#adminVendorDeleteBtn");
  const vendorClearBtn = document.querySelector("#adminVendorClearBtn");
  const vendorBody = document.querySelector("#adminVendorBody");
  const vendorWrap = document.querySelector("#adminVendorWrap");

  const supplyForm = document.querySelector("#adminSupplyForm");
  const supplyDeleteBtn = document.querySelector("#adminSupplyDeleteBtn");
  const supplyClearBtn = document.querySelector("#adminSupplyClearBtn");
  const supplyBody = document.querySelector("#adminSupplyBody");
  const supplyWrap = document.querySelector("#adminSupplyWrap");
  const supplyLogForm = document.querySelector("#adminSupplyLogForm");
  const supplyLogBody = document.querySelector("#adminSupplyLogBody");
  const supplyLogWrap = document.querySelector("#adminSupplyLogWrap");

  const purchaseForm = document.querySelector("#adminPurchaseForm");
  const purchaseDeleteBtn = document.querySelector("#adminPurchaseDeleteBtn");
  const purchaseClearBtn = document.querySelector("#adminPurchaseClearBtn");
  const purchaseBody = document.querySelector("#adminPurchaseBody");
  const purchaseWrap = document.querySelector("#adminPurchaseWrap");

  const contractForm = document.querySelector("#adminContractForm");
  const contractDeleteBtn = document.querySelector("#adminContractDeleteBtn");
  const contractClearBtn = document.querySelector("#adminContractClearBtn");
  const contractBody = document.querySelector("#adminContractBody");
  const contractWrap = document.querySelector("#adminContractWrap");

  const noteForm = document.querySelector("#adminNoteForm");
  const noteDeleteBtn = document.querySelector("#adminNoteDeleteBtn");
  const noteClearBtn = document.querySelector("#adminNoteClearBtn");
  const noteList = document.querySelector("#adminNoteList");

  const documentForm = document.querySelector("#adminDocumentForm");
  const documentOutput = document.querySelector("#adminDocumentOutput");
  const documentCopyBtn = document.querySelector("#adminDocumentCopyBtn");

  const templates = {
    newPc: ["자산번호 확인", "PC 사양 점검", "기본 프로그램 설치", "프린터/공유폴더 연결", "사용자 인수 서명"],
    returnPc: ["사용자 자료 백업", "계정 로그아웃 확인", "저장장치 점검", "관리자 보관 위치 기록", "반납 확인서 작성"],
    printer: ["프린터 IP 확인", "드라이버 설치", "테스트 인쇄", "기본 프린터 설정", "사용자 안내"],
    share: ["요청 권한 확인", "공유폴더 생성", "접근 권한 적용", "접속 테스트", "처리 결과 기록"],
  };

  let state = emptyState();
  let loaded = false;
  let selected = { request: "", vendor: "", supply: "", purchase: "", contract: "", note: "" };

  menu.addEventListener("click", () => {
    ui.switchPage("#adminWorkPage", menu);
    if (!loaded) {
      loaded = true;
      loadState();
    }
  });

  tabs.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.adminTab));
  });

  requestForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveRequest();
  });
  requestDeleteBtn.addEventListener("click", deleteRequest);
  requestClearBtn.addEventListener("click", clearRequestForm);

  checklistForm.addEventListener("submit", (event) => {
    event.preventDefault();
    createChecklist();
  });

  vendorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveVendor();
  });
  vendorDeleteBtn.addEventListener("click", deleteVendor);
  vendorClearBtn.addEventListener("click", clearVendorForm);

  supplyForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSupply();
  });
  supplyDeleteBtn.addEventListener("click", deleteSupply);
  supplyClearBtn.addEventListener("click", clearSupplyForm);
  supplyLogForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSupplyLog();
  });

  purchaseForm.addEventListener("submit", (event) => {
    event.preventDefault();
    savePurchase();
  });
  purchaseDeleteBtn.addEventListener("click", deletePurchase);
  purchaseClearBtn.addEventListener("click", clearPurchaseForm);

  contractForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveContract();
  });
  contractDeleteBtn.addEventListener("click", deleteContract);
  contractClearBtn.addEventListener("click", clearContractForm);

  noteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveNote();
  });
  noteDeleteBtn.addEventListener("click", deleteNote);
  noteClearBtn.addEventListener("click", clearNoteForm);

  documentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    generateDocument();
  });
  documentCopyBtn.addEventListener("click", copyDocument);

  resetSupplyLogForm();

  async function loadState() {
    try {
      state = normalizeState(await api.load());
      renderAll();
    } catch (error) {
      ui.showToast(`행정 업무 데이터를 불러오지 못했습니다: ${error.message}`);
    }
  }

  async function persist(message) {
    try {
      state = normalizeState(await api.save(state));
      renderAll();
      if (message) ui.showToast(message);
    } catch (error) {
      ui.showToast(`저장 실패: ${error.message}`);
    }
  }

  function switchTab(tabName) {
    tabs.forEach((button) => button.classList.toggle("active", button.dataset.adminTab === tabName));
    panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.adminPanel === tabName));
  }

  function renderAll() {
    refreshMasterSelects();
    renderStats();
    renderDashboard();
    renderRequests();
    renderChecklists();
    renderVendors();
    renderSupplies();
    renderSupplyLogs();
    renderPurchases();
    renderContracts();
    renderNotes();
  }

  function renderStats() {
    const today = startOfToday();
    statOpen.textContent = String(state.requests.filter((item) => item.status !== "완료").length);
    statDue.textContent = String(state.requests.filter((item) => item.status !== "완료" && isDue(item.dueDate, today)).length);
    statSupply.textContent = String(state.supplies.filter((item) => item.quantity <= item.minQuantity).length);
    statContract.textContent = String(state.contracts.filter((item) => {
      const days = daysUntil(item.expireDate);
      return days !== null && days <= 30;
    }).length);
    statPurchase.textContent = String(state.purchases.filter((item) => !["입고 완료", "반려"].includes(item.status)).length);
    statVendor.textContent = String(state.vendors.filter((item) => item.active !== false).length);
  }

  function renderDashboard() {
    renderDashboardList(
      dashUrgentList,
      state.requests
        .filter((item) => item.status !== "완료")
        .sort((a, b) => statusRank(a.priority) - statusRank(b.priority) || compareDate(a.dueDate, b.dueDate))
        .slice(0, 6),
      "처리할 요청이 없습니다.",
      (item) => `${item.title} · ${item.status}${item.dueDate ? ` · ${item.dueDate}` : ""}`,
    );
    renderDashboardList(
      dashStockList,
      state.supplies
        .filter((item) => item.quantity <= item.minQuantity)
        .sort((a, b) => a.quantity - b.quantity)
        .slice(0, 6),
      "부족한 비품이 없습니다.",
      (item) => `${item.name} · ${item.quantity}${item.unit || "개"} / 최소 ${item.minQuantity}${item.unit || "개"}`,
    );
    renderDashboardList(
      dashPurchaseList,
      state.purchases
        .filter((item) => !["입고 완료", "반려"].includes(item.status))
        .sort((a, b) => purchaseRank(a.status) - purchaseRank(b.status) || compareDate(a.neededDate, b.neededDate))
        .slice(0, 6),
      "진행 중인 구매가 없습니다.",
      (item) => `${item.title || item.itemName} · ${item.status}${item.neededDate ? ` · ${item.neededDate}` : ""}`,
    );
    renderDashboardList(
      dashContractList,
      state.contracts
        .filter((item) => daysUntil(item.expireDate) !== null && daysUntil(item.expireDate) <= 60)
        .sort((a, b) => compareDate(a.expireDate, b.expireDate))
        .slice(0, 6),
      "만료 임박 계약이 없습니다.",
      (item) => `${item.name} · ${item.expireDate || "-"}${item.autoRenew ? " · 자동연장" : ""}`,
    );
  }

  function renderDashboardList(container, items, emptyText, labeler) {
    container.innerHTML = "";
    if (!items.length) {
      container.append(empty(emptyText));
      return;
    }
    for (const item of items) {
      const row = document.createElement("p");
      row.textContent = labeler(item);
      container.append(row);
    }
  }

  function refreshMasterSelects() {
    const vendors = [...state.vendors].sort((a, b) => a.name.localeCompare(b.name, "ko"));
    [
      "#adminSupplyVendor",
      "#adminSupplyLogVendor",
      "#adminPurchaseSelectedVendor",
      "#adminPurchaseQuoteVendor1",
      "#adminPurchaseQuoteVendor2",
      "#adminPurchaseQuoteVendor3",
    ].forEach((selector) => fillSelect(selector, vendors, "거래처 선택", (item) => item.name));

    const supplies = [...state.supplies].sort((a, b) => a.name.localeCompare(b.name, "ko"));
    ["#adminSupplyLogSupply", "#adminPurchaseSupply"].forEach((selector) => {
      fillSelect(selector, supplies, "비품 선택", (item) => [item.code, item.name].filter(Boolean).join(" · "));
    });
  }

  function fillSelect(selector, items, emptyLabel, labeler) {
    const select = document.querySelector(selector);
    if (!select) return;
    const current = select.value;
    select.innerHTML = "";
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = emptyLabel;
    select.append(emptyOption);
    for (const item of items) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = labeler(item);
      select.append(option);
    }
    select.value = current;
  }

  function saveRequest() {
    const title = value("#adminRequestTitle");
    if (!title) return ui.showToast("요청 제목을 입력해 주세요.");

    const item = {
      id: selected.request || makeId("req"),
      title,
      requester: value("#adminRequestRequester"),
      type: value("#adminRequestType"),
      priority: value("#adminRequestPriority"),
      status: value("#adminRequestStatus"),
      dueDate: value("#adminRequestDue"),
      detail: value("#adminRequestDetail"),
      result: value("#adminRequestResult"),
      updatedAt: new Date().toISOString(),
    };
    upsert(state.requests, item);
    selected.request = "";
    requestForm.reset();
    requestDeleteBtn.disabled = true;
    persist("요청을 저장했습니다.");
  }

  async function deleteRequest() {
    const item = state.requests.find((entry) => entry.id === selected.request);
    if (!item) return;
    if (!(await ui.showConfirm(`'${item.title}' 요청을 삭제할까요?`, { confirmText: "삭제" }))) return;
    state.requests = state.requests.filter((entry) => entry.id !== selected.request);
    clearRequestForm();
    persist("요청을 삭제했습니다.");
  }

  function clearRequestForm() {
    selected.request = "";
    requestForm.reset();
    requestDeleteBtn.disabled = true;
    renderRequests();
  }

  function selectRequest(id) {
    const item = state.requests.find((entry) => entry.id === id);
    if (!item) return;
    selected.request = id;
    setValue("#adminRequestTitle", item.title);
    setValue("#adminRequestRequester", item.requester);
    setValue("#adminRequestType", item.type);
    setValue("#adminRequestPriority", item.priority);
    setValue("#adminRequestStatus", item.status);
    setValue("#adminRequestDue", item.dueDate);
    setValue("#adminRequestDetail", item.detail);
    setValue("#adminRequestResult", item.result);
    requestDeleteBtn.disabled = false;
    renderRequests();
  }

  function renderRequests() {
    const items = [...state.requests].sort((a, b) => statusRank(a.status) - statusRank(b.status) || compareDate(a.dueDate, b.dueDate));
    requestBody.innerHTML = "";
    for (const item of items) {
      const row = document.createElement("tr");
      row.classList.toggle("selected", item.id === selected.request);
      row.append(
        cell(item.title),
        cell([item.requester, item.type].filter(Boolean).join("\n")),
        badgeCell(item.status),
        badgeCell(item.priority),
        dueCell(item.dueDate),
      );
      row.addEventListener("click", () => selectRequest(item.id));
      requestBody.append(row);
    }
    requestWrap.classList.toggle("empty", items.length === 0);
  }

  function createChecklist() {
    const title = value("#adminChecklistTitle") || checklistTemplate.selectedOptions[0]?.textContent || "업무 체크리스트";
    const template = checklistTemplate.value;
    state.checklists.unshift({
      id: makeId("chk"),
      title,
      owner: value("#adminChecklistOwner"),
      dueDate: value("#adminChecklistDue"),
      status: "진행 중",
      tasks: (templates[template] || templates.newPc).map((label) => ({ label, done: false })),
      updatedAt: new Date().toISOString(),
    });
    checklistForm.reset();
    persist("체크리스트를 만들었습니다.");
  }

  function renderChecklists() {
    checklistList.innerHTML = "";
    if (!state.checklists.length) {
      checklistList.append(empty("아직 체크리스트가 없습니다."));
      return;
    }

    for (const item of state.checklists) {
      const box = document.createElement("section");
      box.className = "admin-checklist-item";
      const done = item.tasks.filter((task) => task.done).length;
      const total = item.tasks.length || 1;

      const head = document.createElement("div");
      head.className = "admin-checklist-head";
      const title = document.createElement("strong");
      title.textContent = item.title;
      const meta = document.createElement("span");
      meta.textContent = `${done}/${total} 완료${item.owner ? ` · ${item.owner}` : ""}${item.dueDate ? ` · ${item.dueDate}` : ""}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "삭제";
      remove.addEventListener("click", () => removeChecklist(item.id));
      head.append(title, meta, remove);

      const list = document.createElement("div");
      list.className = "admin-check-items";
      item.tasks.forEach((task, index) => {
        const label = document.createElement("label");
        label.className = "admin-check-row";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = task.done;
        input.addEventListener("change", () => toggleChecklistTask(item.id, index, input.checked));
        const span = document.createElement("span");
        span.textContent = task.label;
        label.append(input, span);
        list.append(label);
      });

      box.append(head, list);
      checklistList.append(box);
    }
  }

  async function removeChecklist(id) {
    const item = state.checklists.find((entry) => entry.id === id);
    if (!item) return;
    if (!(await ui.showConfirm(`'${item.title}' 체크리스트를 삭제할까요?`, { confirmText: "삭제" }))) return;
    state.checklists = state.checklists.filter((entry) => entry.id !== id);
    persist("체크리스트를 삭제했습니다.");
  }

  function toggleChecklistTask(id, index, done) {
    const item = state.checklists.find((entry) => entry.id === id);
    if (!item || !item.tasks[index]) return;
    item.tasks[index].done = done;
    item.status = item.tasks.every((task) => task.done) ? "완료" : "진행 중";
    item.updatedAt = new Date().toISOString();
    persist("");
  }

  function saveVendor() {
    const name = value("#adminVendorName");
    if (!name) return ui.showToast("거래처명을 입력해 주세요.");
    const item = {
      id: selected.vendor || makeId("ven"),
      name,
      businessNumber: value("#adminVendorBusinessNumber"),
      contactName: value("#adminVendorContact"),
      phone: value("#adminVendorPhone"),
      items: value("#adminVendorItems"),
      rating: value("#adminVendorRating"),
      recentDate: value("#adminVendorRecentDate"),
      memo: value("#adminVendorMemo"),
      active: value("#adminVendorActive") !== "false",
      updatedAt: new Date().toISOString(),
    };
    upsert(state.vendors, item);
    clearVendorForm(false);
    persist("거래처를 저장했습니다.");
  }

  async function deleteVendor() {
    const item = state.vendors.find((entry) => entry.id === selected.vendor);
    if (!item) return;
    if (!(await ui.showConfirm(`'${item.name}' 거래처를 삭제할까요?`, { confirmText: "삭제" }))) return;
    state.vendors = state.vendors.filter((entry) => entry.id !== selected.vendor);
    clearVendorForm(false);
    persist("거래처를 삭제했습니다.");
  }

  function clearVendorForm(render = true) {
    selected.vendor = "";
    vendorForm.reset();
    vendorDeleteBtn.disabled = true;
    if (render) renderVendors();
  }

  function selectVendor(id) {
    const item = state.vendors.find((entry) => entry.id === id);
    if (!item) return;
    selected.vendor = id;
    setValue("#adminVendorName", item.name);
    setValue("#adminVendorBusinessNumber", item.businessNumber);
    setValue("#adminVendorContact", item.contactName);
    setValue("#adminVendorPhone", item.phone);
    setValue("#adminVendorItems", item.items);
    setValue("#adminVendorRating", item.rating);
    setValue("#adminVendorRecentDate", item.recentDate);
    setValue("#adminVendorMemo", item.memo);
    setValue("#adminVendorActive", item.active === false ? "false" : "true");
    vendorDeleteBtn.disabled = false;
    renderVendors();
  }

  function renderVendors() {
    const items = [...state.vendors].sort((a, b) => Number(a.active === false) - Number(b.active === false) || a.name.localeCompare(b.name, "ko"));
    vendorBody.innerHTML = "";
    for (const item of items) {
      const row = document.createElement("tr");
      row.classList.toggle("selected", item.id === selected.vendor);
      row.append(
        cell(item.name),
        cell([item.contactName, item.phone].filter(Boolean).join("\n")),
        cell(item.items),
        badgeCell(item.rating),
        cell(item.recentDate || ""),
        badgeCell(item.active === false ? "중지" : "사용"),
      );
      row.addEventListener("click", () => selectVendor(item.id));
      vendorBody.append(row);
    }
    vendorWrap.classList.toggle("empty", items.length === 0);
  }

  function saveSupply() {
    const name = value("#adminSupplyName");
    if (!name) return ui.showToast("비품명을 입력해 주세요.");
    const item = {
      id: selected.supply || makeId("sup"),
      code: value("#adminSupplyCode"),
      name,
      category: value("#adminSupplyCategory"),
      unit: value("#adminSupplyUnit") || "개",
      unitPrice: Number(value("#adminSupplyUnitPrice")) || 0,
      vendorId: value("#adminSupplyVendor"),
      quantity: Number(value("#adminSupplyQty")) || 0,
      minQuantity: Number(value("#adminSupplyMin")) || 0,
      location: value("#adminSupplyLocation"),
      memo: value("#adminSupplyMemo"),
      updatedAt: new Date().toISOString(),
    };
    upsert(state.supplies, item);
    clearSupplyForm(false);
    persist("비품 정보를 저장했습니다.");
  }

  async function deleteSupply() {
    const item = state.supplies.find((entry) => entry.id === selected.supply);
    if (!item) return;
    if (!(await ui.showConfirm(`'${item.name}' 항목을 삭제할까요? 연결된 수불 이력도 함께 정리됩니다.`, { confirmText: "삭제" }))) return;
    state.supplies = state.supplies.filter((entry) => entry.id !== selected.supply);
    state.supplyLogs = state.supplyLogs.filter((entry) => entry.supplyId !== selected.supply);
    clearSupplyForm(false);
    persist("비품 항목을 삭제했습니다.");
  }

  function clearSupplyForm(render = true) {
    selected.supply = "";
    supplyForm.reset();
    document.querySelector("#adminSupplyQty").value = "0";
    document.querySelector("#adminSupplyMin").value = "0";
    supplyDeleteBtn.disabled = true;
    if (render) renderSupplies();
  }

  function selectSupply(id) {
    const item = state.supplies.find((entry) => entry.id === id);
    if (!item) return;
    selected.supply = id;
    setValue("#adminSupplyCode", item.code);
    setValue("#adminSupplyName", item.name);
    setValue("#adminSupplyCategory", item.category);
    setValue("#adminSupplyUnit", item.unit || "개");
    setValue("#adminSupplyUnitPrice", item.unitPrice || 0);
    setValue("#adminSupplyVendor", item.vendorId);
    setValue("#adminSupplyQty", item.quantity);
    setValue("#adminSupplyMin", item.minQuantity);
    setValue("#adminSupplyLocation", item.location);
    setValue("#adminSupplyMemo", item.memo);
    supplyDeleteBtn.disabled = false;
    renderSupplies();
  }

  function renderSupplies() {
    const items = [...state.supplies].sort((a, b) => Number(a.quantity > a.minQuantity) - Number(b.quantity > b.minQuantity) || a.name.localeCompare(b.name, "ko"));
    supplyBody.innerHTML = "";
    for (const item of items) {
      const row = document.createElement("tr");
      row.classList.toggle("selected", item.id === selected.supply);
      row.append(
        cell([item.code, item.name].filter(Boolean).join("\n")),
        cell(item.category),
        stockCell(item),
        cell([vendorName(item.vendorId), item.location].filter(Boolean).join("\n")),
        cell(money(item.unitPrice)),
      );
      row.addEventListener("click", () => selectSupply(item.id));
      supplyBody.append(row);
    }
    supplyWrap.classList.toggle("empty", items.length === 0);
  }

  function saveSupplyLog() {
    const supplyId = value("#adminSupplyLogSupply");
    const supply = state.supplies.find((item) => item.id === supplyId);
    if (!supply) return ui.showToast("입출고할 비품을 선택해 주세요.");
    const quantity = Number(value("#adminSupplyLogQty")) || 0;
    if (quantity <= 0) return ui.showToast("수량을 1 이상 입력해 주세요.");
    const type = value("#adminSupplyLogType");
    if (type === "out" && supply.quantity < quantity) {
      return ui.showToast("현재 수량보다 많이 출고할 수 없습니다.");
    }

    supply.quantity = type === "in" ? supply.quantity + quantity : supply.quantity - quantity;
    supply.updatedAt = new Date().toISOString();
    state.supplyLogs.unshift({
      id: makeId("slog"),
      supplyId,
      date: value("#adminSupplyLogDate") || todayValue(),
      type,
      quantity,
      reason: value("#adminSupplyLogReason"),
      handler: value("#adminSupplyLogHandler"),
      vendorId: value("#adminSupplyLogVendor"),
      purchaseId: "",
      unitCost: Number(value("#adminSupplyLogUnitCost")) || 0,
      memo: value("#adminSupplyLogMemo"),
      createdAt: new Date().toISOString(),
    });
    resetSupplyLogForm();
    persist(type === "in" ? "입고 이력을 저장했습니다." : "출고 이력을 저장했습니다.");
  }

  function resetSupplyLogForm() {
    supplyLogForm.reset();
    setValue("#adminSupplyLogDate", todayValue());
    setValue("#adminSupplyLogQty", "1");
  }

  function renderSupplyLogs() {
    const items = [...state.supplyLogs].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 120);
    supplyLogBody.innerHTML = "";
    for (const item of items) {
      const row = document.createElement("tr");
      const supply = supplyById(item.supplyId);
      row.append(
        cell(item.date),
        cell(supply ? supply.name : "삭제된 비품"),
        badgeCell(item.type === "in" ? "입고" : "출고"),
        cell(`${item.quantity}${supply?.unit || "개"}`),
        cell([item.reason, item.handler].filter(Boolean).join("\n")),
        cell([vendorName(item.vendorId), item.memo].filter(Boolean).join("\n")),
      );
      supplyLogBody.append(row);
    }
    supplyLogWrap.classList.toggle("empty", items.length === 0);
  }

  function savePurchase() {
    const title = value("#adminPurchaseTitle");
    const itemName = value("#adminPurchaseItemName");
    if (!title && !itemName) return ui.showToast("구매 제목이나 품목명을 입력해 주세요.");

    const existing = state.purchases.find((entry) => entry.id === selected.purchase);
    const item = {
      id: selected.purchase || makeId("pur"),
      title: title || itemName,
      requester: value("#adminPurchaseRequester"),
      itemName,
      quantity: Number(value("#adminPurchaseQty")) || 1,
      unit: value("#adminPurchaseUnit") || "개",
      neededDate: value("#adminPurchaseNeededDate"),
      status: value("#adminPurchaseStatus"),
      linkedSupplyId: value("#adminPurchaseSupply"),
      selectedVendorId: value("#adminPurchaseSelectedVendor"),
      reason: value("#adminPurchaseReason"),
      quotes: readPurchaseQuotes(),
      stockApplied: existing?.stockApplied === true,
      updatedAt: new Date().toISOString(),
    };

    if (item.status === "입고 완료" && item.linkedSupplyId && !item.stockApplied) {
      applyPurchaseStock(item);
      item.stockApplied = true;
    }

    upsert(state.purchases, item);
    clearPurchaseForm(false);
    persist("구매 진행 정보를 저장했습니다.");
  }

  function applyPurchaseStock(item) {
    const supply = state.supplies.find((entry) => entry.id === item.linkedSupplyId);
    if (!supply) return;
    supply.quantity += item.quantity;
    supply.updatedAt = new Date().toISOString();
    state.supplyLogs.unshift({
      id: makeId("slog"),
      supplyId: supply.id,
      date: todayValue(),
      type: "in",
      quantity: item.quantity,
      reason: "구매 입고",
      handler: item.requester,
      vendorId: item.selectedVendorId,
      purchaseId: item.id,
      unitCost: bestQuote(item)?.amount || supply.unitPrice || 0,
      memo: item.title,
      createdAt: new Date().toISOString(),
    });
  }

  async function deletePurchase() {
    const item = state.purchases.find((entry) => entry.id === selected.purchase);
    if (!item) return;
    if (!(await ui.showConfirm(`'${item.title}' 구매 건을 삭제할까요?`, { confirmText: "삭제" }))) return;
    state.purchases = state.purchases.filter((entry) => entry.id !== selected.purchase);
    clearPurchaseForm(false);
    persist("구매 건을 삭제했습니다.");
  }

  function clearPurchaseForm(render = true) {
    selected.purchase = "";
    purchaseForm.reset();
    setValue("#adminPurchaseQty", "1");
    purchaseDeleteBtn.disabled = true;
    if (render) renderPurchases();
  }

  function selectPurchase(id) {
    const item = state.purchases.find((entry) => entry.id === id);
    if (!item) return;
    selected.purchase = id;
    setValue("#adminPurchaseTitle", item.title);
    setValue("#adminPurchaseRequester", item.requester);
    setValue("#adminPurchaseItemName", item.itemName);
    setValue("#adminPurchaseQty", item.quantity || 1);
    setValue("#adminPurchaseUnit", item.unit || "개");
    setValue("#adminPurchaseNeededDate", item.neededDate);
    setValue("#adminPurchaseStatus", item.status);
    setValue("#adminPurchaseSupply", item.linkedSupplyId);
    setValue("#adminPurchaseSelectedVendor", item.selectedVendorId);
    setValue("#adminPurchaseReason", item.reason);
    [0, 1, 2].forEach((index) => fillQuote(index + 1, item.quotes?.[index] || {}));
    purchaseDeleteBtn.disabled = false;
    renderPurchases();
  }

  function readPurchaseQuotes() {
    return [1, 2, 3].map((index) => ({
      vendorId: value(`#adminPurchaseQuoteVendor${index}`),
      amount: Number(value(`#adminPurchaseQuoteAmount${index}`)) || 0,
      days: Number(value(`#adminPurchaseQuoteDays${index}`)) || 0,
      note: value(`#adminPurchaseQuoteNote${index}`),
    })).filter((quote) => quote.vendorId || quote.amount || quote.note);
  }

  function fillQuote(index, quote) {
    setValue(`#adminPurchaseQuoteVendor${index}`, quote.vendorId || "");
    setValue(`#adminPurchaseQuoteAmount${index}`, quote.amount || "");
    setValue(`#adminPurchaseQuoteDays${index}`, quote.days || "");
    setValue(`#adminPurchaseQuoteNote${index}`, quote.note || "");
  }

  function renderPurchases() {
    const items = [...state.purchases].sort((a, b) => purchaseRank(a.status) - purchaseRank(b.status) || compareDate(a.neededDate, b.neededDate));
    purchaseBody.innerHTML = "";
    for (const item of items) {
      const row = document.createElement("tr");
      const quote = bestQuote(item);
      row.classList.toggle("selected", item.id === selected.purchase);
      row.append(
        cell([item.title, item.itemName].filter(Boolean).join("\n")),
        cell(`${item.quantity || 1}${item.unit || "개"}${item.requester ? `\n${item.requester}` : ""}`),
        badgeCell(item.status),
        cell(quote ? `${vendorName(quote.vendorId)}\n${money(quote.amount)}` : vendorName(item.selectedVendorId)),
        dueCell(item.neededDate),
      );
      row.addEventListener("click", () => selectPurchase(item.id));
      purchaseBody.append(row);
    }
    purchaseWrap.classList.toggle("empty", items.length === 0);
  }

  function saveContract() {
    const name = value("#adminContractName");
    if (!name) return ui.showToast("계약명을 입력해 주세요.");
    const item = {
      id: selected.contract || makeId("ctr"),
      name,
      vendor: value("#adminContractVendor"),
      type: value("#adminContractType"),
      startDate: value("#adminContractStart"),
      expireDate: value("#adminContractExpire"),
      owner: value("#adminContractOwner"),
      amount: value("#adminContractAmount"),
      autoRenew: document.querySelector("#adminContractAutoRenew").checked,
      filePath: value("#adminContractFilePath"),
      memo: value("#adminContractMemo"),
      updatedAt: new Date().toISOString(),
    };
    upsert(state.contracts, item);
    clearContractForm(false);
    persist("계약 정보를 저장했습니다.");
  }

  async function deleteContract() {
    const item = state.contracts.find((entry) => entry.id === selected.contract);
    if (!item) return;
    if (!(await ui.showConfirm(`'${item.name}' 계약을 삭제할까요?`, { confirmText: "삭제" }))) return;
    state.contracts = state.contracts.filter((entry) => entry.id !== selected.contract);
    clearContractForm(false);
    persist("계약 정보를 삭제했습니다.");
  }

  function clearContractForm(render = true) {
    selected.contract = "";
    contractForm.reset();
    contractDeleteBtn.disabled = true;
    if (render) renderContracts();
  }

  function selectContract(id) {
    const item = state.contracts.find((entry) => entry.id === id);
    if (!item) return;
    selected.contract = id;
    setValue("#adminContractName", item.name);
    setValue("#adminContractVendor", item.vendor);
    setValue("#adminContractType", item.type);
    setValue("#adminContractStart", item.startDate);
    setValue("#adminContractExpire", item.expireDate);
    setValue("#adminContractOwner", item.owner);
    setValue("#adminContractAmount", item.amount);
    document.querySelector("#adminContractAutoRenew").checked = item.autoRenew === true;
    setValue("#adminContractFilePath", item.filePath);
    setValue("#adminContractMemo", item.memo);
    contractDeleteBtn.disabled = false;
    renderContracts();
  }

  function renderContracts() {
    const items = [...state.contracts].sort((a, b) => compareDate(a.expireDate, b.expireDate));
    contractBody.innerHTML = "";
    for (const item of items) {
      const row = document.createElement("tr");
      row.classList.toggle("selected", item.id === selected.contract);
      row.append(
        cell(item.name),
        cell([item.vendor, item.type].filter(Boolean).join("\n")),
        dueCell(item.expireDate),
        cell([item.owner, item.autoRenew ? "자동연장" : ""].filter(Boolean).join("\n")),
        cell([item.amount, item.filePath, item.memo].filter(Boolean).join("\n")),
      );
      row.addEventListener("click", () => selectContract(item.id));
      contractBody.append(row);
    }
    contractWrap.classList.toggle("empty", items.length === 0);
  }

  function saveNote() {
    const title = value("#adminNoteTitle");
    const body = value("#adminNoteBody");
    if (!title && !body) return ui.showToast("메모 제목이나 내용을 입력해 주세요.");
    const item = {
      id: selected.note || makeId("note"),
      title: title || "빠른 메모",
      relatedTo: value("#adminNoteRelated"),
      body,
      updatedAt: new Date().toISOString(),
    };
    upsert(state.notes, item);
    clearNoteForm(false);
    persist("메모를 저장했습니다.");
  }

  async function deleteNote() {
    const item = state.notes.find((entry) => entry.id === selected.note);
    if (!item) return;
    if (!(await ui.showConfirm(`'${item.title}' 메모를 삭제할까요?`, { confirmText: "삭제" }))) return;
    state.notes = state.notes.filter((entry) => entry.id !== selected.note);
    clearNoteForm(false);
    persist("메모를 삭제했습니다.");
  }

  function clearNoteForm(render = true) {
    selected.note = "";
    noteForm.reset();
    noteDeleteBtn.disabled = true;
    if (render) renderNotes();
  }

  function selectNote(id) {
    const item = state.notes.find((entry) => entry.id === id);
    if (!item) return;
    selected.note = id;
    setValue("#adminNoteTitle", item.title);
    setValue("#adminNoteRelated", item.relatedTo);
    setValue("#adminNoteBody", item.body);
    noteDeleteBtn.disabled = false;
    renderNotes();
  }

  function renderNotes() {
    noteList.innerHTML = "";
    if (!state.notes.length) {
      noteList.append(empty("아직 저장된 메모가 없습니다."));
      return;
    }
    for (const item of [...state.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
      const note = document.createElement("button");
      note.type = "button";
      note.className = `admin-note-item${item.id === selected.note ? " selected" : ""}`;
      note.innerHTML = `<strong></strong><span></span><p></p>`;
      note.querySelector("strong").textContent = item.title;
      note.querySelector("span").textContent = [item.relatedTo, shortDate(item.updatedAt)].filter(Boolean).join(" · ");
      note.querySelector("p").textContent = item.body;
      note.addEventListener("click", () => selectNote(item.id));
      noteList.append(note);
    }
  }

  function generateDocument() {
    const type = value("#adminDocumentType");
    const dept = value("#adminDocumentDept");
    const person = value("#adminDocumentPerson");
    const asset = value("#adminDocumentAsset");
    const work = value("#adminDocumentWork");
    const memo = value("#adminDocumentMemo");
    const today = new Date().toLocaleDateString("ko-KR");
    const titleMap = {
      handover: "자산 인수인계서",
      return: "장비 반납 확인서",
      done: "업무 처리 완료 보고서",
      purchase: "소모품 구매 요청서",
      expire: "계약 만료 알림",
    };
    const title = titleMap[type] || "행정 문서";
    const lines = [
      `[${title}]`,
      "",
      `작성일: ${today}`,
      `부서/고객: ${dept || "-"}`,
      `대상자/담당자: ${person || "-"}`,
      `자산/계약/품목: ${asset || "-"}`,
      "",
      "주요 내용",
      work || "-",
      "",
      "비고",
      memo || "-",
      "",
      "확인자: ____________________",
    ];
    documentOutput.value = lines.join("\n");
    documentCopyBtn.disabled = false;
  }

  async function copyDocument() {
    if (!documentOutput.value.trim()) return;
    try {
      await navigator.clipboard.writeText(documentOutput.value);
      ui.showToast("문서 초안을 클립보드에 복사했습니다.");
    } catch {
      documentOutput.select();
      document.execCommand("copy");
      ui.showToast("문서 초안을 복사했습니다.");
    }
  }

  function emptyState() {
    return { requests: [], checklists: [], vendors: [], supplies: [], supplyLogs: [], purchases: [], contracts: [], notes: [] };
  }

  function normalizeState(payload) {
    return {
      ...emptyState(),
      ...(payload || {}),
      requests: Array.isArray(payload?.requests) ? payload.requests : [],
      checklists: Array.isArray(payload?.checklists) ? payload.checklists : [],
      vendors: Array.isArray(payload?.vendors) ? payload.vendors : [],
      supplies: Array.isArray(payload?.supplies) ? payload.supplies : [],
      supplyLogs: Array.isArray(payload?.supplyLogs) ? payload.supplyLogs : [],
      purchases: Array.isArray(payload?.purchases) ? payload.purchases : [],
      contracts: Array.isArray(payload?.contracts) ? payload.contracts : [],
      notes: Array.isArray(payload?.notes) ? payload.notes : [],
    };
  }

  function value(selector) {
    return String(document.querySelector(selector)?.value ?? "").trim();
  }

  function setValue(selector, val) {
    const el = document.querySelector(selector);
    if (el) el.value = val ?? "";
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function upsert(list, item) {
    const index = list.findIndex((entry) => entry.id === item.id);
    if (index >= 0) list[index] = item;
    else list.unshift(item);
  }

  function cell(textContent) {
    const td = document.createElement("td");
    td.textContent = textContent ?? "";
    return td;
  }

  function badgeCell(value) {
    const td = document.createElement("td");
    const span = document.createElement("span");
    span.className = `admin-badge ${badgeClass(value)}`;
    span.textContent = value || "-";
    td.append(span);
    return td;
  }

  function dueCell(value) {
    const td = cell(value || "");
    const days = daysUntil(value);
    if (days === null) return td;
    if (days < 0) td.classList.add("warranty-expired");
    else if (days <= 30) td.classList.add("warranty-soon");
    return td;
  }

  function stockCell(item) {
    const unit = item.unit || "개";
    const td = cell(`${item.quantity}${unit} / 최소 ${item.minQuantity}${unit}`);
    if (item.quantity <= item.minQuantity) td.classList.add("warranty-soon");
    return td;
  }

  function empty(message) {
    const p = document.createElement("p");
    p.className = "empty-inline";
    p.textContent = message;
    return p;
  }

  function badgeClass(value) {
    if (["완료", "입고 완료", "낮음", "우수", "사용", "입고"].includes(value)) return "ok";
    if (["긴급", "만료", "반려", "중지", "출고"].includes(value)) return "bad";
    if (["높음", "처리 중", "보류", "견적", "발주", "주의"].includes(value)) return "warn";
    return "";
  }

  function statusRank(value) {
    return { "긴급": 0, "접수": 1, "처리 중": 2, "보류": 3, "완료": 4 }[value] ?? 9;
  }

  function purchaseRank(value) {
    return { "요청": 0, "견적": 1, "발주": 2, "입고 완료": 3, "반려": 4 }[value] ?? 9;
  }

  function compareDate(left, right) {
    const a = left ? new Date(left).getTime() : Number.MAX_SAFE_INTEGER;
    const b = right ? new Date(right).getTime() : Number.MAX_SAFE_INTEGER;
    return a - b;
  }

  function supplyById(id) {
    return state.supplies.find((item) => item.id === id);
  }

  function vendorName(id) {
    if (!id) return "";
    return state.vendors.find((item) => item.id === id)?.name || "삭제된 거래처";
  }

  function bestQuote(item) {
    const quotes = (item.quotes || []).filter((quote) => Number(quote.amount) > 0);
    if (!quotes.length) return null;
    return quotes.sort((a, b) => Number(a.amount) - Number(b.amount))[0];
  }

  function money(value) {
    const amount = Number(value) || 0;
    if (amount <= 0) return "";
    return `${amount.toLocaleString("ko-KR")}원`;
  }

  function todayValue() {
    return new Date().toISOString().slice(0, 10);
  }

  function startOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  function isDue(value, today) {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    date.setHours(0, 0, 0, 0);
    return date <= today;
  }

  function daysUntil(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const today = startOfToday();
    date.setHours(0, 0, 0, 0);
    return Math.ceil((date - today) / 86400000);
  }

  function shortDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("ko-KR");
  }
})();
