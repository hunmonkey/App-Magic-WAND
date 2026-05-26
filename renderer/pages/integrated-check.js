(function () {
  // 통합 점검은 'PC 성능 점검' 화면 안 '증빙 리포트' 패널로 흡수됨.
  const ui = window.MagicWand;
  if (!ui) return;

  const dateInput = document.querySelector("#icDate");
  const customerInput = document.querySelector("#icCustomer");
  const assetTagInput = document.querySelector("#icAssetTag");
  const inspectorInput = document.querySelector("#icInspector");
  const refreshButton = document.querySelector("#icRefreshButton");
  const startButton = document.querySelector("#icStartButton");
  const printButton = document.querySelector("#icPrintButton");
  const saveButton = document.querySelector("#icSaveButton");
  const progress = document.querySelector("#icProgress");
  const results = document.querySelector("#icResults");

  // 리포트 패널이 화면에 없으면(혹시 모를 경우) 조용히 빠져나간다.
  if (!startButton || !results) return;

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

  const STATUS_TONE_MAP = new Map([
    ["\uc815\uc0c1", "ok"],
    ["\uc591\ud638", "ok"],
    ["\uc88b\uc74c", "ok"],
    ["\uc548\uc804", "ok"],
    ["\uc8fc\uc758", "warn"],
    ["\ud655\uc778 \ud544\uc694", "warn"],
    ["\uc810\uac80 \ud544\uc694", "warn"],
    ["\uacbd\uace0", "warn"],
    ["\uc758\uc2ec", "warn"],
    ["\uc2ec\uac01", "fail"],
    ["\ubb38\uc81c", "fail"],
    ["\uc2e4\ud328", "fail"],
    ["\uc704\ud5d8", "fail"],
    ["\uc624\ub958", "fail"],
    ["\uac15\ud55c \uc758\uc2ec", "fail"],
  ]);

  const STATUS_BADGE_STYLES = {
    ok: "display:inline-block;min-width:44px;border:1px solid rgba(21,128,61,.28);border-radius:999px;padding:2px 8px;text-align:center;font-size:12px;font-weight:700;line-height:1.2;color:#15803d;background:#e8f6ee;",
    warn: "display:inline-block;min-width:44px;border:1px solid rgba(180,83,9,.3);border-radius:999px;padding:2px 8px;text-align:center;font-size:12px;font-weight:700;line-height:1.2;color:#b45309;background:#fff2d8;",
    fail: "display:inline-block;min-width:44px;border:1px solid rgba(180,35,24,.28);border-radius:999px;padding:2px 8px;text-align:center;font-size:12px;font-weight:700;line-height:1.2;color:#b42318;background:#fdecea;",
  };

  dateInput.value = new Date().toLocaleString("ko-KR");

  refreshButton.addEventListener("click", refreshReport);
  startButton.addEventListener("click", runAll);
  printButton.addEventListener("click", () => {
    if (!lastReport) {
      ui.showToast("먼저 「리포트 생성」을 눌러 주세요.");
      return;
    }
    // 화면 전체가 아니라 리포트 HTML만 깨끗하게 PDF로 만든다.
    ui.exportPdf({ defaultFileName: buildTitle(), html: buildReportDocument() });
  });
  saveButton.addEventListener("click", saveReport);

  function refreshReport() {
    if (running) return;
    dateInput.value = new Date().toLocaleString("ko-KR");
    lastReport = null;
    progress.replaceChildren();
    results.replaceChildren();
    printButton.disabled = true;
    saveButton.disabled = true;
    ui.showToast("증빙 리포트를 초기화했습니다.");
  }

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
    progress.replaceChildren();
    results.replaceChildren();
    addProgress("증빙 리포트 점검을 시작합니다.", `${selected.length}개 항목을 순서대로 점검합니다.`);

    for (const [, label, collector] of selected) {
      if (currentRunId !== runId) return;
      const progressCard = addProgress(`${label} 검사중입니다.`, "", "running");
      try {
        const section = await collector(currentRunId);
        if (currentRunId !== runId) return;
        lastReport.sections.push(section);
        updateProgress(progressCard, `${label} 완료되었습니다.`, section.note || "", "done");
      } catch (error) {
        if (currentRunId !== runId) return;
        lastReport.sections.push({ title: label, note: `점검 실패: ${error.message}`, blocks: [] });
        updateProgress(progressCard, `${label} 점검 실패`, error.message, "error");
      }
    }

    if (currentRunId !== runId) return;
    addProgress("모든 점검을 완료했습니다.", "「증빙 저장」으로 보관함에 저장할 수 있습니다.", "done");
    renderResults(lastReport);
    setRunning(false);
    printButton.disabled = false;
    saveButton.disabled = false;
    await ui.notifyComplete("증빙 리포트를 완성했습니다.", { achievementKey: "checksDone" });
  }

  // ── 항목별 수집기 ───────────────────────────────

  // PC 성능 점검이 방금 돌린 스캔이 있으면(5분 이내) 다시 스캔하지 않고 그 결과를 재사용한다.
  function reusableScan() {
    const scan = window.MagicWandHealth && typeof window.MagicWandHealth.getScan === "function"
      ? window.MagicWandHealth.getScan()
      : null;
    if (scan && Date.now() - (scan.at || 0) < 5 * 60 * 1000) {
      return scan;
    }
    return null;
  }

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
    const act = reusableScan()?.activation || (await window.magicWand.security.activation());
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
    const result = reusableScan()?.hardware || (await window.magicWand.hardware.check(Date.now()));
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
    const result = reusableScan()?.threat || (await window.magicWand.threat.scan(currentRunId, { targets: [] }));
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
    if (!report.sections.length) {
      results.replaceChildren(createIdle("표시할 점검 결과가 없습니다."));
      return;
    }
    const fragment = document.createDocumentFragment();
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
      fragment.append(item);
    }
    results.replaceChildren(fragment);
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
      for (const v of row) tr.append(tableCell(v));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    return table;
  }

  function tableCell(value) {
    const tone = statusTone(value);
    if (!tone) return cell("td", value);
    const td = cell("td", "");
    td.className = "ic-status-cell";
    const badge = document.createElement("span");
    badge.className = `ic-status-badge ic-status-${tone}`;
    badge.textContent = value == null ? "" : String(value);
    td.append(badge);
    return td;
  }

  function statusTone(value) {
    const text = String(value == null ? "" : value).trim();
    return STATUS_TONE_MAP.get(text) || "";
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

  function addProgress(message, detail = "", status = "info") {
    const card = document.createElement("article");
    card.className = "threat-progress-item ic-progress-item";
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
    setProgressStatus(card, status);
    return card;
  }

  function updateProgress(card, message, detail = "", status = "info") {
    if (!card) return;
    const strong = card.querySelector("strong");
    const time = card.querySelector("span");
    if (strong) strong.textContent = message;
    if (time) time.textContent = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    let detailNode = card.querySelector("p");
    if (detail) {
      if (!detailNode) {
        detailNode = document.createElement("p");
        card.append(detailNode);
      }
      detailNode.textContent = detail;
    } else if (detailNode) {
      detailNode.remove();
    }
    setProgressStatus(card, status);
  }

  function setProgressStatus(card, status) {
    card.classList.remove("ic-progress-running", "ic-progress-done", "ic-progress-error");
    if (status === "running" || status === "done" || status === "error") {
      card.classList.add(`ic-progress-${status}`);
    }
  }

  function setRunning(isRunning) {
    running = isRunning;
    refreshButton.disabled = isRunning;
    startButton.disabled = isRunning;
    printButton.disabled = isRunning || !lastReport;
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

  // PDF 인쇄용: 리포트 본문을 독립 실행되는 인쇄용 HTML 문서로 감싼다.
  function buildReportDocument() {
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { margin: 22px; font-family: 'Malgun Gothic','맑은 고딕',sans-serif; color: #111; }
  h1 { font-size: 20px; margin: 0 0 14px; }
  h2 { font-size: 15px; margin: 18px 0 6px; border-bottom: 2px solid #333; padding-bottom: 4px; }
  p { font-size: 12px; color: #444; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; font-size: 12px; table-layout: fixed; word-break: break-word; }
  th, td { border: 1px solid #999; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f0f3f8; }
</style></head><body>${buildReportHtml()}</body></html>`;
  }

  function buildReportHtml() {
    const esc = escapeHtml;
    let html = `<h1>PC 점검 보고서</h1>`;
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
      ? block.rows.map((r) => `<tr>${r.map((v) => tableCellHtml(v, esc)).join("")}</tr>`).join("")
      : `<tr><td colspan="${block.head.length}">표시할 내용이 없습니다.</td></tr>`;
    const tableStyle = block.cols ? ' style="table-layout:fixed;width:100%;word-break:break-word"' : "";
    return `<table${tableStyle}>${colgroup}<thead>${headRow}</thead><tbody>${bodyRows}</tbody></table>`;
  }

  function tableCellHtml(value, esc) {
    const tone = statusTone(value);
    const text = esc(value == null ? "" : String(value));
    if (!tone) return `<td>${text}</td>`;
    return `<td style="vertical-align:middle"><span style="${STATUS_BADGE_STYLES[tone]}">${text}</span></td>`;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
})();
