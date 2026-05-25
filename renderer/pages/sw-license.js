(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#swLicenseMenu");
  if (!menu || !ui) return;

  const api = window.magicWand.swLicense;
  const form = document.querySelector("#swLicenseForm");
  const softwareSelect = document.querySelector("#swLicenseSoftwareSelect");
  const softwareLoadBtn = document.querySelector("#swLicenseSoftwareLoadBtn");
  const fields = {
    product: document.querySelector("#swLicenseProduct"),
    vendor: document.querySelector("#swLicenseVendor"),
    key: document.querySelector("#swLicenseKey"),
    seats: document.querySelector("#swLicenseSeats"),
    purchaseDate: document.querySelector("#swLicensePurchaseDate"),
    expireDate: document.querySelector("#swLicenseExpireDate"),
    note: document.querySelector("#swLicenseNote"),
  };
  const deleteBtn = document.querySelector("#swLicenseDeleteBtn");
  const clearBtn = document.querySelector("#swLicenseClearBtn");
  const maskBtn = document.querySelector("#swLicenseMaskBtn");
  const searchInput = document.querySelector("#swLicenseSearch");
  const summary = document.querySelector("#swLicenseSummary");
  const tableBody = document.querySelector("#swLicenseTableBody");
  const tableWrap = document.querySelector(".sw-license-table-wrap");

  let items = [];
  let selectedId = "";
  let loaded = false;
  let keyVisible = false;

  menu.addEventListener("click", () => {
    ui.switchPage("#swLicensePage", menu);
    if (!loaded) {
      loaded = true;
      loadLicenses();
      renderSoftwareSelect([]);
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveLicense();
  });
  softwareLoadBtn.addEventListener("click", loadSoftware);
  softwareSelect.addEventListener("change", fillFromSoftware);
  deleteBtn.addEventListener("click", deleteLicense);
  clearBtn.addEventListener("click", clearForm);
  maskBtn.addEventListener("click", toggleMask);
  searchInput.addEventListener("input", debounce(renderTable, 160));
  tableBody.addEventListener("click", handleTableClick);

  async function loadLicenses() {
    try {
      items = await api.list();
      renderTable();
    } catch (error) {
      ui.showToast(`라이선스 목록을 불러오지 못했습니다: ${error.message}`);
    }
  }

  async function loadSoftware() {
    softwareLoadBtn.disabled = true;
    ui.setBusy(softwareLoadBtn, true);
    softwareLoadBtn.textContent = "조회 중";
    try {
      const result = await window.magicWand.system.software();
      renderSoftwareSelect(result.items || []);
      ui.showToast(`설치된 프로그램 ${result.count || 0}개를 불러왔습니다.`);
    } catch (error) {
      ui.showToast(`설치 프로그램 조회 실패: ${error.message}`);
    } finally {
      softwareLoadBtn.disabled = false;
      ui.setBusy(softwareLoadBtn, false);
      softwareLoadBtn.textContent = "목록 조회";
    }
  }

  function renderSoftwareSelect(software) {
    const fragment = document.createDocumentFragment();
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = software.length ? "프로그램 선택" : "목록 조회 전";
    fragment.append(empty);

    for (const item of software) {
      const opt = document.createElement("option");
      opt.value = JSON.stringify({ name: item.name, publisher: item.publisher });
      opt.textContent = [item.name, item.version].filter(Boolean).join(" · ");
      fragment.append(opt);
    }
    softwareSelect.replaceChildren(fragment);
  }

  function fillFromSoftware() {
    if (!softwareSelect.value) return;
    try {
      const item = JSON.parse(softwareSelect.value);
      fields.product.value = item.name || fields.product.value;
      fields.vendor.value = item.publisher || fields.vendor.value;
    } catch {}
  }

  async function saveLicense() {
    const payload = licenseFromForm();
    if (!payload) return;
    if (selectedId) {
      payload.id = selectedId;
    }

    try {
      items = await api.save(payload);
      renderTable();
      clearForm(false);
      await ui.notifyComplete("라이선스를 저장했습니다.", { achievementKey: "licensesSaved" });
    } catch (error) {
      ui.showToast(`라이선스 저장 실패: ${error.message}`);
    }
  }

  function licenseFromForm() {
    const product = fields.product.value.trim();
    if (!product) {
      ui.showToast("제품명을 입력해 주세요.");
      fields.product.focus();
      return null;
    }
    return {
      product,
      vendor: fields.vendor.value.trim(),
      key: fields.key.value.trim(),
      seats: Number(fields.seats.value) || 1,
      purchaseDate: fields.purchaseDate.value,
      expireDate: fields.expireDate.value,
      note: fields.note.value.trim(),
    };
  }

  async function deleteLicense() {
    const item = items.find((entry) => entry.id === selectedId);
    if (!item) return;
    if (!(await ui.showConfirm(`'${item.product}' 라이선스를 삭제할까요?`, { confirmText: "삭제" }))) {
      return;
    }
    try {
      items = await api.delete(selectedId);
      renderTable();
      clearForm(false);
      ui.showToast("라이선스를 삭제했습니다.");
    } catch (error) {
      ui.showToast(`라이선스 삭제 실패: ${error.message}`);
    }
  }

  function selectLicense(id) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    selectedId = id;
    fields.product.value = item.product || "";
    fields.vendor.value = item.vendor || "";
    fields.key.value = item.key || "";
    fields.seats.value = item.seats || 1;
    fields.purchaseDate.value = item.purchaseDate || "";
    fields.expireDate.value = item.expireDate || "";
    fields.note.value = item.note || "";
    deleteBtn.disabled = false;
    renderTable();
  }

  function clearForm(render = true) {
    selectedId = "";
    form.reset();
    fields.seats.value = "1";
    deleteBtn.disabled = true;
    if (render) renderTable();
  }

  function toggleMask() {
    keyVisible = !keyVisible;
    fields.key.type = keyVisible ? "text" : "password";
    maskBtn.textContent = keyVisible ? "키 숨기기" : "키 보기";
    renderTable();
  }

  function renderTable() {
    const keyword = searchInput.value.trim().toLowerCase();
    const visible = items.filter((item) => {
      if (!keyword) return true;
      return [item.product, item.vendor, item.key, item.note].join(" ").toLowerCase().includes(keyword);
    }).sort(compareLicense);

    const fragment = document.createDocumentFragment();
    for (const item of visible) {
      const row = document.createElement("tr");
      row.dataset.id = item.id;
      if (item.id === selectedId) {
        row.classList.add("selected");
      }
      row.append(
        cell([item.product, item.vendor].filter(Boolean).join("\n")),
        cell(keyVisible ? item.key : maskKey(item.key)),
        cell(`${item.seats || 1}`),
        expireCell(item.expireDate),
        cell(item.note || ""),
      );
      fragment.append(row);
    }
    tableBody.replaceChildren(fragment);

    tableWrap.classList.toggle("empty", visible.length === 0);
    summary.textContent = items.length
      ? `저장된 라이선스 ${items.length}건을 관리합니다. 정품키는 화면에서만 숨김 처리됩니다.`
      : "저장된 라이선스를 검색하고 만료일을 확인합니다.";
  }

  function handleTableClick(event) {
    const row = event.target.closest("tr[data-id]");
    if (row) {
      selectLicense(row.dataset.id);
    }
  }

  function compareLicense(left, right) {
    const leftDays = daysUntil(left.expireDate);
    const rightDays = daysUntil(right.expireDate);
    const leftSort = leftDays === null ? 99999 : leftDays;
    const rightSort = rightDays === null ? 99999 : rightDays;
    return leftSort - rightSort || left.product.localeCompare(right.product, "ko");
  }

  function expireCell(value) {
    const td = cell(value || "");
    const days = daysUntil(value);
    if (days === null) return td;
    if (days < 0) {
      td.classList.add("warranty-expired");
      td.title = "만료됨";
    } else if (days <= 30) {
      td.classList.add("warranty-soon");
      td.title = `만료 ${days}일 전`;
    }
    return td;
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

  function maskKey(value) {
    const text = String(value || "");
    if (!text) return "";
    if (text.length <= 5) return "•••••";
    return `${text.slice(0, 3)}${"•".repeat(Math.min(12, text.length - 5))}${text.slice(-2)}`;
  }

  function cell(value) {
    const td = document.createElement("td");
    td.textContent = value || "";
    return td;
  }

  function debounce(fn, delay) {
    let timer = null;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), delay);
    };
  }
})();
