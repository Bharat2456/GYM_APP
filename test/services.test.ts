import { freshRepo, as, t, ok, eq, throws, section, done, clock, NOW, nodeDb } from './helpers';
import { Repo, SYSTEM } from '../src/db/repo';
import { IDS, seedDemo } from '../src/db/seed';
import { DAY, EX, FOODS } from '../src/engine';
import FIT from '../src/engine';
import * as S from '../src/services/session';
import * as W from '../src/services/workouts';
import * as N from '../src/services/nutrition';
import * as G from '../src/services/gym';
import * as P from '../src/services/payments';
import * as A from '../src/services/admin';
import * as C from '../src/services/coach';
import * as B from '../src/services/backup';
import * as Nt from '../src/services/notifications';
import { sha256 } from '../src/services/crypto';
import * as fs from 'fs';

section('Crypto');
t('sha256 matches the standard test vectors', () => { eq(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'); eq(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'); });

section('Account, session and role tests');
t('login routes each demo account to its own role and data', () => {
  const r = freshRepo(); const a = S.login(r, 'admin', 'admin123'), g = S.login(r, 'gym', 'gym123'), u = S.login(r, 'user', 'user123');
  eq([a.account.role, g.account.role, u.account.role], ['admin', 'gym', 'user']); eq(g.activeGymId, IDS.gymIron); eq(r.list(u.actor, 'workout', { ownerId: u.actor.id }).length > 0, true);
  throws(() => S.login(r, 'user', 'wrong'), /Incorrect/); throws(() => S.login(r, '', ''), /Enter/);
});
t('role-specific navigation: each role only opens its own areas', () => { eq(S.canOpen('user', 'overview'), false); eq(S.canOpen('gym', 'members'), true); eq(S.canOpen('gym', 'system'), false); eq(S.canOpen('admin', 'train'), false); eq(S.canOpen('admin', 'gyms'), true); });
t('admin can switch between the three demo roles without re-registering; others cannot', () => {
  const r = freshRepo(); const a = S.login(r, 'admin', 'admin123'); const asGym = S.switchRole(r, a, IDS.accGym); eq(asGym.account.role, 'gym'); eq(asGym.originAdminId, IDS.accAdmin);
  const asUser = S.switchRole(r, asGym, IDS.accUser); eq(asUser.account.username, 'user'); eq(S.switchRole(r, asUser, IDS.accAdmin).account.role, 'admin');
  throws(() => S.switchRole(r, S.login(r, 'user', 'user123'), IDS.accAdmin), /Only the platform admin/); ok(S.demoSwitchTargets(r, a).length >= 10); eq(S.demoSwitchTargets(r, S.login(r, 'gym', 'gym123')).length, 0);
  eq(r.list(asUser.actor, 'workout').every((w) => w.ownerId === IDS.accUser), true, 'switched session sees only that account data');
});
t('local customer profile sign-up then login; suspended accounts cannot log in', () => {
  const r = freshRepo(); const s = S.signUpCustomer(r, { username: 'asha.k', password: 'secret1', displayName: 'Asha K' }); eq(s.account.role, 'user'); eq(S.login(r, 'asha.k', 'secret1').account.id, s.account.id);
  const ad = as(r, 'admin'); A.setAccountStatus(r, ad, s.account.id, 'suspended'); throws(() => S.login(r, 'asha.k', 'secret1'), /suspended/); A.setAccountStatus(r, ad, s.account.id, 'active'); S.login(r, 'asha.k', 'secret1');
  throws(() => A.setAccountStatus(r, ad, IDS.accAdmin, 'suspended'), /your own/);
});

section('Workout engine');
const newUser = (r: Repo, over: any = {}) => { const s = S.signUpCustomer(r, { username: 'fresh' + Math.floor(Math.random() * 1e6), password: 'pass1234', displayName: 'Fresh' }); r.put(s.actor, 'profile', { id: s.actor.id, ownerId: s.actor.id, name: 'Fresh', age: 24, heightCm: 172, weightKg: 70, sex: null, activity: 'moderate', goals: ['general'], experience: 'beginner', env: 'home', equipment: [], daysPerWeek: 3, sessionMin: 30, restDays: [], limits: { areas: [], painNow: false, medical: false }, ...over }); return s.actor; };
t('generate a plan: deterministic, stored, reload gives the same plan (no random regeneration)', () => {
  const r = freshRepo(); const u = newUser(r); const p1 = W.buildPlan(r, u, { reason: 'Initial plan', now: NOW }); eq(p1.plan.days.length, 3); const again = W.getPlanDoc(r, u)!; eq(JSON.stringify(again.plan), JSON.stringify(p1.plan));
  const p2 = W.buildPlan(r, u, { reason: 'Rebuild', now: NOW }); eq(p2.plan.days.map((d) => d.exercises.map((e) => e.exId).join()).join('|'), p1.plan.days.map((d) => d.exercises.map((e) => e.exId).join()).join('|'), 'same seed -> same plan'); eq(p2.revisions.length, 1); eq(p2.plan.version, 2);
});
t('home/gym and equipment-aware selection; levels respected', () => {
  const r = freshRepo(); const u = newUser(r, { experience: 'advanced', env: 'gym', equipment: [] }); const gp = W.buildPlan(r, u, { reason: 'x', now: NOW });
  ok(gp.plan.days.some((d) => d.exercises.some((e) => EX[e.exId].eq.includes('gym'))), 'gym plan uses gym equipment');
  const h = newUser(r); const hp = W.buildPlan(r, h, { reason: 'x', now: NOW }); hp.plan.days.forEach((d) => d.exercises.forEach((e) => eq(EX[e.exId].eq.length, 0, EX[e.exId].name + ' needs equipment')));
});
t('start, complete a set, skip, replace, pause/resume, finish, persists as history', () => {
  const r = freshRepo(); const u = newUser(r); const pd = W.buildPlan(r, u, { reason: 'x', now: NOW }); const day = pd.plan.days[0];
  let run = W.startRun(r, u, { kind: 'plan', dow: day.dow! }); eq(run.exercises.length, day.exercises.length); ok(W.getRun(r, u), 'draft persisted');
  run = W.completeSet(run, 0, 0, { reps: 10, weight: 0 }); run = W.skipExercise(run, 1);
  const alts = FIT.alternativesFor(EX[run.exercises[2].exId], r.get(u, 'profile', u.id), pd.plan); if (alts.length) { run = W.replaceExercise(run, 2, alts[0].id); eq(run.exercises[2].replacedFrom !== undefined, true); }
  run.startedAt = NOW - 1800_000; W.pauseRun(run, NOW - 600_000); W.resumeRun(run, NOW - 300_000); eq(W.runElapsedSec(run, NOW), 1800 - 300, 'paused time excluded'); W.saveRun(r, u, run);
  const restored = W.getRun(r, u)!; eq(restored.exercises[1].skipped, true, 'pause state and skip survive restart');
  for (let i = 1; i < restored.exercises[0].sets.length; i++) W.completeSet(restored, 0, i, { reps: 10 });
  const res = W.finishRun(r, u, restored, { rating: 'ok' }); eq(W.getRun(r, u), undefined, 'draft cleared'); const hist = W.listWorkouts(r, u); eq(hist.length, 1);
  eq(hist[0].exercises.find((e: any) => e.skipped)!.skipped, true); ok(hist[0].exercises[0].sets.filter((s: any) => s.done).length === restored.exercises[0].sets.length); ok(res.session.durationSec > 0);
});
t('persistence: a brand-new Repo on the same database file sees the saved workout (app restart)', () => {
  const path = '/tmp/kinetic-persist-test.db'; try { fs.unlinkSync(path); } catch {}
  const r1 = new Repo(nodeDb(path), () => NOW); seedDemo(r1); const u = r1.actorOf(r1.verifyLogin('user', 'user123')!); const before = W.listWorkouts(r1, u).length;
  const run = W.startRun(r1, u, { kind: 'custom', title: 'Quick set', exIds: ['bw_squat'] }); W.completeSet(run, 0, 0, { reps: 12 }); W.finishRun(r1, u, run);
  const r2 = new Repo(nodeDb(path), () => NOW); const u2 = r2.actorOf(r2.verifyLogin('user', 'user123')!); eq(W.listWorkouts(r2, u2).length, before + 1); ok(W.getPlanDoc(r2, u2)); eq(r2.schemaVersion, r1.schemaVersion);
});
t('history drives future plans: repeated "too easy" ratings progress the plan; pain flags make it safer', () => {
  const r = freshRepo(); const u = newUser(r); const pd = W.buildPlan(r, u, { reason: 'x', now: NOW }); const day = pd.plan.days[0]; let changed = false;
  for (let i = 0; i < 4; i++) { clock.t = NOW + i * 2 * DAY; const run = W.startRun(r, u, { kind: 'plan', dow: day.dow! }); run.exercises.forEach((_, ei) => run.exercises[ei].sets.forEach((_s, si) => W.completeSet(run, ei, si, { reps: run.exercises[ei].planned.reps || 0, secs: run.exercises[ei].planned.secs || 0 }))); const res = W.finishRun(r, u, run, { rating: 'tooEasy' }); if (res.changes.length) changed = true; }
  ok(changed || W.getPlanDoc(r, u)!.plan.version > 1, 'plan adapted from stored history');
  clock.t = NOW + 10 * DAY; const run = W.startRun(r, u, { kind: 'plan', dow: day.dow! }); run.exercises[0].pain = true; W.completeSet(run, 0, 0); const res = W.finishRun(r, u, run, {}); ok(res.changes.length + res.advisories.length > 0, 'pain produces a change or advisory'); eq(r.list(u, 'workout').length, 5);
});
t('suggested weights: repeat until completed, then +2.5 kg; reduced after pain', () => {
  const mk = (rating: string, all: boolean, pain = false) => [{ at: 1, exercises: [{ exId: 'db_row', completedAll: all, rating, pain, sets: [{ done: true, weight: 10 }] }] }];
  eq(W.suggestWeight(mk('ok', true), 'db_row')!.kg, 12.5); eq(W.suggestWeight(mk('tooHard', true), 'db_row')!.kg, 10); eq(W.suggestWeight(mk('ok', false), 'db_row')!.kg, 10); eq(W.suggestWeight(mk('ok', true, true), 'db_row')!.kg, 7.5); eq(W.suggestWeight([], 'db_row'), null); eq(W.suggestWeight(mk('ok', true), 'pushup'), null);
});
t('a gym programme can be run as a workout; swap/move day in the plan', () => {
  const r = freshRepo(); const u = as(r, 'user'); const run = W.startRun(r, u, { kind: 'programme', programmeId: 'prg_i_beg', dayIndex: 0 }); eq(run.source, 'programme'); eq(run.exercises.length, 4);
  const pd = W.getPlanDoc(r, u)!; const d = pd.plan.days[0]; const free = [0, 1, 2, 3, 4, 5, 6].find((x) => !pd.plan.days.some((y) => y.dow === x))!; W.moveDay(r, u, d.dow!, free); ok(W.getPlanDoc(r, u)!.plan.days.some((x) => x.dow === free)); throws(() => W.moveDay(r, u, free, pd.plan.days[1].dow!), /already/);
});
t('another customer cannot run someone else\'s assigned programme', () => { const r = freshRepo(); throws(() => W.startRun(r, as(r, 'meera'), { kind: 'programme', programmeId: 'prg_i_beg', dayIndex: 0 }), /not found or not assigned/); });

section('Nutrition');
t('add, edit quantity, correct the food, delete; totals recalculate and fibre is tracked', () => {
  const r = freshRepo(); const u = newUser(r); const d = '2026-11-11';
  const it = N.addFood(r, u, d, 'breakfast', 'poha', 1); eq(it.kcal, FOODS.find((f) => f.id === 'poha')!.kcal); N.addFood(r, u, d, 'lunch', 'roti', 2); N.addCustom(r, u, d, 'snack', { name: 'Homemade ladoo', kcal: 180, p: 3, estimate: true });
  let v = N.dayView(r, u, d); eq(v.totals.kcal, it.kcal + 2 * FOODS.find((f) => f.id === 'roti')!.kcal + 180); ok(v.totals.fi > 0, 'fibre totals');
  const mid = Object.values(v.bySlot).flat().find((m) => m.slot === 'breakfast')!.id; const edited = N.editItem(r, u, mid, it.id, { qty: 1.5 }); eq(edited.kcal, Math.round(FOODS.find((f) => f.id === 'poha')!.kcal * 1.5));
  const swapped = N.editItem(r, u, mid, it.id, { foodId: 'upma' }); eq(swapped.name, FOODS.find((f) => f.id === 'upma')!.name); eq(swapped.kcal, Math.round(FOODS.find((f) => f.id === 'upma')!.kcal * 1.5), 'quantity kept, nutrients recalculated');
  const lunch = Object.values(N.dayView(r, u, d).bySlot).flat().find((m) => m.slot === 'lunch')!; N.deleteItem(r, u, lunch.id, lunch.items[0].id); v = N.dayView(r, u, d); eq(v.bySlot.lunch, undefined, 'empty meal removed');
  eq(v.totals.kcal, swapped.kcal + 180); throws(() => N.addFood(r, u, d, 'dinner', 'poha', 0), /between/); throws(() => N.addCustom(r, u, d, 'dinner', { name: '', kcal: 5 }), /name/); throws(() => N.addFood(r, u, d, 'dinner', 'nope', 1), /Unknown/);
});
t('nutrition persists, is private, and targets are safe and overridable within limits', () => {
  const r = freshRepo(); const u = as(r, 'user'); const tg = N.targetsFor(r, u)!; ok(tg.kcal > 1200 && tg.protein > 40); N.setTargetOverride(r, u, { kcal: 2200 }); eq(N.targetsFor(r, u)!.kcal, 2200); throws(() => N.setTargetOverride(r, u, { kcal: 600 }), /safe range/);
  const week = N.weekView(r, u, NOW); eq(week.length, 7); ok(week.filter((d: any) => d.logged).length >= 5); throws(() => N.listMeals(r, as(r, 'riya'), IDS.accUser), /not your record/);
  ok(N.searchFoods('paneer').length >= 2); ok(N.searchFoods('dal').some((f: any) => /dal/i.test(f.name))); ok(FOODS.every((f) => typeof f.fi === 'number'));
});

section('Progress and coach');
t('progress numbers come from stored records', () => {
  const r = freshRepo(); const u = as(r, 'user'); const ws = W.listWorkouts(r, u); const tt = FIT.totals(ws); eq(tt.sessions, ws.length); ok(tt.sets > 20); const rep = FIT.weeklyReport({ profile: r.get(u, 'profile', u.id), plan: W.getPlanDoc(r, u)!.plan, sessions: ws, meals: N.listMeals(r, u), weights: r.list(u, 'weight', { ownerId: u.id }) }, NOW); ok(rep);
  eq(W.listWorkouts(r, newUser(r)).length, 0, 'new user has no invented history');
});
t('local coach answers the required questions from real data, flags pain, never invents history', async () => {
  const r = freshRepo(); const u = as(r, 'user'); const qs = ['What should I train today?', 'How am I progressing?', 'What should I eat after training?', 'I missed two workouts. How should I resume?', 'What can I do at home without equipment?', 'Why is my workout getting harder?', 'Can I replace push-up?'];
  for (const q of qs) { const m = await C.ask(r, u, q, null); ok(m.text.length > 30, q + ' -> too short'); eq(m.source, 'local'); ok(!/I can help with:/.test(m.text), 'generic fallback for: ' + q); }
  ok(/Push-up/.test((await C.ask(r, u, 'Can I replace push-up?', null)).text), 'recognises the named exercise');
  ok(/no equipment/i.test((await C.ask(r, u, 'What can I do at home without equipment?', null)).text));
  const pain = await C.ask(r, u, 'my knee hurts when I squat, should I push through?', null); ok(/pain/i.test(pain.text) && /do not train through pain|professional|stop/i.test(pain.text) && pain.flagged); ok(C.history(r, u).length >= 18);
  const n = newUser(r); const m = await C.ask(r, n, 'How am I progressing?', null); ok(!/\d+ workouts? (logged|completed)/.test(m.text) || /no workouts|not .* yet|nothing logged/i.test(m.text), 'does not invent history: ' + m.text);
});
t('LLM path is labelled ai; safety cases never reach the LLM; failures fall back to local', async () => {
  const r = freshRepo(); const u = as(r, 'user'); let calls = 0; const llm: C.LlmClient = { complete: async () => { calls++; return 'AI says: keep going.'; } };
  const m = await C.ask(r, u, 'What should I train today?', llm); eq(m.source, 'ai'); eq(calls, 1);
  const p = await C.ask(r, u, 'I feel dizzy and have chest pain when I train', llm); eq(p.source, 'local'); eq(calls, 1, 'LLM not called for safety'); ok(p.flagged);
  const bad: C.LlmClient = { complete: async () => { throw new Error('offline'); } }; const f = await C.ask(r, u, 'How am I progressing?', bad); eq(f.source, 'local'); ok(/could not be reached/.test(f.text));
});

section('Gym management');
t('gym creation by an owner: starts pending; customers cannot join until the admin approves', () => {
  const r = freshRepo(); const owner = r.createAccount(SYSTEM, { username: 'newgym', password: 'gympass1', role: 'gym', displayName: 'New Owner' }); let a = r.actorOf(owner);
  const res = G.createGym(r, a, { name: 'Flex Zone', address: 'Kothrud', phone: '9999999999' }); a = res.actor; eq(res.gym.status, 'pending'); eq(a.gymIds, [res.gym.id]); eq(G.listPackages(r, a, res.gym.id).length, 1);
  const code = G.createCode(r, a, res.gym.id, { kind: 'customer', label: 'Door' }); ok(/^FLEX-/.test(code.code)); throws(() => G.redeemCode(r, as(r, 'neha'), code.code), /not accepting/);
  A.approveGym(r, as(r, 'admin'), res.gym.id); eq(G.redeemCode(r, as(r, 'neha'), G.joinPayload(code.code)).member.status, 'pending', 'QR payload accepted');
  eq(G.myGyms(r, a).length, 1);
});
t('profile, branding, address/hours/contact, packages are editable and validated', () => {
  const r = freshRepo(); const a = as(r, 'gym'); const g = G.updateGymProfile(r, a, IDS.gymIron, { address: 'JM Road, Pune', phone: '+91 99999 11111', hours: 'Daily 5-23' }); eq(g.address, 'JM Road, Pune');
  const b = G.setBranding(r, a, IDS.gymIron, { color: '#22AAFF', mode: 'custom', welcome: 'Hello' }); eq(b.brand.color, '#22AAFF'); throws(() => G.setBranding(r, a, IDS.gymIron, { color: 'red' }), /Colour/); throws(() => G.setBranding(r, a, IDS.gymIron, { logo: 'http://x/y.png' }), /Logo/);
  G.setBranding(r, a, IDS.gymIron, { logo: 'data:image/png;base64,AAAA' }); const p = G.savePackage(r, a, IDS.gymIron, { name: 'Weekend', days: 30, price: 900 }); ok(G.listPackages(r, a, IDS.gymIron).some((x) => x.id === p.id)); throws(() => G.savePackage(r, a, IDS.gymIron, { name: 'Bad', days: 0, price: 5 }), /Duration/);
});
t('customer joins by code -> pending -> approve -> active with expiry, demo payment, referral converted with commission', () => {
  const r = freshRepo(); const neha = as(r, 'neha'); const { member, gym } = G.redeemCode(r, neha, IDS.codeIron.toLowerCase()); eq(gym.id, IDS.gymIron); eq(member.status, 'pending');
  throws(() => G.redeemCode(r, neha, IDS.codeIron), /already requested/); throws(() => G.redeemCode(r, neha, 'NOPE-1234'), /not valid/); throws(() => G.redeemCode(r, as(r, 'gym'), IDS.codeIron), /Only customer/);
  const asha = as(r, 'asha'); const act = G.approveMember(r, asha, member.id, 'pkg_i_m'); eq(act.status, 'active'); eq(Math.round((act.expiresAt! - act.startAt!) / DAY), 30);
  const tx = P.listTxns(r, asha, IDS.gymIron).find((x) => x.memberId === member.id)!; eq([tx.demo, tx.amount, tx.status, tx.commission!.amount], [true, 1500, 'succeeded', 150]);
  const ref = G.listReferrals(r, asha, IDS.gymIron).find((x: any) => x.memberId === member.id) as any; eq(ref.status, 'converted'); eq(ref.commission, 150); eq(r.list(neha, 'gym').map((g) => g.id), [IDS.gymIron]);
  throws(() => G.approveMember(r, asha, member.id, 'pkg_i_m'), /pending/); throws(() => G.approveMember(r, as(r, 'meera'), member.id, 'pkg_i_m'), /not visible|another gym|not allowed/);
});
t('manager can reject; wrong-gym package is refused; gym B cannot approve gym A requests', () => {
  const r = freshRepo(); const karan = 'mem_karan'; throws(() => G.approveMember(r, as(r, 'gym2'), karan, 'pkg_p_b'), /another gym/); throws(() => G.approveMember(r, as(r, 'gym'), karan, 'pkg_p_b'), /another gym/);
  eq(G.rejectMember(r, as(r, 'gym'), karan).status, 'rejected'); throws(() => G.rejectMember(r, as(r, 'gym'), karan), /pending/);
});
t('add walk-in customer, search and filter, statuses and expiry/renewal tracking', () => {
  const r = freshRepo(); const a = as(r, 'gym'); const res = G.addCustomer(r, a, IDS.gymIron, { name: 'Ravi Walk-in', packageId: 'pkg_i_m' }); eq(res.member.status, 'active'); eq(S.login(r, res.account.username, res.password).account.role, 'user');
  eq(G.listMembers(r, a, IDS.gymIron, { q: 'ravi' }).length, 1); eq(G.listMembers(r, a, IDS.gymIron).length, 4); eq(G.listMembers(r, a, IDS.gymIron, { status: 'pending' }).map((m) => m.name), ['Karan Mehta']);
  eq(G.listMembers(r, a, IDS.gymIron, { status: 'expiring' }).map((m) => m.name), ['Riya Deshmukh']); eq(G.expiryAlerts(r, a, IDS.gymIron).length, 1);
  clock.t = NOW + 10 * DAY; eq(G.listMembers(r, a, IDS.gymIron, { status: 'expired' }).map((m) => m.name).includes('Riya Deshmukh'), true, 'expiry computed from dates');
  const riya = G.listMembers(r, a, IDS.gymIron, { q: 'riya' })[0].member; const old = riya.expiresAt!; const renewed = G.renewMember(r, a, riya.id, 'pkg_i_m'); ok(renewed.expiresAt! > old + 29 * DAY); eq(G.listMembers(r, a, IDS.gymIron, { q: 'riya' })[0].status, 'active'); eq(P.listTxns(r, a, IDS.gymIron)[0].kind, 'renewal');
  eq(r.list(as(r, 'gym2'), 'gym_member').some((m) => m.ownerId === res.account.id), false);
});
t('assign programme; customer sees it, can start it; non-members cannot be assigned', () => {
  const r = freshRepo(); const a = as(r, 'asha'); G.assignProgramme(r, a, IDS.gymIron, IDS.accRiya, 'prg_i_beg', 'Welcome'); const mine = G.myAssignments(r, as(r, 'riya')); eq(mine.length, 1); eq(mine[0].programme!.name, 'Iron Works Beginner Strength');
  throws(() => G.assignProgramme(r, a, IDS.gymIron, IDS.accKaran, 'prg_i_beg'), /active members/); throws(() => G.assignProgramme(r, a, IDS.gymIron, IDS.accUser, 'prg_p_mob'), /another gym|not found/); eq(G.myAssignments(r, as(r, 'meera')).length, 0);
  const prg = G.saveProgramme(r, a, IDS.gymIron, { name: 'Custom', description: '', level: 'beginner', days: [{ title: 'A', exercises: [{ exId: 'pushup', sets: 3, reps: 8, rest: 60 }] }] }); ok(prg.id); throws(() => G.saveProgramme(r, a, IDS.gymIron, { name: 'Bad', description: '', level: 'beginner', days: [{ title: 'A', exercises: [{ exId: 'zzz', sets: 3, reps: 8, rest: 60 }] }] }), /Unknown exercise/);
});
t('announcements reach only members of that gym; challenges show progress from the customer\'s own workouts', () => {
  const r = freshRepo(); G.postAnnouncement(r, as(r, 'gym'), IDS.gymIron, 'Closed Sunday', 'Maintenance day'); const seen = G.listAnnouncements(r, as(r, 'user')) as any[]; ok(seen.some((x) => x.title === 'Closed Sunday')); eq(seen.every((x) => x.gymId === IDS.gymIron), true);
  eq((G.listAnnouncements(r, as(r, 'meera')) as any[]).some((x) => x.title === 'Closed Sunday'), false); eq(G.listAnnouncements(r, as(r, 'neha')).length, 0, 'non-member sees nothing'); throws(() => G.postAnnouncement(r, as(r, 'gym'), IDS.gymIron, '', 'x'), /Title/);
  const ch = (G.listChallenges(r, as(r, 'user')) as any[])[0]; const pr = G.challengeProgress(r, as(r, 'user'), ch); ok(pr.value >= 0 && pr.pct <= 100); eq(pr.target, 12);
});
t('customer-consented progress sharing: blocked by default, visible only after opt-in, withdrawn on leaving', () => {
  const r = freshRepo(); const asha = as(r, 'asha'); throws(() => G.memberProgress(r, asha, IDS.gymIron, IDS.accUser), /not chosen to share/); const sp = G.memberProgress(r, asha, IDS.gymIron, IDS.accRiya); ok(sp.totalWorkouts > 0); eq((sp as any).meals, undefined, 'only summary data');
  const u = as(r, 'user'); const mem = G.myMemberships(r, u)[0].member; G.setShareProgress(r, u, mem.id, true); ok(G.memberProgress(r, asha, IDS.gymIron, IDS.accUser).totalWorkouts > 0);
  throws(() => G.memberProgress(r, as(r, 'gym2'), IDS.gymPulse, IDS.accUser), /not a member/); throws(() => G.memberProgress(r, as(r, 'gym2'), IDS.gymIron, IDS.accUser), /another gym/);
  const keep = W.listWorkouts(r, u).length; G.leaveGym(r, u, mem.id); throws(() => G.memberProgress(r, asha, IDS.gymIron, IDS.accUser), /not a member/); eq(W.listWorkouts(r, u).length, keep, 'personal history retained after leaving'); eq(r.get(u, 'profile', u.id)!.name, 'Demo User');
  throws(() => G.setShareProgress(r, as(r, 'riya'), mem.id, true), /not your|not allowed|only the customer|not visible/);
});
t('staff management with basic permissions; owner protected; staff of gym B invisible to gym A', () => {
  const r = freshRepo(); const own = as(r, 'gym'); const s = G.addStaff(r, own, IDS.gymIron, { displayName: 'Tara', username: 'tara', password: 'staff123', staffRole: 'fitness' }); eq(s.extra.staffRole, 'fitness'); const ta = r.actorOf(r.verifyLogin('tara', 'staff123')!); throws(() => G.savePackage(r, ta, IDS.gymIron, { name: 'x', days: 5, price: 1 }), /missing permission/); G.saveProgramme(r, ta, IDS.gymIron, { name: 'Fit prog', description: '', level: 'beginner', days: [{ title: 'D', exercises: [{ exId: 'plank', sets: 2, secs: 30, rest: 30 }] }] });
  G.updateStaff(r, own, IDS.gymIron, s.id, { staffRole: 'manager' }); ok(r.actorOf(r.getAccount(SYSTEM, s.id)!).perms.includes('*')); throws(() => G.updateStaff(r, own, IDS.gymIron, IDS.accGym, { staffRole: 'fitness' }), /owner/); throws(() => G.removeStaff(r, own, IDS.gymIron, IDS.accGym), /owner/);
  eq(G.listStaff(r, own, IDS.gymIron).some((x) => x.id === IDS.accRohit), false); throws(() => G.listStaff(r, own, IDS.gymPulse), /other gym/); throws(() => G.addStaff(r, own, IDS.gymPulse, { displayName: 'X', username: 'xx1', password: 'staff123', staffRole: 'fitness' }), /other gym|cannot create/);
  G.removeStaff(r, own, IDS.gymIron, s.id); throws(() => S.login(r, 'tara', 'staff123'), /suspended/);
});
t('gym statistics are computed from records', () => {
  const r = freshRepo(); const st = G.gymStats(r, as(r, 'gym'), IDS.gymIron); eq(st.total, 3); eq(st.active, 2); eq(st.pending, 1); eq(st.expiring, 1); eq(st.revenue.gross, 5500); eq(st.referrals, { total: 3, converted: 2 }); eq(st.revenue.commission, 550); eq(st.registrationsByWeek.length, 6);
  const p = G.gymStats(r, as(r, 'gym2'), IDS.gymPulse); eq(p.total, 2); eq(p.revenue.gross, 2400); throws(() => G.gymStats(r, as(r, 'gym'), IDS.gymPulse), /another gym/);
});

section('Demo payments');
t('every transaction is DEMO; refund; commission rate is configurable by admin; invoice is labelled', () => {
  const r = freshRepo(); const a = as(r, 'gym'); const tx = P.listTxns(r, a, IDS.gymIron).find((x) => x.kind === 'membership')!; eq(tx.demo, true); ok(/DEMO/.test(tx.description) && /^DEMO-INV/.test(tx.invoiceNo));
  const rf = P.refund(r, a, tx.id); eq(rf.status, 'refunded'); throws(() => P.refund(r, a, tx.id), /Only successful/); eq(P.revenue(P.listTxns(r, a, IDS.gymIron)).refunded > 0, true);
  throws(() => A.setCommissionPct(r, a, 20), /Platform admin only/); A.setCommissionPct(r, as(r, 'admin'), 20); eq(P.calcCommission(1000, P.commissionPct(r)), 200); throws(() => A.setCommissionPct(r, as(r, 'admin'), 80), /between/);
  const inv = P.invoiceText(tx, 'Iron Works', 'Demo'); ok(/NO REAL MONEY/.test(inv) && /DEMO/.test(inv)); throws(() => P.refund(r, as(r, 'gym2'), tx.id), /another gym|not found/);
});
t('gym SaaS subscription plans (demo): admin configures, gym subscribes, txn recorded', () => {
  const r = freshRepo(); const ad = as(r, 'admin'); const plan = A.saveSubPlan(r, ad, { name: 'Micro', priceMonthly: 499, memberLimit: 50, features: ['Basics'] }); const g = as(r, 'gym2'); const tx = A.subscribeGym(r, g, IDS.gymPulse, plan.id); eq([tx.kind, tx.amount, tx.demo], ['saas_subscription', 499, true]); eq((G.getGym(r, g, IDS.gymPulse) as any).subscription.planId, plan.id);
  throws(() => A.saveSubPlan(r, g, { name: 'x', priceMonthly: 1, memberLimit: 1, features: [] }), /Platform admin only/); eq(P.revenue(P.listTxns(r, g, IDS.gymPulse)).gross, 2400, 'SaaS fees are not customer revenue');
});

section('Platform admin');
t('admin overview statistics are computed from stored records', () => { const r = freshRepo(); const s = A.platformStats(r, as(r, 'admin')); eq(s.gyms.total, 2); eq(s.users, 6); ok(s.workoutsLogged > 15); eq(s.referrals.converted, 3); ok(s.demoRevenue >= 7900); throws(() => A.platformStats(r, as(r, 'gym')), /Platform admin only/); ok(A.listUsers(r, as(r, 'admin')).length === 6); });
t('admin creates, suspends and reactivates gyms; suspended gym is blocked everywhere', () => {
  const r = freshRepo(); const ad = as(r, 'admin'); const { gym } = G.createGym(r, ad, { name: 'Admin Made Gym', ownerId: IDS.accGym2 }); eq(gym.status, 'active'); eq(r.actorOf(r.getAccount(SYSTEM, IDS.accGym2)!).gymIds.includes(gym.id), true);
  A.suspendGym(r, ad, IDS.gymIron); eq(G.getGym(r, ad, IDS.gymIron)!.status, 'suspended'); throws(() => G.postAnnouncement(r, as(r, 'gym'), IDS.gymIron, 'x', 'y'), /suspended/); throws(() => G.redeemCode(r, as(r, 'neha'), IDS.codeIron), /not accepting/); ok(G.listMembers(r, as(r, 'gym'), IDS.gymIron).length > 0, 'read-only while suspended');
  A.reactivateGym(r, ad, IDS.gymIron); G.postAnnouncement(r, as(r, 'gym'), IDS.gymIron, 'Back', 'open again'); ok(A.activity(r, ad).some((e: any) => e.action === 'gym.suspend') && A.activity(r, ad).some((e: any) => e.action === 'gym.reactivate'));
  throws(() => A.suspendGym(r, as(r, 'gym'), IDS.gymIron), /Platform admin only/);
});
t('admin manages accounts: create gym/user accounts, reset password, delete', () => {
  const r = freshRepo(); const ad = as(r, 'admin'); const acc = A.createAccount(r, ad, { username: 'demo.coach', password: 'coach123', role: 'gym', displayName: 'Demo Coach', extra: { gymIds: [IDS.gymPulse], staffRole: 'manager' } }); eq(S.login(r, 'demo.coach', 'coach123').actor.gymIds, [IDS.gymPulse]);
  A.resetPassword(r, ad, acc.id, 'newpass1'); S.login(r, 'demo.coach', 'newpass1'); throws(() => S.login(r, 'demo.coach', 'coach123'), /Incorrect/); A.deleteAccount(r, ad, acc.id); throws(() => S.login(r, 'demo.coach', 'newpass1'), /Incorrect/); throws(() => A.deleteAccount(r, ad, IDS.accAdmin), /currently|account you are using/);
});
t('admin edits the exercise library and it changes planning; categories; default programmes', () => {
  const r = freshRepo(); const ad = as(r, 'admin'); const first = (W.getPlanDoc(r, as(r, 'user'))!.plan.days[0].exercises[0].exId);
  A.editExercise(r, ad, 'plank', { safety: 'Edited safety note.' }); eq(EX.plank.safety, 'Edited safety note.'); A.editExercise(r, ad, 'plank', { off: true });
  const u = newUser(r); for (let seed = 1; seed < 20; seed++) { const p = FIT.generatePlan(r.get(u, 'profile', u.id), { seed, now: NOW }); ok(p.days.every((d: any) => d.exercises.every((e: any) => e.exId !== 'plank')), 'disabled exercise never planned'); }
  A.editExercise(r, ad, 'plank', { off: false });
  const cx = A.saveCustomExercise(r, ad, { name: 'Wall sit', pat: 'squat', steps: ['Slide down a wall', 'Hold'], cat: 'Strength' }); ok(EX[cx.id]); A.loadLibrary(r); ok(EX[cx.id], 'custom exercise survives reload'); A.deleteCustomExercise(r, ad, cx.id); eq(EX[cx.id], undefined);
  throws(() => A.saveCustomExercise(r, ad, { name: 'x', pat: 'nope', steps: ['a'] }), /pattern/); throws(() => A.editExercise(r, as(r, 'gym'), 'plank', { off: true }), /Platform admin only/);
  A.addCategory(r, ad, 'Yoga'); ok(A.categories(r, ad).includes('Yoga')); throws(() => A.addCategory(r, ad, 'yoga'), /exists/); A.removeCategory(r, ad, 'Yoga');
  const dp = A.saveDefaultProgramme(r, ad, { name: 'Quick core', description: 'x', level: 'beginner', days: [{ title: 'Core', exercises: [{ exId: 'plank', sets: 2, secs: 30, rest: 30 }] }] }); ok(A.listDefaultProgrammes(r, as(r, 'gym')).some((p) => p.id === dp.id), 'gyms can read defaults');
  const adopted = A.adoptDefaultProgramme(r, as(r, 'asha'), IDS.gymIron, dp.id); eq(adopted.gymId, IDS.gymIron); A.deleteDefaultProgramme(r, ad, dp.id); throws(() => A.deleteDefaultProgramme(r, as(r, 'gym'), dp.id), /Platform admin only/);
  A.setBranding(r, ad, { appName: 'Kinetic Pro', accent: '#00FFAA' }); eq(A.getBranding(r).appName, 'Kinetic Pro'); throws(() => A.setBranding(r, ad, { appName: 'x', accent: 'bad' }), /Accent/); A.setDefaults(r, ad, { daysPerWeek: 4, sessionMin: 45, goals: ['general'] }); throws(() => A.setDefaults(r, ad, { daysPerWeek: 9, sessionMin: 45, goals: [] }), /2-6/);
});
t('diagnostics report schema, integrity and record counts', () => { const r = freshRepo(); const d = A.diagnostics(r, as(r, 'admin'), { cameraModel: 'not loaded' }); eq(d.integrity, 'ok'); eq(d.schemaVersion, r.schemaVersion); ok(d.records > 100 && d.exercisesInLibrary >= 37 && d.foodsInDatabase >= 56); eq(d.cameraModel, 'not loaded'); });
t('export -> reset demo -> import restores everything; invalid and cross-role imports rejected', () => {
  const r = freshRepo(); const ad = as(r, 'admin'); G.postAnnouncement(r, as(r, 'gym'), IDS.gymIron, 'Marker', 'persist me'); const dump = JSON.parse(JSON.stringify(A.exportAll(r, ad))); const before = r.stats();
  A.resetDemo(r, ad); eq((G.listAnnouncements(r, as(r, 'gym')) as any[]).some((x) => x.title === 'Marker'), false, 'reset restores the original demo'); ok(r.verifyLogin('user', 'user123'));
  const res = A.importAll(r, as(r, 'admin'), dump); eq(res.docs, dump.docs.length); eq(r.stats().docs, before.docs); ok((G.listAnnouncements(r, as(r, 'gym')) as any[]).some((x) => x.title === 'Marker')); ok(r.verifyLogin('gym', 'gym123'));
  throws(() => A.importAll(r, ad, { app: 'other' }), /not a Kinetic Coach backup/); throws(() => A.importAll(r, ad, { ...dump, accounts: dump.accounts.filter((x: any) => x.role !== 'admin') }), /no admin/); throws(() => A.resetDemo(r, as(r, 'user')), /Platform admin only/); throws(() => A.importAll(r, as(r, 'gym'), dump), /only the platform admin/);
});
t('reset demo is repeatable and restores the two isolated gyms', () => { const r = freshRepo(); const ad = as(r, 'admin'); A.resetDemo(r, ad); A.resetDemo(r, as(r, 'admin')); eq(A.listGyms(r, as(r, 'admin')).length, 2); eq(G.listMembers(r, as(r, 'gym2'), IDS.gymPulse).length, 2); });

section('User data export/import and notifications');
t('a customer can export, delete everything, and re-import their own data; files cannot write into another account', () => {
  const r = freshRepo(); const u = as(r, 'user'); const file = JSON.parse(JSON.stringify(B.exportMine(r, u))); const w = W.listWorkouts(r, u).length; ok(file.data.workout.length === w && file.data.meal.length > 10); eq(file.data.gym_member, undefined, 'no gym-internal data exported');
  B.deleteMine(r, u); eq(W.listWorkouts(r, u).length, 0); eq(r.get(u, 'profile', u.id), undefined); const res = B.importMine(r, u, file); ok(res.imported > 20); eq(W.listWorkouts(r, u).length, w); eq(r.get(u, 'profile', u.id)!.name, 'Demo User');
  const riya = as(r, 'riya'); B.importMine(r, riya, file); eq(r.list(as(r, 'riya'), 'workout').every((x) => x.ownerId === riya.id), true); eq(W.listWorkouts(r, u).length, w, 'original untouched'); throws(() => B.importMine(r, u, { app: 'x' }), /not a Kinetic Coach personal export/);
});
t('reminders are generated from the plan, prefs and membership expiry; announcements flagged new once', async () => {
  const r = freshRepo(); const u = as(r, 'user'); const rem = Nt.buildReminders(r, u); eq(rem.filter((x) => x.kind === 'workout').length, W.getPlanDoc(r, u)!.plan.days.length); eq(rem.some((x) => x.kind === 'nutrition'), false); Nt.setPrefs(r, u, { nutrition: true }); ok(Nt.buildReminders(r, u).some((x) => x.kind === 'nutrition'));
  ok(rem.some((x) => x.kind === 'membership' && (x.trigger as any).at > NOW), 'expiry reminder 3 days before'); eq(Nt.buildReminders(r, as(r, 'gym')).length, 0);
  const na = Nt.newAnnouncements(r, u); ok(na.length >= 2); Nt.markAnnouncementsSeen(r, u); clock.t += 1000; eq(Nt.newAnnouncements(r, u).length, 0); G.postAnnouncement(r, as(r, 'gym'), IDS.gymIron, 'Fresh', 'news'); clock.t += 1000; eq(Nt.newAnnouncements(r, u).length, 1);
  const calls: string[] = []; const n: Nt.Notifier = { requestPermission: async () => true, cancelAll: async () => { calls.push('clear'); }, schedule: async (x) => { calls.push(x.id); }, show: async () => {} }; const res = await Nt.applyReminders(n, rem); eq(res.scheduled, rem.length); const deny = await Nt.applyReminders({ ...n, requestPermission: async () => false }, rem); eq(deny, { scheduled: 0, permission: false });
});
done();
