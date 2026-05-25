(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#startupMenu");
  if (!menu || !ui) return;

  const api = window.magicWand.startup;
  const refreshBtn = document.querySelector("#startupRefreshBtn");
  const summary = document.querySelector("#startupSummary");
  const tableBody = document.querySelector("#startupTableBody");
  const tableWrap = document.querySelector(".startup-table-wrap");

  let busy = false;
  let startupItems = [];

  menu.addEventListener("click", () => {
    ui.switchPage("#startupPage", menu);
  });
  refreshBtn.addEventListener("click", refresh);
  tableBody.addEventListener("click", handleTableClick);
  tableWrap.classList.add("empty");

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
    startupItems = items;
    const fragment = document.createDocumentFragment();
    for (const [index, item] of items.entries()) {
      fragment.append(createRow(item, index));
    }
    tableBody.replaceChildren(fragment);
    tableWrap.classList.toggle("empty", items.length === 0);
    const offCount = items.filter((item) => !item.enabled).length;
    summary.textContent = items.length
      ? `시작 프로그램 ${items.length}개 · 꺼짐 ${offCount}개`
      : "Windows를 켤 때 자동으로 실행되는 프로그램을 켜고 끕니다.";
  }

  function createRow(item, index) {
    const row = document.createElement("tr");
    row.append(
      cell(item.name),
      cell(item.scopeLabel),
      cell(item.command),
      statusCell(item),
      actionCell(item, index),
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

  function actionCell(item, index) {
    const td = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "startup-toggle-btn";
    btn.textContent = item.enabled ? "끄기" : "켜기";
    btn.dataset.index = String(index);
    td.append(btn);
    return td;
  }

  function handleTableClick(event) {
    const button = event.target.closest(".startup-toggle-btn[data-index]");
    if (!button) return;
    const item = startupItems[Number(button.dataset.index)];
    if (item) {
      toggle(item, button);
    }
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
