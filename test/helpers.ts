import { DatabaseSync } from 'node:sqlite';
import type { DB } from '../src/db/adapter';
import { Repo } from '../src/db/repo';
import { seedDemo } from '../src/db/seed';
import { loadLibrary } from '../src/services/admin';

export const NOW = new Date(2026, 10, 11, 12, 0, 0).getTime(); // Wed 11 Nov 2026
export function nodeDb(path = ':memory:'): DB {
  const db = new DatabaseSync(path);
  return {
    exec: (s) => db.exec(s),
    run: (s, p = []) => { const r = db.prepare(s).run(...(p as any[])); return { changes: Number(r.changes) }; },
    all: (s, p = []) => db.prepare(s).all(...(p as any[])) as any[],
    get: (s, p = []) => db.prepare(s).get(...(p as any[])) as any,
    transaction: (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } }
  };
}
export const clock = { t: NOW };
export function freshRepo(seed = true): Repo {
  clock.t = NOW; const repo = new Repo(nodeDb(), () => clock.t); if (seed) { seedDemo(repo); loadLibrary(repo); } return repo;
}
export const as = (repo: Repo, username: string) => repo.actorOf(repo.verifyLogin(username, username === 'admin' ? 'admin123' : username === 'gym' || username === 'gym2' ? 'gym123' : username === 'asha' || username === 'dev' || username === 'rohit' ? 'staff123' : 'user123')!);
let pass = 0, fail = 0; const failures: string[] = [];
type Item = { name?: string; fn?: () => any; section?: string };
const queue: Item[] = [];
/** Tests (sync or async) are queued and run strictly in order by done(). */
export function t(name: string, fn: () => any) { queue.push({ name, fn }); }
export const section = (s: string) => { queue.push({ section: s }); };
export const ok = (c: any, m?: string) => { if (!c) throw new Error(m || 'assertion failed'); };
export const eq = (a: any, b: any, m?: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'expected equal') + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); };
export function throws(fn: () => any, re?: RegExp, m?: string) { let err: any; try { fn(); } catch (e) { err = e; } if (!err) throw new Error(m || 'expected an error'); if (re && !re.test(err.message)) throw new Error((m || 'wrong error') + ': ' + err.message); }
export async function done() {
  for (const it of queue) {
    if (it.section) { console.log('\n' + it.section); continue; }
    try { await it.fn!(); pass++; console.log('  ok   ' + it.name); } catch (e: any) { fail++; failures.push(it.name + ' -> ' + e.message); console.log('  FAIL ' + it.name + '\n       ' + e.message); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); if (fail) { console.log(failures.join('\n')); process.exit(1); }
}
