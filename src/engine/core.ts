// @ts-nocheck — ported from the tested web prototype (pure logic, no DOM). Typed facade: ./index.ts
import { FIT } from './fit';
import './data';
/* core.js — pure logic: planner + adaptation, nutrition, progress, coach, gym/trainer tenancy. No DOM, no storage. */
  const { EXERCISES, EX, FOODS, FOOD } = FIT;
  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
  const addDays = (ms, n) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); };
  const startOfDay = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const weekStart = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime(); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rng = (seed) => { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  let _uid = 0;
  const uid = (p) => (p || 'id') + '_' + Date.now().toString(36) + (++_uid).toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  Object.assign(FIT, { DAY, ymd, parseYmd, addDays, startOfDay, weekStart, clamp, uid, clone, DOW_NAMES, DOW_LONG });

  /* ---------- PLANNER ---------- */
  const LEVEL = { beginner: 1, intermediate: 2, advanced: 3 };
  const COMPOUND = ['squat', 'hinge', 'hpush', 'vpush', 'hpull', 'vpull', 'lunge'];
  const PAT_LABEL = { squat: 'squat pattern', hinge: 'hip hinge', hpush: 'horizontal push', vpush: 'overhead push', hpull: 'horizontal pull', vpull: 'vertical pull', lunge: 'single-leg work', arms: 'arm work', core: 'core stability', calf: 'calf work', cardio: 'conditioning', mobility: 'mobility' };

  const TEMPLATES = {
    fbA: { title: 'Full body A', slots: ['squat', 'hpush', 'hpull', 'hinge', 'core'] },
    fbB: { title: 'Full body B', slots: ['lunge', 'vpush', 'hpull', 'hinge', 'core'] },
    fbC: { title: 'Full body C', slots: ['squat', 'hpush', 'vpull|hpull', 'lunge', 'arms', 'core'] },
    upper: { title: 'Upper body', slots: ['hpush', 'hpull', 'vpush', 'vpull|hpull', 'arms'] },
    lower: { title: 'Lower body', slots: ['squat', 'hinge', 'lunge', 'calf', 'core'] },
    push: { title: 'Push', slots: ['hpush', 'vpush', 'arms', 'core'] },
    pull: { title: 'Pull', slots: ['hpull', 'vpull|hpull', 'arms', 'core'] },
    legs: { title: 'Legs', slots: ['squat', 'hinge', 'lunge', 'calf'] },
    cardio: { title: 'Cardio and core', slots: ['cardio', 'cardio', 'core'] },
    mobility: { title: 'Mobility and recovery', slots: ['mobility', 'mobility', 'mobility', 'core'] }
  };
  function weekTemplate(days, level) {
    if (days <= 1) return ['fbA'];
    if (days === 2) return ['fbA', 'fbB'];
    if (days === 3) return ['fbA', 'fbB', 'fbC'];
    if (days === 4) return level === 1 ? ['fbA', 'fbB', 'cardio', 'fbC'] : ['upper', 'lower', 'upper', 'lower'];
    if (days === 5) return level === 1 ? ['fbA', 'cardio', 'fbB', 'mobility', 'fbC'] : ['upper', 'lower', 'cardio', 'upper', 'lower'];
    return level === 3 ? ['push', 'pull', 'legs', 'push', 'pull', 'legs'] : ['upper', 'lower', 'cardio', 'upper', 'lower', 'mobility'];
  }

  function primaryGoal(p) {
    const g = (p.goals && p.goals[0]) || 'general';
    if (g === 'strength') return 'strength';
    if (g === 'muscle') return 'hypertrophy';
    if (['endurance', 'weight', 'athletic'].includes(g)) return 'conditioning';
    if (['flexibility', 'mobility'].includes(g)) return 'mobility';
    return 'general';
  }
  function safetyLevel(p) {
    const l = p.limits || {};
    if (l.painNow || l.medical) return 'restricted';
    if ((l.areas || []).length) return 'cautious';
    return 'normal';
  }
  function ownedSet(p, where) {
    const s = new Set(['none']);
    (p.equipment || []).forEach((e) => s.add(e));
    if (p.env === 'home') s.delete('gym');
    if (p.env === 'gym') s.add('gym');
    if (where === 'home') s.delete('gym');
    if (where === 'gym') s.add('gym');
    return s;
  }
  function hasEq(ex, owned) {
    if (owned.has('gym')) return true;
    if (ex.req && !ex.req.every((r) => owned.has(r))) return false;
    if (ex.eq && ex.eq.length && !ex.eq.some((e) => owned.has(e))) return false;
    return true;
  }
  function pickExercise(pat, ctx) {
    const c = EXERCISES.filter((e) => e.pat === pat && hasEq(e, ctx.owned) && !ctx.exclude.has(e.id) && !(e.avoid || []).some((a) => ctx.avoid.includes(a)) && e.diff <= ctx.maxDiff && !e.off);
    if (!c.length) return null;
    const target = clamp(ctx.target, 1, 3);
    const scored = c.map((e) => ({ e, s: Math.abs(e.diff - target) + (ctx.used.has(e.id) ? 2 : 0) + ctx.rand() * 0.9 }));
    scored.sort((a, b) => a.s - b.s);
    return scored[0].e;
  }

  function prescribe(ex, goal, level, safety, prog, now) {
    const base = ex.d;
    const timed = base.secs != null;
    let sets = base.sets, rest = 60, reps = base.reps, secs = base.secs, lo, hi;
    const bw = ex.eq.length === 0;
    const isCompound = COMPOUND.includes(ex.pat);
    if (ex.cat === 'Mobility' || ex.cat === 'Flexibility') { rest = 15; }
    else if (ex.cat === 'Cardio') { rest = 30; if (goal === 'conditioning' && ex.id !== 'treadmill' && ex.id !== 'brisk_walk') { sets = Math.max(sets, 3); } }
    else if (!timed) {
      if (goal === 'strength' && !bw && isCompound) { sets = level > 1 ? 4 : 3; reps = level > 1 ? 6 : 8; rest = 120; }
      else if (goal === 'hypertrophy' || (goal === 'strength' && bw)) { sets = 3; reps = isCompound ? 10 : 12; rest = 75; }
      else if (goal === 'conditioning') { sets = 3; reps = isCompound ? 12 : 15; rest = 40; }
      else if (goal === 'mobility') { sets = 2; reps = 10; rest = 45; }
      else { sets = level === 1 ? 2 : 3; reps = isCompound ? 10 : 12; rest = 60; }
      if (level === 1) rest += 15;
    } else if (ex.cat === 'Core') { sets = goal === 'strength' && level > 1 ? 3 : 2; }
    if (timed) { lo = secs; hi = secs + 30; } else { lo = Math.max(4, reps - 2); hi = reps + 2; }
    const o = (prog && prog.ex && prog.ex[ex.id]) || null;
    if (o) {
      if (o.sets) sets = o.sets;
      if (!timed && o.reps) reps = clamp(o.reps, lo, hi);
      if (timed && o.secs) secs = clamp(o.secs, lo, hi);
    }
    if (safety === 'cautious') { sets = Math.min(sets, 3); rest += 15; }
    if (prog && prog.deloadUntil > now) sets = Math.max(2, sets - 1);
    if (prog && prog.restartUntil > now) sets = Math.max(2, sets - 1);
    const it = { exId: ex.id, sets, rest, lo, hi };
    if (timed) it.secs = secs; else it.reps = reps;
    if (isCompound && !bw && goal === 'strength') it.note = 'Choose a load that leaves 1-2 reps in reserve.';
    else if (bw && goal === 'strength' && isCompound) it.note = 'Bodyweight only: lower for 3 seconds on each rep to make it harder.';
    return it;
  }
  function estMin(items, warm, cool) {
    let s = 0;
    items.forEach((it) => { const work = it.secs != null ? it.secs : it.reps * 4; s += it.sets * (work + it.rest) + 30; });
    return Math.round((s + (warm.length + cool.length) * 45) / 60);
  }
  const WARM = {
    upper: [['march', { secs: 60 }], ['arm_circles', { secs: 30 }], ['thoracic_rotation', { reps: 8 }], ['cat_cow', { reps: 8 }]],
    lower: [['march', { secs: 60 }], ['worlds_greatest', { reps: 5 }], ['glute_bridge', { reps: 10 }], ['cat_cow', { reps: 8 }]],
    full: [['march', { secs: 60 }], ['arm_circles', { secs: 30 }], ['worlds_greatest', { reps: 5 }], ['cat_cow', { reps: 8 }]]
  };
  const COOL = {
    upper: [['childs_pose', { secs: 40 }], ['thoracic_rotation', { reps: 8 }], ['hamstring_stretch', { secs: 30 }]],
    lower: [['hamstring_stretch', { secs: 30 }], ['hip_flexor', { secs: 30 }], ['childs_pose', { secs: 40 }]],
    full: [['hamstring_stretch', { secs: 30 }], ['hip_flexor', { secs: 30 }], ['childs_pose', { secs: 40 }]]
  };
  function blockFor(list, avoid) {
    return list.filter(([id]) => !(EX[id].avoid || []).some((a) => avoid.includes(a))).map(([id, d]) => Object.assign({ exId: id }, d));
  }
  const OBJECTIVE = {
    strength: 'Build strength with controlled, progressive effort.',
    hypertrophy: 'Build muscle with moderate reps and steady effort.',
    conditioning: 'Improve stamina and overall conditioning.',
    mobility: 'Improve movement quality and flexibility with light strength work.',
    general: 'Build a balanced base of strength and fitness.'
  };

  function generatePlan(p, opts) {
    opts = opts || {};
    const now = opts.now || Date.now();
    const prog = opts.prog || {};
    const seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9);
    const rand = rng(seed);
    const level = LEVEL[p.experience] || 1;
    const goal = primaryGoal(p);
    const safety = safetyLevel(p);
    const avoid = (p.limits && p.limits.areas) || [];
    const exclude = new Set(prog.exclude || []);
    const maxDiff = safety === 'cautious' ? Math.min(level, 2) : level;
    let days = clamp(Math.round(p.daysPerWeek || 3), 1, 6);
    const rest = new Set(p.restDays || []);
    const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => !rest.has(d));
    const notes = [];
    if (order.length < days) { notes.push('Your rest days leave only ' + order.length + ' possible training days, so the plan uses ' + order.length + '.'); days = Math.max(1, order.length); }
    if ((p.daysPerWeek || 0) >= 7) notes.push('Seven days a week is not recommended, so the plan keeps at least one full rest day.');
    if (level === 1 && days >= 5) notes.push('Beginners usually progress best with 3 to 4 harder days. The extra days are light.');
    const dows = [];
    for (let i = 0; i < days; i++) dows.push(order[Math.floor((i * order.length) / days)]);
    const target = clamp(p.sessionMin || 40, 15, 90);
    const planDays = [];
    const used = new Set();
    const restricted = safety === 'restricted';
    const keys = restricted ? ['mobility', 'cardio', 'mobility'].slice(0, Math.min(3, days)) : weekTemplate(days, level);
    const shortenBy = prog.shortenUntil > now ? 10 : 0;
    keys.forEach((key, i) => {
      const tpl = TEMPLATES[key];
      const where = p.env === 'both' && (p.equipment || []).includes('gym') ? (i % 2 === 0 ? 'gym' : 'home') : p.env;
      const owned = ownedSet(p, where);
      const ctx = { owned, avoid, exclude, maxDiff: restricted ? 1 : maxDiff, used, rand, target: 0 };
      let items = [];
      const whys = [];
      tpl.slots.forEach((slot) => {
        const pats = slot.split('|');
        let ex = null, usedPat = null;
        for (const pat of pats) {
          ctx.target = clamp(level + ((prog.offset && prog.offset[pat]) || 0), 1, 3);
          if (restricted && !['mobility', 'cardio', 'core'].includes(pat)) continue;
          ex = pickExercise(pat, ctx);
          if (restricted && ex && !['mobility', 'cardio'].includes(ex.pat) && ex.id !== 'dead_bug' && ex.id !== 'bird_dog') ex = null;
          if (ex) { usedPat = pat; break; }
        }
        if (!ex) return;
        used.add(ex.id);
        const it = prescribe(ex, goal, level, restricted ? 'cautious' : safety, prog, now);
        if (restricted) { it.sets = Math.min(it.sets, 2); }
        items.push(it);
        const why = ex.eq.length === 0 ? 'needs no equipment' : 'uses equipment you have';
        whys.push(ex.name + ': ' + PAT_LABEL[usedPat] + ', ' + why + ', difficulty ' + ex.diff + ' of 3' + (avoid.length ? ', and avoids the areas you flagged' : ''));
      });
      const kind = ['upper', 'push', 'pull'].includes(key) ? 'upper' : ['lower', 'legs'].includes(key) ? 'lower' : 'full';
      const warm = blockFor(WARM[kind], avoid), cool = blockFor(COOL[kind], avoid);
      // Fit to the preferred duration: trim from the end, then thin sets, then add a finisher if far under.
      const tgt = Math.max(15, target - shortenBy);
      let guard = 0;
      while (estMin(items, warm, cool) > tgt + 3 && guard++ < 20) {
        if (items.length > 3) { items.pop(); whys.pop(); }
        else { const it = items.find((x) => x.sets > 2); if (it) it.sets--; else break; }
      }
      guard = 0;
      while (!restricted && estMin(items, warm, cool) < tgt - 8 && items.length < 7 && guard++ < 2) {
        const pat = goal === 'conditioning' ? 'cardio' : guard === 1 ? 'core' : 'arms';
        ctx.target = level;
        const ex = pickExercise(pat, ctx);
        if (!ex) break;
        used.add(ex.id);
        items.push(prescribe(ex, goal, level, safety, prog, now));
        whys.push(ex.name + ': added to use your available session time');
      }
      planDays.push({ idx: i, dow: dows[i], key, title: tpl.title, objective: OBJECTIVE[goal] + (key === 'cardio' ? ' Keep the effort easy to moderate.' : ''), where, warmup: warm, exercises: items, cooldown: cool, estMin: estMin(items, warm, cool), why: whys });
    });
    const banner = restricted
      ? 'You reported pain, an injury or a medical restriction. This plan is gentle mobility and light movement only. Please check with a doctor or physiotherapist before starting loaded exercise.'
      : safety === 'cautious'
        ? 'You flagged ' + avoid.join(', ') + '. Exercises that load those areas are left out and volume is capped. A physiotherapist or doctor can give advice specific to you.'
        : '';
    return {
      id: uid('plan'), version: opts.version || 1, seed, createdAt: now, reason: opts.reason || 'Initial plan', changes: opts.changes || [],
      safety: { level: safety, banner }, goal, notes, days: planDays,
      summary: days + ' day' + (days > 1 ? 's' : '') + ' per week, about ' + target + ' minutes, ' + (p.env === 'both' ? 'home and gym' : p.env) + ', ' + (p.experience || 'beginner') + ' level.'
    };
  }

  /* ---------- SESSIONS + ADAPTATION ---------- */
  // session: { id, planId, date, plannedDate?, at, title, durationSec, source, fatigue?, dizzy?, exercises:[{exId, planned:{sets,reps|secs}, sets:[{reps,secs,weight,done}], rating, pain, completedAll}] }
  function exerciseCompleted(planned, sets) {
    if (!planned) return false;
    const done = (sets || []).filter((s) => s.done);
    if (done.length < planned.sets) return false;
    return done.every((s) => (planned.reps != null ? (s.reps || 0) >= planned.reps : (s.secs || 0) >= (planned.secs || 0)));
  }
  function plannedWindow(plan, fromMs, toMs) {
    const out = [];
    const created = startOfDay(plan.createdAt);
    for (let t = Math.max(startOfDay(fromMs), created); t <= toMs; t = addDays(t, 1)) {
      const day = plan.days.find((d) => d.dow === new Date(t).getDay());
      if (day) out.push({ date: ymd(t), day });
    }
    return out;
  }
  function missedInLast7(plan, sessions, now) {
    const from = addDays(startOfDay(now), -7);
    const planned = plannedWindow(plan, from, addDays(startOfDay(now), -1));
    const done = sessions.filter((s) => s.at >= from && s.at < startOfDay(now)).length;
    return { planned: planned.length, done, missed: Math.max(0, planned.length - done) };
  }
  function adapt(profile, plan, sessions, prog, now) {
    now = now || Date.now();
    const out = { changes: [], advisories: [], progressBlocked: false, prog: clone(prog || {}) };
    const P = out.prog;
    P.ex = P.ex || {}; P.offset = P.offset || {}; P.exclude = P.exclude || [];
    const ordered = sessions.slice().sort((a, b) => b.at - a.at);
    const rec14 = ordered.filter((s) => s.at >= now - 14 * DAY);
    // 1. pain / dizziness: never push through it.
    rec14.forEach((s) => {
      (s.exercises || []).forEach((e) => {
        if (e.pain && !P.exclude.includes(e.exId)) {
          P.exclude.push(e.exId);
          out.changes.push('Removed ' + (EX[e.exId] ? EX[e.exId].name : e.exId) + ' because you reported pain or discomfort.');
          out.progressBlocked = true;
        } else if (e.pain) out.progressBlocked = true;
      });
      if (s.dizzy) { out.progressBlocked = true; if (!out.advisories.some((a) => /dizz/i.test(a))) out.advisories.push('You reported dizziness. Stop exercising when that happens. If it returns, please speak to a doctor before continuing.'); }
    });
    if (out.changes.length) out.advisories.push('If pain is sharp, lasting or gets worse, please see a qualified clinician rather than training through it.');
    // 2. unusual fatigue: lighter week.
    const fatigued = ordered.some((s) => s.at >= now - 7 * DAY && s.fatigue);
    if (fatigued) {
      if (!(P.deloadUntil > now)) { P.deloadUntil = now + 7 * DAY; out.changes.push('Reduced volume by one set per exercise for a week because you reported unusual fatigue.'); }
      out.progressBlocked = true;
      out.advisories.push('Unusual tiredness is a good reason to rest or go lighter. If it lasts more than a week or two, consider talking to a doctor.');
    }
    // 3. missed sessions: never make up for them by doubling.
    const m = missedInLast7(plan, sessions, now);
    if (m.missed >= 2) {
      out.progressBlocked = true;
      out.advisories.push('You missed ' + m.missed + ' planned session' + (m.missed > 1 ? 's' : '') + ' this week. That happens to everyone. Pick the plan up at the next planned day without doubling up.');
      if (!(P.shortenUntil > now)) { P.shortenUntil = now + 7 * DAY; out.changes.push('Shortened sessions by about 10 minutes for a week so they are easier to fit in.'); }
    }
    if (m.missed >= 3 && !(P.restartUntil > now)) { P.restartUntil = now + 7 * DAY; out.changes.push('Dropped one set from each exercise this week for an easier restart.'); }
    // 4. exercise ratings and progression.
    const planItems = {};
    plan.days.forEach((d) => d.exercises.forEach((it) => { planItems[it.exId] = it; }));
    const completion14 = (() => { const pw = plannedWindow(plan, now - 14 * DAY, addDays(startOfDay(now), -1)).length; return pw ? Math.min(1, rec14.length / pw) : null; })();
    let progressed = 0;
    Object.keys(planItems).forEach((id) => {
      const it = planItems[id], ex = EX[id];
      if (!ex || ex.pat === 'mobility' || ex.pat === 'cardio') return;
      const hist = [];
      for (const s of ordered) { const e = (s.exercises || []).find((x) => x.exId === id); if (e) hist.push(e); if (hist.length === 2) break; }
      if (!hist.length) return;
      const st = P.ex[id] || {};
      const timed = it.secs != null;
      if (hist[0].rating === 'tooHard') {
        const cur = timed ? it.secs : it.reps;
        if (!timed && cur > it.lo) { st.reps = Math.max(it.lo, cur - 2); out.changes.push(ex.name + ': lowered to ' + st.reps + ' reps because you found it too hard.'); }
        else if (it.sets > 2) { st.sets = it.sets - 1; out.changes.push(ex.name + ': dropped to ' + st.sets + ' sets because you found it too hard.'); }
        else { P.offset[ex.pat] = clamp((P.offset[ex.pat] || 0) - 1, -2, 2); out.changes.push(ex.name + ': swapping toward an easier ' + PAT_LABEL[ex.pat] + ' exercise.'); }
        P.ex[id] = st;
        return;
      }
      const okSteady = hist.length >= 2 && hist.every((h) => h.completedAll && h.rating !== 'tooHard');
      const wantsMore = hist[0].rating === 'tooEasy' && hist[0].completedAll;
      const recently = nowSince(st.lastProgressAt, now) < 14 * DAY;
      if (!out.progressBlocked && (okSteady || wantsMore) && !recently && progressed < 2 && (completion14 == null || completion14 >= 0.7) && rec14.length >= 2) {
        const maxSets = goalIsStrength(profile) ? 5 : 4;
        if (!timed && it.reps < it.hi) { st.reps = Math.min(it.hi, it.reps + 2); out.changes.push(ex.name + ': progressing to ' + st.reps + ' reps.'); }
        else if (timed && it.secs < it.hi) { st.secs = Math.min(it.hi, it.secs + 10); out.changes.push(ex.name + ': progressing to a ' + st.secs + ' second hold.'); }
        else if (it.sets < maxSets) { st.sets = it.sets + 1; if (!timed) st.reps = it.lo; else st.secs = it.lo; out.changes.push(ex.name + ': adding a set (' + st.sets + ' sets).'); }
        else { P.offset[ex.pat] = clamp((P.offset[ex.pat] || 0) + 1, -2, 2); delete st.sets; delete st.reps; delete st.secs; out.changes.push(ex.name + ': ready for a harder ' + PAT_LABEL[ex.pat] + ' variation.'); }
        st.lastProgressAt = now; P.ex[id] = st; progressed++;
      }
    });
    if (!out.changes.length && !out.advisories.length) out.advisories.push('No changes needed right now. Keep going with the current plan.');
    return out;
  }
  const nowSince = (t, now) => (t ? now - t : Infinity);
  const goalIsStrength = (p) => (p.goals || []).includes('strength');

  /* ---------- NUTRITION ---------- */
  const ACT = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very: 1.9 };
  function bmr(p) {
    const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
    if (p.sex === 'male') return base + 5;
    if (p.sex === 'female') return base - 161;
    return base - 78; // midpoint when sex is not provided
  }
  function nutritionTargets(p) {
    if (!p || !p.weightKg || !p.heightCm || !p.age) return null;
    const b = Math.round(bmr(p));
    const maint = Math.round(b * (ACT[p.activity] || 1.375));
    const g = p.goals || [];
    let kcal = maint, note = 'Maintenance estimate.';
    if (p.age >= 18 && g.includes('weight')) { kcal = Math.round(maint * 0.9); note = 'About 10% below maintenance, a gentle and sustainable level.'; }
    else if (p.age >= 18 && g.includes('muscle')) { kcal = Math.round(maint * 1.05); note = 'A small surplus to support muscle gain.'; }
    kcal = Math.max(kcal, b);
    let protein = Math.round(p.weightKg * (g.includes('muscle') || g.includes('strength') ? 1.8 : 1.2));
    if (p.nutOverride) {
      if (p.nutOverride.kcal) { kcal = Math.max(Math.round(p.nutOverride.kcal), b); note = 'Your own target' + (p.nutOverride.kcal < b ? ' (raised to your estimated basal need; the app does not set targets below it)' : '') + '.'; }
      if (p.nutOverride.protein) protein = Math.round(p.nutOverride.protein);
    }
    const fat = Math.round((kcal * 0.27) / 9);
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    return { kcal, maint, bmr: b, protein, carbs, fat, note, approx: !p.sex, minor: p.age < 18 };
  }
  const r1 = (n) => Math.round(n * 10) / 10;
  function makeItem(foodId, qty) {
    const f = FOOD[foodId];
    qty = qty > 0 ? qty : 1;
    return { id: uid('it'), foodId, name: f.name, unit: f.unit, qty, kcal: Math.round(f.kcal * qty), p: r1(f.p * qty), c: r1(f.c * qty), f: r1(f.f * qty), fi: r1((f.fi || 0) * qty) };
  }
  function customItem(name, kcal, p, c, f, qty, fi) {
    qty = qty > 0 ? qty : 1;
    return { id: uid('it'), foodId: null, name, unit: 'serving', qty, kcal: Math.round(kcal * qty), p: r1((p || 0) * qty), c: r1((c || 0) * qty), f: r1((f || 0) * qty), fi: r1((fi || 0) * qty), base: { kcal, p: p || 0, c: c || 0, f: f || 0, fi: fi || 0 } };
  }
  function recalcItem(item, foodId, qty) {
    if (foodId && FOOD[foodId]) { const n = makeItem(foodId, qty); n.id = item.id; return n; }
    const b = item.base || { kcal: item.kcal / (item.qty || 1), p: item.p / (item.qty || 1), c: item.c / (item.qty || 1), f: item.f / (item.qty || 1), fi: (item.fi || 0) / (item.qty || 1) };
    const n = customItem(item.name, b.kcal, b.p, b.c, b.f, qty, b.fi); n.id = item.id; return n;
  }
  function searchFoods(q) {
    q = (q || '').toLowerCase().trim();
    if (!q) return FOODS.slice();
    const words = q.split(/\s+/);
    return FOODS.map((f) => { const hay = (f.name + ' ' + f.al).toLowerCase(); const hit = words.every((w) => hay.includes(w)); return hit ? { f, s: hay.startsWith(q) ? 0 : hay.indexOf(words[0]) } : null; }).filter(Boolean).sort((a, b) => a.s - b.s).map((x) => x.f);
  }
  const sumItems = (items) => items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, p: r1(a.p + i.p), c: r1(a.c + i.c), f: r1(a.f + i.f), fi: r1(a.fi + (i.fi || 0)) }), { kcal: 0, p: 0, c: 0, f: 0, fi: 0 });
  function dayTotals(meals, date) { return sumItems(meals.filter((m) => m.date === date).flatMap((m) => m.items)); }
  function weekNutrition(meals, endMs) {
    const out = [];
    for (let i = 6; i >= 0; i--) { const t = addDays(startOfDay(endMs), -i); const d = ymd(t); const tot = dayTotals(meals, d); out.push(Object.assign({ date: d, label: DOW_NAMES[new Date(t).getDay()], logged: meals.some((m) => m.date === d && m.items.length) }, tot)); }
    return out;
  }

  /* ---------- PROGRESS ---------- */
  function weeklyCounts(sessions, now, n) {
    n = n || 8;
    const out = [];
    const ws = weekStart(now);
    for (let i = n - 1; i >= 0; i--) {
      const a = addDays(ws, -7 * i), b = addDays(a, 7);
      const ss = sessions.filter((s) => s.at >= a && s.at < b);
      out.push({ start: a, label: pad(new Date(a).getDate()) + '/' + pad(new Date(a).getMonth() + 1), count: ss.length, minutes: Math.round(ss.reduce((x, s) => x + (s.durationSec || 0), 0) / 60) });
    }
    return out;
  }
  function totals(sessions) {
    let sets = 0, reps = 0;
    sessions.forEach((s) => (s.exercises || []).forEach((e) => (e.sets || []).forEach((st) => { if (st.done) { sets++; reps += st.reps || 0; } })));
    return { sessions: sessions.length, minutes: Math.round(sessions.reduce((x, s) => x + (s.durationSec || 0), 0) / 60), sets, reps };
  }
  function personalRecords(sessions) {
    const rec = {};
    sessions.slice().sort((a, b) => a.at - b.at).forEach((s) => (s.exercises || []).forEach((e) => (e.sets || []).forEach((st) => {
      if (!st.done) return;
      const r = (rec[e.exId] = rec[e.exId] || { exId: e.exId, maxWeight: 0, maxReps: 0, maxSecs: 0, bestVolume: 0 });
      if ((st.weight || 0) > r.maxWeight) { r.maxWeight = st.weight; r.weightDate = s.date; }
      if ((st.reps || 0) > r.maxReps) { r.maxReps = st.reps; r.repsDate = s.date; }
      if ((st.secs || 0) > r.maxSecs) { r.maxSecs = st.secs; r.secsDate = s.date; }
      const vol = (st.weight || 0) * (st.reps || 0);
      if (vol > r.bestVolume) { r.bestVolume = vol; r.volDate = s.date; }
    })));
    return Object.values(rec);
  }
  function exerciseSeries(sessions, exId) {
    return sessions.filter((s) => (s.exercises || []).some((e) => e.exId === exId)).sort((a, b) => a.at - b.at).map((s) => {
      const e = s.exercises.find((x) => x.exId === exId);
      const done = (e.sets || []).filter((x) => x.done);
      return { date: s.date, at: s.at, reps: done.reduce((a, x) => a + (x.reps || 0), 0), secs: done.reduce((a, x) => a + (x.secs || 0), 0), top: Math.max(0, ...done.map((x) => x.weight || 0)), sets: done.length };
    });
  }
  function weekStreak(sessions, now, target) {
    target = Math.max(1, target || 1);
    let streak = 0;
    const ws = weekStart(now);
    const cnt = (a) => sessions.filter((s) => s.at >= a && s.at < addDays(a, 7)).length;
    if (cnt(ws) >= target) streak++;
    for (let i = 1; i < 52; i++) { if (cnt(addDays(ws, -7 * i)) >= target) streak++; else break; }
    return streak;
  }
  function weeklyReport(state, now) {
    now = now || Date.now();
    const { profile, plan, sessions, meals, weights } = state;
    const a = now - 7 * DAY, b = now - 14 * DAY;
    const cur = sessions.filter((s) => s.at >= a), prev = sessions.filter((s) => s.at >= b && s.at < a);
    const target = (profile && profile.daysPerWeek) || (plan && plan.days.length) || 3;
    const rep = { hasData: sessions.length > 0, completed: [], improved: [], attention: [], adjustments: [], next: [], consistency: null, sessions: cur.length, target };
    if (!sessions.length) { rep.next.push('Complete your first workout so this report can use real data.'); return rep; }
    cur.forEach((s) => rep.completed.push(s.title + ' on ' + s.date));
    rep.consistency = Math.min(100, Math.round((cur.length / Math.max(1, Math.min(target, plan ? plan.days.length : target))) * 100));
    // improved: reps/weight vs previous week for the same exercise
    const best = (ss) => { const m = {}; ss.forEach((s) => (s.exercises || []).forEach((e) => (e.sets || []).forEach((x) => { if (!x.done) return; const o = (m[e.exId] = m[e.exId] || { reps: 0, w: 0, secs: 0 }); o.reps = Math.max(o.reps, x.reps || 0); o.w = Math.max(o.w, x.weight || 0); o.secs = Math.max(o.secs, x.secs || 0); }))); return m; };
    const bc = best(cur), bp = best(prev);
    Object.keys(bc).forEach((id) => {
      if (!bp[id] || !EX[id]) return;
      if (bc[id].w > bp[id].w) rep.improved.push(EX[id].name + ': heaviest set went from ' + bp[id].w + ' to ' + bc[id].w + ' kg.');
      else if (bc[id].reps > bp[id].reps) rep.improved.push(EX[id].name + ': best set went from ' + bp[id].reps + ' to ' + bc[id].reps + ' reps.');
      else if (bc[id].secs > bp[id].secs) rep.improved.push(EX[id].name + ': longest hold went from ' + bp[id].secs + ' to ' + bc[id].secs + ' seconds.');
    });
    if (cur.length > prev.length && prev.length) rep.improved.push('You trained ' + cur.length + ' times this week, up from ' + prev.length + '.');
    if (!rep.improved.length) rep.improved.push(prev.length ? 'No measurable gains in logged sets compared with last week. That is normal; progress is not linear.' : 'There is not a previous week to compare with yet.');
    if (cur.length < Math.min(target, plan ? plan.days.length : target)) rep.attention.push('You completed ' + cur.length + ' of ' + Math.min(target, plan ? plan.days.length : target) + ' planned sessions.');
    const hard = cur.flatMap((s) => (s.exercises || []).filter((e) => e.rating === 'tooHard').map((e) => EX[e.exId] && EX[e.exId].name)).filter(Boolean);
    if (hard.length) rep.attention.push('Marked too hard: ' + [...new Set(hard)].join(', ') + '.');
    if (cur.some((s) => s.fatigue)) rep.attention.push('You reported unusual tiredness. Prioritise sleep and an easier week.');
    if (cur.some((s) => (s.exercises || []).some((e) => e.pain))) rep.attention.push('You reported pain on an exercise. Those exercises are removed from your plan; see a clinician if it continues.');
    // nutrition (only when enough logged days)
    const wk = weekNutrition(meals || [], now).filter((d) => d.logged);
    const t = nutritionTargets(profile);
    if (wk.length >= 3) {
      const avg = Math.round(wk.reduce((x, d) => x + d.kcal, 0) / wk.length), avgP = Math.round(wk.reduce((x, d) => x + d.p, 0) / wk.length);
      rep.nutrition = { days: wk.length, avgKcal: avg, avgProtein: avgP };
      if (t && avgP < t.protein * 0.7) rep.adjustments.push('Protein averaged about ' + avgP + ' g on logged days, below your ' + t.protein + ' g estimate. Adding curd, eggs, dal, paneer or chicken to a meal can help.');
      if (t && avg < t.bmr * 0.9) rep.adjustments.push('Logged intake averaged below your estimated basal needs. Make sure you are eating enough to train well, and note that logging may be incomplete.');
    } else rep.nutrition = { days: wk.length, insufficient: true };
    if (rep.attention.length === 0) rep.adjustments.push('Keep the same plan next week.');
    if (cur.length >= target && !cur.some((s) => s.fatigue)) rep.adjustments.push('You are consistent. The planner will progress exercises that you completed fully twice.');
    if (cur.length < target) rep.next.push('Aim for ' + Math.max(1, Math.min(target, cur.length + 1)) + ' sessions next week. Choose the days that fit your schedule first.');
    else rep.next.push('Repeat your plan and rate each exercise so the next adjustment fits you.');
    const w = (weights || []).slice().sort((x, y) => x.at - y.at);
    if (w.length >= 2) rep.weightNote = 'Logged weight: ' + w[0].kg + ' kg on ' + w[0].date + ', ' + w[w.length - 1].kg + ' kg on ' + w[w.length - 1].date + '. Weight is only one signal of progress.';
    return rep;
  }

  /* ---------- COACH (local engine) ---------- */
  function findExercise(text) {
    const norm = text.toLowerCase().replace(/-/g, '').replace(/push up/g, 'pushup').replace(/pull up/g, 'pullup').replace(/sit up/g, 'situp');
    const toks = norm.split(/[^a-z0-9]+/).filter(Boolean);
    const has = (w) => toks.some((x) => x === w || x === w + 's');
    let best = null, bs = 0;
    EXERCISES.forEach((e) => {
      const words = e.name.toLowerCase().replace(/-/g, '').replace(/[^a-z ]/g, '').split(' ').filter((w) => w.length > 2);
      const hit = words.filter(has).length;
      const s = hit / Math.max(1, words.length) + (norm.includes(e.name.toLowerCase().replace(/-/g, '')) ? 1 : 0);
      if (hit && s > bs) { bs = s; best = e; }
    });
    return bs >= 0.5 ? best : null;
  }
  function alternativesFor(ex, p, plan) {
    const owned = ownedSet(p, p.env);
    const avoid = (p.limits && p.limits.areas) || [];
    const lvl = LEVEL[p.experience] || 1;
    return EXERCISES.filter((e) => e.pat === ex.pat && e.id !== ex.id && hasEq(e, owned) && !(e.avoid || []).some((a) => avoid.includes(a)) && e.diff <= lvl + 1).slice(0, 4);
  }
  function listEx(items) { return items.map((it) => (EX[it.exId] ? EX[it.exId].name : it.exId) + ' ' + it.sets + ' x ' + (it.secs != null ? it.secs + 's' : it.reps)).join('; '); }
  function coachLocal(q, ctx) {
    const { profile: p, plan, sessions = [], meals = [], now = Date.now() } = ctx;
    const t = q.toLowerCase();
    const name = p && p.name ? p.name.split(' ')[0] : '';
    if (/chest pain|faint|can.?t breathe|short of breath|numb|blacked out|passed out/.test(t)) return { safety: true, text: 'Please stop exercising. Chest pain, fainting, numbness or trouble breathing need medical attention. If it is happening now, call your local emergency number or get help nearby. I cannot assess this safely.' };
    if (/pain|hurt|injur|dizz|sharp|swollen|sprain|strain|pulled/.test(t)) return { safety: true, text: 'Please do not train through pain or dizziness. Stop the movement, rest, and see a qualified doctor or physiotherapist if the pain is sharp, lasts more than a couple of days, or the area is swollen. I cannot diagnose it. When you are cleared, tell me which area is affected in Profile and I will rebuild your plan around it.' };
    if (/tired|fatigue|exhaust|drained|no energy|sleep/.test(t)) {
      const recent = sessions.filter((s) => s.at >= now - 7 * DAY).length;
      return { text: 'Tiredness is useful information. ' + (recent ? 'You trained ' + recent + ' time' + (recent > 1 ? 's' : '') + ' in the last 7 days. ' : '') + 'If it is just an off day, a light walk or the mobility session is a good choice and you can skip the hard sets. If you feel unusually exhausted, dizzy or unwell, rest today. Log it as unusual fatigue after a workout and I will lighten your next week. If the tiredness lasts more than one to two weeks, please talk to a doctor.' };
    }
    const ex = findExercise(t);
    if (/replace|swap|alternative|substitut|instead|can.?t do/.test(t)) {
      if (!ex) return { text: 'Which exercise do you want to replace? Name it (for example "push-up") and I will suggest options that fit your equipment and limits.' };
      const alts = alternativesFor(ex, p || {}, plan);
      return { text: alts.length ? 'Instead of ' + ex.name + ', you could use: ' + alts.map((a) => a.name).join(', ') + '. Easier option: ' + (EX[ex.easier] ? EX[ex.easier].name : ex.easier) + '. Harder option: ' + (EX[ex.harder] ? EX[ex.harder].name : ex.harder) + '. You can swap it in the Workout tab.' : 'I do not have another ' + ex.name + ' replacement that fits your equipment and limits. An easier version to discuss with a professional is: ' + (EX[ex.easier] ? EX[ex.easier].name : ex.easier) + '.' };
    }
    if (ex && /how|form|perform|technique|do a|do the|steps/.test(t)) return { text: ex.name + '. Start: ' + ex.start + ' ' + ex.steps.map((s, i) => (i + 1) + ') ' + s).join(' ') + ' Breathing: ' + ex.breath + ' Common mistakes: ' + ex.mistakes.join('; ') + '. Safety: ' + ex.safety };
    if (/today|train now|what should i (do|train)|workout today/.test(t)) {
      if (!plan) return { text: 'You do not have a plan yet. Finish onboarding and I will build one.' };
      const day = plan.days.find((d) => d.dow === new Date(now).getDay());
      const done = sessions.find((s) => s.date === ymd(now));
      if (done) return { text: 'You already completed "' + done.title + '" today. Well done. Rest, eat well and hydrate. A gentle walk is fine if you want to move.' };
      if (!day) return { text: 'Today is a rest day in your plan. Rest is where adaptation happens. A relaxed walk or some stretching is a good option. Your next session is ' + nextSession(plan, now) + '.' };
      return { text: (name ? name + ', today' : 'Today') + ' is "' + day.title + '" (about ' + day.estMin + ' minutes). Warm up first, then: ' + listEx(day.exercises) + '. Keep every rep controlled and stop if anything hurts.' };
    }
    if (/without equipment|no equipment|bodyweight|body weight|at home|home workout|nothing at home/.test(t)) {
      const lvl = { beginner: 1, intermediate: 2, advanced: 3 }[(p && p.experience) || 'beginner'] || 1;
      const avoid = (p && p.limits && p.limits.areas) || [];
      const list = EXERCISES.filter((e) => e.eq.length === 0 && !e.off && e.diff <= lvl && !(e.avoid || []).some((a) => avoid.includes(a)) && e.cat !== 'Flexibility');
      const by = {}; list.forEach((e) => { (by[e.cat] = by[e.cat] || []).push(e.name); });
      return { text: 'You can train well at home with no equipment. Options that fit your level and limits: ' + Object.keys(by).map((k) => k + ': ' + by[k].slice(0, 4).join(', ')).join('. ') + '. Two or three strength moves plus a core move and a short walk or march-in-place makes a solid session. Make it harder by slowing each rep down.' };
    }
    if (/harder|tougher|more difficult|increas|progressive|overload|heavier/.test(t) && plan) {
      const ch = (plan.changes || []).slice(0, 4);
      return { text: 'Workouts get harder in small, rule-based steps: when you complete every set and rate a session "too easy" or "just right" over a couple of sessions, I add a rep, a set or a little load. If you rate sessions "too hard", flag pain or report tiredness, I do the opposite and ease off. ' + (ch.length ? 'Your current plan (version ' + plan.version + ') changed because: ' + ch.join(' ') : 'Your current plan (version ' + plan.version + ') has no recent automatic changes recorded, so any extra difficulty is the planned progression for your level.') + ' You can always ask me to make it easier.' };
    }
    if (/why|reason|rationale|explain this workout/.test(t) && plan) {
      const day = plan.days.find((d) => d.dow === new Date(now).getDay()) || plan.days[0];
      return { text: 'I built "' + day.title + '" from your profile: ' + plan.summary + ' ' + (day.why || []).join('. ') + '.' + (plan.safety.banner ? ' ' + plan.safety.banner : '') };
    }
    if (/progress|improv|week|report|how am i doing/.test(t)) {
      const r = weeklyReport({ profile: p, plan, sessions, meals, weights: ctx.weights }, now);
      if (!r.hasData) return { text: 'I do not have any completed workouts yet, so I cannot report progress. Finish one session and I will have real numbers to share.' };
      return { text: 'This week you completed ' + r.sessions + ' session' + (r.sessions === 1 ? '' : 's') + ' (target ' + r.target + '), consistency ' + r.consistency + '%. ' + r.improved.join(' ') + ' ' + (r.attention.length ? 'Needs attention: ' + r.attention.join(' ') + ' ' : '') + 'Next: ' + r.next.join(' ') };
    }
    if (/miss|skipp|behind|fell off|lapse/.test(t)) {
      const m = plan ? missedInLast7(plan, sessions, now) : null;
      return { text: (m && m.missed ? 'You have missed ' + m.missed + ' planned session' + (m.missed > 1 ? 's' : '') + ' in the last 7 days. ' : '') + 'Missing a few workouts does not undo your progress. Do not try to cram them in. Return to your next planned day, keep the first session a little easier, and aim to just show up. I will shorten sessions for a week if you have missed several.' };
    }
    if (/eat|food|meal|nutrition|protein|after (the )?(training|workout)|post.?workout|diet/.test(t)) {
      const tg = nutritionTargets(p);
      const today = dayTotals(meals, ymd(now));
      return { text: 'After training, aim for a mix of protein and carbohydrate. Options: eggs with roti, curd with fruit, dal with rice, paneer or chicken with sabzi, or milk with a banana.' + (tg ? ' Your rough daily estimate is ' + tg.kcal + ' kcal and about ' + tg.protein + ' g protein' + (tg.approx ? ' (approximate, since sex was not provided)' : '') + '.' : '') + (today.kcal ? ' You have logged ' + today.kcal + ' kcal and ' + Math.round(today.p) + ' g protein today.' : '') + ' Food is fuel, not a reward or punishment, and I will never add exercise to make up for eating.' };
    }
    if (/consisten|motivat|habit|discipline|stay on track/.test(t)) {
      const wk = weekStreak(sessions, now, Math.min(2, (plan && plan.days.length) || 2));
      return { text: 'Consistency comes from making the habit easy. Pick fixed days and a fixed time, lay out your clothes the night before, and promise yourself just 10 minutes on low-energy days. ' + (sessions.length ? 'You have logged ' + sessions.length + ' session' + (sessions.length > 1 ? 's' : '') + ' so far' + (wk > 1 ? ', with a ' + wk + ' week run' : '') + '. ' : '') + 'Track completed workouts, not the scale.' };
    }
    return { text: 'I can help with: what to train today, why your workout looks the way it does, your weekly progress, how to do an exercise, swapping exercises, missed workouts, tiredness, post-workout food and consistency. Ask me one of those and I will use your real plan and history.' };
  }
  function nextSession(plan, now) {
    for (let i = 1; i <= 7; i++) { const t = addDays(startOfDay(now), i); const d = plan.days.find((x) => x.dow === new Date(t).getDay()); if (d) return DOW_LONG[new Date(t).getDay()] + ' (' + d.title + ')'; }
    return 'not scheduled';
  }
  function coachContext(ctx) {
    const { profile: p, plan, sessions = [], meals = [], now = Date.now() } = ctx;
    const recent = sessions.filter((s) => s.at >= now - 21 * DAY).slice(0, 12).map((s) => ({ date: s.date, title: s.title, minutes: Math.round((s.durationSec || 0) / 60), fatigue: !!s.fatigue, exercises: (s.exercises || []).map((e) => ({ name: EX[e.exId] && EX[e.exId].name, sets: (e.sets || []).filter((x) => x.done).length, rating: e.rating || null, pain: !!e.pain })) }));
    const wk = weekNutrition(meals, now).filter((d) => d.logged).map((d) => ({ date: d.date, kcal: d.kcal, protein: Math.round(d.p) }));
    return {
      today: ymd(now), profile: p ? { name: p.name, age: p.age, experience: p.experience, goals: p.goals, env: p.env, equipment: p.equipment, daysPerWeek: p.daysPerWeek, sessionMin: p.sessionMin, limits: p.limits } : null,
      plan: plan ? { summary: plan.summary, safetyBanner: plan.safety.banner, week: plan.days.map((d) => ({ day: DOW_LONG[d.dow], title: d.title, exercises: d.exercises.map((it) => ({ name: EX[it.exId].name, sets: it.sets, reps: it.reps, secs: it.secs })) })) } : null,
      recentSessions: recent, nutritionLoggedDays: wk, nutritionTargets: nutritionTargets(p)
    };
  }
  const COACH_SYSTEM = 'You are the AI fitness coach inside a fitness app. Personality: encouraging, honest, supportive, scientifically responsible, practical, never humiliating. Use ONLY the JSON context for the user\'s plan, workouts and food; if something is missing, say you do not have it. Never invent history. Never diagnose. If the user mentions pain, dizziness, chest symptoms, injury or unusual fatigue, tell them to stop and seek a qualified professional. Never suggest exercise as punishment for eating, extreme calorie restriction, or training through pain. Keep answers under 150 words, plain text, no markdown headers.';
  function coachPrompt(question, ctx, history) {
    return COACH_SYSTEM + '\n\nCONTEXT (JSON):\n' + JSON.stringify(coachContext(ctx)) + '\n\nRecent chat:\n' + (history || []).slice(-6).map((m) => m.role + ': ' + m.text).join('\n') + '\n\nUser question: ' + question;
  }

  /* ---------- GYM + TRAINER (tenant logic; single device store, not a security boundary) ---------- */
  const emptyGymDb = () => ({ gyms: [], staff: [], codes: [], members: [], referrals: [], transactions: [], trainers: [], assignments: [], config: { commissionRate: 0.1, plans: { free: { label: 'Free', price: 0 }, premium: { label: 'Premium (customer)', price: 299, currency: 'INR' }, gymBranding: { label: 'Gym branding upgrade', price: 999, currency: 'INR' } } } });
  function authStaff(db, staffId, gymId) {
    const s = db.staff.find((x) => x.id === staffId);
    if (!s) throw new Error('forbidden: unknown staff account');
    if (gymId && s.gymId !== gymId) throw new Error('forbidden: that gym workspace belongs to another gym');
    return s;
  }
  function requireAdmin(db, staffId, gymId) { const s = authStaff(db, staffId, gymId); if (s.role !== 'admin') throw new Error('forbidden: admin only'); return s; }
  function createGym(db, o) {
    if (!o.name || !o.adminName) throw new Error('Gym name and administrator name are required');
    const gym = { id: uid('gym'), name: o.name.trim(), city: o.city || '', createdAt: Date.now(), branding: { mode: 'shared', color: o.color || '#2F4BFF', displayName: o.name.trim(), welcome: 'Welcome to ' + o.name.trim(), logo: null, content: '' }, sub: { plan: 'free', mode: 'TEST' } };
    const admin = { id: uid('stf'), gymId: gym.id, name: o.adminName.trim(), role: 'admin', joinedAt: Date.now() };
    db.gyms.push(gym); db.staff.push(admin);
    return { gym, admin };
  }
  const randCode = (n) => Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  function inviteStaff(db, staffId, gymId, o) { requireAdmin(db, staffId, gymId); const c = { id: uid('code'), gymId, kind: 'staff', code: 'STF-' + randCode(6), label: o.name || 'Staff invite', uses: 0, maxUses: 1, createdAt: Date.now(), staffName: o.name || '' }; db.codes.push(c); return c; }
  function createReferralCode(db, staffId, gymId, o) { const s = authStaff(db, staffId, gymId); const gym = db.gyms.find((g) => g.id === gymId); const c = { id: uid('code'), gymId, kind: 'customer', code: (gym.name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'GYM') + '-' + randCode(5), label: (o && o.label) || 'Customer invite', referrerStaffId: (o && o.referrerStaffId) || s.id, uses: 0, maxUses: null, createdAt: Date.now() }; db.codes.push(c); return c; }
  function redeemCode(db, codeStr, who) {
    const c = db.codes.find((x) => x.code.toUpperCase() === String(codeStr || '').trim().toUpperCase());
    if (!c) throw new Error('That code was not found');
    if (c.maxUses != null && c.uses >= c.maxUses) throw new Error('That code has already been used');
    const gym = db.gyms.find((g) => g.id === c.gymId);
    if (c.kind === 'staff') {
      const s = { id: uid('stf'), gymId: c.gymId, name: who.name || c.staffName || 'Staff', role: 'staff', joinedAt: Date.now() };
      db.staff.push(s); c.uses++; return { kind: 'staff', staff: s, gym };
    }
    if (db.members.some((m) => m.gymId === c.gymId && m.customerId === who.customerId)) throw new Error('You are already connected to this gym');
    const m = { id: uid('mem'), gymId: c.gymId, customerId: who.customerId, name: who.name || 'Customer', joinedAt: Date.now(), via: c.code, codeId: c.id, referrerStaffId: c.referrerStaffId || null, consent: { attendance: false, progress: false }, manual: false };
    db.members.push(m); c.uses++;
    db.referrals.push({ id: uid('ref'), gymId: c.gymId, codeId: c.id, memberId: m.id, referrerStaffId: c.referrerStaffId || null, status: 'joined', at: Date.now() });
    return { kind: 'customer', member: m, gym };
  }
  function addManualCustomer(db, staffId, gymId, o) { authStaff(db, staffId, gymId); if (!o.name) throw new Error('Customer name is required'); const m = { id: uid('mem'), gymId, customerId: null, name: o.name, phone: o.phone || '', joinedAt: Date.now(), via: 'entered by staff', codeId: null, referrerStaffId: null, consent: { attendance: false, progress: false }, manual: true }; db.members.push(m); return m; }
  function listCustomers(db, staffId, gymId) { authStaff(db, staffId, gymId); return db.members.filter((m) => m.gymId === gymId).map((m) => ({ id: m.id, name: m.name, joinedAt: m.joinedAt, via: m.via, manual: m.manual, consent: m.consent })); }
  function listStaff(db, staffId, gymId) { authStaff(db, staffId, gymId); return db.staff.filter((s) => s.gymId === gymId); }
  function listCodes(db, staffId, gymId) { authStaff(db, staffId, gymId); return db.codes.filter((c) => c.gymId === gymId); }
  function setBranding(db, staffId, gymId, patch) { requireAdmin(db, staffId, gymId); const g = db.gyms.find((x) => x.id === gymId); Object.assign(g.branding, patch); return g; }
  function recordTestTransaction(db, staffId, gymId, o) {
    authStaff(db, staffId, gymId);
    const m = db.members.find((x) => x.id === o.memberId && x.gymId === gymId);
    if (!m) throw new Error('forbidden: that customer is not in this gym');
    const plan = db.config.plans[o.planKey || 'premium'];
    const amount = o.amount != null ? o.amount : plan.price;
    const commission = m.referrerStaffId ? Math.round(amount * db.config.commissionRate * 100) / 100 : 0;
    const tx = { id: uid('tx'), gymId, memberId: m.id, planKey: o.planKey || 'premium', amount, currency: plan.currency || 'INR', commission, referrerStaffId: m.referrerStaffId, mode: 'TEST', note: 'Test transaction. No real payment was taken.', at: Date.now() };
    db.transactions.push(tx);
    const r = db.referrals.find((x) => x.memberId === m.id); if (r) r.status = 'converted';
    return tx;
  }
  function gymAnalytics(db, staffId, gymId) {
    requireAdmin(db, staffId, gymId);
    const members = db.members.filter((m) => m.gymId === gymId), refs = db.referrals.filter((r) => r.gymId === gymId), tx = db.transactions.filter((t) => t.gymId === gymId);
    return { customers: members.length, linkedApp: members.filter((m) => !m.manual).length, referred: refs.length, converted: refs.filter((r) => r.status === 'converted').length, testRevenue: tx.reduce((a, t) => a + t.amount, 0), testCommission: tx.reduce((a, t) => a + t.commission, 0), transactions: tx.length, staff: db.staff.filter((s) => s.gymId === gymId).length };
  }
  function customerSummaryForGym(member, data) {
    const out = { name: member.name, joinedAt: member.joinedAt };
    if (member.consent && member.consent.attendance) out.sessionsLast30 = data.sessions.filter((s) => s.at >= Date.now() - 30 * DAY).length;
    if (member.consent && member.consent.progress) out.totals = totals(data.sessions);
    return out;
  }
  function brandFor(db, customerId) {
    const m = db.members.find((x) => x.customerId === customerId);
    if (!m) return null;
    const g = db.gyms.find((x) => x.id === m.gymId);
    return { gymId: g.id, mode: g.branding.mode, name: g.name, branding: g.branding, member: m };
  }
  function addTrainer(db, o) { const t = { id: uid('trn'), name: o.name, quals: o.quals || '', years: o.years || 0, specs: o.specs || [], availability: o.availability || '', verified: false, verification: 'Not verified. A verification process has not been built yet.' }; db.trainers.push(t); return t; }
  function assignTrainer(db, customerId, trainerId, share) { if (!db.trainers.some((t) => t.id === trainerId)) throw new Error('Trainer not found'); db.assignments = db.assignments.filter((a) => !(a.customerId === customerId && a.trainerId === trainerId)); const a = { id: uid('asg'), customerId, trainerId, share: Object.assign({ plan: false, progress: false, nutrition: false }, share), at: Date.now() }; db.assignments.push(a); return a; }
  function trainerView(db, trainerId, customerId, data) {
    const a = db.assignments.find((x) => x.trainerId === trainerId && x.customerId === customerId);
    if (!a) throw new Error('forbidden: this customer has not assigned you');
    const out = {};
    if (a.share.plan) out.plan = data.plan ? data.plan.summary : null;
    if (a.share.progress) out.progress = totals(data.sessions);
    if (a.share.nutrition) out.nutrition = data.meals.length + ' meals logged';
    return out;
  }

  Object.assign(FIT, { generatePlan, adapt, exerciseCompleted, plannedWindow, missedInLast7, safetyLevel, primaryGoal, hasEq, ownedSet, PAT_LABEL, TEMPLATES,
    bmr, nutritionTargets, makeItem, customItem, recalcItem, searchFoods, sumItems, dayTotals, weekNutrition,
    weeklyCounts, totals, personalRecords, exerciseSeries, weekStreak, weeklyReport, coachLocal, coachContext, coachPrompt, findExercise, alternativesFor, nextSession,
    emptyGymDb, createGym, inviteStaff, createReferralCode, redeemCode, addManualCustomer, listCustomers, listStaff, listCodes, setBranding, recordTestTransaction, gymAnalytics, customerSummaryForGym, brandFor, addTrainer, assignTrainer, trainerView, authStaff });
