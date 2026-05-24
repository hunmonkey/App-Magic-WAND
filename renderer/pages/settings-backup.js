(function () {
  const ui = window.MagicWand;
  const backupBtn = document.querySelector("#settingsBackupBtn");
  const restoreBtn = document.querySelector("#settingsRestoreBtn");
  const status = document.querySelector("#settingsBackupStatus");
  if (!ui || !backupBtn || !restoreBtn) return;

  const api = window.magicWand.settingsBackup;

  backupBtn.addEventListener("click", doBackup);
  restoreBtn.addEventListener("click", doRestore);

  async function doBackup() {
    backupBtn.disabled = true;
    ui.setBusy(backupBtn, true);
    try {
      const result = await api.export();
      if (result.canceled) return;
      status.textContent = `설정 ${result.count}개 항목을 백업했습니다.`;
      ui.showToast("설정 백업을 저장했습니다.");
    } catch (error) {
      ui.showToast(`설정 백업 실패: ${error.message}`);
    } finally {
      backupBtn.disabled = false;
      ui.setBusy(backupBtn, false);
    }
  }

  async function doRestore() {
    const ok = await ui.showConfirm("백업 파일을 선택해 현재 설정에 덮어씁니다. 계속할까요?", { confirmText: "복원" });
    if (!ok) return;

    restoreBtn.disabled = true;
    ui.setBusy(restoreBtn, true);
    try {
      const result = await api.import({ token: "settings-restore-confirmed" });
      if (result.canceled) return;
      status.textContent = `설정 ${result.restored}개 항목을 복원했습니다. 일부 화면은 다시 열면 반영됩니다.`;
      ui.showToast("설정을 복원했습니다.");
    } catch (error) {
      ui.showToast(`설정 복원 실패: ${error.message}`);
    } finally {
      restoreBtn.disabled = false;
      ui.setBusy(restoreBtn, false);
    }
  }
})();
