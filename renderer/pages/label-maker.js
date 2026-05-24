(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#labelMakerMenu");
  if (!menu || !ui) return;

  const presetSelect = document.querySelector("#labelPreset");
  const copiesInput = document.querySelector("#labelCopies");
  const customFields = document.querySelector("#labelCustomFields");
  const customColsInput = document.querySelector("#labelCustomCols");
  const customRowsInput = document.querySelector("#labelCustomRows");
  const customGapInput = document.querySelector("#labelCustomGap");
  const customPaddingInput = document.querySelector("#labelCustomPadding");
  const sourceInput = document.querySelector("#labelSource");
  const renderBtn = document.querySelector("#labelRenderBtn");
  const sampleBtn = document.querySelector("#labelSampleBtn");
  const clearBtn = document.querySelector("#labelClearBtn");
  const printBtn = document.querySelector("#labelPrintBtn");
  const sheet = document.querySelector("#labelSheet");
  const summary = document.querySelector("#labelSummary");

  const presets = {
    "2x7": { columns: 2, rows: 7, gap: "6px", padding: "36px" },
    "3x8": { columns: 3, rows: 8, gap: "6px", padding: "36px" },
    "4x10": { columns: 4, rows: 10, gap: "5px", padding: "28px" },
  };

  menu.addEventListener("click", () => {
    ui.switchPage("#labelMakerPage", menu);
  });

  renderBtn.addEventListener("click", renderLabels);
  presetSelect.addEventListener("change", () => {
    customFields.hidden = presetSelect.value !== "custom";
    renderLabels();
  });
  copiesInput.addEventListener("change", renderLabels);
  [customColsInput, customRowsInput, customGapInput, customPaddingInput].forEach((input) => {
    input.addEventListener("change", renderLabels);
  });
  printBtn.addEventListener("click", () => {
    renderLabels();
    ui.exportPdf({ defaultFileName: "라벨지" });
  });
  sampleBtn.addEventListener("click", () => {
    sourceInput.value = [
      "PC-01, 192.168.0.10, 사무실, 홍길동",
      "프린터-복합기, 192.168.0.25, 복도, 총무팀",
      "공유기-Main, 192.168.0.1, 통신함, 관리자",
    ].join("\n");
    renderLabels();
  });
  clearBtn.addEventListener("click", () => {
    sourceInput.value = "";
    sheet.innerHTML = "";
    summary.textContent = "라벨 내용을 입력한 뒤 미리보기를 생성하세요.";
  });

  function renderLabels() {
    const preset = getPreset();
    const perPage = preset.columns * preset.rows;
    const labels = expandCopies(parseSource(), getCopies());
    sheet.innerHTML = "";
    sheet.style.setProperty("--label-columns", preset.columns);
    sheet.style.setProperty("--label-rows", preset.rows);
    sheet.style.setProperty("--label-gap", preset.gap);
    sheet.style.setProperty("--label-padding", preset.padding);

    if (!labels.length) {
      const empty = document.createElement("p");
      empty.className = "empty-inline";
      empty.textContent = "미리볼 라벨 내용이 없습니다.";
      sheet.append(empty);
      summary.textContent = "라벨 0개";
      return;
    }

    for (let index = 0; index < labels.length; index += perPage) {
      const page = document.createElement("div");
      page.className = "label-page-sheet";
      labels.slice(index, index + perPage).forEach((label) => page.append(createLabel(label)));
      sheet.append(page);
    }
    summary.textContent = `라벨 ${labels.length}개 · ${preset.columns}열 × ${preset.rows}행`;
  }

  function getPreset() {
    if (presetSelect.value !== "custom") {
      return presets[presetSelect.value] || presets["3x8"];
    }
    return {
      columns: readNumber(customColsInput, 1, 8, 3),
      rows: readNumber(customRowsInput, 1, 20, 8),
      gap: `${readNumber(customGapInput, 0, 20, 2)}mm`,
      padding: `${readNumber(customPaddingInput, 0, 30, 10)}mm`,
    };
  }

  function readNumber(input, min, max, fallback) {
    const value = Number(input.value);
    if (!Number.isFinite(value)) {
      input.value = fallback;
      return fallback;
    }
    const next = Math.min(max, Math.max(min, Math.floor(value)));
    input.value = next;
    return next;
  }

  function parseSource() {
    return sourceInput.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[,\t|]/).map((part) => part.trim());
        return {
          name: parts[0] || "장비명",
          ip: parts[1] || "",
          location: parts[2] || "",
          memo: parts.slice(3).join(" · "),
        };
      });
  }

  function getCopies() {
    const value = Number(copiesInput.value);
    if (!Number.isFinite(value)) {
      return 1;
    }
    return Math.min(20, Math.max(1, Math.floor(value)));
  }

  function expandCopies(items, copies) {
    const result = [];
    for (const item of items) {
      for (let i = 0; i < copies; i += 1) {
        result.push(item);
      }
    }
    return result;
  }

  function createLabel(item) {
    const label = document.createElement("article");
    label.className = "label-item";
    const title = document.createElement("strong");
    title.textContent = item.name;
    label.append(title);
    if (item.ip) label.append(labelLine("IP", item.ip));
    if (item.location) label.append(labelLine("위치", item.location));
    if (item.memo) label.append(labelLine("메모", item.memo));
    return label;
  }

  function labelLine(label, value) {
    const p = document.createElement("p");
    const span = document.createElement("span");
    span.textContent = label;
    const text = document.createElement("em");
    text.textContent = value;
    p.append(span, text);
    return p;
  }
})();
