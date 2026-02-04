// Базовые интерактивные элементы (без фреймворков)

const PROFILE_STORAGE_KEY = "mw_profile_v1";

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
  if (roleEl && role) roleEl.textContent = role;
  if (bioEl && bio) bioEl.textContent = bio;
  if (avatarEl && name) avatarEl.textContent = initials;

  document.querySelectorAll("[data-profile-menu-button]").forEach((btn) => {
    btn.textContent = initials;
  });
};

applyProfileToUi(getStoredProfile());

const likeButtons = document.querySelectorAll("[data-toggle='like']");
likeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    btn.classList.toggle("is-active");

    const icon = btn.querySelector("i");
    if (!icon) return;

    icon.classList.toggle("fa-solid");
    icon.classList.toggle("fa-regular");
  });
});

const followButtons = document.querySelectorAll("[data-toggle='follow']");
followButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const isFollowing = btn.classList.toggle("is-following");
    btn.textContent = isFollowing ? "Вы подписаны" : "Подписаться";
  });
});

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

// Меню профиля (в шапке)
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

  // Закрываем при клике вне меню
  document.addEventListener("click", (event) => {
    if (menu.contains(event.target)) return;
    closeMenu();
  });

  // Закрываем по Esc
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeMenu();
  });

  // Действия внутри меню
  dropdown.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    const linkEl = event.target.closest("a.menu-item");

    // Если клик по ссылке — просто закроем меню и дадим перейти.
    if (linkEl) {
      closeMenu();
      return;
    }

    if (!actionEl) return;

    const action = actionEl.getAttribute("data-action");
    closeMenu();

    if (action === "logout") {
      clearStoredProfile();
      window.location.href = "login.html";
      return;
    }

    if (action === "switch-account") {
      clearStoredProfile();
      window.location.href = "login.html";
    }
  });
});

// Редактирование профиля (модалка)
const editProfileModal = document.getElementById("editProfileModal");
const editProfileButtons = document.querySelectorAll("[data-action='edit-profile']");
if (editProfileModal && editProfileButtons.length) {
  const form = document.getElementById("editProfileForm");
  const closeEls = editProfileModal.querySelectorAll("[data-close-modal]");

  const openModal = () => {
    if (form) {
      const stored = getStoredProfile();
      if (stored?.name) form.elements.name.value = stored.name;
      if (stored?.role) form.elements.role.value = stored.role;
      if (stored?.bio) form.elements.bio.value = stored.bio;
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
    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const name = form.elements?.name?.value?.trim?.() || "";
      const role = form.elements?.role?.value?.trim?.() || "";
      const bio = form.elements?.bio?.value?.trim?.() || "";

      const profile = { name, role, bio };
      setStoredProfile(profile);
      applyProfileToUi(profile);

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
