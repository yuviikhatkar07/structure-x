// Test-only adapter: lets the suite run on Node's built-in node:sqlite when better-sqlite3 is not installed.
import { DatabaseSync } from 'node:sqlite';

export default class Database {
  constructor(file) {
    this.db = new DatabaseSync(file);
  }
  pragma(str, opts) {
    if (str.includes('=')) {
      this.db.exec(`PRAGMA ${str}`);
      return undefined;
    }
    const row = this.db.prepare(`PRAGMA ${str}`).get();
    if (opts?.simple) return row ? Object.values(row)[0] : undefined;
    return row ? [row] : [];
  }
  exec(sql) {
    this.db.exec(sql);
  }
  prepare(sql) {
    const s = this.db.prepare(sql);
    return {
      run: (...p) => {
        const r = s.run(...p);
        return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
      },
      all: (...p) => s.all(...p).map((r) => ({ ...r })),
      get: (...p) => {
        const r = s.get(...p);
        return r ? { ...r } : undefined;
      },
    };
  }
  transaction(fn) {
    return (...a) => {
      this.db.exec('BEGIN');
      try {
        const r = fn(...a);
        this.db.exec('COMMIT');
        return r;
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      }
    };
  }
}
