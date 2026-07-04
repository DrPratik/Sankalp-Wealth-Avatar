-- Sankalp AI Wealth Avatar — Database Schema
-- SQLite (file-based, zero-config)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  monthly_income REAL NOT NULL,
  risk_profile TEXT NOT NULL CHECK(risk_profile IN ('Conservative', 'Moderate', 'Aggressive')),
  city TEXT NOT NULL,
  savings_balance REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS portfolio_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  instrument_name TEXT NOT NULL,
  instrument_type TEXT NOT NULL CHECK(instrument_type IN ('Mutual Fund', 'Stock', 'FD', 'Insurance')),
  current_value REAL NOT NULL,
  invested_value REAL NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('Equity', 'Debt', 'Hybrid', 'Gold')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  goal_name TEXT NOT NULL,
  target_amount REAL NOT NULL,
  current_saved REAL NOT NULL,
  target_date TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS nudges_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  trigger_type TEXT NOT NULL,
  generated_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  shown INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
