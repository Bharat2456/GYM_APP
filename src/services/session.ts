import { Repo, Actor, Account, Role } from '../db/repo';

export interface Session { account: Account; actor: Actor; originAdminId?: string; activeGymId?: string }
export const ROLE_HOME: Record<Role, string> = { user: 'user', gym: 'gym', admin: 'admin' };
/** Which top-level areas each role may open. The data layer enforces the same rules; this only drives navigation. */
export const ROLE_AREAS: Record<Role, string[]> = { user: ['home', 'train', 'nutrition', 'coach', 'progress', 'profile', 'camera', 'gym-info'], gym: ['dashboard', 'members', 'programmes', 'engage', 'more'], admin: ['overview', 'gyms', 'users', 'content', 'system'] };
export const canOpen = (role: Role, area: string) => ROLE_AREAS[role].includes(area);

function mk(repo: Repo, acc: Account, extra: Partial<Session> = {}): Session {
  const actor = repo.actorOf(acc);
  return { account: acc, actor, activeGymId: actor.gymIds[0], ...extra };
}
export function login(repo: Repo, username: string, password: string): Session {
  if (!username.trim() || !password) throw new Error('Enter your username and password.');
  const acc = repo.verifyLogin(username, password); if (!acc) throw new Error('Incorrect username or password.');
  if (acc.status === 'suspended') throw new Error('This account is suspended. Contact the platform admin.');
  return mk(repo, acc, acc.role === 'admin' ? { originAdminId: acc.id } : {});
}
export function resume(repo: Repo, accountId: string, originAdminId?: string): Session | null {
  const acc = repo.getAccount({ id: accountId, role: 'admin', gymIds: [], perms: ['*'], system: true }, accountId); if (!acc || acc.status === 'suspended') return null;
  return mk(repo, acc, originAdminId ? { originAdminId } : acc.role === 'admin' ? { originAdminId: acc.id } : {});
}
export function refresh(repo: Repo, s: Session): Session { const acc = repo.getAccount(s.actor, s.account.id)!; const n = mk(repo, acc, { originAdminId: s.originAdminId }); n.activeGymId = n.actor.gymIds.includes(s.activeGymId || '') ? s.activeGymId : n.actor.gymIds[0]; return n; }
/** Demonstration role switching: only a session that started as the platform admin may jump between demo roles. */
export function switchRole(repo: Repo, s: Session, targetAccountId: string): Session {
  if (!s.originAdminId) throw new Error('Only the platform admin can switch roles. Sign out and log in instead.');
  const adminActor = repo.actorOf(repo.getAccount({ id: s.originAdminId, role: 'admin', gymIds: [], perms: ['*'], system: true }, s.originAdminId)!);
  const acc = repo.getAccount(adminActor, targetAccountId); if (!acc) throw new Error('Account not found.'); if (acc.status === 'suspended') throw new Error('That account is suspended.');
  return mk(repo, acc, { originAdminId: s.originAdminId });
}
export function demoSwitchTargets(repo: Repo, s: Session): Account[] {
  if (!s.originAdminId) return [];
  const admin = repo.getAccount({ id: s.originAdminId, role: 'admin', gymIds: [], perms: ['*'], system: true }, s.originAdminId)!;
  return repo.listAccounts(repo.actorOf(admin)).filter((x) => x.status === 'active');
}
export function signUpCustomer(repo: Repo, i: { username: string; password: string; displayName: string }): Session {
  const acc = repo.createAccount(null, { username: i.username, password: i.password, role: 'user', displayName: i.displayName }); return mk(repo, acc);
}

/* device-level (not account-level) preferences and the remembered login live in the `meta` table */
export const getMeta = (repo: Repo, k: string): string | undefined => repo.db.get<{ v: string }>('SELECT v FROM meta WHERE k=?', [k])?.v;
export const setMeta = (repo: Repo, k: string, v: string | null) => { if (v == null) repo.db.run('DELETE FROM meta WHERE k=?', [k]); else repo.db.run('INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)', [k, v]); };
export const rememberSession = (repo: Repo, s: Session | null) => setMeta(repo, 'session', s ? JSON.stringify({ id: s.account.id, origin: s.originAdminId, gym: s.activeGymId }) : null);
export function restoreSession(repo: Repo): Session | null {
  try { const j = JSON.parse(getMeta(repo, 'session') || 'null'); if (!j) return null; const s = resume(repo, j.id, j.origin); if (s && j.gym && s.actor.gymIds.includes(j.gym)) s.activeGymId = j.gym; return s; } catch { return null; }
}
