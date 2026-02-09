const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, 'data.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initializeDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      picture TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_token TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      vendor TEXT NOT NULL,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      category TEXT NOT NULL,
      payment_method TEXT,
      receipt_number TEXT,
      line_items TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      notes TEXT,
      receipt_image TEXT,
      confidence_score REAL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );
  `);

  // Seed admin user if not exists
  const existing = db.prepare('SELECT user_id FROM users WHERE email = ?').get('admin@example.com');
  if (!existing) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(
      'INSERT INTO users (user_id, email, name, password_hash) VALUES (?, ?, ?, ?)'
    ).run('user_admin', 'admin@example.com', 'Admin', hash);
    console.log('Seeded admin user: admin@example.com / admin123');
  }

  return db;
}

module.exports = { getDb, initializeDb };
