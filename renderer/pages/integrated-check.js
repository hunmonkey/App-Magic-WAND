(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#integratedCheckMenu");
  if (!menu || !ui) return;

  const dateInput = document.querySelector("#icDate");
  const customerInput = document.querySelector("#icCustomer");
  const assetTagInput = document.querySelector("#icAssetTag");
  const inspectorInput = document.querySelector("#icInspector");
  const startButton = document.querySelector("#icStartButton");
  const saveButton = document.querySelector("#icSaveButton");
  const progress = document.querySelector("#icProgress");
  const results = document.querySelector("#icResults");

  const headInputs = [dateInput, customerInput, assetTagInput, inspectorInput];

  // 구조파일 순서: PC사양 → OS·정품 → 사용자 → 네트워크 → HW점검 → 설치SW → 위험SW → 공유폴더
  const STEPS = [
    ["spec", "1. PC 사양", collectSpec],
    ["activation", "2. 운영체제 및 정품 인증", collectActivation],
    ["users", "3. 사용자 계정", collectUsers],
    ["network", "4. 네트워크 구성", collectNetwork],
    ["hardware", "5. 하드웨어 점검", collectHardware],
    ["software", "6. 설치된 소프트웨어 목록", collectSoftware],
    ["threat", "7. 위험 소프트웨어 점검", collectThreat],
    ["share", "8. 공유 폴더 점검", collectShare],
  ];

  const options = {
    spec: document.querySelector("#icOptSpec"),
    activation: document.querySelector("#icOptActivation"),
    users: document.querySelector("#icOptUsers"),
    network: document.querySelector("#icOptNetwork"),
    hardware: document.querySelector("#icOptHardware"),
    software: document.querySelector("#icOptSoftware"),
    threat: document.querySelector("#icOptThreat"),
    share: document.querySelector("#icOptShare"),
  };

  let running = false;
  let lastReport = null;
  let runId = 0;

  dateInput.value = new Date().toLocaleString("ko-KR");

  menu.addEventListener("click", () => {
    ui.switchPage("#integratedCheckPage", menu);
  });

  startButton.addEventListener("click", runAll);
  saveButton.addEventListener("click", saveReport);

  async function runAll() {
    if (running) return;
    const selected = STEPS.filter(([key]) => options[key].checked);
    if (selected.length === 0) {
      ui.showToast("점검 항목을 한 개 이상 선택해 주세요.");
      return;
    }

    const currentRunId = runId + 1;
    runId = currentRunId;
    setRunning(true);
    dateInput.value = new Date().toLocaleString("ko-KR");
    lastReport = { sections: [] };
    progress.innerHTML = "";
    results.innerHTML = "";
    addProgress("통합 점검을 시작합니다.", `${selected.length}개 항목을 순서대로 점검합니다.`);

    for (const [, label, collector] of selected) {
      if (currentRunId !== runId) return;
      addProgress(`${label} 점검 중입니다...`);
      try {
        const section = await collector(currentRunId);
        if (currentRunId !== runId) return;
        lastReport.sections.push(section);
        addProgress(`${label} 점검을 완료했습니다.`, section.note || "");
      } catch (error) {
        if (currentRunId !== runId) return;
        lastReport.sections.push({ title: label, note: `점검 실패: ${error.message}`, blocks: [] });
        addProgress(`${label} 점검 실패`, error.message);
      }
    }

    if (currentRunId !== runId) return;
    addProgress("모든 점검을 완료했습니다.", "「증빙 저장」으로 보관함에 저장할 수 있습니다.");
    renderResults(lastReport);
    setRunning(false);
    saveButton.disabled = false;
    await ui.notifyComplete("통합 점검을 완료했습니다.", { achievementKey: "checksDone" });
  }

  // ── 항목별 수집기 ───────────────────────────────

  // 1. PC 사양 — 트리를 항목명/내용/비고 표로 평탄화 (저장장치·NIC는 5·4번과 중복이라 제외)
  const SPEC_SKIP_GROUPS = new Set(["저장장치", "NIC"]);

  async function collectSpec() {
    const hw = await window.magicWand.system.hardware();
    const groups = (hw.groups || []).filter((group) => !SPEC_SKIP_GROUPS.has(group.title));
    const rows = [];
    for (const group of groups) {
      for (const item of group.items || []) {
        flattenSpecItem(rows, group.title, item);
      }
      if (!(group.items || []).length) {
        rows.push([group.title, "확인 안 됨", ""]);
      }
    }
    return {
      title: "1. PC 사양",
      note: "",
      blocks: [{ type: "table", head: ["항목명", "내용", "비고"], rows }],
    };
  }

  function flattenSpecItem(rows, prefix, item, depth = 0) {
    const name = prefix ? `${prefix} · ${item.label}` : item.label;
    const hasChildren = Boolean(item.children && item.children.length);
    if (!hasChildren) {
      rows.push([name, item.value || "확인 안 됨", ""]);
      return;
    }
    if (item.value) rows.push([name, item.value, ""]);
    for (const child of item.children) {
      flattenSpecItem(rows, name, child, depth + 1);
    }
  }

  // 2. 운영체제 및 정품 인증
  async function collectActivation() {
    const act = await window.magicWand.security.activation();
    const rows = [
      ["운영체제", act.edition || "확인 안 됨", "정품 상태", act.status || "확인 안 됨"],
      ["버전", act.version || "확인 안 됨", "빌드", act.build || "확인 안 됨"],
    ];
    return {
      title: "2. 운영체제 및 정품 인증",
      note: "",
      blocks: [{ type: "kv4", rows }],
    };
  }

  // 3. 사용자 계정
  async function collectUsers() {
    const u = await window.magicWand.security.localUsers();
    const rows = (u.users || []).map((user) => [user.name, user.enabled ? "사용" : "사용 안 함", user.description || ""]);
    return {
      title: "3. 사용자 계정",
      note: `계정 ${rows.length}개`,
      blocks: [{ type: "table", head: ["계정명", "상태", "설명"], cols: ["28%", "14%", "58%"], rows }],
    };
  }

  // 4. 네트워크 구성
  async function collectNetwork() {
    const net = await window.magicWand.network.scan();
    const primary = net.primaryInterface || (net.privateInterfaces || [])[0] || {};
    const dns = primary.dnsServers || [];
    const subnet = primary.networkRange || "확인 안 됨";
    const rows = [
      ["공인 IP", net.publicIp || "확인 안 됨", "사설 IP", primary.privateIp || "확인 안 됨"],
      ["서브넷 마스크", subnet, "게이트웨이", primary.gateway || "확인 안 됨"],
      ["DNS 1", dns[0] || "확인 안 됨", "DNS 2", dns[1] || "확인 안 됨"],
    ];
    return {
      title: "4. 네트워크 구성",
      note: net.publicIp ? "" : "공인 IP 확인 안 됨",
      blocks: [{ type: "kv4", rows }],
    };
  }

  // 5. 하드웨어 점검
  async function collectHardware() {
    const result = await window.magicWand.hardware.check(Date.now());
    const rows = (result.tests || []).map((t) => [t.name, ui.statusLabel(t.status), `${t.detail || ""} ${t.hint || ""}`.trim()]);
    return {
      title: "5. 하드웨어 점검",
      note: result.summary || "",
      blocks: [{ type: "table", head: ["점검 항목명", "상태", "내용"], cols: ["26%", "12%", "62%"], rows }],
    };
  }

  // 6. 설치된 소프트웨어 목록
  async function collectSoftware() {
    const sw = await window.magicWand.system.software();
    const rows = (sw.items || []).map((s) => [s.name, s.version || "", s.publisher || "", s.installDate || ""]);
    return {
      title: "6. 설치된 소프트웨어 목록",
      note: `설치 프로그램 ${rows.length}개`,
      blocks: [{ type: "table", head: ["프로그램 명칭", "버전", "게시자", "설치일자"], cols: ["38%", "18%", "26%", "18%"], rows }],
    };
  }

  // 7. 위험 소프트웨어 점검
  async function collectThreat(currentRunId) {
    const result = await window.magicWand.threat.scan(currentRunId, { targets: [] });
    const items = result.items || [];
    const rows = items.map((item) => [
      item.name,
      item.status === "fail" ? "강한 의심" : "주의",
      `${item.source || ""} · ${item.reason || ""}${item.detail ? ` · ${item.detail}` : ""}`.trim(),
    ]);
    if (!rows.length) {
      rows.push(["의심 항목 없음", "정상", result.summary || "표시할 의심 항목이 없습니다."]);
    }
    return {
      title: "7. 위험 소프트웨어 점검",
      note: result.summary || "",
      blocks: [{ type: "table", head: ["점검 항목명", "상태", "내용"], cols: ["26%", "12%", "62%"], rows }],
    };
  }

  // 8. 공유 폴더 점검
  async function collectShare() {
    const result = await window.magicWand.share.list();
    const shares = (result.shares || []).filter((s) => !s.special);
    const rows = shares.map((s) => [s.name, s.path || "", s.description || ""]);
    if (!rows.length) {
      rows.push(["공유 폴더 없음", "", "공유 중인 폴더가 없습니다."]);
    }
    return {
      title: "8. 공유 폴더 점검",
      note: `공유 폴더 ${shares.length}개`,
      blocks: [{ type: "table", head: ["항목명", "경로", "내용"], cols: ["20%", "62%", "18%"], rows }],
    };
  }

  // ── 화면 렌더링 ─────────────────────────────────

  function renderResults(report) {
    results.innerHTML = "";
    if (!report.sections.length) {
      results.append(createIdle("표시할 점검 결과가 없습니다."));
      return;
    }
    for (const section of report.sections) {
      const item = document.createElement("article");
      item.className = "diagnostic-item ok ic-section";
      const head = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = section.title;
      head.append(strong);
      if (section.note) {
        const span = document.createElement("span");
        span.textContent = section.note;
        head.append(span);
      }
      item.append(head);
      for (const block of section.blocks) {
        item.append(renderBlock(block));
      }
      results.append(item);
    }
  }

  function renderBlock(block) {
    if (block.type === "kv4") {
      const table = document.createElement("table");
      table.className = "ic-table";
      const tbody = document.createElement("tbody");
      for (const row of block.rows) {
        const tr = document.createElement("tr");
        tr.append(cell("th", row[0]), cell("td", row[1]), cell("th", row[2]), cell("td", row[3]));
        tbody.append(tr);
      }
      table.append(tbody);
      return table;
    }
    // table
    const table = document.createElement("table");
    table.className = "ic-table";
    if (block.cols) {
      const colgroup = document.createElement("colgroup");
      for (const width of block.cols) {
        const col = document.createElement("col");
        col.style.width = width;
        colgroup.append(col);
      }
      table.append(colgroup);
    }
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const h of block.head) headRow.append(cell("th", h));
    thead.append(headRow);
    const tbody = document.createElement("tbody");
    if (!block.rows.length) {
      const tr = document.createElement("tr");
      const td = cell("td", "표시할 내용이 없습니다.");
      td.colSpan = block.head.length;
      tr.append(td);
      tbody.append(tr);
    }
    for (const row of block.rows) {
      const tr = document.createElement("tr");
      for (const v of row) tr.append(cell("td", v));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    return table;
  }

  function cell(tag, value) {
    const el = document.createElement(tag);
    el.textContent = value == null ? "" : String(value);
    return el;
  }

  function createIdle(message) {
    const p = document.createElement("p");
    p.className = "empty-inline";
    p.textContent = message;
    return p;
  }

  function addProgress(message, detail = "") {
    const card = document.createElement("article");
    card.className = "threat-progress-item";
    if (running) {
      card.classList.add("busy-card");
    }
    const head = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = message;
    const span = document.createElement("span");
    span.textContent = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    head.append(strong, span);
    card.append(head);
    if (detail) {
      const p = document.createElement("p");
      p.textContent = detail;
      card.append(p);
    }
    progress.append(card);
  }

  function setRunning(isRunning) {
    running = isRunning;
    startButton.disabled = isRunning;
    saveButton.disabled = isRunning || !lastReport;
    Object.values(options).forEach((el) => { el.disabled = isRunning; });
    headInputs.forEach((el) => { if (el !== dateInput) el.disabled = isRunning; });
    ui.setBusy(startButton, isRunning);
    if (!isRunning) {
      progress.querySelectorAll(".busy-card").forEach((card) => card.classList.remove("busy-card"));
    }
  }

  // ── 증빙 문서 저장 ──────────────────────────────

  async function saveReport() {
    if (!lastReport) {
      ui.showToast("저장할 점검 결과가 없습니다.");
      return;
    }
    const title = buildTitle();
    saveButton.disabled = true;
    try {
      const saved = await window.magicWand.formMaker.write({ title, html: buildReportHtml() });
      ui.showToast("점검 리포트를 보관함에 저장했습니다.");
      if (window.FormManager && typeof window.FormManager.refresh === "function") {
        window.FormManager.refresh();
      }
      return saved;
    } catch (error) {
      ui.showToast(`보관함 저장 실패: ${error.message}`);
    } finally {
      saveButton.disabled = !lastReport;
    }
  }

  function buildTitle() {
    const stamp = new Date().toISOString().slice(0, 10);
    const parts = ["PC 점검 리포트", assetTagInput.value.trim(), customerInput.value.trim(), stamp].filter(Boolean);
    return parts.join("_");
  }

  function buildReportHtml() {
    const esc = escapeHtml;
    let html = `<h1>PC 통합 점검 리포트</h1>`;
    // 머리말: 1줄 제목 / 2줄 내용 (구조파일 형식)
    const headHead = ["점검일", "고객·부서", "자산번호", "점검자", "서명"];
    const headBody = [
      dateInput.value,
      customerInput.value.trim() || "—",
      assetTagInput.value.trim() || "—",
      inspectorInput.value.trim() || "—",
      "(인)",
    ];
    html += `<table><thead><tr>${headHead.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>`;
    html += `<tbody><tr>${headBody.map((v) => `<td>${esc(v)}</td>`).join("")}</tr></tbody></table>`;

    for (const section of lastReport.sections) {
      html += `<h2>${esc(section.title)}</h2>`;
      if (section.note) html += `<p>${esc(section.note)}</p>`;
      for (const block of section.blocks) {
        html += blockToHtml(block, esc);
      }
    }
    return html;
  }

  function blockToHtml(block, esc) {
    if (block.type === "kv4") {
      const rows = block.rows
        .map((r) => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td><th>${esc(r[2])}</th><td>${esc(r[3])}</td></tr>`)
        .join("");
      return `<table><tbody>${rows}</tbody></table>`;
    }
    // table
    const colgroup = block.cols
      ? `<colgroup>${block.cols.map((w) => `<col style="width:${w}" />`).join("")}</colgroup>`
      : "";
    const headRow = `<tr>${block.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>`;
    const bodyRows = block.rows.length
      ? block.rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v == null ? "" : String(v))}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${block.head.length}">표시할 내용이 없습니다.</td></tr>`;
    const tableStyle = block.cols ? ' style="table-layout:fixed;width:100%;word-break:break-word"' : "";
    return `<table${tableStyle}>${colgroup}<thead>${headRow}</thead><tbody>${bodyRows}</tbody></table>`;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
})();
