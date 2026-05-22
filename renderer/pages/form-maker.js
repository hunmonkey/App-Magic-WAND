(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#formMakerMenu");
  if (!menu || !ui) return;

  const page = document.querySelector("#formMakerPage");
  const sheet = document.querySelector("#fmSheet");
  const titleInput = document.querySelector("#fmTitle");
  const blockSelect = document.querySelector("#fmBlock");
  const fontSizeSelect = document.querySelector("#fmFontSize");
  const fontNameSelect = document.querySelector("#fmFontName");
  const colorInput = document.querySelector("#fmColor");
  const tableTools = document.querySelector("#fmTableTools");
  const tableRows = document.querySelector("#fmTableRows");
  const tableCols = document.querySelector("#fmTableCols");
  const insertTableBtn = document.querySelector("#fmInsertTable");
  const insertImageBtn = document.querySelector("#fmInsertImage");
  const imageInput = document.querySelector("#fmImageInput");
  const printBtn = document.querySelector("#fmPrint");
  const saveBtn = document.querySelector("#fmSave");
  const storeBtn = document.querySelector("#fmStore");
  const clearBtn = document.querySelector("#fmClear");

  // 서식 도구를 누르면 편집 영역의 선택 영역이 풀리므로, 마지막 선택과 셀을 기억해 둔다.
  let savedRange = null;
  let currentCell = null;
  // 보관함에서 불러와 편집 중인 문서의 id (새 문서면 null).
  let currentDocId = null;

  menu.addEventListener("click", () => {
    ui.switchPage("#formMakerPage", menu);
  });

  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    if (selection.rangeCount && sheet.contains(selection.anchorNode)) {
      savedRange = selection.getRangeAt(0);
      currentCell = closestCell(selection.anchorNode);
      tableTools.hidden = !currentCell;
    }
  });

  function closestCell(node) {
    let element = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (element && element !== sheet) {
      if (element.tagName === "TD" || element.tagName === "TH") {
        return element;
      }
      element = element.parentElement;
    }
    return null;
  }

  function restoreSelection() {
    sheet.focus();
    if (savedRange) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }
  }

  function runCommand(command, value) {
    restoreSelection();
    document.execCommand(command, false, value ?? null);
  }

  page.querySelectorAll("[data-cmd]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => runCommand(button.dataset.cmd));
  });

  blockSelect.addEventListener("change", () => {
    runCommand("formatBlock", blockSelect.value);
  });

  fontSizeSelect.addEventListener("change", () => {
    if (fontSizeSelect.value) {
      runCommand("fontSize", fontSizeSelect.value);
    }
    fontSizeSelect.value = "";
  });

  fontNameSelect.addEventListener("change", () => {
    if (fontNameSelect.value) {
      runCommand("fontName", fontNameSelect.value);
    }
    fontNameSelect.value = "";
  });

  colorInput.addEventListener("input", () => {
    runCommand("foreColor", colorInput.value);
  });

  insertTableBtn.addEventListener("mousedown", (event) => event.preventDefault());
  insertTableBtn.addEventListener("click", insertTable);

  [
    ["#fmRowAbove", () => addRow(0)],
    ["#fmRowBelow", () => addRow(1)],
    ["#fmColLeft", () => addColumn(0)],
    ["#fmColRight", () => addColumn(1)],
    ["#fmRowDelete", deleteRow],
    ["#fmColDelete", deleteColumn],
    ["#fmTableDelete", deleteTable],
  ].forEach(([selector, action]) => {
    const button = document.querySelector(selector);
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      action();
      sheet.focus();
    });
  });

  insertImageBtn.addEventListener("click", () => imageInput.click());
  imageInput.addEventListener("change", handleImage);

  printBtn.addEventListener("click", () => window.print());
  saveBtn.addEventListener("click", saveDocument);
  storeBtn.addEventListener("click", storeToLibrary);
  clearBtn.addEventListener("click", newDocument);

  function insertTable() {
    const rows = clampInt(tableRows.value, 1, 20, 2);
    const cols = clampInt(tableCols.value, 1, 10, 2);

    let html = "<table><tbody>";
    for (let r = 0; r < rows; r += 1) {
      html += "<tr>";
      for (let c = 0; c < cols; c += 1) {
        html += "<td><br /></td>";
      }
      html += "</tr>";
    }
    html += "</tbody></table><p><br /></p>";

    runCommand("insertHTML", html);
  }

  function newCell() {
    const cell = document.createElement("td");
    cell.innerHTML = "<br />";
    return cell;
  }

  // offset 0 = 현재 행 위, 1 = 현재 행 아래
  function addRow(offset) {
    if (!currentCell) return;
    const row = currentCell.parentElement;
    const newRow = document.createElement("tr");
    for (let i = 0; i < row.cells.length; i += 1) {
      newRow.appendChild(newCell());
    }
    row.parentElement.insertBefore(newRow, offset === 0 ? row : row.nextSibling);
  }

  // offset 0 = 현재 열 왼쪽, 1 = 현재 열 오른쪽
  function addColumn(offset) {
    if (!currentCell) return;
    const table = currentCell.closest("table");
    const index = currentCell.cellIndex + offset;
    Array.from(table.rows).forEach((row) => {
      row.insertBefore(newCell(), row.cells[index] || null);
    });
  }

  function deleteRow() {
    if (!currentCell) return;
    const table = currentCell.closest("table");
    if (table.rows.length <= 1) {
      deleteTable();
      return;
    }
    currentCell.parentElement.remove();
    clearTableSelection();
  }

  function deleteColumn() {
    if (!currentCell) return;
    const table = currentCell.closest("table");
    const index = currentCell.cellIndex;
    if (currentCell.parentElement.cells.length <= 1) {
      deleteTable();
      return;
    }
    Array.from(table.rows).forEach((row) => {
      if (row.cells[index]) {
        row.cells[index].remove();
      }
    });
    clearTableSelection();
  }

  function deleteTable() {
    if (!currentCell) return;
    const table = currentCell.closest("table");
    if (table) {
      table.remove();
    }
    clearTableSelection();
  }

  function clearTableSelection() {
    currentCell = null;
    tableTools.hidden = true;
  }

  function handleImage(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => runCommand("insertImage", reader.result);
    reader.onerror = () => ui.showToast("이미지를 불러오지 못했습니다.");
    reader.readAsDataURL(file);
  }

  async function saveDocument() {
    if (isEmpty()) {
      ui.showToast("저장할 문서 내용이 없습니다.");
      return;
    }

    try {
      const result = await window.magicWand.formMaker.save({
        html: sheet.innerHTML,
        title: titleInput.value.trim(),
      });
      if (!result.canceled) {
        ui.showToast("양식지를 저장했습니다.");
      }
    } catch (error) {
      ui.showToast(`저장 실패: ${error.message}`);
    }
  }

  async function storeToLibrary() {
    if (isEmpty()) {
      ui.showToast("저장할 문서 내용이 없습니다.");
      return;
    }
    const title = titleInput.value.trim();
    if (!title) {
      ui.showToast("문서 제목을 입력해 주세요.");
      titleInput.focus();
      return;
    }

    const wasNew = !currentDocId;
    try {
      const saved = await window.magicWand.formMaker.write({
        id: currentDocId || undefined,
        title,
        html: sheet.innerHTML,
      });
      currentDocId = saved.id;
      ui.showToast(wasNew ? "보관함에 저장했습니다." : "보관함의 문서를 갱신했습니다.");

      if (window.FormManager && typeof window.FormManager.refresh === "function") {
        window.FormManager.refresh();
      }
    } catch (error) {
      ui.showToast(`보관함 저장 실패: ${error.message}`);
    }
  }

  function newDocument() {
    if (!isEmpty() && !window.confirm("현재 내용을 비우고 새 문서를 시작할까요?")) {
      return;
    }
    sheet.innerHTML = "";
    titleInput.value = "";
    currentDocId = null;
    savedRange = null;
    clearTableSelection();
    sheet.focus();
  }

  function openDocument(doc) {
    if (!doc) return;
    ui.switchPage("#formMakerPage", menu);
    titleInput.value = doc.title || "";
    sheet.innerHTML = doc.html || "";
    currentDocId = doc.id || null;
    savedRange = null;
    clearTableSelection();
  }

  function isEmpty() {
    return !sheet.textContent.trim() && !sheet.querySelector("img, table, hr");
  }

  // 양식지 관리 페이지에서 문서를 편집/인쇄용으로 불러올 때 사용한다.
  window.FormMaker = {
    open: openDocument,
    print(doc) {
      openDocument(doc);
      window.print();
    },
  };

  function clampInt(value, min, max, fallback) {
    const number = parseInt(value, 10);
    if (Number.isNaN(number)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, number));
  }
})();
