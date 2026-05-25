(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#fileRenameMenu");
  if (!menu || !ui) return;

  const api = window.magicWand.fileRename;
  const folderInput = document.querySelector("#frFolder");
  const pickBtn = document.querySelector("#frPickBtn");
  const includeSub = document.querySelector("#frIncludeSub");
  const findInput = document.querySelector("#frFind");
  const replaceInput = document.querySelector("#frReplace");
  const prefixInput = document.querySelector("#frPrefix");
  const suffixInput = document.querySelector("#frSuffix");
  const caseSelect = document.querySelector("#frCase");
  const extInput = document.querySelector("#frExt");
  const trimChk = document.querySelector("#frTrim");
  const seqChk = document.querySelector("#frSeq");
  const seqStart = document.querySelector("#frSeqStart");
  const seqPad = document.querySelector("#frSeqPad");
  const seqPos = document.querySelector("#frSeqPos");
  const previewBtn = document.querySelector("#frPreviewBtn");
  const applyBtn = document.querySelector("#frApplyBtn");
  const summary = document.querySelector("#frSummary");
  const tableBody = document.querySelector("#frTableBody");
  const tableWrap = document.querySelector(".fr-table-wrap");

  const ruleInputs = [
    includeSub, findInput, replaceInput, prefixInput, suffixInput,
    caseSelect, extInput, trimChk, seqChk, seqStart, seqPad, seqPos,
  ];

  let folder = "";
  let lastPreview = null;

  menu.addEventListener("click", () => ui.switchPage("#fileRenamePage", menu));
  pickBtn.addEventListener("click", pickFolder);
  previewBtn.addEventListener("click", runPreview);
  applyBtn.addEventListener("click", runApply);
  // 규칙이 바뀌면 이전 미리보기는 무효 → 다시 미리보기 전까지 적용 금지
  ruleInputs.forEach((el) => {
    el.addEventListener("input", invalidate);
    el.addEventListener("change", invalidate);
  });

  function invalidate() {
    lastPreview = null;
    applyBtn.disabled = true;
  }

  async function pickFolder() {
    try {
      const result = await api.pickFolder();
      if (result.canceled) return;
      folder = result.folder;
      folderInput.value = folder;
      invalidate();
      summary.textContent = "미리보기를 실행하세요.";
    } catch (error) {
      ui.showToast(`폴더를 선택하지 못했습니다: ${error.message}`);
    }
  }

  function collectRules() {
    return {
      find: findInput.value,
      replaceWith: replaceInput.value,
      prefix: prefixInput.value,
      suffix: suffixInput.value,
      caseMode: caseSelect.value,
      extensionTo: extInput.value,
      trimSpaces: trimChk.checked,
      sequence: {
        enabled: seqChk.checked,
        start: Number(seqStart.value) || 0,
        padding: Number(seqPad.value) || 1,
        position: seqPos.value,
      },
    };
  }

  async function runPreview() {
    if (!folder) {
      ui.showToast("폴더를 먼저 선택해 주세요.");
      return;
    }
    previewBtn.disabled = true;
    ui.setBusy(previewBtn, true);
    try {
      lastPreview = await api.preview({
        folder,
        rules: collectRules(),
        includeSubfolders: includeSub.checked,
      });
      renderPreview(lastPreview);
      const canApply = lastPreview.changedCount > 0 && !lastPreview.hasConflict;
      applyBtn.disabled = !canApply;
    } catch (error) {
      lastPreview = null;
      applyBtn.disabled = true;
      ui.showToast(`미리보기 실패: ${error.message}`);
    } finally {
      previewBtn.disabled = false;
      ui.setBusy(previewBtn, false);
    }
  }

  async function runApply() {
    if (!lastPreview) {
      ui.showToast("먼저 미리보기를 실행해 주세요.");
      return;
    }
    if (lastPreview.hasConflict) {
      ui.showToast("충돌하는 이름이 있습니다. 규칙을 바꿔 충돌을 없앤 뒤 적용해 주세요.");
      return;
    }
    const ok = await ui.showConfirm(`${lastPreview.changedCount}개 파일의 이름을 변경할까요?`, { confirmText: "변경" });
    if (!ok) return;

    applyBtn.disabled = true;
    ui.setBusy(applyBtn, true);
    try {
      const result = await api.apply({
        folder,
        items: lastPreview.items,
        token: "file-rename-confirmed",
      });
      if (result.failed > 0) {
        ui.showToast(`이름 변경 완료: 성공 ${result.renamed}건, 실패 ${result.failed}건`);
      } else {
        ui.showToast(`이름 변경 완료: ${result.renamed}건`);
      }
      lastPreview = null;
      await runPreview();
    } catch (error) {
      applyBtn.disabled = false;
      ui.showToast(`이름 변경 실패: ${error.message}`);
    } finally {
      ui.setBusy(applyBtn, false);
    }
  }

  function renderPreview(data) {
    const changed = data.changedCount;
    const conflict = data.conflictCount;
    summary.textContent = `총 ${data.total}개 · 바뀜 ${changed}개${conflict ? ` · 충돌 ${conflict}개` : ""}`;

    const fragment = document.createDocumentFragment();
    for (const item of data.items) {
      const row = document.createElement("tr");
      row.append(createCell(item.from), createCell(item.changed ? item.to : item.from), createStatusCell(item));
      fragment.append(row);
    }
    tableBody.replaceChildren(fragment);
    tableWrap.classList.toggle("empty", data.items.length === 0);
  }

  function createCell(value) {
    const cell = document.createElement("td");
    cell.textContent = value || "";
    return cell;
  }

  function createStatusCell(item) {
    const cell = document.createElement("td");
    if (item.conflict) {
      cell.className = "fr-status-conflict";
      cell.textContent = `충돌: ${item.reason}`;
    } else if (item.changed) {
      cell.className = "fr-status-change";
      cell.textContent = "변경";
    } else {
      cell.className = "fr-status-none";
      cell.textContent = "변경 없음";
    }
    return cell;
  }
})();
