const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'drift_bottle.db');
const db = new Database(dbPath);

// 启用 WAL 模式提升性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 创建用户表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    is_anonymous INTEGER DEFAULT 0,
    bottles_sent INTEGER DEFAULT 0,
    bottles_picked INTEGER DEFAULT 0,
    replies_given INTEGER DEFAULT 0,
    heal_count INTEGER DEFAULT 0,
    healing_point INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    last_checkin_date TEXT DEFAULT '',
    badges TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// 创建漂流瓶表
db.exec(`
  CREATE TABLE IF NOT EXISTS bottles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    content_type TEXT DEFAULT 'free',
    emotion TEXT DEFAULT '平静',
    emotion_analysis TEXT DEFAULT '{}',
    healing_reply TEXT DEFAULT '',
    challenges TEXT DEFAULT '[]',
    challenge_results TEXT DEFAULT '[]',
    author_id INTEGER NOT NULL,
    author_name TEXT NOT NULL,
    author_session_id TEXT DEFAULT '',
    status TEXT DEFAULT 'submitted',
    is_public INTEGER DEFAULT 1,
    picked_by INTEGER DEFAULT NULL,
    reply_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (author_id) REFERENCES users(id)
  );
`);

// 创建回复表
db.exec(`
  CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bottle_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    author_id INTEGER NOT NULL,
    author_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (bottle_id) REFERENCES bottles(id),
    FOREIGN KEY (author_id) REFERENCES users(id)
  );
`);

// 创建故事表
db.exec(`
  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bottle_id TEXT DEFAULT '',
    emotion_tag TEXT DEFAULT '平静',
    excerpt TEXT DEFAULT '',
    reply_excerpt TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

module.exports = db;
