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
  const rating = await db.get(
    `
    SELECT COUNT(*) AS c
    FROM likes l
    JOIN projects p ON p.id = l.project_id
    WHERE p.user_id = ?
    `,
    [userId],
  );
  return {
    projects: Number(projects?.c || 0),
    followers: Number(followers?.c || 0),
    following: Number(following?.c || 0),
    rating: Number(rating?.c || 0),
  };
}

async function upsertConversationRead(userId, conversationId, lastReadMessageId) {
  const last = Number(lastReadMessageId || 0);
  if (!Number.isFinite(last) || last <= 0) return;

  const existing = await db.get(
    "SELECT last_read_message_id AS lastRead FROM conversation_reads WHERE conversation_id = ? AND user_id = ?",
    [conversationId, userId],
  );

  const next = Math.max(Number(existing?.lastRead || 0), last);
  await db.run(
    "INSERT OR REPLACE INTO conversation_reads (conversation_id, user_id, last_read_message_id, updated_at) VALUES (?, ?, ?, ?)",
    [conversationId, userId, next, Date.now()],
  );
}

async function getUnreadMessageCount(userId) {
  const meId = Number(userId);
  const row = await db.get(
    `
    SELECT COUNT(*) AS c
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.user_id = ?
    WHERE
      (c.user1_id = ? OR c.user2_id = ?)
      AND m.sender_id != ?
      AND m.id > COALESCE(r.last_read_message_id, 0)
    `,
    [meId, meId, meId, meId],
  );
  return Number(row?.c || 0);
}

async function getUnreadNotificationCount(userId) {
  const row = await db.get("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL", [userId]);
  return Number(row?.c || 0);
}

async function getNextUserId() {
  // Если в БД уже есть демо-данные (projects/follows/likes), но таблица users пустая/сброшена,
  // новый пользователь может получить id=1 и "унаследовать" чужие проекты/подписки.
  // Чтобы новый аккаунт всегда начинался с нуля, выбираем id выше любого уже используемого.
  const a = await db.get("SELECT COALESCE(MAX(id), 0) AS m FROM users");
  const b = await db.get("SELECT COALESCE(MAX(user_id), 0) AS m FROM projects");
  const c1 = await db.get("SELECT COALESCE(MAX(follower_id), 0) AS m FROM follows");
  const c2 = await db.get("SELECT COALESCE(MAX(followee_id), 0) AS m FROM follows");
  const d = await db.get("SELECT COALESCE(MAX(user_id), 0) AS m FROM likes");

  const maxId = Math.max(
    Number(a?.m || 0),
    Number(b?.m || 0),
    Number(c1?.m || 0),
    Number(c2?.m || 0),
    Number(d?.m || 0),
  );

  return maxId + 1;
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

      const newId = await getNextUserId();

      await db.run(
        "INSERT INTO users (id, email, phone, password_hash, name, role, bio, rating, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [newId, email, phone, passwordHash, name, role, "", 0, now],
      );

      await createSession(res, newId, true);

      const user = await db.get(
        "SELECT id, email, phone, name, role, bio, rating, created_at AS createdAt FROM users WHERE id = ?",
        [newId],
      );
      const stats = await getUserStats(newId);

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

  // --- API: USERS (публичные профили) ---
  app.get("/api/users/suggested", async (req, res) => {
    const limit = Math.max(1, Math.min(10, Number(req.query?.limit || 3)));
    const meId = req.user?.id || null;

    const rows = await db.all(
      `
      SELECT
        u.id,
        u.name,
        u.role,
        u.rating,
        u.created_at AS createdAt,
        (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) AS followers
      FROM users u
      WHERE
        (? IS NULL OR u.id != ?)
        AND u.name IS NOT NULL
        AND LENGTH(TRIM(u.name)) > 0
        AND u.name NOT LIKE '%?%'
        AND u.name NOT LIKE '%�%'
      ORDER BY u.created_at DESC
      LIMIT ?
      `,
      [meId, meId, limit],
    );

    res.json({ ok: true, items: rows });
  });

  app.get("/api/users/search", requireAuth, async (req, res) => {
    const q = String(req.query?.q || "").trim();
    if (!q) return res.json({ ok: true, items: [] });

    // Безопасно: отдаём только публичные поля (без email/phone).
    const meId = req.user.id;
    const raw = q.slice(0, 60);
    const like1 = `%${raw}%`;
    const like2 = `%${raw.toLowerCase()}%`;
    const like3 = `%${raw.toUpperCase()}%`;
    const like4 = `%${raw
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
      .join(" ")}%`;

    const rows = await db.all(
      `
      SELECT id, name, role, rating, created_at AS createdAt
      FROM users
      WHERE
        id != ?
        AND name IS NOT NULL
        AND LENGTH(TRIM(name)) > 0
        AND name NOT LIKE '%?%'
        AND name NOT LIKE '%�%'
        AND (
          name LIKE ? OR name LIKE ? OR name LIKE ? OR name LIKE ?
          OR role LIKE ? OR role LIKE ? OR role LIKE ? OR role LIKE ?
        )
      ORDER BY created_at DESC
      LIMIT 10
      `,
      [meId, like1, like2, like3, like4, like1, like2, like3, like4],
    );

    res.json({ ok: true, items: rows });
  });

  // --- API: PUBLIC STATS (для главной, без авторизации) ---
  app.get("/api/public/stats", async (req, res) => {
    const users = await db.get(
      "SELECT COUNT(*) AS c FROM users WHERE name IS NOT NULL AND LENGTH(TRIM(name)) > 0 AND name NOT LIKE '%?%' AND name NOT LIKE '%�%'",
    );
    const comments = await db.get("SELECT COUNT(*) AS c FROM comments");

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const projectsToday = await db.get("SELECT COUNT(*) AS c FROM projects WHERE created_at >= ?", [startOfDay]);

    res.json({
      ok: true,
      users: Number(users?.c || 0),
      projectsToday: Number(projectsToday?.c || 0),
      comments: Number(comments?.c || 0),
    });
  });

  // --- API: BADGES (циферки для шапки) ---
  app.get("/api/badges", requireAuth, async (req, res) => {
    const messagesUnread = await getUnreadMessageCount(req.user.id);
    const notificationsUnread = await getUnreadNotificationCount(req.user.id);
    res.json({ ok: true, messagesUnread, notificationsUnread });
  });

  // --- API: NOTIFICATIONS ---
  app.get("/api/notifications", requireAuth, async (req, res) => {
    const limit = Math.max(1, Math.min(100, Number(req.query?.limit || 50)));
    const rows = await db.all(
      `
      SELECT
        n.id,
        n.type,
        n.created_at AS createdAt,
        n.read_at AS readAt,
        n.project_id AS projectId,
        n.comment_id AS commentId,
        a.id AS actorId,
        a.name AS actorName,
        p.title AS projectTitle
      FROM notifications n
      LEFT JOIN users a ON a.id = n.actor_id
      LEFT JOIN projects p ON p.id = n.project_id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT ?
      `,
      [req.user.id, limit],
    );
    res.json({ ok: true, items: rows });
  });

  app.post("/api/notifications/read", requireAuth, async (req, res) => {
    const now = Date.now();
    await db.run("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", [now, req.user.id]);
    res.json({ ok: true });
  });

  app.get("/api/users/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return jsonError(res, 400, "BAD_USER_ID");

    const user = await db.get(
      "SELECT id, name, role, bio, rating, created_at AS createdAt FROM users WHERE id = ?",
      [id],
    );
    if (!user) return jsonError(res, 404, "NOT_FOUND");

    const stats = await getUserStats(id);
    const isFollowing =
      req.user?.id != null
        ? Boolean(await db.get("SELECT 1 AS x FROM follows WHERE follower_id = ? AND followee_id = ?", [req.user.id, id]))
        : false;

    res.json({ ok: true, user, stats, isFollowing });
  });

  app.get("/api/users/:id/projects", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return jsonError(res, 400, "BAD_USER_ID");

    const rows = await db.all(
      `
      SELECT
        p.id,
        p.title,
        p.body,
        p.budget_min AS budgetMin,
        p.budget_max AS budgetMax,
        p.due_date AS dueDate,
        p.tags,
        p.created_at AS createdAt,
        (SELECT COUNT(*) FROM likes l WHERE l.project_id = p.id) AS likesCount,
        (SELECT COUNT(*) FROM comments c WHERE c.project_id = p.id) AS commentsCount
      FROM projects p
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
      LIMIT 50
      `,
      [id],
    );

    res.json({ ok: true, items: rows });
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
        p.due_date AS dueDate,
        p.tags,
        p.created_at AS createdAt,
        u.id AS authorId,
        u.name AS authorName,
        u.role AS authorRole,
        (SELECT COUNT(*) FROM likes l WHERE l.project_id = p.id) AS likesCount,
        (SELECT COUNT(*) FROM comments c WHERE c.project_id = p.id) AS commentsCount
      FROM projects p
      JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
      LIMIT 50
      `,
    );
    res.json({ ok: true, items: rows });
  });

  app.get("/api/my/projects", requireAuth, async (req, res) => {
    const rows = await db.all(
      `
      SELECT
        p.id,
        p.title,
        p.body,
        p.budget_min AS budgetMin,
        p.budget_max AS budgetMax,
        p.due_date AS dueDate,
        p.tags,
        p.created_at AS createdAt,
        (SELECT COUNT(*) FROM likes l WHERE l.project_id = p.id) AS likesCount,
        (SELECT COUNT(*) FROM comments c WHERE c.project_id = p.id) AS commentsCount
      FROM projects p
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
      LIMIT 100
      `,
      [req.user.id],
    );
    res.json({ ok: true, items: rows });
  });

  app.post("/api/projects", requireAuth, async (req, res) => {
    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    const tags = String(req.body?.tags || "").trim();
    const budgetMin = req.body?.budgetMin == null ? null : Number(req.body.budgetMin);
    const budgetMax = req.body?.budgetMax == null ? null : Number(req.body.budgetMax);
    const dueDate = req.body?.dueDate == null ? null : String(req.body.dueDate || "").trim();

    if (!title) return jsonError(res, 400, "TITLE_REQUIRED");
    if (!body) return jsonError(res, 400, "BODY_REQUIRED");

    const now = Date.now();
    await db.run(
      "INSERT INTO projects (user_id, title, body, budget_min, budget_max, due_date, tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        req.user.id,
        title,
        body,
        Number.isFinite(budgetMin) ? budgetMin : null,
        Number.isFinite(budgetMax) ? budgetMax : null,
        dueDate || null,
        tags,
        now,
      ],
    );
    res.json({ ok: true });
  });

  app.put("/api/projects/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return jsonError(res, 400, "BAD_PROJECT_ID");

    const existing = await db.get("SELECT id, user_id AS userId FROM projects WHERE id = ?", [id]);
    if (!existing) return jsonError(res, 404, "NOT_FOUND");
    if (Number(existing.userId) !== req.user.id) return jsonError(res, 403, "FORBIDDEN");

    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    const tags = String(req.body?.tags || "").trim();
    const budgetMin = req.body?.budgetMin == null ? null : Number(req.body.budgetMin);
    const budgetMax = req.body?.budgetMax == null ? null : Number(req.body.budgetMax);
    const dueDate = req.body?.dueDate == null ? null : String(req.body.dueDate || "").trim();

    if (!title) return jsonError(res, 400, "TITLE_REQUIRED");
    if (!body) return jsonError(res, 400, "BODY_REQUIRED");

    await db.run("UPDATE projects SET title = ?, body = ?, budget_min = ?, budget_max = ?, due_date = ?, tags = ? WHERE id = ?", [
      title,
      body,
      Number.isFinite(budgetMin) ? budgetMin : null,
      Number.isFinite(budgetMax) ? budgetMax : null,
      dueDate || null,
      tags,
      id,
    ]);

    res.json({ ok: true });
  });

  app.delete("/api/projects/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return jsonError(res, 400, "BAD_PROJECT_ID");

    const existing = await db.get("SELECT id, user_id AS userId FROM projects WHERE id = ?", [id]);
    if (!existing) return jsonError(res, 404, "NOT_FOUND");
    if (Number(existing.userId) !== req.user.id) return jsonError(res, 403, "FORBIDDEN");

    await db.run("DELETE FROM projects WHERE id = ?", [id]);
    res.json({ ok: true });
  });

  // --- API: COMMENTS ---
  app.get("/api/projects/:id/comments", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return jsonError(res, 400, "BAD_PROJECT_ID");

    const rows = await db.all(
      `
      SELECT
        c.id,
        c.body,
        c.created_at AS createdAt,
        u.id AS authorId,
        u.name AS authorName
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.project_id = ?
      ORDER BY c.created_at ASC
      LIMIT 200
      `,
      [id],
    );

    res.json({ ok: true, items: rows });
  });

  app.post("/api/projects/:id/comments", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return jsonError(res, 400, "BAD_PROJECT_ID");

    const body = String(req.body?.body || "").trim();
    if (!body) return jsonError(res, 400, "BODY_REQUIRED");
    if (body.length > 2000) return jsonError(res, 400, "BODY_TOO_LONG");

    const project = await db.get("SELECT id, user_id AS userId FROM projects WHERE id = ?", [id]);
    if (!project) return jsonError(res, 404, "NOT_FOUND");

    await db.run("INSERT INTO comments (project_id, user_id, body, created_at) VALUES (?, ?, ?, ?)", [
      id,
      req.user.id,
      body,
      Date.now(),
    ]);

    const inserted = await db.get("SELECT last_insert_rowid() AS id");
    const commentId = Number(inserted?.id || 0);
    if (Number(project.userId) !== req.user.id) {
      await db.run(
        "INSERT INTO notifications (user_id, type, actor_id, project_id, comment_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [project.userId, "comment", req.user.id, id, commentId || null, Date.now()],
      );
    }

    res.json({ ok: true });
  });

  // --- API: MESSENGER (1-на-1) ---
  app.get("/api/conversations", requireAuth, async (req, res) => {
    const meId = req.user.id;
    const rows = await db.all(
      `
      SELECT
        c.id,
        c.created_at AS createdAt,
        u.id AS peerId,
        u.name AS peerName,
        u.role AS peerRole,
        (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS lastBody,
        (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS lastAt
      FROM conversations c
      JOIN users u ON u.id = CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END
      WHERE c.user1_id = ? OR c.user2_id = ?
      ORDER BY COALESCE(lastAt, c.created_at) DESC
      LIMIT 100
      `,
      [meId, meId, meId],
    );

    res.json({ ok: true, items: rows });
  });

  app.post("/api/conversations/with/:userId", requireAuth, async (req, res) => {
    const otherId = Number(req.params.userId);
    if (!Number.isFinite(otherId)) return jsonError(res, 400, "BAD_USER_ID");
    if (otherId === req.user.id) return jsonError(res, 400, "CANNOT_MESSAGE_SELF");

    const other = await db.get("SELECT id, name, role FROM users WHERE id = ?", [otherId]);
    if (!other) return jsonError(res, 404, "NOT_FOUND");

    const a = Math.min(req.user.id, otherId);
    const b = Math.max(req.user.id, otherId);

    let conv = await db.get("SELECT id FROM conversations WHERE user1_id = ? AND user2_id = ?", [a, b]);
    if (!conv) {
      await db.run("INSERT OR IGNORE INTO conversations (user1_id, user2_id, created_at) VALUES (?, ?, ?)", [a, b, Date.now()]);
      conv = await db.get("SELECT id FROM conversations WHERE user1_id = ? AND user2_id = ?", [a, b]);
    }

    res.json({ ok: true, id: conv.id, peer: other });
  });

  app.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return jsonError(res, 400, "BAD_CONVERSATION_ID");

    const conv = await db.get("SELECT id FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)", [
      id,
      req.user.id,
      req.user.id,
    ]);
    if (!conv) return jsonError(res, 404, "NOT_FOUND");

    const afterIdRaw = req.query?.afterId;
    const afterId = afterIdRaw == null || afterIdRaw === "" ? null : Number(afterIdRaw);
    const markRead = String(req.query?.markRead || "") === "1" || String(req.query?.markRead || "") === "true";

    const items = await db.all(
      `
      SELECT
        m.id,
        m.body,
        m.created_at AS createdAt,
        m.sender_id AS senderId,
        u.name AS senderName
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE
        m.conversation_id = ?
        AND (? IS NULL OR m.id > ?)
      ORDER BY m.created_at ASC
      LIMIT 500
      `,
      [id, Number.isFinite(afterId) ? afterId : null, Number.isFinite(afterId) ? afterId : null],
    );

    if (markRead && items.length) {
      const maxId = items.reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0);
      await upsertConversationRead(req.user.id, id, maxId);
    }

    res.json({ ok: true, items });
  });

  app.post("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return jsonError(res, 400, "BAD_CONVERSATION_ID");

    const conv = await db.get("SELECT id FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)", [
      id,
      req.user.id,
      req.user.id,
    ]);
    if (!conv) return jsonError(res, 404, "NOT_FOUND");

    const body = String(req.body?.body || "").trim();
    if (!body) return jsonError(res, 400, "BODY_REQUIRED");
    if (body.length > 2000) return jsonError(res, 400, "BODY_TOO_LONG");

    const now = Date.now();
    await db.run("INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)", [
      id,
      req.user.id,
      body,
      now,
    ]);

    const inserted = await db.get("SELECT last_insert_rowid() AS id");
    const messageId = Number(inserted?.id || 0);
    await upsertConversationRead(req.user.id, id, messageId);
    res.json({ ok: true, id: messageId, createdAt: now });
  });

  // --- API: FOLLOW ---
  app.post("/api/follow/:userId", requireAuth, async (req, res) => {
    const targetId = Number(req.params.userId);
    if (!Number.isFinite(targetId)) return jsonError(res, 400, "BAD_USER_ID");
    if (targetId === req.user.id) return jsonError(res, 400, "CANNOT_FOLLOW_SELF");

    const target = await db.get("SELECT id FROM users WHERE id = ?", [targetId]);
    if (!target) return jsonError(res, 404, "NOT_FOUND");

    const existing = await db.get("SELECT 1 AS x FROM follows WHERE follower_id = ? AND followee_id = ?", [
      req.user.id,
      targetId,
    ]);

    if (existing) {
      await db.run("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?", [req.user.id, targetId]);
      return res.json({ ok: true, following: false });
    }

    await db.run("INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)", [req.user.id, targetId, Date.now()]);
    await db.run(
      "INSERT INTO notifications (user_id, type, actor_id, created_at) VALUES (?, ?, ?, ?)",
      [targetId, "follow", req.user.id, Date.now()],
    );
    res.json({ ok: true, following: true });
  });

  // --- API: LIKE ---
  app.post("/api/like/:projectId", requireAuth, async (req, res) => {
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) return jsonError(res, 400, "BAD_PROJECT_ID");

    const project = await db.get("SELECT id, user_id AS userId FROM projects WHERE id = ?", [projectId]);
    if (!project) return jsonError(res, 404, "NOT_FOUND");

    const existing = await db.get("SELECT 1 AS x FROM likes WHERE user_id = ? AND project_id = ?", [req.user.id, projectId]);
    if (existing) {
      await db.run("DELETE FROM likes WHERE user_id = ? AND project_id = ?", [req.user.id, projectId]);
      return res.json({ ok: true, liked: false });
    }

    await db.run("INSERT INTO likes (user_id, project_id, created_at) VALUES (?, ?, ?)", [req.user.id, projectId, Date.now()]);
    if (Number(project.userId) !== req.user.id) {
      await db.run(
        "INSERT INTO notifications (user_id, type, actor_id, project_id, created_at) VALUES (?, ?, ?, ?, ?)",
        [project.userId, "like", req.user.id, projectId, Date.now()],
      );
    }
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
