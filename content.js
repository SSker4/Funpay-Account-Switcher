const LOGIN_SELECTOR = 'input[name="login"]';
const PASSWORD_SELECTOR = 'input[name="password"]';
const TURNSTILE_SELECTOR = 'input[name="cf-turnstile-response"]';
const SUBMIT_SELECTOR = 'button[type="submit"]';
const PENDING_KEY = "pendingFunpayAccount";

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

  return {
    login,
    password,
    submit,
    form
  };
}

function createStatusBox() {
  const box = document.createElement("div");
  box.id = "funpay-account-switcher-status";
  box.style.cssText = [
    "position: fixed",
    "z-index: 2147483647",
    "right: 16px",
    "bottom: 16px",
    "max-width: 320px",
    "padding: 12px 14px",
    "border-radius: 8px",
    "background: #172033",
    "color: #fff",
    "font: 13px/1.35 Arial, sans-serif",
    "box-shadow: 0 10px 30px rgba(0,0,0,.25)"
  ].join(";");
  document.documentElement.append(box);
  return box;
}

function updateStatus(text) {
  let box = document.querySelector("#funpay-account-switcher-status");
  if (!box) {
    box = createStatusBox();
  }
  box.textContent = text;
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

async function run() {
  const data = await chrome.storage.local.get(PENDING_KEY);
  const account = data[PENDING_KEY];

  if (!account?.login || !account?.password) {
    return;
  }

  const loginForm = getLoginForm();
  if (!loginForm) {
    updateStatus("Форма входа не найдена. Возможно, FunPay уже открыл активную сессию.");
    return;
  }

  setNativeValue(loginForm.login, account.login);
  setNativeValue(loginForm.password, account.password);
  loginForm.login.blur();
  loginForm.password.blur();
  await chrome.storage.local.remove(PENDING_KEY);

  updateStatus("Данные введены. Пройди Cloudflare, после этого вход нажмется автоматически.");

  try {
    await waitForTurnstileToken();
    updateStatus("Cloudflare пройдена. Вхожу в аккаунт...");
    loginForm.submit.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window
    }));

    if (!loginForm.form.matches(":invalid")) {
      loginForm.form.requestSubmit(loginForm.submit);
    }
  } catch (error) {
    updateStatus("Не дождался Cloudflare за 3 минуты. Нажми «Войти» вручную или запусти вход снова.");
  }
}

run().catch((error) => {
  console.error(error);
  updateStatus("Расширение не смогло запустить быстрый вход.");
});
