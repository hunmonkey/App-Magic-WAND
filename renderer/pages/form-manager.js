(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#formManagerMenu");
  if (!menu || !ui) return;

  const api = window.magicWand.formMaker;
  const summary = document.querySelector("#fmgSummary");
  const refreshBtn = document.querySelector("#fmgRefresh");
  const searchInput = document.querySelector("#fmgSearch");
  const editBtn = document.querySelector("#fmgEditBtn");
  const renameBtn = document.querySelector("#fmgRenameBtn");
  const duplicateBtn = document.querySelector("#fmgDuplicateBtn");
  const printBtn = document.querySelector("#fmgPrintBtn");
  const exportBtn = document.querySelector("#fmgExportBtn");
  const deleteBtn = document.querySelector("#fmgDeleteBtn");
  const tableBody = document.querySelector("#fmgTableBody");
  const tableWrap = document.querySelector(".fmg-table-wrap");
  const previewTitle = document.querySelector("#fmgPreviewTitle");
  const preview = document.querySelector("#fmgPreview");

  // 목록은 메타데이터(제목·날짜)만 담는다. 본문은 선택할 때마다 따로 불러온다.
  let docs = [];
  let selectedId = null;
  let loaded = false;
  let previewToken = 0;

  menu.addEventListener("click", () => {
    ui.switchPage("#formManagerPage", menu);
    if (!loaded) {
      loaded = true;
      load();
    }
  });

  refreshBtn.addEventListener("click", load);
  searchInput.addEventListener("input", renderTable);
  editBtn.addEventListener("click", editDoc);
  renameBtn.addEventListener("click", renameDoc);
  duplicateBtn.addEventListener("click", duplicateDoc);
  printBtn.addEventListener("click", printDoc);
  exportBtn.addEventListener("click", exportDoc);
  deleteBtn.addEventListener("click", deleteDoc);

  async function load() {
    try {
      docs = await api.list();
      docs.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      if (!docs.some((doc) => doc.id === selectedId)) {
        selectedId = null;
      }
      renderTable();
      await renderPreview();
    } catch (error) {
      ui.showToast(`목록을 불러오지 못했습니다: ${error.message}`);
    }
  }

  function renderTable() {
    const keyword = searchInput.value.trim().toLowerCase();
    const visible = docs.filter((doc) => !keyword || doc.title.toLowerCase().includes(keyword));

    tableBody.innerHTML = "";
    for (const doc of visible) {
      const row = document.createElement("tr");
      row.dataset.id = doc.id;
      if (doc.id === selectedId) {
        row.classList.add("selected");
      }
      row.append(createCell(doc.title || "(제목 없음)"), createCell(formatDate(doc.updatedAt)));
      row.addEventListener("click", () => selectDoc(doc.id));
      tableBody.append(row);
    }

    tableWrap.classList.toggle("empty", visible.length === 0);
    summary.textContent = docs.length
      ? `저장된 양식지 ${docs.length}건을 관리합니다.`
      : "보관함에 저장한 양식지를 관리합니다.";
    updateButtons();
  }

  function createCell(value) {
    const cell = document.createElement("td");
    cell.textContent = value || "";
    return cell;
  }

  function selectDoc(id) {
    selectedId = id;
    renderTable();
    renderPreview();
  }

  async function renderPreview() {
    if (!selectedDoc()) {
      previewTitle.textContent = "목록에서 문서를 선택하면 내용을 미리 봅니다.";
      preview.innerHTML = "";
      return;
    }

    const token = ++previewToken;
    const id = selectedId;
    try {
      const doc = await api.read(id);
      if (token !== previewToken) return; // 더 최근 선택이 있으면 무시
      previewTitle.textContent = doc.title || "(제목 없음)";
      preview.innerHTML = doc.html || "";
    } catch (error) {
      if (token !== previewToken) return;
      previewTitle.textContent = "미리보기를 불러오지 못했습니다.";
      preview.innerHTML = "";
    }
  }

  function updateButtons() {
    const disabled = !selectedDoc();
    [editBtn, renameBtn, duplicateBtn, printBtn, exportBtn, deleteBtn].forEach((button) => {
      button.disabled = disabled;
    });
  }

  function selectedDoc() {
    return docs.find((doc) => doc.id === selectedId) || null;
  }

  async function editDoc() {
    const meta = selectedDoc();
    if (!meta || !window.FormMaker) return;
    try {
      const doc = await api.read(meta.id);
      window.FormMaker.open(doc);
    } catch (error) {
      ui.showToast(`문서를 열지 못했습니다: ${error.message}`);
    }
  }

  async function renameDoc() {
    const meta = selectedDoc();
    if (!meta) return;
    const name = window.prompt("새 제목을 입력하세요.", meta.title);
    if (name === null) return;
    const title = name.trim();
    if (!title) {
      ui.showToast("제목을 입력해 주세요.");
      return;
    }
    try {
      await api.write({ id: meta.id, title });
      await load();
      ui.showToast("제목을 변경했습니다.");
    } catch (error) {
      ui.showToast(`이름 변경 실패: ${error.message}`);
    }
  }

  async function duplicateDoc() {
    const meta = selectedDoc();
    if (!meta) return;
    try {
      const source = await api.read(meta.id);
      const saved = await api.write({ title: `${meta.title} (복사본)`, html: source.html });
      selectedId = saved.id;
      await load();
      ui.showToast("문서를 복제했습니다.");
    } catch (error) {
      ui.showToast(`복제 실패: ${error.message}`);
    }
  }

  async function printDoc() {
    const meta = selectedDoc();
    if (!meta || !window.FormMaker) return;
    try {
      const doc = await api.read(meta.id);
      window.FormMaker.print(doc);
    } catch (error) {
      ui.showToast(`인쇄 준비 실패: ${error.message}`);
    }
  }

  async function exportDoc() {
    const meta = selectedDoc();
    if (!meta) return;
    try {
      const doc = await api.read(meta.id);
      const result = await api.save({ html: doc.html, title: doc.title });
      if (!result.canceled) {
        ui.showToast("HTML 파일로 내보냈습니다.");
      }
    } catch (error) {
      ui.showToast(`내보내기 실패: ${error.message}`);
    }
  }

  async function deleteDoc() {
    const meta = selectedDoc();
    if (!meta) return;
    if (!(await ui.showConfirm(`'${meta.title || "(제목 없음)"}' 문서를 삭제할까요?`, { confirmText: "삭제" }))) {
      return;
    }
    try {
      await api.delete(meta.id);
      selectedId = null;
      await load();
      ui.showToast("문서를 삭제했습니다.");
    } catch (error) {
      ui.showToast(`삭제 실패: ${error.message}`);
    }
  }

  function formatDate(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  // 양식지 제작 화면에서 보관함에 저장하면 목록을 갱신한다.
  window.FormManager = {
    refresh() {
      if (loaded) {
        load();
      }
    },
  };
})();
