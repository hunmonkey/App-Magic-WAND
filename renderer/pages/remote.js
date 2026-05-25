(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#remoteMenu");
  if (!menu || !ui || !window.magicWand?.remote) return;

  const api = window.magicWand.remote;
  const elements = {
    targetCount: document.querySelector("#remoteTargetCount"),
    targetList: document.querySelector("#remoteTargetList"),
    refreshBtn: document.querySelector("#remoteRefreshBtn"),
    selectAllBtn: document.querySelector("#remoteSelectAllBtn"),
    clearBtn: document.querySelector("#remoteClearBtn"),
    actionSelect: document.querySelector("#remoteActionSelect"),
    runBtn: document.querySelector("#remoteRunBtn"),
    status: document.querySelector("#remoteStatus"),
    resultList: document.querySelector("#remoteResultList"),
  };

  const actionLabels = {
    ping: "연결 확인",
    winrm: "WinRM 준비 확인",
    inventory: "기본 정보 조회",
  };

  let targets = [];
  let running = false;
  let currentJobId = "";

  api.onResult((payload) => {
    if (!payload || payload.jobId !== currentJobId) {
      return;
    }
    renderResult(payload);
  });

  menu.addEventListener("click", () => {
    ui.switchPage("#remotePage", menu);
  });

  elements.refreshBtn.addEventListener("click", loadTargets);
  elements.selectAllBtn.addEventListener("click", () => setAllTargets(true));
  elements.clearBtn.addEventListener("click", () => setAllTargets(false));
  elements.runBtn.addEventListener("click", runRemoteJob);
  elements.targetList.addEventListener("change", updateButtons);

  elements.targetList.append(createEmptyState("새로고침 버튼을 눌러 대상 PC 목록을 불러오세요."));
  updateButtons();

  async function loadTargets() {
    setRunning(false);
    elements.targetList.replaceChildren(ui.createLoadingState("자산 목록을 불러오는 중입니다."));
    elements.targetCount.textContent = "자산 목록을 확인하고 있습니다.";
    ui.setBusy(elements.refreshBtn, true);

    try {
      const result = await api.targets();
      targets = result.targets || [];
      renderTargets(result.messages || []);
    } catch (error) {
      targets = [];
      elements.targetCount.textContent = "대상 PC를 불러오지 못했습니다.";
      elements.targetList.replaceChildren(createEmptyState(`불러오기 실패: ${error.message}`));
    } finally {
      ui.setBusy(elements.refreshBtn, false);
    }
  }

  function renderTargets(messages) {
    elements.targetCount.textContent = targets.length
      ? `IP가 등록된 자산 ${targets.length}대를 선택할 수 있습니다.`
      : "선택할 수 있는 대상 PC가 없습니다.";

    if (!targets.length) {
      const message = messages[0] || "자산 목록에 IP가 있는 PC를 먼저 등록해 주세요.";
      elements.targetList.replaceChildren(createEmptyState(message));
      updateButtons();
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const target of targets) {
      const label = document.createElement("label");
      label.className = "remote-target";
      label.innerHTML = `
        <input type="checkbox" />
        <span>
          <strong></strong>
          <small></small>
        </span>
        <em></em>
      `;
      const checkbox = label.querySelector("input");
      checkbox.value = target.id;
      label.querySelector("strong").textContent = target.name || target.assetTag || target.ip;
      label.querySelector("small").textContent = [target.assetTag, target.location, target.owner].filter(Boolean).join(" · ") || "추가 정보 없음";
      label.querySelector("em").textContent = target.ip;
      fragment.append(label);
    }
    elements.targetList.replaceChildren(fragment);

    updateButtons();
  }

  function setAllTargets(checked) {
    elements.targetList.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
      checkbox.checked = checked;
    });
    updateButtons();
  }

  async function runRemoteJob() {
    const targetIds = selectedTargetIds();
    if (!targetIds.length) {
      ui.showToast("원격 점검할 PC를 선택해 주세요.");
      return;
    }

    const action = elements.actionSelect.value;
    currentJobId = `remote-${Date.now()}`;
    elements.resultList.replaceChildren();
    elements.status.textContent = `${actionLabels[action]} 점검을 시작했습니다.`;
    setRunning(true);

    try {
      const result = await api.run({ jobId: currentJobId, action, targetIds });
      elements.status.textContent = `완료: 정상 ${result.okCount}대, 확인 필요 ${result.failCount}대`;
      await ui.notifyComplete("원격 읽기 전용 점검을 완료했습니다.", { achievementKey: "checksDone" });
    } catch (error) {
      elements.status.textContent = "점검을 완료하지 못했습니다.";
      ui.showToast(`원격 점검 실패: ${error.message}`);
    } finally {
      setRunning(false);
    }
  }

  function renderResult(result) {
    const card = document.createElement("article");
    card.className = `remote-result-card ${result.status || "fail"}`;
    card.innerHTML = `
      <div>
        <strong></strong>
        <span></span>
      </div>
      <p></p>
    `;
    card.querySelector("strong").textContent = `${result.target?.name || result.target?.ip || "대상 PC"} (${result.target?.ip || "-"})`;
    card.querySelector("span").textContent = ui.statusLabel(result.status);
    card.querySelector("p").textContent = [result.summary, result.detail].filter(Boolean).join(" - ");
    elements.resultList.append(card);
    const completed = result.completed || (result.index || 0) + 1;
    elements.status.textContent = `진행 중: ${Math.min(completed, result.total)} / ${result.total}`;
  }

  function selectedTargetIds() {
    return [...elements.targetList.querySelectorAll("input[type='checkbox']:checked")].map((checkbox) => checkbox.value);
  }

  function updateButtons() {
    const hasTargets = targets.length > 0;
    const hasSelection = selectedTargetIds().length > 0;
    elements.selectAllBtn.disabled = !hasTargets || running;
    elements.clearBtn.disabled = !hasTargets || running;
    elements.runBtn.disabled = !hasSelection || running;
    elements.refreshBtn.disabled = running;
    elements.actionSelect.disabled = running;
  }

  function setRunning(nextRunning) {
    running = nextRunning;
    elements.runBtn.textContent = running ? "점검 중..." : "점검 시작";
    ui.setBusy(elements.runBtn, running);
    elements.targetList.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
      checkbox.disabled = running;
    });
    updateButtons();
  }

  function createEmptyState(message) {
    const element = document.createElement("p");
    element.className = "empty-inline";
    element.textContent = message;
    return element;
  }
})();
