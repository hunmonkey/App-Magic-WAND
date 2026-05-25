(function () {
  const api = window.magicWand && window.magicWand.windowControls;
  if (!api) return;

  window.addEventListener("DOMContentLoaded", () => {
    const titlebar = document.querySelector(".window-titlebar");
    if (titlebar) {
      titlebar.addEventListener("dblclick", (event) => {
        if (!event.target.closest(".window-controls")) {
          api.toggleMaximize();
        }
      });
    }

    document.querySelectorAll("[data-window-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.windowAction;
        if (action === "minimize") api.minimize();
        if (action === "maximize") api.toggleMaximize();
        if (action === "close") api.close();
      });
    });
  });
})();
