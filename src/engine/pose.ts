// @ts-nocheck — ported from the tested web prototype (pure logic, no DOM). Typed facade: ./index.ts
import { FIT } from './fit';
/* pose.js — exercise analyzers that consume MediaPipe-style landmarks (33 points, normalized x/y, visibility),
   plus a kinematic skeleton generator used ONLY for tests and the labelled Simulation Lab. */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rng = (seed) => { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  const LS = 11, RS = 12, LE = 13, RE = 14, LW = 15, RW = 16, LH = 23, RH = 24, LK = 25, RK = 26, LA = 27, RA = 28;
  const POSE_CONNECTIONS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32]];

  const vis = (l) => (l ? (l.visibility != null ? l.visibility : 1) : 0);
  const d2 = (a, b, asp) => Math.hypot((a.x - b.x) * asp, a.y - b.y);
  function angleAt(a, b, c, asp) {
    const v1x = (a.x - b.x) * asp, v1y = a.y - b.y, v2x = (c.x - b.x) * asp, v2y = c.y - b.y;
    const m = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
    if (!m) return NaN;
    return (Math.acos(clamp((v1x * v2x + v1y * v2y) / m, -1, 1)) * 180) / Math.PI;
  }
  const fromVertical = (a, b, asp) => (Math.atan2(Math.abs((a.x - b.x) * asp), Math.abs(a.y - b.y)) * 180) / Math.PI; // 0 = vertical
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  function viewOf(lm, asp) {
    const torso = d2(mid(lm[LS], lm[RS]), mid(lm[LH], lm[RH]), asp) || 1;
    const sw = d2(lm[LS], lm[RS], asp) / torso;
    return { sw, view: sw < 0.4 ? 'side' : sw > 0.55 ? 'front' : 'angled', torso };
  }
  const sideOf = (lm, L, R) => {
    const vl = L.reduce((a, i) => a + vis(lm[i]), 0), vr = R.reduce((a, i) => a + vis(lm[i]), 0);
    return vl >= vr ? { side: 'left', ids: L } : { side: 'right', ids: R };
  };

  /* ---------- exercise definitions ---------- */
  const DEFS = {};

  DEFS.squat = {
    label: 'Bodyweight squat', minVis: 0.55,
    camera: 'Stand about 2 metres from the camera with your whole body in view. Side-on lets me judge depth and trunk position. Facing the camera lets me also check your knees.',
    landmarks: 'Shoulders, hips, knees and ankles.',
    init: () => ({ phase: 'up', base: 0, minR: 1, tDown: null, tHi: null, tLo: null, issues: new Set() }),
    pick: (lm) => sideOf(lm, [LS, LH, LK, LA], [RS, RH, RK, RA]),
    step(S, lm, t, asp, P, emit) {
      const [sh, hip, kn, an] = P.ids.map((i) => lm[i]);
      const D = S.data;
      const hy = kn.y - hip.y;
      D.base = Math.max(D.base * 0.9995, hy); // slowly decaying running max = standing hip-to-knee height
      if (D.base < 0.05) return;
      const r = clamp(hy / D.base, -0.5, 1.2);
      const knee = angleAt(hip, kn, an, asp);
      S.metrics = { depthRatio: +r.toFixed(2), kneeAngle: Math.round(knee) };
      const V = viewOf(lm, asp);
      if (D.phase === 'up') {
        if (r < 0.8) { D.phase = 'down'; D.tDown = t; D.tHi = t; D.tLo = null; D.minR = r; D.issues.clear(); S.phase = 'lowering'; }
        else S.phase = 'ready';
        return;
      }
      D.minR = Math.min(D.minR, r);
      if (D.phase === 'down') {
        S.phase = 'lowering';
        if (r <= 0.35 && D.tLo == null) {
          D.tLo = t;
          const speed = 0.45 / Math.max(0.001, (D.tLo - D.tHi) / 1000);
          if (speed > 1.4) { D.issues.add('fast'); emit('fast', 'Try to control the lowering phase.', 'warn'); }
        }
        if (r < 0.65) {
          if (V.view === 'front') {
            const ks = Math.abs(lm[LK].x - lm[RK].x), as = Math.abs(lm[LA].x - lm[RA].x);
            if (Math.min(vis(lm[LK]), vis(lm[RK]), vis(lm[LA]), vis(lm[RA])) > 0.6 && as > 0.02 && ks / as < 0.8) { D.issues.add('valgus'); emit('valgus', 'Your knees are moving inward; try to keep them in line with your toes.', 'warn', [LK, RK]); }
          }
          if (V.view === 'side' && fromVertical(sh, hip, asp) > 68) { D.issues.add('lean'); emit('lean', 'Try to keep your chest more upright.', 'warn', [sh === lm[LS] ? LS : RS]); }
        }
        if (r > D.minR + 0.12) { D.phase = 'asc'; S.phase = 'rising'; }
        return;
      }
      if (D.phase === 'asc') {
        S.phase = 'rising';
        if (r < D.minR) { D.minR = r; D.phase = 'down'; return; }
        if (r >= 0.85) {
          if (D.minR <= 0.35) S.finishRep(true, [...D.issues], t, { depth: +D.minR.toFixed(2) });
          else if (D.minR <= 0.6) { S.partials++; emit('shallow', 'Try going a little deeper, only as far as feels comfortable.', 'info'); S.logPartial(t); }
          D.phase = 'up'; S.phase = 'ready';
        }
      }
    }
  };

  DEFS.pushup = {
    label: 'Push-up', minVis: 0.55,
    camera: 'Place the camera at floor level, side-on to you, about 2 metres away. Your whole body from hands to head must be in view.',
    landmarks: 'Shoulder, elbow, wrist, hip and ankle on the side facing the camera.',
    init: () => ({ phase: 'up', minE: 180, tHi: null, tLo: null, issues: new Set() }),
    pick: (lm) => sideOf(lm, [LS, LE, LW, LH, LA], [RS, RE, RW, RH, RA]),
    view(lm, asp, P) {
      const V = viewOf(lm, asp);
      if (V.view === 'front') return { ok: false, msg: 'Turn sideways so the camera sees you from the side.' };
      const sh = lm[P.ids[0]], an = lm[P.ids[4]];
      const dx = Math.abs(sh.x - an.x) * asp, dy = Math.abs(sh.y - an.y);
      if (dy > 0.65 * dx) return { ok: false, positioning: true, msg: 'Get into a push-up position, side-on to the camera.' };
      return { ok: true };
    },
    step(S, lm, t, asp, P, emit) {
      const [sh, el, wr, hip, an] = P.ids.map((i) => lm[i]);
      const D = S.data;
      const e = S.sm('elbow', angleAt(sh, el, wr, asp));
      const body = angleAt(sh, hip, an, asp);
      S.metrics = { elbowAngle: Math.round(e), bodyLine: Math.round(body) };
      if (D.phase === 'up') {
        if (e < 150) { D.phase = 'down'; D.tHi = t; D.tLo = null; D.minE = e; D.issues.clear(); S.phase = 'lowering'; } else S.phase = 'ready';
        return;
      }
      D.minE = Math.min(D.minE, e);
      // body line: where the hip sits relative to the shoulder-ankle line
      const k = (hip.x - sh.x) / (an.x - sh.x || 1e-6);
      const lineY = sh.y + k * (an.y - sh.y);
      const off = hip.y - lineY;
      if (body < 163 && Math.abs(off) > 0.04) {
        if (off > 0) { D.issues.add('sag'); emit('sag', 'Your hips are sagging; squeeze your abs and glutes to keep a straight line.', 'warn', [P.ids[3]]); }
        else { D.issues.add('pike'); emit('pike', 'Your hips are rising; lower them so your body forms one line.', 'warn', [P.ids[3]]); }
      }
      if (D.phase === 'down') {
        S.phase = 'lowering';
        if (e <= 100 && D.tLo == null) {
          D.tLo = t;
          const speed = 50 / Math.max(0.001, (D.tLo - D.tHi) / 1000);
          if (speed > 140) { D.issues.add('fast'); emit('fast', 'Try to control the lowering phase.', 'warn'); }
        }
        if (e > D.minE + 12) { D.phase = 'asc'; S.phase = 'pushing'; }
        return;
      }
      if (D.phase === 'asc') {
        S.phase = 'pushing';
        if (e < D.minE) { D.minE = e; D.phase = 'down'; return; }
        if (e >= 155) {
          if (D.minE <= 100) S.finishRep(true, [...D.issues], t, { minElbow: Math.round(D.minE) });
          else if (D.minE <= 125) { S.partials++; emit('shallow', 'Try lowering a little more, until your elbows reach about 90 degrees.', 'info'); S.logPartial(t); }
          D.phase = 'up'; S.phase = 'ready';
        }
      }
    }
  };

  DEFS.curl = {
    label: 'Bicep curl', minVis: 0.5,
    camera: 'Face the camera or stand side-on, about 2 metres away, with your arms and upper body fully in view. I count the reps of the arm the camera sees best.',
    landmarks: 'Shoulder, elbow and wrist of the tracked arm.',
    init: () => ({ phase: 'down', minE: 180, maxE: 0, tHi: null, tLo: null, side: null, issues: new Set(), baseX: null }),
    pick(lm, S) {
      const D = S.data;
      if (D && D.side && D.phase !== 'down') return D.side === 'left' ? { side: 'left', ids: [LS, LE, LW] } : { side: 'right', ids: [RS, RE, RW] };
      return sideOf(lm, [LS, LE, LW], [RS, RE, RW]);
    },
    step(S, lm, t, asp, P, emit) {
      const [sh, el, wr] = P.ids.map((i) => lm[i]);
      const D = S.data;
      const e = S.sm('elbow', angleAt(sh, el, wr, asp));
      const upperArm = fromVertical(el, sh, asp);
      S.metrics = { elbowAngle: Math.round(e), upperArmAngle: Math.round(upperArm), tracking: P.side + ' arm' };
      if (D.phase === 'down') {
        D.maxE = Math.max(D.maxE === 0 ? 0 : D.maxE, e);
        if (e < 140) { D.phase = 'curl'; D.side = P.side; D.tHi = null; D.tLo = null; D.minE = e; D.maxUpper = upperArm; D.issues.clear(); D.baseX = sh.x; D.startE = D.maxE; S.phase = 'curling'; } else { D.maxE = e; S.phase = 'ready'; }
        return;
      }
      D.minE = Math.min(D.minE, e);
      D.maxUpper = Math.max(D.maxUpper, upperArm);
      if (upperArm > 30) { D.issues.add('elbow'); emit('elbow', 'Keep your elbow close to your side.', 'warn', [P.ids[1]]); }
      if (Math.abs(sh.x - D.baseX) * asp > 0.06) { D.issues.add('swing'); emit('swing', 'Try not to swing your body; let the arm do the work.', 'warn', [P.ids[0]]); }
      if (D.phase === 'curl') {
        S.phase = 'curling';
        if (e <= 55 && D.tLo == null) D.tLo = t;
        if (e > D.minE + 12) { D.phase = 'lower'; D.tHi = t; S.phase = 'lowering'; D.eAtTurn = e; }
        return;
      }
      if (D.phase === 'lower') {
        S.phase = 'lowering';
        if (e < D.minE) { D.minE = e; D.phase = 'curl'; return; }
        if (e >= 150) {
          const dur = (t - D.tHi) / 1000;
          const speed = (150 - D.eAtTurn) / Math.max(0.001, dur);
          if (speed > 180) { D.issues.add('fast'); emit('fast', 'Try to control the lowering phase.', 'warn'); }
          if (D.minE <= 55) S.finishRep(true, [...D.issues], t, { minElbow: Math.round(D.minE) });
          else if (D.minE <= 85) { S.partials++; emit('shallow', 'Curl a little higher to bring your hand toward your shoulder.', 'info'); S.logPartial(t); }
          D.phase = 'down'; D.maxE = e; S.phase = 'ready';
        }
      }
    }
  };

  DEFS.press = {
    label: 'Shoulder press', minVis: 0.5,
    camera: 'Face the camera about 2 metres away, with both arms and your head in view, including at full overhead reach.',
    landmarks: 'Both shoulders, elbows and wrists.',
    init: () => ({ phase: 'bottom', reachedTop: false, maxE: 0, tHi: null, issues: new Set(), eAtTurn: 0 }),
    pick: () => ({ ids: [LS, RS, LE, RE, LW, RW] }),
    view(lm, asp) { const V = viewOf(lm, asp); return V.view === 'front' || V.sw >= 0.5 ? { ok: true } : { ok: false, msg: 'Face the camera so I can see both arms.' }; },
    step(S, lm, t, asp, P, emit) {
      const D = S.data;
      const torso = viewOf(lm, asp).torso;
      const eL = angleAt(lm[LS], lm[LE], lm[LW], asp), eR = angleAt(lm[RS], lm[RE], lm[RW], asp);
      const e = S.sm('elbow', (eL + eR) / 2);
      const hL = (lm[LS].y - lm[LW].y) / torso, hR = (lm[RS].y - lm[RW].y) / torso;
      const h = S.sm('h', (hL + hR) / 2);
      S.metrics = { elbowAngle: Math.round(e), wristHeight: +h.toFixed(2) };
      if (D.phase === 'bottom') {
        if (h > 0.6) { D.phase = 'press'; D.reachedTop = false; D.issues.clear(); D.maxE = e; S.phase = 'pressing'; } else S.phase = 'ready';
        return;
      }
      D.maxE = Math.max(D.maxE, e);
      if (D.phase === 'press') {
        S.phase = 'pressing';
        if (e >= 160 && h >= 0.75) {
          D.reachedTop = true; D.phase = 'top'; S.phase = 'top';
          if (Math.abs(hL - hR) > 0.14) { D.issues.add('uneven'); emit('uneven', 'One arm is higher than the other; try pressing both evenly.', 'warn', [lm[LW].y < lm[RW].y ? RW : LW]); }
        } else if (h < 0.5 && e <= 110) {
          if (D.maxE >= 140) { S.partials++; emit('lockout', 'Press until your arms are almost straight.', 'info'); S.logPartial(t); }
          D.phase = 'bottom'; S.phase = 'ready';
        }
        return;
      }
      if (D.phase === 'top') {
        if (e < 150) { D.phase = 'lower'; D.tHi = t; D.eAtTurn = e; S.phase = 'lowering'; }
        return;
      }
      if (D.phase === 'lower') {
        S.phase = 'lowering';
        if (e >= 160 && h >= 0.75) { D.phase = 'top'; return; }
        if (h <= 0.55 && e <= 110) {
          const speed = (150 - e) / Math.max(0.001, (t - D.tHi) / 1000);
          if (speed > 230) { D.issues.add("fast"); emit("fast", "Try to control the lowering phase.", "warn"); }
          S.finishRep(true, [...D.issues], t, {});
          D.phase = 'bottom'; S.phase = 'ready';
        }
      }
    }
  };

  DEFS.lunge = {
    label: 'Forward lunge', minVis: 0.55,
    camera: 'Stand side-on to the camera about 2 metres away with room to step forward. Hips, knees and ankles of both legs must be visible.',
    landmarks: 'Shoulders, hips, knees and ankles on both sides.',
    init: () => ({ phase: 'up', minF: 180, maxB: 0, tHi: null, issues: new Set(), eAtTurn: 0, front: null }),
    pick: () => ({ ids: [LS, RS, LH, RH, LK, RK, LA, RA] }),
    view(lm, asp) { const V = viewOf(lm, asp); return V.view === 'front' ? { ok: false, msg: 'Turn sideways so the camera sees your legs from the side.' } : { ok: true }; },
    step(S, lm, t, asp, P, emit) {
      const D = S.data;
      const kL = S.sm('kL', angleAt(lm[LH], lm[LK], lm[LA], asp)), kR = S.sm('kR', angleAt(lm[RH], lm[RK], lm[RA], asp));
      const lo = Math.min(kL, kR), hi = Math.max(kL, kR);
      const hipMid = mid(lm[LH], lm[RH]);
      const dir = Math.sign(lm[0].x - hipMid.x) || 1;
      const frontLeft = (lm[LA].x - lm[RA].x) * dir > 0;
      const kFront = frontLeft ? kL : kR;
      S.metrics = { frontKnee: Math.round(kFront), backKnee: Math.round(frontLeft ? kR : kL), frontLeg: frontLeft ? 'left' : 'right' };
      if (D.phase === 'up') {
        if (lo < 150) { D.phase = 'down'; D.minF = lo; D.maxB = hi; D.tHi = t; D.issues.clear(); D.front = frontLeft ? 'left' : 'right'; S.phase = 'lowering'; } else S.phase = 'ready';
        return;
      }
      D.minF = Math.min(D.minF, lo); D.maxB = Math.min(D.maxB === 0 ? hi : D.maxB, hi);
      D.lowHi = Math.min(D.lowHi == null ? hi : D.lowHi, hi);
      if (D.phase === 'down') {
        S.phase = 'lowering';
        const sh = mid(lm[LS], lm[RS]);
        if (lo < 115 && fromVertical(sh, hipMid, asp) > 35) { D.issues.add('lean'); emit('lean', 'Keep your torso more upright.', 'warn', [LS, RS]); }
        if (lo > D.minF + 12) { D.phase = 'asc'; D.eAtTurn = lo; S.phase = 'rising'; }
        return;
      }
      if (D.phase === 'asc') {
        S.phase = 'rising';
        if (lo < D.minF) { D.minF = lo; D.phase = 'down'; return; }
        if (lo >= 155 && hi >= 155) {
          const full = D.minF <= 105 && D.lowHi <= 125;
          if (full) S.finishRep(true, [...D.issues], t, { frontKnee: Math.round(D.minF), leg: D.front });
          else if (D.minF <= 125) { S.partials++; emit('shallow', 'Try lowering a little more, until both knees bend to about 90 degrees.', 'info'); S.logPartial(t); }
          D.phase = 'up'; D.lowHi = null; D.maxB = 0; S.phase = 'ready';
        }
      }
    }
  };
  const ISSUE_TEXT = { valgus: 'knees moving inward', lean: 'leaning too far forward', fast: 'lowering too quickly', sag: 'hips sagging', pike: 'hips rising', elbow: 'elbow drifting from your side', swing: 'swinging the body', uneven: 'one arm higher than the other' };

  /* ---------- analyzer wrapper: confidence, framing, cue throttling, rep log ---------- */
  function createAnalyzer(key) {
    const def = DEFS[key];
    if (!def) throw new Error('No movement analyzer for "' + key + '"');
    const S = { key, reps: 0, partials: 0, phase: 'ready', status: 'init', metrics: {}, repLog: [], issueCounts: {}, lastCue: {}, cues: [], frames: 0, usable: 0, t0: null, tLast: 0, lowSince: null, smv: {}, data: def.init() };
    S.sm = (k, v, a) => { a = a || 0.5; if (v == null || Number.isNaN(v)) return S.smv[k]; S.smv[k] = S.smv[k] == null ? v : S.smv[k] * (1 - a) + v * a; return S.smv[k]; };
    let frameEvents = [], flagged = [];
    const emit = (id, text, level, marks) => {
      const last = S.lastCue[id];
      if (last != null && S.tNow - last < 2500) return;
      S.lastCue[id] = S.tNow;
      const c = { id, text, level, t: S.tNow };
      S.cues.push(c); frameEvents.push(c);
      if (marks) flagged = flagged.concat(marks);
    };
    S.finishRep = (ok, issues, t, extra) => {
      S.reps++;
      issues.forEach((i) => { S.issueCounts[i] = (S.issueCounts[i] || 0) + 1; });
      S.repLog.push(Object.assign({ n: S.reps, t, issues, clean: issues.length === 0 }, extra || {}));
      if (!issues.length) { S.lastCue.good = null; emit('good', 'Good repetition.', 'good'); }
    };
    S.logPartial = (t) => { S.repLog.push({ n: null, t, partial: true, issues: ['partial'] }); S.issueCounts.partial = (S.issueCounts.partial || 0) + 1; };
    const out = (extra) => Object.assign({ status: S.status, phase: S.phase, reps: S.reps, partials: S.partials, metrics: S.metrics, events: frameEvents, flagged, ids: S.ids || [], message: '' }, extra || {});

    function update(lm, tMs, asp) {
      asp = asp || 1;
      S.tNow = tMs; frameEvents = []; flagged = [];
      S.frames++;
      if (S.t0 == null) S.t0 = tMs;
      S.tLast = tMs;
      if (!lm || lm.length < 33) { S.status = 'nobody'; return out({ message: 'I cannot see a person. Step into the frame.' }); }
      const P = def.pick(lm, S);
      S.ids = P.ids;
      const used = P.ids.map((i) => lm[i]);
      const visAvg = used.reduce((a, l) => a + vis(l), 0) / used.length;
      const outside = used.filter((l) => vis(l) > 0.3 && (l.x < 0 || l.x > 1 || l.y < 0 || l.y > 1)).length;
      if (visAvg < def.minVis || outside) {
        if (S.lowSince == null) S.lowSince = tMs;
        if (tMs - S.lowSince > 400) {
          S.status = 'lowconf';
          const msg = outside ? 'Move farther from the camera so your whole body is in view.' : 'The camera cannot see your full body. Check the camera position and lighting.';
          emit('lowconf', msg, 'warn');
          return out({ message: msg });
        }
        S.status = 'settling';
        return out({ message: 'Checking visibility...' });
      }
      S.lowSince = null;
      if (def.view) {
        const v = def.view(lm, asp, P);
        if (!v.ok) {
          S.status = v.positioning ? 'positioning' : 'wrongview';
          const msg = v.positioning ? v.msg : 'I cannot reliably assess this movement from the current camera angle. ' + v.msg;
          emit(S.status, msg, 'warn');
          return out({ message: msg });
        }
      }
      S.status = 'ok'; S.usable++;
      def.step(S, lm, tMs, asp, P, emit);
      const recent = S.cues.length && tMs - S.cues[S.cues.length - 1].t < 2500 ? S.cues[S.cues.length - 1] : null;
      return out({ message: recent ? recent.text : '', level: recent ? recent.level : null });
    }
    function summary() {
      const total = S.repLog.filter((r) => !r.partial).length;
      const clean = S.repLog.filter((r) => !r.partial && r.clean).length;
      const parts = [];
      Object.keys(S.issueCounts).forEach((k) => { if (k !== 'partial' && ISSUE_TEXT[k]) parts.push(ISSUE_TEXT[k] + ' on ' + S.issueCounts[k] + ' of ' + total + ' rep' + (total === 1 ? '' : 's')); });
      const usablePct = S.frames ? Math.round((S.usable / S.frames) * 100) : 0;
      const notes = [];
      notes.push(total ? clean + ' of ' + total + ' counted reps had no flagged form issues.' : 'No complete repetitions were counted.');
      if (parts.length) notes.push('Flagged: ' + parts.join('; ') + '.');
      if (S.partials) notes.push(S.partials + ' partial repetition' + (S.partials > 1 ? 's were' : ' was') + ' not counted.');
      if (usablePct < 70) notes.push('Only ' + usablePct + '% of frames could be analysed, so treat this summary with extra caution.');
      notes.push('These are estimates from a 2D body-pose model. They are not a validated or medical assessment.');
      return { key, label: def.label, reps: S.reps, partials: S.partials, cleanReps: clean, issues: Object.assign({}, S.issueCounts), usablePct, durationSec: S.t0 == null ? 0 : Math.round((S.tLast - S.t0) / 1000), notes, repLog: S.repLog.slice() };
    }
    return { update, summary, def, state: S };
  }

  /* ---------- kinematic generator (SIMULATION ONLY) ---------- */
  const blank = (v) => Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: v == null ? 0.95 : v }));
  const setP = (lm, i, p, v) => { lm[i].x = p.x; lm[i].y = p.y; if (v != null) lm[i].visibility = v; };
  const polar = (o, deg, len) => ({ x: o.x + Math.cos((deg * Math.PI) / 180) * len, y: o.y + Math.sin((deg * Math.PI) / 180) * len });
  const lerp = (a, b, t) => a + (b - a) * t;
  function circ(p0, r0, p1, r1) {
    const dx = p1.x - p0.x, dy = p1.y - p0.y, d = Math.hypot(dx, dy);
    if (!d || d > r0 + r1 || d < Math.abs(r0 - r1)) { const f = r0 / (r0 + r1); const m = { x: p0.x + dx * f, y: p0.y + dy * f }; return [m, m]; }
    const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r0 * r0 - a * a));
    const mx = p0.x + (a * dx) / d, my = p0.y + (a * dy) / d;
    return [{ x: mx + (h * dy) / d, y: my - (h * dx) / d }, { x: mx - (h * dy) / d, y: my + (h * dx) / d }];
  }
  function sideFill(lm, f, facing) {
    // f: {sh, el, wr, hip, kn, an}; far side offset a little and less visible
    const pairs = { sh: [LS, RS], el: [LE, RE], wr: [LW, RW], hip: [LH, RH], kn: [LK, RK], an: [LA, RA] };
    Object.keys(pairs).forEach((k) => { if (!f[k]) return; setP(lm, pairs[k][0], f[k], 0.95); setP(lm, pairs[k][1], { x: f[k].x - 0.008, y: f[k].y }, 0.85); });
    if (f.an) { setP(lm, 29, { x: f.an.x - 0.03, y: f.an.y + 0.02 }); setP(lm, 31, { x: f.an.x + 0.07, y: f.an.y + 0.02 }); setP(lm, 30, { x: f.an.x - 0.035, y: f.an.y + 0.02 }); setP(lm, 32, { x: f.an.x + 0.065, y: f.an.y + 0.02 }); }
    if (f.sh) { setP(lm, 0, { x: f.sh.x + 0.04, y: f.sh.y - 0.07 }); }
    for (let i = 1; i <= 10; i++) setP(lm, i, { x: lm[0].x + 0.01, y: lm[0].y - 0.01 });
    if (facing < 0) lm.forEach((l) => { l.x = 1 - l.x; });
  }
  const BUILD = {};
  BUILD.squat = (d, o) => {
    const lm = blank();
    const view = o.view || 'side';
    if (view === 'front') {
      const kneeY = 0.66, thigh = 0.24;
      const hipY = kneeY - thigh * (1 - 0.95 * d);
      const spread = o.valgus ? lerp(0.075, 0.04, d) : lerp(0.075, 0.085, d);
      const shY = hipY - 0.3;
      setP(lm, LS, { x: 0.38, y: shY }); setP(lm, RS, { x: 0.62, y: shY });
      setP(lm, LH, { x: 0.445, y: hipY }); setP(lm, RH, { x: 0.555, y: hipY });
      setP(lm, LK, { x: 0.5 - spread, y: kneeY }); setP(lm, RK, { x: 0.5 + spread, y: kneeY });
      setP(lm, LA, { x: 0.43, y: 0.9 }); setP(lm, RA, { x: 0.57, y: 0.9 });
      setP(lm, LE, { x: 0.36, y: shY + 0.15 }); setP(lm, RE, { x: 0.64, y: shY + 0.15 });
      setP(lm, LW, { x: 0.42, y: shY + 0.22 }); setP(lm, RW, { x: 0.58, y: shY + 0.22 });
      setP(lm, 0, { x: 0.5, y: shY - 0.1 });
      for (let i = 1; i <= 10; i++) setP(lm, i, { x: 0.5, y: shY - 0.1 });
      [[29, LA], [31, LA], [30, RA], [32, RA]].forEach(([i, a]) => setP(lm, i, { x: lm[a].x, y: lm[a].y + 0.02 }));
      return lm;
    }
    const theta = lerp(176, o.shallow ? 105 : 90, d), phi = lerp(3, 15, d), psi = lerp(5, o.lean ? 74 : 38, d);
    const A = { x: 0.5, y: 0.9 };
    const K = polar(A, -90 + phi, 0.24);
    const H = polar(K, 90 + phi + theta, 0.24);
    const S = polar(H, -90 + psi, 0.3);
    sideFill(lm, { an: A, kn: K, hip: H, sh: S, el: { x: S.x + 0.08, y: S.y + 0.1 }, wr: { x: S.x + 0.2, y: S.y + 0.02 } }, 1);
    return lm;
  };
  BUILD.pushup = (d, o) => {
    const lm = blank();
    const theta = lerp(172, o.shallow ? 112 : 72, d);
    const a = 0.15, b = 0.14;
    const W = { x: 0.8, y: 0.82 };
    const dsw = Math.sqrt(a * a + b * b - 2 * a * b * Math.cos((theta * Math.PI) / 180));
    const S = { x: W.x - dsw * Math.sin(0.12), y: W.y - dsw * Math.cos(0.12) };
    const cands = circ(S, a, W, b);
    const E = cands[0].x < cands[1].x ? cands[0] : cands[1];
    const L = 0.78, dy = 0.86 - S.y, dx = -Math.sqrt(Math.max(0.01, L * L - dy * dy));
    const A = { x: S.x + dx, y: S.y + dy };
    const f = 0.385;
    const H = { x: S.x + f * dx, y: S.y + f * dy + (o.sag ? 0.07 : 0) + (o.pike ? -0.08 : 0) };
    const K = { x: (H.x + A.x) / 2, y: (H.y + A.y) / 2 };
    sideFill(lm, { sh: S, el: E, wr: W, hip: H, kn: K, an: A }, 1);
    setP(lm, 0, { x: S.x + 0.06, y: S.y + 0.02 });
    return lm;
  };
  BUILD.curl = (d, o, rep, t) => {
    const lm = blank();
    const swing = o.swing ? 0.09 * Math.sin(d * Math.PI) : 0;
    const theta = lerp(172, o.partial ? 80 : 38, d);
    const sy = 0.3, sx = swing;
    const arm = (sgn) => {
      const S = { x: 0.5 + sgn * 0.12 + sx, y: sy };
      const dxE = sgn * (o.elbowOut ? lerp(0.02, 0.1, d) : 0.02);
      const E = { x: S.x + dxE, y: sy + 0.15 };
      // forearm direction = upper-arm direction rotated so the interior elbow angle equals theta
      const aS = Math.atan2(S.y - E.y, S.x - E.x);
      const aW = aS + sgn * (theta * Math.PI) / 180;
      return { S, E, W: { x: E.x + Math.cos(aW) * 0.14, y: E.y + Math.sin(aW) * 0.14 } };
    };
    const R = arm(1), Lf = arm(-1);
    setP(lm, RS, R.S); setP(lm, RE, R.E); setP(lm, RW, R.W);
    setP(lm, LS, Lf.S); setP(lm, LE, Lf.E); setP(lm, LW, Lf.W);
    setP(lm, LH, { x: 0.44, y: 0.62 }); setP(lm, RH, { x: 0.56, y: 0.62 });
    setP(lm, LK, { x: 0.44, y: 0.78 }); setP(lm, RK, { x: 0.56, y: 0.78 });
    setP(lm, LA, { x: 0.44, y: 0.93 }); setP(lm, RA, { x: 0.56, y: 0.93 });
    setP(lm, 0, { x: 0.5, y: 0.19 });
    for (let i = 1; i <= 10; i++) setP(lm, i, { x: 0.5, y: 0.19 });
    return lm;
  };
  BUILD.press = (d, o) => {
    const lm = blank();
    const s = o.partial ? d * 0.6 : d;
    const sy = 0.3;
    const arm = (sgn, lag) => {
      const ss = lag ? s * 0.65 : s;
      const S = { x: 0.5 + sgn * 0.12, y: sy };
      const E = { x: S.x + sgn * lerp(0.11, 0.02, ss), y: sy + lerp(0.03, -0.15, ss) };
      const Wp = { x: E.x, y: E.y - 0.14 };
      return { S, E, W: Wp };
    };
    const R = arm(1, false), Lf = arm(-1, !!o.uneven);
    // (lagging arm reaches ~65% of the range, so the pair still reaches lockout on average)
    setP(lm, RS, R.S); setP(lm, RE, R.E); setP(lm, RW, R.W);
    setP(lm, LS, Lf.S); setP(lm, LE, Lf.E); setP(lm, LW, Lf.W);
    setP(lm, LH, { x: 0.44, y: 0.62 }); setP(lm, RH, { x: 0.56, y: 0.62 });
    setP(lm, LK, { x: 0.44, y: 0.78 }); setP(lm, RK, { x: 0.56, y: 0.78 });
    setP(lm, LA, { x: 0.44, y: 0.93 }); setP(lm, RA, { x: 0.56, y: 0.93 });
    setP(lm, 0, { x: 0.5, y: 0.19 });
    for (let i = 1; i <= 10; i++) setP(lm, i, { x: 0.5, y: 0.19 });
    return lm;
  };
  BUILD.lunge = (d, o, rep) => {
    const lm = blank();
    // Standing top of the split stance: both legs straight (hip height = sqrt(leg^2 - 0.16^2) above the ankles).
    const yh = lerp(0.4465, o.shallow ? 0.53 : 0.62, d);
    const H = { x: 0.46, y: yh };
    const lean = o.lean ? lerp(5, 48, d) : lerp(2, 10, d);
    const S = polar(H, -90 + lean, 0.3);
    const aF = { x: 0.62, y: 0.9 }, aB = { x: 0.3, y: 0.9 };
    const cf = circ(H, 0.24, aF, 0.24), kF = cf[0].x > cf[1].x ? cf[0] : cf[1];
    const cb = circ(H, 0.24, aB, 0.24), kB = cb[0].y > cb[1].y ? cb[0] : cb[1];
    const leftFront = rep % 2 === 0;
    const setLeg = (frontIdx, backIdx) => { /* idx = [hip, knee, ankle] */
      setP(lm, frontIdx[0], H); setP(lm, frontIdx[1], kF); setP(lm, frontIdx[2], aF);
      setP(lm, backIdx[0], { x: H.x - 0.01, y: H.y }); setP(lm, backIdx[1], kB); setP(lm, backIdx[2], aB);
    };
    if (leftFront) setLeg([LH, LK, LA], [RH, RK, RA]); else setLeg([RH, RK, RA], [LH, LK, LA]);
    setP(lm, LS, S); setP(lm, RS, { x: S.x - 0.012, y: S.y });
    setP(lm, LE, { x: S.x + 0.02, y: S.y + 0.14 }); setP(lm, RE, { x: S.x + 0.02, y: S.y + 0.14 });
    setP(lm, LW, { x: S.x + 0.03, y: S.y + 0.26 }); setP(lm, RW, { x: S.x + 0.03, y: S.y + 0.26 });
    setP(lm, 0, { x: S.x + 0.04, y: S.y - 0.07 });
    for (let i = 1; i <= 10; i++) setP(lm, i, { x: lm[0].x + 0.01, y: lm[0].y - 0.01 });
    return lm;
  };
  BUILD.hinge = (d) => {
    const lm = blank();
    const A = { x: 0.5, y: 0.9 }, K = polar(A, -86, 0.24);
    const H = { x: K.x - 0.04 - 0.11 * d, y: K.y - 0.22 + 0.03 * d };
    const S = polar(H, -90 + lerp(3, 80, d), 0.3);
    sideFill(lm, { an: A, kn: K, hip: H, sh: S, el: { x: S.x + 0.01, y: S.y + 0.14 }, wr: { x: S.x + 0.02, y: S.y + 0.28 } }, 1);
    return lm;
  };
  BUILD.march = (d, o, rep) => {
    const lm = blank();
    const H = { x: 0.48, y: 0.5 }, S = { x: 0.5, y: 0.2 };
    const up = { hip: H, kn: { x: 0.56, y: lerp(0.72, 0.56, d) }, an: { x: 0.5, y: lerp(0.92, 0.74, d) } };
    const dn = { hip: H, kn: { x: 0.49, y: 0.72 }, an: { x: 0.49, y: 0.92 } };
    const L = rep % 2 === 0 ? up : dn, R = rep % 2 === 0 ? dn : up;
    setP(lm, LH, L.hip); setP(lm, LK, L.kn); setP(lm, LA, L.an); setP(lm, RH, R.hip); setP(lm, RK, R.kn); setP(lm, RA, R.an);
    setP(lm, LS, S); setP(lm, RS, { x: S.x - 0.01, y: S.y });
    setP(lm, LE, { x: 0.5 + 0.06 * Math.sin(d * Math.PI), y: 0.34 }); setP(lm, RE, { x: 0.5 - 0.06 * Math.sin(d * Math.PI), y: 0.34 });
    setP(lm, LW, { x: 0.55, y: 0.46 }); setP(lm, RW, { x: 0.45, y: 0.46 });
    setP(lm, 0, { x: 0.52, y: 0.12 }); for (let i = 1; i <= 10; i++) setP(lm, i, { x: 0.52, y: 0.12 });
    return lm;
  };
  BUILD.stand = () => {
    const lm = blank();
    sideFill(lm, { an: { x: 0.5, y: 0.92 }, kn: { x: 0.5, y: 0.7 }, hip: { x: 0.5, y: 0.48 }, sh: { x: 0.5, y: 0.2 }, el: { x: 0.52, y: 0.35 }, wr: { x: 0.53, y: 0.5 } }, 1);
    return lm;
  };
  const DEMO_KIND = { squat: 'squat', hpush: 'pushup', vpush: 'press', arms: 'curl', lunge: 'lunge', hinge: 'hinge', cardio: 'march', core: 'pushup' };
  function demoKindFor(ex) { if (ex.an && BUILD[ex.an]) return ex.an; return DEMO_KIND[ex.pat] || null; }
  function demoFrame(kind, d, rep) { return BUILD[kind] ? BUILD[kind](d, {}, rep || 0, 0) : BUILD.stand(); }
  const SIM_DEFAULT ={ squat: { repSec: 3.2 }, pushup: { repSec: 2.8 }, curl: { repSec: 3 }, press: { repSec: 3 }, lunge: { repSec: 3.4 } };
  function genSequence(key, o) {
    o = Object.assign({ reps: 5, fps: 30, noise: 0.003, seed: 7, lead: 1.2, tail: 1.0 }, SIM_DEFAULT[key] || {}, o || {});
    const rand = rng(o.seed), gauss = () => (rand() + rand() + rand() - 1.5) * 1.15;
    const frames = [];
    const total = o.lead + o.reps * o.repSec + o.tail;
    for (let i = 0; i / o.fps < total; i++) {
      const t = i / o.fps, tt = t - o.lead;
      let d = 0, rep = 0;
      if (tt >= 0 && tt < o.reps * o.repSec) { rep = Math.floor(tt / o.repSec); const u = (tt % o.repSec) / o.repSec; d = (1 - Math.cos(2 * Math.PI * u)) / 2; }
      const flags = Object.assign({}, o, (o.perRep && o.perRep[rep]) || {});
      const lm = BUILD[key](d, flags, rep, t);
      lm.forEach((l) => { l.x += gauss() * o.noise; l.y += gauss() * o.noise; });
      if (o.lowVis && t >= o.lowVis.from && t <= o.lowVis.to) o.lowVis.ids.forEach((id) => { lm[id].visibility = 0.15; });
      if (o.outOfFrame) lm.forEach((l) => { l.y += 0.14; });
      frames.push({ t: Math.round(t * 1000), lm });
    }
    return frames;
  }
  function runSequence(key, frames, asp) {
    const A = createAnalyzer(key);
    let last = null;
    const events = [];
    frames.forEach((f) => { last = A.update(f.lm, f.t, asp || 1); last.events.forEach((e) => events.push(e)); });
    return { analyzer: A, last, events, summary: A.summary() };
  }
  const ANALYZER_KEYS = Object.keys(DEFS);
  const DEF_INFO = Object.fromEntries(ANALYZER_KEYS.map((k) => [k, { label: DEFS[k].label, camera: DEFS[k].camera, landmarks: DEFS[k].landmarks }]));
  FIT.pose = { createAnalyzer, genSequence, runSequence, angleAt, viewOf, POSE_CONNECTIONS, ANALYZER_KEYS, DEF_INFO, ISSUE_TEXT, demoFrame, demoKindFor };
