/**
 * Sankalp AI Wealth Avatar — Database Helper
 * Wraps sql.js with a synchronous-like API for Express route handlers.
 * Loads the DB file into memory on startup, provides query helpers,
 * and persists changes back to disk with a debounced async write-queue.
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { seed } = require('./seed');

const DB_PATH = path.join(__dirname, '..', 'db', 'sankalp.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db = null;
let persistTimeout = null;
let isDirty = false;

/**
 * Initialize the database. Must be called before server starts listening.
 * Returns the db wrapper object.
 */
async function initDb() {
  const SQL = await initSqlJs();

  if (!fs.existsSync(DB_PATH)) {
    console.log('[DB] Database file not found. Seeding demo database...');
    await seed();
  }

  const fileBuffer = fs.readFileSync(DB_PATH);
  db = new SQL.Database(fileBuffer);
  ensureSchema();
  console.log('[DB] SQLite loaded from:', DB_PATH);
  
  // Clean shutdown persist
  process.on('SIGINT', () => {
    console.log('[DB] SIGINT received. Syncing DB state to disk...');
    saveSync();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('[DB] SIGTERM received. Syncing DB state to disk...');
    saveSync();
    process.exit(0);
  });

  return getDbWrapper();
}

function ensureSchema() {
  try {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    db.exec(schema);

    ensureColumn('users', 'savings_balance', 'REAL NOT NULL DEFAULT 0');
    ensureColumn('users', 'monthly_income', 'REAL NOT NULL DEFAULT 0');
    ensureColumn('goals', 'current_saved', 'REAL NOT NULL DEFAULT 0');
    ensureColumn('goals', 'target_date', 'TEXT NOT NULL DEFAULT ""');

    persistToFile(true); // force initial schema persist
  } catch (err) {
    console.error('[DB] Schema ensure failed:', err.message);
  }
}

function ensureColumn(tableName, columnName, columnDefinition) {
  try {
    const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();

    if (!rows.some(row => row.name === columnName)) {
      db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
      console.log(`[DB] Added missing column ${tableName}.${columnName}`);
    }
  } catch (err) {
    console.error(`[DB] Failed to ensure column ${tableName}.${columnName}:`, err.message);
  }
}

/**
 * Returns a wrapper around sql.js that provides a convenient API
 * similar to better-sqlite3's synchronous methods.
 */
function getDbWrapper() {
  return {
    /**
     * Prepare and run a query, returning all matching rows as an array of objects.
     */
    prepare(sql) {
      return {
        all(...params) {
          try {
            const stmt = db.prepare(sql);
            if (params.length > 0) {
              stmt.bind(params.length === 1 && Array.isArray(params[0]) ? params[0] : params);
            }
            const rows = [];
            while (stmt.step()) {
              rows.push(stmt.getAsObject());
            }
            stmt.free();
            return rows;
          } catch (err) {
            console.error('[DB] Query error:', sql, params, err.message);
            return [];
          }
        },
        get(...params) {
          try {
            const stmt = db.prepare(sql);
            if (params.length > 0) {
              stmt.bind(params.length === 1 && Array.isArray(params[0]) ? params[0] : params);
            }
            let result = null;
            if (stmt.step()) {
              result = stmt.getAsObject();
            }
            stmt.free();
            return result;
          } catch (err) {
            console.error('[DB] Query error:', sql, params, err.message);
            return null;
          }
        },
        run(...params) {
          try {
            if (params.length > 0) {
              db.run(sql, params.length === 1 && Array.isArray(params[0]) ? params[0] : params);
            } else {
              db.run(sql);
            }
            const lastInsertRowid = getLastInsertRowId();
            const changes = getChanges();
            // Debounced persist to disk
            persistToFile(false);
            return { lastInsertRowid, changes };
          } catch (err) {
            console.error('[DB] Run error:', sql, params, err.message);
            return { lastInsertRowid: 0, changes: 0 };
          }
        }
      };
    },

    /**
     * Execute raw SQL (for multi-statement execution like schema).
     */
    exec(sql) {
      db.exec(sql);
      persistToFile(false);
    },

    /**
     * Direct run for simple inserts/updates.
     */
    run(sql, params = []) {
      db.run(sql, params);
      persistToFile(false);
    }
  };
}

function getLastInsertRowId() {
  try {
    const res = db.exec('SELECT last_insert_rowid() as id');
    return res[0].values[0][0];
  } catch (err) {
    console.error('getLastInsertRowId error:', err.message);
    return 0;
  }
}

function getChanges() {
  try {
    const res = db.exec('SELECT changes() as c');
    return res[0].values[0][0];
  } catch (err) {
    console.error('getChanges error:', err.message);
    return 0;
  }
}

/**
 * Persist the in-memory database to disk.
 * Uses 100ms debouncing to prevent event loop blocking.
 */
function persistToFile(force = false) {
  isDirty = true;
  
  if (force) {
    saveSync();
    return;
  }

  if (!persistTimeout) {
    persistTimeout = setTimeout(() => {
      saveSync();
    }, 100);
  }
}

function saveSync() {
  if (!isDirty) return;
  try {
    if (persistTimeout) {
      clearTimeout(persistTimeout);
      persistTimeout = null;
    }
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
    isDirty = false;
  } catch (err) {
    console.error('[DB] Failed to persist:', err.message);
  }
}

module.exports = { initDb };
