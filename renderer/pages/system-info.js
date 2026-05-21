(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#systemInfoMenu");
  if (!menu || !ui) {
    return;
  }

  const hardwareSummary = document.querySelector("#hardwareSummary");
  const hardwareGroups = document.querySelector("#hardwareGroups");
  const hardwareRefresh = document.querySelector("#hardwareRefresh");
  const softwareStatus = document.querySelector("#softwareStatus");
  const softwareSearch = document.querySelector("#softwareSearch");
  const softwareRefresh = document.querySelector("#softwareRefresh");
  const softwareCount = document.querySelector("#softwareCount");
  const softwareTableBody = document.querySelector("#softwareTableBody");

  let loaded = false;
  let softwareItems = [];

  menu.addEventListener("click", () => {
    ui.switchPage("#systemInfoPage", menu);
    if (!loaded) {
      loaded = true;
      loadHardware();
      loadSoftware();
    }
  });

  hardwareRefresh.addEventListener("click", loadHardware);
  softwareRefresh.addEventListener("click", loadSoftware);
  softwareSearch.addEventListener("input", renderSoftware);

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
    hardwareGroups.innerHTML = "";

    for (const group of info.groups ?? []) {
      const card = document.createElement("article");
      card.className = "spec-card";

      const title = document.createElement("h3");
      title.textContent = group.title;
      card.append(title);

      const dl = document.createElement("dl");
      for (const item of group.items ?? []) {
        const row = document.createElement("div");
        const dt = document.createElement("dt");
        dt.textContent = item.label;
        const dd = document.createElement("dd");
        dd.textContent = item.value || "확인 안 됨";
        row.append(dt, dd);
        dl.append(row);
      }
      card.append(dl);
      hardwareGroups.append(card);
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
