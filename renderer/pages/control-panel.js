(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#controlPanelMenu");
  if (!menu || !ui) return;

  const summary         = document.querySelector("#controlSummary");
  const adapterSelect   = document.querySelector("#controlAdapterSelect");
  const currentConfigEl = document.querySelector("#controlCurrentConfig");
  const staticFields    = document.querySelector("#staticFields");
  const applyIpBtn      = document.querySelector("#applyIpButton");
  const nameDisplay     = document.querySelector("#computerNameDisplay");
  const applyNameBtn    = document.querySelector("#applyNameButton");

  let adapters = [];
  let loaded   = false;

  menu.addEventListener("click", () => {
    ui.switchPage("#controlPanelPage", menu);
    if (!loaded) { loaded = true; loadAll(); }
  });

  document.querySelector("#controlRefresh").addEventListener("click", () => {
    loaded = false;
    loadAll();
  });

  adapterSelect.addEventListener("change", renderCurrentConfig);

  document.querySelectorAll('input[name="ipMode"]').forEach(r =>
    r.addEventListener("change", onModeChange)
  );

  document.querySelector("#ipSettingForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await applyIpConfig();
  });

  document.querySelector("#computerNameForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await applyComputerName();
  });

  function loadAll() {
    loadAdapters();
    loadComputerName();
  }

  async function loadAdapters() {
    summary.textContent       = "어댑터 정보를 불러오는 중...";
    adapterSelect.innerHTML   = "";
    adapterSelect.disabled    = true;
    applyIpBtn.disabled       = true;
    currentConfigEl.innerHTML = "";

    try {
      const result = await window.magicWand.control.getAdapters();
      adapters = result.adapters || [];

      if (result.messages?.length) summary.textContent = result.messages.join(" / ");

      if (adapters.length === 0) {
        summary.textContent = "사용 가능한 네트워크 어댑터가 없습니다.";
        return;
      }

      adapters.forEach(a => {
        const opt = document.createElement("option");
        opt.value       = a.name;
        opt.textContent = a.name + (a.status !== "Up" ? " (비활성)" : "");
        adapterSelect.append(opt);
      });

      adapterSelect.disabled = false;
      applyIpBtn.disabled    = false;
      renderCurrentConfig();
    } catch (err) {
      summary.textContent = `불러오기 실패: ${err.message}`;
    }
  }

  function renderCurrentConfig() {
    const a = adapters.find(ad => ad.name === adapterSelect.value);
    if (!a) { currentConfigEl.innerHTML = ""; return; }

    summary.textContent = a.description || a.name;

    document.querySelector(`input[name="ipMode"][value="${a.dhcp ? "dhcp" : "static"}"]`).checked = true;
    staticFields.hidden = a.dhcp;
    if (!a.dhcp) prefillStaticFields(a);

    currentConfigEl.innerHTML = "";
    [
      ["현재 IP",   a.ip ? `${a.ip} / ${a.prefix}` : "없음"],
      ["게이트웨이", a.gateway || "없음"],
      ["DNS",       a.dns || "없음"],
      ["설정 방식",  a.dhcp ? "DHCP 자동" : "수동 고정"],
      ["MAC",       a.mac || "없음"],
    ].forEach(([label, value]) => {
      const div = document.createElement("div");
      const dt  = document.createElement("dt");
      const dd  = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      div.append(dt, dd);
      currentConfigEl.append(div);
    });
  }

  function onModeChange() {
    const isStatic = document.querySelector('input[name="ipMode"]:checked').value === "static";
    staticFields.hidden = !isStatic;
    if (isStatic) {
      const a = adapters.find(ad => ad.name === adapterSelect.value);
      if (a) prefillStaticFields(a);
    }
  }

  function prefillStaticFields(a) {
    document.querySelector("#ctrlIp").value      = a.ip      || "";
    document.querySelector("#ctrlPrefix").value  = a.prefix  || 24;
    document.querySelector("#ctrlGateway").value = a.gateway || "";
    document.querySelector("#ctrlDns").value     = a.dns     || "";
  }

  async function applyIpConfig() {
    const adapterName = adapterSelect.value;
    if (!adapterName) return;

    const isDhcp = document.querySelector('input[name="ipMode"]:checked').value === "dhcp";
    const config = { dhcp: isDhcp };
    if (!isDhcp) {
      config.ip      = document.querySelector("#ctrlIp").value.trim();
      config.prefix  = document.querySelector("#ctrlPrefix").value.trim();
      config.gateway = document.querySelector("#ctrlGateway").value.trim();
      config.dns     = document.querySelector("#ctrlDns").value.trim();
    }

    applyIpBtn.disabled    = true;
    applyIpBtn.textContent = "적용 중...";
    try {
      await window.magicWand.control.applyConfig(adapterName, config);
      ui.showToast(`${adapterName} 설정이 적용됐습니다.`);
      loaded = false;
      loadAdapters();
    } catch (err) {
      ui.showToast(`오류: ${err.message}`);
    } finally {
      applyIpBtn.disabled    = false;
      applyIpBtn.textContent = "설정 적용";
    }
  }

  async function loadComputerName() {
    nameDisplay.textContent = "확인 중...";
    try {
      const result = await window.magicWand.control.getComputerName();
      nameDisplay.textContent = `현재: ${result.name}`;
    } catch (err) {
      nameDisplay.textContent = `확인 실패: ${err.message}`;
    }
  }

  async function applyComputerName() {
    const newName = document.querySelector("#newComputerName").value.trim();
    if (!newName) return;

    applyNameBtn.disabled    = true;
    applyNameBtn.textContent = "변경 중...";
    try {
      await window.magicWand.control.renameComputer(newName);
      ui.showToast(`"${newName}"으로 변경됩니다. 재시작 후 적용됩니다.`);
      document.querySelector("#newComputerName").value = "";
      loadComputerName();
    } catch (err) {
      ui.showToast(`오류: ${err.message}`);
    } finally {
      applyNameBtn.disabled    = false;
      applyNameBtn.textContent = "이름 변경";
    }
  }
})();
