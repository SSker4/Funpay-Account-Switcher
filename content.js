const LOGIN_SELECTOR = 'input[name="login"]';
const PASSWORD_SELECTOR = 'input[name="password"]';
const TURNSTILE_SELECTOR = 'input[name="cf-turnstile-response"]';
const SUBMIT_SELECTOR = 'button[type="submit"]';
const PENDING_KEY = "pendingFunpayAccount";
const LOGIN_STATE_KEY = "funpayLoginState";
const LOGIN_ERROR_TEXT = "Неправильная пара логин-пароль.";

function setNativeValue(input, value) {
  const descriptor = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value");
  descriptor.set.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function getLoginForm() {
  const login = document.querySelector(LOGIN_SELECTOR);
  const password = document.querySelector(PASSWORD_SELECTOR);

  if (!login || !password) {
    return null;
  }

  const form = login.closest("form");
  const submit = form?.querySelector(SUBMIT_SELECTOR);

  if (!form || !submit) {
    return null;
  }

  return { login, password, submit, form };
}

function pageHasLoginError() {
  return document.body?.innerText?.includes(LOGIN_ERROR_TEXT);
}

function ensureOverlayStyles() {
  if (document.querySelector("#funpay-switcher-overlay-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "funpay-switcher-overlay-style";
  style.textContent = `
    #funpay-switcher-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: grid;
      place-items: center;
      background: #0d121e;
      opacity: 0;
      pointer-events: none;
      transition: opacity .28s ease;
      font-family: Arial, sans-serif;
    }

    #funpay-switcher-overlay.is-visible {
      opacity: 1;
      pointer-events: auto;
    }

    .funpay-switcher-card {
      width: min(360px, calc(100vw - 32px));
      padding: 24px;
      border: 1px solid rgba(255, 255, 255, .18);
      border-radius: 10px;
      background: #ffffff;
      color: #172033;
      text-align: center;
      box-shadow: 0 24px 80px rgba(0, 0, 0, .38);
      transform: translateY(16px) scale(.97);
      transition: transform .28s ease;
    }

    #funpay-switcher-overlay.is-visible .funpay-switcher-card {
      transform: translateY(0) scale(1);
    }

    .funpay-switcher-mark {
      width: 58px;
      height: 58px;
      margin: 0 auto 14px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: #18a058;
      color: #fff;
      font-size: 30px;
      font-weight: 700;
      box-shadow: 0 12px 34px rgba(24, 160, 88, .32);
    }

    .funpay-switcher-mark.is-error {
      background: #d74d57;
      box-shadow: 0 12px 34px rgba(215, 77, 87, .32);
    }

    .funpay-switcher-spinner {
      width: 58px;
      height: 58px;
      margin: 0 auto 14px;
      border-radius: 50%;
      border: 4px solid #dfe5ef;
      border-top-color: #18a058;
      animation: funpay-switcher-spin .8s linear infinite;
    }

    .funpay-switcher-title {
      margin: 0;
      font-size: 18px;
      line-height: 1.25;
      font-weight: 700;
    }

    .funpay-switcher-text {
      margin: 8px 0 0;
      color: #67728a;
      font-size: 13px;
      line-height: 1.45;
    }

    #funpay-switcher-overlay.is-success .funpay-switcher-card,
    #funpay-switcher-overlay.is-error .funpay-switcher-card {
      animation: funpay-switcher-pop .58s ease both;
    }

    @keyframes funpay-switcher-spin {
      to { transform: rotate(360deg); }
    }

    @keyframes funpay-switcher-pop {
      0% { transform: translateY(0) scale(1); }
      55% { transform: translateY(-3px) scale(1.04); }
      100% { transform: translateY(0) scale(1); }
    }
  `;
  document.documentElement.append(style);
}

function showOverlay(title, text, state = "loading") {
  ensureOverlayStyles();

  let overlay = document.querySelector("#funpay-switcher-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "funpay-switcher-overlay";
    overlay.innerHTML = `
      <div class="funpay-switcher-card">
        <div class="funpay-switcher-visual"></div>
        <h2 class="funpay-switcher-title"></h2>
        <p class="funpay-switcher-text"></p>
      </div>
    `;
    document.documentElement.append(overlay);
  }

  overlay.classList.toggle("is-success", state === "success");
  overlay.classList.toggle("is-error", state === "error");
  overlay.querySelector(".funpay-switcher-visual").innerHTML =
    state === "success"
      ? '<div class="funpay-switcher-mark">✓</div>'
      : state === "error"
        ? '<div class="funpay-switcher-mark is-error">!</div>'
        : '<div class="funpay-switcher-spinner"></div>';
  overlay.querySelector(".funpay-switcher-title").textContent = title;
  overlay.querySelector(".funpay-switcher-text").textContent = text;
  requestAnimationFrame(() => overlay.classList.add("is-visible"));
}

function hideOverlay(delay = 0) {
  const overlay = document.querySelector("#funpay-switcher-overlay");
  if (!overlay) {
    return;
  }

  window.setTimeout(() => {
    overlay.classList.remove("is-visible");
    window.setTimeout(() => overlay.remove(), 320);
  }, delay);
}

function hasTurnstileToken() {
  const token = document.querySelector(TURNSTILE_SELECTOR)?.value?.trim();
  return Boolean(token);
}

function waitForTurnstileToken(timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    if (hasTurnstileToken()) {
      resolve();
      return;
    }

    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      if (hasTurnstileToken()) {
        window.clearInterval(interval);
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        window.clearInterval(interval);
        reject(new Error("Captcha timeout"));
      }
    }, 600);
  });
}

function submitLogin(loginForm) {
  loginForm.submit.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    view: window
  }));

  if (!loginForm.form.matches(":invalid")) {
    if (typeof loginForm.form.requestSubmit === "function") {
      loginForm.form.requestSubmit(loginForm.submit);
    } else {
      loginForm.form.submit();
    }
  }
}

async function showSubmittedResultIfNeeded() {
  const data = await chrome.storage.local.get(LOGIN_STATE_KEY);
  const state = data[LOGIN_STATE_KEY];

  if (!state || state.phase !== "submitted") {
    return false;
  }

  if (location.pathname.startsWith("/account/login") && pageHasLoginError()) {
    showOverlay("Ошибка входа", "Неправильная пара логин-пароль. Проверь сохраненные данные аккаунта.", "error");
    await chrome.storage.local.remove(LOGIN_STATE_KEY);
    hideOverlay(3200);
    return true;
  }

  if (!location.pathname.startsWith("/account/login")) {
    showOverlay("Вход выполнен", "Аккаунт FunPay открыт. Окно сейчас исчезнет.", "success");
    await chrome.storage.local.remove(LOGIN_STATE_KEY);
    hideOverlay(1700);
    return true;
  }

  return false;
}

async function runLoginAutomation() {
  const data = await chrome.storage.local.get(PENDING_KEY);
  const account = data[PENDING_KEY];

  if (!account?.login || !account?.password) {
    return;
  }

  const loginForm = getLoginForm();
  if (!loginForm) {
    showOverlay("Форма не найдена", "Возможно, FunPay уже открыл активную сессию.", "success");
    await chrome.storage.local.remove(PENDING_KEY);
    hideOverlay(1800);
    return;
  }

  showOverlay("Заполняю вход", "Ввожу данные аккаунта и готовлю форму FunPay.");

  setNativeValue(loginForm.login, account.login);
  setNativeValue(loginForm.password, account.password);
  loginForm.login.blur();
  loginForm.password.blur();
  await chrome.storage.local.remove(PENDING_KEY);

  showOverlay("Ожидаю Cloudflare", "Пройди проверку Cloudflare. После появления токена расширение нажмет «Войти».");

  try {
    await waitForTurnstileToken();
    showOverlay("Проверка пройдена", "Вхожу в аккаунт FunPay...");
    await chrome.storage.local.set({
      [LOGIN_STATE_KEY]: {
        phase: "submitted",
        submittedAt: Date.now()
      }
    });
    window.setTimeout(() => submitLogin(loginForm), 450);
  } catch (error) {
    showOverlay("Не дождался Cloudflare", "Нажми «Войти» вручную или запусти вход снова.", "error");
    await chrome.storage.local.remove(LOGIN_STATE_KEY);
    hideOverlay(3200);
  }
}

(async () => {
  const handledResult = await showSubmittedResultIfNeeded();
  if (!handledResult && location.pathname.startsWith("/account/login")) {
    await runLoginAutomation();
  }
})().catch((error) => {
  console.error(error);
  showOverlay("Ошибка расширения", "Не удалось запустить быстрый вход.", "error");
  hideOverlay(2600);
});
