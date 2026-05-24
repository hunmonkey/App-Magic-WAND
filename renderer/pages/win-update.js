(function () {
  const ui = window.MagicWand;
  const checkBtn = document.querySelector("#winUpdateCheckBtn");
  const openBtn = document.querySelector("#winUpdateOpenBtn");
  const info = document.querySelector("#winUpdateInfo");
  const status = document.querySelector("#winUpdateStatus");
  if (!ui || !checkBtn) return;

  const api = window.magicWand.winUpdate;

  checkBtn.addEventListener("click", check);
  openBtn.addEventListener("click", () => api.open());

  async function check() {
    checkBtn.disabled = true;
    ui.setBusy(checkBtn, true);
    status.className = "empty-inline";
    status.textContent = "업데이트 상태를 확인하는 중입니다...";
    try {
      const result = await api.status();
      renderInfo(result);
      status.className = result.level === "warn" ? "caution-text" : "empty-inline";
      status.textContent = `${result.level === "warn" ? "주의: " : "정상: "}${result.message}`;
    } catch (error) {
      info.innerHTML = "";
      status.className = "caution-text";
      status.textContent = `업데이트 점검 실패: ${error.message}`;
    } finally {
      checkBtn.disabled = false;
      ui.setBusy(checkBtn, false);
    }
  }

  function renderInfo(result) {
    const rows = [
      ["마지막 설치일", result.lastDate],
      ["마지막 업데이트", result.lastId],
      ["대기 중 업데이트", result.pendingText],
      ["재부팅 필요", result.rebootRequired ? "필요" : "필요 없음"],
    ];
    info.innerHTML = "";
    for (const [label, value] of rows) {
      const wrap = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      wrap.append(dt, dd);
      info.append(wrap);
    }
  }
})();
