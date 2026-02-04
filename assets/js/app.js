// Базовая логика интерфейса (без фреймворков)

const PROFILE_STORAGE_KEY = "mw_profile_v1";

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
    return /[A-Za-zА-Яа-яЁё]/.test(s);
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

  const nameEl = document.getElementById("profileName");
  const roleEl = document.getElementById("profileRole");
  const bioEl = document.getElementById("profileBio");
  const avatarEl = document.getElementById("profileAvatar");

  if (nameEl && name) nameEl.textContent = name;
  if (roleEl) roleEl.textContent = role;
  if (bioEl) bioEl.textContent = bio;
  if (avatarEl) avatarEl.textContent = initials;

  document.querySelectorAll("[data-profile-menu-button]").forEach((btn) => {
    btn.textContent = initials;
  });
};

const applyStatsToUi = (stats, user) => {
  const s = stats || {};
  const projects = Number(s.projects || 0);
  const followers = Number(s.followers || 0);
  const rating = Number(user?.rating || 0);

  const projectsEl = document.getElementById("statProjects");
  const followersEl = document.getElementById("statFollowers");
  const ratingEl = document.getElementById("statRating");

  if (projectsEl) projectsEl.textContent = String(projects);
  if (followersEl) followersEl.textContent = String(followers);
  if (ratingEl) ratingEl.textContent = String(rating);
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
  const opts = {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
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

const page = document.body?.dataset?.page || "";
const isAuthPage = page === "login" || page === "register";
const isPublicPage = page === "feed" || isAuthPage;

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
      const profile = { name: user.name, role: user.role, bio: user.bio };
      setStoredProfile(profile);
      applyProfileToUi(profile);
      applyStatsToUi(me.data?.stats, user);
    }
  } catch {
    // Если сервер не запущен или сеть недоступна — просто оставим локальные данные.
    setAuthedUi(false);
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

// 1.05) Лента проектов — тянем из общей БД
const feedList = document.getElementById("feedList");
if (feedList) {
  (async () => {
    try {
      const result = await apiFetch("/api/projects");
      if (!result.ok) throw new Error("API_UNAVAILABLE");

      const items = Array.isArray(result.data?.items) ? result.data.items : [];
      feedList.innerHTML = "";

      if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "muted";
        empty.textContent = "Пока пусто. Создайте первый проект — он появится здесь.";
        feedList.appendChild(empty);
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

        const menuBtn = document.createElement("button");
        menuBtn.className = "btn btn-ghost";
        menuBtn.type = "button";
        menuBtn.setAttribute("aria-label", "Меню");
        menuBtn.innerHTML = '<i class="fa-solid fa-ellipsis"></i>';

        header.appendChild(left);
        header.appendChild(menuBtn);

        const h3 = document.createElement("h3");
        h3.textContent = p.title || "";

        const body = document.createElement("p");
        body.textContent = p.body || "";

        const tags = document.createElement("div");
        tags.className = "post-tags";
        const tagsStr = String(p.tags || "").trim();
        if (tagsStr) {
          tagsStr
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 6)
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
        budget.textContent = formatBudget(p.budgetMin, p.budgetMax);
        budgetWrap.appendChild(budget);

        const due = formatDueDate(p.dueDate);
        if (due) {
          const dueEl = document.createElement("div");
          dueEl.className = "budget-meta";
          dueEl.textContent = `Срок: ${due}`;
          budgetWrap.appendChild(dueEl);
        }

        const actions = document.createElement("div");
        actions.className = "post-actions";

        const likeBtn = document.createElement("button");
        likeBtn.className = "btn btn-ghost";
        likeBtn.type = "button";
        likeBtn.setAttribute("data-toggle", "like");
        likeBtn.setAttribute("data-project-id", String(p.id));
        likeBtn.dataset.count = String(Number(p.likesCount || 0));
        likeBtn.innerHTML = `<i class="fa-regular fa-heart"></i> Нравится ${Number(p.likesCount || 0)}`;

        const commentBtn = document.createElement("button");
        commentBtn.className = "btn btn-ghost";
        commentBtn.type = "button";
        commentBtn.setAttribute("data-toggle", "comments");
        commentBtn.setAttribute("data-project-id", String(p.id));
        commentBtn.dataset.count = String(Number(p.commentsCount || 0));
        commentBtn.innerHTML = `<i class="fa-regular fa-comment"></i> Комментарии ${Number(p.commentsCount || 0)}`;

        const replyBtn = document.createElement("button");
        replyBtn.className = "btn btn-primary";
        replyBtn.type = "button";
        replyBtn.textContent = "Откликнуться";

        actions.appendChild(likeBtn);
        actions.appendChild(commentBtn);
        actions.appendChild(replyBtn);

        footer.appendChild(budgetWrap);
        footer.appendChild(actions);

        card.appendChild(header);
        card.appendChild(h3);
        card.appendChild(body);
        if (tags.childElementCount) card.appendChild(tags);
        card.appendChild(footer);

        feedList.appendChild(card);

        bindLikeButton(likeBtn);
        bindCommentsButton(commentBtn, { projectId: p.id, title: p.title });
      });
    } catch {
      // Фоллбек (если сервер не запущен или API недоступно) — показываем демо-ленту.
      feedList.innerHTML = "";
      const note = document.createElement("div");
      note.className = "muted";
      note.textContent = "Демо-режим. Чтобы создавать аккаунты и проекты, запустите сервер: node server.js";
      feedList.appendChild(note);
    }
  })();
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

  items.forEach((p) => {
    const card = document.createElement("article");
    card.className = "post-card";

    const header = document.createElement("div");
    header.className = "post-header";

    const left = document.createElement("div");

    const av = document.createElement("div");
    av.className = "avatar";
    av.textContent = getInitials(meName) || "Я";

    const metaWrap = document.createElement("div");
    const author = document.createElement("div");
    author.className = "post-author";
    author.textContent = meName;

    const meta = document.createElement("div");
    meta.className = "post-meta";
    const dt = p.createdAt ? new Date(Number(p.createdAt)) : null;
    meta.textContent = dt ? dt.toLocaleString("ru-RU", { day: "2-digit", month: "short" }) : "";

    metaWrap.appendChild(author);
    metaWrap.appendChild(meta);

    left.appendChild(av);
    left.appendChild(metaWrap);

    const menuBtn = document.createElement("button");
    menuBtn.className = "btn btn-ghost";
    menuBtn.type = "button";
    menuBtn.setAttribute("aria-label", "Действия");
    menuBtn.innerHTML = '<i class="fa-solid fa-ellipsis"></i>';

    header.appendChild(left);
    header.appendChild(menuBtn);

    const h3 = document.createElement("h3");
    h3.textContent = p.title || "";

    const body = document.createElement("p");
    body.textContent = p.body || "";

    const tags = document.createElement("div");
    tags.className = "post-tags";
    const tagsStr = String(p.tags || "").trim();
    if (tagsStr) {
      tagsStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6)
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
    budget.textContent = formatBudget(p.budgetMin, p.budgetMax);
    budgetWrap.appendChild(budget);

    const due = formatDueDate(p.dueDate);
    if (due) {
      const dueEl = document.createElement("div");
      dueEl.className = "budget-meta";
      dueEl.textContent = `Срок: ${due}`;
      budgetWrap.appendChild(dueEl);
    }

    const actions = document.createElement("div");
    actions.className = "post-actions";

    const likeBtn = document.createElement("button");
    likeBtn.className = "btn btn-ghost";
    likeBtn.type = "button";
    likeBtn.setAttribute("data-toggle", "like");
    likeBtn.setAttribute("data-project-id", String(p.id));
    setLikeButtonUi(likeBtn, false, Number(p.likesCount || 0));

    const commentBtn = document.createElement("button");
    commentBtn.className = "btn btn-ghost";
    commentBtn.type = "button";
    commentBtn.setAttribute("data-toggle", "comments");
    commentBtn.setAttribute("data-project-id", String(p.id));
    setCommentsButtonUi(commentBtn, Number(p.commentsCount || 0));

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-secondary";
    editBtn.type = "button";
    editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Редактировать';

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-ghost is-danger";
    delBtn.type = "button";
    delBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Удалить';

    actions.appendChild(likeBtn);
    actions.appendChild(commentBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    footer.appendChild(budgetWrap);
    footer.appendChild(actions);

    card.appendChild(header);
    card.appendChild(h3);
    card.appendChild(body);
    if (tags.childElementCount) card.appendChild(tags);
    card.appendChild(footer);

    myProjectsList.appendChild(card);

    bindLikeButton(likeBtn);
    bindCommentsButton(commentBtn, { projectId: p.id, title: p.title });

    editBtn.addEventListener("click", () => {
      if (!projectEditModal) return;
      wireModal(projectEditModal);

      const form = document.getElementById("projectEditForm");
      if (!form) return;

      form.elements.id.value = String(p.id);
      form.elements.title.value = String(p.title || "");
      form.elements.body.value = String(p.body || "");
      form.elements.tags.value = String(p.tags || "");
      form.elements.budgetMax.value = p.budgetMax == null ? "" : String(p.budgetMax);
      if (form.elements?.dueDate) form.elements.dueDate.value = p.dueDate ? String(p.dueDate) : "";

      openModal(projectEditModal);
    });

    delBtn.addEventListener("click", async () => {
      const ok = window.confirm("Удалить проект? Это действие нельзя отменить.");
      if (!ok) return;

      const resp = await apiFetch(`/api/projects/${p.id}`, { method: "DELETE" });
      if (!resp.ok) {
        if (resp.status === 401) window.location.href = "login.html";
        return;
      }
      await loadMyProjects();
    });
  });
}

if (myProjectsList) {
  loadMyProjects();
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
const userProjectsList = document.getElementById("userProjectsList");
if (userProjectsList) {
  (async () => {
    const params = new URLSearchParams(window.location.search);
    const idRaw = params.get("id");
    const userId = Number(idRaw);

    if (!Number.isFinite(userId)) {
      userProjectsList.innerHTML = `<div class="muted">Профиль не найден.</div>`;
      return;
    }

    if (currentUserId != null && Number(currentUserId) === userId) {
      window.location.replace("profile.html");
      return;
    }

    const info = await apiFetch(`/api/users/${userId}`);
    if (!info.ok) {
      userProjectsList.innerHTML = `<div class="muted">Профиль не найден.</div>`;
      return;
    }

    const user = info.data?.user || {};
    const stats = info.data?.stats || {};

    const name = String(user.name || "Пользователь");
    const role = String(user.role || "");
    const bio = String(user.bio || "").trim();

    const nameEl = document.getElementById("userName");
    const roleEl = document.getElementById("userRole");
    const bioEl = document.getElementById("userBio");
    const avEl = document.getElementById("userAvatar");

    if (nameEl) nameEl.textContent = name;
    if (roleEl) roleEl.textContent = role;
    if (bioEl) bioEl.textContent = bio || "Пользователь пока ничего не рассказал о себе.";
    if (avEl) avEl.textContent = getInitials(name) || "?";

    const pEl = document.getElementById("userStatProjects");
    const fEl = document.getElementById("userStatFollowers");
    const rEl = document.getElementById("userStatRating");
    if (pEl) pEl.textContent = String(Number(stats.projects || 0));
    if (fEl) fEl.textContent = String(Number(stats.followers || 0));
    if (rEl) rEl.textContent = String(Number(stats.rating || 0));

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
    if (messageBtn) {
      messageBtn.href = `messages.html?userId=${encodeURIComponent(String(userId))}`;
    }

    const projects = await apiFetch(`/api/users/${userId}/projects`);
    if (!projects.ok) {
      userProjectsList.innerHTML = `<div class="muted">Не удалось загрузить проекты.</div>`;
      return;
    }

    const items = Array.isArray(projects.data?.items) ? projects.data.items : [];
    userProjectsList.innerHTML = "";

    if (!items.length) {
      userProjectsList.innerHTML = `<div class="muted">У пользователя пока нет проектов.</div>`;
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
      av.textContent = getInitials(name) || "?";

      const metaWrap = document.createElement("div");
      const author = document.createElement("div");
      author.className = "post-author";
      author.textContent = name;

      const meta = document.createElement("div");
      meta.className = "post-meta";
      const dt = p.createdAt ? new Date(Number(p.createdAt)) : null;
      meta.textContent = dt ? dt.toLocaleString("ru-RU", { day: "2-digit", month: "short" }) : "";

      metaWrap.appendChild(author);
      metaWrap.appendChild(meta);
      left.appendChild(av);
      left.appendChild(metaWrap);

      const menuBtn = document.createElement("button");
      menuBtn.className = "btn btn-ghost";
      menuBtn.type = "button";
      menuBtn.setAttribute("aria-label", "Меню");
      menuBtn.innerHTML = '<i class="fa-solid fa-ellipsis"></i>';

      header.appendChild(left);
      header.appendChild(menuBtn);

      const h3 = document.createElement("h3");
      h3.textContent = p.title || "";

      const body = document.createElement("p");
      body.textContent = p.body || "";

      const tags = document.createElement("div");
      tags.className = "post-tags";
      const tagsStr = String(p.tags || "").trim();
      if (tagsStr) {
        tagsStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 6)
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
      budget.textContent = formatBudget(p.budgetMin, p.budgetMax);
      budgetWrap.appendChild(budget);

      const due = formatDueDate(p.dueDate);
      if (due) {
        const dueEl = document.createElement("div");
        dueEl.className = "budget-meta";
        dueEl.textContent = `Срок: ${due}`;
        budgetWrap.appendChild(dueEl);
      }

      const actions = document.createElement("div");
      actions.className = "post-actions";

      const likeBtn = document.createElement("button");
      likeBtn.className = "btn btn-ghost";
      likeBtn.type = "button";
      likeBtn.setAttribute("data-toggle", "like");
      likeBtn.setAttribute("data-project-id", String(p.id));
      likeBtn.dataset.count = String(Number(p.likesCount || 0));
      likeBtn.innerHTML = `<i class="fa-regular fa-heart"></i> Нравится ${Number(p.likesCount || 0)}`;

      const commentBtn = document.createElement("button");
      commentBtn.className = "btn btn-ghost";
      commentBtn.type = "button";
      commentBtn.setAttribute("data-toggle", "comments");
      commentBtn.setAttribute("data-project-id", String(p.id));
      commentBtn.dataset.count = String(Number(p.commentsCount || 0));
      setCommentsButtonUi(commentBtn, Number(p.commentsCount || 0));

      actions.appendChild(likeBtn);
      actions.appendChild(commentBtn);

      footer.appendChild(budgetWrap);
      footer.appendChild(actions);

      card.appendChild(header);
      card.appendChild(h3);
      card.appendChild(body);
      if (tags.childElementCount) card.appendChild(tags);
      card.appendChild(footer);

      userProjectsList.appendChild(card);
      bindLikeButton(likeBtn);
      bindCommentsButton(commentBtn, { projectId: p.id, title: p.title });
    });
  })();
}

// 1.25) Профиль: мои проекты (без фейков)
const profileProjectsList = document.getElementById("profileProjectsList");
if (profileProjectsList) {
  (async () => {
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
      profileProjectsList.innerHTML = `<div class="muted">У вас пока нет проектов. Создайте первый во вкладке «Проекты».</div>`;
      return;
    }

    items.slice(0, 10).forEach((p) => {
      const card = document.createElement("article");
      card.className = "post-card";

      const h3 = document.createElement("h3");
      h3.textContent = p.title || "";

      const body = document.createElement("p");
      body.textContent = p.body || "";

      const tags = document.createElement("div");
      tags.className = "post-tags";
      const tagsStr = String(p.tags || "").trim();
      if (tagsStr) {
        tagsStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 6)
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
      budget.textContent = formatBudget(p.budgetMin, p.budgetMax);
      budgetWrap.appendChild(budget);

      const due = formatDueDate(p.dueDate);
      if (due) {
        const dueEl = document.createElement("div");
        dueEl.className = "budget-meta";
        dueEl.textContent = `Срок: ${due}`;
        budgetWrap.appendChild(dueEl);
      }

      footer.appendChild(budgetWrap);

      card.appendChild(h3);
      card.appendChild(body);
      if (tags.childElementCount) card.appendChild(tags);
      card.appendChild(footer);

      profileProjectsList.appendChild(card);
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
  btn.innerHTML = `<i class="${liked ? "fa-solid" : "fa-regular"} fa-heart"></i> Нравится ${Number(btn.dataset.count)}`;
}

function setCommentsButtonUi(btn, count) {
  const c = Number(count || 0);
  btn.dataset.count = String(Number.isFinite(c) ? c : 0);
  btn.innerHTML = `<i class="fa-regular fa-comment"></i> Комментарии ${Number(btn.dataset.count)}`;
}

function bindLikeButton(btn) {
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  btn.addEventListener("click", async () => {
    const projectId = btn.getAttribute("data-project-id");
    const wasLiked = btn.classList.contains("is-active");
    const prevCount = Number(btn.dataset.count || 0);

    if (projectId) {
      const result = await apiFetch(`/api/like/${projectId}`, { method: "POST" });
      if (!result.ok) {
        if (result.status === 401) window.location.href = "login.html";
        return;
      }
      const nowLiked = Boolean(result.data?.liked);
      const nextCount = nowLiked === wasLiked ? prevCount : prevCount + (nowLiked ? 1 : -1);
      setLikeButtonUi(btn, nowLiked, Math.max(0, nextCount));
    } else {
      const nowLiked = !wasLiked;
      const nextCount = prevCount + (nowLiked ? 1 : -1);
      setLikeButtonUi(btn, nowLiked, Math.max(0, nextCount));
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

async function openComments(projectId, title) {
  const id = Number(projectId);
  if (!Number.isFinite(id)) return;

  const modal = ensureCommentsModal();
  const titleEl = modal.querySelector("#commentsTitle");
  const subtitleEl = modal.querySelector("#commentsSubtitle");
  const listEl = modal.querySelector("#commentsList");
  const form = modal.querySelector("#commentForm");

  modal.dataset.projectId = String(id);
  modal.dataset.projectTitle = String(title || "Проект");

  if (titleEl) titleEl.textContent = "Комментарии";
  if (subtitleEl) subtitleEl.textContent = String(title || "Проект");

  if (listEl) listEl.innerHTML = `<div class="muted">Загрузка…</div>`;

  openModal(modal);

  const refresh = async () => {
    const pid = Number(modal.dataset.projectId);
    if (!Number.isFinite(pid)) return;

    const result = await apiFetch(`/api/projects/${pid}/comments`);
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

        const body = document.createElement("div");
        body.textContent = c.body || "";

        item.appendChild(head);
        item.appendChild(body);
        listEl?.appendChild(item);
      });
    }

    // Синхронизируем счётчик на всех кнопках комментариев для этого проекта
    document.querySelectorAll(`[data-toggle="comments"][data-project-id="${pid}"]`).forEach((btn) => {
      setCommentsButtonUi(btn, items.length);
    });
  };

  await refresh();

  if (form && form.dataset.bound !== "1") {
    form.dataset.bound = "1";

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const textarea = form.elements?.body;
      const body = textarea?.value?.trim?.() || "";
      if (!body) return;

      const pid = Number(modal.dataset.projectId);
      if (!Number.isFinite(pid)) return;

      const result = await apiFetch(`/api/projects/${pid}/comments`, { method: "POST", body: { body } });
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

function bindCommentsButton(btn, ctx = {}) {
  if (!btn || btn.dataset.boundComments === "1") return;
  btn.dataset.boundComments = "1";

  btn.addEventListener("click", async () => {
    const projectId = btn.getAttribute("data-project-id") || ctx.projectId;
    const title = ctx.title || btn.getAttribute("data-project-title") || "Проект";
    await openComments(projectId, title);
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
document.querySelectorAll("[data-toggle='comments']").forEach((btn) => bindCommentsButton(btn));

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
        `/api/conversations/${convId}/messages?afterId=${encodeURIComponent(String(lastMessageId || 0))}`,
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
    const result = await apiFetch(`/api/conversations/${activeConversationId}/messages`);
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
      `/api/conversations/${activeConversationId}/messages?afterId=${encodeURIComponent(String(lastMessageId || 0))}`,
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

  const openModal = () => {
    const stored = getStoredProfile();
    if (form && stored) {
      if (stored.name != null) form.elements.name.value = stored.name;
      if (stored.role != null) form.elements.role.value = stored.role;
      if (stored.bio != null) form.elements.bio.value = stored.bio;
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
        const profile = { name: user.name, role: user.role, bio: user.bio };
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
