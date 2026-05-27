const LOGIN_URL = "https://funpay.com/account/login";
const STORAGE_KEY = "funpayAccounts";
const PENDING_KEY = "pendingFunpayAccount";
const THEME_KEY = "funpayTheme";
const DEFAULT_COLOR = "#18a058";

const accountList = document.querySelector("#accountList");
const emptyState = document.querySelector("#emptyState");
const statusEl = document.querySelector("#status");
const form = document.querySelector("#accountForm");
const labelInput = document.querySelector("#label");
const loginInput = document.querySelector("#login");
const passwordInput = document.querySelector("#password");
const openLoginButton = document.querySelector("#openLogin");
const themeToggle = document.querySelector("#themeToggle");
const searchInput = document.querySelector("#search");
const favoritesOnlyButton = document.querySelector("#favoritesOnly");
const colorButtons = [...document.querySelectorAll(".color-dot")];

let accounts = [];
let selectedColor = DEFAULT_COLOR;
let favoritesOnly = false;
const revealTimers = new Map();

function setStatus(text) {
  statusEl.textContent = text;
}

function normalizeAccount(account) {
  return {
    id: account.id || crypto.randomUUID(),
    label: (account.label || "").trim(),
    login: (account.login || "").trim(),
    password: account.password || "",
    favorite: Boolean(account.favorite),
    color: account.color || DEFAULT_COLOR
  };
}

async function loadTheme() {
  const data = await chrome.storage.local.get(THEME_KEY);
  const theme = data[THEME_KEY] === "dark" ? "dark" : "light";
  document.body.classList.toggle("theme-dark", theme === "dark");
  themeToggle.classList.toggle("is-active", theme === "dark");
}

async function toggleTheme() {
  const isDark = !document.body.classList.contains("theme-dark");
  document.body.classList.toggle("theme-dark", isDark);
  themeToggle.classList.toggle("is-active", isDark);
  await chrome.storage.local.set({ [THEME_KEY]: isDark ? "dark" : "light" });
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

function setSelectedColor(color) {
  selectedColor = color;
  for (const button of colorButtons) {
    button.classList.toggle("is-selected", button.dataset.color === color);
  }
}

function getVisibleAccounts() {
  const query = searchInput.value.trim().toLowerCase();

  return accounts
    .filter((account) => !favoritesOnly || account.favorite)
    .filter((account) => {
      if (!query) {
        return true;
      }

      return `${account.label} ${account.login}`.toLowerCase().includes(query);
    })
    .sort((a, b) => Number(b.favorite) - Number(a.favorite));
}

function revealLogin(loginElement, accountId) {
  loginElement.classList.remove("is-hidden");
  window.clearTimeout(revealTimers.get(accountId));

  const timer = window.setTimeout(() => {
    loginElement.classList.add("is-hidden");
    revealTimers.delete(accountId);
  }, 5000);

  revealTimers.set(accountId, timer);
}

function renderAccounts() {
  accountList.textContent = "";
  const visibleAccounts = getVisibleAccounts();
  emptyState.hidden = visibleAccounts.length > 0;
  emptyState.textContent = accounts.length ? "Ничего не найдено." : "Пока нет сохраненных аккаунтов.";

  for (const account of visibleAccounts) {
    const item = document.createElement("div");
    item.className = "account";

    const title = document.createElement("div");
    title.className = "account-name";

    const titleLine = document.createElement("div");
    titleLine.className = "account-title";

    const color = document.createElement("span");
    color.className = "account-color";
    color.style.backgroundColor = account.color;

    const label = document.createElement("span");
    label.className = "account-label";
    label.textContent = account.label || "Без названия";

    titleLine.append(color, label);

    const login = document.createElement("span");
    login.className = "account-login is-hidden";
    login.textContent = account.login;
    login.title = "Нажми, чтобы показать на 5 секунд";
    login.addEventListener("click", () => revealLogin(login, account.id));

    title.append(titleLine, login);

    const favoriteButton = document.createElement("button");
    favoriteButton.className = `star-button${account.favorite ? " is-active" : ""}`;
    favoriteButton.type = "button";
    favoriteButton.textContent = account.favorite ? "★" : "☆";
    favoriteButton.title = account.favorite ? "Убрать из избранного" : "Добавить в избранное";
    favoriteButton.addEventListener("click", async () => {
      account.favorite = !account.favorite;
      await saveAccounts();
      setStatus(account.favorite ? "Добавлено в избранное." : "Удалено из избранного.");
    });

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

    item.append(title, favoriteButton, useButton, deleteButton);
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
    password: passwordInput.value,
    color: selectedColor
  });

  if (!account.login || !account.password) {
    setStatus("Заполни логин и пароль.");
    return;
  }

  accounts = [...accounts.filter((saved) => saved.login !== account.login), account];
  await saveAccounts();

  form.reset();
  setSelectedColor(DEFAULT_COLOR);
  setStatus("Аккаунт сохранен.");
});

openLoginButton.addEventListener("click", async () => {
  await chrome.tabs.create({ url: LOGIN_URL, active: true });
  setStatus("Открыл страницу входа.");
});

themeToggle.addEventListener("click", toggleTheme);
searchInput.addEventListener("input", renderAccounts);
favoritesOnlyButton.addEventListener("click", () => {
  favoritesOnly = !favoritesOnly;
  favoritesOnlyButton.classList.toggle("is-active", favoritesOnly);
  favoritesOnlyButton.textContent = favoritesOnly ? "★" : "☆";
  renderAccounts();
});

for (const button of colorButtons) {
  button.addEventListener("click", () => setSelectedColor(button.dataset.color));
}

loadTheme().catch(console.error);
loadAccounts().catch((error) => {
  console.error(error);
  setStatus("Не удалось загрузить аккаунты.");
});
