(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#printerMenu");
  if (!menu || !ui) return;

  const page = document.querySelector("#printerPage");
  const listEl = document.querySelector("#printerList");
  const selectedEl = document.querySelector("#printerSelected");
  const hintEl = page.querySelector(".printer-hint");
  const refreshBtn = document.querySelector("#printerRefresh");
  const testBtn = document.querySelector("#printerTestBtn");
  const defaultBtn = document.querySelector("#printerDefaultBtn");
  const clearBtn = document.querySelector("#printerClearBtn");
  const queueBtn = document.querySelector("#printerQueueBtn");
  const spoolerBtn = document.querySelector("#printerSpoolerBtn");

  let printers = [];
  let selectedName = "";

  listEl.append(emptyState("새로고침 버튼을 눌러 프린터 목록을 불러오세요."));

  menu.addEventListener("click", () => {
    ui.switchPage("#printerPage", menu);
  });

  refreshBtn.addEventListener("click", loadPrinters);
  testBtn.addEventListener("click", testPage);
  defaultBtn.addEventListener("click", () => runAction(defaultBtn, "setDefault", "기본 프린터로 설정했습니다."));
  clearBtn.addEventListener("click", clearQueue);
  queueBtn.addEventListener("click", () => openTool("printers"));
  spoolerBtn.addEventListener("click", restartSpooler);
  bindToolButtons(page);

  async function loadPrinters() {
    refreshBtn.disabled = true;
    listEl.innerHTML = "<p class='empty-inline'>프린터를 찾는 중입니다.</p>";
    try {
      const result = await window.magicWand.printer.list();
      printers = result.printers || [];
      renderList();
    } catch (err) {
      listEl.innerHTML = "";
      listEl.append(emptyState(`프린터 목록을 불러오지 못했습니다: ${err.message}`));
    } finally {
      refreshBtn.disabled = false;
    }
  }

  function renderList() {
    listEl.innerHTML = "";
    if (!printers.length) {
      listEl.append(emptyState("연결된 프린터가 없습니다."));
      clearSelection();
      return;
    }
    for (const p of printers) {
      const card = document.createElement("article");
      card.className = "tool-card";
      if (p.name === selectedName) card.classList.add("active");

      const head = document.createElement("div");
      head.className = "tool-card-head";
      const name = document.createElement("strong");
      name.textContent = p.name;
      const badge = document.createElement("span");
      badge.className = `tool-badge ${p.isDefault ? "ok" : "muted"}`;
      badge.textContent = p.isDefault ? "기본" : statusLabel(p.status);
      head.append(name, badge);

      const meta = document.createElement("p");
      meta.className = "tool-meta";
      meta.textContent = `포트 ${p.port || "—"} · ${p.driver || "드라이버 확인 안 됨"}${p.shared ? " · 공유 중" : ""}`;

      card.append(head, meta);
      card.addEventListener("click", () => selectPrinter(p.name));
      listEl.append(card);
    }
    if (selectedName && !printers.some((p) => p.name === selectedName)) {
      clearSelection();
    }
  }

  function selectPrinter(name) {
    selectedName = name;
    renderList();
    renderSelected();
  }

  function renderSelected() {
    const p = printers.find((item) => item.name === selectedName);
    selectedEl.innerHTML = "";
    if (!p) {
      clearSelection();
      return;
    }
    hintEl.textContent = "";
    [
      ["이름", p.name],
      ["상태", statusLabel(p.status)],
      ["기본 프린터", p.isDefault ? "예" : "아니오"],
      ["포트", p.port || "확인 안 됨"],
      ["드라이버", p.driver || "확인 안 됨"],
      ["공유", p.shared ? "공유 중" : "공유 안 함"],
    ].forEach(([label, value]) => {
      const div = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      div.append(dt, dd);
      selectedEl.append(div);
    });
    testBtn.disabled = false;
    defaultBtn.disabled = false;
    clearBtn.disabled = false;
  }

  function clearSelection() {
    selectedName = "";
    selectedEl.innerHTML = "";
    hintEl.textContent = "목록에서 프린터를 먼저 선택해 주세요.";
    testBtn.disabled = true;
    defaultBtn.disabled = true;
    clearBtn.disabled = true;
  }

  async function runAction(btn, method, successMsg) {
    if (!selectedName) return;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "처리 중...";
    try {
      await window.magicWand.printer[method](selectedName);
      ui.showToast(successMsg);
      if (method === "setDefault") await loadPrinters();
    } catch (err) {
      ui.showToast(`오류: ${err.message}`);
    } finally {
      btn.textContent = original;
      btn.disabled = !selectedName;
    }
  }

  async function testPage() {
    if (!selectedName) return;
    const original = testBtn.textContent;
    testBtn.disabled = true;
    testBtn.textContent = "인쇄 중...";
    try {
      const r = await window.magicWand.printer.testPage(selectedName);
      ui.showToast(r.queued ? "테스트 페이지를 인쇄 대기열에 보냈습니다." : "테스트 페이지 인쇄를 요청했습니다.");
    } catch (err) {
      ui.showToast(`테스트 페이지 인쇄 실패: ${err.message}`);
    } finally {
      testBtn.textContent = original;
      testBtn.disabled = !selectedName;
    }
  }

  async function clearQueue() {
    if (!selectedName) return;
    clearBtn.disabled = true;
    try {
      const result = await window.magicWand.printer.clearQueue(selectedName);
      ui.showToast(`대기 문서 ${result.removed}건을 취소했습니다.`);
    } catch (err) {
      ui.showToast(`오류: ${err.message}`);
    } finally {
      clearBtn.disabled = !selectedName;
    }
  }

  async function restartSpooler() {
    spoolerBtn.disabled = true;
    const original = spoolerBtn.textContent;
    spoolerBtn.textContent = "재시작 중...";
    try {
      await window.magicWand.printer.restartSpooler();
      ui.showToast("인쇄 스풀러를 재시작했습니다.");
    } catch (err) {
      ui.showToast(`오류: ${err.message}`);
    } finally {
      spoolerBtn.textContent = original;
      spoolerBtn.disabled = false;
    }
  }

  function statusLabel(status) {
    if (!status) return "상태 확인 안 됨";
    if (/normal/i.test(status)) return "정상";
    if (/offline/i.test(status)) return "오프라인";
    if (/error/i.test(status)) return "오류";
    return status;
  }

  function emptyState(message) {
    const el = document.createElement("p");
    el.className = "empty-inline";
    el.textContent = message;
    return el;
  }

  function bindToolButtons(root) {
    root.querySelectorAll("[data-windows-tool]").forEach((btn) => {
      btn.addEventListener("click", () => openTool(btn.dataset.windowsTool));
    });
  }

  async function openTool(name) {
    try {
      await window.magicWand.system.openWindowsTool(name);
    } catch (err) {
      ui.showToast(`도구 실행 실패: ${err.message}`);
    }
  }
})();
