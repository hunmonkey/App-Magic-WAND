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
  // CD-KEY
  const keyEl = document.querySelector("#securityProductKey");
  const keyFindBtn = document.querySelector("#securityKeyFindBtn");
  const keySaveBtn = document.querySelector("#securityKeySaveBtn");
  // 영구 삭제
  const eraseTargetPath = document.querySelector("#eraseTargetPath");
  const erasePickFileBtn = document.querySelector("#erasePickFileBtn");
  const erasePickFolderBtn = document.querySelector("#erasePickFolderBtn");
  const eraseRunBtn = document.querySelector("#eraseRunBtn");
  const eraseDriveSelect = document.querySelector("#eraseDriveSelect");
  const eraseDriveRefreshBtn = document.querySelector("#eraseDriveRefreshBtn");
  const eraseDriveBtn = document.querySelector("#eraseDriveBtn");
  const eraseStatus = document.querySelector("#eraseStatus");

  let foundKey = "";
  let eraseTarget = "";
  let erasing = false;

  menu.addEventListener("click", () => {
    ui.switchPage("#securityPage", menu);
  });

  refreshBtn.addEventListener("click", loadStatus);
  usersRefreshBtn.addEventListener("click", loadUsers);
  browseBtn.addEventListener("click", pickFolder);
  hideBtn.addEventListener("click", () => setHidden(true));
  unhideBtn.addEventListener("click", () => setHidden(false));
  keyFindBtn.addEventListener("click", findProductKey);
  keySaveBtn.addEventListener("click", saveProductKey);
  erasePickFileBtn.addEventListener("click", () => pickErase("file"));
  erasePickFolderBtn.addEventListener("click", () => pickErase("folder"));
  eraseRunBtn.addEventListener("click", runErasePath);
  eraseDriveRefreshBtn.addEventListener("click", loadDrives);
  eraseDriveBtn.addEventListener("click", runEraseDrive);
  window.magicWand.secureErase.onProgress(renderEraseProgress);
  bindToolButtons(page);

  renderKeyMessage("'찾기' 버튼을 눌러 제품 키를 조회하세요.");
  renderActivationMessage("새로고침 버튼을 눌러 정품 인증·암호화 상태를 확인하세요.");
  bitlockerEl.append(emptyState("새로고침 버튼을 눌러 드라이브 암호화를 확인하세요."));
  userListEl.append(emptyState("새로고침 버튼을 눌러 사용자 계정을 불러오세요."));
  setDrivePlaceholder("목록 조회 버튼을 눌러 확인하세요");

  function setDrivePlaceholder(text) {
    eraseDriveSelect.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = text;
    eraseDriveSelect.append(opt);
    eraseDriveBtn.disabled = true;
  }

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

  // ── 운영체제 CD-KEY
  async function findProductKey() {
    keyFindBtn.disabled = true;
    keySaveBtn.disabled = true;
    renderKeyMessage("제품 키를 조회하는 중입니다...");
    try {
      const r = await window.magicWand.security.productKey();
      renderProductKey(r);
    } catch (err) {
      foundKey = "";
      renderKeyMessage(`제품 키 조회 실패: ${err.message}`);
    } finally {
      keyFindBtn.disabled = false;
    }
  }

  function renderProductKey(r) {
    const rows = [];
    if (r.key) {
      foundKey = r.key;
      rows.push(["제품 키", r.key]);
      rows.push(["키 출처", r.source === "firmware" ? "메인보드(펌웨어) OEM 키" : "현재 설치(레지스트리) 키"]);
      keySaveBtn.disabled = false;
    } else {
      foundKey = "";
      rows.push(["제품 키", "표시할 키 없음"]);
      rows.push(["안내", "디지털 라이선스로 인증되었거나, 제품 키가 없는 무료·평가판일 수 있습니다."]);
      keySaveBtn.disabled = true;
    }
    if (r.edition) rows.push(["에디션", r.edition]);
    renderKeyRows(rows);
  }

  function renderKeyRows(rows) {
    keyEl.innerHTML = "";
    for (const [label, value] of rows) {
      const div = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      div.append(dt, dd);
      keyEl.append(div);
    }
  }

  function renderKeyMessage(message) {
    renderKeyRows([["상태", message]]);
  }

  async function saveProductKey() {
    if (!foundKey) {
      ui.showToast("저장할 제품 키가 없습니다.");
      return;
    }
    keySaveBtn.disabled = true;
    try {
      const r = await window.magicWand.security.saveProductKeyText(`Windows 제품 키\r\n${foundKey}`);
      if (!r.canceled) ui.showToast(`저장했습니다: ${r.filePath}`);
    } catch (err) {
      ui.showToast(`저장 실패: ${err.message}`);
    } finally {
      keySaveBtn.disabled = false;
    }
  }

  // ── 복구 불가 영구 삭제
  function selectedMethod() {
    return document.querySelector('input[name="eraseMethod"]:checked')?.value || "zero";
  }

  async function pickErase(type) {
    if (erasing) return;
    try {
      const r = await window.magicWand.secureErase.pick(type);
      if (r.path) {
        eraseTarget = r.path;
        eraseTargetPath.value = r.path;
        eraseRunBtn.disabled = false;
      }
    } catch (err) {
      ui.showToast(`선택 실패: ${err.message}`);
    }
  }

  async function loadDrives() {
    if (erasing) return;
    setDrivePlaceholder("드라이브 목록을 불러오는 중입니다");
    try {
      const r = await window.magicWand.secureErase.listDrives();
      const usable = (r.drives || []).filter((d) => !d.isSystem);
      if (!usable.length) {
        setDrivePlaceholder("와이프 가능한 드라이브 없음");
        return;
      }
      eraseDriveSelect.innerHTML = "";
      for (const d of usable) {
        const opt = document.createElement("option");
        opt.value = d.letter;
        const label = d.label ? ` ${d.label}` : "";
        opt.textContent = `${d.letter}:${label} — 여유 ${d.freeGb}GB / 전체 ${d.sizeGb}GB`;
        eraseDriveSelect.append(opt);
      }
      eraseDriveBtn.disabled = erasing;
    } catch (err) {
      setDrivePlaceholder("드라이브 목록을 불러오지 못했습니다");
      ui.showToast(`드라이브 조회 실패: ${err.message}`);
    }
  }

  async function runErasePath() {
    if (!eraseTarget || erasing) return;
    setErasing(true, "삭제를 준비하는 중입니다...");
    try {
      const r = await window.magicWand.secureErase.run({ mode: "path", path: eraseTarget, method: selectedMethod() });
      if (r.canceled) {
        setEraseStatus("삭제를 취소했습니다.");
      } else {
        setEraseStatus(`완료: ${r.files}개 파일을 영구 삭제했습니다${r.skipped ? `, ${r.skipped}개는 잠겨 있어 건너뜀.` : "."}`);
        eraseTarget = "";
        eraseTargetPath.value = "";
      }
    } catch (err) {
      setEraseStatus(`삭제 실패: ${err.message}`);
    } finally {
      setErasing(false);
    }
  }

  async function runEraseDrive() {
    const drive = eraseDriveSelect.value;
    if (!drive || erasing) return;
    setErasing(true, "드라이브 와이프를 준비하는 중입니다...");
    try {
      const r = await window.magicWand.secureErase.run({ mode: "drive", drive, method: selectedMethod() });
      if (r.canceled) {
        setEraseStatus("와이프를 취소했습니다.");
      } else {
        setEraseStatus(`${r.drive}: 드라이브 와이프 완료. ${r.files}개 파일 삭제${r.skipped ? `, ${r.skipped}개 건너뜀.` : "."}`);
      }
    } catch (err) {
      setEraseStatus(`와이프 실패: ${err.message}`);
    } finally {
      setErasing(false);
      loadDrives();
    }
  }

  function setErasing(on, text) {
    erasing = on;
    erasePickFileBtn.disabled = on;
    erasePickFolderBtn.disabled = on;
    eraseRunBtn.disabled = on || !eraseTarget;
    eraseDriveRefreshBtn.disabled = on;
    eraseDriveBtn.disabled = on || !eraseDriveSelect.value;
    keyFindBtn.disabled = on;
    if (text) setEraseStatus(text);
  }

  function setEraseStatus(text) {
    eraseStatus.hidden = false;
    eraseStatus.textContent = text;
  }

  function renderEraseProgress(p) {
    if (!erasing) return;
    if (p.phase === "info") {
      setEraseStatus(p.text);
    } else if (p.phase === "overwrite") {
      setEraseStatus(`덮어쓰는 중... ${p.files}개 처리${p.skipped ? ` (${p.skipped}개 건너뜀)` : ""}`);
    } else if (p.phase === "freespace") {
      setEraseStatus(`빈 공간 와이프 중... ${p.pass}/${p.total}회차, 약 ${p.sizeGb}GB 기록`);
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
