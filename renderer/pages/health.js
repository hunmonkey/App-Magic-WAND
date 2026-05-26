(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#healthMenu");
  if (!menu || !ui) return;

  const api = window.magicWand.health;
  const runBtn = document.querySelector("#healthRunBtn");
  const summary = document.querySelector("#healthSummary");
  const scoreValue = document.querySelector("#healthScoreValue");
  const gradeValue = document.querySelector("#healthGradeValue");
  const gaugeFill = document.querySelector("#healthGaugeFill");
  const gaugeWrap = gaugeFill.closest(".health-gauge-wrap");
  const breakdown = document.querySelector("#healthBreakdown");
  const snapshotBtn = document.querySelector("#healthSnapshotBtn");
  const snapshotSelect = document.querySelector("#healthSnapshotSelect");
  const compareBtn = document.querySelector("#healthCompareBtn");
  const snapshotDeleteBtn = document.querySelector("#healthSnapshotDeleteBtn");
  const compareResult = document.querySelector("#healthCompareResult");
  const bootRefreshBtn = document.querySelector("#bootRefreshBtn");
  const bootSummary = document.querySelector("#bootSummary");
  const bootLatest = document.querySelector("#bootLatest");
  const bootAverage = document.querySelector("#bootAverage");
  const bootBest = document.querySelector("#bootBest");
  const tempRefreshBtn = document.querySelector("#tempRefreshBtn");
  const tempSummary = document.querySelector("#tempSummary");
  const tempGaugeList = document.querySelector("#tempGaugeList");

  // 원형 게이지 둘레 길이 (반지름 52)
  const CIRC = 2 * Math.PI * 52;
  gaugeFill.style.strokeDasharray = String(CIRC);
  gaugeFill.style.strokeDashoffset = String(CIRC);

  // ── 점수 규칙 (기본값, 2026-05-23 확정) ─────────────
  // 100점에서 시작해 항목별로 감점한다.
  const PENALTY = {
    hwWarn: 8, // 하드웨어 점검 '주의' 1건당
    hwFail: 18, // 하드웨어 점검 '문제' 1건당
    threatWarn: 5, // 위험 SW '주의' 1건당
    threatFail: 15, // 위험 SW '강한 의심' 1건당
    threatCap: 40, // 위험 SW 감점 상한
    notActivated: 10, // 정품 인증 안 됨
  };
  const CHECK_STEPS = [
    {
      id: "hardware",
      label: "하드웨어 점검",
      detail: "디스크, 메모리, SMART, 온도, 배터리 확인",
    },
    {
      id: "threat",
      label: "위험 소프트웨어 점검",
      detail: "실행 프로그램, 시작프로그램, Defender/YARA 확인",
    },
    {
      id: "activation",
      label: "정품 인증 확인",
      detail: "Windows 정품 인증 상태 확인",
    },
  ];

  let running = false;
  let lastResult = null; // { score, grade, items }
  let lastScan = null; // 증빙 리포트가 재사용할 직전 스캔 원본 { hardware, threat, activation, at }
  let snapshots = [];
  let loaded = false;
  let activeRunId = 0;
  let currentStepId = "idle";
  let failedStepId = "";
  let liveProgress = createLiveProgress();

  // 증빙 리포트(통합 점검 흡수)가 같은 스캔 결과를 다시 쓰도록 노출한다.
  window.MagicWandHealth = {
    getScan: () => lastScan,
  };

  window.magicWand.hardware.onCheckProgress(handleHardwareProgress);
  window.magicWand.threat.onScanProgress(handleThreatProgress);

  menu.addEventListener("click", () => {
    ui.switchPage("#healthPage", menu);
    if (!loaded) {
      loaded = true;
      loadSnapshots();
    }
  });

  runBtn.addEventListener("click", run);
  bootRefreshBtn.addEventListener("click", loadBootTime);
  tempRefreshBtn.addEventListener("click", loadTemps);
  snapshotBtn.addEventListener("click", saveSnapshot);
  compareBtn.addEventListener("click", compare);
  snapshotDeleteBtn.addEventListener("click", deleteSnapshot);
  snapshotSelect.addEventListener("change", updateSnapshotButtons);

  async function loadWidgets() {
    await Promise.all([loadBootTime(), loadTemps()]);
  }

  async function loadBootTime() {
    bootRefreshBtn.disabled = true;
    ui.setBusy(bootRefreshBtn, true);
    bootSummary.textContent = "부팅 기록을 조회하는 중입니다.";
    try {
      const result = await api.bootTime();
      renderBootTime(result);
    } catch (error) {
      bootSummary.textContent = `부팅 기록 조회 실패: ${error.message}`;
      bootLatest.textContent = "—";
      bootAverage.textContent = "—";
      bootBest.textContent = "—";
    } finally {
      bootRefreshBtn.disabled = false;
      ui.setBusy(bootRefreshBtn, false);
    }
  }

  async function loadTemps() {
    tempRefreshBtn.disabled = true;
    ui.setBusy(tempRefreshBtn, true);
    tempSummary.textContent = "온도 센서를 조회하는 중입니다.";
    tempGaugeList.replaceChildren(ui.createLoadingState("온도 조회 중입니다."));
    try {
      const result = await api.temps();
      renderTemps(result);
    } catch (error) {
      tempSummary.textContent = `온도 조회 실패: ${error.message}`;
      tempGaugeList.replaceChildren(createIdle("온도 정보를 읽지 못했습니다."));
    } finally {
      tempRefreshBtn.disabled = false;
      ui.setBusy(tempRefreshBtn, false);
    }
  }

  function renderBootTime(result) {
    bootSummary.textContent = result.message || "부팅 기록 조회가 끝났습니다.";
    const stats = result.stats;
    if (!stats) {
      bootLatest.textContent = "—";
      bootAverage.textContent = "—";
      bootBest.textContent = "—";
      return;
    }
    bootLatest.textContent = formatDuration(stats.latest?.durationMs);
    bootAverage.textContent = formatDuration(stats.averageMs);
    bootBest.textContent = formatDuration(stats.bestMs);
  }

  function renderTemps(result) {
    tempSummary.textContent = result.message || "온도 조회가 끝났습니다.";
    const groups = result.groups || [];
    if (!groups.length) {
      tempGaugeList.replaceChildren(createIdle("표시할 온도 센서가 없습니다."));
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const group of groups) {
      const card = document.createElement("article");
      card.className = `temp-gauge-card ${group.status}`;
      card.innerHTML = `
        <div class="temp-gauge-head">
          <strong></strong>
          <span></span>
        </div>
        <div class="temp-meter"><span></span></div>
        <p></p>
      `;
      card.querySelector("strong").textContent = group.label;
      card.querySelector(".temp-gauge-head span").textContent = Number.isFinite(group.max) ? `${group.max.toFixed(1)}°C` : "확인 안 됨";
      card.querySelector(".temp-meter span").style.width = `${Math.max(0, Math.min(100, Number(group.max) || 0))}%`;
      card.querySelector("p").textContent = (group.sensors || [])
        .slice(0, 3)
        .map((sensor) => `${sensor.hardwareName || "센서"} ${sensor.name || ""} ${Number(sensor.value).toFixed(1)}°C`.trim())
        .join(" · ");
      fragment.append(card);
    }
    tempGaugeList.replaceChildren(fragment);
  }

  async function run() {
    if (running) return;
    const runId = Date.now();
    activeRunId = runId;
    currentStepId = "hardware";
    failedStepId = "";
    liveProgress = createLiveProgress();
    setRunning(true);
    summary.textContent = "PC 상태를 점검하는 중입니다...";
    renderLiveProgress();

    const items = []; // 점수·스냅샷·비교용: 감점(주의/문제) 항목만
    const breakdownItems = []; // 화면 표시용: 정상 항목까지 모두 포함
    let score = 100;

    try {
      // 1) 하드웨어 점검
      const hw = await window.magicWand.hardware.check(runId);
      if (activeRunId !== runId) {
        return;
      }
      currentStepId = "threat";
      renderLiveProgress();
      for (const test of hw.tests || []) {
        const penalty = test.status === "fail" ? PENALTY.hwFail : test.status === "warn" ? PENALTY.hwWarn : 0;
        const it = item(`hw`, `하드웨어 · ${test.name}`, test.status, penalty, test.detail || "", test.hint || "");
        breakdownItems.push(it);
        if (penalty > 0) {
          score -= penalty;
          items.push(it);
        }
      }

      // 2) 위험 소프트웨어 점검 (상한 적용)
      const threat = await window.magicWand.threat.scan(runId, { targets: [] });
      if (activeRunId !== runId) {
        return;
      }
      currentStepId = "activation";
      renderLiveProgress();
      const threatList = threat.items || [];
      if (threatList.length === 0) {
        breakdownItems.push(
          item("threat", "위험 소프트웨어 점검", "ok", 0, "실행 프로그램·시작프로그램·Defender/YARA에서 위험 신호가 없습니다.", ""),
        );
      }
      let threatPenalty = 0;
      for (const t of threatList) {
        const p = t.status === "fail" ? PENALTY.threatFail : PENALTY.threatWarn;
        threatPenalty += p;
        const it = item(
          "threat",
          `위험 SW · ${t.name}`,
          t.status === "fail" ? "fail" : "warn",
          p,
          t.reason || t.source || "",
          "「점검 : 소프트웨어」 화면에서 자세한 내용을 확인하고 의심 항목을 정리할 수 있습니다.",
        );
        breakdownItems.push(it);
        items.push(it);
      }
      threatPenalty = Math.min(threatPenalty, PENALTY.threatCap);
      score -= threatPenalty;

      // 3) 정품 인증
      const act = await window.magicWand.security.activation();
      const status = String(act.status || "");
      const activated = /정품|인증/.test(status) && !/안\s*됨|아님|비정품|만료/.test(status);
      if (status && !activated) {
        score -= PENALTY.notActivated;
        const it = item(
          "activation",
          "정품 인증",
          "warn",
          PENALTY.notActivated,
          status,
          "Windows 정품 인증 설정에서 인증 상태를 확인하고 정품 키를 입력할 수 있습니다.",
        );
        breakdownItems.push(it);
        items.push(it);
      } else if (status) {
        breakdownItems.push(item("activation", "정품 인증", "ok", 0, status, ""));
      }

      // 증빙 리포트가 다시 스캔하지 않도록 이번 점검 원본을 보관한다.
      lastScan = { hardware: hw, threat, activation: act, at: Date.now() };
    } catch (error) {
      failedStepId = currentStepId;
      ui.showToast(`점검 중 오류가 발생했습니다: ${error.message}`);
      setRunning(false);
      activeRunId = 0;
      // 스캔 가운데 표시를 점검 전 상태로 되돌린다.
      gaugeWrap.classList.remove("is-done");
      scoreValue.textContent = "—";
      gradeValue.textContent = "점검 전";
      summary.textContent = "점검에 실패했습니다. 다시 시도해 주세요.";
      breakdown.replaceChildren(createIdle("점검에 실패했습니다."));
      return;
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const grade = gradeOf(score);
    lastResult = { score, grade, items };
    renderScore(lastResult);
    renderBreakdown(breakdownItems);
    setRunning(false);
    activeRunId = 0;
    currentStepId = "done";
    snapshotBtn.disabled = false;
    summary.textContent = items.length
      ? `점검 완료 · ${items.length}개 항목에서 감점이 있었습니다.`
      : "점검 완료 · 감점 항목 없이 모두 정상입니다.";
    await ui.notifyComplete("PC 성능 점검을 완료했습니다.", { achievementKey: "checksDone" });
  }

  function createLiveProgress() {
    return {
      hardwareTests: [],
      hardwareMessages: [],
      threatEntries: [],
    };
  }

  function handleHardwareProgress(payload) {
    if (!payload || payload.runId !== activeRunId || !running) {
      return;
    }

    liveProgress.hardwareTests = Array.isArray(payload.tests) ? payload.tests : [];
    liveProgress.hardwareMessages = Array.isArray(payload.messages) ? payload.messages : [];
    renderLiveProgress();
  }

  function handleThreatProgress(payload) {
    if (!payload || payload.runId !== activeRunId || !running) {
      return;
    }

    const entry = {
      message: payload.message || "위험 소프트웨어 검사 진행 중",
      detail: payload.detail || "",
      time: payload.time || new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };
    const key = `${entry.time}|${entry.message}|${entry.detail}`;
    const hasSameEntry = liveProgress.threatEntries.some((item) => `${item.time}|${item.message}|${item.detail}` === key);
    if (!hasSameEntry) {
      liveProgress.threatEntries.push(entry);
    }
    renderLiveProgress();
  }

  function renderLiveProgress() {
    const shell = document.createElement("div");
    shell.className = "health-progress-shell";
    shell.append(createStepList());

    if (currentStepId === "hardware" || liveProgress.hardwareTests.length > 0) {
      shell.append(createHardwareProgressSection());
    }

    if (currentStepId === "threat" || currentStepId === "activation" || liveProgress.threatEntries.length > 0) {
      shell.append(createThreatProgressSection());
    }

    if (currentStepId === "activation") {
      shell.append(createActivationProgressSection());
    }

    breakdown.replaceChildren(shell);
  }

  function createStepList() {
    const list = document.createElement("div");
    list.className = "health-stage-list";

    for (const step of CHECK_STEPS) {
      const status = stepStatus(step.id);
      const card = document.createElement("article");
      card.className = `health-stage-card is-${status}`;
      card.innerHTML = `
        <span class="health-stage-mark" aria-hidden="true"></span>
        <div>
          <strong></strong>
          <p></p>
          <span class="health-stage-status"></span>
        </div>
      `;
      card.querySelector("strong").textContent = step.label;
      card.querySelector("p").textContent = step.detail;
      card.querySelector(".health-stage-status").textContent = stepStatusLabel(status);
      list.append(card);
    }

    return list;
  }

  function stepStatus(stepId) {
    if (currentStepId === "done") {
      return "done";
    }
    if (failedStepId && stepId === failedStepId) {
      return "error";
    }

    const currentIndex = CHECK_STEPS.findIndex((step) => step.id === currentStepId);
    const stepIndex = CHECK_STEPS.findIndex((step) => step.id === stepId);
    if (currentIndex < 0 || stepIndex < 0) {
      return "pending";
    }
    if (stepIndex < currentIndex) {
      return "done";
    }
    return stepIndex === currentIndex ? "running" : "pending";
  }

  function stepStatusLabel(status) {
    if (status === "done") return "완료";
    if (status === "running") return "진행 중";
    if (status === "error") return "오류";
    return "대기";
  }

  function createHardwareProgressSection() {
    const section = document.createElement("section");
    section.className = "health-live-section";
    section.append(createLiveTitle("하드웨어 상세 진행", "디스크, 메모리, 온도 등 확인된 항목을 실시간으로 표시합니다."));

    const tests = liveProgress.hardwareTests;
    if (!tests.length) {
      section.append(createCalmWait("하드웨어 검사 항목을 준비 중입니다."));
      return section;
    }

    const list = document.createElement("div");
    list.className = "health-live-test-list";
    ui.renderTestList(list, tests);
    section.append(list);

    for (const message of liveProgress.hardwareMessages) {
      section.append(createLiveNote(message));
    }

    return section;
  }

  function createThreatProgressSection() {
    const section = document.createElement("section");
    section.className = "health-live-section";
    section.append(createLiveTitle("위험 소프트웨어 상세 진행", "프로세스, 시작프로그램, Defender, YARA 검사를 순서대로 표시합니다."));

    if (!liveProgress.threatEntries.length) {
      section.append(createCalmWait("위험 소프트웨어 검사 항목을 준비 중입니다."));
      return section;
    }

    const list = document.createElement("div");
    list.className = "health-threat-progress-list";
    const fragment = document.createDocumentFragment();
    for (const entry of liveProgress.threatEntries) {
      const card = document.createElement("article");
      card.className = "health-progress-entry";
      card.innerHTML = `<div><strong></strong><span></span></div><p></p>`;
      card.querySelector("strong").textContent = entry.message;
      card.querySelector("span").textContent = entry.time;
      card.querySelector("p").textContent = entry.detail;
      fragment.append(card);
    }
    list.append(fragment);
    section.append(list);
    return section;
  }

  function createActivationProgressSection() {
    const section = document.createElement("section");
    section.className = "health-live-section";
    section.append(createLiveTitle("정품 인증 상세 진행", "Windows 정품 인증 상태를 확인하고 점수에 반영합니다."));
    section.append(createCalmWait("정품 인증 상태를 확인하는 중입니다."));
    return section;
  }

  function createLiveTitle(title, detail) {
    const head = document.createElement("div");
    head.className = "health-live-title";
    head.innerHTML = `<strong></strong><p></p>`;
    head.querySelector("strong").textContent = title;
    head.querySelector("p").textContent = detail;
    return head;
  }

  function createLiveNote(message) {
    const note = document.createElement("p");
    note.className = "health-live-note";
    note.textContent = message;
    return note;
  }

  // 회전 스피너 대신 은은하게 깜빡이는 대기 문구. (산만한 빙글빙글 효과 제거)
  function createCalmWait(message) {
    const note = document.createElement("p");
    note.className = "empty-inline health-live-wait";
    note.textContent = message;
    return note;
  }

  function item(key, label, status, penalty, detail, hint) {
    return { key, label, status, penalty, detail, hint: hint || "" };
  }

  function gradeOf(score) {
    if (score >= 90) return "🟢 양호";
    if (score >= 70) return "🟡 주의";
    return "🔴 위험";
  }

  function gradeClass(score) {
    if (score >= 90) return "health-good";
    if (score >= 70) return "health-warn";
    return "health-bad";
  }

  function renderScore(result) {
    gaugeWrap.classList.remove("is-scanning");
    // 스캔 호(짧은 호)를 원래 둘레로 되돌리고 빈 게이지에서 시작한다.
    gaugeFill.style.strokeDasharray = String(CIRC);
    gaugeFill.style.strokeDashoffset = String(CIRC);
    gradeValue.textContent = result.grade;
    const cls = gradeClass(result.score);
    gaugeFill.classList.remove("health-good", "health-warn", "health-bad");
    gaugeFill.classList.add(cls);
    gradeValue.classList.remove("health-good", "health-warn", "health-bad");
    gradeValue.classList.add(cls);
    // 다음 프레임에 점수만큼 차오르게 한다. (CSS transition으로 부드럽게)
    requestAnimationFrame(() => {
      gaugeFill.style.strokeDashoffset = String(CIRC * (1 - result.score / 100));
    });
    animateScore(result.score);
    // 완료 펄스를 처음부터 다시 재생한다.
    gaugeWrap.classList.remove("is-done");
    void gaugeWrap.offsetWidth;
    gaugeWrap.classList.add("is-done");
  }

  // 동작 줄이기(설정 토글/OS)면 애니메이션을 건너뛴다.
  function motionOff() {
    return (
      document.body.classList.contains("motion-off") ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  // 점수 숫자를 0에서 목표값까지 빠르게 카운트업한다. (easeOutCubic)
  function animateScore(target) {
    if (motionOff()) {
      scoreValue.textContent = String(target);
      return;
    }
    const duration = 900;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      scoreValue.textContent = String(Math.round(target * eased));
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        scoreValue.textContent = String(target);
      }
    }
    requestAnimationFrame(tick);
  }

  function renderBreakdown(items) {
    if (!items.length) {
      breakdown.replaceChildren(createIdle("표시할 점검 항목이 없습니다."));
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const it of items) {
      const card = document.createElement("article");
      card.className = `diagnostic-item ${it.status}`;

      const head = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = it.label;
      const actions = document.createElement("div");
      actions.className = "diagnostic-actions";
      const score = document.createElement("span");
      // 정상 항목은 '정상', 감점 항목은 '−N점'으로 표시한다.
      score.textContent = it.status === "ok" ? "정상" : `−${it.penalty}점`;
      actions.append(score);

      // 점수 옆 '해결' 버튼: 감점 항목에만, 바로 열 수 있는 도구/화면이 있으면 단다.
      const fix = it.status === "ok" ? null : solutionAction(it);
      if (fix) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "diagnostic-fix";
        btn.textContent = fix.text;
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            await fix.run();
          } catch (error) {
            ui.showToast(`열지 못했습니다: ${error.message}`);
          } finally {
            btn.disabled = false;
          }
        });
        actions.append(btn);
      }
      head.append(strong, actions);
      card.append(head);

      if (it.detail) {
        const detail = document.createElement("p");
        detail.textContent = it.detail;
        card.append(detail);
      }
      // 감점 항목은 '해결 방법' 안내, 정상 항목은 상태 설명을 그대로 보여 준다.
      if (it.hint) {
        const hint = document.createElement("p");
        hint.className = "diagnostic-hint";
        hint.textContent = it.status === "ok" ? it.hint : `해결 방법 · ${it.hint}`;
        card.append(hint);
      }
      fragment.append(card);
    }
    breakdown.replaceChildren(fragment);
  }

  // 감점 항목별로 바로 열 수 있는 Windows 도구/앱 화면을 정해 준다.
  function solutionAction(it) {
    const label = it.label || "";
    if (it.key === "threat") {
      return { text: "위험 SW 점검 열기", run: () => goToPage("#softwareCheckPage", "#swCheckMenu") };
    }
    if (it.key === "activation" || /정품 인증/.test(label)) {
      return { text: "정품 인증 설정 열기", run: () => openTool("activation") };
    }
    if (/여유 공간/.test(label)) {
      return { text: "디스크 정리 열기", run: () => openTool("diskCleanup") };
    }
    if (/SMART|디스크 상태/.test(label)) {
      return { text: "디스크 관리 열기", run: () => openTool("diskManagement") };
    }
    if (/메모리 진단/.test(label)) {
      return { text: "메모리 진단 열기", run: () => openTool("memoryDiagnostic") };
    }
    if (/메모리 사용량/.test(label)) {
      return { text: "작업 관리자 열기", run: () => openTool("taskManager") };
    }
    if (/배터리/.test(label)) {
      return { text: "전원 설정 열기", run: () => openTool("powerOptions") };
    }
    if (/온도|비정상 종료|WHEA|드라이버 오류|저장장치 오류/.test(label)) {
      return { text: "이벤트 뷰어 열기", run: () => openTool("eventViewer") };
    }
    return null;
  }

  async function openTool(toolName) {
    await window.magicWand.system.openWindowsTool(toolName);
  }

  function goToPage(pageSelector, menuSelector) {
    ui.switchPage(pageSelector, document.querySelector(menuSelector));
  }

  // ── 스냅샷 / Before·After ───────────────────────
  async function loadSnapshots() {
    try {
      snapshots = await api.listSnapshots();
      renderSnapshotSelect();
    } catch (error) {
      ui.showToast(`스냅샷을 불러오지 못했습니다: ${error.message}`);
    }
  }

  function renderSnapshotSelect() {
    const fragment = document.createDocumentFragment();
    if (!snapshots.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "저장된 스냅샷 없음";
      fragment.append(opt);
    } else {
      for (const snap of snapshots) {
        const opt = document.createElement("option");
        opt.value = snap.id;
        opt.textContent = `${snap.label || formatDate(snap.createdAt)} (${snap.score}점)`;
        fragment.append(opt);
      }
    }
    snapshotSelect.replaceChildren(fragment);
    updateSnapshotButtons();
  }

  function updateSnapshotButtons() {
    const hasSnap = snapshots.length > 0 && snapshotSelect.value;
    snapshotDeleteBtn.disabled = !hasSnap;
    compareBtn.disabled = !hasSnap || !lastResult;
  }

  async function saveSnapshot() {
    if (!lastResult) return;
    const defaultLabel = `${formatDate(new Date().toISOString())} 점검`;
    const label = window.prompt("스냅샷 이름을 입력하세요. (예: 청소 전)", defaultLabel);
    if (label === null) return;
    try {
      await api.saveSnapshot({
        label: label.trim() || defaultLabel,
        score: lastResult.score,
        grade: lastResult.grade,
        items: lastResult.items,
      });
      await loadSnapshots();
      ui.showToast("현재 점검 결과를 스냅샷으로 저장했습니다.");
    } catch (error) {
      ui.showToast(`스냅샷 저장 실패: ${error.message}`);
    }
  }

  async function deleteSnapshot() {
    const id = snapshotSelect.value;
    const snap = snapshots.find((s) => s.id === id);
    if (!snap) return;
    if (!(await ui.showConfirm(`'${snap.label || formatDate(snap.createdAt)}' 스냅샷을 삭제할까요?`, { confirmText: "삭제" }))) {
      return;
    }
    try {
      snapshots = await api.deleteSnapshot(id);
      renderSnapshotSelect();
      ui.showToast("스냅샷을 삭제했습니다.");
    } catch (error) {
      ui.showToast(`스냅샷 삭제 실패: ${error.message}`);
    }
  }

  function compare() {
    if (!lastResult) {
      ui.showToast("먼저 「점검 실행」으로 현재 상태를 점검해 주세요.");
      return;
    }
    const before = snapshots.find((s) => s.id === snapshotSelect.value);
    if (!before) {
      ui.showToast("비교할 스냅샷을 선택해 주세요.");
      return;
    }
    renderCompare(before, lastResult);
  }

  // 저장된 스냅샷(전) vs 현재 점검(후)을 나란히 비교한다.
  function renderCompare(before, after) {
    const delta = after.score - before.score;
    const fragment = document.createDocumentFragment();
    const head = document.createElement("div");
    head.className = "health-compare-head";
    const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
    const deltaClass = delta > 0 ? "health-good" : delta < 0 ? "health-bad" : "";
    head.innerHTML = `
      <span>전: <strong>${before.score}점</strong> (${escapeHtml(before.label || formatDate(before.createdAt))})</span>
      <span>후: <strong>${after.score}점</strong> (현재)</span>
      <span class="health-delta ${deltaClass}">${arrow} ${delta > 0 ? "+" : ""}${delta}점</span>
    `;
    fragment.append(head);

    // 항목별 변화: 키+라벨 기준으로 전/후 감점 비교
    const beforeMap = mapItems(before.items);
    const afterMap = mapItems(after.items);
    const allKeys = new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)]);
    const table = document.createElement("table");
    table.className = "ic-table";
    table.innerHTML = `<thead><tr><th>항목</th><th>전</th><th>후</th><th>변화</th></tr></thead>`;
    const tbody = document.createElement("tbody");
    if (!allKeys.size) {
      const tr = document.createElement("tr");
      const td = cell("td", "비교할 감점 항목이 없습니다. 양쪽 모두 양호합니다.");
      td.colSpan = 4;
      tr.append(td);
      tbody.append(tr);
    }
    for (const k of allKeys) {
      const b = beforeMap[k];
      const a = afterMap[k];
      const bp = b ? `−${b.penalty}점` : "—";
      const ap = a ? `−${a.penalty}점` : "해결됨";
      let change = "변화 없음";
      if (b && !a) change = "✅ 해결";
      else if (!b && a) change = "⚠️ 신규";
      else if (b && a && a.penalty !== b.penalty) change = a.penalty < b.penalty ? "개선" : "악화";
      const tr = document.createElement("tr");
      tr.append(cell("td", (a || b).label), cell("td", bp), cell("td", a ? ap : "해결됨"), cell("td", change));
      tbody.append(tr);
    }
    table.append(tbody);
    fragment.append(table);
    compareResult.replaceChildren(fragment);
  }

  function mapItems(items) {
    const map = {};
    for (const it of items || []) {
      map[it.label] = it;
    }
    return map;
  }

  function setRunning(isRunning) {
    running = isRunning;
    runBtn.disabled = isRunning;
    // 버튼은 회전 스피너 없이 글자만 "점검 중"으로 바꾼다.
    runBtn.textContent = isRunning ? "점검 중" : "점검 실행";
    // 점검 중에는 게이지 안에서 돋보기가 훑는 스캔 모드로 전환한다.
    gaugeWrap.classList.toggle("is-scanning", isRunning);
    if (isRunning) {
      gaugeWrap.classList.remove("is-done");
      gaugeFill.classList.remove("health-good", "health-warn", "health-bad");
      gradeValue.classList.remove("health-good", "health-warn", "health-bad");
      // 게이지 호는 비워 두고(회전 없음) 돋보기 애니메이션만 보여 준다.
      gaugeFill.style.strokeDasharray = String(CIRC);
      gaugeFill.style.strokeDashoffset = String(CIRC);
      scoreValue.textContent = "";
      gradeValue.textContent = "점검 중";
    }
  }

  function createIdle(message) {
    const p = document.createElement("p");
    p.className = "empty-inline";
    p.textContent = message;
    return p;
  }

  function cell(tag, value) {
    const el = document.createElement(tag);
    el.textContent = value == null ? "" : String(value);
    return el;
  }

  function formatDate(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (v) => String(v).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatDuration(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value <= 0) return "—";
    const seconds = value / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}초`;
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return `${minutes}분 ${rest}초`;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
})();
