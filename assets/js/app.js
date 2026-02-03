// Базовые интеракции интерфейса
const likeButtons = document.querySelectorAll("[data-toggle='like']");
likeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    // Визуально отмечаем реакцию
    btn.classList.toggle("is-active");
    const icon = btn.querySelector("i");
    if (icon) {
      icon.classList.toggle("fa-solid");
      icon.classList.toggle("fa-regular");
    }
  });
});

const followButtons = document.querySelectorAll("[data-toggle='follow']");
followButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const isFollowing = btn.classList.toggle("is-following");
    btn.textContent = isFollowing ? "Подписаны" : "Подписаться";
  });
});

const chips = document.querySelectorAll(".chip");
chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    chip.parentElement?.querySelectorAll(".chip").forEach((sibling) => {
      sibling.classList.remove("is-active");
    });
    chip.classList.add("is-active");
  });
});

const range = document.querySelector("[data-range='budget']");
const rangeValue = document.querySelector("[data-range-value]");
if (range && rangeValue) {
  // Форматирование бюджета в рублях
  const updateRange = () => {
    const value = Number(range.value || 0);
    rangeValue.textContent = `${value.toLocaleString("ru-RU")} ?`;
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
    bubble.textContent = text;

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
