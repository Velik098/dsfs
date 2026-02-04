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

const page = document.body?.dataset?.page || "";

// 1) Подтягиваем профиль с сервера (чтобы это был "общак", а не только localStorage).
(async () => {
  const isAuthPage = page === "login" || page === "register";

  try {
    const me = await apiFetch("/api/me");

    if (!me.ok) {
      if (!isAuthPage && me.status === 401) {
        window.location.href = "login.html";
      }
      return;
    }

    const user = me.data?.user;
    if (user) {
      const profile = { name: user.name, role: user.role, bio: user.bio };
      setStoredProfile(profile);
      applyProfileToUi(profile);
    }
  } catch {
    // Если сервер не запущен или сеть недоступна — просто оставим локальные данные.
    applyProfileToUi(getStoredProfile());
  }
})();

// 1.05) Лента проектов — тянем из общей БД
const feedList = document.getElementById("feedList");
if (feedList) {
  (async () => {
    try {
      const result = await apiFetch("/api/projects");
      if (!result.ok) return;

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
        const author = document.createElement("div");
        author.className = "post-author";
        author.textContent = p.authorName || "Пользователь";

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

        const budget = document.createElement("div");
        budget.className = "budget";
        const bMin = p.budgetMin == null ? null : Number(p.budgetMin);
        const bMax = p.budgetMax == null ? null : Number(p.budgetMax);
        if (Number.isFinite(bMin) && Number.isFinite(bMax)) {
          budget.textContent = `₽${bMin.toLocaleString("ru-RU")} – ₽${bMax.toLocaleString("ru-RU")}`;
        } else if (Number.isFinite(bMax)) {
          budget.textContent = `до ₽${bMax.toLocaleString("ru-RU")}`;
        } else {
          budget.textContent = "Бюджет не указан";
        }

        const actions = document.createElement("div");
        actions.className = "post-actions";

        const likeBtn = document.createElement("button");
        likeBtn.className = "btn btn-ghost";
        likeBtn.type = "button";
        likeBtn.setAttribute("data-toggle", "like");
        likeBtn.setAttribute("data-project-id", String(p.id));
        likeBtn.innerHTML = `<i class=\"fa-regular fa-heart\"></i> Нравится ${Number(p.likesCount || 0)}`;

        const commentBtn = document.createElement("button");
        commentBtn.className = "btn btn-ghost";
        commentBtn.type = "button";
        commentBtn.disabled = true;
        commentBtn.title = "Скоро";
        commentBtn.innerHTML = '<i class="fa-regular fa-comment"></i> Комментарии';

        const replyBtn = document.createElement("button");
        replyBtn.className = "btn btn-primary";
        replyBtn.type = "button";
        replyBtn.textContent = "Откликнуться";

        actions.appendChild(likeBtn);
        actions.appendChild(commentBtn);
        actions.appendChild(replyBtn);

        footer.appendChild(budget);
        footer.appendChild(actions);

        card.appendChild(header);
        card.appendChild(h3);
        card.appendChild(body);
        if (tags.childElementCount) card.appendChild(tags);
        card.appendChild(footer);

        feedList.appendChild(card);

        bindLikeButton(likeBtn);
      });
    } catch {
      // ignore
    }
  })();
}

// 1.1) Создание проекта (страница "Проекты")
const projectForm = document.getElementById("projectForm");
if (projectForm) {
  projectForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = projectForm.elements?.title?.value?.trim?.() || "";
    const body = projectForm.elements?.body?.value?.trim?.() || "";
    const tags = projectForm.elements?.tags?.value?.trim?.() || "";
    const budgetMaxRaw = projectForm.elements?.budgetMax?.value;
    const budgetMax = budgetMaxRaw == null ? null : Number(budgetMaxRaw);

    if (!title) return;
    if (!body) return;

    const result = await apiFetch("/api/projects", {
      method: "POST",
      body: { title, body, tags, budgetMin: null, budgetMax: Number.isFinite(budgetMax) ? budgetMax : null },
    });

    if (!result.ok) {
      if (result.status === 401) window.location.href = "login.html";
      return;
    }

    window.location.href = "index.html";
  });
}

// 2) Вход / регистрация
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showAuthError("");

    const identifier = loginForm.elements?.identifier?.value?.trim?.() || "";
    const password = loginForm.elements?.password?.value || "";
    const remember = Boolean(loginForm.elements?.remember?.checked);

    if (!identifier) return showAuthError("Введите почту или телефон.");
    if (!password) return showAuthError("Введите пароль.");

    const result = await apiFetch("/api/auth/login", {
      method: "POST",
      body: { identifier, password, remember },
    });

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

    window.location.href = "index.html";
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

    const name = registerForm.elements?.name?.value?.trim?.() || "";
    const identifier = registerForm.elements?.identifier?.value?.trim?.() || "";
    const password = registerForm.elements?.password?.value || "";
    const role = registerForm.elements?.role?.value?.trim?.() || "";

    if (!name) return showAuthError("Введите имя.");
    if (!identifier) return showAuthError("Введите почту или телефон.");
    if (!password || String(password).length < 8) return showAuthError("Пароль должен быть минимум 8 символов.");

    const result = await apiFetch("/api/auth/register", {
      method: "POST",
      body: { name, identifier, password, role },
    });

    if (!result.ok) {
      const code = result.data?.error;
      if (code === "EMAIL_TAKEN") return showAuthError("Эта почта уже занята.");
      if (code === "PHONE_TAKEN") return showAuthError("Этот телефон уже занят.");
      if (code === "PASSWORD_TOO_SHORT") return showAuthError("Пароль должен быть минимум 8 символов.");
      return showAuthError("Не удалось зарегистрироваться. Попробуйте ещё раз.");
    }

    window.location.href = "index.html";
  });
}

// 3) Лайки/подписки (если есть id — работаем через сервер, иначе оставляем локальный toggling)
function bindLikeButton(btn) {
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  btn.addEventListener("click", async () => {
    const projectId = btn.getAttribute("data-project-id");

    if (projectId) {
      const result = await apiFetch(`/api/like/${projectId}`, { method: "POST" });
      if (!result.ok) {
        if (result.status === 401) window.location.href = "login.html";
        return;
      }
      btn.classList.toggle("is-active", Boolean(result.data?.liked));
    } else {
      btn.classList.toggle("is-active");
    }

    const icon = btn.querySelector("i");
    if (!icon) return;
    icon.classList.toggle("fa-solid", btn.classList.contains("is-active"));
    icon.classList.toggle("fa-regular", !btn.classList.contains("is-active"));
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
  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const text = chatMessage.value.trim();
    if (!text) return;

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble outgoing";
    bubble.append(document.createTextNode(text));

    const time = document.createElement("span");
    time.className = "chat-time";
    const now = new Date();
    time.textContent = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

    bubble.appendChild(time);
    chatThread.appendChild(bubble);
    chatThread.scrollTop = chatThread.scrollHeight;
    chatMessage.value = "";
  });
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
