/** Minimal synchronous SQL interface. Implemented by expo-sqlite on the phone and node:sqlite in tests. */
export type SqlValue = string | number | null;
export interface DB {
  exec(sql: string): void;
  run(sql: string, params?: SqlValue[]): { changes: number };
  all<T = any>(sql: string, params?: SqlValue[]): T[];
  get<T = any>(sql: string, params?: SqlValue[]): T | undefined;
  transaction<T>(fn: () => T): T;
}
