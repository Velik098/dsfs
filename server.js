const path = require("node:path");

const express = require("express");
const cookieParser = require("cookie-parser");

const db = require("./database");
const auth = require("./auth");

const PORT = Number(process.env.PORT || 3000);
const SESSION_COOKIE = "mw_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 РґРЅРµР№
const SESSION_TTL_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000; // 30 РґРЅРµР№


let localRowIdTs = 0;
let localRowIdSeq = 0;
function allocateRowId() {
  const now = Date.now();
  if (now === localRowIdTs) localRowIdSeq = (localRowIdSeq + 1) % 1000;
  else {
    localRowIdTs = now;
    localRowIdSeq = 0;
  }
  return now * 1000 + localRowIdSeq;
}
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

function normalizeProjectCategory(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  // Р”РµСЂР¶РёРј РєР°С‚РµРіРѕСЂРёРё С„РёРєСЃРёСЂРѕРІР°РЅРЅС‹РјРё, С‡С‚РѕР±С‹ С„РёР»СЊС‚СЂС‹ СЂР°Р±РѕС‚Р°Р»Рё РїСЂРµРґСЃРєР°Р·СѓРµРјРѕ.
  const key = raw.toLowerCase();
  if (key === "РґРёР·Р°Р№РЅ") return "Р”РёР·Р°Р№РЅ";
  if (key === "РёРЅС‚РµСЂС„РµР№СЃС‹") return "Р”РёР·Р°Р№РЅ";
  if (key === "Р°РЅРёРјР°С†РёСЏ") return "Р”РёР·Р°Р№РЅ";
  if (key === "РІРµР±") return "Р’РµР±";
  if (key === "Р±СЂРµРЅРґ") return "Р‘СЂРµРЅРґ";
  if (key === "Р±СЂРµРЅРґРёРЅРі") return "Р‘СЂРµРЅРґ";
  if (key === "РїСЂРѕРґСѓРєС‚") return "РџСЂРѕРґСѓРєС‚";
  return null;
}


function normalizeUsername(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return { value: null, error: null };

  const normalized = raw.startsWith("@") ? raw.slice(1) : raw;
  const username = normalized.toLowerCase();

  if (username.length < 3 || username.length > 32) {
    return { value: null, error: "USERNAME_INVALID" };
  }

  if (!/^[a-z0-9._]+$/.test(username)) {
    return { value: null, error: "USERNAME_INVALID" };
  }

  if (/^[._]|[._]$/.test(username) || username.includes("..") || username.includes("__") || username.includes("._") || username.includes("_.")) {
    return { value: null, error: "USERNAME_INVALID" };
  }

  return { value: username, error: null };
}

function normalizePollInput(rawPoll) {
  if (rawPoll == null) return { poll: null, error: null };
  if (typeof rawPoll !== "object") return { poll: null, error: "BAD_POLL" };

  const rawType = String(rawPoll.type || "regular").trim().toLowerCase();
  let type = "regular";
  if (rawType === "anonymous" || rawType === "anon") type = "anonymous";
  else if (rawType === "quiz") type = "quiz";

  const rawOptions = Array.isArray(rawPoll.options) ? rawPoll.options : [];
  const options = rawOptions
    .map((x) => String(x || "").trim())
    .filter((x) => x.length > 0);

  if (options.length < 2 || options.length > 8) return { poll: null, error: "BAD_POLL_OPTIONS" };
  if (options.some((x) => x.length > 120)) return { poll: null, error: "BAD_POLL_OPTION_TEXT" };

  const lowered = new Set();
  for (const opt of options) {
    const k = opt.toLowerCase();
    if (lowered.has(k)) return { poll: null, error: "BAD_POLL_OPTIONS_DUP" };
    lowered.add(k);
  }

  let correctOptionIndex = null;
  if (type === "quiz") {
    const idx = Number(rawPoll.correctOptionIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) return { poll: null, error: "BAD_POLL_QUIZ_ANSWER" };
    correctOptionIndex = idx;
  }

  return { poll: { type, options, correctOptionIndex }, error: null };
}

async function fetchPollForPost(post, viewerUserId, forceRevealCorrect = false) {
  const postId = Number(post?.id || 0);
  const pollType = String(post?.pollType || "").trim().toLowerCase();
  if (!Number.isFinite(postId) || postId <= 0 || !pollType) return null;

  const options = await db.all(
    `
    SELECT
      o.id,
      o.label,
      o.position,
      (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id) AS votesCount
    FROM poll_options o
    WHERE o.post_id = ?
    ORDER BY o.position ASC, o.id ASC
    `,
    [postId],
  );

  if (!Array.isArray(options) || !options.length) return null;

  const viewerId = Number(viewerUserId || 0);
  let myVoteOptionId = null;
  if (Number.isFinite(viewerId) && viewerId > 0) {
    const vote = await db.get("SELECT option_id AS optionId FROM poll_votes WHERE post_id = ? AND user_id = ?", [postId, viewerId]);
    if (vote?.optionId != null) myVoteOptionId = Number(vote.optionId) || null;
  }

  const totalVotes = options.reduce((acc, x) => acc + Number(x?.votesCount || 0), 0);
  const correctOptionId = post?.pollCorrectOptionId == null ? null : Number(post.pollCorrectOptionId || 0) || null;

  const authorId = Number(post?.authorId || post?.postUserId || post?.userId || 0);
  const revealCorrect =
    pollType === "quiz" &&
    (forceRevealCorrect || myVoteOptionId != null || (Number.isFinite(viewerId) && viewerId > 0 && viewerId === authorId));

  return {
    type: pollType,
    isAnonymous: pollType === "anonymous",
    isQuiz: pollType === "quiz",
    totalVotes: Number(totalVotes || 0),
    myVoteOptionId,
    correctOptionId: revealCorrect ? correctOptionId : null,
    options: options.map((x) => ({
      id: Number(x.id),
      label: String(x.label || ""),
      votesCount: Number(x.votesCount || 0),
      isMyVote: myVoteOptionId != null && Number(x.id) === Number(myVoteOptionId),
    })),
  };
}

async function enrichPostsWithPoll(rows, viewerUserId, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const forceRevealCorrect = Boolean(opts?.forceRevealCorrect);

  for (const item of list) {
    item.poll = await fetchPollForPost(item, viewerUserId, forceRevealCorrect);
  }

  return list;
}

function normalizeProfileImageData(imageData, maxLen) {
  const raw = imageData == null ? "" : String(imageData || "").trim();
  if (!raw) return null;
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(raw)) return "__BAD_IMAGE__";
  if (raw.length > maxLen) return "__IMAGE_TOO_LARGE__";
  return raw;
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
    "SELECT id, email, phone, name, username, role, bio, rating, avatar_data AS avatarData, cover_data AS coverData, created_at AS createdAt FROM users WHERE id = ?",
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
  // Р•СЃР»Рё РІ Р‘Р” СѓР¶Рµ РµСЃС‚СЊ РґРµРјРѕ-РґР°РЅРЅС‹Рµ (projects/follows/likes), РЅРѕ С‚Р°Р±Р»РёС†Р° users РїСѓСЃС‚Р°СЏ/СЃР±СЂРѕС€РµРЅР°,
  // РЅРѕРІС‹Р№ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РјРѕР¶РµС‚ РїРѕР»СѓС‡РёС‚СЊ id=1 Рё "СѓРЅР°СЃР»РµРґРѕРІР°С‚СЊ" С‡СѓР¶РёРµ РїСЂРѕРµРєС‚С‹/РїРѕРґРїРёСЃРєРё.
  // Р§С‚РѕР±С‹ РЅРѕРІС‹Р№ Р°РєРєР°СѓРЅС‚ РІСЃРµРіРґР° РЅР°С‡РёРЅР°Р»СЃСЏ СЃ РЅСѓР»СЏ, РІС‹Р±РёСЂР°РµРј id РІС‹С€Рµ Р»СЋР±РѕРіРѕ СѓР¶Рµ РёСЃРїРѕР»СЊР·СѓРµРјРѕРіРѕ.
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

  // Р”Р»СЏ РїРѕСЃС‚РѕРІ СЃ РєР°СЂС‚РёРЅРєР°РјРё (data URL) РЅСѓР¶РµРЅ Р±РѕР»СЊС€РёР№ Р»РёРјРёС‚.
  app.use(express.json({ limit: "3mb" }));
  app.use(cookieParser());

  // РђРІС‚РѕСЂРёР·Р°С†РёСЏ РЅР° РєР°Р¶РґРѕРј Р·Р°РїСЂРѕСЃРµ (РЅРµРґРѕСЂРѕРіРѕ РґР»СЏ MVP).
  app.use(async (req, res, next) => {
    try {
      req.user = await loadUserFromSession(req);
      next();
    } catch (e) {
      // Р’ СЃР»СѓС‡Р°Рµ РїСЂРѕР±Р»РµРј СЃ Р‘Р” вЂ” РЅРµ РїР°РґР°РµРј Р±РµР»С‹Рј СЌРєСЂР°РЅРѕРј.
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

      // РЈРЅРёРєР°Р»СЊРЅРѕСЃС‚СЊ.
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
        "INSERT INTO users (id, email, phone, password_hash, name, username, role, bio, rating, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [newId, email, phone, passwordHash, name, null, role, "", 0, now],
      );

      await createSession(res, newId, true);

      const user = await db.get(
        "SELECT id, email, phone, name, username, role, bio, rating, avatar_data AS avatarData, cover_data AS coverData, created_at AS createdAt FROM users WHERE id = ?",
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
          ? "SELECT id, email, phone, name, username, role, bio, rating, avatar_data AS avatarData, cover_data AS coverData, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE email = ?"
          : "SELECT id, email, phone, name, username, role, bio, rating, avatar_data AS avatarData, cover_data AS coverData, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE phone = ?",
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
    const normalizedUsername = normalizeUsername(req.body?.username);

    if (!name) return jsonError(res, 400, "NAME_REQUIRED");
    if (normalizedUsername.error) return jsonError(res, 400, normalizedUsername.error);

    const username = normalizedUsername.value;
    if (username) {
      const existing = await db.get("SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?", [username, req.user.id]);
      if (existing) return jsonError(res, 409, "USERNAME_TAKEN");
    }

    await db.run("UPDATE users SET name = ?, username = ?, role = ?, bio = ? WHERE id = ?", [name, username, role, bio, req.user.id]);
    req.user = await db.get(
      "SELECT id, email, phone, name, username, role, bio, rating, avatar_data AS avatarData, cover_data AS coverData, created_at AS createdAt FROM users WHERE id = ?",
      [req.user.id],
    );
    const stats = await getUserStats(req.user.id);
    res.json({ ok: true, user: req.user, stats });
  });

  app.put("/api/me/avatar", requireAuth, async (req, res) => {
    const next = normalizeProfileImageData(req.body?.imageData, 750_000);
    if (next === "__BAD_IMAGE__") return jsonError(res, 400, "BAD_IMAGE");
    if (next === "__IMAGE_TOO_LARGE__") return jsonError(res, 400, "IMAGE_TOO_LARGE");

    await db.run("UPDATE users SET avatar_data = ? WHERE id = ?", [next, req.user.id]);
    req.user = await db.get(
      "SELECT id, email, phone, name, username, role, bio, rating, avatar_data AS avatarData, cover_data AS coverData, created_at AS createdAt FROM users WHERE id = ?",
      [req.user.id],
    );
    const stats = await getUserStats(req.user.id);
    res.json({ ok: true, user: req.user, stats });
  });

  app.put("/api/me/cover", requireAuth, async (req, res) => {
    const next = normalizeProfileImageData(req.body?.imageData, 2_000_000);
    if (next === "__BAD_IMAGE__") return jsonError(res, 400, "BAD_IMAGE");
    if (next === "__IMAGE_TOO_LARGE__") return jsonError(res, 400, "IMAGE_TOO_LARGE");

    await db.run("UPDATE users SET cover_data = ? WHERE id = ?", [next, req.user.id]);
    req.user = await db.get(
      "SELECT id, email, phone, name, username, role, bio, rating, avatar_data AS avatarData, cover_data AS coverData, created_at AS createdAt FROM users WHERE id = ?",
      [req.user.id],
    );
    const stats = await getUserStats(req.user.id);
    res.json({ ok: true, user: req.user, stats });
  });

  // --- API: USERS (РїСѓР±Р»РёС‡РЅС‹Рµ РїСЂРѕС„РёР»Рё) ---
  app.get("/api/users/suggested", async (req, res) => {
    const limit = Math.max(1, Math.min(10, Number(req.query?.limit || 3)));
    const meId = req.user?.id || null;

    const rows = await db.all(
      `
      SELECT
        u.id,
        u.name,
        u.username,
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
        AND u.name NOT LIKE '%пїЅ%'
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

    // Р‘РµР·РѕРїР°СЃРЅРѕ: РѕС‚РґР°С‘Рј С‚РѕР»СЊРєРѕ РїСѓР±Р»РёС‡РЅС‹Рµ РїРѕР»СЏ (Р±РµР· email/phone).
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
      SELECT id, name, username, role, rating, created_at AS createdAt
      FROM users
      WHERE
        id != ?
        AND name IS NOT NULL
        AND LENGTH(TRIM(name)) > 0
        AND name NOT LIKE '%?%'
        AND name NOT LIKE '%пїЅ%'
        AND (
          name LIKE ? OR name LIKE ? OR name LIKE ? OR name LIKE ?
          OR username LIKE ? OR username LIKE ? OR username LIKE ? OR username LIKE ?
          OR role LIKE ? OR role LIKE ? OR role LIKE ? OR role LIKE ?
        )
      ORDER BY created_at DESC
      LIMIT 10
      `,
      [meId, like1, like2, like3, like4, like1, like2, like3, like4, like1, like2, like3, like4],
    );

    res.json({ ok: true, items: rows });
  });

  // --- API: PUBLIC STATS (РґР»СЏ РіР»Р°РІРЅРѕР№, Р±РµР· Р°РІС‚РѕСЂРёР·Р°С†РёРё) ---
  app.get("/api/public/stats", async (req, res) => {
    const users = await db.get(
      "SELECT COUNT(*) AS c FROM users WHERE name IS NOT NULL AND LENGTH(TRIM(name)) > 0 AND name NOT LIKE '%?%' AND name NOT LIKE '%пїЅ%'",
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

  // --- API: BADGES (С†РёС„РµСЂРєРё РґР»СЏ С€Р°РїРєРё) ---
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
        n.post_id AS postId,
        n.comment_id AS commentId,
        a.id AS actorId,
        a.name AS actorName,
        p.title AS projectTitle,
        s.body AS postBody
      FROM notifications n
      LEFT JOIN users a ON a.id = n.actor_id
      LEFT JOIN projects p ON p.id = n.project_id
      LEFT JOIN posts s ON s.id = n.post_id
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
      "SELECT id, name, username, role, bio, rating, avatar_data AS avatarData, cover_data AS coverData, created_at AS createdAt FROM users WHERE id = ?",
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

    const meId = req.user?.id ?? null;
    const rows = await db.all(
      `
      SELECT
        p.id,
        p.title,
        p.body,
        p.budget_min AS budgetMin,
        p.budget_max AS budgetMax,
        p.due_date AS dueDate,
        p.category AS category,
        p.tags,
        p.created_at AS createdAt,
        (SELECT COUNT(*) FROM likes l WHERE l.project_id = p.id) AS likesCount,
        (SELECT COUNT(*) FROM comments c WHERE c.project_id = p.id) AS commentsCount,
        (SELECT COUNT(*) FROM reposts r3 WHERE r3.target_type = 'project' AND r3.target_id = p.id) AS repostsCount,
        (SELECT COUNT(*) FROM project_views v WHERE v.project_id = p.id) AS viewsCount,
        EXISTS(SELECT 1 FROM likes l2 WHERE l2.project_id = p.id AND l2.user_id = ?) AS likedByMe,
        EXISTS(SELECT 1 FROM reposts r WHERE r.target_type = 'project' AND r.target_id = p.id AND r.user_id = ?) AS repostedByMe
      FROM projects p
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
      LIMIT 50
      `,
      [meId, meId, id],
    );

    res.json({ ok: true, items: rows });
  });

  app.get("/api/users/:id/posts", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return jsonError(res, 400, "BAD_USER_ID");

    const meId = req.user?.id ?? null;
    const rows = await db.all(
      `
      SELECT
        s.id,
        s.user_id AS postUserId,
        s.body,
        s.image_data AS imageData,
        s.poll_type AS pollType,
        s.poll_correct_option_id AS pollCorrectOptionId,
        s.created_at AS createdAt,
        u.id AS authorId,
        u.name AS authorName,
        u.role AS authorRole,
        (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = s.id) AS likesCount,
        (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = s.id) AS commentsCount,
        (SELECT COUNT(*) FROM reposts r3 WHERE r3.target_type = 'post' AND r3.target_id = s.id) AS repostsCount,
        (SELECT COUNT(*) FROM post_views v WHERE v.post_id = s.id) AS viewsCount,
        EXISTS(SELECT 1 FROM post_likes l2 WHERE l2.post_id = s.id AND l2.user_id = ?) AS likedByMe,
        EXISTS(SELECT 1 FROM reposts r WHERE r.target_type = 'post' AND r.target_id = s.id AND r.user_id = ?) AS repostedByMe
      FROM posts s
      JOIN users u ON u.id = s.user_id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
      LIMIT 100
      `,
      [meId, meId, id],
    );

    const items = await enrichPostsWithPoll(rows, meId);
    res.json({ ok: true, items });
  });

  // --- API: PROJECTS ---
  app.get("/api/projects", async (req, res) => {
    // Р›РµРЅС‚Р° РґРѕСЃС‚СѓРїРЅР° РІСЃРµРј, РЅРѕ СЃ Р°РІС‚РѕСЂРёР·Р°С†РёРµР№ РїРѕРєР°Р·С‹РІР°РµРј likedByMe.
    const meId = req.user?.id ?? null;
    const category = normalizeProjectCategory(req.query?.category);

    const rows = await db.all(
      `
      SELECT
        p.id,
        p.title,
        p.body,
        p.budget_min AS budgetMin,
        p.budget_max AS budgetMax,
        p.due_date AS dueDate,
        p.category AS category,
        p.tags,
        p.created_at AS createdAt,
        u.id AS authorId,
        u.name AS authorName,
        u.role AS authorRole,
        (SELECT COUNT(*) FROM likes l WHERE l.project_id = p.id) AS likesCount,
        (SELECT COUNT(*) FROM comments c WHERE c.project_id = p.id) AS commentsCount,
        (SELECT COUNT(*) FROM reposts r3 WHERE r3.target_type = 'project' AND r3.target_id = p.id) AS repostsCount,
        (SELECT COUNT(*) FROM project_views v WHERE v.project_id = p.id) AS viewsCount,
        EXISTS(SELECT 1 FROM likes l2 WHERE l2.project_id = p.id AND l2.user_id = ?) AS likedByMe,
        EXISTS(SELECT 1 FROM reposts r WHERE r.target_type = 'project' AND r.target_id = p.id AND r.user_id = ?) AS repostedByMe
      FROM projects p
      JOIN users u ON u.id = p.user_id
      WHERE (? IS NULL OR p.category = ?)
      ORDER BY p.created_at DESC
      LIMIT 50
      `,
      [meId, meId, category, category],
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
        p.category AS category,
        p.tags,
        p.created_at AS createdAt,
        (SELECT COUNT(*) FROM likes l WHERE l.project_id = p.id) AS likesCount,
        (SELECT COUNT(*) FROM comments c WHERE c.project_id = p.id) AS commentsCount,
        (SELECT COUNT(*) FROM reposts r3 WHERE r3.target_type = 'project' AND r3.target_id = p.id) AS repostsCount,
        (SELECT COUNT(*) FROM project_views v WHERE v.project_id = p.id) AS viewsCount,
        EXISTS(SELECT 1 FROM likes l2 WHERE l2.project_id = p.id AND l2.user_id = ?) AS likedByMe,
        EXISTS(SELECT 1 FROM reposts r WHERE r.target_type = 'project' AND r.target_id = p.id AND r.user_id = ?) AS repostedByMe
      FROM projects p
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
      LIMIT 100
      `,
      [req.user.id, req.user.id, req.user.id],
    );
    res.json({ ok: true, items: rows });
  });

  app.post("/api/projects", requireAuth, async (req, res) => {
    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    const category = normalizeProjectCategory(req.body?.category);
    const tags = String(req.body?.tags || "").trim();
    const budgetMin = req.body?.budgetMin == null ? null : Number(req.body.budgetMin);
    const budgetMax = req.body?.budgetMax == null ? null : Number(req.body.budgetMax);
    const dueDate = req.body?.dueDate == null ? null : String(req.body.dueDate || "").trim();

    if (!title) return jsonError(res, 400, "TITLE_REQUIRED");
    if (!body) return jsonError(res, 400, "BODY_REQUIRED");

    const now = Date.now();
    await db.run(
      "INSERT INTO projects (user_id, title, body, budget_min, budget_max, due_date, category, tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        req.user.id,
        title,
        body,
        Number.isFinite(budgetMin) ? budgetMin : null,
        Number.isFinite(budgetMax) ? budgetMax : null,
        dueDate || null,
        category,
        tags,
        now,
      ],
    );
    res.json({ ok: true });
  });

  app.put("/api/projects/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return jsonError(res, 400, "BAD_PROJECT_ID");

    const existing = await db.get("SELECT id, user_id AS userId, category FROM projects WHERE id = ?", [id]);
    if (!existing) return jsonError(res, 404, "NOT_FOUND");
    if (Number(existing.userId) !== req.user.id) return jsonError(res, 403, "FORBIDDEN");

    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    const categoryRaw = req.body?.category;
    const category = categoryRaw === undefined ? undefined : normalizeProjectCategory(categoryRaw);
    const nextCategory = category === undefined ? (existing.category == null ? null : String(existing.category)) : category;
    const tags = String(req.body?.tags || "").trim();
    const budgetMin = req.body?.budgetMin == null ? null : Number(req.body.budgetMin);
    const budgetMax = req.body?.budgetMax == null ? null : Number(req.body.budgetMax);
    const dueDate = req.body?.dueDate == null ? null : String(req.body.dueDate || "").trim();

    if (!title) return jsonError(res, 400, "TITLE_REQUIRED");
    if (!body) return jsonError(res, 400, "BODY_REQUIRED");

    await db.run("UPDATE projects SET title = ?, body = ?, budget_min = ?, budget_max = ?, due_date = ?, category = ?, tags = ? WHERE id = ?", [
      title,
      body,
      Number.isFinite(budgetMin) ? budgetMin : null,
      Number.isFinite(budgetMax) ? budgetMax : null,
      dueDate || null,
      nextCategory,
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

    const commentId = allocateRowId();
    await db.run("INSERT INTO comments (id, project_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)", [
      commentId,
      id,
      req.user.id,
      body,
      Date.now(),
    ]);
    if (Number(project.userId) !== req.user.id) {
      await db.run(
        "INSERT INTO notifications (user_id, type, actor_id, project_id, comment_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [project.userId, "comment", req.user.id, id, commentId || null, Date.now()],
      );
    }

    res.json({ ok: true });
  });

  // --- API: POSTS (С‚РµРєСЃС‚ + РєР°СЂС‚РёРЅРєР°) ---
  app.get("/api/posts", async (req, res) => {
    const meId = req.user?.id ?? null;
    const limit = Math.max(1, Math.min(100, Number(req.query?.limit || 50)));

    const rows = await db.all(
      `
      SELECT
        s.id,
        s.user_id AS postUserId,
        s.body,
        s.image_data AS imageData,
        s.poll_type AS pollType,
        s.poll_correct_option_id AS pollCorrectOptionId,
        s.created_at AS createdAt,
        u.id AS authorId,
        u.name AS authorName,
        u.role AS authorRole,
        (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = s.id) AS likesCount,
        (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = s.id) AS commentsCount,
        (SELECT COUNT(*) FROM reposts r3 WHERE r3.target_type = 'post' AND r3.target_id = s.id) AS repostsCount,
        (SELECT COUNT(*) FROM post_views v WHERE v.post_id = s.id) AS viewsCount,
        EXISTS(SELECT 1 FROM post_likes l2 WHERE l2.post_id = s.id AND l2.user_id = ?) AS likedByMe,
        EXISTS(SELECT 1 FROM reposts r WHERE r.target_type = 'post' AND r.target_id = s.id AND r.user_id = ?) AS repostedByMe
      FROM posts s
      JOIN users u ON u.id = s.user_id
      ORDER BY s.created_at DESC
      LIMIT ?
      `,
      [meId, meId, limit],
    );

    const items = await enrichPostsWithPoll(rows, meId);
    res.json({ ok: true, items });
  });

  app.get("/api/my/posts", requireAuth, async (req, res) => {
    const rows = await db.all(
      `
      SELECT
        s.id,
        s.user_id AS postUserId,
        s.body,
        s.image_data AS imageData,
        s.poll_type AS pollType,
        s.poll_correct_option_id AS pollCorrectOptionId,
        s.created_at AS createdAt,
        (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = s.id) AS likesCount,
        (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = s.id) AS commentsCount,
        (SELECT COUNT(*) FROM reposts r3 WHERE r3.target_type = 'post' AND r3.target_id = s.id) AS repostsCount,
        (SELECT COUNT(*) FROM post_views v WHERE v.post_id = s.id) AS viewsCount,
        EXISTS(SELECT 1 FROM post_likes l2 WHERE l2.post_id = s.id AND l2.user_id = ?) AS likedByMe,
        EXISTS(SELECT 1 FROM reposts r WHERE r.target_type = 'post' AND r.target_id = s.id AND r.user_id = ?) AS repostedByMe
      FROM posts s
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
      LIMIT 100
      `,
      [req.user.id, req.user.id, req.user.id],
    );
    const items = await enrichPostsWithPoll(rows, req.user.id);
    res.json({ ok: true, items });
  });

  app.get("/api/my/likes", requireAuth, async (req, res) => {
    const meId = req.user.id;
    const limit = Math.max(1, Math.min(200, Number(req.query?.limit || 100)));

    const postRows = await db.all(
      `
      SELECT
        'post' AS kind,
        p.id,
        p.body,
        p.image_data AS imageData,
        p.created_at AS createdAt,
        pl.created_at AS likedAt,
        u.id AS authorId,
        u.name AS authorName
      FROM post_likes pl
      JOIN posts p ON p.id = pl.post_id
      JOIN users u ON u.id = p.user_id
      WHERE pl.user_id = ?
      ORDER BY pl.created_at DESC
      LIMIT ?
      `,
      [meId, limit],
    );

    const projectRows = await db.all(
      `
      SELECT
        'project' AS kind,
        pr.id,
        pr.title,
        pr.body,
        pr.budget_min AS budgetMin,
        pr.budget_max AS budgetMax,
        pr.due_date AS dueDate,
        pr.category,
        pr.tags,
        pr.created_at AS createdAt,
        l.created_at AS likedAt,
        u.id AS authorId,
        u.name AS authorName
      FROM likes l
      JOIN projects pr ON pr.id = l.project_id
      JOIN users u ON u.id = pr.user_id
      WHERE l.user_id = ?
      ORDER BY l.created_at DESC
      LIMIT ?
      `,
      [meId, limit],
    );

    const items = [...postRows, ...projectRows]
      .map((x) => ({ ...x, likedAt: Number(x?.likedAt || 0) }))
      .sort((a, b) => Number(b.likedAt || 0) - Number(a.likedAt || 0))
      .slice(0, limit);

    res.json({ ok: true, items });
  });

  app.post("/api/posts/:id/view", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return jsonError(res, 400, "BAD_POST_ID");

    let viewerId = String(req.headers["x-viewer-id"] || "").trim();
    if (!viewerId && req.user?.id) viewerId = `u${req.user.id}`;
    if (!viewerId) return jsonError(res, 400, "VIEWER_REQUIRED");
    if (viewerId.length < 8 || viewerId.length > 120) return jsonError(res, 400, "BAD_VIEWER");
    if (!/^[A-Za-z0-9_-]+$/.test(viewerId)) return jsonError(res, 400, "BAD_VIEWER");

    const post = await db.get("SELECT id FROM posts WHERE id = ?", [id]);
    if (!post) return jsonError(res, 404, "NOT_FOUND");

    await db.run("INSERT OR IGNORE INTO post_views (viewer_id, post_id, created_at) VALUES (?, ?, ?)", [
      viewerId,
      id,
      Date.now(),
    ]);

    const count = await db.get("SELECT COUNT(*) AS c FROM post_views WHERE post_id = ?", [id]);
    res.json({ ok: true, viewsCount: Number(count?.c || 0) });
  });

  app.post("/api/projects/:id/view", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return jsonError(res, 400, "BAD_PROJECT_ID");

    let viewerId = String(req.headers["x-viewer-id"] || "").trim();
    if (!viewerId && req.user?.id) viewerId = `u${req.user.id}`;
    if (!viewerId) return jsonError(res, 400, "VIEWER_REQUIRED");
    if (viewerId.length < 8 || viewerId.length > 120) return jsonError(res, 400, "BAD_VIEWER");
    if (!/^[A-Za-z0-9_-]+$/.test(viewerId)) return jsonError(res, 400, "BAD_VIEWER");

    const project = await db.get("SELECT id FROM projects WHERE id = ?", [id]);
    if (!project) return jsonError(res, 404, "NOT_FOUND");

    await db.run("INSERT OR IGNORE INTO project_views (viewer_id, project_id, created_at) VALUES (?, ?, ?)", [
      viewerId,
      id,
      Date.now(),
    ]);

    const count = await db.get("SELECT COUNT(*) AS c FROM project_views WHERE project_id = ?", [id]);
    res.json({ ok: true, viewsCount: Number(count?.c || 0) });
  });

  app.post("/api/posts", requireAuth, async (req, res) => {
    const body = String(req.body?.body || "").trim();
    const imageData = req.body?.imageData == null ? null : String(req.body.imageData || "").trim();

    const normalizedPoll = normalizePollInput(req.body?.poll);
    if (normalizedPoll.error) return jsonError(res, 400, normalizedPoll.error);
    const poll = normalizedPoll.poll;

    if (!body && !imageData && !poll) return jsonError(res, 400, "BODY_IMAGE_OR_POLL_REQUIRED");
    if (poll && !body) return jsonError(res, 400, "POLL_QUESTION_REQUIRED");
    if (body.length > 4000) return jsonError(res, 400, "BODY_TOO_LONG");

    let storedImage = null;
    if (imageData) {
      if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(imageData)) return jsonError(res, 400, "BAD_IMAGE");
      if (imageData.length > 1_700_000) return jsonError(res, 400, "IMAGE_TOO_LARGE");
      storedImage = imageData;
    }

    const now = Date.now();
    const postId = allocateRowId();
    try {
      await db.run(
        "INSERT INTO posts (id, user_id, body, image_data, poll_type, poll_correct_option_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [postId, req.user.id, body, storedImage, poll ? poll.type : null, null, now],
      );

      if (poll) {
        const optionIds = [];
        for (let i = 0; i < poll.options.length; i += 1) {
          const optionId = allocateRowId();
          await db.run("INSERT INTO poll_options (id, post_id, label, position, created_at) VALUES (?, ?, ?, ?, ?)", [
            optionId,
            postId,
            poll.options[i],
            i,
            now,
          ]);
          optionIds.push(optionId);
        }

        if (optionIds.length < 2) {
          await db.run("DELETE FROM posts WHERE id = ?", [postId]);
          return jsonError(res, 400, "BAD_POLL_OPTIONS");
        }

        if (poll.type === "quiz") {
          const correctOptionId = optionIds[poll.correctOptionIndex] || null;
          if (!correctOptionId) {
            await db.run("DELETE FROM posts WHERE id = ?", [postId]);
            return jsonError(res, 400, "BAD_POLL_QUIZ_ANSWER");
          }
          await db.run("UPDATE posts SET poll_correct_option_id = ? WHERE id = ?", [correctOptionId, postId]);
        }
      }
    } catch (err) {
      try {
        await db.run("DELETE FROM posts WHERE id = ?", [postId]);
      } catch {
        // ignore cleanup errors
      }
      throw err;
    }

    res.json({ ok: true, postId });
  });

  app.put("/api/posts/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return jsonError(res, 400, "BAD_POST_ID");

    const existing = await db.get("SELECT id, user_id AS userId, image_data AS imageData, poll_type AS pollType FROM posts WHERE id = ?", [id]);
    if (!existing) return jsonError(res, 404, "NOT_FOUND");
    if (Number(existing.userId) !== req.user.id) return jsonError(res, 403, "FORBIDDEN");

    const body = String(req.body?.body || "").trim();
    const imageDataRaw = req.body?.imageData;
    const imageData = imageDataRaw === undefined ? undefined : String(imageDataRaw || "").trim();

    if (body.length > 4000) return jsonError(res, 400, "BODY_TOO_LONG");

    let nextImage = existing.imageData == null ? null : String(existing.imageData);
    if (imageData !== undefined) {
      if (!imageData) nextImage = null;
      else {
        if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(imageData)) return jsonError(res, 400, "BAD_IMAGE");
        if (imageData.length > 1_700_000) return jsonError(res, 400, "IMAGE_TOO_LARGE");
        nextImage = imageData;
      }
    }

    // РќРµР»СЊР·СЏ СЃРѕС…СЂР°РЅРёС‚СЊ РїРѕР»РЅРѕСЃС‚СЊСЋ РїСѓСЃС‚РѕР№ РїРѕСЃС‚ (Р±РµР· С‚РµРєСЃС‚Р° Рё Р±РµР· РєР°СЂС‚РёРЅРєРё).
    if (!body && !nextImage && !existing.pollType) return jsonError(res, 400, "BODY_OR_IMAGE_REQUIRED");

    await db.run("UPDATE posts SET body = ?, image_data = ? WHERE id = ?", [body, nextImage, id]);
    res.json({ ok: true });
  });

  app.delete("/api/posts/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return jsonError(res, 400, "BAD_POST_ID");

    const existing = await db.get("SELECT id, user_id AS userId FROM posts WHERE id = ?", [id]);
    if (!existing) return jsonError(res, 404, "NOT_FOUND");
    if (Number(existing.userId) !== req.user.id) return jsonError(res, 403, "FORBIDDEN");

    await db.run("DELETE FROM posts WHERE id = ?", [id]);
    res.json({ ok: true });
  });

  app.post("/api/post-like/:postId", requireAuth, async (req, res) => {
    const postId = Number(req.params.postId);
    if (!Number.isFinite(postId)) return jsonError(res, 400, "BAD_POST_ID");

    const post = await db.get("SELECT id, user_id AS userId FROM posts WHERE id = ?", [postId]);
    if (!post) return jsonError(res, 404, "NOT_FOUND");

    const existing = await db.get("SELECT 1 AS x FROM post_likes WHERE user_id = ? AND post_id = ?", [req.user.id, postId]);
    if (existing) {
      await db.run("DELETE FROM post_likes WHERE user_id = ? AND post_id = ?", [req.user.id, postId]);
      const count = await db.get("SELECT COUNT(*) AS c FROM post_likes WHERE post_id = ?", [postId]);
      return res.json({ ok: true, liked: false, likesCount: Number(count?.c || 0) });
    }

    await db.run("INSERT INTO post_likes (user_id, post_id, created_at) VALUES (?, ?, ?)", [req.user.id, postId, Date.now()]);
    if (Number(post.userId) !== req.user.id) {
      await db.run(
        "INSERT INTO notifications (user_id, type, actor_id, post_id, created_at) VALUES (?, ?, ?, ?, ?)",
        [post.userId, "like", req.user.id, postId, Date.now()],
      );
    }
    const count = await db.get("SELECT COUNT(*) AS c FROM post_likes WHERE post_id = ?", [postId]);
    res.json({ ok: true, liked: true, likesCount: Number(count?.c || 0) });
  });

  app.post("/api/posts/:id/poll-vote", requireAuth, async (req, res) => {
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId)) return jsonError(res, 400, "BAD_POST_ID");

    const optionId = Number(req.body?.optionId);
    if (!Number.isFinite(optionId)) return jsonError(res, 400, "BAD_OPTION_ID");

    const post = await db.get(
      "SELECT id, user_id AS postUserId, poll_type AS pollType, poll_correct_option_id AS pollCorrectOptionId FROM posts WHERE id = ?",
      [postId],
    );
    if (!post) return jsonError(res, 404, "NOT_FOUND");
    if (!post.pollType) return jsonError(res, 400, "NO_POLL");

    const opt = await db.get("SELECT id FROM poll_options WHERE id = ? AND post_id = ?", [optionId, postId]);
    if (!opt) return jsonError(res, 400, "BAD_OPTION_ID");

    await db.run("INSERT OR REPLACE INTO poll_votes (post_id, option_id, user_id, created_at) VALUES (?, ?, ?, ?)", [
      postId,
      optionId,
      req.user.id,
      Date.now(),
    ]);

    const poll = await fetchPollForPost(
      {
        id: postId,
        pollType: post.pollType,
        pollCorrectOptionId: post.pollCorrectOptionId,
        postUserId: post.postUserId,
      },
      req.user.id,
      true,
    );

    res.json({ ok: true, poll });
  });

  app.get("/api/posts/:id/comments", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return jsonError(res, 400, "BAD_POST_ID");

    const rows = await db.all(
      `
      SELECT
        c.id,
        c.body,
        c.created_at AS createdAt,
        u.id AS authorId,
        u.name AS authorName
      FROM post_comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
      LIMIT 200
      `,
      [id],
    );
    res.json({ ok: true, items: rows });
  });

  app.post("/api/posts/:id/comments", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return jsonError(res, 400, "BAD_POST_ID");

    const body = String(req.body?.body || "").trim();
    if (!body) return jsonError(res, 400, "BODY_REQUIRED");
    if (body.length > 2000) return jsonError(res, 400, "BODY_TOO_LONG");

    const post = await db.get("SELECT id, user_id AS userId FROM posts WHERE id = ?", [id]);
    if (!post) return jsonError(res, 404, "NOT_FOUND");

    await db.run("INSERT INTO post_comments (post_id, user_id, body, created_at) VALUES (?, ?, ?, ?)", [
      id,
      req.user.id,
      body,
      Date.now(),
    ]);

    if (Number(post.userId) !== req.user.id) {
      await db.run(
        "INSERT INTO notifications (user_id, type, actor_id, post_id, created_at) VALUES (?, ?, ?, ?, ?)",
        [post.userId, "comment", req.user.id, id, Date.now()],
      );
    }

    res.json({ ok: true });
  });

  // --- API: REPOST (РїСЂРѕРµРєС‚С‹/РїРѕСЃС‚С‹) ---
  app.post("/api/repost", requireAuth, async (req, res) => {
    const type = String(req.body?.type || "").trim().toLowerCase();
    const id = Number(req.body?.id);
    if (!Number.isFinite(id)) return jsonError(res, 400, "BAD_TARGET_ID");
    if (type !== "project" && type !== "post") return jsonError(res, 400, "BAD_TARGET_TYPE");

    if (type === "project") {
      const p = await db.get("SELECT id FROM projects WHERE id = ?", [id]);
      if (!p) return jsonError(res, 404, "NOT_FOUND");
    } else {
      const s = await db.get("SELECT id FROM posts WHERE id = ?", [id]);
      if (!s) return jsonError(res, 404, "NOT_FOUND");
    }

    const existing = await db.get("SELECT 1 AS x FROM reposts WHERE user_id = ? AND target_type = ? AND target_id = ?", [
      req.user.id,
      type,
      id,
    ]);

    if (existing) {
      await db.run("DELETE FROM reposts WHERE user_id = ? AND target_type = ? AND target_id = ?", [req.user.id, type, id]);
      const count = await db.get("SELECT COUNT(*) AS c FROM reposts WHERE target_type = ? AND target_id = ?", [type, id]);
      return res.json({ ok: true, reposted: false, repostsCount: Number(count?.c || 0) });
    }

    await db.run("INSERT INTO reposts (user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?)", [
      req.user.id,
      type,
      id,
      Date.now(),
    ]);

    const count = await db.get("SELECT COUNT(*) AS c FROM reposts WHERE target_type = ? AND target_id = ?", [type, id]);
    res.json({ ok: true, reposted: true, repostsCount: Number(count?.c || 0) });
  });

  app.get("/api/my/reposts", requireAuth, async (req, res) => {
    const meId = req.user.id;

    const projectRows = await db.all(
      `
      SELECT
        r.target_type AS targetType,
        r.target_id AS targetId,
        r.created_at AS repostedAt,
        p.id,
        p.title,
        p.body,
        p.budget_min AS budgetMin,
        p.budget_max AS budgetMax,
        p.due_date AS dueDate,
        p.category AS category,
        p.tags,
        p.created_at AS createdAt,
        u.id AS authorId,
        u.name AS authorName,
        u.role AS authorRole,
        (SELECT COUNT(*) FROM likes l WHERE l.project_id = p.id) AS likesCount,
        (SELECT COUNT(*) FROM comments c WHERE c.project_id = p.id) AS commentsCount,
        (SELECT COUNT(*) FROM reposts r3 WHERE r3.target_type = 'project' AND r3.target_id = p.id) AS repostsCount,
        (SELECT COUNT(*) FROM project_views v WHERE v.project_id = p.id) AS viewsCount,
        EXISTS(SELECT 1 FROM likes l2 WHERE l2.project_id = p.id AND l2.user_id = ?) AS likedByMe,
        1 AS repostedByMe
      FROM reposts r
      JOIN projects p ON p.id = r.target_id
      JOIN users u ON u.id = p.user_id
      WHERE r.user_id = ? AND r.target_type = 'project'
      ORDER BY r.created_at DESC
      LIMIT 100
      `,
      [meId, meId],
    );

    const postRows = await db.all(
      `
      SELECT
        r.target_type AS targetType,
        r.target_id AS targetId,
        r.created_at AS repostedAt,
        s.id,
        s.body,
        s.image_data AS imageData,
        s.created_at AS createdAt,
        u.id AS authorId,
        u.name AS authorName,
        u.role AS authorRole,
        (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = s.id) AS likesCount,
        (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = s.id) AS commentsCount,
        EXISTS(SELECT 1 FROM post_likes l2 WHERE l2.post_id = s.id AND l2.user_id = ?) AS likedByMe,
        1 AS repostedByMe
      FROM reposts r
      JOIN posts s ON s.id = r.target_id
      JOIN users u ON u.id = s.user_id
      WHERE r.user_id = ? AND r.target_type = 'post'
      ORDER BY r.created_at DESC
      LIMIT 100
      `,
      [meId, meId],
    );

    const items = []
      .concat(projectRows.map((x) => ({ kind: "project", ...x })))
      .concat(postRows.map((x) => ({ kind: "post", ...x })))
      .sort((a, b) => Number(b.repostedAt || 0) - Number(a.repostedAt || 0))
      .slice(0, 100);

    res.json({ ok: true, items });
  });

  // --- API: MESSENGER (1-РЅР°-1) ---
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
    const messageId = allocateRowId();
    await db.run("INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)", [
      messageId,
      id,
      req.user.id,
      body,
      now,
    ]);
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
      const count = await db.get("SELECT COUNT(*) AS c FROM likes WHERE project_id = ?", [projectId]);
      return res.json({ ok: true, liked: false, likesCount: Number(count?.c || 0) });
    }

    await db.run("INSERT INTO likes (user_id, project_id, created_at) VALUES (?, ?, ?)", [req.user.id, projectId, Date.now()]);
    if (Number(project.userId) !== req.user.id) {
      await db.run(
        "INSERT INTO notifications (user_id, type, actor_id, project_id, created_at) VALUES (?, ?, ?, ?, ?)",
        [project.userId, "like", req.user.id, projectId, Date.now()],
      );
    }
    const count = await db.get("SELECT COUNT(*) AS c FROM likes WHERE project_id = ?", [projectId]);
    res.json({ ok: true, liked: true, likesCount: Number(count?.c || 0) });
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
