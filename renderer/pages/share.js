(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#shareMenu");
  if (!menu || !ui) return;

  const page = document.querySelector("#sharePage");
  const form = document.querySelector("#shareForm");
  const pathInput = document.querySelector("#shareFolderPath");
  const nameInput = document.querySelector("#shareName");
  const descInput = document.querySelector("#shareDesc");
  const browseBtn = document.querySelector("#shareBrowseBtn");
  const createBtn = document.querySelector("#shareCreateBtn");
  const clearBtn = document.querySelector("#shareClearBtn");
  const refreshBtn = document.querySelector("#shareRefresh");
  const removeBtn = document.querySelector("#shareRemoveBtn");
  const tableBody = document.querySelector("#shareTableBody");
  const tableWrap = page.querySelector(".table-wrap");

  let shares = [];
  let mappings = [];
  let selectedName = "";

  const emptyMessage = document.querySelector("#shareEmptyMessage");
  emptyMessage.textContent = "새로고침 버튼을 눌러 공유 폴더 목록을 불러오세요.";
  tableWrap.classList.add("empty");

  menu.addEventListener("click", () => {
    ui.switchPage("#sharePage", menu);
  });

  refreshBtn.addEventListener("click", loadShares);
  browseBtn.addEventListener("click", pickFolder);
  clearBtn.addEventListener("click", clearForm);
  removeBtn.addEventListener("click", removeShare);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await createShare();
  });
  bindToolButtons(page);

  async function pickFolder() {
    try {
      const result = await window.magicWand.share.browse();
      if (result.path) {
        pathInput.value = result.path;
        if (!nameInput.value.trim()) {
          nameInput.value = result.path.split(/[\\/]/).filter(Boolean).at(-1) || "";
        }
      }
    } catch (err) {
      ui.showToast(`폴더 선택 실패: ${err.message}`);
    }
  }

  async function createShare() {
    const path = pathInput.value.trim();
    const name = nameInput.value.trim();
    if (!path) {
      ui.showToast("공유할 폴더를 먼저 선택해 주세요.");
      return;
    }
    if (!name) {
      ui.showToast("공유 이름을 입력해 주세요.");
      nameInput.focus();
      return;
    }
    const fullAccess = document.querySelector('input[name="sharePermission"]:checked').value === "full";
    createBtn.disabled = true;
    ui.setBusy(createBtn, true);
    createBtn.textContent = "공유 중...";
    try {
      await window.magicWand.share.create({ name, path, description: descInput.value.trim(), fullAccess });
      ui.showToast("폴더를 공유했습니다.");
      clearForm();
      await loadShares();
    } catch (err) {
      ui.showToast(`공유 실패: ${err.message}`);
    } finally {
      ui.setBusy(createBtn, false);
      createBtn.disabled = false;
      createBtn.textContent = "공유";
    }
  }

  function clearForm() {
    form.reset();
    pathInput.value = "";
  }

  async function loadShares() {
    refreshBtn.disabled = true;
    ui.setBusy(refreshBtn, true);
    emptyMessage.textContent = "공유 폴더 목록을 불러오는 중입니다.";
    tableBody.innerHTML = "";
    tableWrap.classList.add("empty");
    try {
      const result = await window.magicWand.share.list();
      shares = result.shares || [];
      mappings = result.mappings || [];
      emptyMessage.textContent = "공유 중이거나 연결된 폴더가 없습니다.";
      renderTable();
    } catch (err) {
      emptyMessage.textContent = "공유 중이거나 연결된 폴더가 없습니다.";
      ui.showToast(`공유 목록 조회 실패: ${err.message}`);
    } finally {
      refreshBtn.disabled = false;
      ui.setBusy(refreshBtn, false);
    }
  }

  function renderTable() {
    tableBody.innerHTML = "";
    const myShares = shares.filter((s) => !s.special);
    if (!myShares.length && !mappings.length) {
      tableWrap.classList.add("empty");
      updateRemoveButton();
      return;
    }
    tableWrap.classList.remove("empty");
    for (const s of myShares) {
      const row = document.createElement("tr");
      if (s.name === selectedName) row.classList.add("selected");
      row.append(cell("내 공유"), cell(s.name), cell(s.path), cell(s.description || ""));
      row.addEventListener("click", () => {
        selectedName = s.name === selectedName ? "" : s.name;
        renderTable();
      });
      tableBody.append(row);
    }
    for (const m of mappings) {
      const row = document.createElement("tr");
      row.classList.add("share-network-row");
      row.append(cell("연결됨"), cell(m.localPath || ""), cell(m.remotePath || ""), cell(statusText(m.status)));
      tableBody.append(row);
    }
    updateRemoveButton();
  }

  function statusText(status) {
    const map = { Ok: "정상", OK: "정상", Disconnected: "연결 끊김", Paused: "일시 중지", Unavailable: "사용 불가" };
    return map[status] || status || "";
  }

  function updateRemoveButton() {
    removeBtn.disabled = !selectedName;
  }

  async function removeShare() {
    if (!selectedName) return;
    const ok = await ui.showConfirm(`공유 "${selectedName}"을(를) 중지할까요? (폴더와 파일은 삭제되지 않습니다.)`, { confirmText: "공유 중지" });
    if (!ok) return;
    removeBtn.disabled = true;
    ui.setBusy(removeBtn, true);
    try {
      await window.magicWand.share.remove(selectedName);
      ui.showToast("공유를 중지했습니다.");
      selectedName = "";
      await loadShares();
    } catch (err) {
      ui.showToast(`공유 중지 실패: ${err.message}`);
      removeBtn.disabled = false;
    } finally {
      ui.setBusy(removeBtn, false);
    }
  }

  function cell(value) {
    const td = document.createElement("td");
    td.textContent = value || "";
    return td;
  }

  function bindToolButtons(root) {
    root.querySelectorAll("[data-windows-tool]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await window.magicWand.system.openWindowsTool(btn.dataset.windowsTool);
        } catch (err) {
          ui.showToast(`도구 실행 실패: ${err.message}`);
        }
      });
    });
  }
})();
