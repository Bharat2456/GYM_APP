import FIT, { EX, EXERCISES, applyLibrary, uid, DAY } from '../engine';
import type { Exercise } from '../engine';
import { Repo, Actor, SYSTEM, Forbidden, POLICY } from '../db/repo';
import * as gymSvc from './gym';
import * as pay from './payments';
import { seedDemo } from '../db/seed';

const isAdmin = (a: Actor) => { if (a.role !== 'admin') throw new Forbidden('Platform admin only.'); };

export function platformStats(repo: Repo, a: Actor) {
  isAdmin(a); const now = repo.now();
  const accs = repo.listAccounts(a), gyms = repo.list(a, 'gym') as unknown as gymSvc.Gym[], members = repo.list(a, 'gym_member') as unknown as gymSvc.Member[], txns = repo.list(a, 'gym_txn') as unknown as pay.Txn[];
  const workouts = repo.list(a, 'workout'), cam = repo.list(a, 'camera_session'), refs = repo.list(a, 'gym_referral') as any[];
  const rev = pay.revenue(txns);
  return {
    users: accs.filter((x) => x.role === 'user').length, gymAccounts: accs.filter((x) => x.role === 'gym').length, admins: accs.filter((x) => x.role === 'admin').length, suspendedAccounts: accs.filter((x) => x.status === 'suspended').length,
    gyms: { total: gyms.length, active: gyms.filter((g) => g.status === 'active').length, pending: gyms.filter((g) => g.status === 'pending').length, suspended: gyms.filter((g) => g.status === 'suspended').length },
    memberships: { total: members.length, active: members.filter((m) => gymSvc.effectiveStatus(m, now) === 'active' || gymSvc.effectiveStatus(m, now) === 'expiring').length, pending: members.filter((m) => m.status === 'pending').length },
    workoutsLogged: workouts.length, workouts7d: workouts.filter((w) => w.at >= now - 7 * DAY).length, cameraSessions: cam.length,
    demoRevenue: rev.gross, demoCommission: rev.commission, demoTxns: txns.length, referrals: { total: refs.length, converted: refs.filter((r) => r.status === 'converted').length },
    newUsers30d: accs.filter((x) => x.role === 'user' && x.createdAt >= now - 30 * DAY).length
  };
}
export function listUsers(repo: Repo, a: Actor) {
  isAdmin(a);
  const mem = repo.list(a, 'gym_member') as unknown as gymSvc.Member[];
  return repo.listAccounts(a).filter((x) => x.role === 'user').map((u) => ({ account: u, hasProfile: !!repo.get(a, 'profile', u.id), workouts: (repo.list(a, 'workout', { ownerId: u.id }) as any[]).length, gyms: mem.filter((m) => m.ownerId === u.id && ['active', 'pending', 'expired'].includes(m.status)).length }));
}
export const createAccount = (repo: Repo, a: Actor, i: Parameters<Repo['createAccount']>[1]) => { isAdmin(a); return repo.createAccount(a, i); };
export const setAccountStatus = (repo: Repo, a: Actor, id: string, status: 'active' | 'suspended') => { isAdmin(a); if (id === a.id && status === 'suspended') throw new Error('You cannot suspend your own admin account.'); return repo.updateAccount(a, id, { status }); };
export const resetPassword = (repo: Repo, a: Actor, id: string, password: string) => { isAdmin(a); return repo.updateAccount(a, id, { password }); };
export const deleteAccount = (repo: Repo, a: Actor, id: string) => { isAdmin(a); if (id === a.id) throw new Error('You cannot delete the account you are using.'); repo.deleteAccount(a, id); };

/* ---------------- gyms ---------------- */
const setGymStatus = (repo: Repo, a: Actor, id: string, status: gymSvc.GymStatus, action: string) => { isAdmin(a); const g = repo.get(a, 'gym', id); if (!g) throw new Error('Gym not found'); const r = repo.put(a, 'gym', { ...g, status } as any); repo.audit(a, 'gym.' + action, id, id, g.name); return r as unknown as gymSvc.Gym; };
export const approveGym = (repo: Repo, a: Actor, id: string) => setGymStatus(repo, a, id, 'active', 'approve');
export const suspendGym = (repo: Repo, a: Actor, id: string) => setGymStatus(repo, a, id, 'suspended', 'suspend');
export const reactivateGym = (repo: Repo, a: Actor, id: string) => setGymStatus(repo, a, id, 'active', 'reactivate');
export function listGyms(repo: Repo, a: Actor) { isAdmin(a); return (repo.list(a, 'gym') as unknown as gymSvc.Gym[]).map((g) => ({ gym: g, stats: gymSvc.gymStats(repo, a, g.id) })); }

/* ---------------- exercise library, categories, default programmes, plans ---------------- */
export const CATEGORIES_DEFAULT = ['Strength', 'Power', 'Core', 'Cardio', 'Mobility', 'Flexibility'];
export function categories(repo: Repo, a: Actor): string[] { const extra = (repo.list(a, 'category') as any[]).map((c) => c.name); return [...CATEGORIES_DEFAULT, ...extra.filter((n) => !CATEGORIES_DEFAULT.includes(n))]; }
export function addCategory(repo: Repo, a: Actor, name: string) { isAdmin(a); const n = name.trim(); if (!n || n.length > 30) throw new Error('Category name must be 1-30 characters.'); if (categories(repo, a).some((c) => c.toLowerCase() === n.toLowerCase())) throw new Error('That category exists.'); return repo.put(a, 'category', { id: 'cat_' + n.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: n } as any); }
export function removeCategory(repo: Repo, a: Actor, name: string) { isAdmin(a); if (CATEGORIES_DEFAULT.includes(name)) throw new Error('Built-in categories cannot be removed.'); if (EXERCISES.some((e) => e.cat === name)) throw new Error('Move exercises out of this category first.'); repo.del(a, 'category', 'cat_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-')); }
/** Re-applies admin edits to the in-memory exercise library (call after boot and after each admin change). */
export function loadLibrary(repo: Repo) {
  const docs = repo.list(SYSTEM, 'exercise_custom') as any[];
  applyLibrary(docs.map((d) => (d.custom ? { id: d.id, custom: d.custom } : { id: d.id, patch: d.patch })));
}
export function editExercise(repo: Repo, a: Actor, exId: string, patch: Partial<Pick<Exercise, 'desc' | 'start' | 'steps' | 'breath' | 'mistakes' | 'easier' | 'harder' | 'safety' | 'cat' | 'off'>>) {
  isAdmin(a); const base = EX[exId]; if (!base) throw new Error('Exercise not found');
  const prev = repo.get(a, 'exercise_custom', exId); if (prev?.custom) { return saveCustomExercise(repo, a, { ...prev.custom, ...patch }); }
  if (patch.cat && !categories(repo, a).includes(patch.cat)) throw new Error('Unknown category');
  repo.put(a, 'exercise_custom', { id: exId, patch: { ...(prev?.patch || {}), ...patch } } as any); loadLibrary(repo);
}
export function saveCustomExercise(repo: Repo, a: Actor, e: Partial<Exercise> & { name: string }) {
  isAdmin(a); if (!e.name.trim()) throw new Error('Name required.');
  if (!['squat', 'hinge', 'hpush', 'vpush', 'hpull', 'vpull', 'arms', 'lunge', 'calf', 'core', 'cardio', 'mobility'].includes(e.pat || '')) throw new Error('Choose a movement pattern.');
  if (!(e.steps && e.steps.length)) throw new Error('Add at least one instruction step.');
  const id = e.id || 'cx_' + e.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24) + '_' + uid('').slice(-4);
  const custom: Exercise = { id, name: e.name.trim(), cat: e.cat || 'Strength', pat: e.pat!, diff: e.diff || 1, eq: e.eq || [], muscles: e.muscles || [], avoid: e.avoid || [], an: null, desc: e.desc || '', start: e.start || '', steps: e.steps, breath: e.breath || 'Breathe steadily; do not hold your breath.', mistakes: e.mistakes || [], easier: e.easier || '', harder: e.harder || '', safety: e.safety || 'Stop if you feel pain.', cam: undefined, d: (e.d as any) || { sets: 3, reps: 10 } };
  repo.put(a, 'exercise_custom', { id, custom } as any); loadLibrary(repo); return custom;
}
export function deleteCustomExercise(repo: Repo, a: Actor, id: string) { isAdmin(a); const d = repo.get(a, 'exercise_custom', id); if (!d?.custom) throw new Error('Only custom exercises can be deleted; built-in ones can be disabled.'); repo.del(a, 'exercise_custom', id); loadLibrary(repo); }

export function saveDefaultProgramme(repo: Repo, a: Actor, p: Omit<gymSvc.Programme, 'gymId' | 'active'> & { id?: string }) {
  isAdmin(a); if (!p.name.trim()) throw new Error('Name required.'); if (!p.days?.length) throw new Error('Add at least one day.');
  p.days.forEach((d) => d.exercises.forEach((e) => { if (!EX[e.exId]) throw new Error('Unknown exercise ' + e.exId); }));
  return repo.put(a, 'programme_default', { id: p.id || uid('dprg'), name: p.name.trim(), description: p.description || '', level: p.level, days: p.days, active: true } as any);
}
export const listDefaultProgrammes = (repo: Repo, a: Actor) => repo.list(a, 'programme_default') as unknown as gymSvc.Programme[];
export const deleteDefaultProgramme = (repo: Repo, a: Actor, id: string) => { isAdmin(a); repo.del(a, 'programme_default', id); };
/** Copies a platform default programme into a gym so the gym can edit and assign it. */
export function adoptDefaultProgramme(repo: Repo, a: Actor, gymId: string, id: string) { const p = repo.get(a, 'programme_default', id) as any; if (!p) throw new Error('Not found'); return gymSvc.saveProgramme(repo, a, gymId, { name: p.name, description: p.description, level: p.level, days: p.days }); }

export interface SubPlan { id: string; name: string; priceMonthly: number; memberLimit: number; features: string[]; active: boolean }
export function saveSubPlan(repo: Repo, a: Actor, p: Omit<SubPlan, 'id' | 'active'> & { id?: string; active?: boolean }): SubPlan { isAdmin(a); if (!p.name.trim()) throw new Error('Plan name required.'); if (!(p.priceMonthly >= 0)) throw new Error('Price must be 0 or more.'); if (!(p.memberLimit >= 1)) throw new Error('Member limit must be at least 1.'); return repo.put(a, 'sub_plan', { id: p.id || uid('plan'), name: p.name.trim(), priceMonthly: Math.round(p.priceMonthly), memberLimit: Math.round(p.memberLimit), features: p.features || [], active: p.active !== false } as any) as unknown as SubPlan; }
export const listSubPlans = (repo: Repo, a: Actor) => repo.list(a, 'sub_plan') as unknown as SubPlan[];
/** DEMO SaaS subscription for a gym; records a demo transaction against the gym. */
export function subscribeGym(repo: Repo, a: Actor, gymId: string, planId: string) {
  const plan = repo.get(a, 'sub_plan', planId) as unknown as SubPlan; if (!plan || !plan.active) throw new Error('Plan not available.');
  const g = repo.get(a, 'gym', gymId) as unknown as gymSvc.Gym; if (!g) throw new Error('Gym not found');
  const txn = pay.charge(repo, a, { gymId, customerId: a.id, kind: 'saas_subscription', amount: plan.priceMonthly, description: plan.name + ' gym subscription (DEMO)' });
  repo.put(a, 'gym', { ...g, subscription: { planId, status: 'active', since: repo.now() } } as any); return txn;
}
export const setCommissionPct = (repo: Repo, a: Actor, pct: number) => { isAdmin(a); if (!(pct >= 0 && pct <= 50)) throw new Error('Commission must be between 0 and 50 percent.'); repo.setKV(a, 'platform', 'referral.commissionPct', pct); };
export const getBranding = (repo: Repo) => repo.getKV(SYSTEM, 'platform', 'branding', { appName: 'Kinetic Coach', accent: '#C6F432' }) as { appName: string; accent: string };
export function setBranding(repo: Repo, a: Actor, b: { appName: string; accent: string }) { isAdmin(a); if (!b.appName.trim() || b.appName.length > 30) throw new Error('App name must be 1-30 characters.'); if (!/^#[0-9a-fA-F]{6}$/.test(b.accent)) throw new Error('Accent must look like #C6F432.'); repo.setKV(a, 'platform', 'branding', { appName: b.appName.trim(), accent: b.accent }); }
export const getDefaults = (repo: Repo) => repo.getKV(SYSTEM, 'platform', 'defaults', { daysPerWeek: 3, sessionMin: 40, goals: ['general'] }) as any;
export function setDefaults(repo: Repo, a: Actor, d: { daysPerWeek: number; sessionMin: number; goals: string[] }) { isAdmin(a); if (!(d.daysPerWeek >= 2 && d.daysPerWeek <= 6)) throw new Error('Days per week must be 2-6.'); if (!(d.sessionMin >= 15 && d.sessionMin <= 120)) throw new Error('Session length must be 15-120 min.'); repo.setKV(a, 'platform', 'defaults', d); }

/* ---------------- operations ---------------- */
export function diagnostics(repo: Repo, a: Actor, extra: Record<string, any> = {}) {
  isAdmin(a); const s = repo.stats();
  const perColl = Object.keys(POLICY).map((c) => ({ collection: c, rows: (repo.db.get<{ n: number }>('SELECT COUNT(*) n FROM docs WHERE collection=?', [c])?.n) || 0 }));
  return { schemaVersion: s.schema, accounts: s.accounts, records: s.docs, auditEntries: s.audit, perCollection: perColl, exercisesInLibrary: EXERCISES.length, foodsInDatabase: FIT.FOODS.length, integrity: repo.db.get<any>('PRAGMA integrity_check')?.integrity_check, ...extra };
}
export const resetDemo = (repo: Repo, a: Actor) => { isAdmin(a); repo.wipe(); seedDemo(repo); loadLibrary(repo); };
export const exportAll = (repo: Repo, a: Actor) => repo.exportAll(a);
export function importAll(repo: Repo, a: Actor, data: any) { const r = repo.importAll(a, data); loadLibrary(repo); return r; }
export const activity = (repo: Repo, a: Actor, limit = 100) => repo.listAudit(a, { limit });
