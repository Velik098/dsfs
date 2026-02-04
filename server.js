const path = require("node:path");

const express = require("express");
const cookieParser = require("cookie-parser");

const db = require("./database");
const auth = require("./auth");

const PORT = Number(process.env.PORT || 3000);
const SESSION_COOKIE = "mw_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней
const SESSION_TTL_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

function jsonError(res, status, message) {
  res.status(status).json({ ok: false, error: message });
}

function cookieOptions(maxAgeMs) {
  const opts = {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // localhost
    path: "/",
  };
  if (typeof maxAgeMs === "number") opts.maxAge = maxAgeMs;
  return opts;
}

async function loadUserFromSession(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;

  const now = Date.now();
  const tokenHash = auth.hashToken(token);
  const session = await db.get(
    "SELECT user_id AS userId, expires_at AS expiresAt FROM sessions WHERE token_hash = ? AND expires_at > ?",
    [tokenHash, now],
  );
  if (!session) return null;

  const user = await db.get(
    "SELECT id, email, phone, name, role, bio, rating, created_at AS createdAt FROM users WHERE id = ?",
    [session.userId],
  );
  return user || null;
}

function requireAuth(req, res, next) {
  if (!req.user) return jsonError(res, 401, "AUTH_REQUIRED");
  next();
}

async function createSession(res, userId, remember) {
  const token = auth.newSessionToken();
  const tokenHash = auth.hashToken(token);
  const ttl = remember ? SESSION_TTL_REMEMBER_MS : SESSION_TTL_MS;
  const now = Date.now();
  const expiresAt = now + ttl;

  await db.run(
    "INSERT INTO sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)",
    [userId, tokenHash, expiresAt, now],
  );

  res.cookie(SESSION_COOKIE, token, cookieOptions(remember ? ttl : undefined));
}

async function deleteSession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    return;
  }
  const tokenHash = auth.hashToken(token);
  await db.run("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

async function getUserStats(userId) {
  const projects = await db.get("SELECT COUNT(*) AS c FROM projects WHERE user_id = ?", [userId]);
  const followers = await db.get("SELECT COUNT(*) AS c FROM follows WHERE followee_id = ?", [userId]);
  const following = await db.get("SELECT COUNT(*) AS c FROM follows WHERE follower_id = ?", [userId]);
  return {
    projects: Number(projects?.c || 0),
    followers: Number(followers?.c || 0),
    following: Number(following?.c || 0),
  };
}

async function main() {
  await db.openDb();

  const app = express();

  app.use(express.json({ limit: "200kb" }));
  app.use(cookieParser());

  // Авторизация на каждом запросе (недорого для MVP).
  app.use(async (req, res, next) => {
    try {
      req.user = await loadUserFromSession(req);
      next();
    } catch (e) {
      // В случае проблем с БД — не падаем белым экраном.
      console.error("Auth middleware error:", e);
      next();
    }
  });

  // --- API: AUTH ---
  app.post("/api/auth/register", async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const identifier = req.body?.identifier;
      const password = req.body?.password;
      const role = String(req.body?.role || "").trim();

      if (!name) return jsonError(res, 400, "NAME_REQUIRED");

      const parsed = auth.parseIdentifier(identifier);
      if (!parsed.kind) return jsonError(res, 400, "EMAIL_OR_PHONE_REQUIRED");

      const passwordHash = await auth.hashPassword(password);
      const now = Date.now();

      const email = parsed.kind === "email" ? parsed.value : null;
      const phone = parsed.kind === "phone" ? parsed.value : null;

      // Уникальность.
      if (email) {
        const existing = await db.get("SELECT id FROM users WHERE email = ?", [email]);
        if (existing) return jsonError(res, 409, "EMAIL_TAKEN");
      }
      if (phone) {
        const existing = await db.get("SELECT id FROM users WHERE phone = ?", [phone]);
        if (existing) return jsonError(res, 409, "PHONE_TAKEN");
      }

      await db.run(
        "INSERT INTO users (email, phone, password_hash, name, role, bio, rating, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [email, phone, passwordHash, name, role, "", 0, now],
      );

      const created = await db.get(
        email ? "SELECT id FROM users WHERE email = ?" : "SELECT id FROM users WHERE phone = ?",
        [email || phone],
      );

      await createSession(res, created.id, true);

      const user = await db.get(
        "SELECT id, email, phone, name, role, bio, rating, created_at AS createdAt FROM users WHERE id = ?",
        [created.id],
      );
      const stats = await getUserStats(created.id);

      res.json({ ok: true, user, stats });
    } catch (e) {
      if (String(e?.message) === "PASSWORD_TOO_SHORT") return jsonError(res, 400, "PASSWORD_TOO_SHORT");
      console.error(e);
      jsonError(res, 500, "SERVER_ERROR");
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const identifier = req.body?.identifier;
      const password = req.body?.password;
      const remember = Boolean(req.body?.remember);

      const parsed = auth.parseIdentifier(identifier);
      if (!parsed.kind) return jsonError(res, 400, "EMAIL_OR_PHONE_REQUIRED");

      const user = await db.get(
        parsed.kind === "email"
          ? "SELECT id, email, phone, name, role, bio, rating, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE email = ?"
          : "SELECT id, email, phone, name, role, bio, rating, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE phone = ?",
        [parsed.value],
      );

      if (!user) return jsonError(res, 401, "INVALID_CREDENTIALS");
      const ok = await auth.verifyPassword(password, user.passwordHash);
      if (!ok) return jsonError(res, 401, "INVALID_CREDENTIALS");

      await createSession(res, user.id, remember);
      delete user.passwordHash;

      const stats = await getUserStats(user.id);
      res.json({ ok: true, user, stats });
    } catch (e) {
      console.error(e);
      jsonError(res, 500, "SERVER_ERROR");
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      await deleteSession(req, res);
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      jsonError(res, 500, "SERVER_ERROR");
    }
  });

  // --- API: ME ---
  app.get("/api/me", async (req, res) => {
    if (!req.user) return jsonError(res, 401, "AUTH_REQUIRED");
    const stats = await getUserStats(req.user.id);
    res.json({ ok: true, user: req.user, stats });
  });

  app.put("/api/me", requireAuth, async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const role = String(req.body?.role || "").trim();
    const bio = String(req.body?.bio || "").trim();

    if (!name) return jsonError(res, 400, "NAME_REQUIRED");

    await db.run("UPDATE users SET name = ?, role = ?, bio = ? WHERE id = ?", [name, role, bio, req.user.id]);
    req.user = await db.get(
      "SELECT id, email, phone, name, role, bio, rating, created_at AS createdAt FROM users WHERE id = ?",
      [req.user.id],
    );
    const stats = await getUserStats(req.user.id);
    res.json({ ok: true, user: req.user, stats });
  });

  // --- API: PROJECTS ---
  app.get("/api/projects", async (req, res) => {
    // Лента доступна всем, но с авторизацией можно будет показывать "лайкнул/подписан".
    const rows = await db.all(
      `
      SELECT
        p.id,
        p.title,
        p.body,
        p.budget_min AS budgetMin,
        p.budget_max AS budgetMax,
        p.tags,
        p.created_at AS createdAt,
        u.id AS authorId,
        u.name AS authorName,
        u.role AS authorRole,
        (SELECT COUNT(*) FROM likes l WHERE l.project_id = p.id) AS likesCount
      FROM projects p
      JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
      LIMIT 50
      `,
    );
    res.json({ ok: true, items: rows });
  });

  app.post("/api/projects", requireAuth, async (req, res) => {
    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    const tags = String(req.body?.tags || "").trim();
    const budgetMin = req.body?.budgetMin == null ? null : Number(req.body.budgetMin);
    const budgetMax = req.body?.budgetMax == null ? null : Number(req.body.budgetMax);

    if (!title) return jsonError(res, 400, "TITLE_REQUIRED");
    if (!body) return jsonError(res, 400, "BODY_REQUIRED");

    const now = Date.now();
    await db.run(
      "INSERT INTO projects (user_id, title, body, budget_min, budget_max, tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [req.user.id, title, body, Number.isFinite(budgetMin) ? budgetMin : null, Number.isFinite(budgetMax) ? budgetMax : null, tags, now],
    );
    res.json({ ok: true });
  });

  // --- API: FOLLOW ---
  app.post("/api/follow/:userId", requireAuth, async (req, res) => {
    const targetId = Number(req.params.userId);
    if (!Number.isFinite(targetId)) return jsonError(res, 400, "BAD_USER_ID");
    if (targetId === req.user.id) return jsonError(res, 400, "CANNOT_FOLLOW_SELF");

    const existing = await db.get("SELECT 1 AS x FROM follows WHERE follower_id = ? AND followee_id = ?", [
      req.user.id,
      targetId,
    ]);

    if (existing) {
      await db.run("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?", [req.user.id, targetId]);
      return res.json({ ok: true, following: false });
    }

    await db.run("INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)", [req.user.id, targetId, Date.now()]);
    res.json({ ok: true, following: true });
  });

  // --- API: LIKE ---
  app.post("/api/like/:projectId", requireAuth, async (req, res) => {
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) return jsonError(res, 400, "BAD_PROJECT_ID");

    const existing = await db.get("SELECT 1 AS x FROM likes WHERE user_id = ? AND project_id = ?", [req.user.id, projectId]);
    if (existing) {
      await db.run("DELETE FROM likes WHERE user_id = ? AND project_id = ?", [req.user.id, projectId]);
      return res.json({ ok: true, liked: false });
    }

    await db.run("INSERT INTO likes (user_id, project_id, created_at) VALUES (?, ?, ?)", [req.user.id, projectId, Date.now()]);
    res.json({ ok: true, liked: true });
  });

  // --- Static ---
  app.get("/", (req, res) => res.redirect("/index.html"));
  app.use(express.static(path.join(__dirname)));

  app.listen(PORT, () => {
    console.log(`Moneyway: http://localhost:${PORT}`);
  });
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});

