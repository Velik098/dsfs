const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const initSqlJs = require("sql.js");

const DB_PATH = path.join(__dirname, "db.sqlite");
const SQLJS_DIST = path.join(__dirname, "node_modules", "sql.js", "dist");

let _SQL = null;
let _db = null;

// Простейшая очередь, чтобы избежать параллельных записей в один файл.
let _queue = Promise.resolve();
const withLock = (fn) => {
  _queue = _queue.then(fn, fn);
  return _queue;
};

const toUint8Array = (buf) => new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

function cryptoRandomHex(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}

function getTableColumns(tableName) {
  if (!_db) return new Set();
  const res = _db.exec(`PRAGMA table_info(${tableName});`);
  if (!res || !res.length) return new Set();
  const rows = res[0].values || [];
  // PRAGMA table_info: cid, name, type, notnull, dflt_value, pk
  const names = rows.map((r) => String(r[1]));
  return new Set(names);
}

function safeExec(sql) {
  try {
    _db.exec(sql);
    return true;
  } catch {
    return false;
  }
}

function isCorruptedDatabaseError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("database disk image is malformed") ||
    msg.includes("database schema is malformed") ||
    msg.includes("database schema is corrupt") ||
    msg.includes("file is not a database") ||
    msg.includes("file is encrypted") ||
    msg.includes("malformed")
  );
}

function backupCorruptedDbFile() {
  if (!fs.existsSync(DB_PATH)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${DB_PATH}.corrupt-${stamp}.bak`;
  try {
    fs.renameSync(DB_PATH, backupPath);
    return backupPath;
  } catch {
    try {
      fs.copyFileSync(DB_PATH, backupPath);
      fs.unlinkSync(DB_PATH);
      return backupPath;
    } catch {
      return null;
    }
  }
}

function finalizeDbBoot() {
  _db.exec("PRAGMA foreign_keys = ON;");
  ensureSchema();
  persist();
  return _db;
}

function ensureSchema() {
  // Схема (минимальная для auth/проектов/подписок).
  // Важно: если таблица users существовала со старой схемой, делаем миграцию.

  // Если в БД уже была таблица messages с другой схемой (из старой версии),
  // CREATE TABLE IF NOT EXISTS её не обновит, и новые запросы упадут.
  // Поэтому переносим такую таблицу в legacy и создаём новую.
  const existingMsgCols = getTableColumns("messages");
  const mustRebuildMessages =
    existingMsgCols.size > 0 &&
    (!existingMsgCols.has("conversation_id") ||
      !existingMsgCols.has("sender_id") ||
      !existingMsgCols.has("body") ||
      !existingMsgCols.has("created_at"));

  if (mustRebuildMessages) {
    safeExec("PRAGMA foreign_keys = OFF;");
    const legacy = `messages_legacy_${Date.now()}`;
    safeExec(`ALTER TABLE messages RENAME TO ${legacy};`);
    safeExec("PRAGMA foreign_keys = ON;");
  }

  // Если в БД уже были таблицы с такими именами, но с другой схемой (например, из старой версии),
  // откладываем их в legacy, чтобы не падать при старте.
  const existingConvCols = getTableColumns("conversations");
  if (existingConvCols.size > 0 && (!existingConvCols.has("user1_id") || !existingConvCols.has("user2_id"))) {
    safeExec("PRAGMA foreign_keys = OFF;");
    const legacy = `conversations_legacy_${Date.now()}`;
    safeExec(`ALTER TABLE conversations RENAME TO ${legacy};`);
    safeExec("PRAGMA foreign_keys = ON;");
  }

  const existingReadsCols = getTableColumns("conversation_reads");
  if (
    existingReadsCols.size > 0 &&
    (!existingReadsCols.has("conversation_id") || !existingReadsCols.has("user_id") || !existingReadsCols.has("last_read_message_id"))
  ) {
    safeExec("PRAGMA foreign_keys = OFF;");
    const legacy = `conversation_reads_legacy_${Date.now()}`;
    safeExec(`ALTER TABLE conversation_reads RENAME TO ${legacy};`);
    safeExec("PRAGMA foreign_keys = ON;");
  }

  const existingNotifCols = getTableColumns("notifications");
  if (existingNotifCols.size > 0 && (!existingNotifCols.has("user_id") || !existingNotifCols.has("type") || !existingNotifCols.has("created_at"))) {
    safeExec("PRAGMA foreign_keys = OFF;");
    const legacy = `notifications_legacy_${Date.now()}`;
    safeExec(`ALTER TABLE notifications RENAME TO ${legacy};`);
    safeExec("PRAGMA foreign_keys = ON;");
  }

  const existingUserCols = getTableColumns("users");
  const mustRebuildUsers =
    existingUserCols.size > 0 &&
    (!existingUserCols.has("password_hash") || !existingUserCols.has("name"));

  if (mustRebuildUsers) {
    // Старые данные могли быть демо/локальные. Чтобы не падать 500-ками,
    // переносим возможные поля и сохраняем id, чтобы связи не ломались.
    safeExec("PRAGMA foreign_keys = OFF;");

    const legacy = `users_legacy_${Date.now()}`;
    safeExec(`ALTER TABLE users RENAME TO ${legacy};`);

    _db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT,
        phone TEXT,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        username TEXT,
        role TEXT NOT NULL DEFAULT '',
        bio TEXT NOT NULL DEFAULT '',
        rating INTEGER NOT NULL DEFAULT 0,
        avatar_data TEXT,
        cover_data TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    const legacyCols = getTableColumns(legacy);
    const legacyDump = _db.exec(`SELECT * FROM ${legacy};`);
    if (legacyDump && legacyDump.length) {
      const cols = legacyDump[0].columns;
      const rows = legacyDump[0].values;

      const idx = new Map(cols.map((c, i) => [String(c), i]));
      const get = (row, name) => (idx.has(name) ? row[idx.get(name)] : undefined);

      const insert = _db.prepare(
        "INSERT INTO users (id, email, phone, password_hash, name, username, role, bio, rating, avatar_data, cover_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );

      try {
        for (const row of rows) {
          const id = Number(get(row, "id")) || null;
          const email = legacyCols.has("email") ? get(row, "email") : null;
          const phone = legacyCols.has("phone") ? get(row, "phone") : null;

          const name =
            (legacyCols.has("name") ? get(row, "name") : null) ||
            (legacyCols.has("full_name") ? get(row, "full_name") : null) ||
            "Пользователь";

          const username = legacyCols.has("username") ? get(row, "username") : null;
          const role = legacyCols.has("role") ? get(row, "role") : "";
          const bio = legacyCols.has("bio") ? get(row, "bio") : "";
          const rating = legacyCols.has("rating") ? Number(get(row, "rating") || 0) : 0;
          const avatarData = legacyCols.has("avatar_data") ? get(row, "avatar_data") : null;
          const coverData = legacyCols.has("cover_data") ? get(row, "cover_data") : null;
          const createdAt = legacyCols.has("created_at") ? Number(get(row, "created_at") || 0) : Date.now();

          // Если в старой таблице нет password_hash — ставим заглушку.
          // Такой аккаунт нужно будет создать заново (для MVP это ок).
          const pw =
            (legacyCols.has("password_hash") ? get(row, "password_hash") : null) ||
            (legacyCols.has("password") ? get(row, "password") : null) ||
            `MIGRATED_${cryptoRandomHex(16)}`;

          insert.run([
            id,
            email,
            phone,
            String(pw),
            String(name),
            username == null ? null : String(username),
            String(role || ""),
            String(bio || ""),
            rating,
            avatarData == null ? null : String(avatarData),
            coverData == null ? null : String(coverData),
            createdAt,
          ]);
        }
      } finally {
        insert.free();
      }
    }

    safeExec("PRAGMA foreign_keys = ON;");
  }

  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      username TEXT,
      role TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      rating INTEGER NOT NULL DEFAULT 0,
      avatar_data TEXT,
      cover_data TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      budget_min INTEGER,
      budget_max INTEGER,
      due_date TEXT,
      category TEXT,
      tags TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS follows (
      follower_id INTEGER NOT NULL,
      followee_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (follower_id, followee_id),
      FOREIGN KEY(follower_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(followee_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS likes (
      user_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, project_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user1_id INTEGER NOT NULL,
      user2_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(user1_id, user2_id),
      FOREIGN KEY(user1_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(user2_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversation_reads (
      conversation_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      last_read_message_id INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (conversation_id, user_id),
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      image_data TEXT,
      poll_type TEXT,
      poll_correct_option_id INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS poll_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS poll_votes (
      post_id INTEGER NOT NULL,
      option_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (post_id, user_id),
      FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY(option_id) REFERENCES poll_options(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS post_likes (
      user_id INTEGER NOT NULL,
      post_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, post_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS post_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_views (
      viewer_id TEXT NOT NULL,
      project_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (viewer_id, project_id),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS post_views (
      viewer_id TEXT NOT NULL,
      post_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (viewer_id, post_id),
      FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reposts (
      user_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, target_type, target_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      actor_id INTEGER,
      project_id INTEGER,
      post_id INTEGER,
      comment_id INTEGER,
      created_at INTEGER NOT NULL,
      read_at INTEGER,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY(comment_id) REFERENCES comments(id) ON DELETE CASCADE
    );
  `);

  // Миграции (если таблицы уже существовали со старой схемой).
  const userCols = getTableColumns("users");
  if (!userCols.has("phone")) safeExec("ALTER TABLE users ADD COLUMN phone TEXT;");
  if (!userCols.has("username")) safeExec("ALTER TABLE users ADD COLUMN username TEXT;");
  if (!userCols.has("role")) safeExec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT '';");
  if (!userCols.has("bio")) safeExec("ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';");
  if (!userCols.has("rating")) safeExec("ALTER TABLE users ADD COLUMN rating INTEGER NOT NULL DEFAULT 0;");
  if (!userCols.has("avatar_data")) safeExec("ALTER TABLE users ADD COLUMN avatar_data TEXT;");
  if (!userCols.has("cover_data")) safeExec("ALTER TABLE users ADD COLUMN cover_data TEXT;");
  if (!userCols.has("created_at")) safeExec("ALTER TABLE users ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;");

  // Уникальные индексы мягче, чем констрейнты — и подходят для миграций.
  // Если в БД уже есть дубли, создание индекса может упасть — это ок для MVP.
  safeExec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;");
  safeExec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;");
  safeExec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL AND LENGTH(TRIM(username)) > 0;");

  const projectCols = getTableColumns("projects");
  if (!projectCols.has("due_date")) safeExec("ALTER TABLE projects ADD COLUMN due_date TEXT;");
  if (!projectCols.has("category")) safeExec("ALTER TABLE projects ADD COLUMN category TEXT;");

  const postCols = getTableColumns("posts");
  if (!postCols.has("poll_type")) safeExec("ALTER TABLE posts ADD COLUMN poll_type TEXT;");
  if (!postCols.has("poll_correct_option_id")) safeExec("ALTER TABLE posts ADD COLUMN poll_correct_option_id INTEGER;");

  const notifCols = getTableColumns("notifications");
  if (!notifCols.has("post_id")) safeExec("ALTER TABLE notifications ADD COLUMN post_id INTEGER;");

  const msgCols = getTableColumns("messages");
  if (msgCols.has("conversation_id") && msgCols.has("created_at")) {
    safeExec("CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);");
  }

  safeExec("CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts(user_id, created_at);");
  safeExec("CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);");
  safeExec("CREATE INDEX IF NOT EXISTS idx_poll_options_post_position ON poll_options(post_id, position);");
  safeExec("CREATE INDEX IF NOT EXISTS idx_poll_votes_post_option ON poll_votes(post_id, option_id);");
  safeExec("CREATE INDEX IF NOT EXISTS idx_post_comments_post_created ON post_comments(post_id, created_at);");
  safeExec("CREATE INDEX IF NOT EXISTS idx_project_views_project_created ON project_views(project_id, created_at);");
  safeExec("CREATE INDEX IF NOT EXISTS idx_post_views_post_created ON post_views(post_id, created_at);");
  safeExec("CREATE INDEX IF NOT EXISTS idx_reposts_user_created ON reposts(user_id, created_at);");

  safeExec("CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at);");
  safeExec("CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read_at);");

  // Защита от старых неконсистентных записей: пост-опрос без вариантов.
  safeExec(`
    DELETE FROM posts
    WHERE poll_type IS NOT NULL
      AND id NOT IN (SELECT DISTINCT post_id FROM poll_options)
  `);
}

async function openDbLegacy() {
  if (_db) return _db;

  _SQL = await initSqlJs({
    locateFile: (file) => path.join(SQLJS_DIST, file),
  });

  if (fs.existsSync(DB_PATH)) {
    const fileBuf = fs.readFileSync(DB_PATH);
    _db = new _SQL.Database(toUint8Array(fileBuf));
  } else {
    _db = new _SQL.Database();
  }

  // Базовые настройки.
  _db.exec("PRAGMA foreign_keys = ON;");

  ensureSchema();

  persist();
  return _db;
}

async function openDb() {
  if (_db) return _db;

  _SQL = await initSqlJs({
    locateFile: (file) => path.join(SQLJS_DIST, file),
  });

  try {
    if (fs.existsSync(DB_PATH)) {
      const fileBuf = fs.readFileSync(DB_PATH);
      _db = new _SQL.Database(toUint8Array(fileBuf));
    } else {
      _db = new _SQL.Database();
    }
    return finalizeDbBoot();
  } catch (err) {
    if (!isCorruptedDatabaseError(err)) throw err;

    const backupPath = backupCorruptedDbFile();
    console.error(
      "Corrupted SQLite database detected. Recreating a fresh db file." +
        (backupPath ? ` Backup saved: ${path.basename(backupPath)}` : ""),
    );

    _db = new _SQL.Database();
    return finalizeDbBoot();
  }
}

function persist() {
  if (!_db) return;
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function normalizeParams(params) {
  if (params == null) return [];
  if (Array.isArray(params)) return params;
  // Можно будет расширить под именованные параметры, но сейчас нам хватает массива.
  return [params];
}

async function run(sql, params) {
  await openDb();
  return withLock(async () => {
    const stmt = _db.prepare(sql);
    try {
      stmt.bind(normalizeParams(params));
      stmt.step();
    } finally {
      stmt.free();
    }
    persist();
    return true;
  });
}

async function get(sql, params) {
  await openDb();
  return withLock(async () => {
    const stmt = _db.prepare(sql);
    try {
      stmt.bind(normalizeParams(params));
      if (!stmt.step()) return null;
      return stmt.getAsObject();
    } finally {
      stmt.free();
    }
  });
}

async function all(sql, params) {
  await openDb();
  return withLock(async () => {
    const stmt = _db.prepare(sql);
    const rows = [];
    try {
      stmt.bind(normalizeParams(params));
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      return rows;
    } finally {
      stmt.free();
    }
  });
}

module.exports = {
  DB_PATH,
  openDb,
  run,
  get,
  all,
  persist,
};
