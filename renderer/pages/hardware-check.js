(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#checkMenu");
  if (!menu || !ui) {
    return;
  }

  const results = document.querySelector("#hwCheckResults");
  const startButton = document.querySelector("#hwCheckStartButton");
  const stopButton = document.querySelector("#hwCheckStopButton");
  const rerunButton = document.querySelector("#hwCheckButton");
  const saveButton = document.querySelector("#hwCheckSaveText");

  let runId = 0;
  let lastResult = null;
  let lastSummaryText = "";

  window.magicWand.hardware.onCheckProgress(handleProgress);

  menu.addEventListener("click", () => {
    ui.switchPage("#hardwareCheckPage", menu);
  });

  startButton.addEventListener("click", runCheck);
  rerunButton.addEventListener("click", runCheck);
  stopButton.addEventListener("click", stopCheck);
  saveButton.addEventListener("click", saveText);

  setRunning(false);

  async function runCheck() {
    const currentRunId = runId + 1;
    runId = currentRunId;
    lastResult = null;
    lastSummaryText = "하드웨어를 점검 중입니다.";
    setRunning(true);
    results.innerHTML = "";
    renderWaitingMessage();

    try {
      const result = await window.magicWand.hardware.check(currentRunId);
      if (currentRunId !== runId) {
        return;
      }

      lastResult = result;
      renderFinalResult(result);
    } catch (error) {
      if (currentRunId === runId) {
        lastSummaryText = `점검 실패: ${error.message}`;
        renderStatusMessage(lastSummaryText);
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

    ui.renderTestList(results, payload.tests);
  }

  function stopCheck() {
    runId += 1;
    lastResult = null;
    results.innerHTML = "";
    lastSummaryText = "검사가 종료되었습니다.";
    renderStatusMessage(lastSummaryText);
    setRunning(false);
  }

  async function saveText() {
    if (!lastResult) {
      ui.showToast("저장할 하드웨어 점검 결과가 없습니다.");
      return;
    }

    try {
      const result = await window.magicWand.hardware.saveText({
        title: "하드웨어 점검 TXT 저장",
        defaultPath: `Hardware_Check_${getDateStamp()}.txt`,
        text: buildHardwareText(lastResult),
      });
      if (!result?.canceled) {
        ui.showToast("하드웨어 점검 결과를 TXT로 저장했습니다.");
      }
    } catch (error) {
      ui.showToast(`TXT 저장 실패: ${error.message}`);
    }
  }

  function renderFinalResult(result) {
    const notes = result.messages?.length ? ` (${result.messages.join(" / ")})` : "";
    lastSummaryText = `${result.summary || "점검 완료"}${notes}`;
    ui.renderTestList(results, result.tests);
  }

  function renderWaitingMessage() {
    const empty = document.createElement("p");
    empty.className = "empty-inline";
    empty.textContent = "검사 항목을 준비 중입니다.";
    results.append(empty);
  }

  function renderStatusMessage(message) {
    results.innerHTML = "";
    const empty = document.createElement("p");
    empty.className = "empty-inline";
    empty.textContent = message;
    results.append(empty);
  }

  function buildHardwareText(result) {
    const lines = [
      "하드웨어 점검",
      `저장일: ${new Date().toLocaleString("ko-KR")}`,
      "",
      `요약: ${lastSummaryText || "점검 결과 없음"}`,
      "",
      "점검 결과",
    ];

    for (const test of result.tests ?? []) {
      lines.push("");
      lines.push(`- ${test.name}`);
      lines.push(`  상태: ${ui.statusLabel(test.status)}`);
      lines.push(`  내용: ${test.detail || ""}`);
      if (test.hint) {
        lines.push(`  안내: ${test.hint}`);
      }
    }

    return lines.join("\n");
  }

  function setRunning(isRunning) {
    startButton.disabled = isRunning;
    rerunButton.disabled = isRunning;
    stopButton.disabled = !isRunning;
    saveButton.disabled = isRunning || !lastResult;
  }

  function getDateStamp() {
    return new Date().toISOString().slice(0, 10);
  }
})();
