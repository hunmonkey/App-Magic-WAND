(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#startupMenu");
  if (!menu || !ui) return;

  const api = window.magicWand.startup;
  const refreshBtn = document.querySelector("#startupRefreshBtn");
  const summary = document.querySelector("#startupSummary");
  const tableBody = document.querySelector("#startupTableBody");
  const tableWrap = document.querySelector(".startup-table-wrap");

  let loaded = false;
  let busy = false;

  menu.addEventListener("click", () => {
    ui.switchPage("#startupPage", menu);
    if (!loaded) {
      loaded = true;
      refresh();
    }
  });
  refreshBtn.addEventListener("click", refresh);

  async function refresh() {
    if (busy) return;
    busy = true;
    refreshBtn.disabled = true;
    ui.setBusy(refreshBtn, true);
    try {
      const items = await api.list();
      render(items);
    } catch (error) {
      ui.showToast(`시작 프로그램을 불러오지 못했습니다: ${error.message}`);
    } finally {
      busy = false;
      refreshBtn.disabled = false;
      ui.setBusy(refreshBtn, false);
    }
  }

  function render(items) {
    tableBody.innerHTML = "";
    for (const item of items) {
      tableBody.append(createRow(item));
    }
    tableWrap.classList.toggle("empty", items.length === 0);
    const offCount = items.filter((item) => !item.enabled).length;
    summary.textContent = items.length
      ? `시작 프로그램 ${items.length}개 · 꺼짐 ${offCount}개`
      : "Windows를 켤 때 자동으로 실행되는 프로그램을 켜고 끕니다.";
  }

  function createRow(item) {
    const row = document.createElement("tr");
    row.append(
      cell(item.name),
      cell(item.scopeLabel),
      cell(item.command),
      statusCell(item),
      actionCell(item),
    );
    return row;
  }

  function cell(value) {
    const td = document.createElement("td");
    td.textContent = value || "";
    return td;
  }

  function statusCell(item) {
    const td = document.createElement("td");
    td.className = item.enabled ? "startup-on" : "startup-off";
    td.textContent = item.enabled ? "사용" : "사용 안 함";
    return td;
  }

  function actionCell(item) {
    const td = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "startup-toggle-btn";
    btn.textContent = item.enabled ? "끄기" : "켜기";
    btn.addEventListener("click", () => toggle(item, btn));
    td.append(btn);
    return td;
  }

  async function toggle(item, btn) {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    ui.setBusy(btn, true);
    try {
      const items = await api.toggle({
        scope: item.scope,
        name: item.name,
        command: item.command,
        action: item.enabled ? "disable" : "enable",
      });
      render(items);
      ui.showToast(item.enabled ? "시작 항목을 껐습니다." : "시작 항목을 켰습니다.");
    } catch (error) {
      ui.showToast(`변경 실패: ${error.message}`);
      btn.disabled = false;
      ui.setBusy(btn, false);
    } finally {
      busy = false;
    }
  }
})();
