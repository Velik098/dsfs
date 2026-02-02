/* ---------- script.js (полный) ---------- */

/* ---------- Данные для фида (UI) ---------- */
const feedData = [
  {
    user: "Илья Новик",
    type: "Ищу разработчика",
    text: "Ищу frontend-разработчика для MVP стартапа. Есть дизайнер и идея.",
    tags: ["react", "startup", "frontend"],
    views: "28.3K",
    responses: 12
  },
  {
    user: "Анна Смирнова",
    type: "Предлагаю помощь",
    text: "Могу помочь с UX/UI для SaaS и digital-продуктов.",
    tags: ["ux", "ui", "design"],
    views: "14.1K",
    responses: 9
  }
];

const feed = document.getElementById("feed");

function renderFeed() {
  if (!feed) return;
  feed.innerHTML = "";
  feedData.forEach(item => {
    feed.innerHTML += `
      <div class="card">
        <div class="avatar"></div>
        <div class="content">
          <div class="header">
            <span class="name">${escapeHtml(item.user)}</span>
            <span class="type">· ${escapeHtml(item.type)}</span>
          </div>
          <p>${escapeHtml(item.text)}</p>
          <div class="tags">
            ${item.tags.map(t => `<span>#${escapeHtml(t)}</span>`).join("")}
          </div>
          <div class="actions">
            <span>🤝 ${item.responses}</span>
            <span>💬 Связаться</span>
            <span>👁 ${escapeHtml(item.views)}</span>
          </div>
        </div>
      </div>
    `;
  });
}

/* Простая защита от XSS */
function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- Тема ---------- */
const toggle = document.getElementById("themeToggle");
if (toggle) {
  toggle.addEventListener("click", () => {
    document.body.classList.toggle("light");
    toggle.textContent = document.body.classList.contains("light") ? "🌑" : "🌕";
  });
}

renderFeed();

/* ---------- Регистрация ---------- */
const overlay = document.getElementById("regOverlay");
const closeModal = document.getElementById("closeModal");
const regSubmit = document.getElementById("regSubmit");
const regEmail = document.getElementById("regEmail");
const regPassword = document.getElementById("regPassword");
const togglePwd = document.getElementById("togglePwd");
const successBanner = document.getElementById("successBanner");
const gsigninContainer = document.getElementById("gsignin");
const openLogin = document.getElementById("openLogin");

const BASE = window.location.origin;

/* Вспомогательные функции для авторизации (клиент) */
function isAuthenticated() {
  return !!localStorage.getItem("token");
}

function getToken() {
  return localStorage.getItem("token");
}

function parseJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(atob(base64).split('').map(c =>
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    ).join('')));
  } catch {
    return null;
  }
}

/* ---- Accounts storage (multiple accounts support) ---- */
function loadAccounts() {
  try {
    const raw = localStorage.getItem("uplio_accounts");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveAccounts(accounts) {
  try {
    localStorage.setItem("uplio_accounts", JSON.stringify(accounts || []));
  } catch (e) {
    console.warn("saveAccounts failed", e);
  }
}
function addOrUpdateAccount(user, token) {
  if (!user || !token) return;
  const accounts = loadAccounts();
  const userId = user.id || user.email || null;
  const idx = accounts.findIndex(a => (a.id && userId && a.id === userId) || (a.email && user.email && a.email.toLowerCase() === user.email.toLowerCase()));
  const name = user.name || user.email || "";
  const picture = user.picture || (user.profile && user.profile.picture) || null;
  if (idx >= 0) {
    accounts[idx].token = token;
    accounts[idx].name = name;
    accounts[idx].picture = picture;
  } else {
    accounts.push({ id: userId, email: user.email, name, token, picture });
  }
  saveAccounts(accounts);
  try { localStorage.setItem("token", token); } catch {}
}
function removeAccountById(id) {
  const accounts = loadAccounts().filter(a => a.id !== id);
  saveAccounts(accounts);
  const active = getToken();
  if (!accounts.find(a => a.token === active)) {
    localStorage.removeItem("token");
  }
}
function getActiveAccount() {
  const token = getToken();
  if (!token) return null;
  return loadAccounts().find(a => a.token === token) || null;
}
function switchToAccount(id) {
  const acc = loadAccounts().find(a => a.id === id);
  if (!acc) return false;
  localStorage.setItem("token", acc.token);
  return true;
}

/* Save token helper (used after register / google sign-in) */
function saveTokenIfPresent(obj) {
  if (obj && obj.token) {
    try {
      localStorage.setItem("token", obj.token);
    } catch (e) {
      console.warn("Не удалось сохранить токен:", e);
    }
    if (obj.user) addOrUpdateAccount(obj.user, obj.token);
  }
}

function authFetch(url, opts = {}) {
  const token = getToken();
  const headers = opts.headers || {};
  if (token) headers["Authorization"] = "Bearer " + token;
  return fetch(url, { ...opts, headers });
}

/* ---------- Dialogs ---------- */
const dialogsView = document.getElementById("dialogsView");
const dialogItems = document.getElementById("dialogItems");
const dialogsEmpty = document.getElementById("dialogsEmpty");
const chatTitle = document.getElementById("chatTitle");
const chatMessages = document.getElementById("chatMessages");
const chatEmptyState = document.getElementById("chatEmptyState");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const refreshDialogs = document.getElementById("refreshDialogs");

let dialogs = [];
let currentDialogId = null;

function getCurrentUserId() {
  const payload = parseJwt(getToken());
  return payload?.id || payload?.email || null;
}

function setChatEmptyState(text) {
  if (chatMessages && chatEmptyState && !chatMessages.contains(chatEmptyState)) {
    chatMessages.appendChild(chatEmptyState);
  }
  if (chatEmptyState) {
    chatEmptyState.textContent = text;
    chatEmptyState.style.display = "block";
  }
  if (chatMessages) chatMessages.classList.add("is-empty");
  if (chatInput) chatInput.disabled = true;
  if (chatForm) chatForm.classList.add("is-disabled");
}

function clearChatEmptyState() {
  if (chatEmptyState) chatEmptyState.style.display = "none";
  if (chatMessages) chatMessages.classList.remove("is-empty");
  if (chatInput) chatInput.disabled = false;
  if (chatForm) chatForm.classList.remove("is-disabled");
}

function clearChatMessages() {
  if (!chatMessages) return;
  Array.from(chatMessages.children).forEach(child => {
    if (child !== chatEmptyState) {
      child.remove();
    }
  });
}

function getDialogTitle(dialog, fallbackId) {
  return dialog?.title || dialog?.name || dialog?.participant || `Диалог ${fallbackId}`;
}

function renderDialogsList() {
  if (!dialogItems) return;
  dialogItems.innerHTML = "";
  if (!dialogs.length) {
    if (dialogsEmpty) dialogsEmpty.style.display = "block";
    return;
  }
  if (dialogsEmpty) dialogsEmpty.style.display = "none";
  dialogs.forEach(dialog => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dialog-item";
    const title = getDialogTitle(dialog, dialog.id);
    const lastText = dialog.last_message || dialog.lastMessage || dialog.preview || "";
    if (dialog.id === currentDialogId) {
      button.classList.add("active");
    }
    button.innerHTML = `
      <div class="dialog-title">${escapeHtml(title)}</div>
      <div class="dialog-preview">${escapeHtml(lastText || "Нет сообщений")}</div>
    `;
    button.addEventListener("click", () => {
      selectDialog(dialog.id, title);
    });
    dialogItems.appendChild(button);
  });
}

async function loadDialogs() {
  if (!dialogItems) return;
  dialogItems.innerHTML = '<div class="dialogs-loading">Загрузка...</div>';
  if (dialogsEmpty) dialogsEmpty.style.display = "none";
  try {
    const res = await authFetch("/dialogs");
    if (!res.ok) {
      throw new Error(`Dialogs load failed: ${res.status}`);
    }
    const data = await res.json();
    dialogs = Array.isArray(data) ? data : (data.dialogs || []);
    renderDialogsList();
  } catch (e) {
    console.error(e);
    dialogItems.innerHTML = '<div class="dialogs-loading">Не удалось загрузить диалоги.</div>';
  }
}

async function selectDialog(dialogId, title) {
  currentDialogId = dialogId;
  if (chatTitle) chatTitle.textContent = title || "Диалог";
  renderDialogsList();
  await loadMessages(dialogId);
}

function renderMessages(messages = []) {
  if (!chatMessages) return;
  clearChatMessages();
  if (!messages.length) {
    setChatEmptyState("Пока нет сообщений. Напишите первым!");
    return;
  }
  clearChatEmptyState();
  const currentUserId = getCurrentUserId();
  messages.forEach(msg => {
    const item = document.createElement("div");
    const fromUser = msg.from_user || msg.from || msg.user_id || msg.userId || msg.sender_id;
    const isMine = currentUserId && fromUser && fromUser === currentUserId;
    item.className = `chat-message ${isMine ? "me" : ""}`.trim();
    const time = msg.created_at || msg.createdAt || "";
    item.innerHTML = `
      <div class="message-bubble">${escapeHtml(msg.text || "")}</div>
      ${time ? `<div class="message-time">${escapeHtml(new Date(time).toLocaleString())}</div>` : ""}
    `;
    chatMessages.appendChild(item);
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function loadMessages(dialogId) {
  if (!dialogId) {
    setChatEmptyState("Выберите диалог слева.");
    return;
  }
  if (chatMessages) {
    clearChatMessages();
    const loading = document.createElement("div");
    loading.className = "dialogs-loading";
    loading.textContent = "Загрузка сообщений...";
    chatMessages.appendChild(loading);
  }
  try {
    const res = await authFetch(`/dialogs/${dialogId}/messages`);
    if (!res.ok) {
      throw new Error(`Messages load failed: ${res.status}`);
    }
    const data = await res.json();
    const messages = Array.isArray(data) ? data : (data.messages || []);
    renderMessages(messages);
  } catch (e) {
    console.error(e);
    if (chatMessages) {
      clearChatMessages();
      const error = document.createElement("div");
      error.className = "dialogs-loading";
      error.textContent = "Не удалось загрузить сообщения.";
      chatMessages.appendChild(error);
    }
    setChatEmptyState("Не удалось загрузить сообщения.");
  }
}

async function sendMessage(text) {
  if (!currentDialogId) {
    setChatEmptyState("Сначала выберите диалог.");
    return;
  }
  const payload = { text };
  try {
    const res = await authFetch(`/dialogs/${currentDialogId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error(`Message send failed: ${res.status}`);
    }
    const data = await res.json();
    const newMessage = data?.message || data || { text, created_at: new Date().toISOString(), from_user: getCurrentUserId() };
    appendLocalMessage(newMessage);
    updateDialogPreview(text);
  } catch (e) {
    console.error(e);
    alert("Не удалось отправить сообщение.");
  }
}

function appendLocalMessage(message) {
  if (!chatMessages) return;
  if (chatMessages.classList.contains("is-empty")) {
    renderMessages([message]);
    return;
  }
  const currentUserId = getCurrentUserId();
  const item = document.createElement("div");
  const fromUser = message.from_user || message.from || message.user_id || message.userId || message.sender_id;
  const isMine = currentUserId && fromUser && fromUser === currentUserId;
  item.className = `chat-message ${isMine ? "me" : ""}`.trim();
  const time = message.created_at || message.createdAt || "";
  item.innerHTML = `
    <div class="message-bubble">${escapeHtml(message.text || "")}</div>
    ${time ? `<div class="message-time">${escapeHtml(new Date(time).toLocaleString())}</div>` : ""}
  `;
  clearChatEmptyState();
  chatMessages.appendChild(item);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateDialogPreview(text) {
  const dialog = dialogs.find(item => item.id === currentDialogId);
  if (dialog) {
    dialog.last_message = text;
  }
  renderDialogsList();
}

if (chatForm) {
  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = chatInput?.value?.trim();
    if (!text) return;
    if (chatInput) chatInput.value = "";
    sendMessage(text);
  });
}

if (refreshDialogs) {
  refreshDialogs.addEventListener("click", () => {
    loadDialogs();
  });
}

/* --- Profile state --- */
let currentUser = null;
let profile = null;
let pendingAvatarDataUrl = null;
let pendingCoverDataUrl = null;

/* Countries list */
const COUNTRIES = [
  "Россия, RU",
  "Литва, LT",
  "Латвия, LV",
  "Эстония, EE",
  "Украина, UA",
  "Беларусь, BY",
  "Польша, PL",
  "Германия, DE",
  "Франция, FR",
  "Великобритания, GB",
  "США, US",
  "Канада, CA",
  "Казахстан, KZ",
  "Узбекистан, UZ",
  "Другие"
];

/* Ensure profileView exists */
let profileView = document.getElementById("profileView");
if (!profileView) {
  const center = document.querySelector(".center");
  profileView = document.createElement("div");
  profileView.id = "profileView";
  profileView.style.padding = "16px";
  profileView.style.display = "none";
  const tabs = center ? center.querySelector(".tabs") : null;
  if (tabs && tabs.parentNode) tabs.parentNode.insertBefore(profileView, tabs.nextSibling);
  else if (center) center.appendChild(profileView);
}

/* default avatar SVG */
function defaultAvatarSVG(size = 48) {
  const s = size;
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 12c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3z" fill="white"/>
    <path d="M4 20c0-2.667 3.333-4 8-4s8 1.333 8 4v1H4v-1z" fill="white"/>
  </svg>`;
}

/* Create avatar element with fallback */
function createAvatarElement(pictureUrl, size = 84) {
  const wrapper = document.createElement("div");
  wrapper.style.width = `${size}px`;
  wrapper.style.height = `${size}px`;
  wrapper.style.borderRadius = "50%";
  wrapper.style.overflow = "hidden";
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.justifyContent = "center";
  wrapper.style.background = "var(--panel)";
  wrapper.style.flexShrink = "0";
  wrapper.style.border = "4px solid var(--panel)";
  wrapper.style.boxSizing = "border-box";

  function appendFallback() {
    wrapper.innerHTML = "";
    const fallback = document.createElement("div");
    fallback.style.width = "100%";
    fallback.style.height = "100%";
    fallback.style.display = "flex";
    fallback.style.alignItems = "center";
    fallback.style.justifyContent = "center";
    fallback.style.background = "#2b2f36";
    fallback.style.color = "#fff";
    fallback.style.padding = "6px";
    fallback.innerHTML = defaultAvatarSVG(Math.min(48, size - 20));
    wrapper.appendChild(fallback);
  }

  if (!pictureUrl) {
    appendFallback();
    return wrapper;
  }

  try {
    const img = document.createElement("img");
    img.alt = "avatar";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.style.display = "block";
    img.src = pictureUrl;
    img.addEventListener("error", () => {
      try { if (img.parentNode) img.parentNode.removeChild(img); } catch {}
      appendFallback();
    }, { once: true });
    wrapper.appendChild(img);
  } catch (e) {
    appendFallback();
  }

  return wrapper;
}

/* Create cover element */
function createCoverElement(coverUrl) {
  const el = document.createElement("div");
  el.className = "profile-cover";
  if (coverUrl) {
    el.style.backgroundImage = `url("${coverUrl.replace(/"/g, '%22')}")`;
  } else {
    el.style.background = "linear-gradient(90deg, rgba(29,155,240,0.15), rgba(29,155,240,0.05))";
  }
  return el;
}

/* Load profile */
async function loadCurrentProfile() {
  if (!isAuthenticated()) {
    currentUser = null;
    profile = null;
    return null;
  }
  const token = getToken();
  currentUser = parseJwt(token);
  try {
    const res = await authFetch(`${BASE}/profile`);
    const data = await res.json().catch(() => null);
    if (res.ok && data && data.ok && data.profile) {
      profile = data.profile;
      const activeAcc = getActiveAccount();
      if (activeAcc && !profile.picture && activeAcc.picture) profile.picture = activeAcc.picture;
      if (activeAcc && !profile.cover && activeAcc.cover) profile.cover = activeAcc.cover;
      return profile;
    } else if (res.ok && data && data.profile) {
      profile = data.profile;
      const activeAcc = getActiveAccount();
      if (activeAcc && !profile.picture && activeAcc.picture) profile.picture = activeAcc.picture;
      if (activeAcc && !profile.cover && activeAcc.cover) profile.cover = activeAcc.cover;
      return profile;
    } else {
      profile = {
        id: currentUser?.id || null,
        email: currentUser?.email || "",
        name: currentUser?.email || "",
        location: "",
        roles: [],
        about: "",
        offers: [],
        needs: [],
        projects: [],
        stats: { collaborations: 0, skillsConfirmed: 0, projects: 0 },
        picture: currentUser && currentUser.picture ? currentUser.picture : "",
        cover: currentUser && currentUser.cover ? currentUser.cover : ""
      };
      return profile;
    }
  } catch (e) {
    console.error("loadCurrentProfile error:", e);
    return null;
  }
}

/* Guard attach */
function attachMenuAuthGuards() {
  const items = document.querySelectorAll(".menu-item");
  items.forEach(btn => {
    if (btn._authGuardAttached) return;
    btn._authGuardAttached = true;

    btn.addEventListener("click", (e) => {
      const label = btn.querySelector(".label")?.textContent?.trim();
      if (label && label !== "Лента") {
        const token = getToken();
        if (!token) {
          alert("Сначала авторизуйтесь!");
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
      }
    });
  });
}

/* NAV */
function setActiveMenu(labelText) {
  document.querySelectorAll(".menu-item").forEach(btn => {
    const label = btn.querySelector(".label")?.textContent?.trim();
    if (label === labelText) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

function showFeedView() {
  if (profileView) profileView.style.display = "none";
  if (dialogsView) dialogsView.style.display = "none";
  if (feed) feed.style.display = "block";
  const composer = document.querySelector(".composer");
  const tabsEl = document.querySelector(".tabs");
  if (composer) composer.style.display = "block";
  if (tabsEl) tabsEl.style.display = "flex";
  setActiveMenu("Лента");
  renderFeed();
}

async function showProfileView() {
  await loadCurrentProfile();
  const composer = document.querySelector(".composer");
  const tabsEl = document.querySelector(".tabs");
  if (composer) composer.style.display = "none";
  if (tabsEl) tabsEl.style.display = "none";
  if (feed) feed.style.display = "none";
  if (dialogsView) dialogsView.style.display = "none";
  if (profileView) profileView.style.display = "block";
  setActiveMenu("Профиль");
  if (profile) {
    renderProfile(profile);
  } else {
    profileView.innerHTML = '<div class="section-card"><p style="color:var(--muted)">Профиль не найден.</p></div>';
  }
}

function showDialogsView() {
  const composer = document.querySelector(".composer");
  const tabsEl = document.querySelector(".tabs");
  if (composer) composer.style.display = "none";
  if (tabsEl) tabsEl.style.display = "none";
  if (feed) feed.style.display = "none";
  if (profileView) profileView.style.display = "none";
  if (dialogsView) dialogsView.style.display = "grid";
  setActiveMenu("Мессенджер");
  if (!currentDialogId) {
    setChatEmptyState("Выберите диалог слева.");
  }
  loadDialogs();
}

/* Navigation handlers */
document.querySelectorAll(".menu-item").forEach(btn => {
  btn.addEventListener("click", (e) => {
    const label = btn.querySelector(".label")?.textContent?.trim();
    if (!label) return;
    if (label === "Лента") {
      showFeedView();
    } else if (label === "Профиль") {
      showProfileView();
    } else if (label === "Проекты") {
      showProfileView().then(() => {
        setTimeout(() => {
          const proj = document.querySelector("#profile-projects");
          if (proj) proj.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
      });
      setActiveMenu("Проекты");
    } else {
      if (label === "Мессенджер") {
        showDialogsView();
        return;
      }
      setActiveMenu(label);
    }
  });
});

/* On load */
window.addEventListener("load", async () => {
  if (isAuthenticated()) {
    if (overlay) overlay.style.display = "none";
    currentUser = parseJwt(getToken());
    await loadCurrentProfile();
  } else {
    if (overlay) overlay.style.display = "flex";
  }
  if (!isAuthenticated()) initGoogleButton();
  attachMenuAuthGuards();
  showFeedView();

  const logoBtn = document.getElementById("logoBtn");
  if (logoBtn) {
    logoBtn.addEventListener("click", (e) => {
      e.preventDefault();
      showFeedView();
    });
  }
});

/* Modal controls */
if (closeModal) closeModal.addEventListener("click", () => {
  if (overlay) overlay.style.display = "none";
});
if (togglePwd) {
  togglePwd.addEventListener("click", () => {
    if (!regPassword) return;
    const t = regPassword.type === "password" ? "text" : "password";
    regPassword.type = t;
    togglePwd.textContent = t === "password" ? "👁" : "🙈";
  });
}
function validateEmail(email) { return /\S+@\S+\.\S+/.test(email); }
function showBanner() { if (successBanner) successBanner.style.display = "flex"; }

/* Registration */
if (regSubmit) {
  regSubmit.addEventListener("click", async () => {
    const email = regEmail?.value?.trim();
    const password = regPassword?.value?.trim();

    if (!email || !validateEmail(email)) {
      alert("Введите корректный email.");
      return;
    }
    if (!password || password.length < 8) {
      alert("Пароль должен быть минимум 8 символов.");
      return;
    }

    try {
      const res = await fetch(`${BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(data?.error || `Server error ${res.status}`);
        return;
      }

      if (data?.ok) {
        saveTokenIfPresent(data);
        if (data.user && data.token) addOrUpdateAccount(data.user, data.token);
        await loadCurrentProfile();
        attachMenuAuthGuards();
        showBanner();
        setTimeout(() => {
          if (overlay) overlay.style.display = "none";
        }, 900);
      } else {
        alert(data?.error || "Ошибка регистрации.");
      }
    } catch (err) {
      alert("Ошибка сети при регистрации. Сервер: " + BASE);
    }
  });
}

if (openLogin) {
  openLogin.addEventListener("click", (e) => {
    e.preventDefault();
    alert("Окно входа (заглушка).");
    overlay && (overlay.style.display = "none");
  });
}

/* Google Sign-In */
function onGoogleSignIn(credential) {
  const payload = parseJwt(credential);
  if (!payload?.email) {
    alert("Не удалось получить данные Google.");
    return;
  }

  fetch(`${BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential })
  })
  .then(r => r.json().then(d => ({ ok: r.ok, d })))
  .then(async ({ ok, d }) => {
    if (!ok) return alert(d?.error || "Ошибка Google-регистрации");
    saveTokenIfPresent(d);
    if (d.user && d.token) addOrUpdateAccount(d.user, d.token);
    await loadCurrentProfile();
    attachMenuAuthGuards();
    showBanner();
    setTimeout(() => {
      overlay && (overlay.style.display = "none");
    }, 800);
  })
  .catch(() => alert("Ошибка сети Google-регистрации"));
}

/* Init Google button */
const GOOGLE_CLIENT_ID = "461290215517-4gs4261leq7jmcqst5nlr3am0eio5e0e.apps.googleusercontent.com";
function initGoogleButton() {
  if (!gsigninContainer) return;
  if (!window.google?.accounts?.id) {
    setTimeout(initGoogleButton, 500);
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: res => res?.credential ? onGoogleSignIn(res.credential) : alert("Google не вернул credential")
  });
  google.accounts.id.renderButton(gsigninContainer, { theme: "outline", size: "large", text: "signin_with" });
}

/* ---------- PROFILE RENDER & EDIT ---------- */

function renderProfile(p) {
  if (!profileView) return;
  const isOwner = currentUser && p && currentUser.id === p.id;

  // hero (cover) + header
  const headerHTML = `
    <div class="profile-hero">
      <!-- cover will be inserted here -->
      <div id="profile-cover-placeholder"></div>

      <div class="profile-header">
        <div class="profile-left">
          <div id="profile-avatar-placeholder" class="profile-avatar"></div>
          <div class="profile-meta">
            <div>
              <div class="profile-name">${escapeHtml(p.name || "")}</div>
              <div class="profile-sub">🌍 ${escapeHtml(p.location || "")}</div>
            </div>
            <div class="profile-badges">
              ${(p.roles || []).map(r => `<div class="role-badge">${escapeHtml(r)}</div>`).join("")}
            </div>
          </div>
        </div>

        <div class="profile-actions">
          <div>
            <button class="btn-outline" id="contactBtn">Связаться</button>
            <button class="btn-primary-mini" id="collabBtn">Предложить сотрудничество</button>
          </div>
          ${isOwner ? '<button class="btn-outline" id="editProfileBtn">Редактировать профиль</button>' : ''}
          <div style="position:relative">
            <button id="accountMenuBtn" aria-label="аккаунт-меню" style="background:transparent;border:none;color:var(--muted);font-size:20px;cursor:pointer;padding:8px;border-radius:8px">⋯</button>
            <div id="accountMenu" style="display:none;position:absolute;right:0;top:36px;background:var(--panel);border:1px solid var(--border);border-radius:10px;min-width:220px;padding:8px;box-shadow:0 8px 24px rgba(0,0,0,0.6);z-index:999"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const aboutHTML = `
    <div class="section-card" id="profile-about">
      <h3>О себе</h3>
      <p style="color:var(--muted); margin:0;">${escapeHtml(p.about || "")}</p>
    </div>
  `;

  const offersHTML = `
    <div class="section-card" id="profile-offers">
      <h3>Я могу помочь</h3>
      <div class="skills-grid">
        ${(p.offers || []).map(o => `
          <div class="skill-card">
            <div class="skill-title">${escapeHtml(o.title)}</div>
            <div class="skill-desc">${escapeHtml(o.desc)}</div>
            <div class="skill-tags">${(o.tags || []).map(t => `<span>#${escapeHtml(t)}</span>`).join(" ")}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  const needsHTML = `
    <div class="section-card" id="profile-needs">
      <h3>Я ищу</h3>
      <div class="needs-grid">
        ${(p.needs || []).map(n => `
          <div class="need-card">
            <div class="skill-title">${escapeHtml(n.title)}</div>
            <div class="need-type">${escapeHtml(n.type || "")}</div>
            <div class="skill-tags">${(n.tags || []).map(t => `<span>#${escapeHtml(t)}</span>`).join(" ")}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  const projectsHTML = `
    <div class="section-card" id="profile-projects">
      <h3>Проекты</h3>
      <div class="projects-list">
        ${(p.projects || []).map(pr => `
          <div class="project-item">
            <div class="project-left">
              <div style="width:48px;height:48px;border-radius:8px;background:var(--panel);"></div>
              <div>
                <div style="font-weight:600">${escapeHtml(pr.name)}</div>
                <div style="color:var(--muted);font-size:13px">${escapeHtml(pr.desc)}</div>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
              <div class="project-stage">${escapeHtml(pr.stage || "")}</div>
              <div style="color:var(--muted);font-size:13px">${escapeHtml(pr.looking || "")}</div>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  const statsHTML = `
    <div class="section-card" id="profile-stats">
      <h3>Репутация</h3>
      <div class="stats-grid">
        <div class="stat-card"><div class="num">${(p.stats && p.stats.collaborations) || 0}</div><div class="label">Сотрудничеств</div></div>
        <div class="stat-card"><div class="num">${(p.stats && p.stats.skillsConfirmed) || 0}</div><div class="label">Подтверждённых навыков</div></div>
        <div class="stat-card"><div class="num">${(p.stats && p.stats.projects) || 0}</div><div class="label">Проектов</div></div>
      </div>
    </div>
  `;

  profileView.innerHTML = headerHTML + aboutHTML + offersHTML + needsHTML + projectsHTML + statsHTML;

  // insert cover and avatar
  const coverPlaceholder = document.getElementById("profile-cover-placeholder");
  if (coverPlaceholder) {
    const coverEl = createCoverElement(p.cover || "");
    coverPlaceholder.appendChild(coverEl);
  }
  const avatarPlaceholder = document.getElementById("profile-avatar-placeholder");
  if (avatarPlaceholder) {
    const avatarEl = createAvatarElement(p.picture || "", 96);
    avatarPlaceholder.innerHTML = "";
    avatarPlaceholder.appendChild(avatarEl);
  }

  const contactBtn = document.getElementById("contactBtn");
  const collabBtn = document.getElementById("collabBtn");
  const editBtn = document.getElementById("editProfileBtn");
  if (contactBtn) contactBtn.addEventListener("click", () => alert("Открываем форму сообщения (заглушка)."));
  if (collabBtn) collabBtn.addEventListener("click", () => alert("Открываем форму предложения сотрудничества (заглушка)."));
  if (editBtn) editBtn.addEventListener("click", () => renderProfileEdit(p));

  // account menu
  const accountMenuBtn = document.getElementById("accountMenuBtn");
  const accountMenu = document.getElementById("accountMenu");
  if (accountMenuBtn && accountMenu) {
    accountMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleAccountMenu();
    });
    renderAccountMenu();
  }
  document.addEventListener("click", (ev) => {
    const menu = document.getElementById("accountMenu");
    if (menu && menu.style.display === "block") {
      const btn = document.getElementById("accountMenuBtn");
      if (!menu.contains(ev.target) && btn && !btn.contains(ev.target)) {
        menu.style.display = "none";
      }
    }
  });
}

/* Account menu functions (kept same) */
function toggleAccountMenu() {
  const menu = document.getElementById("accountMenu");
  if (!menu) return;
  menu.style.display = menu.style.display === "block" ? "none" : "block";
  if (menu.style.display === "block") renderAccountMenu();
}

function renderAccountMenu() {
  const menu = document.getElementById("accountMenu");
  if (!menu) return;
  const accounts = loadAccounts();
  const active = getActiveAccount();
  menu.innerHTML = "";

  if (accounts.length === 0) {
    const noEl = document.createElement("div");
    noEl.style.color = "var(--muted)";
    noEl.style.padding = "8px 6px";
    noEl.textContent = "Нет сохранённых аккаунтов";
    menu.appendChild(noEl);
  } else {
    const listWrap = document.createElement("div");
    listWrap.style.maxHeight = "220px";
    listWrap.style.overflow = "auto";
    listWrap.style.display = "flex";
    listWrap.style.flexDirection = "column";
    listWrap.style.gap = "6px";
    listWrap.style.marginBottom = "8px";

    accounts.forEach(acc => {
      const isActive = active && (active.id === acc.id || active.email === acc.email);
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.padding = "6px";
      row.style.borderRadius = "8px";
      if (isActive) row.style.background = "rgba(255,255,255,0.02)";

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.gap = "8px";
      left.style.alignItems = "center";
      left.style.minWidth = "0";

      const avatarWrap = document.createElement("div");
      avatarWrap.style.width = "36px";
      avatarWrap.style.height = "36px";
      avatarWrap.style.borderRadius = "8px";
      avatarWrap.style.overflow = "hidden";
      avatarWrap.style.background = "#2b2f36";
      avatarWrap.style.display = "flex";
      avatarWrap.style.alignItems = "center";
      avatarWrap.style.justifyContent = "center";
      avatarWrap.style.flexShrink = "0";

      if (acc.picture) {
        const img = document.createElement("img");
        img.src = acc.picture;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.style.display = "block";
        img.addEventListener("error", () => {
          avatarWrap.innerHTML = defaultAvatarSVG(18);
        }, { once: true });
        avatarWrap.appendChild(img);
      } else {
        avatarWrap.innerHTML = defaultAvatarSVG(18);
      }

      const textWrap = document.createElement("div");
      textWrap.style.display = "flex";
      textWrap.style.flexDirection = "column";
      textWrap.style.minWidth = "0";
      textWrap.style.overflow = "hidden";

      const nameEl = document.createElement("div");
      nameEl.style.fontSize = "14px";
      nameEl.style.whiteSpace = "nowrap";
      nameEl.style.overflow = "hidden";
      nameEl.style.textOverflow = "ellipsis";
      nameEl.textContent = acc.name || acc.email;

      const emailEl = document.createElement("div");
      emailEl.style.color = "var(--muted)";
      emailEl.style.fontSize = "12px";
      emailEl.style.whiteSpace = "nowrap";
      emailEl.style.overflow = "hidden";
      emailEl.style.textOverflow = "ellipsis";
      emailEl.textContent = acc.email;

      textWrap.appendChild(nameEl);
      textWrap.appendChild(emailEl);

      left.appendChild(avatarWrap);
      left.appendChild(textWrap);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "6px";
      right.style.alignItems = "center";

      const switchBtn = document.createElement("button");
      switchBtn.className = "btn-outline switch-account";
      switchBtn.style.padding = "6px 8px";
      switchBtn.style.fontSize = "13px";
      switchBtn.textContent = isActive ? "Активен" : "Переключить";
      switchBtn.dataset.id = acc.id || acc.email;

      const removeBtn = document.createElement("button");
      removeBtn.className = "btn-outline remove-account";
      removeBtn.style.padding = "6px 8px";
      removeBtn.style.fontSize = "12px";
      removeBtn.textContent = "Удалить";
      removeBtn.dataset.id = acc.id || acc.email;

      right.appendChild(switchBtn);
      right.appendChild(removeBtn);

      row.appendChild(left);
      row.appendChild(right);
      listWrap.appendChild(row);

      switchBtn.addEventListener("click", () => {
        const id = switchBtn.dataset.id;
        if (switchToAccount(id)) {
          currentUser = parseJwt(getToken());
          loadCurrentProfile().then(() => {
            renderProfile(profile);
            toggleAccountMenu();
            alert("Переключено на аккаунт");
          });
        } else alert("Не удалось переключиться (аккаунт не найден).");
      });
      removeBtn.addEventListener("click", () => {
        const id = removeBtn.dataset.id;
        if (!confirm("Удалить аккаунт из списка?")) return;
        removeAccountById(id);
        if (!getToken()) {
          alert("Аккаунт удалён и вы вышли. Войдите снова или добавьте аккаунт.");
          if (overlay) overlay.style.display = "flex";
        }
        renderAccountMenu();
      });
    });

    menu.appendChild(listWrap);
  }

  const actionsWrap = document.createElement("div");
  actionsWrap.style.display = "flex";
  actionsWrap.style.flexDirection = "column";
  actionsWrap.style.gap = "6px";

  const addBtn = document.createElement("button");
  addBtn.id = "account_add_btn";
  addBtn.className = "btn-primary-mini";
  addBtn.style.width = "100%";
  addBtn.textContent = "Добавить аккаунт";
  addBtn.addEventListener("click", () => {
    if (overlay) overlay.style.display = "flex";
    toggleAccountMenu();
  });

  const logoutBtn = document.createElement("button");
  logoutBtn.id = "account_logout_btn";
  logoutBtn.className = "btn-outline";
  logoutBtn.style.width = "100%";
  logoutBtn.textContent = "Выйти из аккаунта";
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("token");
    toggleAccountMenu();
    alert("Вы вышли из аккаунта.");
    if (overlay) overlay.style.display = "flex";
    currentUser = null;
    profile = null;
    attachMenuAuthGuards();
    showFeedView();
  });

  actionsWrap.appendChild(addBtn);
  actionsWrap.appendChild(logoutBtn);
  menu.appendChild(actionsWrap);
}

/* ---------- EDIT FORM ---------- */

function renderProfileEdit(p) {
  if (!profileView) return;

  pendingAvatarDataUrl = null;
  pendingCoverDataUrl = null;

  const html = `
    <div class="section-card">
      <h3>Редактирование профиля</h3>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <label>Обложка (cover)</label>
        <div id="edit_cover_preview" style="width:100%;height:120px;border-radius:8px;overflow:hidden;background:var(--panel);display:flex;align-items:center;justify-content:center"></div>
        <input type="file" id="edit_cover_input" accept="image/*" />
        <label>Аватар</label>
        <div id="edit_avatar_preview" style="display:flex;align-items:center;gap:12px"></div>
        <input type="file" id="edit_avatar_input" accept="image/*" />
        <label>Имя</label>
        <input id="edit_name" class="field-input" value="${escapeHtml(p.name || "")}" />
        <label>Страна и язык</label>
        <select id="edit_location" class="field-input"></select>
        <label>О себе</label>
        <textarea id="edit_about" class="field-input" style="min-height:80px;">${escapeHtml(p.about || "")}</textarea>
        <label>Роли (через запятую)</label>
        <input id="edit_roles" class="field-input" value="${escapeHtml((p.roles || []).join(", "))}" />
        <div id="editor_offers_container"></div>
        <div id="editor_needs_container"></div>
        <div id="editor_projects_container"></div>
        <label>Репутация (числа)</label>
        <div style="display:flex;gap:8px;">
          <input id="edit_stat_collab" class="field-input" style="width:33%" placeholder="Сотрудничеств" value="${(p.stats && p.stats.collaborations) || 0}" />
          <input id="edit_stat_skills" class="field-input" style="width:33%" placeholder="Подтв. навыков" value="${(p.stats && p.stats.skillsConfirmed) || 0}" />
          <input id="edit_stat_projects" class="field-input" style="width:33%" placeholder="Проектов" value="${(p.stats && p.stats.projects) || 0}" />
        </div>
        <div style="display:flex;gap:10px;margin-top:8px;">
          <button id="saveProfileBtn" class="btn-primary-mini">Сохранить</button>
          <button id="cancelEditBtn" class="btn-outline">Отмена</button>
        </div>
      </div>
    </div>
  `;
  profileView.innerHTML = html;

  const sel = document.getElementById("edit_location");
  COUNTRIES.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
  if (p.location) sel.value = p.location;
  else sel.value = "";

  // cover preview initial
  const coverPreview = document.getElementById("edit_cover_preview");
  coverPreview.innerHTML = "";
  const coverEl = createCoverElement(p.cover || "");
  coverEl.style.width = "100%";
  coverEl.style.height = "100%";
  coverPreview.appendChild(coverEl);

  const coverInput = document.getElementById("edit_cover_input");
  coverInput.addEventListener("change", (ev) => {
    const f = coverInput.files && coverInput.files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      alert("Выберите изображение.");
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      pendingCoverDataUrl = e.target.result;
      coverPreview.innerHTML = "";
      const el = createCoverElement(pendingCoverDataUrl);
      el.style.width = "100%";
      el.style.height = "100%";
      coverPreview.appendChild(el);
    };
    reader.readAsDataURL(f);
  });

  // avatar preview initial
  const preview = document.getElementById("edit_avatar_preview");
  preview.innerHTML = "";
  const initialAvatarEl = createAvatarElement(p.picture || "", 64);
  preview.appendChild(initialAvatarEl);

  const avatarInput = document.getElementById("edit_avatar_input");
  avatarInput.addEventListener("change", (ev) => {
    const f = avatarInput.files && avatarInput.files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      alert("Выберите изображение.");
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      pendingAvatarDataUrl = e.target.result;
      preview.innerHTML = "";
      const el = createAvatarElement(pendingAvatarDataUrl, 64);
      preview.appendChild(el);
    };
    reader.readAsDataURL(f);
  });

  buildOffersEditor(p.offers || []);
  buildNeedsEditor(p.needs || []);
  buildProjectsEditor(p.projects || []);

  document.getElementById("cancelEditBtn").addEventListener("click", () => {
    renderProfile(p);
  });

  document.getElementById("saveProfileBtn").addEventListener("click", async () => {
    const name = document.getElementById("edit_name").value.trim();
    const location = document.getElementById("edit_location").value.trim();
    const about = document.getElementById("edit_about").value.trim();
    const rolesRaw = document.getElementById("edit_roles").value.trim();
    const roles = rolesRaw.split(",").map(s => s.trim()).filter(Boolean);

    const stats = {
      collaborations: parseInt(document.getElementById("edit_stat_collab").value || 0, 10) || 0,
      skillsConfirmed: parseInt(document.getElementById("edit_stat_skills").value || 0, 10) || 0,
      projects: parseInt(document.getElementById("edit_stat_projects").value || 0, 10) || 0
    };

    const offers = collectOffersFromEditor();
    if (!Array.isArray(offers)) return;

    const needs = collectNeedsFromEditor();
    if (!Array.isArray(needs)) return;

    const projects = collectProjectsFromEditor();
    if (!Array.isArray(projects)) return;

    const payload = { name, location, about, roles, offers, needs, projects, stats };
    if (pendingAvatarDataUrl !== null) payload.picture = pendingAvatarDataUrl;
    if (pendingCoverDataUrl !== null) payload.cover = pendingCoverDataUrl;

    try {
      const res = await authFetch(`${BASE}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error || `Server error ${res.status}`);
        return;
      }
      if (data?.ok && data.profile) {
        profile = data.profile;
        const accounts = loadAccounts();
        const active = getActiveAccount();
        if (active) {
          const idx = accounts.findIndex(a => (a.id && a.id === active.id) || (a.email && a.email === active.email));
          if (idx >= 0) {
            accounts[idx].picture = data.profile.picture || accounts[idx].picture;
            accounts[idx].cover = data.profile.cover || accounts[idx].cover;
            saveAccounts(accounts);
          }
        }
        renderProfile(profile);
        alert("Профиль успешно сохранён");
      } else if (data?.profile) {
        profile = data.profile;
        renderProfile(profile);
        alert("Профиль успешно сохранён");
      } else {
        alert("Не удалось сохранить профиль");
      }
    } catch (e) {
      console.error("save profile error:", e);
      alert("Ошибка сети при сохранении профиля");
    }
  });
}

/* ===== Editors implementation ===== */

function buildOffersEditor(offers) {
  const container = document.getElementById("editor_offers_container");
  container.innerHTML = `
    <h3 style="margin:8px 0 6px 0">Я могу помочь — навыки</h3>
    <div id="offers_list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px;"></div>
    <button id="add_offer_btn" class="btn-outline">Добавить навык</button>
  `;
  const list = document.getElementById("offers_list");
  offers.forEach((o, idx) => appendOfferRow(list, o));
  document.getElementById("add_offer_btn").addEventListener("click", () => appendOfferRow(list, { title: "", desc: "", tags: [] }));
}

function appendOfferRow(listEl, offerObj) {
  const id = "offer_" + Math.random().toString(36).slice(2,9);
  const wrapper = document.createElement("div");
  wrapper.className = "skill-card";
  wrapper.dataset.rowId = id;
  wrapper.innerHTML = `
    <div style="display:flex;gap:8px;align-items:flex-start;">
      <div style="flex:1;">
        <input class="field-input offer-title" placeholder="Название (например: Frontend разработка)" value="${escapeHtml(offerObj.title || "")}" />
        <textarea class="field-input offer-desc" placeholder="Краткое описание" style="min-height:60px;margin-top:6px">${escapeHtml(offerObj.desc || "")}</textarea>
        <input class="field-input offer-tags" placeholder="Тэги через запятую (react, ui)" value="${escapeHtml((offerObj.tags || []).join(", "))}" style="margin-top:6px" />
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <button class="btn-outline remove-offer">Удалить</button>
      </div>
    </div>
  `;
  listEl.appendChild(wrapper);
  wrapper.querySelector(".remove-offer").addEventListener("click", () => wrapper.remove());
}

function collectOffersFromEditor() {
  const rows = document.querySelectorAll("#offers_list .skill-card");
  const arr = [];
  for (const r of rows) {
    const title = r.querySelector(".offer-title").value.trim();
    const desc = r.querySelector(".offer-desc").value.trim();
    const tagsRaw = r.querySelector(".offer-tags").value.trim();
    if (!title) {
      alert("У одного из навыков пустое название. Заполните или удалите его.");
      return null;
    }
    const tags = tagsRaw ? tagsRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
    arr.push({ title, desc, tags });
  }
  return arr;
}

function buildNeedsEditor(needs) {
  const container = document.getElementById("editor_needs_container");
  container.innerHTML = `
    <h3 style="margin:8px 0 6px 0">Я ищу — кого/что</h3>
    <div id="needs_list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px;"></div>
    <button id="add_need_btn" class="btn-outline">Добавить запрос</button>
  `;
  const list = document.getElementById("needs_list");
  needs.forEach(n => appendNeedRow(list, n));
  document.getElementById("add_need_btn").addEventListener("click", () => appendNeedRow(list, { title: "", type: "Стартап", tags: [] }));
}

function appendNeedRow(listEl, needObj) {
  const id = "need_" + Math.random().toString(36).slice(2,9);
  const wrapper = document.createElement("div");
  wrapper.className = "need-card";
  wrapper.dataset.rowId = id;
  wrapper.innerHTML = `
    <div style="display:flex;gap:8px;align-items:flex-start;">
      <div style="flex:1;">
        <input class="field-input need-title" placeholder="Кого ищет пользователь" value="${escapeHtml(needObj.title || "")}" />
        <select class="field-input need-type" style="margin-top:6px">
          <option>Стартап</option>
          <option>Фриланс</option>
          <option>Пет-проект</option>
        </select>
        <input class="field-input need-tags" placeholder="Тэги через запятую (node, api)" value="${escapeHtml((needObj.tags || []).join(", "))}" style="margin-top:6px" />
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <button class="btn-outline remove-need">Удалить</button>
      </div>
    </div>
  `;
  listEl.appendChild(wrapper);
  if (needObj.type) wrapper.querySelector(".need-type").value = needObj.type;
  wrapper.querySelector(".remove-need").addEventListener("click", () => wrapper.remove());
}

function collectNeedsFromEditor() {
  const rows = document.querySelectorAll("#needs_list .need-card");
  const arr = [];
  for (const r of rows) {
    const title = r.querySelector(".need-title").value.trim();
    const type = r.querySelector(".need-type").value.trim();
    const tagsRaw = r.querySelector(".need-tags").value.trim();
    if (!title) {
      alert("У одного из запросов пустое название. Заполните или удалите его.");
      return null;
    }
    const tags = tagsRaw ? tagsRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
    arr.push({ title, type, tags });
  }
  return arr;
}

function buildProjectsEditor(projects) {
  const container = document.getElementById("editor_projects_container");
  container.innerHTML = `
    <h3 style="margin:8px 0 6px 0">Проекты</h3>
    <div id="projects_list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px;"></div>
    <button id="add_project_btn" class="btn-outline">Добавить проект</button>
  `;
  const list = document.getElementById("projects_list");
  projects.forEach(pr => appendProjectRow(list, pr));
  document.getElementById("add_project_btn").addEventListener("click", () => appendProjectRow(list, { name: "", desc: "", stage: "Идея", looking: "" }));
}

function appendProjectRow(listEl, prObj) {
  const id = "proj_" + Math.random().toString(36).slice(2,9);
  const wrapper = document.createElement("div");
  wrapper.className = "project-item";
  wrapper.dataset.rowId = id;
  wrapper.innerHTML = `
    <div style="display:flex;gap:12px;align-items:flex-start;flex:1;">
      <div style="flex:1;">
        <input class="field-input project-name" placeholder="Название проекта" value="${escapeHtml(prObj.name || "")}" />
        <input class="field-input project-desc" placeholder="Краткое описание" value="${escapeHtml(prObj.desc || "")}" style="margin-top:6px" />
        <div style="display:flex;gap:8px;margin-top:6px">
          <select class="field-input project-stage">
            <option>Идея</option>
            <option>MVP</option>
            <option>Запущен</option>
          </select>
          <input class="field-input project-looking" placeholder="Кого ищут (например: Backend Dev)" value="${escapeHtml(prObj.looking || "")}" />
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <button class="btn-outline remove-project">Удалить</button>
      </div>
    </div>
  `;
  listEl.appendChild(wrapper);
  if (prObj.stage) wrapper.querySelector(".project-stage").value = prObj.stage;
  wrapper.querySelector(".remove-project").addEventListener("click", () => wrapper.remove());
}

function collectProjectsFromEditor() {
  const rows = document.querySelectorAll("#projects_list .project-item");
  const arr = [];
  for (const r of rows) {
    const name = r.querySelector(".project-name").value.trim();
    const desc = r.querySelector(".project-desc").value.trim();
    const stage = r.querySelector(".project-stage").value.trim();
    const looking = r.querySelector(".project-looking").value.trim();
    if (!name) {
      alert("У одного из проектов пустое название. Заполните или удалите его.");
      return null;
    }
    arr.push({ name, desc, stage, looking });
  }
  return arr;
}

/* If external calls need to register and then use profile */
window.uplio = {
  registerWithEmail: async (email, password) => {
    try {
      const r = await fetch(`${BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await r.json().catch(() => null);
      saveTokenIfPresent(data);
      if (data.user && data.token) addOrUpdateAccount(data.user, data.token);
      await loadCurrentProfile();
      attachMenuAuthGuards();
      return data;
    } catch {
      return null;
    }
  }
};
