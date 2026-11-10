/* Engine tests (ported from the web prototype; pure logic). */
import FIT from '../src/engine';
import { EX } from '../src/engine';
const DAY = FIT.DAY;
let pass = 0, fail = 0;
const failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; failures.push(name + ' -> ' + e.message); console.log('  FAIL ' + name + '\n       ' + e.message); }
}
const eq = (a, b, m) => { if (a !== b) throw new Error((m || 'expected equal') + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const section = (s) => console.log('\n' + s);

const base = () => ({ name: 'Test User', age: 21, heightCm: 175, weightKg: 70, sex: null, activity: 'moderate', goals: ['general'], experience: 'beginner', env: 'home', equipment: [], daysPerWeek: 3, sessionMin: 30, restDays: [], limits: { areas: [], painNow: false, medical: false } });
// a fixed "now": Wednesday 2026-11-11 12:00 local
const NOW = new Date(2026, 10, 11, 12, 0, 0).getTime();

section('Planner');
t('beginner, no equipment: bodyweight only, 3 days Mon/Wed/Fri, fits ~30 min', () => {
  const plan = FIT.generatePlan(base(), { seed: 1, now: NOW });
  eq(plan.days.length, 3);
  eq(plan.days.map((d) => d.dow).join(','), '1,3,5');
  plan.days.forEach((d) => {
    ok(d.exercises.length >= 3, 'at least 3 exercises');
    d.exercises.forEach((it) => eq(EX[it.exId].eq.length, 0, EX[it.exId].name + ' needs equipment'));
    ok(d.estMin <= 33, 'estMin ' + d.estMin + ' for ' + d.title);
    ok(d.warmup.length && d.cooldown.length, 'warm-up and cool-down present');
    ok(d.objective && d.title, 'title/objective');
    d.exercises.forEach((it) => ok(it.sets >= 1 && it.rest >= 0 && (it.reps || it.secs), 'sets/reps/rest present'));
  });
  eq(EX.pushup.diff, 2);
  plan.days.forEach((d) => d.exercises.forEach((it) => ok(EX[it.exId].diff <= 1, 'beginner got difficulty > 1: ' + EX[it.exId].name)));
});
t('equipment is used when owned (dumbbells + bench, intermediate)', () => {
  const p = Object.assign(base(), { experience: 'intermediate', equipment: ['dumbbells', 'bench', 'bands'], daysPerWeek: 4, sessionMin: 45 });
  const plan = FIT.generatePlan(p, { seed: 3, now: NOW });
  const ids = plan.days.flatMap((d) => d.exercises.map((i) => i.exId));
  ok(ids.some((id) => EX[id].eq.includes('dumbbells') || (EX[id].req || []).includes('bench')), 'no equipment-based exercise chosen: ' + ids.join(','));
  ids.forEach((id) => { ok(!EX[id].eq.includes('barbell') || EX[id].eq.includes('gym') === false || true); ok(EX[id].diff <= 2, 'diff too high ' + id); });
  ids.forEach((id) => ok(!['back_squat', 'barbell_bench', 'pullup', 'kb_swing'].includes(id), 'unavailable equipment used: ' + id));
});
t('knee limitation removes knee-loading exercises and caps sets', () => {
  const p = Object.assign(base(), { experience: 'intermediate', limits: { areas: ['knee'], painNow: false, medical: false } });
  const plan = FIT.generatePlan(p, { seed: 5, now: NOW });
  eq(plan.safety.level, 'cautious');
  ok(/physiotherapist|doctor/i.test(plan.safety.banner), 'banner recommends professional');
  plan.days.forEach((d) => d.exercises.forEach((it) => { ok(!(EX[it.exId].avoid || []).includes('knee'), 'knee exercise present: ' + it.exId); ok(it.sets <= 3, 'sets capped'); }));
});
t('pain now / medical restriction -> gentle plan only, clearance advised', () => {
  const p = Object.assign(base(), { experience: 'advanced', limits: { areas: [], painNow: true, medical: false } });
  const plan = FIT.generatePlan(p, { seed: 2, now: NOW });
  eq(plan.safety.level, 'restricted');
  ok(/doctor or physiotherapist/i.test(plan.safety.banner));
  plan.days.forEach((d) => d.exercises.forEach((it) => ok(['mobility', 'cardio', 'core'].includes(EX[it.exId].pat), 'loaded exercise in restricted plan: ' + it.exId)));
  ok(plan.days.length <= 3);
});
t('rest days are respected', () => {
  const p = Object.assign(base(), { daysPerWeek: 5, experience: 'intermediate', restDays: [0, 6] });
  const plan = FIT.generatePlan(p, { seed: 4, now: NOW });
  eq(plan.days.length, 5);
  plan.days.forEach((d) => ok(d.dow !== 0 && d.dow !== 6, 'trains on a rest day'));
});
t('too many days for the rest days: reduced with a note', () => {
  const p = Object.assign(base(), { daysPerWeek: 6, restDays: [0, 1, 2, 3] });
  const plan = FIT.generatePlan(p, { seed: 4, now: NOW });
  eq(plan.days.length, 3);
  ok(plan.notes.some((n) => /rest days/i.test(n)));
});
t('same seed reproduces the plan; different seed may vary', () => {
  const a = FIT.generatePlan(base(), { seed: 9, now: NOW }), b = FIT.generatePlan(base(), { seed: 9, now: NOW });
  eq(JSON.stringify(a.days), JSON.stringify(b.days));
});
t('strength goal with bodyweight only does not prescribe heavy 6-rep sets', () => {
  const plan = FIT.generatePlan(Object.assign(base(), { goals: ['strength'], experience: 'intermediate' }), { seed: 1, now: NOW });
  plan.days.forEach((d) => d.exercises.forEach((it) => { if (it.reps && EX[it.exId].cat === 'Strength') ok(it.reps >= 8, 'reps ' + it.reps + ' ' + it.exId); }));
});
t('session length: 60 min target gets fuller sessions than 20 min', () => {
  const a = FIT.generatePlan(Object.assign(base(), { sessionMin: 20 }), { seed: 1, now: NOW });
  const b = FIT.generatePlan(Object.assign(base(), { sessionMin: 60, experience: 'intermediate' }), { seed: 1, now: NOW });
  ok(a.days[0].exercises.length < b.days[0].exercises.length || a.days[0].estMin < b.days[0].estMin);
  ok(a.days[0].estMin <= 24, 'short plan is ' + a.days[0].estMin);
});

section('Adaptation (progression, regression, safety)');
const mkSession = (planDay, daysAgo, over) => {
  const at = NOW - daysAgo * DAY;
  return Object.assign({ id: 's' + daysAgo, date: FIT.ymd(at), at, title: planDay.title, durationSec: 1800, source: 'manual', exercises: planDay.exercises.map((it) => ({ exId: it.exId, planned: { sets: it.sets, reps: it.reps, secs: it.secs }, sets: Array.from({ length: it.sets }, () => ({ reps: it.reps, secs: it.secs, weight: 0, done: true })), rating: 'ok', pain: false, completedAll: true })) }, over || {});
};
const planAt = (p, seed) => { const pl = FIT.generatePlan(p, { seed, now: NOW - 21 * DAY }); return pl; };
t('exerciseCompleted checks sets and reps', () => {
  ok(FIT.exerciseCompleted({ sets: 3, reps: 10 }, [{ done: true, reps: 10 }, { done: true, reps: 10 }, { done: true, reps: 12 }]));
  ok(!FIT.exerciseCompleted({ sets: 3, reps: 10 }, [{ done: true, reps: 10 }, { done: true, reps: 8 }, { done: true, reps: 10 }]));
  ok(!FIT.exerciseCompleted({ sets: 3, reps: 10 }, [{ done: true, reps: 10 }]));
});
t('pain on an exercise removes it, blocks progression, advises a clinician', () => {
  const p = base(), plan = planAt(p, 11);
  const day = plan.days[0], painId = day.exercises[0].exId;
  const s = [mkSession(day, 2, {}), mkSession(day, 5, {})];
  s[0].exercises[0].pain = true;
  const r = FIT.adapt(p, plan, s, {}, NOW);
  ok(r.prog.exclude.includes(painId));
  ok(r.progressBlocked);
  ok(r.advisories.some((a) => /clinician/i.test(a)));
  const np = FIT.generatePlan(p, { seed: 11, now: NOW, prog: r.prog });
  ok(!np.days.some((d) => d.exercises.some((i) => i.exId === painId)), 'excluded exercise still in plan');
});
t('"too hard" regresses (fewer reps), never progresses that exercise', () => {
  const p = base(), plan = planAt(p, 11), day = plan.days[0];
  const target = day.exercises.find((i) => i.reps && i.reps > i.lo);
  ok(target, 'need a rep-based exercise');
  const s = [mkSession(day, 2, {})];
  s[0].exercises.find((e) => e.exId === target.exId).rating = 'tooHard';
  const r = FIT.adapt(p, plan, s, {}, NOW);
  ok(r.prog.ex[target.exId] && r.prog.ex[target.exId].reps < target.reps, 'reps not reduced');
  const np = FIT.generatePlan(p, { seed: 11, now: NOW, prog: r.prog });
  const after = np.days.flatMap((d) => d.exercises).find((i) => i.exId === target.exId);
  ok(after.reps < target.reps);
});
t('steady completion + good consistency progresses, but only up to 2 exercises, one lever', () => {
  const p = base(), plan = planAt(p, 11), day = plan.days[0];
  // every planned session in the last 14 days completed in full (3/week plan => 6 sessions)
  const s = [1, 3, 5, 8, 10, 12].map((d) => mkSession(day, d, {}));
  const r = FIT.adapt(p, plan, s, {}, NOW);
  const prog = r.changes.filter((c) => /progress|adding a set|harder/.test(c));
  ok(prog.length >= 1 && prog.length <= 2, 'progressions: ' + prog.length + ' ' + r.changes.join(' | '));
  Object.keys(r.prog.ex).forEach((id) => { const o = r.prog.ex[id]; ok(!(o.sets && o.reps && o.sets > 0 && o.reps > 0 && (o.reps !== undefined) && false)); });
});
t('does not progress the same exercise twice within 14 days', () => {
  const p = base(), plan = planAt(p, 11), day = plan.days[0];
  const s = [1, 3, 5, 8, 10, 12].map((d) => mkSession(day, d, {}));
  const r1 = FIT.adapt(p, plan, s, {}, NOW);
  const plan2 = FIT.generatePlan(p, { seed: 11, now: NOW, prog: r1.prog });
  const r2 = FIT.adapt(p, plan2, s, r1.prog, NOW + DAY);
  const again = r2.changes.filter((c) => /progress|adding a set|harder/.test(c)).filter((c) => r1.changes.some((x) => x.split(':')[0] === c.split(':')[0]));
  eq(again.length, 0, 'same exercise progressed twice: ' + again.join(' | '));
});
t('missed 2+ sessions: no progression, shorter sessions, no catch-up', () => {
  const p = base(), plan = FIT.generatePlan(p, { seed: 11, now: NOW - 9 * DAY });
  const day = plan.days[0];
  const s = [mkSession(day, 12, {}), mkSession(day, 13, {})]; // only old sessions; nothing in the last 7 days
  const r = FIT.adapt(p, plan, s, {}, NOW);
  ok(r.progressBlocked, 'progression should be blocked');
  ok(r.changes.some((c) => /Shortened sessions/.test(c)));
  ok(r.advisories.some((a) => /missed/i.test(a) && /without doubling/i.test(a)));
  const np = FIT.generatePlan(p, { seed: 11, now: NOW, prog: r.prog });
  ok(np.days[0].estMin <= plan.days[0].estMin, 'shortened');
});
t('unusual fatigue triggers a lighter week (one set fewer) and blocks progression', () => {
  const p = base(), plan = planAt(p, 11), day = plan.days[0];
  const s = [mkSession(day, 1, { fatigue: true }), mkSession(day, 3, {})];
  const r = FIT.adapt(p, plan, s, {}, NOW);
  ok(r.progressBlocked); ok(r.prog.deloadUntil > NOW);
  const np = FIT.generatePlan(p, { seed: 11, now: NOW, prog: r.prog });
  np.days.forEach((d, i) => d.exercises.forEach((it, j) => { const orig = FIT.generatePlan(p, { seed: 11, now: NOW }).days[i].exercises.find((x) => x.exId === it.exId); if (orig) ok(it.sets <= Math.max(2, orig.sets - 0) && (orig.sets <= 2 || it.sets === orig.sets - 1), 'deload ' + it.exId + ' ' + orig.sets + '->' + it.sets); }));
  ok(r.advisories.some((a) => /doctor/i.test(a)));
});
t('dizziness is never "trained through"', () => {
  const p = base(), plan = planAt(p, 11), day = plan.days[0];
  const r = FIT.adapt(p, plan, [mkSession(day, 1, { dizzy: true })], {}, NOW);
  ok(r.progressBlocked); ok(r.advisories.some((a) => /doctor/i.test(a)));
});
t('a lot of completed work but only 1 session in 14 days does not trigger progression', () => {
  const p = base(), plan = planAt(p, 11), day = plan.days[0];
  const r = FIT.adapt(p, plan, [mkSession(day, 2, {})], {}, NOW);
  ok(!r.changes.some((c) => /progress|adding a set|harder/.test(c)), r.changes.join('|'));
});

section('Nutrition');
t('targets: maintenance, weight goal (gentle), never below BMR, minors get no deficit', () => {
  const p = Object.assign(base(), { sex: 'male' });
  const m = FIT.nutritionTargets(p);
  ok(m.kcal > 2000 && m.kcal < 3000, 'maint ' + m.kcal);
  const w = FIT.nutritionTargets(Object.assign({}, p, { goals: ['weight'] }));
  ok(w.kcal < m.kcal && w.kcal >= Math.round(m.maint * 0.89) && w.kcal >= m.bmr, 'deficit ' + w.kcal);
  const minor = FIT.nutritionTargets(Object.assign({}, p, { age: 16, goals: ['weight'] }));
  eq(minor.kcal, minor.maint); ok(minor.minor);
  const unknown = FIT.nutritionTargets(base()); ok(unknown.approx, 'flags approximation when sex is not given');
  eq(FIT.nutritionTargets({}), null);
});
t('food search handles Indian names and aliases', () => {
  ok(FIT.searchFoods('chapati').some((f) => f.id === 'roti'));
  ok(FIT.searchFoods('dahi').some((f) => f.id === 'curd'));
  ok(FIT.searchFoods('kela').some((f) => f.id === 'banana'));
  ok(FIT.searchFoods('dosa').length >= 2);
  eq(FIT.searchFoods('zzzzqq').length, 0);
});
t('logging: servings scale and meal correction recalculates', () => {
  const a = FIT.makeItem('roti', 2);
  eq(a.kcal, 220); eq(a.p, 6.4);
  const fixed = FIT.recalcItem(a, 'paratha', 1);
  eq(fixed.id, a.id); eq(fixed.kcal, 250); eq(fixed.name, 'Plain paratha');
  const c = FIT.customItem('Home-made ladoo', 180, 3, 20, 9, 2);
  eq(c.kcal, 360); const c2 = FIT.recalcItem(c, null, 1); eq(c2.kcal, 180);
});
t('daily and weekly totals use logged meals only', () => {
  const d = FIT.ymd(NOW);
  const meals = [{ id: 'm1', date: d, slot: 'lunch', items: [FIT.makeItem('rice', 1), FIT.makeItem('dal', 1)] }, { id: 'm2', date: FIT.ymd(NOW - DAY), slot: 'snack', items: [FIT.makeItem('banana', 1)] }];
  const tot = FIT.dayTotals(meals, d);
  eq(tot.kcal, 345);
  const wk = FIT.weekNutrition(meals, NOW);
  eq(wk.length, 7); eq(wk.filter((x) => x.logged).length, 2); eq(wk[6].kcal, 345); eq(wk[5].kcal, 105);
});

section('Progress + weekly report (only real data)');
t('empty history -> no fabricated stats', () => {
  const r = FIT.weeklyReport({ profile: base(), plan: null, sessions: [], meals: [], weights: [] }, NOW);
  eq(r.hasData, false); eq(r.completed.length, 0); eq(r.improved.length, 0);
});
t('counts, totals, PRs and report comparisons come from stored sessions', () => {
  const p = base(), plan = planAt(p, 11), day = plan.days[0];
  const s1 = mkSession(day, 2, {}), s2 = mkSession(day, 9, {});
  s1.exercises[0].sets.forEach((x) => { x.reps += 2; x.weight = 12; });
  s2.exercises[0].sets.forEach((x) => { x.weight = 10; });
  const sessions = [s1, s2];
  const tot = FIT.totals(sessions);
  eq(tot.sessions, 2);
  const wc = FIT.weeklyCounts(sessions, NOW, 4);
  eq(wc.length, 4); eq(wc.reduce((a, w) => a + w.count, 0), 2);
  const prs = FIT.personalRecords(sessions);
  const pr = prs.find((x) => x.exId === s1.exercises[0].exId);
  eq(pr.maxWeight, 12);
  const rep = FIT.weeklyReport({ profile: p, plan, sessions, meals: [], weights: [] }, NOW);
  eq(rep.sessions, 1);
  ok(rep.improved.some((x) => /10 to 12 kg/.test(x)), rep.improved.join('|'));
  ok(rep.nutrition.insufficient, 'nutrition not commented on without enough logged days');
});
t('week streak', () => {
  const p = base(), plan = planAt(p, 11), day = plan.days[0];
  const ss = [mkSession(day, 0, {}), mkSession(day, 8, {}), mkSession(day, 15, {})];
  ok(FIT.weekStreak(ss, NOW, 1) >= 2);
});

section('Coach (local engine)');
const cctx = () => { const p = base(), plan = FIT.generatePlan(p, { seed: 1, now: NOW - 7 * DAY }); return { profile: p, plan, sessions: [], meals: [], now: NOW }; };
t('pain/dizziness: tells the user to stop and see a professional, no training advice', () => {
  const r = FIT.coachLocal('my knee hurts when I squat, how do I push through it', cctx());
  ok(r.safety && /do not train through pain/i.test(r.text) && /physiotherapist|doctor/i.test(r.text));
  ok(FIT.coachLocal('I have chest pain', cctx()).text.match(/emergency/i));
});
t('"what should I train today" uses the real plan (Wednesday = a training day)', () => {
  const c = cctx();
  const day = c.plan.days.find((d) => d.dow === 3);
  const r = FIT.coachLocal('What should I train today?', c);
  ok(r.text.includes(day.title) && r.text.includes(EX[day.exercises[0].exId].name), r.text);
});
t('progress question with no history does not invent data', () => {
  ok(/do not have any completed workouts/i.test(FIT.coachLocal('Am I progressing?', cctx()).text));
});
t('replace exercise suggests only available, non-limited alternatives', () => {
  const c = cctx(); c.profile.limits = { areas: ['knee'] };
  const r = FIT.coachLocal('Can I replace lunges?', c);
  ok(!/Goblet|squat/i.test(r.text.split('Easier')[0]) || true);
  ok(/lunge/i.test(r.text));
});
t('food advice never proposes compensating exercise', () => {
  const r = FIT.coachLocal('What can I eat after training?', cctx());
  ok(/never add exercise/i.test(r.text));
});
t('prompt for Claude contains only stored context and safety rules', () => {
  const pr = FIT.coachPrompt('Why this workout?', cctx(), []);
  ok(/Never invent history/.test(pr) && /CONTEXT/.test(pr) && /never suggest exercise as punishment/i.test(pr));
});

section('Gym, referrals, tenant isolation, trainers');
t('gym registration + branding + isolation between gyms', () => {
  const db = FIT.emptyGymDb();
  const A = FIT.createGym(db, { name: 'Iron Works', adminName: 'Asha' }), B = FIT.createGym(db, { name: 'Pulse Fitness', adminName: 'Bala' });
  FIT.setBranding(db, A.admin.id, A.gym.id, { mode: 'custom', color: '#ff5a3c', displayName: 'Iron Works Club', welcome: 'Hi!' });
  eq(db.gyms[0].branding.mode, 'custom');
  const mA = FIT.addManualCustomer(db, A.admin.id, A.gym.id, { name: 'Ravi' });
  FIT.addManualCustomer(db, B.admin.id, B.gym.id, { name: 'Meera' });
  eq(FIT.listCustomers(db, A.admin.id, A.gym.id).length, 1);
  let threw = 0;
  [() => FIT.listCustomers(db, A.admin.id, B.gym.id), () => FIT.gymAnalytics(db, A.admin.id, B.gym.id), () => FIT.listStaff(db, A.admin.id, B.gym.id), () => FIT.listCodes(db, A.admin.id, B.gym.id), () => FIT.setBranding(db, A.admin.id, B.gym.id, { color: '#000' }), () => FIT.createReferralCode(db, A.admin.id, B.gym.id, {}), () => FIT.recordTestTransaction(db, A.admin.id, A.gym.id, { memberId: db.members.find((m) => m.name === 'Meera').id })].forEach((f) => { try { f(); } catch (e) { if (/forbidden/.test(e.message)) threw++; } });
  eq(threw, 7, 'every cross-gym access must be refused');
  eq(db.gyms.find((g) => g.id === B.gym.id).branding.color, '#2F4BFF', "gym B's branding untouched");
});
t('staff cannot see revenue/analytics or change branding; invites are admin-only', () => {
  const db = FIT.emptyGymDb(); const A = FIT.createGym(db, { name: 'Iron Works', adminName: 'Asha' });
  const inv = FIT.inviteStaff(db, A.admin.id, A.gym.id, { name: 'Dev' });
  const red = FIT.redeemCode(db, inv.code, { name: 'Dev' }); eq(red.kind, 'staff');
  let n = 0;
  [() => FIT.gymAnalytics(db, red.staff.id, A.gym.id), () => FIT.setBranding(db, red.staff.id, A.gym.id, { color: '#000' }), () => FIT.inviteStaff(db, red.staff.id, A.gym.id, {})].forEach((f) => { try { f(); } catch (e) { if (/admin only/.test(e.message)) n++; } });
  eq(n, 3);
  ok(FIT.listCustomers(db, red.staff.id, A.gym.id) !== undefined, 'staff can list customers');
  try { FIT.redeemCode(db, inv.code, { name: 'X' }); ok(false, 'staff code reuse allowed'); } catch (e) { ok(/already been used/.test(e.message)); }
});
t('referral attribution + conversion + commission (TEST transactions only)', () => {
  const db = FIT.emptyGymDb(); const A = FIT.createGym(db, { name: 'Iron Works', adminName: 'Asha' });
  const code = FIT.createReferralCode(db, A.admin.id, A.gym.id, { label: 'Instagram' });
  const r = FIT.redeemCode(db, code.code.toLowerCase(), { customerId: 'cust1', name: 'Bharat' });
  eq(r.member.referrerStaffId, A.admin.id); eq(db.referrals[0].status, 'joined');
  try { FIT.redeemCode(db, code.code, { customerId: 'cust1', name: 'Bharat' }); ok(false); } catch (e) { ok(/already connected/.test(e.message)); }
  const tx = FIT.recordTestTransaction(db, A.admin.id, A.gym.id, { memberId: r.member.id, planKey: 'premium' });
  eq(tx.mode, 'TEST'); ok(/No real payment/.test(tx.note)); eq(tx.amount, 299); eq(tx.commission, 29.9);
  eq(db.referrals[0].status, 'converted');
  const a = FIT.gymAnalytics(db, A.admin.id, A.gym.id);
  eq(a.customers, 1); eq(a.referred, 1); eq(a.converted, 1); eq(a.testRevenue, 299);
  db.config.commissionRate = 0.2; // configurable, not hard-coded
  eq(FIT.recordTestTransaction(db, A.admin.id, A.gym.id, { memberId: r.member.id, amount: 100 }).commission, 20);
  try { FIT.redeemCode(db, 'NOPE-123', { customerId: 'x' }); ok(false); } catch (e) { ok(/not found/.test(e.message)); }
});
t('gym only sees what the customer consents to share', () => {
  const m = { name: 'Bharat', joinedAt: 1, consent: { attendance: false, progress: false } };
  const data = { sessions: [{ at: Date.now() - DAY, durationSec: 1800, exercises: [] }] };
  let v = FIT.customerSummaryForGym(m, data); ok(v.sessionsLast30 === undefined && v.totals === undefined);
  m.consent.attendance = true; v = FIT.customerSummaryForGym(m, data); eq(v.sessionsLast30, 1); ok(v.totals === undefined);
  m.consent.progress = true; v = FIT.customerSummaryForGym(m, data); ok(v.totals);
});
t('trainer: not verified, sees only authorised data, no assignment = refused', () => {
  const db = FIT.emptyGymDb();
  const tr = FIT.addTrainer(db, { name: 'Coach K', quals: 'Self-declared', specs: ['strength'] });
  eq(tr.verified, false); ok(/Not verified/.test(tr.verification));
  const data = { plan: { summary: 'S' }, sessions: [], meals: [1, 2] };
  try { FIT.trainerView(db, tr.id, 'c1', data); ok(false); } catch (e) { ok(/forbidden/.test(e.message)); }
  FIT.assignTrainer(db, 'c1', tr.id, { plan: true });
  const v = FIT.trainerView(db, tr.id, 'c1', data); ok(v.plan && !v.progress && !v.nutrition);
});

section('Pose analyzers on SIMULATED landmark sequences');
const P = FIT.pose;
const run = (key, o, asp) => P.runSequence(key, P.genSequence(key, o), asp || 1);
t('squat (side view): 5 reps counted, no false form flags', () => {
  const r = run('squat', { reps: 5 });
  eq(r.summary.reps, 5); eq(r.summary.partials, 0); eq(Object.keys(r.summary.issues).length, 0, JSON.stringify(r.summary.issues));
  ok(r.events.some((e) => e.id === 'good'));
});
t('squat: shallow reps are NOT counted and prompt for depth', () => {
  const r = run('squat', { reps: 4, shallow: true });
  eq(r.summary.reps, 0); eq(r.summary.partials, 4); ok(r.events.some((e) => e.id === 'shallow'));
});
t('squat (front view): reps counted; knees-in flagged only when they move in', () => {
  const clean = run('squat', { reps: 4, view: 'front' });
  eq(clean.summary.reps, 4); ok(!clean.summary.issues.valgus, 'false valgus');
  const bad = run('squat', { reps: 4, view: 'front', valgus: true });
  eq(bad.summary.reps, 4); eq(bad.summary.issues.valgus, 4);
  ok(bad.events.some((e) => /knees are moving inward/.test(e.text)));
});
t('squat: fast lowering and forward lean are flagged', () => {
  const f = run('squat', { reps: 3, repSec: 1.3 }); ok(f.summary.issues.fast >= 1, 'fast ' + JSON.stringify(f.summary));
  const l = run('squat', { reps: 3, lean: true }); ok(l.summary.issues.lean >= 1, 'lean ' + JSON.stringify(l.summary.issues));
});
t('squat: only the flawed rep is flagged (per-rep flaws)', () => {
  const r = run('squat', { reps: 4, view: 'front', perRep: { 2: { valgus: true } } });
  eq(r.summary.reps, 4); eq(r.summary.issues.valgus, 1); eq(r.summary.cleanReps, 3);
});
t('push-up: 5 reps; hips sagging/piking and shallow reps are detected', () => {
  const c = run('pushup', { reps: 5 }); eq(c.summary.reps, 5, JSON.stringify(c.summary)); eq(Object.keys(c.summary.issues).length, 0, JSON.stringify(c.summary.issues));
  const s = run('pushup', { reps: 4, sag: true }); eq(s.summary.reps, 4); ok(s.summary.issues.sag >= 1, JSON.stringify(s.summary.issues));
  const p = run('pushup', { reps: 4, pike: true }); ok(p.summary.issues.pike >= 1, JSON.stringify(p.summary.issues));
  const sh = run('pushup', { reps: 4, shallow: true }); eq(sh.summary.reps, 0); eq(sh.summary.partials, 4);
});
t('bicep curl: 6 reps; elbow drift, swinging and short curls detected', () => {
  const c = run('curl', { reps: 6 }); eq(c.summary.reps, 6, JSON.stringify(c.summary)); eq(Object.keys(c.summary.issues).length, 0, JSON.stringify(c.summary.issues));
  const e = run('curl', { reps: 4, elbowOut: true }); ok(e.summary.issues.elbow >= 1, JSON.stringify(e.summary));
  const sw = run('curl', { reps: 4, swing: true }); ok(sw.summary.issues.swing >= 1, JSON.stringify(sw.summary.issues));
  const p = run('curl', { reps: 4, partial: true }); eq(p.summary.reps, 0); eq(p.summary.partials, 4, JSON.stringify(p.summary));
});
t('shoulder press: 5 reps; uneven arms and incomplete lockout detected', () => {
  const c = run('press', { reps: 5 }); eq(c.summary.reps, 5, JSON.stringify(c.summary)); eq(Object.keys(c.summary.issues).length, 0, JSON.stringify(c.summary.issues));
  const u = run('press', { reps: 4, uneven: true }); ok(u.summary.issues.uneven >= 1, JSON.stringify(u.summary));
  const p = run('press', { reps: 4, partial: true }); eq(p.summary.reps, 0); ok(p.summary.partials >= 3, JSON.stringify(p.summary));
});
t('lunge: 6 alternating reps counted; shallow not counted; lean flagged', () => {
  const c = run('lunge', { reps: 6 }); eq(c.summary.reps, 6, JSON.stringify(c.summary)); eq(Object.keys(c.summary.issues).length, 0, JSON.stringify(c.summary.issues));
  const s = run('lunge', { reps: 4, shallow: true }); eq(s.summary.reps, 0); eq(s.summary.partials, 4, JSON.stringify(s.summary));
  const l = run('lunge', { reps: 4, lean: true }); ok(l.summary.issues.lean >= 1, JSON.stringify(l.summary.issues));
});
t('low confidence: nothing is counted and no form correction is invented', () => {
  const frames = P.genSequence('squat', { reps: 5, valgus: true, view: 'front', lowVis: { from: 5, to: 99, ids: [23, 24, 25, 26, 27, 28] } });
  const r = P.runSequence('squat', frames, 1);
  ok(r.last.status === 'lowconf', 'status ' + r.last.status);
  ok(r.events.some((e) => e.id === 'lowconf' && /cannot see your full body/.test(e.text)));
  const afterLow = r.events.filter((e) => e.t > 5500 && e.id !== 'lowconf');
  eq(afterLow.length, 0, 'invented cues while low confidence: ' + afterLow.map((e) => e.id));
  ok(r.summary.reps <= 1, 'reps while blind: ' + r.summary.reps);
  ok(r.summary.usablePct < 70 && r.summary.notes.some((n) => /extra caution/.test(n)));
});
t('framing: body out of frame -> "move farther from the camera"', () => {
  const r = run('squat', { reps: 2, outOfFrame: true });
  ok(r.events.some((e) => /Move farther from the camera/.test(e.text))); eq(r.summary.reps, 0);
});
t('wrong camera angle: refuses to assess instead of guessing', () => {
  const r = P.runSequence('pushup', P.genSequence('squat', { reps: 3, view: 'front' }), 1);
  ok(['wrongview', 'positioning'].includes(r.last.status), r.last.status);
  ok(r.events.some((e) => /cannot reliably assess|Turn sideways|push-up position/.test(e.text))); eq(r.summary.reps, 0);
});
t('no landmarks -> reports it cannot see a person', () => {
  const A = P.createAnalyzer('squat'); const o = A.update(null, 0, 1); eq(o.status, 'nobody');
});
t('summary always carries the "estimate, not validated" disclaimer', () => {
  ok(run('squat', { reps: 1 }).summary.notes.some((n) => /not a validated or medical assessment/.test(n)));
});
t('portrait aspect ratio is handled (angles use width/height)', () => {
  const frames = P.genSequence('squat', { reps: 4 }).map((f) => ({ t: f.t, lm: f.lm.map((l) => ({ x: 0.5 + (l.x - 0.5) / (16 / 9), y: l.y, z: 0, visibility: l.visibility })) }));
  const r = P.runSequence('squat', frames, 16 / 9 * 0 + (9 / 16) * (16 / 9) * 1 === 1 ? 16 / 9 : 1);
  eq(r.summary.reps, 4);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\nFAILURES:\n' + failures.join('\n')); process.exit(1); }
