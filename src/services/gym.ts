import FIT, { uid, DAY } from '../engine';
import { Repo, Actor, SYSTEM, Forbidden, STAFF_ROLES, Account } from '../db/repo';
import * as pay from './payments';

export type GymStatus = 'pending' | 'active' | 'suspended';
export interface Gym { id: string; name: string; description: string; address: string; phone: string; email: string; hours: string; logo: string | null; brand: { mode: 'shared' | 'custom'; color: string; welcome: string }; status: GymStatus; ownerId: string; subscription?: { planId: string; status: 'active' | 'cancelled'; since: number } | null; createdAt: number }
export interface Pkg { id: string; gymId: string; name: string; days: number; price: number; description: string; active: boolean }
export type MemberStatus = 'pending' | 'active' | 'expired' | 'rejected' | 'left';
export interface Member { id: string; gymId: string; ownerId: string; status: MemberStatus; packageId?: string; startAt?: number; expiresAt?: number; requestedAt: number; via?: string; codeId?: string; referralId?: string; shareProgress: boolean; note?: string }
export interface Code { id: string; gymId: string; code: string; kind: 'customer' | 'staff'; label: string; staffId?: string; uses: number; maxUses?: number; active: boolean }
export interface Programme { id: string; gymId?: string | null; name: string; description: string; level: 'beginner' | 'intermediate' | 'advanced'; days: { title: string; exercises: { exId: string; sets: number; reps?: number; secs?: number; rest: number }[] }[]; active: boolean }

const t = (repo: Repo) => repo.now();
const clean = (s: any, max = 200) => String(s ?? '').trim().slice(0, max);
const need = (v: any, msg: string) => { if (!v) throw new Error(msg); return v; };
export const QR_PREFIX = 'kinetic://join?code=';
export const joinPayload = (code: string) => QR_PREFIX + code;
export const parseJoin = (s: string) => { s = s.trim(); return (s.startsWith(QR_PREFIX) ? s.slice(QR_PREFIX.length) : s).toUpperCase(); };

/* ---------------- gyms ---------------- */
export function createGym(repo: Repo, a: Actor, i: { name: string; description?: string; address?: string; phone?: string; email?: string; hours?: string; ownerId?: string }): { gym: Gym; actor: Actor } {
  const name = need(clean(i.name, 60), 'Gym name is required.');
  const ownerId = a.role === 'admin' ? i.ownerId || a.id : a.id;
  const id = uid('gym');
  const gym: Gym = { id, name, description: clean(i.description, 400), address: clean(i.address), phone: clean(i.phone, 30), email: clean(i.email, 80), hours: clean(i.hours, 120) || 'Mon-Sat 6:00-21:00', logo: null, brand: { mode: 'shared', color: '#C6F432', welcome: 'Welcome to ' + name }, status: a.role === 'admin' ? 'active' : 'pending', ownerId, subscription: null, createdAt: t(repo) };
  repo.put(a, 'gym', gym as any);
  let actor = a;
  if (a.role === 'gym') {
    const acc = repo.getAccount(a, a.id)!;
    repo.updateAccount(SYSTEM, a.id, { extra: { gymIds: [...(acc.extra.gymIds || []), id], staffRole: acc.extra.staffRole || 'owner' } });
    actor = { ...a, gymIds: [...a.gymIds, id] };
  } else if (i.ownerId) { const acc = repo.getAccount(SYSTEM, i.ownerId); if (acc?.role === 'gym') repo.updateAccount(SYSTEM, i.ownerId, { extra: { gymIds: [...(acc.extra.gymIds || []), id], staffRole: acc.extra.staffRole || 'owner' } }); }
  const asOwner = a.role === 'admin' ? SYSTEM : actor;
  repo.put(asOwner, 'gym_package', { id: uid('pkg'), gymId: id, name: 'Monthly', days: 30, price: 1500, description: 'Full gym access for 30 days.', active: true } as any);
  return { gym, actor };
}
export function updateGymProfile(repo: Repo, a: Actor, gymId: string, p: Partial<Pick<Gym, 'name' | 'description' | 'address' | 'phone' | 'email' | 'hours'>>): Gym {
  const g = need(repo.get(a, 'gym', gymId), 'Gym not found') as unknown as Gym;
  const next = { ...g, name: clean(p.name ?? g.name, 60) || g.name, description: clean(p.description ?? g.description, 400), address: clean(p.address ?? g.address), phone: clean(p.phone ?? g.phone, 30), email: clean(p.email ?? g.email, 80), hours: clean(p.hours ?? g.hours, 120) };
  return repo.put(a, 'gym', next as any) as unknown as Gym;
}
export function setBranding(repo: Repo, a: Actor, gymId: string, b: { mode?: 'shared' | 'custom'; color?: string; welcome?: string; logo?: string | null }): Gym {
  const g = need(repo.get(a, 'gym', gymId), 'Gym not found') as unknown as Gym;
  if (b.color && !/^#[0-9a-fA-F]{6}$/.test(b.color)) throw new Error('Colour must look like #C6F432.');
  if (b.logo && (!b.logo.startsWith('data:image/') || b.logo.length > 400_000)) throw new Error('Logo must be a small image (under about 300 KB).');
  const next = { ...g, logo: b.logo !== undefined ? b.logo : g.logo, brand: { mode: b.mode ?? g.brand.mode, color: b.color ?? g.brand.color, welcome: clean(b.welcome ?? g.brand.welcome, 120) } };
  return repo.put(a, 'gym', next as any) as unknown as Gym;
}
export const getGym = (repo: Repo, a: Actor, id: string) => repo.get(a, 'gym', id) as unknown as Gym | undefined;
export const myGyms = (repo: Repo, a: Actor) => repo.list(a, 'gym') as unknown as Gym[];

/* ---------------- packages ---------------- */
export function savePackage(repo: Repo, a: Actor, gymId: string, p: { id?: string; name: string; days: number; price: number; description?: string; active?: boolean }): Pkg {
  if (!clean(p.name)) throw new Error('Package name required.'); if (!(p.days >= 1 && p.days <= 800)) throw new Error('Duration must be 1-800 days.'); if (!(p.price >= 0 && p.price <= 1_000_000)) throw new Error('Price must be 0-10,00,000.');
  return repo.put(a, 'gym_package', { id: p.id || uid('pkg'), gymId, name: clean(p.name, 50), days: Math.round(p.days), price: Math.round(p.price), description: clean(p.description, 200), active: p.active !== false } as any) as unknown as Pkg;
}
export const listPackages = (repo: Repo, a: Actor, gymId: string) => repo.list(a, 'gym_package', { gymId }) as unknown as Pkg[];

/* ---------------- codes, joining, referrals ---------------- */
export function createCode(repo: Repo, a: Actor, gymId: string, o: { kind: 'customer' | 'staff'; label: string; staffId?: string; maxUses?: number }): Code {
  const gym = need(getGym(repo, a, gymId), 'Gym not found');
  const prefix = gym.name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase().padEnd(3, 'X');
  let code = '';
  do { code = prefix + '-' + Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join(''); } while (repo.db.get('SELECT 1 x FROM docs WHERE collection=? AND json_extract(data,\'$.code\')=?', ['gym_code', code]));
  return repo.put(a, 'gym_code', { id: uid('code'), gymId, code, kind: o.kind, label: clean(o.label, 40) || (o.kind === 'staff' ? 'Staff invite' : 'Customer invite'), staffId: o.staffId, uses: 0, maxUses: o.maxUses, active: true } as any) as unknown as Code;
}
export const listCodes = (repo: Repo, a: Actor, gymId: string) => repo.list(a, 'gym_code', { gymId }) as unknown as Code[];
const findCode = (repo: Repo, code: string) => repo.list(SYSTEM, 'gym_code', { where: (d) => d.code === code.toUpperCase() })[0] as unknown as Code | undefined;

/** Customer joins with a code or scanned QR. Creates a PENDING request that the gym must approve. The code lookup is a controlled, audited escalation (customers cannot read codes). */
export function redeemCode(repo: Repo, a: Actor, raw: string): { member: Member; gym: Gym } {
  if (a.role !== 'user') throw new Forbidden('Only customer accounts join gyms with a code.');
  const code = findCode(repo, parseJoin(raw)); if (!code || !code.active || code.kind !== 'customer') throw new Error('That code is not valid.');
  if (code.maxUses && code.uses >= code.maxUses) throw new Error('That code has reached its limit.');
  const gym = repo.get(SYSTEM, 'gym', code.gymId) as unknown as Gym; if (!gym || gym.status !== 'active') throw new Error('This gym is not accepting new members right now.');
  const existing = (repo.list(SYSTEM, 'gym_member', { gymId: gym.id, where: (d) => d.ownerId === a.id }) as unknown as Member[]).find((m) => ['pending', 'active', 'expired'].includes(m.status));
  if (existing) throw new Error(existing.status === 'pending' ? 'You already requested to join this gym.' : 'You are already a member of this gym.');
  const refId = uid('ref'), memId = uid('mem');
  const member: Member = { id: memId, gymId: gym.id, ownerId: a.id, status: 'pending', requestedAt: t(repo), via: code.code, codeId: code.id, referralId: refId, shareProgress: false };
  repo.put(a, 'gym_member', member as any);
  repo.put(SYSTEM, 'gym_referral', { id: refId, gymId: gym.id, codeId: code.id, code: code.code, ownerId: a.id, memberId: memId, staffId: code.staffId, status: 'joined', joinedAt: t(repo) } as any);
  repo.put(SYSTEM, 'gym_code', { ...code, uses: code.uses + 1 } as any);
  return { member, gym };
}
export const listReferrals = (repo: Repo, a: Actor, gymId?: string) => repo.list(a, 'gym_referral', { gymId, newest: true });

/* ---------------- membership lifecycle ---------------- */
export function effectiveStatus(m: Member, now: number): MemberStatus | 'expiring' {
  if (m.status === 'active' && m.expiresAt != null) { if (m.expiresAt < now) return 'expired'; if (m.expiresAt - now <= 7 * DAY) return 'expiring'; }
  return m.status;
}
export const daysLeft = (m: Member, now: number) => (m.expiresAt == null ? null : Math.ceil((m.expiresAt - now) / DAY));
function activate(repo: Repo, a: Actor, m: Member, pkg: Pkg, kind: 'membership' | 'renewal', collectPayment: boolean) {
  const now = t(repo), base = kind === 'renewal' && m.expiresAt && m.expiresAt > now ? m.expiresAt : now;
  const next: Member = { ...m, status: 'active', packageId: pkg.id, startAt: kind === 'renewal' && m.startAt ? m.startAt : now, expiresAt: base + pkg.days * DAY };
  repo.put(a, 'gym_member', next as any);
  if (collectPayment) {
    const priorPaid = (pay.listTxns(repo, a, m.gymId) as any[]).some((x) => x.ownerId === m.ownerId && x.status === 'succeeded');
    const txn = pay.charge(repo, a, { gymId: m.gymId, customerId: m.ownerId, kind, amount: pkg.price, description: pkg.name + ' ' + (kind === 'renewal' ? 'renewal' : 'membership') + ' (DEMO)', packageId: pkg.id, memberId: m.id, referralId: m.referralId });
    if (txn.status === 'succeeded' && m.referralId && !priorPaid) {
      const ref = repo.get(SYSTEM, 'gym_referral', m.referralId); if (ref && ref.status === 'joined') repo.put(SYSTEM, 'gym_referral', { ...ref, status: 'converted', convertedAt: now, amount: pkg.price, commission: txn.commission?.amount || 0 } as any);
    }
  }
  return next;
}
export function approveMember(repo: Repo, a: Actor, memberId: string, packageId: string, collectPayment = true): Member {
  const m = need(repo.get(a, 'gym_member', memberId), 'Request not found') as unknown as Member;
  if (m.status !== 'pending') throw new Error('Only pending requests can be approved.');
  const pkg = need(repo.get(a, 'gym_package', packageId), 'Choose a package.') as unknown as Pkg; if (pkg.gymId !== m.gymId) throw new Forbidden('package belongs to another gym');
  return activate(repo, a, m, pkg, 'membership', collectPayment);
}
export function rejectMember(repo: Repo, a: Actor, memberId: string): Member {
  const m = need(repo.get(a, 'gym_member', memberId), 'Request not found') as unknown as Member; if (m.status !== 'pending') throw new Error('Only pending requests can be rejected.');
  return repo.put(a, 'gym_member', { ...m, status: 'rejected' } as any) as unknown as Member;
}
export function renewMember(repo: Repo, a: Actor, memberId: string, packageId: string, collectPayment = true): Member {
  const m = need(repo.get(a, 'gym_member', memberId), 'Member not found') as unknown as Member; if (!['active', 'expired'].includes(m.status)) throw new Error('Only current or expired members can be renewed.');
  const pkg = need(repo.get(a, 'gym_package', packageId), 'Choose a package.') as unknown as Pkg; if (pkg.gymId !== m.gymId) throw new Forbidden('package belongs to another gym');
  return activate(repo, a, m, pkg, 'renewal', collectPayment);
}
/** Walk-in customer added by the gym: creates a local customer profile (password shown once) and an active membership. */
export function addCustomer(repo: Repo, a: Actor, gymId: string, i: { name: string; username?: string; packageId: string; collectPayment?: boolean }): { account: Account; password: string; member: Member } {
  const name = need(clean(i.name, 50), 'Customer name required.'); const pkg = need(repo.get(a, 'gym_package', i.packageId), 'Choose a package.') as unknown as Pkg;
  if (pkg.gymId !== gymId) throw new Forbidden('package belongs to another gym');
  const base = (i.username || name.toLowerCase().replace(/[^a-z0-9]+/g, '.')).replace(/^\.+|\.+$/g, '').slice(0, 16) || 'member';
  let un = base, n = 1; while (repo.db.get('SELECT 1 x FROM accounts WHERE username=?', [un])) un = base + ++n;
  const password = 'fit' + Math.floor(1000 + Math.random() * 9000);
  const account = repo.createAccount(SYSTEM, { username: un, password, role: 'user', displayName: name, extra: { createdByGym: gymId } });
  const m: Member = { id: uid('mem'), gymId, ownerId: account.id, status: 'pending', requestedAt: t(repo), via: 'manual', shareProgress: false };
  repo.put(a, 'gym_member', m as any);
  return { account, password, member: activate(repo, a, m, pkg, 'membership', i.collectPayment !== false) };
}
export function leaveGym(repo: Repo, a: Actor, memberId: string): Member {
  const m = need(repo.get(a, 'gym_member', memberId), 'Membership not found') as unknown as Member; if (m.ownerId !== a.id) throw new Forbidden('not your membership');
  return repo.put(a, 'gym_member', { ...m, status: 'left', shareProgress: false } as any) as unknown as Member;
}
export function setShareProgress(repo: Repo, a: Actor, memberId: string, share: boolean): Member {
  const m = need(repo.get(a, 'gym_member', memberId), 'Membership not found') as unknown as Member; if (m.ownerId !== a.id) throw new Forbidden('only the customer can change sharing');
  return repo.put(a, 'gym_member', { ...m, shareProgress: share } as any) as unknown as Member;
}

export interface MemberRow { member: Member; name: string; username: string; status: ReturnType<typeof effectiveStatus>; daysLeft: number | null; packageName: string }
export function listMembers(repo: Repo, a: Actor, gymId: string, f: { q?: string; status?: string; packageId?: string } = {}): MemberRow[] {
  const now = t(repo), pk = new Map(listPackages(repo, a, gymId).map((p) => [p.id, p.name]));
  const accs = new Map(repo.listAccounts(a).map((x) => [x.id, x]));
  const q = (f.q || '').toLowerCase().trim();
  return (repo.list(a, 'gym_member', { gymId }) as unknown as Member[]).map((m) => {
    const acc = accs.get(m.ownerId); return { member: m, name: acc?.displayName || 'Customer', username: acc?.username || '', status: effectiveStatus(m, now), daysLeft: daysLeft(m, now), packageName: (m.packageId && pk.get(m.packageId)) || '-' };
  }).filter((r) => (!q || r.name.toLowerCase().includes(q) || r.username.toLowerCase().includes(q)) && (!f.status || f.status === 'all' || r.status === f.status) && (!f.packageId || r.member.packageId === f.packageId));
}
/** Gym sees a customer's progress ONLY when that customer opted in. Returns derived summary data, never raw history. */
export function memberProgress(repo: Repo, a: Actor, gymId: string, userId: string) {
  const m = (repo.list(a, 'gym_member', { gymId }) as unknown as Member[]).find((x) => x.ownerId === userId && ['active', 'expired', 'pending'].includes(x.status));
  if (!m) throw new Forbidden('That customer is not a member of this gym.');
  if (!m.shareProgress) throw new Forbidden('This customer has not chosen to share progress with the gym.');
  const ws = repo.list(SYSTEM, 'workout', { ownerId: userId }) as any[]; const now = t(repo);
  const prof: any = repo.get(SYSTEM, 'profile', userId);
  repo.audit(a, 'member.progress.view', userId, gymId, '');
  const last28 = ws.filter((w) => w.at >= now - 28 * DAY);
  return { workouts28d: last28.length, minutes28d: Math.round(last28.reduce((s, w) => s + (w.durationSec || 0), 0) / 60), lastWorkoutAt: ws.length ? Math.max(...ws.map((w) => w.at)) : null, totalWorkouts: ws.length, goals: prof?.goals || [], experience: prof?.experience || null, streakWeeks: FIT.weekStreak(ws, now, prof?.daysPerWeek || 3) };
}

/* ---------------- programmes, assignments ---------------- */
export function saveProgramme(repo: Repo, a: Actor, gymId: string, p: Omit<Programme, 'id' | 'gymId' | 'active'> & { id?: string; active?: boolean }): Programme {
  if (!clean(p.name)) throw new Error('Programme name required.'); if (!p.days?.length) throw new Error('Add at least one training day.');
  p.days.forEach((d) => { if (!d.exercises.length) throw new Error('Each day needs at least one exercise.'); d.exercises.forEach((e) => { if (!FIT.EX[e.exId]) throw new Error('Unknown exercise ' + e.exId); if (!(e.sets >= 1 && e.sets <= 10)) throw new Error('Sets must be 1-10.'); }); });
  return repo.put(a, 'gym_programme', { id: p.id || uid('prg'), gymId, name: clean(p.name, 60), description: clean(p.description, 300), level: p.level, days: p.days, active: p.active !== false } as any) as unknown as Programme;
}
export const listProgrammes = (repo: Repo, a: Actor, gymId?: string) => repo.list(a, 'gym_programme', { gymId }) as unknown as Programme[];
export function assignProgramme(repo: Repo, a: Actor, gymId: string, userId: string, programmeId: string, note = ''): any {
  const m = (repo.list(a, 'gym_member', { gymId }) as unknown as Member[]).find((x) => x.ownerId === userId && x.status === 'active'); if (!m) throw new Error('Only active members can be assigned a programme.');
  const p = need(repo.get(a, 'gym_programme', programmeId), 'Programme not found') as unknown as Programme; if (p.gymId !== gymId) throw new Forbidden('programme belongs to another gym');
  return repo.put(a, 'gym_assignment', { id: uid('asg'), gymId, ownerId: userId, programmeId, note: clean(note, 200), assignedBy: a.id, assignedAt: t(repo), status: 'active' } as any);
}
export const myAssignments = (repo: Repo, a: Actor) => (repo.list(a, 'gym_assignment', { ownerId: a.id, newest: true }) as any[]).filter((x) => x.status === 'active').map((x) => ({ assignment: x, programme: repo.get(a, 'gym_programme', x.programmeId) as unknown as Programme | undefined })).filter((x) => x.programme);

/* ---------------- announcements & challenges ---------------- */
export function postAnnouncement(repo: Repo, a: Actor, gymId: string, title: string, text: string, pinned = false) {
  if (!clean(title)) throw new Error('Title required.'); if (!clean(text)) throw new Error('Message required.');
  return repo.put(a, 'gym_announcement', { id: uid('ann'), gymId, title: clean(title, 80), text: clean(text, 600), pinned, by: a.id, at: t(repo) } as any);
}
export const listAnnouncements = (repo: Repo, a: Actor, gymId?: string) => (repo.list(a, 'gym_announcement', { gymId, newest: true }) as any[]).sort((x, y) => Number(y.pinned) - Number(x.pinned) || y.at - x.at);
export function saveChallenge(repo: Repo, a: Actor, gymId: string, c: { id?: string; title: string; description?: string; metric: 'workouts' | 'minutes'; target: number; startAt: number; endAt: number }) {
  if (!clean(c.title)) throw new Error('Title required.'); if (!(c.target >= 1)) throw new Error('Target must be at least 1.'); if (!(c.endAt > c.startAt)) throw new Error('End must be after start.');
  return repo.put(a, 'gym_challenge', { id: c.id || uid('chl'), gymId, title: clean(c.title, 60), description: clean(c.description, 200), metric: c.metric, target: Math.round(c.target), startAt: c.startAt, endAt: c.endAt } as any);
}
export const listChallenges = (repo: Repo, a: Actor, gymId?: string) => repo.list(a, 'gym_challenge', { gymId, newest: true }) as any[];
/** Customer's own progress on a challenge, from their own workout history. */
export function challengeProgress(repo: Repo, a: Actor, ch: any) {
  const ws = (repo.list(a, 'workout', { ownerId: a.id }) as any[]).filter((w) => w.at >= ch.startAt && w.at <= ch.endAt);
  const value = ch.metric === 'minutes' ? Math.round(ws.reduce((s, w) => s + (w.durationSec || 0), 0) / 60) : ws.length;
  return { value, target: ch.target, pct: Math.min(100, Math.round((value / ch.target) * 100)) };
}

/* ---------------- staff ---------------- */
export function listStaff(repo: Repo, a: Actor, gymId: string): Account[] { if (!(a.role === 'admin' || a.gymIds.includes(gymId))) throw new Forbidden('other gym'); return repo.listAccounts(a).filter((x) => x.role === 'gym' && (x.extra.gymIds || []).includes(gymId)); }
export function addStaff(repo: Repo, a: Actor, gymId: string, i: { displayName: string; username: string; password: string; staffRole: 'manager' | 'receptionist' | 'fitness'; permissions?: string[] }): Account {
  if (!STAFF_ROLES[i.staffRole] || i.staffRole === ('owner' as any)) throw new Error('Choose manager, receptionist or fitness staff.');
  if (a.role === 'gym' && !a.gymIds.includes(gymId)) throw new Forbidden('other gym');
  return repo.createAccount(a, { username: i.username, password: i.password, role: 'gym', displayName: i.displayName, extra: { gymIds: [gymId], staffRole: i.staffRole, permissions: i.permissions || STAFF_ROLES[i.staffRole].perms } });
}
export function updateStaff(repo: Repo, a: Actor, gymId: string, staffId: string, p: { staffRole?: 'manager' | 'receptionist' | 'fitness'; permissions?: string[] }): Account {
  const s = listStaff(repo, a, gymId).find((x) => x.id === staffId); if (!s) throw new Error('Staff member not found');
  if (s.extra.staffRole === 'owner') throw new Forbidden('The owner\'s role cannot be changed.');
  return repo.updateAccount(a, staffId, { extra: { staffRole: p.staffRole ?? s.extra.staffRole, permissions: p.permissions ?? (p.staffRole ? STAFF_ROLES[p.staffRole].perms : s.extra.permissions) } });
}
export function removeStaff(repo: Repo, a: Actor, gymId: string, staffId: string) {
  const s = listStaff(repo, a, gymId).find((x) => x.id === staffId); if (!s) throw new Error('Staff member not found'); if (s.extra.staffRole === 'owner') throw new Forbidden('The owner cannot be removed.');
  const left = (s.extra.gymIds || []).filter((g: string) => g !== gymId);
  return repo.updateAccount(a, staffId, { extra: { gymIds: left }, ...(left.length ? {} : { status: 'suspended' as const }) });
}

/* ---------------- reports ---------------- */
export function gymStats(repo: Repo, a: Actor, gymId: string) {
  const now = t(repo), rows = listMembers(repo, a, gymId), txns = pay.listTxns(repo, a, gymId), refs = listReferrals(repo, a, gymId);
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const weeks = Array.from({ length: 6 }, (_, i) => { const end = now - (5 - i) * 7 * DAY, start = end - 7 * DAY; return { label: new Date(end).getDate() + '/' + (new Date(end).getMonth() + 1), count: rows.filter((r) => r.member.requestedAt > start && r.member.requestedAt <= end).length }; });
  const byPkg: Record<string, number> = {}; rows.filter((r) => r.status === 'active' || r.status === 'expiring').forEach((r) => (byPkg[r.packageName] = (byPkg[r.packageName] || 0) + 1));
  const rev = pay.revenue(txns);
  return { total: rows.length, active: count('active') + count('expiring'), expiring: count('expiring'), expired: count('expired'), pending: count('pending'), inactive: count('expired') + count('left') + count('rejected'), newLast30: rows.filter((r) => r.member.requestedAt >= now - 30 * DAY).length, renewalsLast30: txns.filter((x) => x.kind === 'renewal' && x.status === 'succeeded' && x.at >= now - 30 * DAY).length, revenue: rev, referrals: { total: refs.length, converted: refs.filter((r: any) => r.status === 'converted').length }, registrationsByWeek: weeks, byPackage: byPkg };
}
export const expiryAlerts = (repo: Repo, a: Actor, gymId: string, withinDays = 7) => listMembers(repo, a, gymId).filter((r) => r.status === 'expiring' || r.status === 'expired').map((r) => ({ ...r, within: withinDays }));

/* ---------------- customer-side helpers ---------------- */
export function myMemberships(repo: Repo, a: Actor) {
  return (repo.list(a, 'gym_member', { ownerId: a.id, newest: true }) as unknown as Member[]).map((m) => ({ member: m, gym: repo.get(a, 'gym', m.gymId) as unknown as Gym | undefined, status: effectiveStatus(m, t(repo)), daysLeft: daysLeft(m, t(repo)), pkg: m.packageId ? (repo.get(a, 'gym_package', m.packageId) as unknown as Pkg | undefined) : undefined }));
}
/** Gym identity shown in the customer app: the gym the customer selected (or most recent active) when it uses custom branding. */
export function brandFor(repo: Repo, a: Actor): { gymName: string; color: string; logo: string | null; welcome: string; mode: 'shared' | 'custom' } | null {
  if (a.role !== 'user') return null;
  const mem = myMemberships(repo, a).filter((m) => m.gym && ['active', 'expiring', 'expired', 'pending'].includes(m.status as string));
  const sel = repo.getKV(a, a.id, 'activeGym'); const pick = mem.find((m) => m.gym!.id === sel) || mem.find((m) => m.status === 'active' || m.status === 'expiring') || mem[0];
  if (!pick || !pick.gym) return null;
  const g = pick.gym; return { gymName: g.name, color: g.brand.mode === 'custom' ? g.brand.color : '#C6F432', logo: g.brand.mode === 'custom' ? g.logo : null, welcome: g.brand.welcome, mode: g.brand.mode };
}
