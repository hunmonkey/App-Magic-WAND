(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#recoveryMenu");
  if (!menu || !ui) return;

  const api = window.magicWand.recovery;
  const refreshBtn = document.querySelector("#recoveryRefreshBtn");
  const summary = document.querySelector("#recoverySummary");
  const volumeList = document.querySelector("#recoveryVolumeList");
  const selectedBox = document.querySelector("#recoverySelected");
  const scanBtn = document.querySelector("#recoveryScanBtn");
  const fixBtn = document.querySelector("#recoveryFixBtn");
  const resultBox = document.querySelector("#recoveryResult");

  const FIX_TOKEN = "recovery-fix-confirmed";

  let loaded = false;
  let busy = false;
  let volumes = [];
  let selectedLetter = "";
  let lastScan = null;

  menu.addEventListener("click", () => {
    ui.switchPage("#recoveryPage", menu);
    if (!loaded) {
      loaded = true;
      refresh();
    }
  });
  refreshBtn.addEventListener("click", refresh);
  scanBtn.addEventListener("click", () => runCheck("scan"));
  fixBtn.addEventListener("click", confirmFix);

  async function refresh() {
    if (busy) return;
    busy = true;
    refreshBtn.disabled = true;
    ui.setBusy(refreshBtn, true);
    try {
      volumes = await api.volumes();
      if (!volumes.some((volume) => sameLetter(volume.letter, selectedLetter))) {
        selectedLetter = "";
        lastScan = null;
      }
      renderVolumes();
      renderSelected();
    } catch (error) {
      ui.showToast(`USB/SD 목록을 불러오지 못했습니다: ${error.message}`);
    } finally {
      busy = false;
      refreshBtn.disabled = false;
      ui.setBusy(refreshBtn, false);
    }
  }

  function renderVolumes() {
    volumeList.innerHTML = "";
    if (!volumes.length) {
      volumeList.append(empty("연결된 USB 또는 SD카드가 없습니다."));
      summary.textContent = "USB와 SD카드를 불러옵니다.";
      return;
    }

    summary.textContent = `이동식 디스크 ${volumes.length}개`;
    for (const volume of volumes) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "recovery-volume-item";
      btn.classList.toggle("selected", sameLetter(volume.letter, selectedLetter));
      btn.innerHTML = `<strong></strong><span></span><small></small>`;
      btn.querySelector("strong").textContent = `${volume.letter}: ${volume.label || "이름 없음"}`;
      btn.querySelector("span").textContent = [volume.fs || "파일 시스템 확인 안 됨", volume.bus || "이동식"].join(" · ");
      btn.querySelector("small").textContent = `${volume.sizeGB || 0}GB · ${volume.health || "상태 확인 안 됨"}`;
      btn.addEventListener("click", () => selectVolume(volume.letter));
      volumeList.append(btn);
    }
  }

  function selectVolume(letter) {
    selectedLetter = letter;
    lastScan = null;
    renderVolumes();
    renderSelected();
    renderIdle();
  }

  function renderSelected() {
    const volume = selectedVolume();
    selectedBox.innerHTML = "";
    if (!volume) {
      selectedBox.append(row("선택", "없음"));
      scanBtn.disabled = true;
      fixBtn.disabled = true;
      return;
    }
    selectedBox.append(
      row("드라이브", `${volume.letter}:`),
      row("이름", volume.label || "이름 없음"),
      row("형식", volume.fs || "확인 안 됨"),
      row("용량", `${volume.sizeGB || 0}GB`),
      row("상태", volume.health || "확인 안 됨"),
    );
    scanBtn.disabled = busy;
    updateFixButton();
  }

  async function runCheck(mode) {
    const volume = selectedVolume();
    if (!volume || busy) return;
    busy = true;
    scanBtn.disabled = true;
    fixBtn.disabled = true;
    const targetBtn = mode === "fix" ? fixBtn : scanBtn;
    ui.setBusy(targetBtn, true);
    resultBox.innerHTML = "";
    resultBox.append(ui.createLoadingState(mode === "fix" ? "복구를 실행하는 중입니다." : "검사 중입니다."));
    try {
      const payload = { letter: volume.letter, mode };
      if (mode === "fix") payload.token = FIX_TOKEN;
      const result = await api.checkFix(payload);
      lastScan = { letter: volume.letter, result };
      renderResult(result, mode);
    } catch (error) {
      renderError(error.message);
    } finally {
      busy = false;
      ui.setBusy(targetBtn, false);
      renderSelected();
    }
  }

  async function confirmFix() {
    const volume = selectedVolume();
    if (!volume) return;
    const ok = await ui.showConfirm(`${volume.letter}: 드라이브 오류를 복구할까요?`, {
      confirmText: "복구 실행",
      danger: true,
    });
    if (ok) {
      runCheck("fix");
    }
  }

  function renderIdle() {
    resultBox.innerHTML = "";
    resultBox.append(empty("검사시작을 눌러 상태를 확인하세요."));
  }

  function renderResult(result, mode) {
    resultBox.innerHTML = "";
    const card = document.createElement("article");
    card.className = `diagnostic-item ${result.healthy ? "ok" : "warn"}`;
    card.innerHTML = `<div><strong></strong><span></span></div><p></p>`;
    card.querySelector("strong").textContent = mode === "fix" ? "복구 결과" : "검사 결과";
    card.querySelector("span").textContent = result.healthy ? "정상" : "확인 필요";
    card.querySelector("p").textContent = result.message || "결과를 확인하지 못했습니다.";
    resultBox.append(card);
  }

  function renderError(message) {
    resultBox.innerHTML = "";
    const card = document.createElement("article");
    card.className = "diagnostic-item fail";
    card.innerHTML = `<div><strong>작업 실패</strong><span>문제</span></div><p></p>`;
    card.querySelector("p").textContent = message;
    resultBox.append(card);
  }

  function updateFixButton() {
    const canFix = lastScan
      && sameLetter(lastScan.letter, selectedLetter)
      && lastScan.result
      && lastScan.result.healthy === false;
    fixBtn.disabled = busy || !canFix;
  }

  function selectedVolume() {
    return volumes.find((volume) => sameLetter(volume.letter, selectedLetter)) || null;
  }

  function sameLetter(a, b) {
    return String(a || "").toUpperCase() === String(b || "").toUpperCase();
  }

  function row(label, value) {
    const item = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    item.append(dt, dd);
    return item;
  }

  function empty(message) {
    const p = document.createElement("p");
    p.className = "empty-inline";
    p.textContent = message;
    return p;
  }
})();
