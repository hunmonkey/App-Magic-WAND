(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#assetMenu");
  if (!menu || !ui) return;

  const api = window.magicWand.asset;
  const form = document.querySelector("#assetForm");
  const fields = {
    assetTag: document.querySelector("#assetTag"),
    name: document.querySelector("#assetName"),
    ip: document.querySelector("#assetIp"),
    spec: document.querySelector("#assetSpec"),
    location: document.querySelector("#assetLocation"),
    owner: document.querySelector("#assetOwner"),
    purchaseDate: document.querySelector("#assetPurchaseDate"),
    warrantyEnd: document.querySelector("#assetWarrantyEnd"),
    memo: document.querySelector("#assetMemo"),
  };
  const addBtn = document.querySelector("#assetAddBtn");
  const updateBtn = document.querySelector("#assetUpdateBtn");
  const deleteBtn = document.querySelector("#assetDeleteBtn");
  const clearBtn = document.querySelector("#assetClearBtn");
  const fillBtn = document.querySelector("#assetFillBtn");
  const searchInput = document.querySelector("#assetSearch");
  const tableBody = document.querySelector("#assetTableBody");
  const tableWrap = document.querySelector(".asset-table-wrap");
  const countText = document.querySelector("#assetCount");

  let assets = [];
  let selectedId = null;
  let loaded = false;

  menu.addEventListener("click", () => {
    ui.switchPage("#assetPage", menu);
    if (!loaded) {
      loaded = true;
      load();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    addAsset();
  });
  updateBtn.addEventListener("click", updateAsset);
  deleteBtn.addEventListener("click", deleteAsset);
  clearBtn.addEventListener("click", clearForm);
  fillBtn.addEventListener("click", fillFromPc);
  searchInput.addEventListener("input", renderTable);

  async function load() {
    try {
      assets = await api.load();
      renderTable();
    } catch (error) {
      ui.showToast(`자산 목록을 불러오지 못했습니다: ${error.message}`);
    }
  }

  async function persist(message) {
    try {
      assets = await api.save(assets);
      renderTable();
      ui.showToast(message);
      return true;
    } catch (error) {
      ui.showToast(`자산을 저장하지 못했습니다: ${error.message}`);
      return false;
    }
  }

  function assetFromForm() {
    const name = fields.name.value.trim();
    if (!name) {
      ui.showToast("장비명을 입력해 주세요.");
      fields.name.focus();
      return null;
    }
    return {
      assetTag: fields.assetTag.value.trim(),
      name,
      ip: fields.ip.value.trim(),
      spec: fields.spec.value.trim(),
      location: fields.location.value.trim(),
      owner: fields.owner.value.trim(),
      purchaseDate: fields.purchaseDate.value,
      warrantyEnd: fields.warrantyEnd.value,
      memo: fields.memo.value.trim(),
      updatedAt: new Date().toISOString(),
    };
  }

  async function addAsset() {
    const asset = assetFromForm();
    if (!asset) return;
    asset.id = `asset-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    assets.push(asset);
    if (await persist("자산을 등록했습니다.")) {
      clearForm();
    }
  }

  async function updateAsset() {
    if (selectedId === null) {
      ui.showToast("수정할 자산을 목록에서 선택해 주세요.");
      return;
    }
    const asset = assetFromForm();
    if (!asset) return;
    const index = assets.findIndex((item) => item.id === selectedId);
    if (index === -1) return;
    asset.id = selectedId;
    assets[index] = asset;
    if (await persist("자산 정보를 수정했습니다.")) {
      clearForm();
    }
  }

  async function deleteAsset() {
    if (selectedId === null) return;
    const asset = assets.find((item) => item.id === selectedId);
    if (!asset) return;
    if (!(await ui.showConfirm(`'${asset.name}' 자산을 삭제할까요?`, { confirmText: "삭제" }))) {
      return;
    }
    assets = assets.filter((item) => item.id !== selectedId);
    if (await persist("자산을 삭제했습니다.")) {
      clearForm();
    }
  }

  function clearForm() {
    selectedId = null;
    form.reset();
    renderTable();
  }

  function selectAsset(id) {
    selectedId = id;
    const asset = assets.find((item) => item.id === id);
    if (!asset) return;
    fields.assetTag.value = asset.assetTag || "";
    fields.name.value = asset.name || "";
    fields.ip.value = asset.ip || "";
    fields.spec.value = asset.spec || "";
    fields.location.value = asset.location || "";
    fields.owner.value = asset.owner || "";
    fields.purchaseDate.value = asset.purchaseDate || "";
    fields.warrantyEnd.value = asset.warrantyEnd || "";
    fields.memo.value = asset.memo || "";
    renderTable();
  }

  function renderTable() {
    const keyword = searchInput.value.trim().toLowerCase();
    const visible = assets.filter((asset) => {
      if (!keyword) return true;
      return [asset.assetTag, asset.name, asset.ip, asset.location, asset.owner, asset.memo]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });

    tableBody.innerHTML = "";
    for (const asset of visible) {
      const row = document.createElement("tr");
      row.dataset.id = asset.id;
      if (asset.id === selectedId) {
        row.classList.add("selected");
      }
      row.append(
        createCell(asset.assetTag),
        createCell(asset.name),
        createCell(asset.ip),
        createCell(asset.location),
        createCell(asset.owner),
        createWarrantyCell(asset.warrantyEnd),
      );
      row.addEventListener("click", () => selectAsset(asset.id));
      tableBody.append(row);
    }

    tableWrap.classList.toggle("empty", visible.length === 0);
    countText.textContent = assets.length
      ? `등록한 자산 ${assets.length}건을 검색하고 관리합니다.`
      : "등록한 자산을 검색하고 관리합니다.";
    updateButtons();
  }

  function createCell(value) {
    const cell = document.createElement("td");
    cell.textContent = value || "";
    return cell;
  }

  // 보증 만료일이 지났거나 30일 이내면 색으로 강조한다.
  function createWarrantyCell(warrantyEnd) {
    const cell = document.createElement("td");
    if (!warrantyEnd) {
      cell.textContent = "";
      return cell;
    }
    cell.textContent = warrantyEnd;
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

  function daysUntil(dateStr) {
    const target = new Date(dateStr);
    if (Number.isNaN(target.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
  }

  function updateButtons() {
    const hasSelection = selectedId !== null && assets.some((item) => item.id === selectedId);
    updateBtn.disabled = !hasSelection;
    deleteBtn.disabled = !hasSelection;
  }

  // 현재 PC의 사양·IP·이름을 폼에 자동으로 채운다. (기존 점검 API 재사용)
  async function fillFromPc() {
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
      if (net.pcName && !fields.name.value.trim()) fields.name.value = net.pcName;
      if (primary.privateIp && !fields.ip.value.trim()) fields.ip.value = primary.privateIp;
      const spec = buildSpecSummary(hw.groups || []);
      if (spec) fields.spec.value = spec;
      ui.showToast("현재 PC 정보를 채웠습니다. 내용을 확인 후 등록하세요.");
    } catch (error) {
      ui.showToast(`PC 정보를 불러오지 못했습니다: ${error.message}`);
    } finally {
      fillBtn.disabled = false;
      ui.setBusy(fillBtn, false);
      fillBtn.textContent = original;
    }
  }

  // 사양 트리에서 CPU·메모리 등 핵심 항목을 찾아 한 줄로 요약한다.
  function buildSpecSummary(groups) {
    const wanted = ["프로세서", "CPU", "메모리", "RAM", "그래픽", "GPU"];
    const found = [];
    const visit = (item, prefix) => {
      const label = `${prefix}${item.label || ""}`;
      if (item.value && wanted.some((key) => label.includes(key))) {
        found.push(`${item.label}: ${item.value}`);
      }
      (item.children || []).forEach((child) => visit(child, ""));
    };
    for (const group of groups) {
      for (const item of group.items || []) {
        visit(item, `${group.title} `);
      }
    }
    return found.slice(0, 3).join(" / ");
  }
})();
