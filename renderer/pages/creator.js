(function () {
  const ui = window.MagicWand;
  const menu = document.querySelector("#creatorMenu");

  if (!menu || !ui) {
    return;
  }

  menu.addEventListener("click", () => {
    ui.switchPage("#creatorPage", menu);
  });
})();
