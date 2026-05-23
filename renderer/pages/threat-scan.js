(function () {
  const TARGET_STORAGE_KEY = "magicWandThreatScanTargets";
  const ui = window.MagicWand;
  const menu = document.querySelector("#checkMenu");
  if (!menu || !ui) {
    return;
  }

  const list = document.querySelector("#threatList");
  const startButton = document.querySelector("#threatScanStartButton");
  const stopButton = document.querySelector("#threatScanStopButton");
  const rerunButton = document.querySelector("#threatScanButton");
  const saveButton = document.querySelector("#threatSaveText");
  const reloadTreeButton = document.querySelector("#threatReloadTreeButton");
  const clearTargetButton = document.querySelector("#threatClearTargetButton");
  const targetSummary = document.querySelector("#threatTargetSummary");
  const folderTree = document.querySelector("#threatFolderTree");

  let runId = 0;
  let lastResult = null;
  let scanRunning = false;
  let progressLog = [];
  let targetPaths = loadTargets();
  let lastScanTargets = [];
  let lastSummaryText = "";
  const treeNodes = new Map();

  window.magicWand.threat.onScanProgress(handleProgress);

  menu.addEventListener("click", () => {
    ui.switchPage("#hardwareCheckPage", menu);
  });

  startButton.addEventListener("click", runScan);
  rerunButton.addEventListener("click", runScan);
  stopButton.addEventListener("click", stopScan);
  saveButton.addEventListener("click", saveText);
  reloadTreeButton.addEventListener("click", loadFolderRoots);
  clearTargetButton.addEventListener("click", clearTargets);
  folderTree.addEventListener("click", handleTreeClick);
  folderTree.addEventListener("change", handleTreeChange);

  renderTargetSummary();
  setRunning(false);
  renderFolderTreeMessage("검사대상 폴더의 새로고침 버튼을 눌러 폴더 트리를 불러오세요.");
  list.append(createIdleMessage("검사시작 버튼을 눌러 위험 소프트웨어를 점검하세요."));

  async function runScan() {
    const currentRunId = runId + 1;
    runId = currentRunId;
    lastResult = null;
    lastScanTargets = [...targetPaths];
    lastSummaryText = "위험 소프트웨어를 점검 중입니다.";
    progressLog = [];
    setRunning(true);
    list.innerHTML = "";
    const targetText = targetPaths.length > 0 ? `${targetPaths.length}개 선택 폴더` : "기본 검사대상";
    addProgress("검사를 준비하고 있습니다.", `${targetText}을 대상으로 Microsoft Defender와 YARA 룰 검사를 실행합니다.`);

    try {
      const result = await window.magicWand.threat.scan(currentRunId, { targets: targetPaths });
      if (currentRunId !== runId) {
        return;
      }

      lastResult = result;
      const notes = result.messages?.length ? ` (${result.messages.join(" / ")})` : "";
      lastSummaryText = `${result.summary || "점검 완료"}${notes}`;
      addProgress("검사를 완료했습니다.", lastSummaryText);
      renderFinalResult(result.items ?? []);
      await ui.notifyComplete("위험 소프트웨어 점검을 완료했습니다.", { achievementKey: "checksDone" });
    } catch (error) {
      if (currentRunId === runId) {
        lastSummaryText = `점검 실패: ${error.message}`;
        addProgress("점검 실패", error.message);
      }
    } finally {
      if (currentRunId === runId) {
        setRunning(false);
      }
    }
  }

  function handleProgress(payload) {
    if (!payload || payload.runId !== runId || lastResult) {
      return;
    }

    addProgress(payload.message, payload.detail, payload.time);
  }

  function stopScan() {
    runId += 1;
    lastResult = null;
    lastSummaryText = "검사가 종료되었습니다.";
    addProgress("검사가 종료되었습니다.", "진행 중이던 검사를 중단했습니다.");
    setRunning(false);
  }

  async function loadFolderRoots() {
    if (scanRunning) {
      return;
    }

    treeNodes.clear();
    renderFolderTreeMessage("드라이브를 불러오는 중입니다.");

    try {
      const roots = await window.magicWand.threat.folderRoots();
      for (const root of roots ?? []) {
        treeNodes.set(root.path, {
          name: root.name,
          path: root.path,
          depth: 0,
          expanded: false,
          loaded: false,
          loading: false,
          hasChildren: root.hasChildren,
          children: [],
        });
      }
      renderFolderTree();
    } catch (error) {
      renderFolderTreeMessage(`폴더 트리를 불러오지 못했습니다: ${error.message}`);
    }
  }

  async function handleTreeClick(event) {
    const button = event.target.closest("button[data-folder-path]");
    if (!button || scanRunning) {
      return;
    }

    const node = treeNodes.get(button.dataset.folderPath);
    if (!node || !node.hasChildren) {
      return;
    }

    if (node.expanded) {
      node.expanded = false;
      renderFolderTree();
      return;
    }

    node.expanded = true;
    if (!node.loaded) {
      await loadChildren(node);
    }
    renderFolderTree();
  }

  function handleTreeChange(event) {
    const checkbox = event.target.closest("input[data-folder-path]");
    if (!checkbox || scanRunning) {
      return;
    }

    const folderPath = checkbox.dataset.folderPath;
    if (checkbox.checked) {
      addTarget(folderPath);
    } else {
      removeTarget(folderPath);
    }
  }

  async function loadChildren(node) {
    node.loading = true;
    renderFolderTree();

    try {
      const children = await window.magicWand.threat.folderChildren(node.path);
      node.children = (children ?? []).map((child) => child.path);
      for (const child of children ?? []) {
        treeNodes.set(child.path, {
          name: child.name,
          path: child.path,
          depth: node.depth + 1,
          expanded: false,
          loaded: false,
          loading: false,
          hasChildren: child.hasChildren,
          children: [],
        });
      }
      node.loaded = true;
    } catch {
      node.children = [];
      node.loaded = true;
    } finally {
      node.loading = false;
    }
  }

  function addTarget(folderPath) {
    if (!targetPaths.some((item) => item.toLowerCase() === folderPath.toLowerCase())) {
      targetPaths.push(folderPath);
      saveTargets();
      renderTargetSummary();
    }
  }

  function removeTarget(folderPath) {
    targetPaths = targetPaths.filter((item) => item.toLowerCase() !== folderPath.toLowerCase());
    saveTargets();
    renderTargetSummary();
  }

  function clearTargets() {
    targetPaths = [];
    saveTargets();
    renderTargetSummary();
    renderFolderTree();
  }

  async function saveText() {
    if (!lastResult) {
      ui.showToast("저장할 위험 소프트웨어 점검 결과가 없습니다.");
      return;
    }

    try {
      const result = await window.magicWand.hardware.saveText({
        title: "위험 소프트웨어 점검 TXT 저장",
        defaultPath: `Risk_Software_Check_${getDateStamp()}.txt`,
        text: buildThreatText(lastResult),
      });
      if (!result?.canceled) {
        ui.showToast("위험 소프트웨어 점검 결과를 TXT로 저장했습니다.");
      }
    } catch (error) {
      ui.showToast(`TXT 저장 실패: ${error.message}`);
    }
  }

  function addProgress(message, detail = "", time = "") {
    progressLog.push({
      message: message || "검사 진행 중",
      detail: detail || "",
      time: time || new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    });
    renderProgress();
  }

  function renderProgress() {
    list.innerHTML = "";

    for (const entry of progressLog) {
    const card = document.createElement("article");
    card.className = "threat-progress-item";
    if (scanRunning) {
      card.classList.add("busy-card");
    }

      const head = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = entry.message;
      const span = document.createElement("span");
      span.textContent = entry.time;
      head.append(strong, span);

      const detail = document.createElement("p");
      detail.textContent = entry.detail;

      card.append(head, detail);
      list.append(card);
    }
  }

  function renderFinalResult(items) {
    const dangerCount = items.filter((item) => item.status === "fail").length;
    const warnCount = items.filter((item) => item.status === "warn").length;

    const summaryCard = document.createElement("article");
    summaryCard.className = "threat-result-summary";

    const title = document.createElement("strong");
    title.textContent = "최종 결과";

    const detail = document.createElement("p");
    detail.textContent =
      items.length > 0
        ? `의심 항목 ${items.length}개가 표시되었습니다. 강한 의심 ${dangerCount}개, 주의 ${warnCount}개입니다.`
        : "표시할 의심 항목이 없습니다.";

    summaryCard.append(title, detail);
    list.prepend(summaryCard);

    if (items.length === 0) {
      return;
    }

    let anchor = summaryCard;
    for (const item of items) {
      const card = createThreatItem(item);
      anchor.after(card);
      anchor = card;
    }
  }

  function createThreatItem(item) {
    const card = document.createElement("article");
    card.className = `threat-item ${item.status}`;

    const head = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = item.name;
    const badge = document.createElement("span");
    badge.textContent = item.status === "fail" ? "강한 의심" : "주의";
    head.append(strong, badge);

    const meta = document.createElement("p");
    meta.className = "threat-meta";
    meta.textContent = `${item.source} · ${item.reason}`;

    const detail = document.createElement("p");
    detail.className = "threat-detail";
    detail.textContent = item.detail || "";

    card.append(head, meta, detail);
    return card;
  }

  function renderFolderTree() {
    folderTree.innerHTML = "";
    const visibleNodes = getVisibleNodes();

    if (visibleNodes.length === 0) {
      renderFolderTreeMessage("표시할 드라이브가 없습니다.");
      return;
    }

    for (const node of visibleNodes) {
      const row = document.createElement("div");
      row.className = "threat-folder-node";
      row.style.paddingLeft = `${node.depth * 14}px`;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.dataset.folderPath = node.path;
      toggle.disabled = scanRunning || !node.hasChildren;
      toggle.textContent = node.loading ? "..." : node.hasChildren ? (node.expanded ? "v" : ">") : "";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.folderPath = node.path;
      checkbox.checked = isSelected(node.path);
      checkbox.disabled = scanRunning;

      const name = document.createElement("span");
      name.className = "threat-folder-name";
      name.title = node.path;
      name.textContent = node.name;

      row.append(toggle, checkbox, name);
      folderTree.append(row);
    }
  }

  function renderFolderTreeMessage(message) {
    folderTree.innerHTML = "";
    const empty = document.createElement("p");
    empty.className = "threat-folder-empty";
    empty.textContent = message;
    folderTree.append(empty);
  }

  function createIdleMessage(message) {
    const empty = document.createElement("p");
    empty.className = "empty-inline";
    empty.textContent = message;
    return empty;
  }

  function getVisibleNodes() {
    const roots = [...treeNodes.values()].filter((node) => node.depth === 0);
    const visible = [];

    for (const root of roots) {
      appendNode(root);
    }

    return visible;

    function appendNode(node) {
      visible.push(node);
      if (!node.expanded) {
        return;
      }
      for (const childPath of node.children) {
        const child = treeNodes.get(childPath);
        if (child) {
          appendNode(child);
        }
      }
    }
  }

  function renderTargetSummary() {
    if (targetPaths.length === 0) {
      targetSummary.textContent = "선택한 폴더가 없습니다. 기본 검사대상을 사용합니다.";
      targetSummary.title = "";
    } else {
      targetSummary.textContent = `선택한 폴더 ${targetPaths.length}개`;
      targetSummary.title = targetPaths.join("\n");
    }
    clearTargetButton.disabled = scanRunning || targetPaths.length === 0;
  }

  function buildThreatText(result) {
    const lines = [
      "위험 소프트웨어 점검",
      `저장일: ${new Date().toLocaleString("ko-KR")}`,
      "",
      "검사대상",
      ...(lastScanTargets.length > 0 ? lastScanTargets.map((target) => `- ${target}`) : ["- 기본 검사대상"]),
      "",
      `요약: ${lastSummaryText || "점검 결과 없음"}`,
      "",
      "검사 진행 기록",
    ];

    if (progressLog.length === 0) {
      lines.push("- 진행 기록 없음");
    }

    for (const entry of progressLog) {
      lines.push(`- ${entry.time} ${entry.message}`);
      if (entry.detail) {
        lines.push(`  -- ${entry.detail}`);
      }
    }

    lines.push(
      "",
      "점검 결과",
    );

    const items = result.items ?? [];
    if (items.length === 0) {
      lines.push("");
      lines.push("- 표시할 의심 항목이 없습니다.");
    }

    for (const item of items) {
      lines.push("");
      lines.push(`- ${item.name}`);
      lines.push(`  상태: ${item.status === "fail" ? "강한 의심" : "주의"}`);
      lines.push(`  위치: ${item.source}`);
      lines.push(`  사유: ${item.reason}`);
      if (item.detail) {
        lines.push(`  상세: ${item.detail}`);
      }
    }

    return lines.join("\n");
  }

  function setRunning(isRunning) {
    scanRunning = isRunning;
    startButton.disabled = isRunning;
    rerunButton.disabled = isRunning;
    stopButton.disabled = !isRunning;
    saveButton.disabled = isRunning || !lastResult;
    reloadTreeButton.disabled = isRunning;
    clearTargetButton.disabled = isRunning || targetPaths.length === 0;
    ui.setBusy(startButton, isRunning);
    ui.setBusy(rerunButton, isRunning);
    if (!isRunning) {
      list.querySelectorAll(".busy-card").forEach((card) => card.classList.remove("busy-card"));
    }
    renderFolderTree();
  }

  function isSelected(folderPath) {
    return targetPaths.some((target) => target.toLowerCase() === folderPath.toLowerCase());
  }

  function loadTargets() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(TARGET_STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  }

  function saveTargets() {
    window.localStorage.setItem(TARGET_STORAGE_KEY, JSON.stringify(targetPaths));
  }

  function getDateStamp() {
    return new Date().toISOString().slice(0, 10);
  }
})();
