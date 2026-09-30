import { DatabaseSync } from 'node:sqlite';

// Real SQLite SQL execution behind D1's documented prepared statement surface.
// Async boundaries deliberately allow simultaneous clients to race their CAS.
export class SqliteD1 {
  constructor(filename = ':memory:') { this.sqlite = new DatabaseSync(filename); this.sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;'); }
  exec(sql) { this.sqlite.exec(sql); }
  close() { this.sqlite.close(); }
  withSession() { return this; }
  prepare(sql) {
    const stmt = this.sqlite.prepare(sql); let values = [];
    return {
      bind(...args) { values = args; return this; },
      async first(column) { await Promise.resolve(); const row = stmt.get(...values); return column ? row?.[column] ?? null : row ?? null; },
      async all() { await Promise.resolve(); return { results: stmt.all(...values), success: true }; },
      async run() { await Promise.resolve(); const meta = stmt.run(...values); return { success: true, meta: { changes: Number(meta.changes), last_row_id: Number(meta.lastInsertRowid) } }; },
    };
  }
}
