(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#securityMenu");
  if (!menu || !ui) return;

  const page = document.querySelector("#securityPage");
  const activationEl = document.querySelector("#securityActivation");
  const bitlockerEl = document.querySelector("#securityBitlocker");
  const userListEl = document.querySelector("#securityUserList");
  const refreshBtn = document.querySelector("#securityRefresh");
  const usersRefreshBtn = document.querySelector("#securityUsersRefresh");
  const browseBtn = document.querySelector("#securityBrowseBtn");
  const pathInput = document.querySelector("#securityTargetPath");
  const hideBtn = document.querySelector("#securityHideBtn");
  const unhideBtn = document.querySelector("#securityUnhideBtn");

  let loaded = false;

  menu.addEventListener("click", () => {
    ui.switchPage("#securityPage", menu);
    if (!loaded) {
      loaded = true;
      loadStatus();
      loadUsers();
    }
  });

  refreshBtn.addEventListener("click", loadStatus);
  usersRefreshBtn.addEventListener("click", loadUsers);
  browseBtn.addEventListener("click", pickFolder);
  hideBtn.addEventListener("click", () => setHidden(true));
  unhideBtn.addEventListener("click", () => setHidden(false));
  bindToolButtons(page);

  async function loadStatus() {
    refreshBtn.disabled = true;
    renderActivationMessage("확인 중입니다.");
    bitlockerEl.innerHTML = "<p class='empty-inline'>확인 중입니다.</p>";
    try {
      const act = await window.magicWand.security.activation();
      renderActivation(act);
    } catch (err) {
      renderActivationMessage(`정품 상태 확인 실패: ${err.message}`);
    }
    try {
      const bl = await window.magicWand.security.bitlocker();
      renderBitlocker(bl.volumes || []);
    } catch (err) {
      bitlockerEl.innerHTML = "";
      bitlockerEl.append(emptyState(err.message));
    } finally {
      refreshBtn.disabled = false;
    }
  }

  function renderActivation(act) {
    activationEl.innerHTML = "";
    [
      ["정품 상태", act.status],
      ["에디션", act.edition],
      ["버전", act.version],
      ["빌드", act.build],
    ].forEach(([label, value]) => {
      const div = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value || "확인 안 됨";
      div.append(dt, dd);
      activationEl.append(div);
    });
  }

  function renderActivationMessage(message) {
    activationEl.innerHTML = "";
    const div = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = "상태";
    dd.textContent = message;
    div.append(dt, dd);
    activationEl.append(div);
  }

  function renderBitlocker(volumes) {
    bitlockerEl.innerHTML = "";
    if (!volumes.length) {
      bitlockerEl.append(emptyState("암호화 정보를 찾을 수 없습니다."));
      return;
    }
    for (const v of volumes) {
      const on = /on|protected/i.test(v.status);
      const card = document.createElement("article");
      card.className = "tool-card";
      const head = document.createElement("div");
      head.className = "tool-card-head";
      const name = document.createElement("strong");
      name.textContent = `${v.mount} 드라이브`;
      const badge = document.createElement("span");
      badge.className = `tool-badge ${on ? "ok" : "muted"}`;
      badge.textContent = on ? "암호화됨" : "해제됨";
      head.append(name, badge);
      const meta = document.createElement("p");
      meta.className = "tool-meta";
      meta.textContent = `암호화 진행률 ${v.percent}%`;
      card.append(head, meta);
      bitlockerEl.append(card);
    }
  }

  async function loadUsers() {
    usersRefreshBtn.disabled = true;
    userListEl.innerHTML = "<p class='empty-inline'>사용자 계정을 불러오는 중입니다.</p>";
    try {
      const result = await window.magicWand.security.localUsers();
      renderUsers(result.users || []);
    } catch (err) {
      userListEl.innerHTML = "";
      userListEl.append(emptyState(`사용자 계정 조회 실패: ${err.message}`));
    } finally {
      usersRefreshBtn.disabled = false;
    }
  }

  function renderUsers(users) {
    userListEl.innerHTML = "";
    if (!users.length) {
      userListEl.append(emptyState("사용자 계정이 없습니다."));
      return;
    }
    for (const u of users) {
      const card = document.createElement("article");
      card.className = "tool-card";
      card.style.cursor = "default";
      const head = document.createElement("div");
      head.className = "tool-card-head";
      const name = document.createElement("strong");
      name.textContent = u.name;
      const badge = document.createElement("span");
      badge.className = `tool-badge ${u.enabled ? "ok" : "muted"}`;
      badge.textContent = u.enabled ? "사용" : "사용 안 함";
      head.append(name, badge);
      const meta = document.createElement("p");
      meta.className = "tool-meta";
      meta.textContent = u.description || "설명 없음";
      card.append(head, meta);
      userListEl.append(card);
    }
  }

  async function pickFolder() {
    try {
      const result = await window.magicWand.security.browse();
      if (result.path) {
        pathInput.value = result.path;
        hideBtn.disabled = false;
        unhideBtn.disabled = false;
      }
    } catch (err) {
      ui.showToast(`폴더 선택 실패: ${err.message}`);
    }
  }

  async function setHidden(hidden) {
    const path = pathInput.value.trim();
    if (!path) {
      ui.showToast("대상 폴더를 먼저 선택해 주세요.");
      return;
    }
    hideBtn.disabled = true;
    unhideBtn.disabled = true;
    try {
      await window.magicWand.security.setHidden({ path, hidden });
      ui.showToast(hidden ? "숨김으로 설정했습니다." : "숨김을 해제했습니다.");
    } catch (err) {
      ui.showToast(`오류: ${err.message}`);
    } finally {
      hideBtn.disabled = false;
      unhideBtn.disabled = false;
    }
  }

  function emptyState(message) {
    const el = document.createElement("p");
    el.className = "empty-inline";
    el.textContent = message;
    return el;
  }

  function bindToolButtons(root) {
    root.querySelectorAll("[data-windows-tool]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await window.magicWand.system.openWindowsTool(btn.dataset.windowsTool);
        } catch (err) {
          ui.showToast(`도구 실행 실패: ${err.message}`);
        }
      });
    });
  }
})();
