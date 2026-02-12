// Базовая логика интерфейса (без фреймворков)

const PROFILE_STORAGE_KEY = "mw_profile_v1";
const VIEWER_STORAGE_KEY = "mw_viewer_id_v1";

const getViewerId = () => {
  try {
    const existing = localStorage.getItem(VIEWER_STORAGE_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,120}$/.test(existing)) return existing;

    const bytes = new Uint8Array(12);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const next = `v_${hex}`;
    localStorage.setItem(VIEWER_STORAGE_KEY, next);
    return next;
  } catch {
    return "";
  }
};

const pluralRu = (n, one, few, many) => {
  const x = Math.abs(Number(n) || 0) % 100;
  const x1 = x % 10;
  if (x > 10 && x < 20) return many;
  if (x1 > 1 && x1 < 5) return few;
  if (x1 === 1) return one;
  return many;
};

const formatRelativeTime = (ts) => {
  const t = Number(ts);
  if (!Number.isFinite(t) || t <= 0) return "";

  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 20) return "только что";
  if (diffSec < 60) return "только что";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    if (diffMin === 1) return "минуту назад";
    return `${diffMin} ${pluralRu(diffMin, "минуту", "минуты", "минут")} назад`;
  }

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    if (diffHr === 1) return "час назад";
    return `${diffHr} ${pluralRu(diffHr, "час", "часа", "часов")} назад`;
  }

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "вчера";
  if (diffDay < 7) return `${diffDay} ${pluralRu(diffDay, "день", "дня", "дней")} назад`;

  const dt = new Date(t);
  return dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
};

const getInitials = (name) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
};

const hasLetters = (value) => {
  const s = String(value || "");
  try {
    return /[\p{L}]/u.test(s);
  } catch {
    return /[A-Za-z\u0400-\u04FF]/.test(s);
  }
};

const getStoredProfile = () => {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
};

const setStoredProfile = (profile) => {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }
};

const clearStoredProfile = () => {
  try {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    // ignore
  }
};

const applyProfileToUi = (profile) => {
  if (!profile) return;

  const name = String(profile.name || "").trim();
  const role = String(profile.role || "").trim();
  const bio = String(profile.bio || "").trim();
  const initials = getInitials(name) || "Я";
  const avatarData = profile.avatarData ? String(profile.avatarData) : "";
  const coverData = profile.coverData ? String(profile.coverData) : "";

  const nameEl = document.getElementById("profileName");
  const usernameEl = document.getElementById("profileUsername");
  const roleEl = document.getElementById("profileRole");
  const bioEl = document.getElementById("profileBio");
  const avatarEl = document.getElementById("profileAvatar");
  const coverEl = document.getElementById("profileCover");
  const composerAvatarEl = document.getElementById("composerAvatar");

  if (nameEl && name) nameEl.textContent = name;
  if (usernameEl) {
    const id = Number(profile.id ?? currentUserId);
    const username = String(profile.username || "").trim();
    if (username) usernameEl.textContent = username.startsWith("@") ? username : `@${username}`;
    else if (Number.isFinite(id) && id > 0) usernameEl.textContent = `@mw${id}`;
    else usernameEl.textContent = "@mw";
  }
  if (roleEl) roleEl.textContent = role;
  if (bioEl) bioEl.textContent = bio;
  if (avatarEl) {
    if (avatarData) {
      avatarEl.textContent = "";
      avatarEl.style.backgroundImage = `url('${avatarData}')`;
      avatarEl.style.backgroundSize = "cover";
      avatarEl.style.backgroundPosition = "center";
    } else {
      avatarEl.style.backgroundImage = "";
      avatarEl.textContent = initials;
    }
  }

  if (coverEl) {
    if (coverData) {
      coverEl.style.backgroundImage = `url('${coverData}')`;
      coverEl.style.backgroundSize = "cover";
      coverEl.style.backgroundPosition = "center";
    } else {
      coverEl.style.backgroundImage = "";
      coverEl.style.backgroundSize = "";
      coverEl.style.backgroundPosition = "";
    }
  }

  if (composerAvatarEl) {
    if (avatarData) {
      composerAvatarEl.textContent = "";
      composerAvatarEl.style.backgroundImage = `url('${avatarData}')`;
      composerAvatarEl.style.backgroundSize = "cover";
      composerAvatarEl.style.backgroundPosition = "center";
    } else {
      composerAvatarEl.style.backgroundImage = "";
      composerAvatarEl.textContent = initials;
    }
  }

  document.querySelectorAll("[data-profile-menu-button]").forEach((btn) => {
    btn.textContent = initials;
  });
};

const applyStatsToUi = (stats, user) => {
  const s = stats || {};
  const projects = Number(s.projects || 0);
  const followers = Number(s.followers || 0);
  const following = Number(s.following || 0);
  const rating = Number(user?.rating || 0);

  const projectsEl = document.getElementById("statProjects");
  const followersEl = document.getElementById("statFollowers");
  const ratingEl = document.getElementById("statRating");
  const followingEl = document.getElementById("statFollowing");
  const registeredEl = document.getElementById("statRegistered");

  if (projectsEl) projectsEl.textContent = String(projects);
  if (followersEl) followersEl.textContent = String(followers);
  if (ratingEl) ratingEl.textContent = String(rating);
  if (followingEl) followingEl.textContent = String(following);

  if (registeredEl) {
    const ts = user?.createdAt;
    const dt = ts == null ? null : new Date(Number(ts));
    if (!dt || Number.isNaN(dt.getTime())) {
      registeredEl.textContent = "—";
    } else {
      registeredEl.textContent = dt.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    }
  }
};

const showAuthError = (message) => {
  const el = document.getElementById("authError");
  if (!el) return;

  if (!message) {
    el.textContent = "";
    el.classList.remove("is-visible");
    return;
  }

  el.textContent = message;
  el.classList.add("is-visible");
};

const apiFetch = async (url, options = {}) => {
  const viewerId = getViewerId();
  const opts = {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(viewerId ? { "X-Viewer-Id": viewerId } : {}),
      ...(options.headers || {}),
    },
    credentials: "same-origin",
  };

  if (options.body != null) opts.body = JSON.stringify(options.body);

  const res = await fetch(url, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    return { ok: false, status: res.status, data };
  }

  return { ok: true, status: res.status, data };
};

const formatRub = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return `${n.toLocaleString("ru-RU")} ₽`;
};

const formatBudget = (min, max) => {
  const bMin = min == null ? null : Number(min);
  const bMax = max == null ? null : Number(max);
  if (Number.isFinite(bMin) && Number.isFinite(bMax)) return `${formatRub(bMin)} — ${formatRub(bMax)}`;
  if (Number.isFinite(bMax)) return `до ${formatRub(bMax)}`;
  return "Бюджет не указан";
};

const formatDueDate = (dueDate) => {
  const raw = String(dueDate || "").trim();
  if (!raw) return "";
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
};

const setAvatarVisual = (el, name, imageData, fallback = "?") => {
  if (!el) return;
  const src = String(imageData || "").trim();
  if (src) {
    el.textContent = "";
    el.style.backgroundImage = `url('${src}')`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
    return;
  }

  el.style.backgroundImage = "";
  el.textContent = getInitials(name) || fallback;
};

const ensurePostMenuCloseWiring = () => {
  if (document.body.dataset.postMenuCloseWired === "1") return;
  document.body.dataset.postMenuCloseWired = "1";

  document.addEventListener("click", (event) => {
    document.querySelectorAll(".post-menu.is-open").forEach((menu) => {
      if (menu.contains(event.target)) return;
      menu.classList.remove("is-open");
      const btn = menu.querySelector("button[aria-expanded]");
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll(".post-menu.is-open").forEach((menu) => {
      menu.classList.remove("is-open");
      const btn = menu.querySelector("button[aria-expanded]");
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  });
};

const getProjectShareUrl = (projectId) => {
  const origin = window.location.origin && window.location.origin !== "null" ? window.location.origin : "";
  return origin ? `${origin}/post.html#project-${projectId}` : `post.html#project-${projectId}`;
};

const openModal = (modal) => {
  if (!modal) return;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-modal-open");
};

const closeModal = (modal) => {
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-modal-open");
};

const wireModal = (modal) => {
  if (!modal || modal.dataset.wired === "1") return;
  modal.dataset.wired = "1";

  modal.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", () => closeModal(modal));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!modal.classList.contains("is-open")) return;
    closeModal(modal);
  });
};

const findTopbarButtonByIcon = (iconClass) => {
  const icon = document.querySelector(`.topbar-actions i.${iconClass}`);
  return icon ? icon.closest("button") : null;
};

const ensureIconBadge = (btn) => {
  if (!btn) return null;
  btn.classList.add("btn-badge");
  let badge = btn.querySelector(".icon-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "icon-badge";
    badge.setAttribute("aria-hidden", "true");
    btn.appendChild(badge);
  }
  return badge;
};

const setIconBadge = (badge, count) => {
  if (!badge) return;
  const n = Number(count || 0);
  if (!Number.isFinite(n) || n <= 0) {
    badge.textContent = "";
    badge.classList.remove("is-visible");
    return;
  }
  badge.textContent = n > 99 ? "99+" : String(n);
  badge.classList.add("is-visible");
};

let badgesTimer = null;
const startBadgesPolling = () => {
  if (badgesTimer) return;

  const messageBadges = () => Array.from(document.querySelectorAll("[data-badge='messages']"));

  const tick = async () => {
    if (!document.body.classList.contains("is-authed")) {
      messageBadges().forEach((b) => {
        b.textContent = "";
        b.classList.remove("is-visible");
      });
      return;
    }

    const res = await apiFetch("/api/badges");
    if (!res.ok) {
      messageBadges().forEach((b) => {
        b.textContent = "";
        b.classList.remove("is-visible");
      });
      return;
    }

    const n = Number(res.data?.messagesUnread || 0);
    messageBadges().forEach((b) => {
      if (!Number.isFinite(n) || n <= 0) {
        b.textContent = "";
        b.classList.remove("is-visible");
      } else {
        b.textContent = n > 99 ? "99+" : String(n);
        b.classList.add("is-visible");
      }
    });
  };

  tick();
  badgesTimer = setInterval(tick, 5000);
};

const stopBadgesPolling = () => {
  if (!badgesTimer) return;
  clearInterval(badgesTimer);
  badgesTimer = null;
};

const ensureNotificationsModal = () => {
  let modal = document.getElementById("notificationsModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "notificationsModal";
  modal.setAttribute("aria-hidden", "true");

  modal.innerHTML = `
    <div class="modal-backdrop" data-close-modal></div>
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="notificationsTitle">
      <div class="modal-header">
        <h2 id="notificationsTitle">Уведомления</h2>
        <button class="btn btn-ghost" type="button" aria-label="Закрыть" data-close-modal><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="muted">Последние события в вашем профиле.</div>
      <div class="comments-list" id="notificationsList"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" type="button" data-action="notifications-read">Отметить прочитанными</button>
        <button class="btn btn-primary" type="button" data-close-modal>Закрыть</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  wireModal(modal);

  modal.querySelector("[data-action='notifications-read']")?.addEventListener("click", async () => {
    const resp = await apiFetch("/api/notifications/read", { method: "POST" });
    if (!resp.ok && resp.status === 401) window.location.href = "login.html";
    await loadNotifications();
    startBadgesPolling();
  });

  return modal;
};

const renderNotificationText = (n) => {
  const who = n.actorName ? String(n.actorName) : "Кто-то";
  const isPost = n.postId != null && n.postId !== "";
  if (n.type === "like") return `${who} поставил(а) нравится вашему ${isPost ? "посту" : "проекту"}`;
  if (n.type === "comment") return `${who} оставил(а) комментарий к вашему ${isPost ? "посту" : "проекту"}`;
  if (n.type === "follow") return `${who} подписался(ась) на вас`;
  return `${who}: событие`;
};

const loadNotifications = async () => {
  const modal = document.getElementById("notificationsModal");
  if (!modal) return;
  const list = modal.querySelector("#notificationsList");
  if (!list) return;

  list.innerHTML = `<div class="muted">Загрузка…</div>`;

  const res = await apiFetch("/api/notifications?limit=50");
  if (!res.ok) {
    if (res.status === 401) window.location.href = "login.html";
    list.innerHTML = `<div class="muted">Не удалось загрузить уведомления.</div>`;
    return;
  }

  const items = Array.isArray(res.data?.items) ? res.data.items : [];
  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = `<div class="muted">Пока нет уведомлений.</div>`;
    return;
  }

  items.forEach((n) => {
    const item = document.createElement("div");
    item.className = "comment-item";

    const head = document.createElement("div");
    head.className = "comment-head";

    const title = document.createElement("div");
    title.className = "comment-author";
    title.textContent = renderNotificationText(n);

    const time = document.createElement("div");
    time.className = "comment-time";
    const dt = n.createdAt ? new Date(Number(n.createdAt)) : null;
    time.textContent = dt ? dt.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

    head.appendChild(title);
    head.appendChild(time);

    const body = document.createElement("div");
    const projectTitle = String(n.projectTitle || "").trim();
    const postBody = String(n.postBody || "").trim();
    if (projectTitle) body.textContent = projectTitle;
    else if (postBody) body.textContent = postBody.length > 140 ? `${postBody.slice(0, 140)}…` : postBody;

    item.appendChild(head);
    if (body.textContent) item.appendChild(body);
    list.appendChild(item);
  });
};

const initTopbarNotifications = () => {
  const bellBtn = findTopbarButtonByIcon("fa-bell");
  if (!bellBtn || bellBtn.dataset.boundNotif === "1") return;
  bellBtn.dataset.boundNotif = "1";

  bellBtn.addEventListener("click", async () => {
    if (!document.body.classList.contains("is-authed")) {
      window.location.href = "login.html";
      return;
    }
    const modal = ensureNotificationsModal();
    openModal(modal);
    await loadNotifications();
  });
};

const page = document.body?.dataset?.page || "";
const isAuthPage = page === "login" || page === "register";
const isPublicPage = page === "feed" || page === "legal" || isAuthPage;

let currentUserId = null;

const setAuthedUi = (isAuthed) => {
  document.body?.classList?.toggle("is-authed", Boolean(isAuthed));
};

// 1) Подтягиваем профиль с сервера (чтобы это был "общак", а не только localStorage).
(async () => {
  try {
    const me = await apiFetch("/api/me");

    if (!me.ok) {
      // Гостевой режим: лента доступна без входа.
      setAuthedUi(false);
      stopBadgesPolling();

      if (!isPublicPage && me.status === 401) {
        const next = encodeURIComponent(window.location.pathname.split("/").pop() || "index.html");
        window.location.href = `login.html?next=${next}`;
      }
      return;
    }

    const user = me.data?.user;
    if (user) {
      setAuthedUi(true);
      currentUserId = Number(user.id);
      const profile = {
        id: user.id,
        name: user.name,
        role: user.role,
        bio: user.bio,
        avatarData: user.avatarData || null,
        coverData: user.coverData || null,
      };
      setStoredProfile(profile);
      applyProfileToUi(profile);
      applyStatsToUi(me.data?.stats, user);
      initTopbarNotifications();
      startBadgesPolling();
    }
  } catch {
    // Если сервер не запущен или сеть недоступна — просто оставим локальные данные.
    setAuthedUi(false);
    stopBadgesPolling();
    applyProfileToUi(getStoredProfile());
  }
})();

// 1.01) Поиск в верхней панели — разный текст для разных разделов
(() => {
  const input = document.querySelector(".topbar .search input[type='search']");
  if (!input) return;

  if (page === "messages") input.placeholder = "Поиск по сообщениям и людям";
  else if (page === "create") input.placeholder = "Поиск проектов по названию и тегам";
  else if (page === "profile") input.placeholder = "Поиск людей и проектов";
  else input.placeholder = "Поиск проектов, людей, тегов";
})();

// 1.02) Гостю запрещаем "внутренние" разделы — предлагаем войти/зарегистрироваться.
document.querySelectorAll("[data-auth-required]").forEach((link) => {
  link.addEventListener("click", async (event) => {
    // Если мы авторизованы — не мешаем переходу.
    if (document.body.classList.contains("is-authed")) return;
    event.preventDefault();

    const href = link.getAttribute("href") || "index.html";
    const next = encodeURIComponent(href);
    window.location.href = `register.html?next=${next}`;
  });
});

// 1.05) Лента проектов — тянем из общей БД (+ фильтры категорий)
const feedList = document.getElementById("feedList");
if (feedList) {
  const filtersWrap = document.querySelector(".feed .filters");
  const filterButtons = filtersWrap ? Array.from(filtersWrap.querySelectorAll("button.chip")) : [];
  let activeCategory = "";

  const getCategoryFromFilterButton = (btn) => {
    const t = String(btn?.textContent || "").trim().toLowerCase();
    if (!t) return "";
    if (t === "все") return "";
    if (t === "дизайн") return "Дизайн";
    if (t === "веб") return "Веб";
    if (t === "бренд") return "Бренд";
    if (t === "продукт") return "Продукт";
    return "";
  };

  const setActiveFilterUi = (category) => {
    filterButtons.forEach((btn) => {
      const c = getCategoryFromFilterButton(btn);
      btn.classList.toggle("is-active", c === category);
    });
  };

  const renderFeed = (items) => {
    feedList.innerHTML = "";

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = activeCategory
        ? `Пока нет проектов в категории «${activeCategory}».`
        : "Пока пусто. Создайте первый проект — он появится здесь.";
      feedList.appendChild(empty);
      return;
    }

    items.forEach((p) => {
      const isOwner = currentUserId != null && Number(p.authorId) === Number(currentUserId);

      const card = renderProjectCard(p, {
        isOwner,
        authorName: p.authorName,
        authorRole: p.authorRole,
        authorId: p.authorId,
        commentTitle: p.title,
        onEdit: () => {
          window.location.href = "post.html";
        },
        onDelete: async (project) => {
          const resp = await apiFetch(`/api/projects/${project.id}`, { method: "DELETE" });
          if (!resp.ok) {
            if (resp.status === 401) window.location.href = "login.html";
            return;
          }
          await loadFeed();
        },
      });

      feedList.appendChild(card);
    });
  };

  const loadFeed = async () => {
    try {
      feedList.innerHTML = `<div class="muted">Загрузка…</div>`;

      const url = activeCategory ? `/api/projects?category=${encodeURIComponent(activeCategory)}` : "/api/projects";
      const result = await apiFetch(url);
      if (!result.ok) throw new Error("API_UNAVAILABLE");

      const items = Array.isArray(result.data?.items) ? result.data.items : [];
      renderFeed(items);
    } catch {
      // Фоллбек (если сервер не запущен или API недоступно) — показываем демо-ленту.
      feedList.innerHTML = "";
      const note = document.createElement("div");
      note.className = "muted";
      note.textContent = "Демо-режим. Чтобы создавать аккаунты и проекты, запустите сервер: node server.js";
      feedList.appendChild(note);
    }
  };

  // Инициализируем активный фильтр по разметке (если есть)
  if (filterButtons.length) {
    const activeBtn = filterButtons.find((b) => b.classList.contains("is-active")) || filterButtons[0];
    activeCategory = getCategoryFromFilterButton(activeBtn);
    setActiveFilterUi(activeCategory);

    filterButtons.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const next = getCategoryFromFilterButton(btn);
        if (next === activeCategory) return;
        activeCategory = next;
        setActiveFilterUi(activeCategory);
        await loadFeed();
      });
    });
  }

  loadFeed();
}

// 1.06) Рекомендации справа (без фейков) — тянем из общей БД
const suggestedList = document.getElementById("suggestedList");
if (suggestedList) {
  (async () => {
    const note = document.getElementById("suggestedNote");

    try {
      const result = await apiFetch("/api/users/suggested?limit=3");
      if (!result.ok) {
        suggestedList.innerHTML = "";
        if (result.status === 401) {
          if (note) note.textContent = "Войдите, чтобы увидеть рекомендации.";
          return;
        }
        throw new Error("API_UNAVAILABLE");
      }

      const raw = Array.isArray(result.data?.items) ? result.data.items : [];
      const items = raw
        .filter((u) => u && typeof u === "object")
        .filter((u) => (currentUserId == null ? true : Number(u.id) !== Number(currentUserId)))
        .filter((u) => {
          const name = String(u.name || "").trim();
          if (!name) return false;
          if (!hasLetters(name)) return false;
          // Если в БД есть старые «кракозябры» — не показываем их.
          if (/[?�]/.test(name)) return false;
          return true;
        });
      suggestedList.innerHTML = "";

      if (!items.length) {
        if (note) note.textContent = "Пока нет пользователей для рекомендаций.";
        return;
      }

      if (note) note.textContent = "";

      items.forEach((u) => {
        const row = document.createElement("div");
        row.className = "mini-profile";

        const av = document.createElement("div");
        av.className = "avatar";
        av.textContent = getInitials(u.name) || "?";

        const meta = document.createElement("div");
        const name = document.createElement("a");
        name.className = "mini-name";
        name.href = `user.html?id=${encodeURIComponent(String(u.id))}`;
        name.textContent = u.name || "Пользователь";

        const role = document.createElement("div");
        role.className = "mini-role";
        role.textContent = u.role || "";

        meta.appendChild(name);
        meta.appendChild(role);

        const followBtn = document.createElement("button");
        followBtn.className = "btn btn-ghost";
        followBtn.type = "button";
        followBtn.setAttribute("data-toggle", "follow");
        followBtn.setAttribute("data-user-id", String(u.id));
        followBtn.textContent = "Подписаться";

        row.appendChild(av);
        row.appendChild(meta);
        row.appendChild(followBtn);

        suggestedList.appendChild(row);
        bindFollowButton(followBtn);
      });
    } catch {
      if (note) note.textContent = "Рекомендации временно недоступны.";
    }
  })();
}

// Просмотры постов: считаем уникально по viewer id (localStorage + header).
let postViewObserver = null;
const seenPostViews = new Set();

const markPostViewed = async (postId, viewsEl) => {
  const id = Number(postId);
  if (!Number.isFinite(id) || id <= 0) return;
  if (seenPostViews.has(id)) return;
  seenPostViews.add(id);

  try {
    const result = await apiFetch(`/api/posts/${encodeURIComponent(String(id))}/view`, { method: "POST" });
    if (!result.ok) return;
    if (!viewsEl) return;
    const c = Number(result.data?.viewsCount || 0);
    viewsEl.textContent = String(Number.isFinite(c) ? c : 0);
  } catch {
    // ignore
  }
};

const observePostView = (cardEl, postId, viewsEl) => {
  if (!cardEl) return;
  const id = Number(postId);
  if (!Number.isFinite(id) || id <= 0) return;

  // Если IntersectionObserver недоступен, просто отметим сразу.
  if (!("IntersectionObserver" in window)) {
    markPostViewed(id, viewsEl);
    return;
  }

  if (!postViewObserver) {
    postViewObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          if (entry.intersectionRatio < 0.6) return;
          const pid = Number(entry.target?.dataset?.postId || 0);
          const viewsTarget = entry.target?.__mwViewsEl || null;
          markPostViewed(pid, viewsTarget);
          try {
            postViewObserver?.unobserve?.(entry.target);
          } catch {
            // ignore
          }
        });
      },
      { threshold: [0.6] },
    );
  }

  cardEl.dataset.postId = String(id);
  cardEl.__mwViewsEl = viewsEl || null;
  postViewObserver.observe(cardEl);
};

let projectViewObserver = null;
const seenProjectViews = new Set();

const markProjectViewed = async (projectId, viewsEl) => {
  const id = Number(projectId);
  if (!Number.isFinite(id) || id <= 0) return;
  if (seenProjectViews.has(id)) return;
  seenProjectViews.add(id);

  try {
    const result = await apiFetch(`/api/projects/${encodeURIComponent(String(id))}/view`, { method: "POST" });
    if (!result.ok) return;
    if (!viewsEl) return;
    const c = Number(result.data?.viewsCount || 0);
    viewsEl.textContent = String(Number.isFinite(c) ? c : 0);
  } catch {
    // ignore
  }
};

const observeProjectView = (cardEl, projectId, viewsEl) => {
  if (!cardEl) return;
  const id = Number(projectId);
  if (!Number.isFinite(id) || id <= 0) return;

  if (!("IntersectionObserver" in window)) {
    markProjectViewed(id, viewsEl);
    return;
  }

  if (!projectViewObserver) {
    projectViewObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          if (entry.intersectionRatio < 0.6) return;
          const pid = Number(entry.target?.dataset?.projectId || 0);
          const viewsTarget = entry.target?.__mwProjectViewsEl || null;
          markProjectViewed(pid, viewsTarget);
          try {
            projectViewObserver?.unobserve?.(entry.target);
          } catch {
            // ignore
          }
        });
      },
      { threshold: [0.6] },
    );
  }

  cardEl.dataset.projectId = String(id);
  cardEl.__mwProjectViewsEl = viewsEl || null;
  projectViewObserver.observe(cardEl);
};

function renderPostsInto(listEl, items) {
  if (!listEl) return;
  listEl.innerHTML = "";

  if (!items.length) {
    listEl.innerHTML = `<div class="muted">Пока нет постов.</div>`;
    return;
  }

  items.forEach((p) => {
    const card = document.createElement("article");
    card.className = "post-card";

    const header = document.createElement("div");
    header.className = "post-header";

    const left = document.createElement("div");

    const av = document.createElement("div");
    av.className = "avatar";
    av.textContent = getInitials(p.authorName) || "Я";

    const metaWrap = document.createElement("div");
    const author = document.createElement("a");
    author.className = "post-author";
    author.textContent = p.authorName || "Пользователь";
    if (p.authorId != null) author.href = `user.html?id=${encodeURIComponent(String(p.authorId))}`;

    const meta = document.createElement("div");
    meta.className = "post-meta";
    const dt = p.createdAt ? new Date(Number(p.createdAt)) : null;
    meta.textContent = dt ? dt.toLocaleString("ru-RU", { day: "2-digit", month: "short" }) : "";

    metaWrap.appendChild(author);
    metaWrap.appendChild(meta);
    left.appendChild(av);
    left.appendChild(metaWrap);

    header.appendChild(left);

    const body = document.createElement("p");
    body.textContent = String(p.body || "").trim();

    card.appendChild(header);
    if (body.textContent) card.appendChild(body);

    const imageData = String(p.imageData || "").trim();
    if (imageData) {
      const media = document.createElement("div");
      media.className = "post-media";
      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = "Изображение";
      img.src = imageData;
      media.appendChild(img);
      card.appendChild(media);
    }

    const footer = document.createElement("div");
    footer.className = "post-footer";

    const metaLeft = document.createElement("div");
    metaLeft.className = "budget-wrap";
    metaLeft.innerHTML = `<div class="budget muted">Публикация</div>`;

    const actions = document.createElement("div");
    actions.className = "post-actions";

    const likeBtn = document.createElement("button");
    likeBtn.className = "btn btn-ghost";
    likeBtn.type = "button";
    likeBtn.setAttribute("data-post-id", String(p.id));
    setLikeButtonUi(likeBtn, Boolean(p.likedByMe), Number(p.likesCount || 0));

    const commentBtn = document.createElement("button");
    commentBtn.className = "btn btn-ghost";
    commentBtn.type = "button";
    commentBtn.setAttribute("data-toggle", "comments");
    commentBtn.setAttribute("data-post-id", String(p.id));
    setCommentsButtonUi(commentBtn, Number(p.commentsCount || 0));

    const repostBtn = document.createElement("button");
    repostBtn.className = "btn btn-ghost";
    repostBtn.type = "button";
    repostBtn.setAttribute("data-repost-type", "post");
    repostBtn.setAttribute("data-repost-id", String(p.id));
    setRepostButtonUi(repostBtn, Boolean(p.repostedByMe));

    actions.appendChild(likeBtn);
    actions.appendChild(commentBtn);
    actions.appendChild(repostBtn);

    footer.appendChild(metaLeft);
    footer.appendChild(actions);
    card.appendChild(footer);

    listEl.appendChild(card);

    observePostView(card, p.id, null);

    bindPostLikeButton(likeBtn);
    bindPostCommentsButton(commentBtn, { postId: p.id, title: "Пост" });
    bindRepostButton(repostBtn);
  });
}

async function loadPostsInto(listEl, { limit = 30 } = {}) {
  if (!listEl) return;
  try {
    listEl.innerHTML = `<div class="muted">Загрузка…</div>`;
    const result = await apiFetch(`/api/posts?limit=${encodeURIComponent(String(limit))}`);
    if (!result.ok) throw new Error("API_UNAVAILABLE");
    const items = Array.isArray(result.data?.items) ? result.data.items : [];
    renderPostsInto(listEl, items);
  } catch {
    listEl.innerHTML = `<div class="muted">Не удалось загрузить посты. Проверьте, что сервер запущен: node server.js</div>`;
  }
}

// 1.07) Публикации на главной (index.html)
const homePostsList = document.getElementById("homePostsList");
if (homePostsList) {
  loadPostsInto(homePostsList, { limit: 20 });
}

// 1.08) Создание поста (в профиле, как в соцсетях)
document.querySelectorAll("form[data-post-composer='1']").forEach((form) => {
  const hint = document.getElementById("postComposerHint");
  const textarea = form.elements?.body;
  const imageInput = form.querySelector("input[type='file'][name='image']");
  const preview = form.querySelector(".composer-preview") || document.getElementById("postImagePreview");
  const attachBtn = form.querySelector("[data-action='attach']");

  let imageData = null;

  const setHint = (text) => {
    if (!hint) return;
    hint.textContent = String(text || "");
  };

  const setPreview = (dataUrl) => {
    if (!preview) return;
    preview.innerHTML = "";
    if (!dataUrl) return;

    const box = document.createElement("div");
    box.className = "composer-preview-box";

    const img = document.createElement("img");
    img.alt = "Предпросмотр";
    img.src = dataUrl;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "composer-remove";
    remove.setAttribute("aria-label", "Убрать изображение");
    remove.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    remove.addEventListener("click", () => {
      imageData = null;
      try {
        if (imageInput) imageInput.value = "";
      } catch {
        // ignore
      }
      setPreview(null);
    });

    box.appendChild(img);
    box.appendChild(remove);
    preview.appendChild(box);
  };

  if (attachBtn && imageInput) {
    attachBtn.addEventListener("click", () => imageInput.click());
  }

  if (imageInput) {
    imageInput.addEventListener("change", async () => {
      const file = imageInput.files && imageInput.files[0] ? imageInput.files[0] : null;
      if (!file) {
        imageData = null;
        setPreview(null);
        return;
      }
      if (!/^image\//.test(file.type)) {
        imageData = null;
        setPreview(null);
        return;
      }
      if (file.size > 1_200_000) {
        imageData = null;
        setPreview(null);
        setHint("Картинка слишком большая. Выберите файл до 1.2 МБ.");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        imageData = typeof reader.result === "string" ? reader.result : null;
        setPreview(imageData);
        setHint("");
      };
      reader.onerror = () => {
        imageData = null;
        setPreview(null);
      };
      reader.readAsDataURL(file);
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!document.body.classList.contains("is-authed")) {
      window.location.href = "register.html?next=profile.html";
      return;
    }

    const body = textarea?.value?.trim?.() || "";
    if (!body && !imageData) return;

    const result = await apiFetch("/api/posts", { method: "POST", body: { body, imageData } });
    if (!result.ok) {
      if (result.status === 401) window.location.href = "login.html";
      setHint("Не удалось опубликовать запись. Попробуйте ещё раз.");
      return;
    }

    try {
      form.reset();
    } catch {
      // ignore
    }
    imageData = null;
    setPreview(null);
    setHint("Опубликовано.");

    // Обновим видимые ленты
    const list1 = document.getElementById("homePostsList");
    if (list1) await loadPostsInto(list1, { limit: 20 });

    const list2 = document.getElementById("profilePostsList");
    if (list2) {
      // Профильная секция "Мои посты"
      try {
        if (typeof window.__mwLoadMyPosts === "function") await window.__mwLoadMyPosts();
      } catch {
        // ignore
      }
    }
  });
});

// 1.07) Метрики на главной (без фейков)
const metricUsers = document.getElementById("metricUsers");
const metricProjectsToday = document.getElementById("metricProjectsToday");
const metricComments = document.getElementById("metricComments");
if (metricUsers || metricProjectsToday || metricComments) {
  (async () => {
    try {
      const result = await apiFetch("/api/public/stats");
      if (!result.ok) throw new Error("API_UNAVAILABLE");

      if (metricUsers) metricUsers.textContent = String(Number(result.data?.users || 0));
      if (metricProjectsToday) metricProjectsToday.textContent = String(Number(result.data?.projectsToday || 0));
      if (metricComments) metricComments.textContent = String(Number(result.data?.comments || 0));
    } catch {
      if (metricUsers) metricUsers.textContent = "нет данных";
      if (metricProjectsToday) metricProjectsToday.textContent = "нет данных";
      if (metricComments) metricComments.textContent = "нет данных";
    }
  })();
}

// 1.1) Создание проекта (страница "Проекты")
const renderProjectCard = (project, options = {}) => {
  const p = project || {};
  const opts = options || {};

  const authorName = String(opts.authorName || p.authorName || "Пользователь");
  const authorRole = String(opts.authorRole || p.authorRole || "").trim();
  const authorAvatarData = String(opts.authorAvatarData || p.authorAvatarData || "").trim();
  const authorId = opts.authorId != null ? Number(opts.authorId) : Number(p.authorId);
  const isOwner = Boolean(opts.isOwner);
  const onEdit = typeof opts.onEdit === "function" ? opts.onEdit : null;
  const onDelete = typeof opts.onDelete === "function" ? opts.onDelete : null;
  const commentTitle = String(opts.commentTitle || p.title || "Проект");
  const hintEl = opts.hintEl || null;

  const card = document.createElement("article");
  card.className = "post-card";

  const header = document.createElement("div");
  header.className = "post-header";

  const left = document.createElement("div");
  const avatar = document.createElement("div");
  avatar.className = "avatar avatar-sm";
  setAvatarVisual(avatar, authorName, authorAvatarData, "Я");

  const metaWrap = document.createElement("div");
  const author = document.createElement(Number.isFinite(authorId) && authorId > 0 ? "a" : "div");
  author.className = "post-author";
  author.textContent = authorName;
  if (author.tagName === "A") author.href = `user.html?id=${encodeURIComponent(String(authorId))}`;

  const meta = document.createElement("div");
  meta.className = "post-meta";
  const relative = formatRelativeTime(p.createdAt);
  if (relative) meta.textContent = authorRole ? `${relative} · ${authorRole}` : relative;
  else {
    const dt = p.createdAt ? new Date(Number(p.createdAt)) : null;
    const short = dt && !Number.isNaN(dt.getTime()) ? dt.toLocaleString("ru-RU", { day: "2-digit", month: "short" }) : "";
    meta.textContent = short || authorRole;
  }

  metaWrap.appendChild(author);
  metaWrap.appendChild(meta);
  left.appendChild(avatar);
  left.appendChild(metaWrap);

  const menu = document.createElement("div");
  menu.className = "post-menu";

  const menuBtn = document.createElement("button");
  menuBtn.className = "profile-icon-btn";
  menuBtn.type = "button";
  menuBtn.setAttribute("aria-label", "Меню проекта");
  menuBtn.setAttribute("aria-haspopup", "menu");
  menuBtn.setAttribute("aria-expanded", "false");
  menuBtn.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';

  const dropdown = document.createElement("div");
  dropdown.className = "post-menu-dropdown";
  dropdown.setAttribute("role", "menu");

  const shareItem = document.createElement("button");
  shareItem.className = "menu-item";
  shareItem.type = "button";
  shareItem.setAttribute("role", "menuitem");
  shareItem.innerHTML = '<i class="fa-solid fa-share-nodes"></i>Поделиться';

  if (isOwner) {
    const editItem = document.createElement("button");
    editItem.className = "menu-item";
    editItem.type = "button";
    editItem.setAttribute("role", "menuitem");
    editItem.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>Редактировать';
    editItem.addEventListener("click", () => {
      menu.classList.remove("is-open");
      menuBtn.setAttribute("aria-expanded", "false");
      if (onEdit) onEdit(p);
    });
    dropdown.appendChild(editItem);
  }

  dropdown.appendChild(shareItem);

  if (isOwner) {
    const sep = document.createElement("div");
    sep.className = "menu-sep";
    sep.setAttribute("role", "separator");
    dropdown.appendChild(sep);

    const delItem = document.createElement("button");
    delItem.className = "menu-item is-danger";
    delItem.type = "button";
    delItem.setAttribute("role", "menuitem");
    delItem.innerHTML = '<i class="fa-solid fa-trash"></i>Удалить';
    delItem.addEventListener("click", async () => {
      menu.classList.remove("is-open");
      menuBtn.setAttribute("aria-expanded", "false");
      if (!window.confirm("Удалить проект? Это действие нельзя отменить.")) return;
      if (onDelete) await onDelete(p);
    });
    dropdown.appendChild(delItem);
  }

  menu.appendChild(menuBtn);
  menu.appendChild(dropdown);

  header.appendChild(left);
  header.appendChild(menu);
  card.appendChild(header);

  const title = document.createElement("h3");
  title.textContent = String(p.title || "").trim();
  if (title.textContent) card.appendChild(title);

  const body = document.createElement("p");
  body.textContent = String(p.body || "").trim();
  if (body.textContent) card.appendChild(body);

  const tags = document.createElement("div");
  tags.className = "post-tags";

  const category = String(p.category || "").trim();
  if (category) {
    const tag = document.createElement("span");
    tag.className = "chip";
    tag.textContent = category;
    tags.appendChild(tag);
  }

  const tagsStr = String(p.tags || "").trim();
  if (tagsStr) {
    tagsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8)
      .forEach((value) => {
        const tag = document.createElement("span");
        tag.className = "chip";
        tag.textContent = value;
        tags.appendChild(tag);
      });
  }
  if (tags.childElementCount) card.appendChild(tags);

  const budgetWrap = document.createElement("div");
  budgetWrap.className = "budget-wrap";
  const budget = document.createElement("div");
  budget.className = "budget";
  budget.textContent = formatBudget(p.budgetMin, p.budgetMax);
  budgetWrap.appendChild(budget);

  const due = formatDueDate(p.dueDate);
  if (due) {
    const dueEl = document.createElement("div");
    dueEl.className = "budget-meta";
    dueEl.textContent = `Срок: ${due}`;
    budgetWrap.appendChild(dueEl);
  }
  card.appendChild(budgetWrap);

  const footer = document.createElement("div");
  footer.className = "post-footer";

  const actions = document.createElement("div");
  actions.className = "post-actions";

  const likeBtn = document.createElement("button");
  likeBtn.className = "post-action-btn";
  likeBtn.type = "button";
  likeBtn.dataset.ui = "compact";
  likeBtn.setAttribute("data-toggle", "like");
  likeBtn.setAttribute("data-project-id", String(p.id));
  setLikeButtonUi(likeBtn, Boolean(p.likedByMe), Number(p.likesCount || 0));
  bindLikeButton(likeBtn);

  const commentBtn = document.createElement("button");
  commentBtn.className = "post-action-btn";
  commentBtn.type = "button";
  commentBtn.dataset.ui = "compact";
  commentBtn.setAttribute("data-toggle", "comments");
  commentBtn.setAttribute("data-project-id", String(p.id));
  setCommentsButtonUi(commentBtn, Number(p.commentsCount || 0));
  bindCommentsButton(commentBtn, { projectId: p.id, title: commentTitle });

  const repostBtn = document.createElement("button");
  repostBtn.className = "post-action-btn";
  repostBtn.type = "button";
  repostBtn.dataset.ui = "compact";
  repostBtn.setAttribute("data-repost-type", "project");
  repostBtn.setAttribute("data-repost-id", String(p.id));
  setRepostButtonUi(repostBtn, Boolean(p.repostedByMe), Number(p.repostsCount || 0));
  bindRepostButton(repostBtn);

  actions.appendChild(likeBtn);
  actions.appendChild(commentBtn);
  actions.appendChild(repostBtn);

  const views = document.createElement("div");
  views.className = "post-views muted";
  const viewsIcon = document.createElement("i");
  viewsIcon.className = "fa-regular fa-eye";
  const viewsCount = document.createElement("span");
  viewsCount.textContent = String(Number(p.viewsCount || 0));
  views.appendChild(viewsIcon);
  views.appendChild(viewsCount);

  footer.appendChild(actions);
  footer.appendChild(views);
  card.appendChild(footer);

  observeProjectView(card, p.id, viewsCount);
  ensurePostMenuCloseWiring();

  menuBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.toggle("is-open");
    menuBtn.setAttribute("aria-expanded", String(isOpen));
  });

  shareItem.addEventListener("click", async () => {
    menu.classList.remove("is-open");
    menuBtn.setAttribute("aria-expanded", "false");

    const url = getProjectShareUrl(p.id);
    const text = String(p.title || p.body || "").trim();
    try {
      if (navigator.share) {
        await navigator.share({ title: "Moneyway", text: text.slice(0, 200), url });
        if (hintEl) hintEl.textContent = "Ссылка отправлена.";
      } else {
        await navigator.clipboard.writeText(url);
        if (hintEl) hintEl.textContent = "Ссылка скопирована.";
      }
    } catch {
      if (hintEl) hintEl.textContent = "Не удалось поделиться ссылкой.";
    }
  });

  return card;
};

const myProjectsList = document.getElementById("myProjectsList");
const projectEditModal = document.getElementById("projectEditModal");
const projectPreviewModal = document.getElementById("projectPreviewModal");

async function loadMyProjects() {
  if (!myProjectsList) return;

  myProjectsList.innerHTML = `<div class="muted">Загрузка…</div>`;

  let result = null;
  try {
    result = await apiFetch("/api/my/projects");
  } catch {
    myProjectsList.innerHTML = `<div class="muted">Сервер недоступен. Запустите: node server.js</div>`;
    return;
  }
  if (!result.ok) {
    if (result.status === 401) window.location.href = "login.html";
    if (result.status === 404) {
      myProjectsList.innerHTML = `<div class="muted">Ваш сервер запущен в старой версии. Перезапустите сервер и обновите страницу.</div>`;
      return;
    }
    myProjectsList.innerHTML = `<div class="muted">Не удалось загрузить ваши проекты.</div>`;
    return;
  }

  const items = Array.isArray(result.data?.items) ? result.data.items : [];
  myProjectsList.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "У вас пока нет проектов. Опубликуйте первый — он появится здесь.";
    myProjectsList.appendChild(empty);
    return;
  }

  const me = getStoredProfile();
  const meName = me?.name ? me.name : "Вы";

  const openProjectEdit = (project) => {
    if (!projectEditModal) return;
    wireModal(projectEditModal);

    const form = document.getElementById("projectEditForm");
    if (!form) return;

    form.elements.id.value = String(project.id);
    form.elements.title.value = String(project.title || "");
    form.elements.body.value = String(project.body || "");
    if (form.elements?.category) form.elements.category.value = project.category ? String(project.category) : "";
    form.elements.tags.value = String(project.tags || "");
    form.elements.budgetMax.value = project.budgetMax == null ? "" : String(project.budgetMax);
    if (form.elements?.dueDate) form.elements.dueDate.value = project.dueDate ? String(project.dueDate) : "";

    openModal(projectEditModal);
  };

  items.forEach((p) => {
    const card = renderProjectCard(p, {
      isOwner: true,
      authorName: meName,
      authorAvatarData: me?.avatarData || "",
      commentTitle: p.title,
      onEdit: openProjectEdit,
      onDelete: async (project) => {
        const resp = await apiFetch(`/api/projects/${project.id}`, { method: "DELETE" });
        if (!resp.ok) {
          if (resp.status === 401) window.location.href = "login.html";
          return;
        }
        await loadMyProjects();
      },
    });

    myProjectsList.appendChild(card);
  });
}

if (myProjectsList) {
  window.__mwRefreshProjectsPage = loadMyProjects;
  loadMyProjects();
}

// 1.21) Проекты: рекомендации снизу (post.html)
const recommendedProjectsList = document.getElementById("recommendedProjectsList");
if (recommendedProjectsList) {
  (async () => {
    try {
      recommendedProjectsList.innerHTML = `<div class="muted">Загрузка…</div>`;
      const result = await apiFetch("/api/projects");
      if (!result.ok) throw new Error("API_UNAVAILABLE");

      const items = Array.isArray(result.data?.items) ? result.data.items : [];
      recommendedProjectsList.innerHTML = "";

      if (!items.length) {
        recommendedProjectsList.innerHTML = `<div class="muted">Пока нет проектов.</div>`;
        return;
      }

      items.slice(0, 20).forEach((p) => {
        const card = renderProjectCard(p, {
          isOwner: false,
          authorName: p.authorName,
          authorRole: p.authorRole,
          authorId: p.authorId,
          commentTitle: p.title,
        });
        recommendedProjectsList.appendChild(card);
      });
    } catch {
      recommendedProjectsList.innerHTML = `<div class="muted">Не удалось загрузить рекомендации. Проверьте, что сервер запущен: node server.js</div>`;
    }
  })();
}

// Редактирование проекта (модалка)
if (projectEditModal) {
  wireModal(projectEditModal);

  const form = document.getElementById("projectEditForm");
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const id = Number(form.elements?.id?.value);
      const title = form.elements?.title?.value?.trim?.() || "";
      const body = form.elements?.body?.value?.trim?.() || "";
      const category = form.elements?.category?.value?.trim?.() || "";
      const tags = form.elements?.tags?.value?.trim?.() || "";
      const budgetMaxRaw = form.elements?.budgetMax?.value;
      const budgetMax = budgetMaxRaw === "" || budgetMaxRaw == null ? null : Number(budgetMaxRaw);
      const dueDate = form.elements?.dueDate?.value || null;

      if (!Number.isFinite(id)) return;
      if (!title) return;
      if (!body) return;

      const resp = await apiFetch(`/api/projects/${id}`, {
        method: "PUT",
        body: {
          title,
          body,
          category,
          tags,
          budgetMin: null,
          budgetMax: Number.isFinite(budgetMax) ? budgetMax : null,
          dueDate: dueDate || null,
        },
      });

      if (!resp.ok) {
        if (resp.status === 401) window.location.href = "login.html";
        return;
      }

      closeModal(projectEditModal);
      await loadMyProjects();
    });
  }
}

// Предпросмотр (модалка)
if (projectPreviewModal) {
  wireModal(projectPreviewModal);
}

const projectForm = document.getElementById("projectForm");
if (projectForm) {
  projectForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = projectForm.elements?.title?.value?.trim?.() || "";
    const body = projectForm.elements?.body?.value?.trim?.() || "";
    const category = projectForm.elements?.category?.value?.trim?.() || "";
    const tags = projectForm.elements?.tags?.value?.trim?.() || "";
    const budgetMaxRaw = projectForm.elements?.budgetMax?.value;
    const budgetMax = budgetMaxRaw == null ? null : Number(budgetMaxRaw);
    const dueDate = projectForm.elements?.dueDate?.value || null;

    if (!title) return;
    if (!body) return;

    const result = await apiFetch("/api/projects", {
      method: "POST",
      body: {
        title,
        body,
        category,
        tags,
        budgetMin: null,
        budgetMax: Number.isFinite(budgetMax) ? budgetMax : null,
        dueDate: dueDate || null,
      },
    });

    if (!result.ok) {
      if (result.status === 401) window.location.href = "login.html";
      return;
    }

    // Остаёмся на странице: проект опубликован, обновляем список «Мои проекты».
    try {
      projectForm.reset();
    } catch {
      // ignore
    }
    await loadMyProjects();
  });

  const previewBtn = projectForm.querySelector("[data-action='preview-project']");
  if (previewBtn && projectPreviewModal) {
    previewBtn.addEventListener("click", () => {
      const title = projectForm.elements?.title?.value?.trim?.() || "Без названия";
      const body = projectForm.elements?.body?.value?.trim?.() || "Описание не заполнено.";
      const category = projectForm.elements?.category?.value?.trim?.() || "";
      const tagsStr = projectForm.elements?.tags?.value?.trim?.() || "";
      const budgetMaxRaw = projectForm.elements?.budgetMax?.value;
      const budgetMax = budgetMaxRaw == null ? null : Number(budgetMaxRaw);
      const dueDate = projectForm.elements?.dueDate?.value || null;

      const wrap = document.getElementById("projectPreviewBody");
      if (!wrap) return;
      wrap.innerHTML = "";

      const card = document.createElement("article");
      card.className = "post-card";

      const h3 = document.createElement("h3");
      h3.textContent = title;

      const p = document.createElement("p");
      p.textContent = body;

      const tags = document.createElement("div");
      tags.className = "post-tags";

      const categoryLabel = String(category || "").trim();
      if (categoryLabel) {
        const tag = document.createElement("span");
        tag.className = "chip";
        tag.textContent = categoryLabel;
        tags.appendChild(tag);
      }

      if (tagsStr) {
        tagsStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 8)
          .forEach((t) => {
            const tag = document.createElement("span");
            tag.className = "chip";
            tag.textContent = t;
            tags.appendChild(tag);
          });
      }

      const footer = document.createElement("div");
      footer.className = "post-footer";
      const budgetWrap = document.createElement("div");
      budgetWrap.className = "budget-wrap";

      const budget = document.createElement("div");
      budget.className = "budget";
      budget.textContent = formatBudget(null, Number.isFinite(budgetMax) ? budgetMax : null);
      budgetWrap.appendChild(budget);

      const due = formatDueDate(dueDate);
      if (due) {
        const dueEl = document.createElement("div");
        dueEl.className = "budget-meta";
        dueEl.textContent = `Срок: ${due}`;
        budgetWrap.appendChild(dueEl);
      }

      footer.appendChild(budgetWrap);

      card.appendChild(h3);
      card.appendChild(p);
      if (tags.childElementCount) card.appendChild(tags);
      card.appendChild(footer);

      wrap.appendChild(card);
      openModal(projectPreviewModal);
    });
  }
}

// 1.2) Публичный профиль другого пользователя (user.html?id=...)
// 1.25) Профиль: мои проекты (без фейков)
const userProjectsList = document.getElementById("userProjectsList");
const userPostsList = document.getElementById("userPostsList");
if (userProjectsList) {
  (async () => {
    const params = new URLSearchParams(window.location.search);
    const userId = Number(params.get("id"));

    if (!Number.isFinite(userId)) {
      userProjectsList.innerHTML = `<div class="muted">Профиль не найден.</div>`;
      if (userPostsList) userPostsList.innerHTML = `<div class="muted">Профиль не найден.</div>`;
      return;
    }

    if (currentUserId != null && Number(currentUserId) === userId) {
      window.location.replace("profile.html");
      return;
    }

    const info = await apiFetch(`/api/users/${userId}`);
    if (!info.ok) {
      userProjectsList.innerHTML = `<div class="muted">Профиль не найден.</div>`;
      if (userPostsList) userPostsList.innerHTML = `<div class="muted">Профиль не найден.</div>`;
      return;
    }

    const user = info.data?.user || {};
    const stats = info.data?.stats || {};
    const name = String(user.name || "Пользователь");
    const role = String(user.role || "");
    const bio = String(user.bio || "").trim();

    const nameEl = document.getElementById("userName");
    const usernameEl = document.getElementById("userUsername");
    const roleEl = document.getElementById("userRole");
    const bioEl = document.getElementById("userBio");
    const avatarEl = document.getElementById("userAvatar");
    const coverEl = document.getElementById("userCover");
    const regEl = document.getElementById("userStatRegistered");
    const followingEl = document.getElementById("userStatFollowing");
    const followersEl = document.getElementById("userStatFollowers");

    if (nameEl) nameEl.textContent = name;
    if (usernameEl) usernameEl.textContent = `@mw${userId}`;
    if (roleEl) roleEl.textContent = role;
    if (bioEl) bioEl.textContent = bio || "Пользователь пока ничего не рассказал о себе.";
    setAvatarVisual(avatarEl, name, user.avatarData, "?");

    if (coverEl) {
      const coverData = String(user.coverData || "").trim();
      if (coverData) {
        coverEl.style.backgroundImage = `url('${coverData}')`;
        coverEl.style.backgroundSize = "cover";
        coverEl.style.backgroundPosition = "center";
      } else {
        coverEl.style.backgroundImage = "";
        coverEl.style.backgroundSize = "";
        coverEl.style.backgroundPosition = "";
      }
    }

    if (followingEl) followingEl.textContent = String(Number(stats.following || 0));
    if (followersEl) followersEl.textContent = String(Number(stats.followers || 0));
    if (regEl) {
      const dt = user?.createdAt ? new Date(Number(user.createdAt)) : null;
      regEl.textContent =
        dt && !Number.isNaN(dt.getTime()) ? dt.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }) : "-";
    }

    const followBtn = document.getElementById("userFollowBtn");
    if (followBtn) {
      followBtn.setAttribute("data-toggle", "follow");
      followBtn.setAttribute("data-user-id", String(userId));
      const following = Boolean(info.data?.isFollowing);
      followBtn.classList.toggle("is-following", following);
      followBtn.textContent = following ? "Вы подписаны" : "Подписаться";
      bindFollowButton(followBtn);
    }

    const messageBtn = document.getElementById("userMessageBtn");
    if (messageBtn) messageBtn.href = `messages.html?userId=${encodeURIComponent(String(userId))}`;

    userProjectsList.innerHTML = `<div class="muted">Загрузка…</div>`;
    if (userPostsList) userPostsList.innerHTML = `<div class="muted">Загрузка…</div>`;

    const [projectsResp, postsResp] = await Promise.all([
      apiFetch(`/api/users/${userId}/projects`),
      apiFetch(`/api/users/${userId}/posts`),
    ]);

    if (!projectsResp.ok) {
      userProjectsList.innerHTML = `<div class="muted">Не удалось загрузить проекты.</div>`;
    } else {
      const projects = Array.isArray(projectsResp.data?.items) ? projectsResp.data.items : [];
      userProjectsList.innerHTML = "";
      if (!projects.length) userProjectsList.innerHTML = `<div class="profile-empty">Пока нет проектов</div>`;
      else {
        projects.forEach((p) => {
          const card = renderProjectCard(p, {
            isOwner: false,
            authorName: name,
            authorRole: role,
            authorId: userId,
            authorAvatarData: user.avatarData || "",
            commentTitle: p.title,
          });
          userProjectsList.appendChild(card);
        });
      }
    }

    if (userPostsList) {
      if (!postsResp.ok) {
        userPostsList.innerHTML = `<div class="muted">Не удалось загрузить посты.</div>`;
      } else {
        const posts = Array.isArray(postsResp.data?.items) ? postsResp.data.items : [];
        renderPostsInto(userPostsList, posts);
      }
    }
  })();
}

const profileProjectsList = document.getElementById("profileProjectsList");
if (profileProjectsList) {
  const loadProfileProjects = async () => {
    profileProjectsList.innerHTML = `<div class="muted">Загрузка…</div>`;

    const result = await apiFetch("/api/my/projects");
    if (!result.ok) {
      if (result.status === 401) window.location.href = "login.html";
      profileProjectsList.innerHTML = `<div class="muted">Не удалось загрузить проекты.</div>`;
      return;
    }

    const items = Array.isArray(result.data?.items) ? result.data.items : [];
    profileProjectsList.innerHTML = "";

    if (!items.length) {
      profileProjectsList.innerHTML = `<div class="profile-empty">Пока нет проектов</div>`;
      return;
    }

    const me = getStoredProfile() || {};
    const meName = me?.name ? String(me.name) : "Вы";
    const meRole = me?.role ? String(me.role) : "";

    items.slice(0, 20).forEach((p) => {
      const card = renderProjectCard(p, {
        isOwner: true,
        authorName: meName,
        authorRole: meRole,
        authorId: currentUserId,
        authorAvatarData: me?.avatarData || "",
        commentTitle: p.title,
        onEdit: () => { window.location.href = "post.html"; },
        onDelete: async (project) => {
          const resp = await apiFetch(`/api/projects/${project.id}`, { method: "DELETE" });
          if (!resp.ok) {
            if (resp.status === 401) window.location.href = "login.html";
            return;
          }
          await loadProfileProjects();
        },
      });
      profileProjectsList.appendChild(card);
    });
  };

  window.__mwLoadMyProjectsProfile = loadProfileProjects;
  loadProfileProjects();
}
// 1.26) Профиль: мои посты
const profilePostsList = document.getElementById("profilePostsList");
if (profilePostsList) {
  const renderMyPosts = (items) => {
    profilePostsList.innerHTML = "";

    if (!items.length) {
      profilePostsList.innerHTML = `<div class="profile-empty">Пока нет постов</div>`;
      return;
    }

    const me = getStoredProfile() || {};
    const meName = me?.name ? String(me.name) : "Вы";
    const initials = getInitials(meName) || "Я";
    const avatarData = me?.avatarData ? String(me.avatarData).trim() : "";

    const setProfileHint = (text) => {
      const el = document.getElementById("postComposerHint");
      if (!el) return;
      el.textContent = String(text || "");
    };

    const ensurePostMenuGlobalClose = () => {
      if (document.body.dataset.postMenuCloseWired === "1") return;
      document.body.dataset.postMenuCloseWired = "1";

      document.addEventListener("click", (event) => {
        document.querySelectorAll(".post-menu.is-open").forEach((menu) => {
          if (menu.contains(event.target)) return;
          menu.classList.remove("is-open");
          const btn = menu.querySelector("button[aria-expanded]");
          if (btn) btn.setAttribute("aria-expanded", "false");
        });
      });

      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        document.querySelectorAll(".post-menu.is-open").forEach((menu) => {
          menu.classList.remove("is-open");
          const btn = menu.querySelector("button[aria-expanded]");
          if (btn) btn.setAttribute("aria-expanded", "false");
        });
      });
    };

    ensurePostMenuGlobalClose();

    items.slice(0, 20).forEach((p) => {
      const card = document.createElement("article");
      card.className = "post-card";

      const header = document.createElement("div");
      header.className = "post-header";

      const left = document.createElement("div");

      const av = document.createElement("div");
      av.className = "avatar avatar-sm";
      if (avatarData) {
        av.textContent = "";
        av.style.backgroundImage = `url('${avatarData}')`;
        av.style.backgroundSize = "cover";
        av.style.backgroundPosition = "center";
      } else {
        av.textContent = initials;
      }

      const metaWrap = document.createElement("div");
      const author = document.createElement("div");
      author.className = "post-author";
      author.textContent = meName;

      const meta = document.createElement("div");
      meta.className = "post-meta";
      meta.textContent = formatRelativeTime(p.createdAt) || "Публикация";

      metaWrap.appendChild(author);
      metaWrap.appendChild(meta);

      left.appendChild(av);
      left.appendChild(metaWrap);

      const menu = document.createElement("div");
      menu.className = "post-menu";

      const menuBtn = document.createElement("button");
      menuBtn.className = "profile-icon-btn";
      menuBtn.type = "button";
      menuBtn.setAttribute("aria-label", "Меню поста");
      menuBtn.setAttribute("aria-haspopup", "menu");
      menuBtn.setAttribute("aria-expanded", "false");
      menuBtn.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';

      const dropdown = document.createElement("div");
      dropdown.className = "post-menu-dropdown";
      dropdown.setAttribute("role", "menu");

      const editItem = document.createElement("button");
      editItem.className = "menu-item";
      editItem.type = "button";
      editItem.setAttribute("role", "menuitem");
      editItem.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>Редактировать';

      const shareItem = document.createElement("button");
      shareItem.className = "menu-item";
      shareItem.type = "button";
      shareItem.setAttribute("role", "menuitem");
      shareItem.innerHTML = '<i class="fa-solid fa-share-nodes"></i>Поделиться';

      const sep = document.createElement("div");
      sep.className = "menu-sep";
      sep.setAttribute("role", "separator");

      const delItem = document.createElement("button");
      delItem.className = "menu-item is-danger";
      delItem.type = "button";
      delItem.setAttribute("role", "menuitem");
      delItem.innerHTML = '<i class="fa-solid fa-trash"></i>Удалить';

      dropdown.appendChild(editItem);
      dropdown.appendChild(shareItem);
      dropdown.appendChild(sep);
      dropdown.appendChild(delItem);

      menu.appendChild(menuBtn);
      menu.appendChild(dropdown);

      header.appendChild(left);
      header.appendChild(menu);
      card.appendChild(header);

      const body = document.createElement("p");
      body.textContent = String(p.body || "").trim();
      if (body.textContent) card.appendChild(body);

      const imageData = String(p.imageData || "").trim();
      if (imageData) {
        const media = document.createElement("div");
        media.className = "post-media";
        const img = document.createElement("img");
        img.loading = "lazy";
        img.alt = "Изображение";
        img.src = imageData;
        media.appendChild(img);
        card.appendChild(media);
      }

      const footer = document.createElement("div");
      footer.className = "post-footer";

      const actions = document.createElement("div");
      actions.className = "post-actions";

      const likeBtn = document.createElement("button");
      likeBtn.className = "post-action-btn";
      likeBtn.type = "button";
      likeBtn.dataset.ui = "compact";
      likeBtn.setAttribute("data-post-id", String(p.id));
      setLikeButtonUi(likeBtn, Boolean(p.likedByMe), Number(p.likesCount || 0));
      bindPostLikeButton(likeBtn);

      const commentBtn = document.createElement("button");
      commentBtn.className = "post-action-btn";
      commentBtn.type = "button";
      commentBtn.dataset.ui = "compact";
      commentBtn.setAttribute("data-toggle", "comments");
      commentBtn.setAttribute("data-post-id", String(p.id));
      setCommentsButtonUi(commentBtn, Number(p.commentsCount || 0));
      bindPostCommentsButton(commentBtn, { postId: p.id, title: "Пост" });

      const repostBtn = document.createElement("button");
      repostBtn.className = "post-action-btn";
      repostBtn.type = "button";
      repostBtn.dataset.ui = "compact";
      repostBtn.setAttribute("data-repost-type", "post");
      repostBtn.setAttribute("data-repost-id", String(p.id));
      setRepostButtonUi(repostBtn, Boolean(p.repostedByMe), Number(p.repostsCount || 0));
      bindRepostButton(repostBtn);

      actions.appendChild(likeBtn);
      actions.appendChild(commentBtn);
      actions.appendChild(repostBtn);

      const views = document.createElement("div");
      views.className = "post-views muted";
      const viewsIcon = document.createElement("i");
      viewsIcon.className = "fa-regular fa-eye";
      const viewsCount = document.createElement("span");
      const initialViews = Number(p.viewsCount || 0);
      viewsCount.textContent = String(Number.isFinite(initialViews) ? initialViews : 0);
      views.appendChild(viewsIcon);
      views.appendChild(viewsCount);

      footer.appendChild(actions);
      footer.appendChild(views);
      card.appendChild(footer);

      observePostView(card, p.id, viewsCount);

      const closeMenu = () => {
        menu.classList.remove("is-open");
        menuBtn.setAttribute("aria-expanded", "false");
      };

      menuBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = menu.classList.toggle("is-open");
        menuBtn.setAttribute("aria-expanded", String(isOpen));
      });

      editItem.addEventListener("click", () => {
        closeMenu();
        openPostEdit(p);
      });

      shareItem.addEventListener("click", async () => {
        closeMenu();
        const origin = window.location.origin && window.location.origin !== "null" ? window.location.origin : "";
        const url = origin ? `${origin}/index.html#post-${p.id}` : `index.html#post-${p.id}`;
        const text = String(p.body || "").trim();

        try {
          if (navigator.share) {
            await navigator.share({ title: "Moneyway", text: text.slice(0, 200), url });
            setProfileHint("Поделились ссылкой.");
            return;
          }
        } catch {
          // ignore
        }

        try {
          await navigator.clipboard.writeText(url);
          setProfileHint("Ссылка на пост скопирована.");
        } catch {
          setProfileHint("Не удалось скопировать ссылку.");
        }
      });

      delItem.addEventListener("click", async () => {
        closeMenu();
        const ok = window.confirm("Удалить пост? Это действие нельзя отменить.");
        if (!ok) return;

        const resp = await apiFetch(`/api/posts/${p.id}`, { method: "DELETE" });
        if (!resp.ok) {
          if (resp.status === 401) window.location.href = "login.html";
          return;
        }

        try {
          if (typeof window.__mwLoadMyPosts === "function") await window.__mwLoadMyPosts();
        } catch {
          // ignore
        }
        try {
          const list = document.getElementById("homePostsList");
          if (list) await loadPostsInto(list, { limit: 20 });
        } catch {
          // ignore
        }
      });

      profilePostsList.appendChild(card);
    });
  };

  const loadMyPosts = async () => {
    profilePostsList.innerHTML = `<div class="muted">Загрузка…</div>`;

    const result = await apiFetch("/api/my/posts");
    if (!result.ok) {
      if (result.status === 401) window.location.href = "login.html";
      profilePostsList.innerHTML = `<div class="muted">Не удалось загрузить посты.</div>`;
      return;
    }

    const items = Array.isArray(result.data?.items) ? result.data.items : [];
    renderMyPosts(items);
  };

  profilePostsList.dataset.loader = "my-posts";
  window.__mwLoadMyPosts = loadMyPosts;
  loadMyPosts();
}

// 1.26.1) Профиль: понравившиеся
const profileLikesList = document.getElementById("profileLikesList");
if (profileLikesList) {
  const renderMyLikes = (items) => {
    profileLikesList.innerHTML = "";

    if (!items.length) {
      profileLikesList.innerHTML = `<div class="profile-empty">Пока нет понравившихся</div>`;
      return;
    }

    items.slice(0, 50).forEach((x) => {
      const kind = String(x.kind || "").trim();

      const card = document.createElement("article");
      card.className = "post-card";

      const meta = document.createElement("div");
      meta.className = "post-meta muted";

      const likedAt = x.likedAt ? new Date(Number(x.likedAt)) : null;
      const likedTime = likedAt && !Number.isNaN(likedAt.getTime()) ? likedAt.toLocaleString("ru-RU", { day: "2-digit", month: "short" }) : "";

      if (kind === "project") meta.textContent = likedTime ? `Понравился проект · ${likedTime}` : "Понравился проект";
      else meta.textContent = likedTime ? `Понравился пост · ${likedTime}` : "Понравился пост";

      card.appendChild(meta);

      if (kind === "project") {
        const title = document.createElement("h3");
        title.textContent = String(x.title || "").trim();
        if (title.textContent) card.appendChild(title);

        const body = document.createElement("p");
        body.textContent = String(x.body || "").trim();
        if (body.textContent) card.appendChild(body);
      } else {
        const body = document.createElement("p");
        body.textContent = String(x.body || "").trim();
        if (body.textContent) card.appendChild(body);

        const imageData = String(x.imageData || "").trim();
        if (imageData) {
          const media = document.createElement("div");
          media.className = "post-media";
          const img = document.createElement("img");
          img.loading = "lazy";
          img.alt = "Изображение";
          img.src = imageData;
          media.appendChild(img);
          card.appendChild(media);
        }
      }

      profileLikesList.appendChild(card);
    });
  };

  const loadMyLikes = async () => {
    profileLikesList.innerHTML = `<div class="muted">Загрузка…</div>`;

    const result = await apiFetch("/api/my/likes");
    if (!result.ok) {
      if (result.status === 401) window.location.href = "login.html";
      profileLikesList.innerHTML = `<div class="muted">Не удалось загрузить понравившиеся.</div>`;
      return;
    }

    const items = Array.isArray(result.data?.items) ? result.data.items : [];
    renderMyLikes(items);
  };

  window.__mwLoadMyLikes = loadMyLikes;
}

// 1.26.2) Профиль: вкладки
(() => {
  const wrap = document.querySelector(".profile-tabs");
  if (!wrap) return;

  const tabs = Array.from(wrap.querySelectorAll(".profile-tab[data-tab]"));
  const panels = Array.from(document.querySelectorAll(".profile-panel[data-tabpanel]"));
  if (!tabs.length || !panels.length) return;

  const setTab = async (key) => {
    const activeKey = String(key || "").trim();

    tabs.forEach((btn) => {
      const isActive = btn.getAttribute("data-tab") === activeKey;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    panels.forEach((panel) => {
      const isActive = panel.getAttribute("data-tabpanel") === activeKey;
      panel.classList.toggle("is-active", isActive);
      panel.toggleAttribute("hidden", !isActive);
    });

    if (activeKey === "likes") {
      const list = document.getElementById("profileLikesList");
      if (list && list.dataset.loaded !== "1") {
        list.dataset.loaded = "1";
        try {
          if (typeof window.__mwLoadMyLikes === "function") await window.__mwLoadMyLikes();
        } catch {
          // ignore
        }
      }
    }
  };

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.getAttribute("data-tab")));
  });

  // Стартовое состояние (по умолчанию — "Посты")
  const current = tabs.find((t) => t.classList.contains("is-active"))?.getAttribute("data-tab") || "posts";
  setTab(current);
})();

// 1.27) Профиль: репосты
const profileRepostsList = document.getElementById("profileRepostsList");
if (profileRepostsList) {
  (async () => {
    profileRepostsList.innerHTML = `<div class="muted">Загрузка…</div>`;

    const result = await apiFetch("/api/my/reposts");
    if (!result.ok) {
      if (result.status === 401) window.location.href = "login.html";
      profileRepostsList.innerHTML = `<div class="muted">Не удалось загрузить репосты.</div>`;
      return;
    }

    const items = Array.isArray(result.data?.items) ? result.data.items : [];
    profileRepostsList.innerHTML = "";

    if (!items.length) {
      profileRepostsList.innerHTML = `<div class="muted">Пока нет репостов.</div>`;
      return;
    }

    items.slice(0, 20).forEach((x) => {
      if (x.kind === "post") {
        const card = document.createElement("article");
        card.className = "post-card";

        const head = document.createElement("div");
        head.className = "post-meta muted";
        head.textContent = "Репост поста";

        const body = document.createElement("p");
        body.textContent = String(x.body || "").trim();

        card.appendChild(head);
        if (body.textContent) card.appendChild(body);

        const imageData = String(x.imageData || "").trim();
        if (imageData) {
          const media = document.createElement("div");
          media.className = "post-media";
          const img = document.createElement("img");
          img.loading = "lazy";
          img.alt = "Изображение";
          img.src = imageData;
          media.appendChild(img);
          card.appendChild(media);
        }

        profileRepostsList.appendChild(card);
        return;
      }

      const card = document.createElement("article");
      card.className = "post-card";

      const head = document.createElement("div");
      head.className = "post-meta muted";
      head.textContent = "Репост проекта";

      const h3 = document.createElement("h3");
      h3.textContent = x.title || "";

      const body = document.createElement("p");
      body.textContent = x.body || "";

      card.appendChild(head);
      card.appendChild(h3);
      card.appendChild(body);
      profileRepostsList.appendChild(card);
    });
  })();
}

// 2) Вход / регистрация
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showAuthError("");

    if (window.location.protocol === "file:") {
      return showAuthError("Откройте сайт через http://localhost:3000 (сначала запустите: node server.js).");
    }

    const identifier = loginForm.elements?.identifier?.value?.trim?.() || "";
    const password = loginForm.elements?.password?.value || "";
    const remember = Boolean(loginForm.elements?.remember?.checked);

    if (!identifier) return showAuthError("Введите почту или телефон.");
    if (!password) return showAuthError("Введите пароль.");

    let result = null;
    try {
      result = await apiFetch("/api/auth/login", {
        method: "POST",
        body: { identifier, password, remember },
      });
    } catch {
      return showAuthError("Сервер недоступен. Запустите: node server.js");
    }

    if (!result.ok) {
      const code = result.data?.error;
      if (code === "INVALID_CREDENTIALS") return showAuthError("Неверная почта/телефон или пароль.");
      if (code === "EMAIL_OR_PHONE_REQUIRED") return showAuthError("Введите почту или телефон.");
      return showAuthError("Не удалось войти. Попробуйте ещё раз.");
    }

    // Безопасно запомнить только логин (не пароль)
    try {
      localStorage.setItem("mw_last_login", identifier);
    } catch {
      // ignore
    }

    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    window.location.href = next ? next : "index.html";
  });

  // Подставим прошлый логин
  try {
    const last = localStorage.getItem("mw_last_login");
    if (last && loginForm.elements?.identifier) loginForm.elements.identifier.value = last;
  } catch {
    // ignore
  }
}

const registerForm = document.getElementById("registerForm");
if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showAuthError("");

    if (window.location.protocol === "file:") {
      return showAuthError("Откройте сайт через http://localhost:3000 (сначала запустите: node server.js).");
    }

    const name = registerForm.elements?.name?.value?.trim?.() || "";
    const identifier = registerForm.elements?.identifier?.value?.trim?.() || "";
    const password = registerForm.elements?.password?.value || "";
    const role = registerForm.elements?.role?.value?.trim?.() || "";

    if (!name) return showAuthError("Введите имя.");
    if (!identifier) return showAuthError("Введите почту или телефон.");
    if (!password || String(password).length < 8) return showAuthError("Пароль должен быть минимум 8 символов.");

    let result = null;
    try {
      result = await apiFetch("/api/auth/register", {
        method: "POST",
        body: { name, identifier, password, role },
      });
    } catch {
      return showAuthError("Сервер недоступен. Запустите: node server.js");
    }

    if (!result.ok) {
      const code = result.data?.error;
      if (code === "EMAIL_TAKEN") return showAuthError("Эта почта уже занята.");
      if (code === "PHONE_TAKEN") return showAuthError("Этот телефон уже занят.");
      if (code === "PASSWORD_TOO_SHORT") return showAuthError("Пароль должен быть минимум 8 символов.");
      return showAuthError("Не удалось зарегистрироваться. Попробуйте ещё раз.");
    }

    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    window.location.href = next ? next : "index.html";
  });
}

// 3) Лайки/подписки (если есть id — работаем через сервер, иначе оставляем локальный toggling)
function setLikeButtonUi(btn, liked, count) {
  const c = Number(count || 0);
  btn.dataset.count = String(Number.isFinite(c) ? c : 0);
  btn.classList.toggle("is-active", Boolean(liked));
  const compact = btn.dataset.ui === "compact";
  if (compact) {
    btn.innerHTML = `<i class="${liked ? "fa-solid" : "fa-regular"} fa-heart"></i><span class="action-count">${Number(btn.dataset.count)}</span>`;
    return;
  }

  btn.innerHTML = `<i class="${liked ? "fa-solid" : "fa-regular"} fa-heart"></i> Нравится ${Number(btn.dataset.count)}`;
}

function setCommentsButtonUi(btn, count) {
  const c = Number(count || 0);
  btn.dataset.count = String(Number.isFinite(c) ? c : 0);
  const compact = btn.dataset.ui === "compact";
  if (compact) {
    btn.innerHTML = `<i class="fa-regular fa-comment"></i><span class="action-count">${Number(btn.dataset.count)}</span>`;
    return;
  }

  btn.innerHTML = `<i class="fa-regular fa-comment"></i> Комментарии ${Number(btn.dataset.count)}`;
}

function setRepostButtonUi(btn, reposted, count) {
  btn.classList.toggle("is-active", Boolean(reposted));
  const compact = btn.dataset.ui === "compact";
  const c = count == null ? Number(btn.dataset.count || 0) : Number(count || 0);
  if (Number.isFinite(c)) btn.dataset.count = String(c);

  if (compact) {
    btn.innerHTML = `<i class="fa-solid fa-retweet"></i><span class="action-count">${Number(btn.dataset.count || 0)}</span>`;
    return;
  }

  btn.innerHTML = `<i class="fa-solid fa-retweet"></i> ${reposted ? "Убрать репост" : "Репост"}`;
}

function ensurePostEditModal() {
  let modal = document.getElementById("postEditModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "postEditModal";
  modal.setAttribute("aria-hidden", "true");

  modal.innerHTML = `
    <div class="modal-backdrop" data-close-modal></div>
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="postEditTitle">
      <div class="modal-header">
        <h2 id="postEditTitle">Редактировать пост</h2>
        <button class="btn btn-ghost" type="button" aria-label="Закрыть" data-close-modal><i class="fa-solid fa-xmark"></i></button>
      </div>

      <div class="muted" id="postEditHint"></div>

      <form id="postEditForm">
        <input type="hidden" name="id" />
        <label>
          Текст
          <textarea name="body" rows="5" placeholder="Текст поста"></textarea>
        </label>

        <div class="composer">
          <div class="composer-preview" id="postEditPreview"></div>
          <div class="composer-actions">
            <input class="composer-file" type="file" name="image" accept="image/*" />
            <button class="btn btn-ghost" type="button" data-action="attach-edit">
              <i class="fa-solid fa-paperclip"></i> Прикрепить
            </button>
            <button class="btn btn-primary" type="submit">Сохранить</button>
            <button class="btn btn-ghost" type="button" data-close-modal>Отмена</button>
          </div>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  wireModal(modal);

  return modal;
}

function openPostEdit(post) {
  const id = Number(post?.id);
  if (!Number.isFinite(id)) return;

  const modal = ensurePostEditModal();
  const hint = modal.querySelector("#postEditHint");
  const form = modal.querySelector("#postEditForm");
  const preview = modal.querySelector("#postEditPreview");
  const attachBtn = modal.querySelector("[data-action='attach-edit']");
  const imageInput = form?.elements?.image;

  if (!form) return;

  // Состояние картинки: keep | remove | replace
  modal.dataset.imageMode = "keep";
  modal.dataset.imageData = "";

  const setHint = (text) => {
    if (!hint) return;
    hint.textContent = String(text || "");
  };

  const setPreview = (dataUrl) => {
    if (!preview) return;
    preview.innerHTML = "";
    if (!dataUrl) return;

    const box = document.createElement("div");
    box.className = "composer-preview-box";

    const img = document.createElement("img");
    img.alt = "Предпросмотр";
    img.src = dataUrl;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "composer-remove";
    remove.setAttribute("aria-label", "Убрать изображение");
    remove.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    remove.addEventListener("click", () => {
      modal.dataset.imageMode = "remove";
      modal.dataset.imageData = "";
      try {
        if (imageInput) imageInput.value = "";
      } catch {
        // ignore
      }
      setPreview(null);
    });

    box.appendChild(img);
    box.appendChild(remove);
    preview.appendChild(box);
  };

  // Заполняем форму
  form.elements.id.value = String(id);
  form.elements.body.value = String(post?.body || "");
  setHint("");

  const existingImage = String(post?.imageData || "").trim();
  if (existingImage) setPreview(existingImage);
  else setPreview(null);

  if (attachBtn && imageInput && attachBtn.dataset.bound !== "1") {
    attachBtn.dataset.bound = "1";
    attachBtn.addEventListener("click", () => imageInput.click());
  }

  if (imageInput && imageInput.dataset.bound !== "1") {
    imageInput.dataset.bound = "1";
    imageInput.addEventListener("change", async () => {
      const file = imageInput.files && imageInput.files[0] ? imageInput.files[0] : null;
      if (!file) return;
      if (!/^image\//.test(file.type)) return;
      if (file.size > 1_200_000) {
        setHint("Картинка слишком большая. Выберите файл до 1.2 МБ.");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl) return;
        modal.dataset.imageMode = "replace";
        modal.dataset.imageData = dataUrl;
        setPreview(dataUrl);
        setHint("");
      };
      reader.readAsDataURL(file);
    });
  }

  if (form.dataset.bound !== "1") {
    form.dataset.bound = "1";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const postId = Number(form.elements?.id?.value);
      if (!Number.isFinite(postId)) return;

      const body = form.elements?.body?.value?.trim?.() || "";
      const mode = String(modal.dataset.imageMode || "keep");
      const imageData = String(modal.dataset.imageData || "");

      const payload = { body };
      if (mode === "remove") payload.imageData = "";
      if (mode === "replace") payload.imageData = imageData;

      const result = await apiFetch(`/api/posts/${postId}`, { method: "PUT", body: payload });
      if (!result.ok) {
        if (result.status === 401) window.location.href = "login.html";
        setHint("Не удалось сохранить изменения.");
        return;
      }

      closeModal(modal);
      try {
        if (typeof window.__mwLoadMyPosts === "function") await window.__mwLoadMyPosts();
      } catch {
        // ignore
      }
      try {
        const list = document.getElementById("homePostsList");
        if (list) await loadPostsInto(list, { limit: 20 });
      } catch {
        // ignore
      }
    });
  }

  openModal(modal);
}

function bindLikeButton(btn) {
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  btn.addEventListener("click", async () => {
    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";

    const projectId = btn.getAttribute("data-project-id");
    const wasLiked = btn.classList.contains("is-active");
    const prevCount = Number(btn.dataset.count || 0);

    btn.disabled = true;
    try {
      if (projectId) {
        const result = await apiFetch(`/api/like/${projectId}`, { method: "POST" });
        if (!result.ok) {
          if (result.status === 401) window.location.href = "login.html";
          return;
        }
        const nowLiked = Boolean(result.data?.liked);

        // Счётчик берём с сервера, чтобы не "крутить" лайки после перезагрузки/смены аккаунта.
        const serverCount = Number(result.data?.likesCount);
        const nextCount = Number.isFinite(serverCount)
          ? serverCount
          : nowLiked === wasLiked
            ? prevCount
            : prevCount + (nowLiked ? 1 : -1);

        setLikeButtonUi(btn, nowLiked, Math.max(0, nextCount));
      } else {
        const nowLiked = !wasLiked;
        const nextCount = prevCount + (nowLiked ? 1 : -1);
        setLikeButtonUi(btn, nowLiked, Math.max(0, nextCount));
      }
    } finally {
      btn.disabled = false;
      btn.dataset.busy = "0";
    }
  });
}

function bindPostLikeButton(btn) {
  if (!btn || btn.dataset.boundPostLike === "1") return;
  btn.dataset.boundPostLike = "1";

  btn.addEventListener("click", async () => {
    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";
    btn.disabled = true;

    const postId = btn.getAttribute("data-post-id");
    const wasLiked = btn.classList.contains("is-active");
    const prevCount = Number(btn.dataset.count || 0);

    try {
      const result = await apiFetch(`/api/post-like/${postId}`, { method: "POST" });
      if (!result.ok) {
        if (result.status === 401) window.location.href = "login.html";
        return;
      }

      const nowLiked = Boolean(result.data?.liked);
      const serverCount = Number(result.data?.likesCount);
      const nextCount = Number.isFinite(serverCount)
        ? serverCount
        : nowLiked === wasLiked
          ? prevCount
          : prevCount + (nowLiked ? 1 : -1);

      setLikeButtonUi(btn, nowLiked, Math.max(0, nextCount));
    } finally {
      btn.disabled = false;
      btn.dataset.busy = "0";
    }
  });
}

function bindRepostButton(btn) {
  if (!btn || btn.dataset.boundRepost === "1") return;
  btn.dataset.boundRepost = "1";

  btn.addEventListener("click", async () => {
    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";
    btn.disabled = true;

    const type = String(btn.getAttribute("data-repost-type") || "").trim();
    const id = btn.getAttribute("data-repost-id");

    try {
      const result = await apiFetch("/api/repost", { method: "POST", body: { type, id: Number(id) } });
      if (!result.ok) {
        if (result.status === 401) window.location.href = "login.html";
        return;
      }
      setRepostButtonUi(btn, Boolean(result.data?.reposted), result.data?.repostsCount);
    } finally {
      btn.disabled = false;
      btn.dataset.busy = "0";
    }
  });
}

function ensureCommentsModal() {
  let modal = document.getElementById("commentsModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "commentsModal";
  modal.setAttribute("aria-hidden", "true");

  modal.innerHTML = `
    <div class="modal-backdrop" data-close-modal></div>
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="commentsTitle">
      <div class="modal-header">
        <h2 id="commentsTitle">Комментарии</h2>
        <button class="btn btn-ghost" type="button" aria-label="Закрыть" data-close-modal><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="muted" id="commentsSubtitle"></div>
      <div class="comments-list" id="commentsList"></div>
      <form class="comment-form" id="commentForm">
        <label>
          Ваш комментарий
          <textarea name="body" rows="3" placeholder="Напишите комментарий…"></textarea>
        </label>
        <div class="modal-actions">
          <button class="btn btn-ghost" type="button" data-close-modal>Закрыть</button>
          <button class="btn btn-primary" type="submit">Отправить</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  wireModal(modal);
  return modal;
}

async function openCommentsFor(kind, targetId, title) {
  const safeKind = kind === "post" ? "post" : "project";
  const id = Number(targetId);
  if (!Number.isFinite(id)) return;

  const modal = ensureCommentsModal();
  const titleEl = modal.querySelector("#commentsTitle");
  const subtitleEl = modal.querySelector("#commentsSubtitle");
  const listEl = modal.querySelector("#commentsList");
  const form = modal.querySelector("#commentForm");

  modal.dataset.targetKind = safeKind;
  modal.dataset.targetId = String(id);
  modal.dataset.targetTitle = String(title || (safeKind === "post" ? "Пост" : "Проект"));

  if (titleEl) titleEl.textContent = "Комментарии";
  if (subtitleEl) subtitleEl.textContent = String(title || (safeKind === "post" ? "Пост" : "Проект"));

  if (listEl) listEl.innerHTML = `<div class="muted">Загрузка…</div>`;

  openModal(modal);

  const refresh = async () => {
    const k = String(modal.dataset.targetKind || "project");
    const tid = Number(modal.dataset.targetId);
    if (!Number.isFinite(tid)) return;

    const url = k === "post" ? `/api/posts/${tid}/comments` : `/api/projects/${tid}/comments`;
    const result = await apiFetch(url);
    if (!result.ok) {
      if (listEl) listEl.innerHTML = `<div class="muted">Не удалось загрузить комментарии.</div>`;
      return;
    }

    const items = Array.isArray(result.data?.items) ? result.data.items : [];
    if (listEl) listEl.innerHTML = "";

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "Пока нет комментариев. Будьте первым.";
      listEl?.appendChild(empty);
    } else {
      items.forEach((c) => {
        const item = document.createElement("div");
        item.className = "comment-item";

        const head = document.createElement("div");
        head.className = "comment-head";

        const author = document.createElement("div");
        author.className = "comment-author";
        author.textContent = c.authorName || "Пользователь";

        const time = document.createElement("div");
        time.className = "comment-time";
        const dt = c.createdAt ? new Date(Number(c.createdAt)) : null;
        time.textContent = dt ? dt.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

        head.appendChild(author);
        head.appendChild(time);

        const bodyEl = document.createElement("div");
        bodyEl.textContent = c.body || "";

        item.appendChild(head);
        item.appendChild(bodyEl);
        listEl?.appendChild(item);
      });
    }

    // Синхронизируем счётчик на всех кнопках комментариев для этой сущности
    const selector =
      k === "post"
        ? `[data-toggle="comments"][data-post-id="${tid}"]`
        : `[data-toggle="comments"][data-project-id="${tid}"]`;
    document.querySelectorAll(selector).forEach((btn) => setCommentsButtonUi(btn, items.length));
  };

  await refresh();

  if (form && form.dataset.bound !== "1") {
    form.dataset.bound = "1";

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const textarea = form.elements?.body;
      const body = textarea?.value?.trim?.() || "";
      if (!body) return;

      const k = String(modal.dataset.targetKind || "project");
      const tid = Number(modal.dataset.targetId);
      if (!Number.isFinite(tid)) return;

      const url = k === "post" ? `/api/posts/${tid}/comments` : `/api/projects/${tid}/comments`;
      const result = await apiFetch(url, { method: "POST", body: { body } });
      if (!result.ok) {
        if (result.status === 401) window.location.href = "login.html";
        return;
      }

      try {
        textarea.value = "";
      } catch {
        // ignore
      }
      await refresh();
    });
  }
}

async function openComments(projectId, title) {
  return openCommentsFor("project", projectId, title);
}

function bindCommentsButton(btn, ctx = {}) {
  if (!btn || btn.dataset.boundComments === "1") return;
  btn.dataset.boundComments = "1";

  btn.addEventListener("click", async () => {
    const projectId = btn.getAttribute("data-project-id") || ctx.projectId;
    const title = ctx.title || btn.getAttribute("data-project-title") || "Проект";
    await openComments(projectId, title);
  });
}

function bindPostCommentsButton(btn, ctx = {}) {
  if (!btn || btn.dataset.boundPostComments === "1") return;
  btn.dataset.boundPostComments = "1";

  btn.addEventListener("click", async () => {
    const idRaw = btn.getAttribute("data-post-id") || ctx.postId;
    await openCommentsFor("post", idRaw, ctx.title || "Пост");
  });
}

function bindFollowButton(btn) {
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  btn.addEventListener("click", async () => {
    const userId = btn.getAttribute("data-user-id");

    if (userId) {
      const result = await apiFetch(`/api/follow/${userId}`, { method: "POST" });
      if (!result.ok) {
        if (result.status === 401) window.location.href = "login.html";
        return;
      }

      const following = Boolean(result.data?.following);
      btn.classList.toggle("is-following", following);
      btn.textContent = following ? "Вы подписаны" : "Подписаться";
      return;
    }

    const isFollowing = btn.classList.toggle("is-following");
    btn.textContent = isFollowing ? "Вы подписаны" : "Подписаться";
  });
}

document.querySelectorAll("[data-toggle='like']").forEach(bindLikeButton);
document.querySelectorAll("[data-toggle='follow']").forEach(bindFollowButton);
document.querySelectorAll("[data-toggle='comments'][data-project-id]").forEach((btn) => bindCommentsButton(btn));
document.querySelectorAll("[data-toggle='comments'][data-post-id]").forEach((btn) => bindPostCommentsButton(btn));

const chips = document.querySelectorAll(".chip");
chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    const group = chip.parentElement;
    if (!group) return;

    group.querySelectorAll(".chip").forEach((sibling) => {
      sibling.classList.remove("is-active");
    });

    chip.classList.add("is-active");
  });
});

const range = document.querySelector("[data-range='budget']");
const rangeValue = document.querySelector("[data-range-value]");
if (range && rangeValue) {
  const updateRange = () => {
    const value = Number(range.value || 0);
    rangeValue.textContent = `${value.toLocaleString("ru-RU")} ₽`;
  };

  range.addEventListener("input", updateRange);
  updateRange();
}

const chatForm = document.getElementById("chatForm");
const chatMessage = document.getElementById("chatMessage");
const chatThread = document.getElementById("chatThread");
if (chatForm && chatMessage && chatThread) {
  const dialogsList = document.getElementById("dialogsList");
  const dialogsEmpty = document.getElementById("dialogsEmpty");
  const chatName = document.getElementById("chatName");
  const chatStatus = document.getElementById("chatStatus");

  let activeConversationId = null;
  let pollTimer = null;
  let lastMessageId = 0;

  const setChatEmpty = (text) => {
    chatThread.innerHTML = `<div class="muted">${text}</div>`;
  };

  const ensureMe = async () => {
    if (currentUserId != null) return;
    const me = await apiFetch("/api/me");
    if (me.ok) currentUserId = Number(me.data?.user?.id);
  };

  const renderTime = (ts) => {
    const d = ts ? new Date(Number(ts)) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  };

  const renderRelative = (ts) => {
    const d = ts ? new Date(Number(ts)) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    const diff = Date.now() - d.getTime();
    if (diff < 60 * 1000) return "только что";
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} мин`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} ч`;
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
  };

  const renderDialogs = (items) => {
    if (!dialogsList) return;
    dialogsList.innerHTML = "";

    if (!items.length) {
      if (dialogsEmpty) dialogsEmpty.style.display = "";
      return;
    }

    if (dialogsEmpty) dialogsEmpty.style.display = "none";

    items.forEach((c) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "conversation";
      row.dataset.conversationId = String(c.id);

      const av = document.createElement("div");
      av.className = "avatar";
      av.textContent = getInitials(c.peerName) || "?";

      const meta = document.createElement("div");
      const name = document.createElement("div");
      name.className = "conversation-name";
      name.textContent = c.peerName || "Пользователь";

      const prev = document.createElement("div");
      prev.className = "conversation-preview";
      prev.textContent = c.lastBody ? String(c.lastBody).slice(0, 80) : "Нет сообщений";

      meta.appendChild(name);
      meta.appendChild(prev);

      const time = document.createElement("span");
      time.className = "conversation-time";
      time.textContent = renderRelative(c.lastAt || c.createdAt);

      row.appendChild(av);
      row.appendChild(meta);
      row.appendChild(time);

      row.addEventListener("click", async () => {
        await openConversation(Number(c.id), c);
      });

      dialogsList.appendChild(row);
    });
  };

  const renderMessages = (items) => {
    chatThread.innerHTML = "";
    lastMessageId = 0;

    if (!items.length) {
      setChatEmpty("Пока нет сообщений. Напишите первым.");
      return;
    }

    items.forEach((m) => {
      const outgoing = currentUserId != null && Number(m.senderId) === Number(currentUserId);
      const bubble = document.createElement("div");
      bubble.className = `chat-bubble ${outgoing ? "outgoing" : "incoming"}`;
      bubble.append(document.createTextNode(m.body || ""));

      const time = document.createElement("span");
      time.className = "chat-time";
      time.textContent = renderTime(m.createdAt);
      bubble.appendChild(time);

      chatThread.appendChild(bubble);
      lastMessageId = Math.max(lastMessageId, Number(m.id || 0));
    });

    chatThread.scrollTop = chatThread.scrollHeight;
  };

  const appendMessages = (items) => {
    if (!items || !items.length) return;

    if (chatThread.children.length === 1 && chatThread.firstElementChild?.classList?.contains("muted")) {
      chatThread.innerHTML = "";
    }

    const nearBottom = chatThread.scrollHeight - chatThread.scrollTop - chatThread.clientHeight < 140;

    items.forEach((m) => {
      const outgoing = currentUserId != null && Number(m.senderId) === Number(currentUserId);
      const bubble = document.createElement("div");
      bubble.className = `chat-bubble ${outgoing ? "outgoing" : "incoming"}`;
      bubble.append(document.createTextNode(m.body || ""));

      const time = document.createElement("span");
      time.className = "chat-time";
      time.textContent = renderTime(m.createdAt);
      bubble.appendChild(time);

      chatThread.appendChild(bubble);
      lastMessageId = Math.max(lastMessageId, Number(m.id || 0));
    });

    if (nearBottom) chatThread.scrollTop = chatThread.scrollHeight;
  };

  const stopPolling = () => {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
  };

  const startPolling = () => {
    stopPolling();
    if (!activeConversationId) return;

    pollTimer = setInterval(async () => {
      const convId = activeConversationId;
      if (!convId) return;

      await ensureMe();

      const result = await apiFetch(
        `/api/conversations/${convId}/messages?afterId=${encodeURIComponent(String(lastMessageId || 0))}&markRead=1`,
      );
      if (!result.ok) {
        if (result.status === 401) window.location.href = "login.html";
        return;
      }
      if (activeConversationId !== convId) return;

      const items = Array.isArray(result.data?.items) ? result.data.items : [];
      appendMessages(items);
      if (items.length) await loadDialogs();
    }, 1200);
  };

  const loadDialogs = async () => {
    try {
      const result = await apiFetch("/api/conversations");
      if (!result.ok) {
        if (result.status === 401) window.location.href = "login.html";
        renderDialogs([]);
        return [];
      }
      const items = Array.isArray(result.data?.items) ? result.data.items : [];
      renderDialogs(items);
      return items;
    } catch {
      renderDialogs([]);
      return [];
    }
  };

  const openConversation = async (conversationId, c) => {
    stopPolling();
    activeConversationId = Number(conversationId);
    lastMessageId = 0;

    const title = c?.peerName || c?.name || "Диалог";
    const subtitle = c?.peerRole || c?.role || "";
    if (chatName) chatName.textContent = title;
    if (chatStatus) chatStatus.textContent = subtitle;

    setChatEmpty("Загрузка…");

    await ensureMe();
    const result = await apiFetch(`/api/conversations/${activeConversationId}/messages?markRead=1`);
    if (!result.ok) {
      if (result.status === 401) window.location.href = "login.html";
      setChatEmpty("Не удалось загрузить сообщения.");
      return;
    }

    const items = Array.isArray(result.data?.items) ? result.data.items : [];
    renderMessages(items);
    startPolling();
  };

  (async () => {
    const params = new URLSearchParams(window.location.search);
    const targetUserId = Number(params.get("userId"));

    await loadDialogs();

    if (Number.isFinite(targetUserId)) {
      const result = await apiFetch(`/api/conversations/with/${targetUserId}`, { method: "POST" });
      if (result.ok) {
        const items = await loadDialogs();
        const convId = Number(result.data?.id);
        const conv = items.find((x) => Number(x.id) === convId);
        await openConversation(convId, conv || result.data?.peer);
        return;
      }
      if (result.status === 401) window.location.href = "login.html";
      setChatEmpty("Не удалось открыть диалог.");
      return;
    }

    setChatEmpty("Выберите диалог слева.");
  })();

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const text = chatMessage.value.trim();
    if (!text) return;
    if (!activeConversationId) return;

    const result = await apiFetch(`/api/conversations/${activeConversationId}/messages`, {
      method: "POST",
      body: { body: text },
    });

    if (!result.ok) {
      if (result.status === 401) window.location.href = "login.html";
      return;
    }

    chatMessage.value = "";

    const reload = await apiFetch(
      `/api/conversations/${activeConversationId}/messages?afterId=${encodeURIComponent(String(lastMessageId || 0))}&markRead=1`,
    );
    if (reload.ok) {
      const items = Array.isArray(reload.data?.items) ? reload.data.items : [];
      appendMessages(items);
    }

    await loadDialogs();
  });

  // Поиск людей для начала диалога
  window.addEventListener("beforeunload", () => stopPolling());

  const peopleSearch = document.getElementById("peopleSearch");
  const peopleResults = document.getElementById("peopleResults");
  if (peopleSearch && peopleResults) {
    let timer = null;
    let lastQuery = "";

    const renderEmpty = (text) => {
      peopleResults.innerHTML = `<div class="muted">${text}</div>`;
      peopleResults.classList.add("is-visible");
    };

    const renderList = (items) => {
      peopleResults.innerHTML = "";
      if (!items.length) return renderEmpty("Ничего не найдено.");

      items.forEach((u) => {
        const row = document.createElement("div");
        row.className = "people-item";

        const av = document.createElement("div");
        av.className = "avatar";
        av.textContent = getInitials(u.name) || "?";

        const meta = document.createElement("div");
        const name = document.createElement("div");
        name.className = "people-name";
        name.textContent = u.name || "Пользователь";

        const role = document.createElement("div");
        role.className = "people-role";
        role.textContent = u.role || "";

        const actions = document.createElement("div");
        actions.className = "people-actions";

        const openProfile = document.createElement("a");
        openProfile.className = "btn btn-ghost";
        openProfile.href = `user.html?id=${encodeURIComponent(String(u.id))}`;
        openProfile.textContent = "Профиль";

        const write = document.createElement("button");
        write.className = "btn btn-primary";
        write.type = "button";
        write.textContent = "Написать";

        write.addEventListener("click", async () => {
          const result = await apiFetch(`/api/conversations/with/${u.id}`, { method: "POST" });
          if (!result.ok) {
            if (result.status === 401) window.location.href = "login.html";
            return;
          }
          await loadDialogs();
          setChatEmpty("Открываем диалог…");
          await openConversation(Number(result.data?.id), { peerName: u.name, peerRole: u.role });
          peopleResults.classList.remove("is-visible");
          try {
            peopleSearch.value = "";
          } catch {
            // ignore
          }
        });

        actions.appendChild(openProfile);
        actions.appendChild(write);

        meta.appendChild(name);
        meta.appendChild(role);
        meta.appendChild(actions);

        row.appendChild(av);
        row.appendChild(meta);

        peopleResults.appendChild(row);
      });

      peopleResults.classList.add("is-visible");
    };

    const runSearch = async (q) => {
      if (!q) {
        peopleResults.classList.remove("is-visible");
        peopleResults.innerHTML = "";
        return;
      }

      if (!document.body.classList.contains("is-authed")) {
        renderEmpty("Войдите, чтобы искать людей.");
        return;
      }

      peopleResults.innerHTML = `<div class="muted">Поиск…</div>`;
      peopleResults.classList.add("is-visible");

      const result = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (!result.ok) {
        if (result.status === 401) window.location.href = "login.html";
        renderEmpty("Не удалось выполнить поиск.");
        return;
      }

      const items = Array.isArray(result.data?.items) ? result.data.items : [];
      renderList(items);
    };

    peopleSearch.addEventListener("input", () => {
      const q = peopleSearch.value.trim();
      lastQuery = q;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => runSearch(lastQuery), 250);
    });

    document.addEventListener("click", (event) => {
      if (peopleResults.contains(event.target) || peopleSearch.contains(event.target)) return;
      peopleResults.classList.remove("is-visible");
    });
  }
}

// 4) Меню профиля (в шапке)
const profileMenus = document.querySelectorAll("[data-profile-menu]");
profileMenus.forEach((menu) => {
  const button = menu.querySelector("[data-profile-menu-button]");
  const dropdown = menu.querySelector("[data-profile-menu-dropdown]");
  if (!button || !dropdown) return;

  const closeMenu = () => {
    menu.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
  };

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("click", (event) => {
    if (menu.contains(event.target)) return;
    closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeMenu();
  });

  dropdown.addEventListener("click", async (event) => {
    const actionEl = event.target.closest("[data-action]");
    const linkEl = event.target.closest("a.menu-item");

    if (linkEl) {
      closeMenu();
      return;
    }

    if (!actionEl) return;

    const action = actionEl.getAttribute("data-action");
    closeMenu();

    if (action === "logout") {
      try {
        await apiFetch("/api/auth/logout", { method: "POST" });
      } catch {
        // ignore
      }
      clearStoredProfile();
      stopBadgesPolling();
      window.location.href = "login.html";
      return;
    }

    if (action === "switch-account") {
      try {
        await apiFetch("/api/auth/logout", { method: "POST" });
      } catch {
        // ignore
      }
      clearStoredProfile();
      stopBadgesPolling();
      window.location.href = "login.html";
    }
  });
});

// 5) Редактирование профиля (модалка) — сохраняем в общую БД
const editProfileModal = document.getElementById("editProfileModal");
const editProfileButtons = document.querySelectorAll("[data-action='edit-profile']");
if (editProfileModal && editProfileButtons.length) {
  const form = document.getElementById("editProfileForm");
  const closeEls = editProfileModal.querySelectorAll("[data-close-modal]");
  const avatarPreview = document.getElementById("editAvatarPreview");
  const coverPreview = document.getElementById("editCoverPreview");
  const mediaHint = document.getElementById("editProfileMediaHint");

  const avatarInput = form ? form.querySelector("input[type='file'][name='avatar']") : null;
  const coverInput = form ? form.querySelector("input[type='file'][name='cover']") : null;

  const pickAvatarBtn = editProfileModal.querySelector("[data-action='pick-avatar']");
  const removeAvatarBtn = editProfileModal.querySelector("[data-action='remove-avatar']");
  const pickCoverBtn = editProfileModal.querySelector("[data-action='pick-cover']");
  const removeCoverBtn = editProfileModal.querySelector("[data-action='remove-cover']");

  const setMediaHint = (text) => {
    if (!mediaHint) return;
    mediaHint.textContent = String(text || "");
  };

  const setPreview = (el, dataUrl, fallbackText) => {
    if (!el) return;
    const url = String(dataUrl || "").trim();
    if (url) {
      el.textContent = "";
      el.style.backgroundImage = `url('${url}')`;
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      return;
    }
    el.style.backgroundImage = "";
    el.style.backgroundSize = "";
    el.style.backgroundPosition = "";
    el.textContent = String(fallbackText || "");
  };

  const readAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("READ_FAILED"));
      reader.readAsDataURL(file);
    });

  const updateStoredUserFromResponse = (user, stats) => {
    if (!user) return;
    const prev = getStoredProfile() || {};
    const next = {
      ...prev,
      id: user.id,
      name: user.name,
      role: user.role,
      bio: user.bio,
      avatarData: user.avatarData || null,
      coverData: user.coverData || null,
    };
    setStoredProfile(next);
    applyProfileToUi(next);
    applyStatsToUi(stats, user);
    setPreview(avatarPreview, next.avatarData, getInitials(next.name) || "Я");
    setPreview(coverPreview, next.coverData, "");
  };

  const openModal = () => {
    const stored = getStoredProfile();
    if (form && stored) {
      if (stored.name != null) form.elements.name.value = stored.name;
      if (stored.role != null) form.elements.role.value = stored.role;
      if (stored.bio != null) form.elements.bio.value = stored.bio;
    }

    setMediaHint("");
    if (stored) {
      setPreview(avatarPreview, stored.avatarData, getInitials(stored.name) || "Я");
      setPreview(coverPreview, stored.coverData, "");
    }

    editProfileModal.classList.add("is-open");
    editProfileModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-modal-open");

    const first = editProfileModal.querySelector("input, textarea, select, button");
    first?.focus?.();
  };

  const closeModal = () => {
    editProfileModal.classList.remove("is-open");
    editProfileModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-modal-open");

    if (window.location.hash === "#edit-profile") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };

  editProfileButtons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      openModal();
    });
  });

  closeEls.forEach((el) => {
    el.addEventListener("click", () => {
      closeModal();
    });
  });

  if (pickAvatarBtn && avatarInput) {
    pickAvatarBtn.addEventListener("click", () => {
      setMediaHint("Фото профиля: рекомендуемый размер 400×400, до 700 КБ.");
      avatarInput.click();
    });
  }

  if (pickCoverBtn && coverInput) {
    pickCoverBtn.addEventListener("click", () => {
      setMediaHint("Обложка: рекомендуемый размер 1500×500, до 2 МБ.");
      coverInput.click();
    });
  }

  if (removeAvatarBtn) {
    removeAvatarBtn.addEventListener("click", async () => {
      setMediaHint("Удаляем фото профиля…");
      const result = await apiFetch("/api/me/avatar", { method: "PUT", body: { imageData: null } });
      if (!result.ok) {
        if (result.status === 401) window.location.href = "login.html";
        setMediaHint("Не удалось удалить фото профиля.");
        return;
      }
      updateStoredUserFromResponse(result.data?.user, result.data?.stats);
      setMediaHint("Фото профиля удалено.");
    });
  }

  if (removeCoverBtn) {
    removeCoverBtn.addEventListener("click", async () => {
      setMediaHint("Удаляем обложку…");
      const result = await apiFetch("/api/me/cover", { method: "PUT", body: { imageData: null } });
      if (!result.ok) {
        if (result.status === 401) window.location.href = "login.html";
        setMediaHint("Не удалось удалить обложку.");
        return;
      }
      updateStoredUserFromResponse(result.data?.user, result.data?.stats);
      setMediaHint("Обложка удалена.");
    });
  }

  if (avatarInput) {
    avatarInput.addEventListener("change", async () => {
      const file = avatarInput.files && avatarInput.files[0] ? avatarInput.files[0] : null;
      if (!file) return;
      if (!/^image\//.test(file.type)) {
        setMediaHint("Это не изображение.");
        return;
      }
      if (file.size > 700_000) {
        setMediaHint("Файл слишком большой. Фото профиля — до 700 КБ.");
        return;
      }

      setMediaHint("Загружаем фото профиля…");
      let dataUrl = "";
      try {
        dataUrl = await readAsDataUrl(file);
      } catch {
        setMediaHint("Не удалось прочитать файл.");
        return;
      }

      const result = await apiFetch("/api/me/avatar", { method: "PUT", body: { imageData: dataUrl } });
      if (!result.ok) {
        if (result.status === 401) window.location.href = "login.html";
        const code = result.data?.error;
        if (code === "IMAGE_TOO_LARGE") setMediaHint("Фото профиля слишком большое. Попробуйте меньший файл.");
        else setMediaHint("Не удалось загрузить фото профиля.");
        return;
      }

      updateStoredUserFromResponse(result.data?.user, result.data?.stats);
      setMediaHint("Фото профиля обновлено.");
    });
  }

  if (coverInput) {
    coverInput.addEventListener("change", async () => {
      const file = coverInput.files && coverInput.files[0] ? coverInput.files[0] : null;
      if (!file) return;
      if (!/^image\//.test(file.type)) {
        setMediaHint("Это не изображение.");
        return;
      }
      if (file.size > 2_000_000) {
        setMediaHint("Файл слишком большой. Обложка — до 2 МБ.");
        return;
      }

      setMediaHint("Загружаем обложку…");
      let dataUrl = "";
      try {
        dataUrl = await readAsDataUrl(file);
      } catch {
        setMediaHint("Не удалось прочитать файл.");
        return;
      }

      const result = await apiFetch("/api/me/cover", { method: "PUT", body: { imageData: dataUrl } });
      if (!result.ok) {
        if (result.status === 401) window.location.href = "login.html";
        const code = result.data?.error;
        if (code === "IMAGE_TOO_LARGE") setMediaHint("Обложка слишком большая. Попробуйте меньший файл.");
        else setMediaHint("Не удалось загрузить обложку.");
        return;
      }

      updateStoredUserFromResponse(result.data?.user, result.data?.stats);
      setMediaHint("Обложка обновлена.");
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!editProfileModal.classList.contains("is-open")) return;
    closeModal();
  });

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const name = form.elements?.name?.value?.trim?.() || "";
      const role = form.elements?.role?.value?.trim?.() || "";
      const bio = form.elements?.bio?.value?.trim?.() || "";

      if (!name) return;

      const result = await apiFetch("/api/me", {
        method: "PUT",
        body: { name, role, bio },
      });

      if (!result.ok) {
        if (result.status === 401) window.location.href = "login.html";
        return;
      }

      const user = result.data?.user;
      if (user) {
        const profile = {
          id: user.id,
          name: user.name,
          role: user.role,
          bio: user.bio,
          avatarData: user.avatarData || null,
          coverData: user.coverData || null,
        };
        setStoredProfile(profile);
        applyProfileToUi(profile);
        applyStatsToUi(result.data?.stats, user);
      }

      closeModal();
    });
  }

  if (window.location.hash === "#edit-profile") {
    openModal();
  }

  window.addEventListener("hashchange", () => {
    if (window.location.hash !== "#edit-profile") return;
    openModal();
  });
}
