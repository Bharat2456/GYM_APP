import * as SQLite from 'expo-sqlite';
import type { DB, SqlValue } from './adapter';

/** expo-sqlite (SDK 52+) synchronous API. */
export function openExpoDb(name = 'kinetic-coach.db'): DB {
  const db = SQLite.openDatabaseSync(name);
  return {
    exec: (sql) => db.execSync(sql),
    run: (sql, params = []) => ({ changes: db.runSync(sql, params as SqlValue[]).changes }),
    all: (sql, params = []) => db.getAllSync(sql, params as SqlValue[]) as any[],
    get: (sql, params = []) => (db.getFirstSync(sql, params as SqlValue[]) ?? undefined) as any,
    transaction: (fn) => { let out: any; db.withTransactionSync(() => { out = fn(); }); return out; }
  };
}
