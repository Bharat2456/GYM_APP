import type { DB, SqlValue } from './adapter';
import { migrate, SCHEMA_VERSION } from './schema';
import { hashPassword, randomSalt } from '../services/crypto';

export type Role = 'admin' | 'gym' | 'user';
export interface Actor { id: string; role: Role; gymIds: string[]; perms: string[]; system?: boolean }
export type Op = 'read' | 'create' | 'update' | 'delete';
export class Forbidden extends Error { constructor(m: string) { super(m); this.name = 'Forbidden'; } }
export const SYSTEM: Actor = { id: 'system', role: 'admin', gymIds: [], perms: ['*'], system: true };

export interface Account { id: string; username: string; role: Role; displayName: string; status: 'active' | 'suspended'; extra: Record<string, any>; createdAt: number; updatedAt: number }
export interface Doc { id: string; gymId?: string | null; ownerId?: string | null; [k: string]: any }

type Kind = 'user' | 'gym' | 'platform';
interface Policy { kind: Kind; perm?: string; userRead?: 'own' | 'member' | 'none'; userWrite?: 'own'; noAudit?: boolean }
/** One row per collection. This is the single place that decides who may touch what (tenant isolation lives here). */
export const POLICY: Record<string, Policy> = {
  profile: { kind: 'user', noAudit: true }, plan: { kind: 'user', noAudit: true }, workout: { kind: 'user' }, meal: { kind: 'user', noAudit: true },
  weight: { kind: 'user', noAudit: true }, measure: { kind: 'user', noAudit: true }, chat: { kind: 'user', noAudit: true }, camera_session: { kind: 'user' }, draft: { kind: 'user', noAudit: true },
  gym_member: { kind: 'gym', perm: 'members.manage', userRead: 'own', userWrite: 'own' },
  gym_assignment: { kind: 'gym', perm: 'programmes.manage', userRead: 'own' },
  gym_package: { kind: 'gym', perm: 'billing.manage', userRead: 'member' },
  gym_programme: { kind: 'gym', perm: 'programmes.manage', userRead: 'member' },
  gym_announcement: { kind: 'gym', perm: 'announce.manage', userRead: 'member' },
  gym_challenge: { kind: 'gym', perm: 'programmes.manage', userRead: 'member' },
  gym_code: { kind: 'gym', perm: 'members.manage', userRead: 'none' },
  gym_referral: { kind: 'gym', perm: 'members.manage', userRead: 'none' },
  gym_txn: { kind: 'gym', perm: 'billing.manage', userRead: 'own', userWrite: 'own' },
  gym: { kind: 'platform' }, exercise_custom: { kind: 'platform' }, programme_default: { kind: 'platform' }, sub_plan: { kind: 'platform' }, category: { kind: 'platform' }
};
export const GYM_PERMS = ['members.manage', 'programmes.manage', 'announce.manage', 'billing.manage', 'staff.manage', 'reports.view', 'gym.edit'];
export const STAFF_ROLES: Record<string, { label: string; perms: string[] }> = {
  owner: { label: 'Owner', perms: ['*'] },
  manager: { label: 'Gym manager', perms: ['*'] },
  receptionist: { label: 'Receptionist', perms: ['members.manage', 'announce.manage', 'billing.manage'] },
  fitness: { label: 'Fitness staff', perms: ['programmes.manage', 'reports.view'] }
};

const j = (o: any) => JSON.stringify(o);
const hasPerm = (a: Actor, p?: string) => !p || a.perms.includes('*') || a.perms.includes(p);

export class Repo {
  constructor(public db: DB, public now: () => number = () => Date.now()) { migrate(db); }
  get schemaVersion() { return SCHEMA_VERSION; }

  /* ---------------- generic documents ---------------- */
  private rowToDoc(r: any): Doc { const d = JSON.parse(r.data); d.id = r.id; d.gymId = r.gym_id; d.ownerId = r.owner_id; d.createdAt = r.created_at; d.updatedAt = r.updated_at; return d; }
  private isMember(userId: string, gymId: string): boolean {
    return this.db.all('SELECT data FROM docs WHERE collection=? AND gym_id=? AND owner_id=?', ['gym_member', gymId, userId]).some((r: any) => ['active', 'pending', 'expired'].includes(JSON.parse(r.data).status));
  }
  private memberGyms(userId: string): string[] {
    return this.db.all('SELECT gym_id, data FROM docs WHERE collection=? AND owner_id=?', ['gym_member', userId]).filter((r: any) => ['active', 'pending', 'expired'].includes(JSON.parse(r.data).status)).map((r: any) => r.gym_id);
  }
  private check(a: Actor, op: Op, coll: string, row: { gymId?: string | null; ownerId?: string | null; id?: string }, prev?: any, next?: any): void {
    const pol = POLICY[coll]; if (!pol) throw new Forbidden('Unknown collection ' + coll);
    const no = (why: string) => { throw new Forbidden(a.role + ' may not ' + op + ' ' + coll + ': ' + why); };
    if (a.role === 'admin') return;
    if (pol.kind === 'user') { if (row.ownerId !== a.id) no('not your record'); return; }
    if (pol.kind === 'platform') {
      if (coll === 'gym') {
        if (op === 'read') { if (a.role === 'gym' ? a.gymIds.includes(row.id!) : this.isMember(a.id, row.id!)) return; no('not your gym'); }
        if (a.role === 'gym') {
          if (op === 'create') { if (next && next.status !== 'pending') no('new gyms start as pending'); return; }
          if (op === 'update' && a.gymIds.includes(row.id!) && hasPerm(a, 'gym.edit')) { if (prev && next && prev.status !== next.status) no('only the platform admin changes gym status'); return; }
        }
        no('platform admin only');
      }
      if (op === 'read') return; // shared platform content (exercise edits, default programmes, plans) is readable by all roles
      no('platform admin only');
    }
    // gym-scoped
    if (a.role === 'gym') {
      if (!row.gymId || !a.gymIds.includes(row.gymId)) no('belongs to another gym');
      if (op !== 'read') { const gr = this.db.get<any>('SELECT data FROM docs WHERE collection=? AND id=?', ['gym', row.gymId ?? null]); if (gr && JSON.parse(gr.data).status === 'suspended') no('this gym is suspended by the platform admin'); }
      if (!hasPerm(a, pol.perm)) no('missing permission ' + pol.perm);
      return;
    }
    // user on gym-scoped data
    if (op === 'read') {
      if (pol.userRead === 'own' && row.ownerId === a.id) return;
      if (pol.userRead === 'member' && row.gymId && this.isMember(a.id, row.gymId)) return;
      no('not visible to customers');
    }
    if (pol.userWrite === 'own' && row.ownerId === a.id) {
      if (coll === 'gym_member') {
        if (op === 'create' && next?.status !== 'pending') no('a membership request starts as pending');
        if (op === 'update' && prev && next) {
          if (prev.status !== next.status && next.status !== 'left') no('customers cannot change membership status');
          const strip = (d: any) => { const { shareProgress, status, createdAt, updatedAt, id, gymId, ownerId, ...rest } = d; return JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k]])); };
          if (strip(prev) !== strip(next)) no('customers can only change sharing consent or leave');
        }
        if (op === 'delete') no('use leave');
      }
      return;
    }
    no('not allowed');
  }

  put(a: Actor, coll: string, doc: Doc): Doc {
    if (!doc.id) throw new Error('doc.id required');
    const pol = POLICY[coll];
    const gymId = coll === 'gym' ? doc.id : doc.gymId ?? null, ownerId = doc.ownerId ?? null;
    if (pol?.kind === 'gym' && !gymId) throw new Error(coll + ' needs gymId');
    if (pol?.kind === 'user' && !ownerId) throw new Error(coll + ' needs ownerId');
    const prevRow = this.db.get('SELECT * FROM docs WHERE collection=? AND id=?', [coll, doc.id]);
    const prev = prevRow ? this.rowToDoc(prevRow) : undefined;
    if (prev) { // an existing record must be writable by the actor in its CURRENT tenant, and cannot be moved
      if ((prev.gymId ?? null) !== gymId || (prev.ownerId ?? null) !== ownerId) throw new Forbidden('records cannot be moved between gyms or owners');
      this.check(a, 'update', coll, prev, prev, doc);
    } else this.check(a, 'create', coll, { id: doc.id, gymId, ownerId }, undefined, doc);
    const t = this.now(), { id, gymId: _g, ownerId: _o, createdAt, updatedAt, ...rest } = doc;
    this.db.run('INSERT INTO docs (collection,id,gym_id,owner_id,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at',
      [coll, id, gymId, ownerId, j(rest), prev ? prev.createdAt : t, t]);
    if (!pol.noAudit) this.audit(a, coll + '.' + (prev ? 'update' : 'create'), id, gymId, describe(coll, rest));
    return { ...rest, id, gymId, ownerId, createdAt: prev ? prev.createdAt : t, updatedAt: t };
  }
  get(a: Actor, coll: string, id: string): Doc | undefined {
    const r = this.db.get('SELECT * FROM docs WHERE collection=? AND id=?', [coll, id]); if (!r) return undefined;
    const d = this.rowToDoc(r); this.check(a, 'read', coll, d); return d;
  }
  /** Lists only what the actor may read. Asking explicitly for another tenant's gymId/ownerId throws. */
  list(a: Actor, coll: string, f: { gymId?: string; ownerId?: string; where?: (d: Doc) => boolean; limit?: number; newest?: boolean } = {}): Doc[] {
    const pol = POLICY[coll]; if (!pol) throw new Forbidden('Unknown collection ' + coll);
    const sql: string[] = ['SELECT * FROM docs WHERE collection=?']; const p: SqlValue[] = [coll];
    if (f.gymId) { if (pol.kind === 'gym' || coll === 'gym') { this.check(a, 'read', coll, { id: f.gymId, gymId: f.gymId, ownerId: a.id }); } sql.push('AND gym_id=?'); p.push(f.gymId); }
    if (f.ownerId) { if (pol.kind === 'user') this.check(a, 'read', coll, { ownerId: f.ownerId }); sql.push('AND owner_id=?'); p.push(f.ownerId); }
    sql.push('ORDER BY created_at ' + (f.newest ? 'DESC' : 'ASC') + ', id');
    let out: Doc[] = [];
    const memberGyms = a.role === 'user' && pol.kind === 'gym' ? new Set(this.memberGyms(a.id)) : null;
    for (const r of this.db.all(sql.join(' '), p)) {
      const d = this.rowToDoc(r);
      try {
        if (memberGyms && pol.userRead === 'member') { if (!memberGyms.has(d.gymId!)) continue; } else this.check(a, 'read', coll, d);
      } catch (e) { if (e instanceof Forbidden) continue; throw e; }
      if (f.where && !f.where(d)) continue; out.push(d);
      if (f.limit && out.length >= f.limit) break;
    }
    return out;
  }
  del(a: Actor, coll: string, id: string): boolean {
    const r = this.db.get('SELECT * FROM docs WHERE collection=? AND id=?', [coll, id]); if (!r) return false;
    const d = this.rowToDoc(r); this.check(a, 'delete', coll, d, d);
    this.db.run('DELETE FROM docs WHERE collection=? AND id=?', [coll, id]);
    if (!POLICY[coll].noAudit) this.audit(a, coll + '.delete', id, d.gymId ?? null, '');
    return true;
  }
  count(a: Actor, coll: string, f: { gymId?: string; where?: (d: Doc) => boolean } = {}): number { return this.list(a, coll, f).length; }

  /* ---------------- key/value (settings, platform config) ---------------- */
  getKV<T = any>(a: Actor, owner: string, k: string, dflt?: T): T | undefined {
    if (owner !== 'platform' && owner !== a.id && a.role !== 'admin') throw new Forbidden('settings belong to their owner');
    const r = this.db.get<{ v: string }>('SELECT v FROM kv WHERE owner_id=? AND k=?', [owner, k]); return r ? JSON.parse(r.v) : dflt;
  }
  setKV(a: Actor, owner: string, k: string, v: any): void {
    if (owner === 'platform' ? a.role !== 'admin' : owner !== a.id && a.role !== 'admin') throw new Forbidden('settings belong to their owner');
    this.db.run('INSERT INTO kv (owner_id,k,v) VALUES (?,?,?) ON CONFLICT(owner_id,k) DO UPDATE SET v=excluded.v', [owner, k, j(v)]);
    if (owner === 'platform') this.audit(a, 'config.update', k, null, '');
  }

  /* ---------------- audit ---------------- */
  audit(a: Actor, action: string, target: string | null, gymId: string | null, detail: string) {
    this.db.run('INSERT INTO audit (at,actor_id,actor_role,action,target,gym_id,detail) VALUES (?,?,?,?,?,?,?)', [this.now(), a.id, a.system ? 'system' : a.role, action, target, gymId, detail]);
  }
  listAudit(a: Actor, f: { gymId?: string; limit?: number } = {}): any[] {
    let rows: any[];
    if (a.role === 'admin') rows = f.gymId ? this.db.all('SELECT * FROM audit WHERE gym_id=? ORDER BY seq DESC LIMIT ?', [f.gymId, f.limit || 200]) : this.db.all('SELECT * FROM audit ORDER BY seq DESC LIMIT ?', [f.limit || 200]);
    else if (a.role === 'gym') {
      if (f.gymId && !a.gymIds.includes(f.gymId)) throw new Forbidden('audit of another gym');
      const ids = f.gymId ? [f.gymId] : a.gymIds; if (!ids.length) return [];
      rows = this.db.all('SELECT * FROM audit WHERE gym_id IN (' + ids.map(() => '?').join(',') + ') ORDER BY seq DESC LIMIT ?', [...ids, f.limit || 200]);
    } else throw new Forbidden('customers have no audit access');
    return rows.map((r) => ({ seq: r.seq, at: r.at, actorId: r.actor_id, actorRole: r.actor_role, action: r.action, target: r.target, gymId: r.gym_id, detail: r.detail }));
  }

  /* ---------------- accounts ---------------- */
  private toAccount(r: any): Account { return { id: r.id, username: r.username, role: r.role, displayName: r.display_name, status: r.status, extra: JSON.parse(r.extra), createdAt: r.created_at, updatedAt: r.updated_at }; }
  actorOf(acc: Account): Actor {
    if (acc.role === 'gym') {
      const perms = acc.extra.staffRole && STAFF_ROLES[acc.extra.staffRole] ? (acc.extra.permissions || STAFF_ROLES[acc.extra.staffRole].perms) : ['*'];
      return { id: acc.id, role: 'gym', gymIds: acc.extra.gymIds || [], perms };
    }
    return { id: acc.id, role: acc.role, gymIds: [], perms: acc.role === 'admin' ? ['*'] : [] };
  }
  /** Sign-up: anyone may create a 'user' account; admin may create any; a gym actor may create staff for its own gyms and walk-in customers. */
  createAccount(a: Actor | null, i: { id?: string; username: string; password: string; role: Role; displayName: string; extra?: Record<string, any> }): Account {
    const un = i.username.trim();
    if (!/^[A-Za-z0-9._-]{3,24}$/.test(un)) throw new Error('Username must be 3-24 letters, numbers, dots, dashes or underscores.');
    if (i.password.length < 4) throw new Error('Password must be at least 4 characters (prototype).');
    if (this.db.get('SELECT 1 AS x FROM accounts WHERE username=?', [un])) throw new Error('That username is already taken.');
    if (!a) { if (i.role !== 'user') throw new Forbidden('Only customer profiles can be created without signing in'); }
    else if (a.role === 'gym') {
      if (i.role === 'admin') throw new Forbidden('gyms cannot create admins');
      if (i.role === 'gym') { const gid = (i.extra?.gymIds || [])[0]; if (!gid || !a.gymIds.includes(gid) || !hasPerm(a, 'staff.manage')) throw new Forbidden('cannot create staff for that gym'); if (i.extra!.gymIds.some((g: string) => !a.gymIds.includes(g))) throw new Forbidden('cannot create staff for another gym'); }
    } else if (a.role === 'user') throw new Forbidden('customers cannot create accounts');
    const t = this.now(), salt = randomSalt(), id = i.id || 'acc_' + t.toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    this.db.run('INSERT INTO accounts (id,username,salt,pass_hash,role,display_name,status,extra,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [id, un, salt, hashPassword(i.password, salt), i.role, i.displayName.trim() || un, 'active', j(i.extra || {}), t, t]);
    this.audit(a || { id, role: 'user', gymIds: [], perms: [] }, 'account.create', id, (i.extra?.gymIds || [])[0] ?? null, i.role + ':' + un);
    return this.getAccount(SYSTEM, id)!;
  }
  getAccount(a: Actor, id: string): Account | undefined {
    const r = this.db.get('SELECT * FROM accounts WHERE id=?', [id]); if (!r) return undefined; const acc = this.toAccount(r);
    if (a.role === 'admin' || a.id === id) return acc;
    if (a.role === 'gym') { const gyms: string[] = acc.extra.gymIds || []; const isStaff = gyms.some((g) => a.gymIds.includes(g)); const isMember = acc.role === 'user' && this.db.all('SELECT gym_id FROM docs WHERE collection=? AND owner_id=?', ['gym_member', id]).some((x: any) => a.gymIds.includes(x.gym_id)); if (isStaff || isMember) return { ...acc }; }
    throw new Forbidden('no access to that account');
  }
  listAccounts(a: Actor): Account[] {
    const all = this.db.all('SELECT * FROM accounts ORDER BY created_at, id').map((r) => this.toAccount(r));
    if (a.role === 'admin') return all;
    if (a.role === 'gym') {
      const memberIds = new Set<string>(); a.gymIds.forEach((g) => this.db.all('SELECT owner_id FROM docs WHERE collection=? AND gym_id=?', ['gym_member', g]).forEach((x: any) => memberIds.add(x.owner_id)));
      return all.filter((x) => (x.role === 'gym' && (x.extra.gymIds || []).some((g: string) => a.gymIds.includes(g))) || memberIds.has(x.id));
    }
    return all.filter((x) => x.id === a.id);
  }
  updateAccount(a: Actor, id: string, patch: { displayName?: string; status?: 'active' | 'suspended'; extra?: Record<string, any>; password?: string; role?: Role }): Account {
    const cur = this.db.get('SELECT * FROM accounts WHERE id=?', [id]); if (!cur) throw new Error('Account not found');
    const acc = this.toAccount(cur);
    const self = a.id === id;
    if (a.role === 'user' && !self) throw new Forbidden('customers can only edit themselves');
    if (a.role === 'gym' && !self) { const ok = acc.role === 'gym' && (acc.extra.gymIds || []).some((g: string) => a.gymIds.includes(g)) && hasPerm(a, 'staff.manage'); if (!ok) throw new Forbidden('not your staff'); }
    if (a.role !== 'admin' && (patch.status || patch.role)) { if (!(a.role === 'gym' && patch.status && !self && acc.role === 'gym')) throw new Forbidden('only the platform admin changes status or role'); }
    if (a.role === 'gym' && patch.extra && patch.extra.gymIds) { if (patch.extra.gymIds.some((g: string) => !a.gymIds.includes(g) && !(acc.extra.gymIds || []).includes(g))) throw new Forbidden('cannot attach another gym'); }
    const next = { ...acc.extra, ...(patch.extra || {}) };
    const t = this.now();
    this.db.run('UPDATE accounts SET display_name=?, status=?, role=?, extra=?, updated_at=? WHERE id=?', [patch.displayName ?? acc.displayName, patch.status ?? acc.status, patch.role ?? acc.role, j(next), t, id]);
    if (patch.password) { if (patch.password.length < 4) throw new Error('Password too short'); const salt = randomSalt(); this.db.run('UPDATE accounts SET salt=?, pass_hash=? WHERE id=?', [salt, hashPassword(patch.password, salt), id]); }
    this.audit(a, 'account.update', id, (next.gymIds || [])[0] ?? null, Object.keys(patch).join(','));
    return this.getAccount(SYSTEM, id)!;
  }
  /** Used only by the login flow; returns the account when credentials match. */
  verifyLogin(username: string, password: string): Account | null {
    const r = this.db.get('SELECT * FROM accounts WHERE username=?', [username.trim()]); if (!r) return null;
    return hashPassword(password, r.salt) === r.pass_hash ? this.toAccount(r) : null;
  }
  deleteAccount(a: Actor, id: string) {
    const acc = this.db.get('SELECT * FROM accounts WHERE id=?', [id]); if (!acc) return;
    if (a.role !== 'admin' && a.id !== id) throw new Forbidden('cannot delete that account');
    this.db.transaction(() => { this.db.run('DELETE FROM docs WHERE owner_id=? AND collection IN (?,?,?,?,?,?,?,?,?)', [id, 'profile', 'plan', 'workout', 'meal', 'weight', 'measure', 'chat', 'camera_session', 'draft']); this.db.run('DELETE FROM kv WHERE owner_id=?', [id]); this.db.run('DELETE FROM accounts WHERE id=?', [id]); });
    this.audit(a, 'account.delete', id, null, (acc as any).username);
  }

  /* ---------------- privileged bulk operations ---------------- */
  stats(): Record<string, number> {
    const n = (sql: string) => (this.db.get<{ n: number }>(sql)?.n) || 0;
    return { accounts: n('SELECT COUNT(*) n FROM accounts'), docs: n('SELECT COUNT(*) n FROM docs'), audit: n('SELECT COUNT(*) n FROM audit'), schema: SCHEMA_VERSION };
  }
  exportAll(a: Actor): any {
    if (a.role !== 'admin') throw new Forbidden('only the platform admin exports everything');
    return { app: 'kinetic-coach', format: 1, schema: SCHEMA_VERSION, exportedAt: this.now(), demoNotice: 'Prototype data export, includes demo accounts.',
      accounts: this.db.all('SELECT * FROM accounts'), docs: this.db.all('SELECT * FROM docs'), kv: this.db.all('SELECT * FROM kv'), audit: this.db.all('SELECT * FROM audit') };
  }
  importAll(a: Actor, data: any): { accounts: number; docs: number } {
    if (a.role !== 'admin') throw new Forbidden('only the platform admin imports');
    if (!data || data.app !== 'kinetic-coach' || data.format !== 1 || !Array.isArray(data.accounts) || !Array.isArray(data.docs)) throw new Error('This is not a Kinetic Coach backup.');
    if (!data.accounts.some((x: any) => x.role === 'admin')) throw new Error('The backup contains no admin account, refusing to import.');
    this.db.transaction(() => {
      this.wipe();
      data.accounts.forEach((r: any) => this.db.run('INSERT INTO accounts (id,username,salt,pass_hash,role,display_name,status,extra,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [r.id, r.username, r.salt, r.pass_hash, r.role, r.display_name, r.status, r.extra, r.created_at, r.updated_at]));
      data.docs.forEach((r: any) => this.db.run('INSERT INTO docs (collection,id,gym_id,owner_id,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', [r.collection, r.id, r.gym_id, r.owner_id, r.data, r.created_at, r.updated_at]));
      (data.kv || []).forEach((r: any) => this.db.run('INSERT INTO kv (owner_id,k,v) VALUES (?,?,?)', [r.owner_id, r.k, r.v]));
    });
    this.audit(a, 'data.import', null, null, data.accounts.length + ' accounts, ' + data.docs.length + ' records');
    return { accounts: data.accounts.length, docs: data.docs.length };
  }
  wipe() { ['accounts', 'docs', 'kv', 'audit', 'meta'].forEach((t) => this.db.run('DELETE FROM ' + t)); }
}

function describe(coll: string, d: any): string {
  const s = d.name || d.title || d.code || d.text || d.status || ''; return String(s).slice(0, 80);
}
