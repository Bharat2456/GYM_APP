import FIT, { EX, uid, ymd, DAY } from '../engine';
import type { Plan, PlanDay } from '../engine';
import { Repo, Actor, SYSTEM } from '../db/repo';

export interface PlanDoc { id: string; ownerId: string; plan: Plan; prog: any; revisions: { version: number; at: number; reason: string; changes: string[]; days: string[] }[] }

export const getProfile = (repo: Repo, a: Actor, userId = a.id) => repo.get(a, 'profile', userId);
export const getPlanDoc = (repo: Repo, a: Actor, userId = a.id) => repo.get(a, 'plan', userId) as unknown as PlanDoc | undefined;
export const listWorkouts = (repo: Repo, a: Actor, userId = a.id) => repo.list(a, 'workout', { ownerId: userId }).sort((x, y) => x.at - y.at);

/** (Re)generates the deterministic plan from the profile + adaptation memory. Same seed unless reshuffle=true. */
export function buildPlan(repo: Repo, a: Actor, o: { reason: string; changes?: string[]; reshuffle?: boolean; now?: number }): PlanDoc {
  const profile = getProfile(repo, a); if (!profile) throw new Error('Complete your profile first.');
  const cur = getPlanDoc(repo, a);
  const version = (cur ? cur.plan.version : 0) + 1;
  const plan = FIT.generatePlan(profile, { prog: cur?.prog || {}, version, reason: o.reason, changes: o.changes || [], seed: o.reshuffle || !cur ? undefined : cur.plan.seed, now: o.now ?? repo.now() }) as Plan;
  const revisions = (cur?.revisions || []).slice();
  if (cur) revisions.push({ version: cur.plan.version, at: cur.plan.createdAt, reason: cur.plan.reason, changes: cur.plan.changes || [], days: cur.plan.days.map((d) => d.title) });
  return repo.put(a, 'plan', { id: a.id, ownerId: a.id, plan, prog: cur?.prog || {}, revisions }) as unknown as PlanDoc;
}

/* ---------- loads ---------- */
const needsLoad = (exId: string) => !!EX[exId] && EX[exId].eq.length > 0 && !EX[exId].eq.every((q) => q === 'bands' || q === 'mat' || q === 'bar');
/** Suggested working weight: repeat the last completed weight, add 2.5 kg only after fully completed sessions that were not rated too hard. */
export function suggestWeight(sessions: any[], exId: string): { kg: number; why: string } | null {
  if (!needsLoad(exId)) return null;
  const hist = sessions.slice().sort((x, y) => y.at - x.at).map((s) => (s.exercises || []).find((e: any) => e.exId === exId)).filter(Boolean);
  const last = hist.find((e: any) => e.sets.some((s: any) => s.done && s.weight > 0));
  if (!last) return null;
  const w = Math.max(...last.sets.filter((s: any) => s.done).map((s: any) => s.weight || 0));
  if (last.pain) return { kg: Math.max(0, w - 2.5), why: 'Pain was flagged last time, so the load is reduced.' };
  if (last.completedAll && last.rating !== 'tooHard') return { kg: w + 2.5, why: 'You completed every set last time. Small increase of 2.5 kg.' };
  return { kg: w, why: 'Repeat last time\'s load until all sets are completed comfortably.' };
}

/* ---------- workout runner (pure state machine persisted as a draft) ---------- */
export interface RunSet { reps: number; secs: number; weight: number; done: boolean }
export interface RunEx { exId: string; planned: { sets: number; reps?: number; secs?: number; rest: number; note?: string }; sets: RunSet[]; skipped?: boolean; replacedFrom?: string; rating?: string; pain?: boolean; suggest?: { kg: number; why: string } | null }
export interface Run { id: string; ownerId: string; date: string; startedAt: number; title: string; objective?: string; source: 'plan' | 'programme' | 'camera' | 'custom'; programmeId?: string; planVersion?: number; warmup: any[]; cooldown: any[]; exercises: RunEx[]; pausedAt: number | null; pausedMs: number; analysis?: any }

function toRunEx(it: any, sessions: any[]): RunEx {
  const suggest = suggestWeight(sessions, it.exId);
  const reps = it.reps ?? 0, secs = it.secs ?? 0;
  return { exId: it.exId, planned: { sets: it.sets, reps: it.reps, secs: it.secs, rest: it.rest ?? 60, note: it.note }, sets: Array.from({ length: it.sets }, () => ({ reps, secs, weight: suggest?.kg || 0, done: false })), suggest };
}
export function startRun(repo: Repo, a: Actor, src: { kind: 'plan'; dow: number } | { kind: 'programme'; programmeId: string; dayIndex: number } | { kind: 'custom'; title: string; exIds: string[] }): Run {
  const sessions = listWorkouts(repo, a), now = repo.now();
  let day: any, source: Run['source'], programmeId: string | undefined;
  if (src.kind === 'plan') {
    const pd = getPlanDoc(repo, a); const d = pd?.plan.days.find((x) => x.dow === src.dow); if (!d) throw new Error('No workout planned for that day.');
    day = d; source = 'plan';
  } else if (src.kind === 'programme') {
    let p: any; try { p = repo.get(a, 'gym_programme', src.programmeId); } catch { p = undefined; } p = p || repo.get(a, 'programme_default', src.programmeId); if (!p) throw new Error('Programme not found or not assigned to you.');
    const d = p.days[src.dayIndex]; if (!d) throw new Error('Programme day not found.');
    day = { title: p.name + ' · ' + d.title, objective: p.description, warmup: [], cooldown: [], exercises: d.exercises.map((e: any) => ({ rest: 60, ...e })) }; source = 'programme'; programmeId = p.id;
  } else {
    day = { title: src.title, warmup: [], cooldown: [], exercises: src.exIds.map((exId) => { const d = (EX[exId]?.d as any) || { sets: 3, reps: 10 }; return { exId, sets: d.sets || 3, reps: d.reps, secs: d.secs, rest: 60 }; }) }; source = 'custom';
  }
  const run: Run = { id: uid('ses'), ownerId: a.id, date: ymd(now), startedAt: now, title: day.title, objective: day.objective, source, programmeId, planVersion: undefined, warmup: day.warmup || [], cooldown: day.cooldown || [], exercises: day.exercises.map((it: any) => toRunEx(it, sessions)), pausedAt: null, pausedMs: 0 };
  saveRun(repo, a, run); return run;
}
export const getRun = (repo: Repo, a: Actor): Run | undefined => repo.get(a, 'draft', a.id) as unknown as Run | undefined;
export const saveRun = (repo: Repo, a: Actor, r: Run) => { repo.put(a, 'draft', { ...(r as any), id: a.id, ownerId: a.id, runId: r.id }); };
export const discardRun = (repo: Repo, a: Actor) => { repo.del(a, 'draft', a.id); };
export function completeSet(r: Run, ei: number, si: number, v: Partial<RunSet> = {}): Run { const s = r.exercises[ei].sets[si]; Object.assign(s, v, { done: true }); r.exercises[ei].skipped = false; return r; }
export function undoSet(r: Run, ei: number, si: number): Run { r.exercises[ei].sets[si].done = false; return r; }
export function skipExercise(r: Run, ei: number): Run { r.exercises[ei].skipped = true; r.exercises[ei].sets.forEach((s) => (s.done = false)); return r; }
export function replaceExercise(r: Run, ei: number, newExId: string, sessions: any[] = []): Run {
  const old = r.exercises[ei]; if (!EX[newExId]) throw new Error('Unknown exercise');
  const dd = (EX[newExId].d as any) || { reps: 10 };
  r.exercises[ei] = { ...toRunEx({ exId: newExId, sets: old.planned.sets, reps: dd.reps, secs: dd.secs, rest: old.planned.rest }, sessions), replacedFrom: old.replacedFrom || old.exId };
  return r;
}
export const pauseRun = (r: Run, now: number): Run => { if (!r.pausedAt) r.pausedAt = now; return r; };
export const resumeRun = (r: Run, now: number): Run => { if (r.pausedAt) { r.pausedMs += now - r.pausedAt; r.pausedAt = null; } return r; };
export const runElapsedSec = (r: Run, now: number) => Math.max(0, Math.round((((r.pausedAt ?? now) - r.startedAt) - r.pausedMs) / 1000));

export interface FinishResult { session: any; prs: string[]; changes: string[]; advisories: string[] }
export function finishRun(repo: Repo, a: Actor, r: Run, o: { fatigue?: boolean; dizzy?: boolean; rating?: 'tooEasy' | 'ok' | 'tooHard' } = {}): FinishResult {
  const now = repo.now();
  const before = FIT.personalRecords(listWorkouts(repo, a));
  const session: any = {
    id: r.id, ownerId: a.id, planVersion: r.planVersion, date: r.date, at: now, title: r.title, durationSec: Math.min(runElapsedSec(r, now), 3 * 3600), source: r.source, programmeId: r.programmeId, fatigue: !!o.fatigue, dizzy: !!o.dizzy,
    exercises: r.exercises.filter((e) => e.sets.some((s) => s.done) || e.skipped || e.pain).map((e) => {
      const sets = e.sets.map((s) => ({ reps: +s.reps || 0, secs: +s.secs || 0, weight: +s.weight || 0, done: s.done }));
      return { exId: e.exId, planned: { sets: e.planned.sets, reps: e.planned.reps, secs: e.planned.secs }, sets, rating: e.rating || o.rating, pain: !!e.pain, skipped: !!e.skipped, replacedFrom: e.replacedFrom, completedAll: !e.skipped && FIT.exerciseCompleted(e.planned, sets) };
    })
  };
  if (r.analysis) session.analysis = r.analysis;
  repo.put(a, 'workout', session);
  discardRun(repo, a);
  const after = FIT.personalRecords(listWorkouts(repo, a)), prs: string[] = [];
  after.forEach((x: any) => { const b = before.find((y: any) => y.exId === x.exId); const nm = EX[x.exId]?.name || x.exId; if (!b) { if (x.maxWeight || x.maxReps || x.maxSecs) prs.push(nm + ': first logged ' + (x.maxWeight ? x.maxWeight + ' kg' : x.maxReps ? x.maxReps + ' reps' : x.maxSecs + ' s')); } else if (x.maxWeight > b.maxWeight) prs.push(nm + ': new best ' + x.maxWeight + ' kg'); else if (x.maxReps > b.maxReps) prs.push(nm + ': new best ' + x.maxReps + ' reps'); });
  // adaptation uses stored history only
  const pd = getPlanDoc(repo, a), profile = getProfile(repo, a);
  let changes: string[] = [], advisories: string[] = [];
  if (pd && profile) {
    const res = FIT.adapt(profile, pd.plan, listWorkouts(repo, a), pd.prog, now);
    changes = res.changes; advisories = res.advisories;
    repo.put(a, 'plan', { ...(pd as any), prog: res.prog });
    if (res.changes.length) buildPlan(repo, a, { reason: 'Adjusted after ' + r.title, changes: res.changes });
  }
  return { session, prs, changes, advisories };
}

/** Log a camera-analysed set as a standalone session (derived metrics only). */
export function saveCameraSession(repo: Repo, a: Actor, s: { key: string; exId: string; reps: number; cleanReps: number; durationSec: number; issues: Record<string, number>; notes: string[]; usablePct: number }) {
  return repo.put(a, 'camera_session', { id: uid('cam'), ownerId: a.id, at: repo.now(), date: ymd(repo.now()), ...s, estimate: true });
}
export const listCameraSessions = (repo: Repo, a: Actor) => repo.list(a, 'camera_session', { ownerId: a.id, newest: true });

/** Moves a planned workout to another weekday for the current plan (rescheduling). */
export function moveDay(repo: Repo, a: Actor, fromDow: number, toDow: number): PlanDoc {
  const pd = getPlanDoc(repo, a); if (!pd) throw new Error('No plan');
  if (pd.plan.days.some((d) => d.dow === toDow)) throw new Error('That day already has a workout.');
  const d = pd.plan.days.find((x) => x.dow === fromDow); if (!d) throw new Error('No workout on that day.');
  d.dow = toDow; pd.plan.days.sort((x, y) => ((x.dow! + 6) % 7) - ((y.dow! + 6) % 7));
  return repo.put(a, 'plan', pd as any) as unknown as PlanDoc;
}
export function swapExercise(repo: Repo, a: Actor, dow: number, index: number, newExId: string): PlanDoc {
  const pd = getPlanDoc(repo, a); const d = pd?.plan.days.find((x) => x.dow === dow); if (!pd || !d || !d.exercises[index]) throw new Error('Exercise not found');
  const profile = getProfile(repo, a)!; const alts = FIT.alternativesFor(EX[d.exercises[index].exId], profile, pd.plan).map((e: any) => e.id);
  if (!alts.includes(newExId)) throw new Error('That exercise does not fit your equipment and limits.');
  const old = d.exercises[index].exId; d.exercises[index] = { ...d.exercises[index], exId: newExId };
  pd.prog = { ...pd.prog, swaps: { ...(pd.prog.swaps || {}), [old]: newExId } };
  return repo.put(a, 'plan', pd as any) as unknown as PlanDoc;
}
export { SYSTEM };
