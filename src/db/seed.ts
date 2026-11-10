import FIT, { EX, FOODS, DAY, ymd } from '../engine';
import { Repo, SYSTEM, Actor } from './repo';
import * as W from '../services/workouts';

/** Demo credentials (prototype only, NOT production security). */
export const DEMO = { admin: { username: 'admin', password: 'admin123' }, gym: { username: 'gym', password: 'gym123' }, user: { username: 'user', password: 'user123' } };
export const IDS = { gymIron: 'gym_iron', gymPulse: 'gym_pulse', accAdmin: 'acc_admin', accGym: 'acc_gym', accGym2: 'acc_gym2', accUser: 'acc_user', accRiya: 'acc_riya', accKaran: 'acc_karan', accMeera: 'acc_meera', accSam: 'acc_sam', accNeha: 'acc_neha', accAsha: 'acc_asha', accDev: 'acc_dev', accRohit: 'acc_rohit', codeIron: 'IRON-JOIN1', codePulse: 'PULS-JOIN1' };

const prof = (o: any) => ({ name: 'Member', age: 25, heightCm: 170, weightKg: 68, sex: null, activity: 'moderate', goals: ['general'], experience: 'beginner', env: 'home', equipment: [], daysPerWeek: 3, sessionMin: 40, restDays: [], limits: { areas: [], painNow: false, medical: false }, consents: { camera: true, dataLocal: true }, ...o });

export function seedDemo(repo: Repo): void {
  const now = repo.now();
  const acct = (id: string, username: string, pw: string, role: 'admin' | 'gym' | 'user', name: string, extra: any = {}) => repo.createAccount(SYSTEM, { id, username, password: pw, role, displayName: name, extra });
  acct(IDS.accAdmin, 'admin', 'admin123', 'admin', 'Platform Admin');
  acct(IDS.accGym, 'gym', 'gym123', 'gym', 'Iron Works Owner', { gymIds: [IDS.gymIron], staffRole: 'owner' });
  acct(IDS.accGym2, 'gym2', 'gym123', 'gym', 'Pulse Studio Owner', { gymIds: [IDS.gymPulse], staffRole: 'owner' });
  acct(IDS.accAsha, 'asha', 'staff123', 'gym', 'Asha Kulkarni', { gymIds: [IDS.gymIron], staffRole: 'manager' });
  acct(IDS.accDev, 'dev', 'staff123', 'gym', 'Dev Patil', { gymIds: [IDS.gymIron], staffRole: 'receptionist' });
  acct(IDS.accRohit, 'rohit', 'staff123', 'gym', 'Rohit Shah', { gymIds: [IDS.gymPulse], staffRole: 'fitness' });
  const users: [string, string, string][] = [[IDS.accUser, 'user', 'Demo User'], [IDS.accRiya, 'riya', 'Riya Deshmukh'], [IDS.accKaran, 'karan', 'Karan Mehta'], [IDS.accMeera, 'meera', 'Meera Nair'], [IDS.accSam, 'sam', 'Sam Fernandes'], [IDS.accNeha, 'neha', 'Neha Joshi']];
  users.forEach(([id, un, nm]) => acct(id, un, 'user123', 'user', nm));
  const actor = (id: string): Actor => repo.actorOf(repo.getAccount(SYSTEM, id)!);

  /* platform content */
  repo.setKV(SYSTEM, 'platform', 'referral.commissionPct', 10);
  repo.setKV(SYSTEM, 'platform', 'branding', { appName: 'Kinetic Coach', accent: '#C6F432' });
  repo.setKV(SYSTEM, 'platform', 'defaults', { daysPerWeek: 3, sessionMin: 40, goals: ['general'] });
  [['plan_starter', 'Starter', 999, 100, ['Member management', 'Programmes', 'Announcements']], ['plan_pro', 'Pro', 2499, 500, ['Everything in Starter', 'Referral tracking', 'Branding', 'Reports']], ['plan_scale', 'Scale', 5999, 5000, ['Everything in Pro', 'Multiple locations', 'Priority support']]].forEach(([id, name, price, lim, f]: any) => repo.put(SYSTEM, 'sub_plan', { id, name, priceMonthly: price, memberLimit: lim, features: f, active: true }));
  repo.put(SYSTEM, 'programme_default', { id: 'dprg_home', name: 'Home starter (no equipment)', description: 'Three simple bodyweight days for beginners.', level: 'beginner', active: true, days: [
    { title: 'Legs and core', exercises: [{ exId: 'bw_squat', sets: 3, reps: 10, rest: 60 }, { exId: 'glute_bridge', sets: 3, reps: 12, rest: 45 }, { exId: 'plank', sets: 2, secs: 30, rest: 45 }] },
    { title: 'Upper body', exercises: [{ exId: 'incline_pushup', sets: 3, reps: 8, rest: 60 }, { exId: 'bird_dog', sets: 2, reps: 8, rest: 45 }, { exId: 'dead_bug', sets: 2, reps: 8, rest: 45 }] }] });
  repo.put(SYSTEM, 'programme_default', { id: 'dprg_gym3', name: 'Gym foundation (3 day)', description: 'Machines-free full-body base using barbell and dumbbells.', level: 'intermediate', active: true, days: [
    { title: 'Day A', exercises: [{ exId: 'back_squat', sets: 3, reps: 8, rest: 90 }, { exId: 'barbell_bench', sets: 3, reps: 8, rest: 90 }, { exId: 'db_row', sets: 3, reps: 10, rest: 60 }] },
    { title: 'Day B', exercises: [{ exId: 'rdl', sets: 3, reps: 10, rest: 90 }, { exId: 'db_press', sets: 3, reps: 10, rest: 75 }, { exId: 'pullup', sets: 3, reps: 5, rest: 90 }] }] });

  /* gyms */
  const G = (id: string, name: string, desc: string, addr: string, phone: string, owner: string, brand: any, logo: string | null = null) => repo.put(SYSTEM, 'gym', { id, name, description: desc, address: addr, phone, email: id.replace('gym_', '') + '@demo.example', hours: 'Mon-Sat 6:00-22:00, Sun 7:00-13:00', logo, brand, status: 'active', ownerId: owner, subscription: null, createdAt: now - 90 * DAY });
  G(IDS.gymIron, 'Iron Works Fitness', 'Strength-focused gym with free weights, racks and coaching floor.', 'FC Road, Pune', '+91 20 5550 0101', IDS.accGym, { mode: 'custom', color: '#FF7A1A', welcome: 'Train hard, recover harder.' });
  G(IDS.gymPulse, 'Pulse Studio', 'Boutique studio: HIIT, mobility and small-group classes.', 'Baner, Pune', '+91 20 5550 0202', IDS.accGym2, { mode: 'shared', color: '#C6F432', welcome: 'Welcome to Pulse Studio' });
  const pk = (id: string, gymId: string, name: string, days: number, price: number) => repo.put(SYSTEM, 'gym_package', { id, gymId, name, days, price, description: name + ' access', active: true });
  pk('pkg_i_m', IDS.gymIron, 'Monthly', 30, 1500); pk('pkg_i_q', IDS.gymIron, 'Quarterly', 90, 4000); pk('pkg_i_a', IDS.gymIron, 'Annual', 365, 12000);
  pk('pkg_p_b', IDS.gymPulse, 'Basic', 30, 1200); pk('pkg_p_p', IDS.gymPulse, 'Premium', 30, 2200);
  repo.put(SYSTEM, 'gym_programme', { id: 'prg_i_beg', gymId: IDS.gymIron, name: 'Iron Works Beginner Strength', description: 'Three full-body days to learn the lifts.', level: 'beginner', active: true, days: [
    { title: 'Day 1 · Squat focus', exercises: [{ exId: 'goblet_squat', sets: 3, reps: 10, rest: 75 }, { exId: 'db_bench', sets: 3, reps: 10, rest: 75 }, { exId: 'db_row', sets: 3, reps: 10, rest: 60 }, { exId: 'plank', sets: 3, secs: 30, rest: 45 }] },
    { title: 'Day 2 · Hinge focus', exercises: [{ exId: 'rdl', sets: 3, reps: 10, rest: 75 }, { exId: 'db_press', sets: 3, reps: 8, rest: 75 }, { exId: 'lunge', sets: 3, reps: 8, rest: 60 }] }] });
  repo.put(SYSTEM, 'gym_programme', { id: 'prg_p_mob', gymId: IDS.gymPulse, name: 'Pulse Mobility and Core', description: 'Low-impact mobility flow.', level: 'beginner', active: true, days: [{ title: 'Flow', exercises: [{ exId: 'cat_cow', sets: 2, reps: 10, rest: 30 }, { exId: 'bird_dog', sets: 3, reps: 8, rest: 45 }, { exId: 'hip_flexor', sets: 2, secs: 40, rest: 30 }] }] });
  repo.put(SYSTEM, 'gym_announcement', { id: 'ann_1', gymId: IDS.gymIron, title: 'Diwali timings', text: 'Open 7:00-14:00 on Diwali. Normal hours resume the next day.', pinned: true, by: IDS.accGym, at: now - 2 * DAY });
  repo.put(SYSTEM, 'gym_announcement', { id: 'ann_2', gymId: IDS.gymIron, title: 'New squat racks', text: 'Two new power racks are now on the strength floor.', pinned: false, by: IDS.accAsha, at: now - 9 * DAY });
  repo.put(SYSTEM, 'gym_announcement', { id: 'ann_3', gymId: IDS.gymPulse, title: 'Saturday HIIT', text: 'Free guest pass for Saturday 8 AM HIIT.', pinned: false, by: IDS.accGym2, at: now - DAY });
  repo.put(SYSTEM, 'gym_challenge', { id: 'chl_1', gymId: IDS.gymIron, title: '12 workouts in 30 days', description: 'Log 12 workouts before the month ends.', metric: 'workouts', target: 12, startAt: now - 15 * DAY, endAt: now + 15 * DAY });
  repo.put(SYSTEM, 'gym_code', { id: 'code_i1', gymId: IDS.gymIron, code: IDS.codeIron, kind: 'customer', label: 'Front desk QR', staffId: IDS.accAsha, uses: 2, active: true });
  repo.put(SYSTEM, 'gym_code', { id: 'code_p1', gymId: IDS.gymPulse, code: IDS.codePulse, kind: 'customer', label: 'Studio flyer', uses: 2, active: true });
  repo.put(SYSTEM, 'gym_code', { id: 'code_i2', gymId: IDS.gymIron, code: 'IRON-STAFF', kind: 'staff', label: 'Staff invite', uses: 0, active: true });

  /* memberships, referrals, demo transactions */
  let inv = 0;
  const member = (id: string, gymId: string, ownerId: string, status: string, pkgId: string | undefined, startDays: number, expDays: number | null, share: boolean, via?: string, refId?: string) =>
    repo.put(SYSTEM, 'gym_member', { id, gymId, ownerId, status, packageId: pkgId, startAt: pkgId ? now + startDays * DAY : undefined, expiresAt: expDays == null ? undefined : now + expDays * DAY, requestedAt: now + (startDays - 1) * DAY, via, referralId: refId, shareProgress: share, codeId: via ? (gymId === IDS.gymIron ? 'code_i1' : 'code_p1') : undefined });
  const txn = (gymId: string, ownerId: string, kind: string, amt: number, daysAgo: number, desc: string, memberId?: string, refId?: string) => {
    const comm = refId ? { pct: 10, amount: amt / 10 } : undefined;
    repo.put(SYSTEM, 'gym_txn', { id: 'txn_' + (++inv), gymId, ownerId, kind, description: desc + ' (DEMO)', amount: amt, currency: 'INR', status: 'succeeded', demo: true, provider: 'demo', providerRef: 'DEMO-SEED' + inv, invoiceNo: 'DEMO-INV-SEED-' + String(inv).padStart(4, '0'), memberId, referralId: refId, commission: comm, at: now - daysAgo * DAY });
  };
  const ref = (id: string, gymId: string, code: string, ownerId: string, memberId: string, staffId: string | undefined, status: string, daysAgo: number, amt?: number) => repo.put(SYSTEM, 'gym_referral', { id, gymId, codeId: gymId === IDS.gymIron ? 'code_i1' : 'code_p1', code, ownerId, memberId, staffId, status, joinedAt: now - daysAgo * DAY, convertedAt: status === 'converted' ? now - (daysAgo - 1) * DAY : undefined, amount: amt, commission: amt ? amt / 10 : undefined });
  member('mem_user', IDS.gymIron, IDS.accUser, 'active', 'pkg_i_q', -20, 70, false, IDS.codeIron, 'ref_user'); ref('ref_user', IDS.gymIron, IDS.codeIron, IDS.accUser, 'mem_user', IDS.accAsha, 'converted', 21, 4000); txn(IDS.gymIron, IDS.accUser, 'membership', 4000, 20, 'Quarterly membership', 'mem_user', 'ref_user');
  member('mem_riya', IDS.gymIron, IDS.accRiya, 'active', 'pkg_i_m', -25, 5, true, IDS.codeIron, 'ref_riya'); ref('ref_riya', IDS.gymIron, IDS.codeIron, IDS.accRiya, 'mem_riya', IDS.accAsha, 'converted', 26, 1500); txn(IDS.gymIron, IDS.accRiya, 'membership', 1500, 25, 'Monthly membership', 'mem_riya', 'ref_riya');
  member('mem_karan', IDS.gymIron, IDS.accKaran, 'pending', undefined, 0, null, false, IDS.codeIron, 'ref_karan'); ref('ref_karan', IDS.gymIron, IDS.codeIron, IDS.accKaran, 'mem_karan', IDS.accAsha, 'joined', 1);
  member('mem_meera', IDS.gymPulse, IDS.accMeera, 'active', 'pkg_p_b', -10, 20, true, IDS.codePulse, 'ref_meera'); ref('ref_meera', IDS.gymPulse, IDS.codePulse, IDS.accMeera, 'mem_meera', undefined, 'converted', 11, 1200); txn(IDS.gymPulse, IDS.accMeera, 'membership', 1200, 10, 'Basic membership', 'mem_meera', 'ref_meera');
  member('mem_sam', IDS.gymPulse, IDS.accSam, 'active', 'pkg_p_b', -45, -15, false); txn(IDS.gymPulse, IDS.accSam, 'membership', 1200, 45, 'Basic membership', 'mem_sam');
  txn(IDS.gymIron, IDS.accGym, 'saas_subscription', 2499, 30, 'Pro gym subscription');
  repo.put(SYSTEM, 'gym', { ...(repo.get(SYSTEM, 'gym', IDS.gymIron) as any), subscription: { planId: 'plan_pro', status: 'active', since: now - 30 * DAY } });
  repo.put(SYSTEM, 'gym_assignment', { id: 'asg_1', gymId: IDS.gymIron, ownerId: IDS.accUser, programmeId: 'prg_i_beg', note: 'Start with Day 1 this week.', assignedBy: IDS.accAsha, assignedAt: now - 5 * DAY, status: 'active' });

  /* user profiles, plans, history */
  const setup = (id: string, p: any, weeksOfHistory: number, perWeek: number, meals: boolean) => {
    const a = actor(id); repo.put(a, 'profile', { id, ownerId: id, ...prof(p) }); W.buildPlan(repo, a, { reason: 'Initial plan', now });
    const pd = W.getPlanDoc(repo, a)!; const done: any[] = [];
    for (let w = weeksOfHistory; w >= 1; w--) pd.plan.days.slice(0, perWeek).forEach((d, di) => {
      const at = FIT.weekStart(now) - (w - 1) * 7 * DAY - (7 - ((d.dow! + 6) % 7)) * DAY + 18 * 3600_000; if (at >= now - DAY) return;
      const prog = weeksOfHistory - w;
      repo.put(a, 'workout', { id: 'w_' + id + '_' + w + '_' + di, ownerId: id, date: ymd(at), at, title: d.title, durationSec: (d.estMin || 35) * 60 - 120 * ((w + di) % 3), source: 'plan', fatigue: false, dizzy: false,
        exercises: d.exercises.map((it: any) => { const heavy = EX[it.exId].eq.length > 0 && !EX[it.exId].eq.includes('bands'); const weight = heavy ? 8 + 2.5 * Math.floor(prog / 2) : 0; const sets = Array.from({ length: it.sets }, () => ({ reps: it.reps || 0, secs: it.secs || 0, weight, done: true })); return { exId: it.exId, planned: { sets: it.sets, reps: it.reps, secs: it.secs }, sets, rating: 'ok', pain: false, completedAll: true }; }) });
    });
    for (let w = 5; w >= 0; w--) repo.put(a, 'weight', { id: 'wt_' + id + '_' + w, ownerId: id, at: now - w * 7 * DAY, date: ymd(now - w * 7 * DAY), kg: Math.round((p.weightKg + w * 0.25) * 10) / 10 });
    if (meals) for (let d = 5; d >= 0; d--) {
      const date = ymd(now - d * DAY), pick = (...ids: string[]) => ids.map((x) => FIT.makeItem(x, 1));
      [['breakfast', pick('poha', 'chai')], ['lunch', pick('roti', 'dal', 'sabzi', 'curd')], ['snack', pick('banana', 'almonds')], ['dinner', pick('rice', 'chicken_curry', 'salad')]].forEach(([slot, items]: any) => repo.put(a, 'meal', { id: 'meal_' + id + '_' + date + '_' + slot, ownerId: id, date, slot, items }));
    }
  };
  setup(IDS.accUser, { name: 'Demo User', age: 22, heightCm: 175, weightKg: 70, goals: ['strength', 'muscle'], experience: 'beginner', env: 'home', equipment: ['dumbbells', 'bands'], daysPerWeek: 3, sessionMin: 40 }, 4, 3, true);
  setup(IDS.accRiya, { name: 'Riya Deshmukh', age: 27, heightCm: 163, weightKg: 58, sex: 'female', goals: ['weight'], experience: 'intermediate', env: 'gym', equipment: [], daysPerWeek: 4, sessionMin: 45 }, 4, 4, false);
  setup(IDS.accMeera, { name: 'Meera Nair', age: 31, heightCm: 160, weightKg: 62, sex: 'female', goals: ['general'], experience: 'beginner', env: 'home', equipment: ['mat'], daysPerWeek: 3, sessionMin: 30 }, 2, 2, false);
  repo.put(actor(IDS.accUser), 'camera_session', { id: 'cam_seed1', ownerId: IDS.accUser, at: now - 3 * DAY, date: ymd(now - 3 * DAY), key: 'squat', exId: 'bw_squat', reps: 8, cleanReps: 6, durationSec: 70, issues: { kneesIn: 2 }, notes: ['Example session (seed data).'], usablePct: 92, estimate: true });
  repo.db.run('INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)', ['seeded', String(now)]);
}
export const isSeeded = (repo: Repo) => !!repo.db.get('SELECT 1 x FROM meta WHERE k=?', ['seeded']);
export const ensureSeeded = (repo: Repo) => { if (!isSeeded(repo)) seedDemo(repo); };
