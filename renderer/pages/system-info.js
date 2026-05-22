(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#systemInfoMenu");
  if (!menu || !ui) {
    return;
  }

  const hardwareSummary = document.querySelector("#hardwareSummary");
  const hardwareGroups = document.querySelector("#hardwareGroups");
  const hardwareRefresh = document.querySelector("#hardwareRefresh");
  const hardwareShortcuts = document.querySelectorAll("[data-windows-tool]");
  const softwareStatus = document.querySelector("#softwareStatus");
  const softwareSearch = document.querySelector("#softwareSearch");
  const softwareRefresh = document.querySelector("#softwareRefresh");
  const softwareCount = document.querySelector("#softwareCount");
  const softwareTableBody = document.querySelector("#softwareTableBody");

  let loaded = false;
  let softwareItems = [];

  menu.addEventListener("click", () => {
    ui.switchPage("#systemInfoPage", menu);
    loadOnce();
  });

  if (menu.classList.contains("active")) {
    loadOnce();
  }

  hardwareRefresh.addEventListener("click", loadHardware);
  hardwareShortcuts.forEach((button) => {
    button.addEventListener("click", () => openWindowsTool(button));
  });
  softwareRefresh.addEventListener("click", loadSoftware);
  softwareSearch.addEventListener("input", renderSoftware);

  function loadOnce() {
    if (loaded) {
      return;
    }

    loaded = true;
    loadHardware();
    loadSoftware();
  }

  async function loadHardware() {
    hardwareRefresh.disabled = true;
    hardwareSummary.textContent = "PC 사양을 불러오는 중입니다...";
    hardwareGroups.innerHTML = "";

    try {
      const info = await window.magicWand.system.hardware();
      renderHardware(info);
    } catch (error) {
      hardwareSummary.textContent = `사양을 불러오지 못했습니다: ${error.message}`;
    } finally {
      hardwareRefresh.disabled = false;
    }
  }

  function renderHardware(info) {
    hardwareSummary.textContent = info.messages?.length
      ? info.messages.join(" / ")
      : "PC 사양을 불러왔습니다.";
    hardwareGroups.textContent = formatHardwareTree(info.groups ?? []);
  }

  function formatHardwareTree(groups) {
    if (!groups.length) {
      return "- PC 사양\n  -- 확인 안 됨";
    }

    const lines = [];
    for (const group of groups) {
      lines.push(`- ${group.title}`);
      const items = group.items ?? [];
      if (!items.length) {
        lines.push("  -- 확인 안 됨");
      }
      for (const item of items) {
        appendTreeItem(lines, item, 1);
      }
      lines.push("");
    }
    return lines.join("\n").trim();
  }

  function appendTreeItem(lines, item, depth) {
    const indent = "  ".repeat(depth);
    const marker = depth === 1 ? "--" : "---";
    const hasChildren = Boolean(item.children?.length);
    const value = item.value || (hasChildren ? "" : "확인 안 됨");
    lines.push(value ? `${indent}${marker} ${item.label}: ${value}` : `${indent}${marker} ${item.label}`);

    for (const child of item.children ?? []) {
      appendTreeItem(lines, child, depth + 1);
    }
  }

  async function openWindowsTool(button) {
    const toolName = button.dataset.windowsTool;
    button.disabled = true;
    try {
      await window.magicWand.system.openWindowsTool(toolName);
    } catch (error) {
      ui.showToast(`Windows 도구를 열지 못했습니다: ${error.message}`);
    } finally {
      button.disabled = false;
    }
  }

  async function loadSoftware() {
    softwareRefresh.disabled = true;
    softwareStatus.textContent = "설치 프로그램을 불러오는 중입니다...";
    softwareTableBody.innerHTML = "";

    try {
      const result = await window.magicWand.system.software();
      softwareItems = result.items ?? [];
      softwareStatus.textContent = result.messages?.length
        ? result.messages.join(" / ")
        : "설치 프로그램을 불러왔습니다.";
      renderSoftware();
    } catch (error) {
      softwareStatus.textContent = `목록을 불러오지 못했습니다: ${error.message}`;
    } finally {
      softwareRefresh.disabled = false;
    }
  }

  function renderSoftware() {
    const keyword = softwareSearch.value.trim().toLowerCase();
    softwareTableBody.innerHTML = "";

    const visible = softwareItems.filter((item) => {
      const text = [item.name, item.publisher, item.version].join(" ").toLowerCase();
      return !keyword || text.includes(keyword);
    });

    for (const item of visible) {
      const row = document.createElement("tr");
      row.append(cell(item.name), cell(item.version), cell(item.publisher), cell(item.installDate));
      softwareTableBody.append(row);
    }

    softwareCount.textContent = keyword
      ? `${softwareItems.length}개 설치됨 (검색 ${visible.length}개)`
      : `${softwareItems.length}개 설치됨`;
  }

  function cell(value) {
    const td = document.createElement("td");
    td.textContent = value || "";
    return td;
  }
})();
