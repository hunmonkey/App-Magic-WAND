(function () {
  const api = window.magicWand && window.magicWand.license;
  const root = document.querySelector("#lockContent");
  const subtitle = document.querySelector("#lockSubtitle");

  if (!api) {
    subtitle.textContent = "초기화 오류";
    root.textContent = "라이선스 기능을 불러오지 못했습니다. 프로그램을 다시 실행해 주세요.";
    return;
  }

  init();

  async function init() {
    render(await api.status());
  }

  function render(status) {
    root.innerHTML = "";
    switch (status.status) {
      case "ok-needs-login":
        renderLogin(status);
        break;
      case "no-license":
        renderInfo("정품키 없음", "정품키 파일(magicwand.lic)을 찾을 수 없습니다. 실행파일 옆 숨김 폴더 MagicWAND_Data 안에 넣은 뒤 다시 실행해 주세요.");
        break;
      case "invalid":
        renderInfo("정품키 오류", "정품키가 올바르지 않습니다. 발급한 정품키 파일이 맞는지 확인해 주세요.");
        break;
      case "expired":
        renderInfo("정품키 만료", `정품키가 만료되었습니다. 정품키를 갱신해 주세요.${expText(status.exp)}`);
        break;
      case "locked":
        renderLocked();
        break;
      case "no-public-key":
        renderInfo("설정 필요", "이 빌드에는 검증용 공개키가 들어 있지 않습니다. (개발자 설정이 필요합니다.)");
        break;
      default:
        renderInfo("알 수 없는 상태", "프로그램을 다시 실행해 주세요.");
    }
  }

  function renderLogin(status) {
    setSubtitle("사용하려면 계정과 암호를 입력해 주세요.");
    if (status.clockWarning) {
      root.append(banner("warn", "시스템 시계가 과거로 되돌려진 적이 있어요. 한 번 더 감지되면 프로그램이 잠깁니다."));
    }

    const accInput = el("input", { type: "text", id: "lockAccount", autocomplete: "off" });
    if (status.account) accInput.value = status.account;
    const pwInput = el("input", { type: "password", id: "lockPassword", autocomplete: "off" });

    const form = el("form");
    const msg = el("div", { class: "lock-message" });
    const loginBtn = el("button", { type: "submit", class: "lock-btn primary", text: "로그인" });

    form.append(field("계정", accInput), field("암호", pwInput), msg, el("div", { class: "lock-actions" }, loginBtn, quitButton()));

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      loginBtn.disabled = true;
      msg.textContent = "";
      const result = await api.login(accInput.value.trim(), pwInput.value);
      if (result.ok) return; // 로그인 성공 → 본 화면으로 창이 전환됨
      loginBtn.disabled = false;
      msg.textContent = loginError(result.reason);
      shake(document.querySelector(".lock-card"));
      pwInput.focus();
      pwInput.select();
    });

    root.append(form);
    (status.account ? pwInput : accInput).focus();
  }

  function renderLocked() {
    setSubtitle("프로그램이 잠겼습니다");
    const note = el("p", {
      class: "lock-note",
      text: "시스템 시계를 과거로 되돌린 것이 감지되어 프로그램이 잠겼습니다. 마스터 해제키 파일로만 풀 수 있습니다.",
    });
    const msg = el("div", { class: "lock-message" });
    const unlockBtn = el("button", { type: "button", class: "lock-btn primary", text: "마스터 해제키 불러오기" });

    unlockBtn.addEventListener("click", async () => {
      unlockBtn.disabled = true;
      msg.textContent = "";
      const result = await api.unlock();
      unlockBtn.disabled = false;
      if (result.ok) {
        render(await api.status());
      } else if (result.reason !== "canceled") {
        msg.textContent = "해제키가 올바르지 않습니다. 발급한 마스터 해제키가 맞는지 확인해 주세요.";
        shake(document.querySelector(".lock-card"));
      }
    });

    root.append(note, el("div", { class: "lock-actions" }, unlockBtn, quitButton()), msg);
  }

  function renderInfo(title, note) {
    setSubtitle(title);
    root.append(el("p", { class: "lock-note", text: note }), el("div", { class: "lock-actions" }, quitButton()));
  }

  // ── helpers
  function shake(node) {
    if (!node) return;
    node.classList.remove("mw-shake");
    void node.offsetWidth; // 리플로우로 애니메이션을 처음부터 다시 재생한다.
    node.classList.add("mw-shake");
  }

  function el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else node.setAttribute(key, value);
      }
    }
    for (const kid of kids) node.append(kid);
    return node;
  }

  function field(labelText, input) {
    const label = el("label", { text: labelText });
    if (input.id) label.setAttribute("for", input.id);
    return el("div", { class: "lock-field" }, label, input);
  }

  function banner(kind, text) {
    return el("div", { class: `lock-banner ${kind}`, text });
  }

  function quitButton() {
    const button = el("button", { type: "button", class: "lock-btn", text: "프로그램 종료" });
    button.addEventListener("click", () => api.quit());
    return button;
  }

  function setSubtitle(text) {
    subtitle.textContent = text;
  }

  function expText(exp) {
    if (!exp) return "";
    return ` (만료일: ${new Date(exp * 1000).toLocaleDateString()})`;
  }

  function loginError(reason) {
    if (reason === "bad-credentials") return "계정 또는 암호가 올바르지 않습니다.";
    if (reason === "expired") return "정품키가 만료되었습니다. 정품키를 갱신해 주세요.";
    if (reason === "invalid") return "정품키가 올바르지 않습니다.";
    return "로그인에 실패했습니다. 다시 시도해 주세요.";
  }
})();
