import express from "express";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import jwt from "jsonwebtoken";
import multer from "multer";
import crypto from "crypto";

const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const JWT_EXPIRES = "7d";

/* ---------------- ROOT ---------------- */
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "API is running 🚀"
  });
});

/* ---------------- DB ---------------- */
const DB = await open({
  filename: "./db.sqlite",
  driver: sqlite3.Database
});

await DB.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  password TEXT,
  name TEXT,
  picture TEXT,
  provider TEXT,
  createdAt TEXT
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  name TEXT,
  location TEXT,
  roles TEXT,
  about TEXT,
  offers TEXT,
  needs TEXT,
  projects TEXT,
  stats TEXT,
  avatar TEXT,
  header TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dialog_id TEXT,
  from_user TEXT,
  to_user TEXT,
  text TEXT,
  created_at TEXT,
  read_at TEXT
);
`);

await DB.exec(`
CREATE INDEX IF NOT EXISTS idx_messages_dialog_id ON messages(dialog_id);
CREATE INDEX IF NOT EXISTS idx_messages_from_user ON messages(from_user);
CREATE INDEX IF NOT EXISTS idx_messages_to_user ON messages(to_user);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_dialog_created ON messages(dialog_id, created_at);
`);

/* ---------------- HELPERS ---------------- */
function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, provider: user.provider || "local" },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function requireAuth(req, res) {
  const ah = req.headers.authorization || "";
  if (!ah.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  try {
    return jwt.verify(ah.slice(7), JWT_SECRET);
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
}

function buildDialogId(a, b) {
  return [a, b].sort().join("__");
}

/* ---------------- AUTH ---------------- */
app.post("/register", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Missing email or password" });
  }

  const id = crypto.randomUUID();
  const user = {
    id,
    email,
    name: email.split("@")[0],
    picture: null,
    provider: "local",
    createdAt: new Date().toISOString()
  };

  await DB.run(
    "INSERT INTO users (id,email,name,picture,provider,createdAt) VALUES (?,?,?,?,?,?)",
    [user.id, user.email, user.name, user.picture, user.provider, user.createdAt]
  );

  res.json({ ok: true, user, token: createToken(user) });
});

/* ---------------- PROFILE ---------------- */
app.get("/profile", async (req, res) => {
  const payload = requireAuth(req, res);
  if (!payload) return;

  const row = await DB.get(
    "SELECT * FROM profiles WHERE user_id = ?",
    [payload.id]
  );

  res.json({ ok: true, profile: row || null });
});

app.post("/profile", async (req, res) => {
  const payload = requireAuth(req, res);
  if (!payload) return;

  const data = req.body || {};
  const exists = await DB.get(
    "SELECT 1 FROM profiles WHERE user_id = ?",
    [payload.id]
  );

  const values = [
    payload.id,
    data.name || "",
    data.location || "",
    JSON.stringify(data.roles || []),
    data.about || "",
    JSON.stringify(data.offers || []),
    JSON.stringify(data.needs || []),
    JSON.stringify(data.projects || []),
    JSON.stringify(data.stats || {}),
    data.avatar || null,
    data.header || null
  ];

  if (exists) {
    await DB.run(`
      UPDATE profiles SET
        name=?, location=?, roles=?, about=?, offers=?, needs=?,
        projects=?, stats=?, avatar=?, header=?
      WHERE user_id=?
    `, [...values.slice(1), payload.id]);
  } else {
    await DB.run(`
      INSERT INTO profiles
      (user_id,name,location,roles,about,offers,needs,projects,stats,avatar,header)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `, values);
  }

  res.json({ ok: true });
});

/* ---------------- DIALOGS ---------------- */
app.get("/dialogs", async (req, res) => {
  const payload = requireAuth(req, res);
  if (!payload) return;

  const userId = payload.id;

  const rows = await DB.all(`
    SELECT
      m.dialog_id,
      m.from_user,
      m.to_user,
      m.text,
      m.created_at,
      (
        SELECT COUNT(*)
        FROM messages um
        WHERE um.dialog_id = m.dialog_id
          AND um.to_user = ?
          AND um.read_at IS NULL
      ) AS unread_count
    FROM messages m
    JOIN (
      SELECT dialog_id, MAX(id) AS last_id
      FROM messages
      WHERE from_user = ? OR to_user = ?
      GROUP BY dialog_id
    ) lm ON m.id = lm.last_id
    ORDER BY m.created_at DESC
  `, [userId, userId, userId]);

  res.json({ ok: true, dialogs: rows });
});

app.get("/dialogs/:id/messages", async (req, res) => {
  const payload = requireAuth(req, res);
  if (!payload) return;

  const dialogId = req.params.id;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const cursor = Number(req.query.cursor) || null;

  const params = [dialogId];
  let cursorSql = "";

  if (cursor) {
    cursorSql = "AND id < ?";
    params.push(cursor);
  }

  params.push(limit);

  const messages = await DB.all(`
    SELECT *
    FROM messages
    WHERE dialog_id = ?
    ${cursorSql}
    ORDER BY id DESC
    LIMIT ?
  `, params);

  await DB.run(`
    UPDATE messages
    SET read_at = ?
    WHERE dialog_id = ?
      AND to_user = ?
      AND read_at IS NULL
  `, [new Date().toISOString(), dialogId, payload.id]);

  const nextCursor =
    messages.length === limit ? messages[messages.length - 1].id : null;

  res.json({ ok: true, messages, next_cursor: nextCursor });
});

app.post("/dialogs/:id/messages", async (req, res) => {
  const payload = requireAuth(req, res);
  if (!payload) return;

  const { text, to_user } = req.body || {};
  if (!text || !to_user) {
    return res.status(400).json({ error: "Missing text or to_user" });
  }

  const dialogId = buildDialogId(payload.id, to_user);
  if (dialogId !== req.params.id) {
    return res.status(400).json({ error: "Dialog id mismatch" });
  }

  const createdAt = new Date().toISOString();

  const result = await DB.run(`
    INSERT INTO messages (dialog_id, from_user, to_user, text, created_at)
    VALUES (?, ?, ?, ?, ?)
  `, [dialogId, payload.id, to_user, text.trim(), createdAt]);

  const message = await DB.get(
    "SELECT * FROM messages WHERE id = ?",
    [result.lastID]
  );

  res.status(201).json({ ok: true, message });
});

/* ---------------- SERVER ---------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running → http://localhost:${PORT}`);
});
