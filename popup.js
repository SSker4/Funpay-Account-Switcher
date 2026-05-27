const LOGIN_URL = "https://funpay.com/account/login";
const STORAGE_KEY = "funpayAccounts";
const PENDING_KEY = "pendingFunpayAccount";

const accountList = document.querySelector("#accountList");
const emptyState = document.querySelector("#emptyState");
const statusEl = document.querySelector("#status");
const form = document.querySelector("#accountForm");
const labelInput = document.querySelector("#label");
const loginInput = document.querySelector("#login");
const passwordInput = document.querySelector("#password");
const openLoginButton = document.querySelector("#openLogin");

let accounts = [];

function setStatus(text) {
  statusEl.textContent = text;
}

function normalizeAccount(account) {
  return {
    id: account.id || crypto.randomUUID(),
    label: (account.label || "").trim(),
    login: (account.login || "").trim(),
    password: account.password || ""
  };
}

async function loadAccounts() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  accounts = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY].map(normalizeAccount) : [];
  renderAccounts();
}

async function saveAccounts() {
  await chrome.storage.local.set({ [STORAGE_KEY]: accounts });
  renderAccounts();
}

function renderAccounts() {
  accountList.textContent = "";
  emptyState.hidden = accounts.length > 0;

  for (const account of accounts) {
    const item = document.createElement("div");
    item.className = "account";

    const title = document.createElement("div");
    title.className = "account-name";
    title.textContent = account.label || account.login;

    const login = document.createElement("span");
    login.className = "account-login";
    login.textContent = account.login;
    title.append(login);

    const useButton = document.createElement("button");
    useButton.className = "secondary";
    useButton.type = "button";
    useButton.textContent = "Войти";
    useButton.addEventListener("click", () => startLogin(account));

    const deleteButton = document.createElement("button");
    deleteButton.className = "danger";
    deleteButton.type = "button";
    deleteButton.textContent = "×";
    deleteButton.title = "Удалить";
    deleteButton.addEventListener("click", async () => {
      accounts = accounts.filter((saved) => saved.id !== account.id);
      await saveAccounts();
      setStatus("Аккаунт удален.");
    });

    item.append(title, useButton, deleteButton);
    accountList.append(item);
  }
}

async function removeFunPayCookies() {
  const cookies = await chrome.cookies.getAll({ domain: "funpay.com" });

  await Promise.all(cookies.map((cookie) => {
    const protocol = cookie.secure ? "https:" : "http:";
    const host = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
    const url = `${protocol}//${host}${cookie.path}`;

    return chrome.cookies.remove({
      url,
      name: cookie.name,
      storeId: cookie.storeId
    });
  }));
}

async function getLoginTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (activeTab?.url?.startsWith("https://funpay.com/")) {
    return chrome.tabs.update(activeTab.id, { url: LOGIN_URL });
  }

  return chrome.tabs.create({ url: LOGIN_URL, active: true });
}

async function startLogin(account) {
  setStatus("Очищаю сессию FunPay и открываю вход...");
  await chrome.storage.local.set({ [PENDING_KEY]: account });
  await removeFunPayCookies();
  await getLoginTab();
  setStatus("Данные будут введены на странице входа.");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const account = normalizeAccount({
    label: labelInput.value,
    login: loginInput.value,
    password: passwordInput.value
  });

  if (!account.login || !account.password) {
    setStatus("Заполни логин и пароль.");
    return;
  }

  accounts = [...accounts.filter((saved) => saved.login !== account.login), account];
  await saveAccounts();

  form.reset();
  setStatus("Аккаунт сохранен.");
});

openLoginButton.addEventListener("click", async () => {
  await chrome.tabs.create({ url: LOGIN_URL, active: true });
  setStatus("Открыл страницу входа.");
});

loadAccounts().catch((error) => {
  console.error(error);
  setStatus("Не удалось загрузить аккаунты.");
});
