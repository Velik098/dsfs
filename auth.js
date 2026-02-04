const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizePhone(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  // Оставляем только цифры и ведущий +
  const plus = raw.startsWith("+") ? "+" : "";
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  // Минимально разумная длина телефона.
  if (digits.length < 8 || digits.length > 15) return null;
  return plus + digits;
}

function parseIdentifier(identifier) {
  const value = String(identifier || "").trim();
  if (!value) return { kind: null, value: null };

  if (EMAIL_RE.test(value)) return { kind: "email", value: value.toLowerCase() };

  const phone = normalizePhone(value);
  if (phone) return { kind: "phone", value: phone };

  return { kind: null, value: null };
}

async function hashPassword(password) {
  const plain = String(password || "");
  if (plain.length < 8) throw new Error("PASSWORD_TOO_SHORT");
  return bcrypt.hash(plain, 10);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(String(password || ""), String(hash || ""));
}

function newSessionToken() {
  // base64url без паддинга — удобно для cookie.
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

module.exports = {
  parseIdentifier,
  hashPassword,
  verifyPassword,
  newSessionToken,
  hashToken,
};

