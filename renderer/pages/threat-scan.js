(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#threatScanMenu");
  if (!menu || !ui) {
    return;
  }

  const summary = document.querySelector("#threatSummary");
  const list = document.querySelector("#threatList");
  const button = document.querySelector("#threatScanButton");

  let loaded = false;

  menu.addEventListener("click", () => {
    ui.switchPage("#threatScanPage", menu);
    if (!loaded) {
      loaded = true;
      runScan();
    }
  });

  button.addEventListener("click", runScan);

  async function runScan() {
    button.disabled = true;
    summary.textContent = "의심 프로그램을 점검 중입니다...";
    list.innerHTML = "";

    try {
      const result = await window.magicWand.threat.scan();
      const notes = result.messages?.length ? ` (${result.messages.join(" / ")})` : "";
      summary.textContent = `${result.summary || "점검 완료"}${notes}`;
      render(result.items ?? []);
    } catch (error) {
      summary.textContent = `점검 실패: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  function render(items) {
    list.innerHTML = "";

    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-inline";
      empty.textContent = "표시할 의심 항목이 없습니다.";
      list.append(empty);
      return;
    }

    for (const item of items) {
      const card = document.createElement("article");
      card.className = `threat-item ${item.status}`;

      const head = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = item.name;
      const badge = document.createElement("span");
      badge.textContent = item.status === "fail" ? "강한 의심" : "주의";
      head.append(strong, badge);

      const meta = document.createElement("p");
      meta.className = "threat-meta";
      meta.textContent = `${item.source} · ${item.reason}`;

      const detail = document.createElement("p");
      detail.className = "threat-detail";
      detail.textContent = item.detail || "";

      card.append(head, meta, detail);
      list.append(card);
    }
  }
})();
