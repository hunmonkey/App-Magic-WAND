(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#hardwareCheckMenu");
  if (!menu || !ui) {
    return;
  }

  const summary = document.querySelector("#hwCheckSummary");
  const results = document.querySelector("#hwCheckResults");
  const button = document.querySelector("#hwCheckButton");

  let loaded = false;

  menu.addEventListener("click", () => {
    ui.switchPage("#hardwareCheckPage", menu);
    if (!loaded) {
      loaded = true;
      runCheck();
    }
  });

  button.addEventListener("click", runCheck);

  async function runCheck() {
    button.disabled = true;
    summary.textContent = "하드웨어를 점검 중입니다...";
    results.innerHTML = "";

    try {
      const result = await window.magicWand.hardware.check();
      const notes = result.messages?.length ? ` (${result.messages.join(" / ")})` : "";
      summary.textContent = `${result.summary || "점검 완료"}${notes}`;
      ui.renderTestList(results, result.tests);
    } catch (error) {
      summary.textContent = `점검 실패: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }
})();
