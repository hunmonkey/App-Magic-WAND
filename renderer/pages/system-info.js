(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#systemInfoMenu");
  if (!menu || !ui) {
    return;
  }

  const hardwareGroups = document.querySelector("#hardwareGroups");
  const hardwareRefresh = document.querySelector("#hardwareRefresh");
  const hardwareSaveText = document.querySelector("#hardwareSaveText");
  const hardwareShortcuts = document.querySelectorAll("[data-windows-tool]");
  const softwareSaveText = document.querySelector("#softwareSaveText");
  const softwareRefresh = document.querySelector("#softwareRefresh");
  const softwareTableBody = document.querySelector("#softwareTableBody");

  let softwareItems = [];

  menu.addEventListener("click", () => {
    ui.switchPage("#systemInfoPage", menu);
  });

  hardwareGroups.textContent = "새로고침 버튼을 눌러 PC 사양을 불러오세요.";
  hardwareSaveText.disabled = true;
  softwareSaveText.disabled = true;

  hardwareRefresh.addEventListener("click", loadHardware);
  hardwareSaveText.addEventListener("click", saveHardwareText);
  hardwareShortcuts.forEach((button) => {
    button.addEventListener("click", () => openWindowsTool(button));
  });
  softwareSaveText.addEventListener("click", saveSoftwareText);
  softwareRefresh.addEventListener("click", loadSoftware);
  softwareTableBody.addEventListener("click", handleSoftwareTableClick);

  async function loadHardware() {
    hardwareRefresh.disabled = true;
    ui.setBusy(hardwareRefresh, true);
    hardwareSaveText.disabled = true;
    hardwareGroups.textContent = "PC 사양을 불러오는 중입니다.";

    try {
      const info = await window.magicWand.system.hardware();
      renderHardware(info);
    } catch (error) {
      hardwareGroups.textContent = `- PC 사양\n  -- 불러오기 실패: ${error.message}`;
    } finally {
      hardwareRefresh.disabled = false;
      ui.setBusy(hardwareRefresh, false);
    }
  }

  function renderHardware(info) {
    hardwareGroups.textContent = formatHardwareTree(info.groups ?? []);
    hardwareSaveText.disabled = !hardwareGroups.textContent.trim();
  }

  async function saveHardwareText() {
    const text = hardwareGroups.textContent.trim();
    if (!text) {
      ui.showToast("저장할 PC 사양 내용이 없습니다.");
      return;
    }

    hardwareSaveText.disabled = true;
    try {
      const result = await window.magicWand.system.saveHardwareText(text);
      if (!result.canceled) {
        ui.showToast("PC 사양을 TXT 파일로 저장했습니다.");
      }
    } catch (error) {
      ui.showToast(`TXT 파일로 저장하지 못했습니다: ${error.message}`);
    } finally {
      hardwareSaveText.disabled = false;
    }
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
    ui.setBusy(softwareRefresh, true);
    softwareSaveText.disabled = true;
    renderSoftwareMessage("설치 프로그램을 불러오는 중입니다.");

    try {
      const result = await window.magicWand.system.software();
      softwareItems = result.items ?? [];
      renderSoftware();
    } catch (error) {
      softwareItems = [];
      renderSoftwareMessage(`목록을 불러오지 못했습니다: ${error.message}`);
    } finally {
      softwareRefresh.disabled = false;
      ui.setBusy(softwareRefresh, false);
    }
  }

  function renderSoftware() {
    softwareSaveText.disabled = softwareItems.length === 0;

    if (!softwareItems.length) {
      renderSoftwareMessage("표시할 설치 프로그램이 없습니다.");
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const [index, item] of softwareItems.entries()) {
      const row = document.createElement("tr");
      row.append(
        cell(item.name),
        cell(item.version),
        cell(item.publisher),
        cell(item.installDate),
        actionCell(item, index),
      );
      fragment.append(row);
    }
    softwareTableBody.replaceChildren(fragment);
  }

  function renderSoftwareMessage(message) {
    const row = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = message;
    row.append(td);
    softwareTableBody.replaceChildren(row);
  }

  function cell(value) {
    const td = document.createElement("td");
    td.textContent = value || "";
    return td;
  }

  async function saveSoftwareText() {
    const text = formatSoftwareText();
    if (!text) {
      ui.showToast("저장할 설치된 소프트웨어 내용이 없습니다.");
      return;
    }

    softwareSaveText.disabled = true;
    try {
      const result = await window.magicWand.system.saveSoftwareText(text);
      if (!result.canceled) {
        ui.showToast("설치된 소프트웨어를 TXT 파일로 저장했습니다.");
      }
    } catch (error) {
      ui.showToast(`TXT 파일로 저장하지 못했습니다: ${error.message}`);
    } finally {
      softwareSaveText.disabled = softwareItems.length === 0;
    }
  }

  function formatSoftwareText() {
    if (!softwareItems.length) {
      return "";
    }

    const lines = ["설치된 소프트웨어", ""];
    for (const item of softwareItems) {
      lines.push(`- ${item.name}`);
      lines.push(`  -- 버전: ${item.version || "확인 안 됨"}`);
      lines.push(`  -- 게시자: ${item.publisher || "확인 안 됨"}`);
      lines.push(`  -- 설치일: ${item.installDate || "확인 안 됨"}`);
      lines.push("");
    }
    return lines.join("\n").trim();
  }

  function actionCell(item, index) {
    const td = document.createElement("td");
    td.className = "software-action-cell";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "software-delete-button danger-action";
    button.textContent = "삭제";
    button.disabled = !item.canUninstall;
    button.dataset.softwareIndex = String(index);
    td.append(button);
    return td;
  }

  function handleSoftwareTableClick(event) {
    const button = event.target.closest("[data-software-index]");
    if (!button) return;
    const item = softwareItems[Number(button.dataset.softwareIndex)];
    if (item) {
      uninstallSoftware(item, button);
    }
  }

  async function uninstallSoftware(item, button) {
    const ok = await ui.showConfirm(`${item.name} 제거를 시작할까요?`, { confirmText: "제거" });
    if (!ok) {
      return;
    }

    button.disabled = true;
    try {
      await window.magicWand.system.uninstallSoftware(item.id);
      ui.showToast(`${item.name} 제거 프로그램을 실행했습니다.`);
    } catch (error) {
      ui.showToast(`삭제를 시작하지 못했습니다: ${error.message}`);
      button.disabled = !item.canUninstall;
    }
  }
})();
