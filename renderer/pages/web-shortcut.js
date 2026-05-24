(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#webShortcutMenu");
  if (!menu || !ui) return;

  const form = document.querySelector("#shortcutForm");
  const nameInput = document.querySelector("#shortcutName");
  const urlInput = document.querySelector("#shortcutUrl");
  const iconInput = document.querySelector("#shortcutIcon");
  const pickIconBtn = document.querySelector("#shortcutPickIcon");
  const clearIconBtn = document.querySelector("#shortcutClearIcon");
  const folderInput = document.querySelector("#shortcutFolder");
  const pickFolderBtn = document.querySelector("#shortcutPickFolder");
  const setNameInput = document.querySelector("#shortcutSetName");
  const setSelect = document.querySelector("#shortcutSetSelect");
  const saveSetBtn = document.querySelector("#shortcutSaveSetBtn");
  const loadSetBtn = document.querySelector("#shortcutLoadSetBtn");
  const deleteSetBtn = document.querySelector("#shortcutDeleteSetBtn");
  const createBtn = document.querySelector("#shortcutCreateBtn");
  const openFolderBtn = document.querySelector("#shortcutOpenFolderBtn");
  const clearBtn = document.querySelector("#shortcutClearBtn");
  const listEl = document.querySelector("#shortcutList");
  const summaryEl = document.querySelector("#shortcutSummary");
  const statusEl = document.querySelector("#shortcutStatus");

  let shortcuts = [];
  let settings = { transferPaths: [], shortcuts: [], shortcutSets: [] };
  let loaded = false;

  menu.addEventListener("click", async () => {
    ui.switchPage("#webShortcutPage", menu);
    if (!loaded) {
      await loadDefaultFolder();
      await loadSettings();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    addShortcut();
  });
  pickIconBtn.addEventListener("click", pickIcon);
  clearIconBtn.addEventListener("click", () => {
    iconInput.value = "";
  });
  pickFolderBtn.addEventListener("click", pickFolder);
  setSelect.addEventListener("change", syncSetNameFromSelect);
  saveSetBtn.addEventListener("click", saveShortcutSet);
  loadSetBtn.addEventListener("click", loadShortcutSet);
  deleteSetBtn.addEventListener("click", deleteShortcutSet);
  createBtn.addEventListener("click", createShortcuts);
  openFolderBtn.addEventListener("click", () => openPath(folderInput.value.trim()));
  clearBtn.addEventListener("click", () => {
    shortcuts = [];
    renderList();
  });

  renderList();
  renderSetSelect();

  async function loadDefaultFolder() {
    loaded = true;
    try {
      const folders = await window.magicWand.fileTools.commonFolders();
      const desktop = folders.find((item) => item.key === "desktop") || folders[0];
      if (desktop) {
        folderInput.value = desktop.path;
      }
    } catch {
      statusEl.textContent = "기본 바탕화면 경로를 불러오지 못했습니다. 설치 위치를 직접 선택해 주세요.";
    }
  }

  async function loadSettings() {
    try {
      settings = await window.magicWand.fileTools.loadSettings();
      renderSetSelect();
      if (settings.shortcuts.length && !shortcuts.length) {
        shortcuts = [...settings.shortcuts];
        const matchingSet = findMatchingSet(shortcuts);
        if (matchingSet) {
          setSelect.value = matchingSet.id;
          setNameInput.value = matchingSet.name;
        }
        renderList();
      }
    } catch (err) {
      statusEl.textContent = `저장된 바로가기 목록을 불러오지 못했습니다: ${err.message}`;
    }
  }

  function addShortcut() {
    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    if (!name || !url) {
      ui.showToast("바로가기 이름과 웹사이트 주소를 입력해 주세요.");
      return;
    }
    shortcuts.push({ name, url, iconPath: iconInput.value.trim() });
    nameInput.value = "";
    urlInput.value = "";
    iconInput.value = "";
    renderList();
  }

  async function pickIcon() {
    try {
      const result = await window.magicWand.fileTools.pickIcon();
      if (result.path) {
        iconInput.value = result.path;
      }
    } catch (err) {
      ui.showToast(`아이콘 선택 실패: ${err.message}`);
    }
  }

  async function pickFolder() {
    try {
      const result = await window.magicWand.fileTools.pickDestination();
      if (result.path) {
        folderInput.value = result.path;
      }
    } catch (err) {
      ui.showToast(`폴더 선택 실패: ${err.message}`);
    }
  }

  function renderList() {
    listEl.innerHTML = "";
    summaryEl.textContent = shortcuts.length ? `생성 예정 ${shortcuts.length}개` : "목록에 추가한 사이트가 없습니다.";
    if (!shortcuts.length) {
      listEl.innerHTML = "<p class='empty-inline'>바로가기 이름과 주소를 입력해 목록에 추가하세요.</p>";
      return;
    }

    shortcuts.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "shortcut-card";
      const info = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = item.name;
      const url = document.createElement("p");
      url.textContent = item.url;
      info.append(title, url);
      if (item.iconPath) {
        const icon = document.createElement("p");
        icon.textContent = `아이콘: ${item.iconPath}`;
        info.append(icon);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "삭제";
      remove.addEventListener("click", () => {
        shortcuts.splice(index, 1);
        renderList();
      });
      card.append(info, remove);
      listEl.append(card);
    });
  }

  async function createShortcuts() {
    if (!shortcuts.length) {
      ui.showToast("생성할 바로가기를 먼저 목록에 추가해 주세요.");
      return;
    }
    createBtn.disabled = true;
    createBtn.textContent = "생성 중...";
    statusEl.textContent = "바로가기 파일을 만드는 중입니다.";
    const created = [];
    try {
      for (const item of shortcuts) {
        const result = await window.magicWand.fileTools.createShortcut({
          ...item,
          folder: folderInput.value.trim(),
        });
        created.push(result.name);
      }
      statusEl.textContent = `생성 완료: ${created.join(", ")}`;
      ui.showToast("웹 바로가기를 생성했습니다.");
    } catch (err) {
      statusEl.textContent = `생성 실패: ${err.message}`;
      ui.showToast(`바로가기 생성 실패: ${err.message}`);
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = "바로가기 생성";
    }
  }

  async function saveShortcutSet() {
    if (!shortcuts.length) {
      ui.showToast("저장할 바로가기 세트가 없습니다.");
      return;
    }
    const name = setNameInput.value.trim() || selectedSet()?.name || "기본 세트";
    const now = new Date().toISOString();
    try {
      const latest = await window.magicWand.fileTools.loadSettings();
      const previous = latest.shortcutSets.find((item) => item.id === setSelect.value);
      const id = previous && (!setNameInput.value.trim() || previous.name === name)
        ? previous.id
        : makeSetId(name, latest.shortcutSets);
      const entry = {
        id,
        name,
        shortcuts,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      };
      const nextSets = latest.shortcutSets.filter((item) => item.id !== id);
      nextSets.unshift(entry);
      settings = await window.magicWand.fileTools.saveSettings({
        ...latest,
        shortcuts,
        shortcutSets: nextSets,
      });
      renderSetSelect(id);
      setNameInput.value = name;
      statusEl.textContent = `"${name}" 세트에 바로가기 ${shortcuts.length}개를 저장했습니다.`;
      ui.showToast("웹 바로가기 세트를 저장했습니다.");
    } catch (err) {
      ui.showToast(`세트 저장 실패: ${err.message}`);
    }
  }

  async function loadShortcutSet() {
    try {
      settings = await window.magicWand.fileTools.loadSettings();
      renderSetSelect(setSelect.value);
      const set = selectedSet();
      if (!set) {
        statusEl.textContent = "불러올 웹 바로가기 세트가 없습니다.";
        return;
      }
      shortcuts = [...set.shortcuts];
      renderList();
      setNameInput.value = set.name;
      settings = await window.magicWand.fileTools.saveSettings({ ...settings, shortcuts });
      statusEl.textContent = `"${set.name}" 세트 ${shortcuts.length}개를 불러왔습니다.`;
    } catch (err) {
      ui.showToast(`세트 불러오기 실패: ${err.message}`);
    }
  }

  async function deleteShortcutSet() {
    const set = selectedSet();
    if (!set) {
      ui.showToast("삭제할 세트가 없습니다.");
      return;
    }
    const ok = await ui.showConfirm(`"${set.name}" 세트를 삭제할까요? 생성된 바로가기 파일은 삭제되지 않습니다.`, { confirmText: "세트 삭제" });
    if (!ok) return;
    try {
      const latest = await window.magicWand.fileTools.loadSettings();
      settings = await window.magicWand.fileTools.saveSettings({
        ...latest,
        shortcuts: [],
        shortcutSets: latest.shortcutSets.filter((item) => item.id !== set.id),
      });
      renderSetSelect();
      statusEl.textContent = `"${set.name}" 세트를 삭제했습니다.`;
      ui.showToast("웹 바로가기 세트를 삭제했습니다.");
    } catch (err) {
      ui.showToast(`세트 삭제 실패: ${err.message}`);
    }
  }

  function renderSetSelect(preferredId = "") {
    setSelect.innerHTML = "";
    if (!settings.shortcutSets?.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "저장된 세트가 없습니다.";
      setSelect.append(option);
      setNameInput.value = "";
      loadSetBtn.disabled = true;
      deleteSetBtn.disabled = true;
      return;
    }
    for (const set of settings.shortcutSets) {
      const option = document.createElement("option");
      option.value = set.id;
      option.textContent = `${set.name} (${set.shortcuts.length}개)`;
      setSelect.append(option);
    }
    setSelect.value = preferredId && settings.shortcutSets.some((set) => set.id === preferredId)
      ? preferredId
      : settings.shortcutSets[0].id;
    loadSetBtn.disabled = false;
    deleteSetBtn.disabled = false;
    syncSetNameFromSelect();
  }

  function syncSetNameFromSelect() {
    const set = selectedSet();
    if (set) {
      setNameInput.value = set.name;
    }
  }

  function selectedSet() {
    return settings.shortcutSets?.find((item) => item.id === setSelect.value) || null;
  }

  function findMatchingSet(items) {
    const key = shortcutListKey(items);
    return settings.shortcutSets?.find((set) => shortcutListKey(set.shortcuts) === key) || null;
  }

  function shortcutListKey(items) {
    return JSON.stringify((items || []).map((item) => ({
      name: item.name || "",
      url: item.url || "",
      iconPath: item.iconPath || "",
    })));
  }

  function makeSetId(name, sets) {
    const base = (name || "shortcut-set")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "shortcut-set";
    const used = new Set((sets || []).map((set) => set.id));
    if (!used.has(base)) return base;
    for (let index = 2; index < 1000; index += 1) {
      const next = `${base}-${index}`;
      if (!used.has(next)) return next;
    }
    return `${base}-${Date.now()}`;
  }

  async function openPath(targetPath) {
    if (!targetPath) {
      ui.showToast("열 폴더 경로가 없습니다.");
      return;
    }
    try {
      await window.magicWand.fileTools.openPath(targetPath);
    } catch (err) {
      ui.showToast(`폴더 열기 실패: ${err.message}`);
    }
  }
})();
