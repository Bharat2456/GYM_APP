import type { DB } from './adapter';

/** Versioned schema. Add a new entry to MIGRATIONS (never edit an old one); PRAGMA user_version tracks progress. */
export const MIGRATIONS: string[] = [
  `CREATE TABLE accounts (
     id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, salt TEXT NOT NULL, pass_hash TEXT NOT NULL,
     role TEXT NOT NULL CHECK (role IN ('admin','gym','user')), display_name TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'active', extra TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
   CREATE TABLE docs (
     collection TEXT NOT NULL, id TEXT NOT NULL, gym_id TEXT, owner_id TEXT, data TEXT NOT NULL,
     created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (collection, id));
   CREATE INDEX idx_docs_gym ON docs (collection, gym_id);
   CREATE INDEX idx_docs_owner ON docs (collection, owner_id);
   CREATE TABLE kv (owner_id TEXT NOT NULL, k TEXT NOT NULL, v TEXT NOT NULL, PRIMARY KEY (owner_id, k));
   CREATE TABLE audit (
     seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor_id TEXT, actor_role TEXT, action TEXT NOT NULL,
     target TEXT, gym_id TEXT, detail TEXT);
   CREATE INDEX idx_audit_gym ON audit (gym_id);
   CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);`
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function migrate(db: DB): { from: number; to: number } {
  const from = (db.get<{ user_version: number }>('PRAGMA user_version')?.user_version) ?? 0;
  if (from > SCHEMA_VERSION) throw new Error('Database is newer than this app (v' + from + ').');
  for (let v = from; v < SCHEMA_VERSION; v++) {
    db.transaction(() => { db.exec(MIGRATIONS[v]); db.exec('PRAGMA user_version = ' + (v + 1)); });
  }
  return { from, to: SCHEMA_VERSION };
}
