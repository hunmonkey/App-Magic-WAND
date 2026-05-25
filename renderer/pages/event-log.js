(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#eventLogMenu");
  const scanBtn = document.querySelector("#eventLogScanBtn");
  if (!menu || !scanBtn || !ui) return;

  const daysSelect = document.querySelector("#eventLogDays");
  const saveBtn = document.querySelector("#eventLogSaveBtn");
  const summary = document.querySelector("#eventLogSummary");
  const groupsEl = document.querySelector("#eventLogGroups");
  const tableBody = document.querySelector("#eventLogTableBody");
  const tableWrap = document.querySelector(".event-log-table-wrap");

  let lastResult = null;

  menu.addEventListener("click", () => {
    ui.switchPage("#eventLogPage", menu);
  });
  scanBtn.addEventListener("click", scan);
  saveBtn.addEventListener("click", saveText);

  async function scan() {
    scanBtn.disabled = true;
    ui.setBusy(scanBtn, true);
    saveBtn.disabled = true;
    summary.textContent = "이벤트 로그를 조회하는 중입니다.";
    groupsEl.replaceChildren(ui.createLoadingState("오류와 경고 기록을 모으는 중입니다."));
    tableBody.replaceChildren();

    try {
      lastResult = await window.magicWand.eventLog.scan({ days: Number(daysSelect.value) || 7 });
      render(lastResult);
      saveBtn.disabled = !(lastResult.events || []).length;
    } catch (error) {
      summary.textContent = "이벤트 로그 조회에 실패했습니다.";
      groupsEl.replaceChildren(empty(`조회 실패: ${error.message}`));
      ui.showToast(`이벤트 로그 조회 실패: ${error.message}`);
    } finally {
      scanBtn.disabled = false;
      ui.setBusy(scanBtn, false);
    }
  }

  function render(result) {
    summary.textContent = result.message || "이벤트 로그 조회가 끝났습니다.";
    renderGroups(result.groups || []);
    renderRows(result.events || []);
  }

  function renderGroups(groups) {
    if (!groups.length) {
      groupsEl.replaceChildren(empty("반복되는 오류 그룹이 없습니다."));
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const group of groups) {
      const card = document.createElement("article");
      card.className = "event-group-card";
      card.innerHTML = `
        <div><strong></strong><span></span></div>
        <p></p>
        <small></small>
      `;
      card.querySelector("strong").textContent = `${group.provider || "공급자 확인 안 됨"} · ID ${group.id}`;
      card.querySelector("span").textContent = `${group.count}건`;
      card.querySelector("p").textContent = group.hint || "";
      card.querySelector("small").textContent = group.sample || "";
      fragment.append(card);
    }
    groupsEl.replaceChildren(fragment);
  }

  function renderRows(events) {
    tableWrap.classList.toggle("empty", events.length === 0);
    const fragment = document.createDocumentFragment();
    for (const event of events.slice(0, 100)) {
      const row = document.createElement("tr");
      row.append(
        cell(event.time),
        cell(event.level),
        cell(`${event.provider || "공급자 확인 안 됨"} / ${event.id}`),
        cell(event.message || ""),
      );
      fragment.append(row);
    }
    tableBody.replaceChildren(fragment);
  }

  async function saveText() {
    if (!lastResult) return;
    try {
      const result = await window.magicWand.eventLog.saveText(toText(lastResult));
      if (!result.canceled) {
        ui.showToast("이벤트 로그를 TXT로 저장했습니다.");
      }
    } catch (error) {
      ui.showToast(`TXT 저장 실패: ${error.message}`);
    }
  }

  function toText(result) {
    const lines = [
      "Magic WAND 이벤트 로그 분석",
      `조회 기간: 최근 ${result.days || ""}일`,
      "",
      "[반복 오류 요약]",
    ];
    for (const group of result.groups || []) {
      lines.push(`- ${group.provider} / ID ${group.id} / ${group.count}건`);
      lines.push(`  추정: ${group.hint}`);
      if (group.sample) lines.push(`  예시: ${group.sample}`);
    }
    lines.push("", "[최근 이벤트]");
    for (const event of result.events || []) {
      lines.push(`- ${event.time} | ${event.level} | ${event.provider} / ID ${event.id}`);
      lines.push(`  ${event.message || ""}`);
    }
    return lines.join("\n");
  }

  function cell(value) {
    const td = document.createElement("td");
    td.textContent = value || "";
    return td;
  }

  function empty(message) {
    const p = document.createElement("p");
    p.className = "empty-inline";
    p.textContent = message;
    return p;
  }
})();
