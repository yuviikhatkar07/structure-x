import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, SNAPSHOT_DIR, REPORT_DIR } from '../config.js';
import { MIGRATIONS } from './migrations.js';

for (const dir of [DATA_DIR, SNAPSHOT_DIR, REPORT_DIR]) fs.mkdirSync(dir, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'structurex.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

/** Health of the persistence layer, surfaced in the connection manager. */
export const dbState = { ok: true, lastSave: null, lastError: null };

export function migrate() {
  const current = db.pragma('user_version', { simple: true });
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.pragma(`user_version = ${m.version}`);
    })();
    console.log(`[db] applied migration v${m.version}`);
  }
}

const cache = new Map();
function prepared(sql) {
  let s = cache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    cache.set(sql, s);
  }
  return s;
}

export function run(sql, ...params) {
  try {
    const r = prepared(sql).run(...params);
    dbState.ok = true;
    dbState.lastSave = Date.now();
    return r;
  } catch (e) {
    dbState.ok = false;
    dbState.lastError = e.message;
    throw e;
  }
}
export const all = (sql, ...params) => prepared(sql).all(...params);
export const get = (sql, ...params) => prepared(sql).get(...params);

/** Dynamic SQL (filters). Not cached. */
export const allDynamic = (sql, params = []) => db.prepare(sql).all(...params);

export function checkDb() {
  try {
    db.prepare('SELECT 1').get();
    return true;
  } catch (e) {
    dbState.ok = false;
    dbState.lastError = e.message;
    return false;
  }
}
