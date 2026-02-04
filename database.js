const fs = require("node:fs");
const path = require("node:path");

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

async function openDb() {
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

  // Схема (минимальная для auth/проектов/подписок).
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      rating INTEGER NOT NULL DEFAULT 0,
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
  `);

  persist();
  return _db;
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

