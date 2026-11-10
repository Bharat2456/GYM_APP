import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, useWindowDimensions } from 'react-native';
import Svg, { Line as SLine, Circle as SCircle } from 'react-native-svg';
import FIT, { EX, EXERCISES } from '../engine';
import { useApp, useAct } from '../app/context';
import { useNav, registerScreens } from '../app/nav';
import { Screen, Header, Txt, Card, Btn, Row, Gap, Chip, Pill, Callout, ListItem, Sheet, Toggle } from '../ui/kit';
import { Icon } from '../ui/icons';
import * as W from '../services/workouts';
import { PoseCamera } from './PoseCamera';
import { Smoother, Landmark, DEFAULT_ORIENT, MIN_SCORE_FOR_DRAW, Orient } from './movenet';

const KEYS: string[] = FIT.pose.ANALYZER_KEYS;
const exFor = (key: string) => EXERCISES.find((e) => e.an === key && !e.off)?.id || KEYS[0];
const STATUS_TEXT: Record<string, string> = { nobody: 'I cannot see you. Step into view.', lowconf: 'Hard to see your joints. Improve the light or step back.', settling: 'Getting a steady view…', wrongview: 'Turn so the camera sees the side I need.', positioning: 'Get into the starting position.', ok: 'Tracking' };

/* -------- exercise picker -------- */
function CamPick() {
  const nav = useNav();
  return (
    <Screen><Header title="Camera coach" sub="Pick a movement" onBack={nav.pop} />
      <Callout tone="info" title="Privacy">The camera is analysed live on your phone. No photo or video is saved or sent anywhere. Only rep counts and form notes are kept, and you can delete them any time.</Callout><Gap />
      {KEYS.map((k) => <Card key={k} onPress={() => nav.push('camSetup', { exId: exFor(k) })} style={{ marginBottom: 10 }}><Row gap={12}><Icon name="camera" color="#C6F432" /><View style={{ flex: 1 }}><Txt v="h3">{FIT.pose.DEF_INFO[k].label}</Txt><Txt v="small" c="sub" numberOfLines={2}>{FIT.pose.DEF_INFO[k].camera}</Txt></View><Icon name="right" size={18} color="#888" /></Row></Card>)}
      <Txt v="small" c="mute">Rep counts and form checks are estimates from a phone camera. They are not medical or coaching certification.</Txt>
    </Screen>
  );
}

/* -------- setup -------- */
function CamSetup({ exId }: { exId: string }) {
  const nav = useNav(); const { repo, actor } = useApp(); const ex = EX[exId]; const key = ex?.an || KEYS[0]; const info = FIT.pose.DEF_INFO[key];
  const orient = (repo.getKV(actor, actor.id, 'camOrient') || DEFAULT_ORIENT) as Orient; const [facing, setFacing] = useState<'back' | 'front'>('back');
  return (
    <Screen><Header title={info.label} sub="Before you start" onBack={nav.pop} />
      <Card><Txt v="label" c="sub">Camera position</Txt><Txt>{info.camera}</Txt></Card><Gap />
      <Card><Txt v="label" c="sub">Checklist</Txt>{['Good light, not backlit', 'Phone steady (prop it up)', 'Clear floor space', 'Wear fitted clothes so joints are visible', 'Stop if anything hurts'].map((x) => <Row key={x} gap={8} style={{ paddingVertical: 3 }}><Icon name="check" size={16} color="#C6F432" /><Txt>{x}</Txt></Row>)}</Card><Gap />
      <Row wrap><Chip label="Back camera" on={facing === 'back'} onPress={() => setFacing('back')} /><Chip label="Front camera" on={facing === 'front'} onPress={() => setFacing('front')} /></Row><Gap />
      <Callout tone="info">Nothing is recorded. Frames are analysed in memory and discarded. Orientation is {orient.rotate}°{orient.mirror ? ' mirrored' : ''}; change it in Profile if the skeleton looks wrong.</Callout><Gap />
      <Btn label="Start camera" icon="camera" onPress={() => nav.replace('camLive', { exId, akey: key, facing, sim: false })} /><Gap h={8} />
      <Btn label="Try a simulation (no camera)" kind="ghost" onPress={() => nav.replace('camLive', { exId, akey: key, facing, sim: true })} />
      <Txt v="small" c="mute" style={{ marginTop: 8 }}>The simulation replays a built-in synthetic movement to show how feedback works. It is not you.</Txt>
    </Screen>
  );
}

/* -------- live -------- */
function CamLive({ exId, akey, facing, sim }: { exId: string; akey?: string; facing: 'back' | 'front'; sim: boolean }) {
  const key = akey || EX[exId]?.an || KEYS[0];
  const { repo, actor, theme: t, setModelStatus, toast } = useApp(); const nav = useNav(); const act = useAct(); const { width } = useWindowDimensions();
  const orient = useMemo(() => (repo.getKV(actor, actor.id, 'camOrient') || DEFAULT_ORIENT) as Orient, []);
  const analyzer = useRef<any>(FIT.pose.createAnalyzer(key)); const smoother = useRef(new Smoother(0.55)); const t0 = useRef(Date.now());
  const [view, setView] = useState<{ lm: Landmark[]; flagged: number[]; status: string; reps: number; partials: number; cue: string; level: string }>({ lm: [], flagged: [], status: 'init', reps: 0, partials: 0, cue: '', level: 'info' });
  const [running, setRunning] = useState(true); const [res, setRes] = useState<any>(null); const [modelMsg, setModelMsg] = useState('');
  const aspect = 0.75; const h = width / aspect;
  const feed = useCallback((lm: Landmark[], tMs: number) => {
    const r = analyzer.current.update(smoother.current.apply(lm), tMs - t0.current, aspect);
    const ev = r.events?.length ? r.events[r.events.length - 1] : null;
    setView((v) => ({ lm, flagged: r.flagged || [], status: r.status, reps: r.reps, partials: r.partials, cue: ev ? ev.text : v.cue, level: ev ? ev.level : v.level }));
  }, []);
  useEffect(() => { // simulation mode: replay synthetic frames. Never used for the real camera path.
    if (!sim || !running) return; const frames = FIT.pose.genSequence(key, { reps: 8, seed: 3 }); let i = 0; const start = Date.now();
    const id = setInterval(() => { const f = frames[i % frames.length]; i++; feed(f.lm, Date.now()); if (i >= frames.length) clearInterval(id); }, 33); return () => clearInterval(id);
  }, [sim, running]);
  const finish = () => { setRunning(false); const s = analyzer.current.summary(); setRes(s); };
  const save = () => { if (sim) { nav.pop(); return; } act(() => W.saveCameraSession(repo, actor, { key, exId, reps: res.reps, cleanReps: res.cleanReps, durationSec: Math.round(res.durationSec || (Date.now() - t0.current) / 1000), issues: res.issues || {}, notes: res.notes || [], usablePct: Math.round(res.usablePct || 0) }), 'Session saved'); nav.pop(); };
  const sz = { w: width, h };
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ width: sz.w, height: sz.h, backgroundColor: '#111' }}>
        {sim ? <View style={{ position: 'absolute', inset: 0 } as any} /> : <PoseCamera active={running} orient={orient} facing={facing} onLandmarks={feed} onStatus={(s) => { setModelMsg(s); setModelStatus(s); }} />}
        <Svg width={sz.w} height={sz.h} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
          {view.lm.length ? (FIT.pose.POSE_CONNECTIONS as [number, number][]).map(([a, b], i) => { const A = view.lm[a], B = view.lm[b]; if (!A || !B || A.visibility < MIN_SCORE_FOR_DRAW || B.visibility < MIN_SCORE_FOR_DRAW) return null; return <SLine key={i} x1={A.x * sz.w} y1={A.y * sz.h} x2={B.x * sz.w} y2={B.y * sz.h} stroke={t.accent} strokeWidth={3} strokeLinecap="round" />; }) : null}
          {view.lm.map((l, i) => l.visibility >= MIN_SCORE_FOR_DRAW && [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].includes(i) ? <SCircle key={i} cx={l.x * sz.w} cy={l.y * sz.h} r={view.flagged.includes(i) ? 7 : 4} fill={view.flagged.includes(i) ? t.bad : '#fff'} /> : null)}
        </Svg>
        <View style={{ position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pill label={sim ? 'SIMULATION · not your camera' : 'Camera on · nothing is recorded'} tone={sim ? 'warn' : 'good'} />
          <Pressable onPress={() => nav.pop()} accessibilityLabel="Exit camera" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#000A', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" color="#fff" /></Pressable>
        </View>
      </View>
      <View style={{ flex: 1, backgroundColor: t.bg, padding: 16, gap: 10 }}>
        <Row between><View><Txt v="label" c="sub">{FIT.pose.DEF_INFO[key].label}</Txt><Txt v="huge" style={{ lineHeight: 56 }}>{view.reps}</Txt><Txt v="small" c="sub">reps{view.partials ? ' · ' + view.partials + ' partial' : ''}</Txt></View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}><Pill label={view.status === 'ok' ? 'Tracking' : view.status === 'init' ? 'Starting' : view.status} tone={view.status === 'ok' ? 'good' : 'warn'} /></View></Row>
        <Card pad={12} style={{ borderColor: view.level === 'bad' || view.level === 'warn' ? t.warn : t.border }}><Txt>{view.cue || STATUS_TEXT[view.status] || 'Get in position. I will count when I can see you.'}</Txt>{view.status !== 'ok' && view.cue ? <Txt v="small" c="mute">{STATUS_TEXT[view.status]}</Txt> : null}</Card>
        {!sim && modelMsg && !/loaded/i.test(modelMsg) ? <Callout tone="warn">{modelMsg}</Callout> : null}
        <Btn label="Finish" icon="check" onPress={finish} />
      </View>
      <Sheet visible={!!res} onClose={() => { setRes(null); setRunning(true); }} title="Session summary">
        {res ? <>
          {sim ? <Callout tone="warn">This was a simulation, so it will not be saved.</Callout> : null}
          <Row wrap><Pill label={res.reps + ' reps'} tone="accent" /><Pill label={res.cleanReps + ' clean'} tone="good" />{res.partials ? <Pill label={res.partials + ' partial'} tone="warn" /> : null}<Pill label={Math.round(res.usablePct || 0) + '% frames analysable'} /></Row>
          {(res.notes || []).map((n: string, i: number) => <Txt key={i}>• {n}</Txt>)}
          {!res.reps ? <Txt c="sub">No reps were counted. Check the camera position and lighting, then try again.</Txt> : null}
          <Txt v="small" c="mute">Estimates only. Counts and form notes can be wrong, especially if parts of your body were hidden.</Txt>
          <Btn label={sim ? 'Close' : 'Save session'} onPress={save} /><Btn label="Discard" kind="ghost" onPress={() => nav.pop()} />
        </> : null}
      </Sheet>
    </View>
  );
}
registerScreens({ camPick: CamPick, camSetup: CamSetup, camLive: CamLive as any });
