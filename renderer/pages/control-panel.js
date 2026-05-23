(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#controlPanelMenu");
  if (!menu || !ui) return;

  // ── Left column
  const startIpEl   = document.querySelector("#netStartIp");
  const endIpEl     = document.querySelector("#netEndIp");
  const autoBtn     = document.querySelector("#netAutoBtn");
  const scanBtn     = document.querySelector("#netScanBtn");
  const ipGrid      = document.querySelector("#netIpGrid");
  const scanStatus  = document.querySelector("#netScanStatus");

  // ── Center column
  const adapterSelect   = document.querySelector("#controlAdapterSelect");
  const currentConfigEl = document.querySelector("#controlCurrentConfig");
  const staticFields    = document.querySelector("#staticFields");
  const applyIpBtn      = document.querySelector("#applyIpButton");

  // ── Right column
  const diagBtn       = document.querySelector("#netDiagBtn");
  const refreshBtn    = document.querySelector("#netRefreshBtn");
  const diagResults   = document.querySelector("#netDiagResults");
  const pubIpEl     = document.querySelector("#netPublicIp");
  const privIpEl    = document.querySelector("#netPrivateIp");
  const gatewayEl   = document.querySelector("#netGateway");
  const rangeEl     = document.querySelector("#netRange");
  const routerFindBtn = document.querySelector("#routerFindBtn");
  const routerSummary = document.querySelector("#routerSummary");
  const routerResults = document.querySelector("#routerResults");
  const monitorSummary = document.querySelector("#netMonitorSummary");
  const monitorTarget = document.querySelector("#netMonitorTarget");
  const monitorStartBtn = document.querySelector("#netMonitorStartBtn");
  const monitorStopBtn = document.querySelector("#netMonitorStopBtn");
  const monitorPing = document.querySelector("#netMonitorPing");
  const monitorDown = document.querySelector("#netMonitorDown");
  const monitorUp = document.querySelector("#netMonitorUp");
  const monitorChart = document.querySelector("#netMonitorChart");

  let adapters = [];
  let loaded = false;
  let selectedInterfaceId = "";
  let monitorRunning = false;
  let monitorPoints = [];

  initGrid();
  renderConfigMessage("새로고침 버튼을 눌러 네트워크 어댑터 정보를 불러오세요.");

  menu.addEventListener("click", () => {
    ui.switchPage("#controlPanelPage", menu);
  });

  document.querySelector("#controlRefresh").addEventListener("click", () => {
    loaded = true;
    loadAll();
  });

  adapterSelect.addEventListener("change", renderCurrentConfig);
  document.querySelectorAll('input[name="ipMode"]').forEach((r) =>
    r.addEventListener("change", onModeChange)
  );
  document.querySelector("#ipSettingForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await applyIpConfig();
  });
  autoBtn.addEventListener("click", autoDetect);
  scanBtn.addEventListener("click", doScan);
  diagBtn.addEventListener("click", runDiag);
  refreshBtn.addEventListener("click", refreshOverview);
  routerFindBtn.addEventListener("click", findRouter);
  monitorStartBtn.addEventListener("click", startMonitor);
  monitorStopBtn.addEventListener("click", stopMonitor);
  window.magicWand.netMonitor.onTick(handleMonitorTick);
  window.addEventListener("beforeunload", () => {
    if (monitorRunning) {
      window.magicWand.netMonitor.stop();
    }
  });

  // ─────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────
  function loadAll() {
    loadAdapters();
    autoDetect();
  }

  // ─────────────────────────────────────────────
  // Left: IP 사용 현황
  // ─────────────────────────────────────────────
  function initGrid() {
    ipGrid.innerHTML = "";
    for (let i = 0; i < 255; i++) {
      const cell = document.createElement("div");
      cell.className = "ip-cell";
      const num = document.createElement("span");
      num.className = "ip-num";
      num.textContent = String(i + 1);
      cell.append(num);
      ipGrid.append(cell);
    }
  }

  async function autoDetect() {
    autoBtn.disabled = true;
    ui.setBusy(autoBtn, true);
    scanStatus.textContent = "네트워크 정보를 불러오는 중...";
    try {
      const result = await window.magicWand.network.scan();
      const iface = result.primaryInterface ?? result.privateInterfaces?.[0];

      pubIpEl.textContent   = result.publicIp || "—";
      privIpEl.textContent  = iface?.privateIp || "—";
      gatewayEl.textContent = iface?.gateway || "—";
      rangeEl.textContent   = iface?.networkRange || "—";

      if (iface) {
        selectedInterfaceId = iface.id;
        const rangeStr = iface.networkRange;
        if (rangeStr && rangeStr.includes("/")) {
          const [baseIp, prefix] = rangeStr.split("/");
          const prefixNum = parseInt(prefix, 10);
          const baseNum = ipToNum(baseIp);
          const hostCount = Math.min(255, (1 << (32 - prefixNum)) - 2);
          startIpEl.value = numToIp((baseNum + 1) >>> 0);
          endIpEl.value   = numToIp((baseNum + 255) >>> 0);
        }
        scanStatus.textContent = "자동 감지 완료. 검색 버튼을 눌러 스캔하세요.";
      } else {
        scanStatus.textContent = "네트워크 인터페이스를 찾지 못했습니다.";
      }
    } catch (err) {
      scanStatus.textContent = `네트워크 정보 조회 실패: ${err.message}`;
    } finally {
      autoBtn.disabled = false;
      ui.setBusy(autoBtn, false);
    }
  }

  async function doScan() {
    const start = startIpEl.value.trim();
    const end   = endIpEl.value.trim();
    if (!start || !end) {
      scanStatus.textContent = "시작 IP와 끝 IP를 입력해 주세요.";
      return;
    }
    scanBtn.disabled = true;
    ui.setBusy(scanBtn, true);
    scanStatus.textContent = "스캔 중... (잠시 기다려 주세요)";
    resetGrid();
    try {
      const result = await window.magicWand.network.scanRange(start, end);
      if (result.messages?.length) {
        scanStatus.textContent = result.messages.join(" / ");
        return;
      }
      renderGrid(result.hosts);
      scanStatus.textContent = `사용 중: ${result.usedCount}개 / 비어 있음: ${result.freeCount}개`;
    } catch (err) {
      scanStatus.textContent = `스캔 실패: ${err.message}`;
    } finally {
      scanBtn.disabled = false;
      ui.setBusy(scanBtn, false);
    }
  }

  function resetGrid() {
    ipGrid.querySelectorAll(".ip-cell").forEach((c) => {
      c.className = "ip-cell";
    });
  }

  function renderGrid(hosts) {
    const cells = ipGrid.querySelectorAll(".ip-cell");
    hosts.forEach((host, i) => {
      if (i >= cells.length) return;
      const cell = cells[i];
      cell.querySelector(".ip-num").textContent = host.ip.split(".").at(-1);
      if (host.status === "used") {
        cell.className = "ip-cell used";
      } else if (host.status === "conflict") {
        cell.className = "ip-cell conflict";
      } else {
        cell.className = "ip-cell free";
      }
      const tipParts = [host.ip];
      if (host.role === "self") tipParts.push("현재 PC");
      else if (host.role === "gateway") tipParts.push("게이트웨이");
      if (host.name && host.name !== host.ip) tipParts.push(host.name);
      if (host.macAddress) tipParts.push(`MAC: ${host.macAddress}`);
      cell.title = tipParts.join("\n");
    });
    for (let i = hosts.length; i < cells.length; i++) {
      cells[i].className = "ip-cell ip-empty";
      cells[i].querySelector(".ip-num").textContent = "";
      cells[i].title = "";
    }
  }

  function ipToNum(ip) {
    return ip.split(".").reduce((acc, p) => ((acc << 8) + Number(p)) >>> 0, 0);
  }

  function numToIp(n) {
    return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");
  }

  // ─────────────────────────────────────────────
  // Right: 네트워크 장애 조치
  // ─────────────────────────────────────────────
  async function refreshOverview() {
    refreshBtn.disabled = true;
    ui.setBusy(refreshBtn, true);
    try {
      const result = await window.magicWand.network.scan();
      const iface = result.primaryInterface ?? result.privateInterfaces?.[0];
      pubIpEl.textContent   = result.publicIp || "—";
      privIpEl.textContent  = iface?.privateIp || "—";
      gatewayEl.textContent = iface?.gateway || "—";
      rangeEl.textContent   = iface?.networkRange || "—";
      if (iface) selectedInterfaceId = iface.id;
    } catch {
      // 실패 시 기존 값 유지
    } finally {
      refreshBtn.disabled = false;
      ui.setBusy(refreshBtn, false);
    }
  }

  async function runDiag() {
    diagBtn.disabled = true;
    ui.setBusy(diagBtn, true);
    diagResults.innerHTML = "";
    diagResults.append(ui.createLoadingState("진단 중입니다."));
    try {
      const result = await window.magicWand.network.diagnose(selectedInterfaceId);
      renderDiag(result);
    } catch (err) {
      diagResults.innerHTML = `<p class='muted-text'>진단 실패: ${err.message}</p>`;
    } finally {
      diagBtn.disabled = false;
      ui.setBusy(diagBtn, false);
    }
  }

  async function findRouter() {
    routerFindBtn.disabled = true;
    ui.setBusy(routerFindBtn, true);
    routerResults.innerHTML = "";
    routerResults.append(ui.createLoadingState("공유기 후보를 찾는 중입니다."));
    routerSummary.textContent = "게이트웨이와 자주 쓰는 공유기 주소를 확인합니다.";
    try {
      const result = await window.magicWand.network.routerInfo();
      renderRouterInfo(result);
    } catch (err) {
      routerResults.innerHTML = `<p class="empty-inline">공유기 정보를 불러오지 못했습니다: ${err.message}</p>`;
      routerSummary.textContent = "공유기 찾기에 실패했습니다.";
    } finally {
      routerFindBtn.disabled = false;
      ui.setBusy(routerFindBtn, false);
    }
  }

  function renderRouterInfo(result) {
    routerResults.innerHTML = "";
    const wifi = result.wifi?.find((item) => item.ssid) ?? result.wifi?.[0];
    const gateway = result.candidates?.find((item) => item.role === "현재 게이트웨이");
    routerSummary.textContent = gateway
      ? `현재 공유기 후보: ${gateway.ip}`
      : "게이트웨이를 찾지 못해 기본 공유기 주소를 확인했습니다.";

    if (wifi) {
      const wifiBox = document.createElement("div");
      wifiBox.className = "router-wifi-box";
      wifiBox.append(routerLine("Wi-Fi", wifi.ssid || wifi.name || "확인 안 됨"));
      wifiBox.append(routerLine("신호", wifi.signal || "확인 안 됨"));
      wifiBox.append(routerLine("채널", wifi.channel || "확인 안 됨"));
      routerResults.append(wifiBox);
    }

    const candidates = result.candidates || [];
    if (!candidates.length) {
      routerResults.append(emptyState("공유기 후보를 찾지 못했습니다."));
      return;
    }

    for (const item of candidates) {
      const card = document.createElement("article");
      card.className = `router-card ${item.reachable ? "ok" : ""}`;
      const head = document.createElement("div");
      head.className = "router-card-head";
      const title = document.createElement("strong");
      title.textContent = item.ip;
      const badge = document.createElement("span");
      badge.className = `tool-badge ${item.reachable ? "ok" : "muted"}`;
      badge.textContent = item.reachable ? "응답" : "미응답";
      head.append(title, badge);

      const meta = document.createElement("p");
      meta.className = "tool-meta";
      meta.textContent = `${item.role}${item.macAddress ? ` · MAC ${item.macAddress}` : ""}`;

      const actions = document.createElement("div");
      actions.className = "router-actions";
      for (const url of item.adminUrls || []) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = url.startsWith("https") ? "HTTPS 열기" : "HTTP 열기";
        btn.addEventListener("click", () => openRouter(url));
        actions.append(btn);
      }
      card.append(head, meta, actions);
      routerResults.append(card);
    }
  }

  function routerLine(label, value) {
    const row = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = label;
    const span = document.createElement("span");
    span.textContent = value;
    row.append(strong, span);
    return row;
  }

  function emptyState(message) {
    const p = document.createElement("p");
    p.className = "empty-inline";
    p.textContent = message;
    return p;
  }

  async function openRouter(url) {
    try {
      await window.magicWand.network.openRouter(url);
    } catch (err) {
      ui.showToast(`공유기 페이지 열기 실패: ${err.message}`);
    }
  }

  async function startMonitor() {
    if (monitorRunning) return;
    const targetHost = monitorTarget.value.trim() || "1.1.1.1";
    monitorRunning = true;
    monitorPoints = [];
    monitorStartBtn.disabled = true;
    ui.setBusy(monitorStartBtn, true);
    monitorStopBtn.disabled = false;
    monitorTarget.disabled = true;
    monitorSummary.textContent = "실시간 모니터링을 시작했습니다.";
    drawMonitorChart();
    try {
      await window.magicWand.netMonitor.start({
        targetHost,
        interfaceName: currentInterfaceName(),
        intervalMs: 2000,
      });
    } catch (err) {
      monitorRunning = false;
      monitorStartBtn.disabled = false;
      ui.setBusy(monitorStartBtn, false);
      monitorStopBtn.disabled = true;
      monitorTarget.disabled = false;
      monitorSummary.textContent = `모니터 시작 실패: ${err.message}`;
    }
  }

  async function stopMonitor() {
    if (!monitorRunning) return;
    monitorRunning = false;
    monitorStartBtn.disabled = false;
    ui.setBusy(monitorStartBtn, false);
    monitorStopBtn.disabled = true;
    monitorTarget.disabled = false;
    monitorSummary.textContent = "모니터링을 정지했습니다.";
    try {
      await window.magicWand.netMonitor.stop();
    } catch {}
  }

  function currentInterfaceName() {
    return adapterSelect.value || selectedInterfaceId.split("|")[0] || "";
  }

  function handleMonitorTick(payload) {
    if (!monitorRunning) return;
    if (payload.error) {
      monitorSummary.textContent = `모니터링 오류: ${payload.error}`;
    } else {
      monitorSummary.textContent = `${payload.interfaceName || "네트워크"} · 대상 ${payload.targetHost}`;
    }
    monitorPing.textContent = payload.online && payload.latencyMs != null ? `${Math.round(payload.latencyMs)}ms` : "응답 없음";
    monitorDown.textContent = formatRate(payload.downloadBps);
    monitorUp.textContent = formatRate(payload.uploadBps);
    monitorPoints.push({
      down: Number(payload.downloadBps) || 0,
      up: Number(payload.uploadBps) || 0,
      ping: Number(payload.latencyMs) || 0,
    });
    if (monitorPoints.length > 40) {
      monitorPoints = monitorPoints.slice(-40);
    }
    drawMonitorChart();
  }

  function drawMonitorChart() {
    if (!monitorChart) return;
    const ctx = monitorChart.getContext("2d");
    const width = monitorChart.width;
    const height = monitorChart.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#ccd6e2";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const y = Math.round((height / 4) * i);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    drawLine(ctx, width, height, monitorPoints.map((point) => point.down), "#2563eb");
    drawLine(ctx, width, height, monitorPoints.map((point) => point.up), "#15803d");
  }

  function drawLine(ctx, width, height, values, color) {
    if (values.length < 2) return;
    const max = Math.max(1, ...monitorPoints.flatMap((point) => [point.down, point.up]));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * (width - 8) + 4;
      const y = height - 6 - (Math.max(0, value) / max) * (height - 14);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function formatRate(bytesPerSecond) {
    const value = Number(bytesPerSecond) || 0;
    if (value < 1024) return `${value} B/s`;
    const units = ["KB/s", "MB/s", "GB/s"];
    let size = value / 1024;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`;
  }

  function renderDiag(result) {
    diagResults.innerHTML = "";
    if (result.summary) {
      const s = document.createElement("p");
      s.className = "net-diag-summary";
      s.textContent = result.summary;
      diagResults.append(s);
    }
    for (const test of result.tests ?? []) {
      const item = document.createElement("div");
      item.className = `diagnostic-item ${test.status}`;
      const header = document.createElement("div");
      const name   = document.createElement("strong");
      const badge  = document.createElement("span");
      name.textContent  = test.name;
      badge.textContent = test.status === "ok" ? "정상" : test.status === "fail" ? "실패" : "주의";
      header.append(name, badge);
      const detail = document.createElement("p");
      detail.textContent = test.detail;
      const hint = document.createElement("p");
      hint.textContent = test.hint;
      item.append(header, detail, hint);
      if (test.repairs?.length) {
        const repairRow = document.createElement("div");
        repairRow.className = "repair-row";
        for (const repair of test.repairs) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "repair-btn";
          btn.textContent = repair.label;
          btn.addEventListener("click", () => runRepair(btn, repair));
          repairRow.append(btn);
        }
        item.append(repairRow);
      }
      diagResults.append(item);
    }
  }

  async function runRepair(btn, repair) {
    const { action, interfaceName, fallbacks = [] } = repair;
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "처리 중...";
    const item = btn.closest(".diagnostic-item");
    item.querySelector(".repair-result")?.remove();
    item.querySelector(".fallback-row")?.remove();
    try {
      const result = await window.magicWand.network.repair(action, interfaceName);
      const msg = document.createElement("p");
      msg.className = "repair-result ok";
      msg.textContent = result.message;
      btn.closest(".repair-row").after(msg);
    } catch (err) {
      const msg = document.createElement("p");
      msg.className = "repair-result fail";
      msg.textContent = `복구 실패: ${err.message}`;
      btn.closest(".repair-row").after(msg);
      btn.disabled = false;
      btn.textContent = originalLabel;
      if (fallbacks.length) {
        const fallbackRow = document.createElement("div");
        fallbackRow.className = "repair-row fallback-row";
        const label = document.createElement("span");
        label.className = "fallback-label";
        label.textContent = "다른 방법:";
        fallbackRow.append(label);
        for (const fb of fallbacks) {
          const fbBtn = document.createElement("button");
          fbBtn.type = "button";
          fbBtn.className = "repair-btn fallback-btn";
          fbBtn.textContent = fb.label;
          fbBtn.addEventListener("click", () => runRepair(fbBtn, fb));
          fallbackRow.append(fbBtn);
        }
        msg.after(fallbackRow);
      }
    }
  }

  // ─────────────────────────────────────────────
  // Center: 네트워크 어댑터 설정
  // ─────────────────────────────────────────────
  async function loadAdapters() {
    adapterSelect.innerHTML = "";
    adapterSelect.disabled  = true;
    applyIpBtn.disabled     = true;
    renderConfigMessage("어댑터 정보를 불러오는 중입니다.");
    try {
      const result = await window.magicWand.control.getAdapters();
      adapters = result.adapters || [];
      if (adapters.length === 0) {
        renderConfigMessage(result.messages?.join(" / ") || "사용 가능한 네트워크 어댑터가 없습니다.");
        return;
      }
      adapters.forEach((a) => {
        const opt = document.createElement("option");
        opt.value       = a.name;
        opt.textContent = cleanName(a.name) + (a.status !== "Up" ? " (비활성)" : "");
        adapterSelect.append(opt);
      });
      adapterSelect.disabled = false;
      applyIpBtn.disabled    = false;
      renderCurrentConfig();
    } catch (err) {
      renderConfigMessage(`불러오기 실패: ${err.message}`);
    }
  }

  function renderCurrentConfig() {
    const a = adapters.find((ad) => ad.name === adapterSelect.value);
    if (!a) { currentConfigEl.innerHTML = ""; toggleStaticFieldsDisabled(true); return; }
    document.querySelector(`input[name="ipMode"][value="${a.dhcp ? "dhcp" : "static"}"]`).checked = true;
    prefillStaticFields(a);
    toggleStaticFieldsDisabled(a.dhcp);
    const dnsArr = (a.dns || "").split(",").map((d) => d.trim()).filter(Boolean);
    currentConfigEl.innerHTML = "";
    [
      ["IP 주소",  a.ip      || "없음"],
      ["서브넷 마스크", a.prefix != null ? prefixToMask(a.prefix) : "없음"],
      ["게이트웨이", a.gateway || "없음"],
      ["MAC",      a.mac     || "없음"],
      ["DNS 1",    dnsArr[0] || "없음"],
      ["DNS 2",    dnsArr[1] || "—"],
      ["IP 설정",  a.dhcp ? "DHCP 자동" : "수동 고정"],
      ["IP 구성",  "IPv4" + (a.ipv6 ? " + IPv6" : "")],
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

  function renderConfigMessage(message) {
    currentConfigEl.innerHTML = "";
    const div = document.createElement("div");
    const dt  = document.createElement("dt");
    const dd  = document.createElement("dd");
    dt.textContent = "상태";
    dd.textContent = message;
    div.append(dt, dd);
    currentConfigEl.append(div);
  }

  function onModeChange() {
    const isStatic = document.querySelector('input[name="ipMode"]:checked').value === "static";
    toggleStaticFieldsDisabled(!isStatic);
    if (isStatic) {
      const a = adapters.find((ad) => ad.name === adapterSelect.value);
      if (a) prefillStaticFields(a);
    }
  }

  function toggleStaticFieldsDisabled(disabled) {
    staticFields.querySelectorAll("input").forEach(input => { input.disabled = disabled; });
  }

  function prefixToMask(prefix) {
    const n = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  }

  function maskToPrefix(mask) {
    return (mask || "").split(".").reduce((acc, oct) => acc + (Number(oct) >>> 0).toString(2).split("").filter((b) => b === "1").length, 0);
  }

  function prefillStaticFields(a) {
    const dnsArr = (a.dns || "").split(",").map((d) => d.trim());
    document.querySelector("#ctrlIp").value      = a.ip               || "";
    document.querySelector("#ctrlSubnet").value  = prefixToMask(a.prefix || 24);
    document.querySelector("#ctrlGateway").value = a.gateway          || "";
    document.querySelector("#ctrlDns1").value    = dnsArr[0]          || "";
    document.querySelector("#ctrlDns2").value    = dnsArr[1]          || "";
  }

  async function applyIpConfig() {
    const adapterName = adapterSelect.value;
    if (!adapterName) return;
    const isDhcp = document.querySelector('input[name="ipMode"]:checked').value === "dhcp";
    const config = { dhcp: isDhcp };
    if (!isDhcp) {
      const subnet = document.querySelector("#ctrlSubnet").value.trim();
      const dns1   = document.querySelector("#ctrlDns1").value.trim();
      const dns2   = document.querySelector("#ctrlDns2").value.trim();
      config.ip      = document.querySelector("#ctrlIp").value.trim();
      config.prefix  = maskToPrefix(subnet);
      config.gateway = document.querySelector("#ctrlGateway").value.trim();
      config.dns     = [dns1, dns2].filter(Boolean).join(",");
    }
    const modeLabel = isDhcp ? "DHCP 자동" : `고정 IP ${config.ip || ""}`;
    const ok = await ui.showConfirm(
      `${adapterName} 설정을 ${modeLabel}(으)로 변경할까요? 변경 중 네트워크 연결이 일시적으로 끊길 수 있습니다.`,
      { confirmText: "설정 적용", danger: false }
    );
    if (!ok) return;

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

  function cleanName(str) {
    return (str || "").replace(/[^ -~가-힣]/g, "").replace(/ {2,}/g, " ").trim();
  }
})();
