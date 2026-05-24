// 사이드 메뉴 아코디언.
// 현재 쓰는 그룹만 열고, 나머지 그룹은 닫아 메뉴가 길게 늘어지지 않게 한다.
(function () {
  const nav = document.querySelector(".side-nav");
  if (!nav) return;

  const groups = [...nav.querySelectorAll(".menu-group")];

  function setOpen(group, open) {
    group.classList.toggle("collapsed", !open);
    group.querySelector(".menu-heading")?.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function keepAnchorPosition(anchor, action) {
    const before = anchor && anchor.offsetParent !== null ? anchor.getBoundingClientRect().top : null;
    action();
    if (before === null) return;
    const after = anchor.getBoundingClientRect().top;
    nav.scrollTop += after - before;
  }

  function openOnly(targetGroup, anchor) {
    keepAnchorPosition(anchor, () => {
      groups.forEach((group) => setOpen(group, group === targetGroup));
    });
  }

  function toggleGroup(targetGroup, anchor) {
    const shouldOpen = targetGroup.classList.contains("collapsed");
    keepAnchorPosition(anchor, () => {
      groups.forEach((group) => setOpen(group, group === targetGroup ? shouldOpen : false));
    });
  }

  function syncToActiveMenu() {
    const activeGroup = groups.find((group) => group.querySelector(".menu-link.active"));
    groups.forEach((group) => setOpen(group, group === activeGroup));
  }

  groups.forEach((group) => {
    const heading = group.querySelector(".menu-heading");
    heading?.addEventListener("click", () => toggleGroup(group, heading));

    group.querySelectorAll(".menu-link:not(.danger)").forEach((link) => {
      link.addEventListener("click", () => openOnly(group, link));
    });
  });

  syncToActiveMenu();

  window.MagicWandMenu = {
    activate(menuButton) {
      const group = menuButton?.closest?.(".menu-group");
      if (group) {
        openOnly(group, menuButton);
      }
    },
  };
})();
