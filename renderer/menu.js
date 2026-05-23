// 사이드 메뉴 그룹 접기/펼치기.
// 각 .menu-group의 제목(.menu-heading 버튼)을 누르면 하위 목록을 접거나 편다.
(function () {
  const headings = document.querySelectorAll(".side-nav .menu-heading");
  headings.forEach((heading) => {
    const group = heading.closest(".menu-group");
    if (!group) return;
    heading.addEventListener("click", () => {
      const collapsed = group.classList.toggle("collapsed");
      heading.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });
  });
})();
