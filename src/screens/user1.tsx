import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, TextInput, FlatList } from 'react-native';
import Svg, { Line as SLine, Circle as SCircle } from 'react-native-svg';
import FIT, { EX, EXERCISES, DAY, ymd } from '../engine';
import { useApp, useData, useAct } from '../app/context';
import { useNav, registerScreens } from '../app/nav';
import { Screen, Header, Txt, Card, Btn, Row, Gap, Chip, Pill, Section, ListItem, Empty, Stat, Grid, Segmented, Sheet, Callout, Divider, Field, Ring } from '../ui/kit';
import { Icon } from '../ui/icons';
import * as W from '../services/workouts';
import * as G from '../services/gym';
import * as N from '../services/nutrition';
import * as A from '../services/admin';

const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], DL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const exName = (id: string) => EX[id]?.name || id;
export const dose = (e: { sets: number; reps?: number; secs?: number }) => e.sets + ' × ' + (e.secs ? e.secs + ' s' : e.reps + ' reps');

/** Animated stick-figure demonstration drawn from the same landmark generator used to test the analyzers. */
export function StickFigure({ exId, size = 200 }: { exId: string; size?: number }) {
  const { theme: t } = useApp(); const kind = FIT.pose.demoKindFor(EX[exId]); const [d, setD] = useState(0);
  useEffect(() => { let n = 0; const id = setInterval(() => { n += 1; setD((1 - Math.cos((n / 40) * 2 * Math.PI)) / 2); }, 60); return () => clearInterval(id); }, []);
  if (!kind) return <View style={{ height: size, alignItems: 'center', justifyContent: 'center' }}><Icon name="dumbbell" size={48} color={t.mute} /></View>;
  const lm = FIT.pose.demoFrame(kind, d, 0); const C = FIT.pose.POSE_CONNECTIONS as [number, number][];
  return (
    <View style={{ alignItems: 'center' }} accessible accessibilityLabel={'Animated demonstration of ' + exName(exId)}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {C.map(([a, b], i) => lm[a] && lm[b] ? <SLine key={i} x1={lm[a].x * 100} y1={lm[a].y * 100} x2={lm[b].x * 100} y2={lm[b].y * 100} stroke={t.accent} strokeWidth={2.4} strokeLinecap="round" /> : null)}
        {[0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].map((i) => lm[i] ? <SCircle key={i} cx={lm[i].x * 100} cy={lm[i].y * 100} r={i === 0 ? 3.2 : 1.8} fill={t.text} /> : null)}
      </Svg>
      <Txt v="small" c="mute">Schematic guide, not a video</Txt>
    </View>
  );
}

export function ExerciseSheet({ exId, onClose }: { exId: string | null; onClose: () => void }) {
  const nav = useNav(); const e = exId ? EX[exId] : null;
  const L = (k: string, v?: string | string[]) => v && (Array.isArray(v) ? v.length : true) ? <View style={{ gap: 4 }}><Txt v="label" c="sub">{k}</Txt>{Array.isArray(v) ? v.map((x, i) => <Txt key={i}>{i + 1}. {x}</Txt>) : <Txt>{v}</Txt>}</View> : null;
  return (
    <Sheet visible={!!e} onClose={onClose} title={e?.name}>
      {e ? <>
        <StickFigure exId={e.id} />
        <Row wrap><Pill label={e.cat} tone="accent" /><Pill label={['Easy', 'Medium', 'Hard'][e.diff - 1] || 'Level ' + e.diff} /><Pill label={e.eq.length ? e.eq.join(', ') : 'No equipment'} />{e.an ? <Pill label="Camera analysis" tone="good" /> : null}</Row>
        <Txt c="sub">{e.desc}</Txt>
        {L('Target muscles', e.muscles.join(', '))}{L('Starting position', e.start)}{L('How to do it', e.steps)}{L('Breathing', e.breath)}{L('Common mistakes', e.mistakes)}{L('Safety', e.safety)}{L('Easier', e.easier ? exName(e.easier) !== e.easier ? exName(e.easier) : e.easier : '')}{L('Harder', e.harder ? exName(e.harder) !== e.harder ? exName(e.harder) : e.harder : '')}
        {e.cam ? L('Camera position', e.cam) : null}
        {e.an ? <Btn label="Analyse with camera" icon="camera" onPress={() => { onClose(); nav.push('camSetup', { exId: e.id }); }} /> : null}
      </> : null}
    </Sheet>
  );
}

/* ------------------------------ HOME ------------------------------ */
export function Home() {
  const { repo, actor, theme: t, session } = useApp(); const nav = useNav(); const now = repo.now();
  const d = useData(() => {
    const pd = W.getPlanDoc(repo, actor), ws = W.listWorkouts(repo, actor), prof: any = repo.get(actor, 'profile', actor.id);
    const dow = new Date(now).getDay(), today = pd?.plan.days.find((x) => x.dow === dow), doneToday = ws.find((w) => w.date === ymd(now));
    const wk = FIT.weekStart(now), week = Array.from({ length: 7 }, (_, i) => { const dd = (1 + i) % 7; const start = wk + i * DAY; return { dow: dd, planned: !!pd?.plan.days.find((x) => x.dow === dd), done: ws.some((w) => w.at >= start && w.at < start + DAY), isToday: dd === dow }; });
    const memb = G.myMemberships(repo, actor).find((m) => ['active', 'expiring', 'pending'].includes(m.status as string));
    return { pd, today, doneToday, week, prof, run: W.getRun(repo, actor), brand: G.brandFor(repo, actor), kcal: N.dayView(repo, actor, ymd(now)).totals.kcal, tg: N.targetsFor(repo, actor), streak: FIT.weekStreak(ws, now, prof?.daysPerWeek || 3), count7: ws.filter((w) => w.at > now - 7 * DAY).length, memb, anns: G.listAnnouncements(repo, actor).slice(0, 1) as any[], asg: G.myAssignments(repo, actor) };
  });
  const hr = new Date(now).getHours(); const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <Screen>
      <Row between style={{ paddingTop: 12 }}>
        <View style={{ flex: 1 }}><Txt v="label" c="accent">{d.brand ? d.brand.gymName : greet}</Txt><Txt v="h1">{d.brand ? d.brand.welcome : (d.prof?.name || session.account.displayName) + ' 👋'}</Txt></View>
        <Pressable onPress={() => nav.push('profile')} accessibilityLabel="Profile and settings" style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}><Txt v="h2" c="onAccent">{(d.prof?.name || session.account.displayName)[0]}</Txt></Pressable>
      </Row>
      <Gap />
      {d.run ? <Card onPress={() => nav.push('run')} style={{ marginBottom: 12, borderColor: t.accent }}><Row gap={12}><Icon name="play" color={t.accentText} /><View style={{ flex: 1 }}><Txt v="h3">Resume workout</Txt><Txt v="small" c="sub">{d.run.title}</Txt></View><Icon name="right" color={t.mute} size={18} /></Row></Card> : null}
      <Card accent pad={20}>
        {d.doneToday ? <><Txt v="label" c="onAccent">Today</Txt><Txt v="h1" c="onAccent">Done. Nice work.</Txt><Txt style={{ color: t.onAccent }}>You finished "{d.doneToday.title}". Rest, eat well and hydrate.</Txt></>
          : d.today ? <><Txt v="label" c="onAccent">Today's workout · {d.today.estMin} min</Txt><Txt v="h1" c="onAccent">{d.today.title}</Txt><Txt style={{ color: t.onAccent }} numberOfLines={2}>{d.today.exercises.map((e) => exName(e.exId)).join(' · ')}</Txt><Gap h={14} /><Btn label="Start workout" kind="soft" icon="play" onPress={() => { const r = d.run ? null : W.startRun(repo, actor, { kind: 'plan', dow: d.today!.dow! }); nav.push('run'); }} style={{ backgroundColor: t.onAccent }} /></>
          : <><Txt v="label" c="onAccent">Today</Txt><Txt v="h1" c="onAccent">Rest day</Txt><Txt style={{ color: t.onAccent }}>Recovery is when you get stronger. A walk or light stretching is a good option.</Txt></>}
      </Card>
      <Section title="This week"><Card><Row between>{d.week.map((w, i) => <View key={i} style={{ alignItems: 'center', gap: 6 }}><Txt v="small" c={w.isToday ? 'accent' : 'mute'} style={{ fontWeight: '800' }}>{DN[w.dow][0]}</Txt><View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: w.done ? t.accent : 'transparent', borderWidth: 2, borderColor: w.done ? t.accent : w.planned ? t.border : 'transparent' }}>{w.done ? <Icon name="check" size={16} color={t.onAccent} /> : w.planned ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: w.isToday ? t.accent : t.mute }} /> : null}</View></View>)}</Row></Card></Section>
      <Gap />
      <Grid><Stat label="Streak (weeks)" value={d.streak} icon="flame" /><Stat label="Workouts / 7 days" value={d.count7} icon="activity" /></Grid>
      <Gap />
      <Card onPress={() => nav.setTab('nutrition')}><Row gap={16}><Ring value={d.kcal} max={d.tg?.kcal || 2000} size={92} label="KCAL" /><View style={{ flex: 1 }}><Txt v="h3">Nutrition today</Txt><Txt v="small" c="sub">{d.tg ? Math.max(0, d.tg.kcal - d.kcal) + ' kcal left of about ' + d.tg.kcal + ' (estimate)' : 'Complete your profile for targets'}</Txt></View></Row></Card>
      <Section title="Quick actions"><Row wrap>{[['camera', 'Camera coach', () => nav.push('camPick')], ['food', 'Log a meal', () => nav.setTab('nutrition')], ['chat', 'Ask the coach', () => nav.setTab('coach')], ['book', 'Exercise library', () => nav.push('library')]].map(([ic, l, fn]: any) => <Pressable key={l} onPress={fn} accessibilityRole="button" style={{ flexBasis: '47%', flexGrow: 1 }}><Card pad={14}><Icon name={ic} color={t.accentText} /><Txt v="h3" style={{ marginTop: 8 }}>{l}</Txt></Card></Pressable>)}</Row></Section>
      {d.memb ? <Section title="Your gym" action="Open" onAction={() => nav.push('gymInfo')}>
        <Card onPress={() => nav.push('gymInfo')}><Row gap={12}><Icon name="building" color={t.accentText} /><View style={{ flex: 1 }}><Txt v="h3">{d.memb.gym?.name}</Txt><Txt v="small" c="sub">{d.memb.status === 'pending' ? 'Request pending approval' : d.memb.daysLeft != null ? d.memb.daysLeft + ' days left on ' + (d.memb.pkg?.name || 'membership') : 'Member'}</Txt></View></Row>{d.anns[0] ? <><Gap h={8} /><Divider /><Gap h={8} /><Txt v="small"><Txt v="small" style={{ fontWeight: '800' }}>{d.anns[0].title}: </Txt>{d.anns[0].text}</Txt></> : null}</Card>
        {d.asg.length ? <Card onPress={() => nav.push('gymInfo')}><Row gap={12}><Icon name="award" color={t.accentText} /><View style={{ flex: 1 }}><Txt v="h3">Assigned: {d.asg[0].programme!.name}</Txt><Txt v="small" c="sub">{d.asg[0].assignment.note || 'From your gym'}</Txt></View></Row></Card> : null}
      </Section> : <Section title="Gym"><Card onPress={() => nav.push('gymInfo')}><Row gap={12}><Icon name="building" color={t.accentText} /><View style={{ flex: 1 }}><Txt v="h3">Connect to a gym</Txt><Txt v="small" c="sub">Join with a code or QR to see programmes and announcements.</Txt></View><Icon name="right" size={18} color={t.mute} /></Row></Card></Section>}
    </Screen>
  );
}

/* ------------------------------ TRAIN ------------------------------ */
export function Train() {
  const [tab, setTab] = useState('today');
  const nav = useNav();
  return (
    <Screen>
      <Header title="Train" sub="Workout" right={<Pressable onPress={() => nav.push('camPick')} accessibilityLabel="Camera coach" style={{ padding: 10 }}><Icon name="camera" color="#C6F432" /></Pressable>} big />
      <Segmented options={[{ key: 'today', label: 'Today' }, { key: 'week', label: 'Plan' }, { key: 'lib', label: 'Library' }, { key: 'hist', label: 'History' }]} value={tab} onChange={setTab} />
      <Gap />
      {tab === 'today' ? <TodayTab /> : tab === 'week' ? <WeekTab /> : tab === 'lib' ? <LibraryList /> : <HistoryTab />}
    </Screen>
  );
}
function TodayTab() {
  const { repo, actor, theme: t } = useApp(); const nav = useNav(); const act = useAct(); const now = repo.now(); const [info, setInfo] = useState<string | null>(null); const [swap, setSwap] = useState<number | null>(null);
  const d = useData(() => { const pd = W.getPlanDoc(repo, actor), dow = new Date(now).getDay(); return { pd, day: pd?.plan.days.find((x) => x.dow === dow), next: pd ? FIT.nextSession(pd.plan, now) : '', run: W.getRun(repo, actor), asg: G.myAssignments(repo, actor), prof: repo.get(actor, 'profile', actor.id), sessions: W.listWorkouts(repo, actor) }; });
  if (!d.pd) return <Empty icon="dumbbell" title="No plan yet" text="Finish your profile to get a personalised plan." />;
  const start = () => act(() => { if (!d.run) W.startRun(repo, actor, { kind: 'plan', dow: d.day!.dow! }); nav.push('run'); });
  const alts: any[] = swap != null && d.day ? FIT.alternativesFor(EX[d.day.exercises[swap].exId], d.prof, d.pd.plan) : [];
  return (
    <View style={{ gap: 12 }}>
      {d.pd.plan.safety?.banner ? <Callout tone="warn">{d.pd.plan.safety.banner}</Callout> : null}
      {d.run ? <Card onPress={() => nav.push('run')}><Row gap={12}><Icon name="play" color={t.accentText} /><View style={{ flex: 1 }}><Txt v="h3">Workout in progress</Txt><Txt v="small" c="sub">{d.run.title} · tap to continue</Txt></View></Row></Card> : null}
      {d.day ? <>
        <Card accent><Txt v="label" c="onAccent">{DL[d.day.dow!]} · about {d.day.estMin} min</Txt><Txt v="h1" c="onAccent">{d.day.title}</Txt>{d.day.objective ? <Txt style={{ color: t.onAccent }}>{d.day.objective}</Txt> : null}</Card>
        {d.day.warmup.length ? <Card pad={14}><Txt v="label" c="sub">Warm-up</Txt><Txt v="small">{d.day.warmup.map((w: any) => exName(w.exId) + (w.secs ? ' ' + w.secs + 's' : w.reps ? ' ×' + w.reps : '')).join(' → ')}</Txt></Card> : null}
        {d.day.exercises.map((e, i) => <Card key={i} pad={14}><Row gap={10}><View style={{ flex: 1 }}><Pressable onPress={() => setInfo(e.exId)}><Txt v="h3">{exName(e.exId)}</Txt></Pressable><Txt v="small" c="sub">{dose(e)} · rest {e.rest} s{W.suggestWeight(d.sessions, e.exId) ? ' · try ' + W.suggestWeight(d.sessions, e.exId)!.kg + ' kg' : ''}</Txt>{e.note ? <Txt v="small" c="mute">{e.note}</Txt> : null}</View><Pressable onPress={() => setSwap(i)} accessibilityLabel={'Swap ' + exName(e.exId)} hitSlop={8}><Icon name="swap" color={t.mute} size={20} /></Pressable><Pressable onPress={() => setInfo(e.exId)} accessibilityLabel="Exercise details" hitSlop={8}><Icon name="info" color={t.mute} size={20} /></Pressable></Row></Card>)}
        {d.day.cooldown.length ? <Card pad={14}><Txt v="label" c="sub">Cool-down</Txt><Txt v="small">{d.day.cooldown.map((w: any) => exName(w.exId) + (w.secs ? ' ' + w.secs + 's' : '')).join(' → ')}</Txt></Card> : null}
        {d.day.why?.length ? <Card pad={14}><Txt v="label" c="sub">Why this workout</Txt>{d.day.why.map((w: string, i: number) => <Txt key={i} v="small">• {w}</Txt>)}</Card> : null}
        <Btn label={d.run ? 'Continue workout' : 'Start workout'} icon="play" onPress={start} />
      </> : <Card><Txt v="h2">Rest day</Txt><Txt c="sub">Your next session: {d.next}.</Txt></Card>}
      {d.asg.length ? <Section title="From your gym">{d.asg.map((x) => <Card key={x.assignment.id}><Txt v="h3">{x.programme!.name}</Txt><Txt v="small" c="sub">{x.assignment.note}</Txt><Gap h={8} /><Row wrap>{x.programme!.days.map((dd, i) => <Chip key={i} label={dd.title} icon="play" onPress={() => act(() => { W.startRun(repo, actor, { kind: 'programme', programmeId: x.programme!.id, dayIndex: i }); nav.push('run'); })} />)}</Row></Card>)}</Section> : null}
      <Btn label="Analyse an exercise with the camera" icon="camera" kind="ghost" onPress={() => nav.push('camPick')} />
      <ExerciseSheet exId={info} onClose={() => setInfo(null)} />
      <Sheet visible={swap != null} onClose={() => setSwap(null)} title="Swap exercise">
        <Txt c="sub">Alternatives that fit your equipment and limits:</Txt>
        {alts.length ? alts.map((a) => <ListItem key={a.id} title={a.name} sub={a.cat + ' · ' + (a.eq.join(', ') || 'no equipment')} onPress={() => { act(() => W.swapExercise(repo, actor, d.day!.dow!, swap!, a.id), 'Swapped'); setSwap(null); }} />) : <Txt>No safe alternatives are available for this exercise.</Txt>}
      </Sheet>
    </View>
  );
}
function WeekTab() {
  const { repo, actor, theme: t } = useApp(); const act = useAct(); const [mv, setMv] = useState<number | null>(null);
  const d = useData(() => W.getPlanDoc(repo, actor));
  if (!d) return <Empty title="No plan yet" />;
  const free = [1, 2, 3, 4, 5, 6, 0].filter((x) => !d.plan.days.some((y) => y.dow === x));
  return (
    <View style={{ gap: 10 }}>
      <Card pad={14}><Txt v="label" c="sub">Plan version {d.plan.version}</Txt><Txt v="small">{d.plan.summary}</Txt>{d.plan.changes?.length ? d.plan.changes.map((c: string, i: number) => <Txt key={i} v="small" c="accent">• {c}</Txt>) : null}</Card>
      {[1, 2, 3, 4, 5, 6, 0].map((dow) => { const day = d.plan.days.find((x) => x.dow === dow); return (
        <Card key={dow} pad={14}><Row between><View style={{ flex: 1 }}><Txt v="label" c={day ? 'accent' : 'mute'}>{DL[dow]}</Txt><Txt v="h3">{day ? day.title : 'Rest'}</Txt>{day ? <Txt v="small" c="sub" numberOfLines={2}>{day.exercises.map((e) => exName(e.exId)).join(', ')}</Txt> : null}</View>{day ? <Btn label="Move" kind="ghost" small full={false} onPress={() => setMv(dow)} /> : null}</Row></Card>); })}
      <Row><View style={{ flex: 1 }}><Btn label="Rebuild" kind="ghost" onPress={() => act(() => W.buildPlan(repo, actor, { reason: 'Rebuilt on request' }), 'Plan rebuilt (same exercises)')} /></View><View style={{ flex: 1 }}><Btn label="Shuffle" kind="ghost" onPress={() => act(() => W.buildPlan(repo, actor, { reason: 'New variation requested', reshuffle: true, changes: ['New exercise variation on request.'] }), 'New variation created')} /></View></Row>
      {d.revisions.length ? <Section title="Plan history">{d.revisions.slice().reverse().map((r, i) => <Card key={i} pad={12}><Txt v="small" style={{ fontWeight: '800' }}>v{r.version} · {new Date(r.at).toDateString()}</Txt><Txt v="small" c="sub">{r.reason}{r.changes.length ? ' — ' + r.changes.join(' ') : ''}</Txt></Card>)}</Section> : null}
      <Sheet visible={mv != null} onClose={() => setMv(null)} title="Move workout to">{free.map((x) => <ListItem key={x} title={DL[x]} onPress={() => { act(() => W.moveDay(repo, actor, mv!, x), 'Moved to ' + DL[x]); setMv(null); }} />)}{!free.length ? <Txt>Every day already has a workout.</Txt> : null}</Sheet>
    </View>
  );
}
export function LibraryList() {
  const { theme: t, repo, actor } = useApp(); const [q, setQ] = useState(''); const [cat, setCat] = useState('All'); const [eqf, setEqf] = useState('any'); const [cam, setCam] = useState(false); const [sel, setSel] = useState<string | null>(null);
  const cats = useData(() => ['All', ...A.categories(repo, actor)]);
  const list = useData(() => EXERCISES.filter((e) => !e.off).filter((e) => (cat === 'All' || e.cat === cat) && (eqf === 'any' || (eqf === 'none' ? e.eq.length === 0 : e.eq.includes(eqf))) && (!cam || e.an) && (!q.trim() || (e.name + ' ' + e.muscles.join(' ') + ' ' + e.cat).toLowerCase().includes(q.toLowerCase()))), [q, cat, eqf, cam]);
  return (
    <View style={{ gap: 12 }}>
      <Field value={q} onChangeText={setQ} placeholder="Search exercises or muscles" />
      <Row wrap>{cats.map((c) => <Chip key={c} label={c} on={cat === c} onPress={() => setCat(c)} />)}</Row>
      <Row wrap><Chip label="Any equipment" on={eqf === 'any'} onPress={() => setEqf('any')} /><Chip label="No equipment" on={eqf === 'none'} onPress={() => setEqf('none')} /><Chip label="Dumbbells" on={eqf === 'dumbbells'} onPress={() => setEqf('dumbbells')} /><Chip label="Gym" on={eqf === 'gym'} onPress={() => setEqf('gym')} /><Chip label="Camera-analysed" icon="camera" on={cam} onPress={() => setCam(!cam)} /></Row>
      <Txt v="small" c="mute">{list.length} exercises</Txt>
      {list.length ? list.map((e) => <Card key={e.id} pad={4} onPress={() => setSel(e.id)}><ListItem title={e.name} sub={e.cat + ' · ' + e.muscles.slice(0, 3).join(', ') + ' · ' + (e.eq.join(', ') || 'no equipment')} icon={e.an ? 'camera' : 'dumbbell'} /></Card>) : <Empty icon="search" title="No matches" text="Try a different search or clear a filter." />}
      <ExerciseSheet exId={sel} onClose={() => setSel(null)} />
    </View>
  );
}
function HistoryTab() {
  const { repo, actor } = useApp(); const [sel, setSel] = useState<any>(null);
  const d = useData(() => ({ ws: W.listWorkouts(repo, actor).slice().reverse(), cam: W.listCameraSessions(repo, actor) }));
  if (!d.ws.length && !d.cam.length) return <Empty icon="clock" title="No workouts yet" text="Finish your first workout and it will show up here." />;
  return (
    <View style={{ gap: 10 }}>
      {d.ws.map((w) => <Card key={w.id} onPress={() => setSel(w)} pad={14}><Row between><View style={{ flex: 1 }}><Txt v="h3">{w.title}</Txt><Txt v="small" c="sub">{new Date(w.at).toDateString()} · {Math.round((w.durationSec || 0) / 60)} min · {w.exercises.reduce((s: number, e: any) => s + e.sets.filter((x: any) => x.done).length, 0)} sets</Txt></View>{w.exercises.some((e: any) => e.pain) ? <Pill label="Pain flagged" tone="warn" /> : null}</Row></Card>)}
      {d.cam.length ? <Section title="Camera sessions">{d.cam.map((c: any) => <Card key={c.id} pad={14}><Txt v="h3">{exName(c.exId)}</Txt><Txt v="small" c="sub">{new Date(c.at).toDateString()} · {c.reps} reps ({c.cleanReps} clean) · {c.usablePct}% frames analysable · estimate</Txt></Card>)}</Section> : null}
      <Sheet visible={!!sel} onClose={() => setSel(null)} title={sel?.title}>{sel ? <><Txt c="sub">{new Date(sel.at).toDateString()} · {Math.round(sel.durationSec / 60)} min{sel.fatigue ? ' · felt fatigued' : ''}</Txt>{sel.exercises.map((e: any, i: number) => <Card key={i} pad={12}><Txt v="h3">{exName(e.exId)}{e.skipped ? ' (skipped)' : ''}</Txt>{e.replacedFrom ? <Txt v="small" c="mute">Replaced {exName(e.replacedFrom)}</Txt> : null}<Txt v="small" c="sub">{e.sets.map((s: any) => (s.done ? '✓ ' : '✗ ') + (s.secs ? s.secs + 's' : s.reps) + (s.weight ? '×' + s.weight + 'kg' : '')).join('   ')}</Txt></Card>)}</> : null}</Sheet>
    </View>
  );
}

/* ------------------------------ RUNNER ------------------------------ */
export function Runner() {
  const { repo, actor, theme: t, toast } = useApp(); const nav = useNav(); const act = useAct();
  const [run, setRun] = useState<W.Run | undefined>(() => W.getRun(repo, actor)); const [ei, setEi] = useState(0); const [rest, setRest] = useState(0); const [fin, setFin] = useState(false); const [res, setRes] = useState<W.FinishResult | null>(null); const [swap, setSwap] = useState(false); const [info, setInfo] = useState<string | null>(null);
  const [tick, setTick] = useState(0); const [rating, setRating] = useState<'tooEasy' | 'ok' | 'tooHard'>('ok'); const [fatigue, setFatigue] = useState(false); const [dizzy, setDizzy] = useState(false);
  useEffect(() => { const id = setInterval(() => { setTick((x) => x + 1); setRest((r) => (r > 0 ? r - 1 : 0)); }, 1000); return () => clearInterval(id); }, []);
  const prof: any = useMemo(() => repo.get(actor, 'profile', actor.id), []);
  if (!run) return <Screen><Header title="Workout" onBack={nav.pop} /><Empty title="No workout in progress" action="Back" onAction={nav.pop} /></Screen>;
  const save = (r: W.Run) => { W.saveRun(repo, actor, r); setRun({ ...r }); };
  const now = Date.now(); const elapsed = W.runElapsedSec(run, now); const paused = !!run.pausedAt; const e = run.exercises[ei]; const ex = EX[e.exId];
  const doneSets = run.exercises.reduce((s, x) => s + x.sets.filter((y) => y.done).length, 0), totalSets = run.exercises.reduce((s, x) => s + x.sets.length, 0);
  const alts: any[] = swap ? FIT.alternativesFor(ex, prof, W.getPlanDoc(repo, actor)?.plan || { days: [] }) : [];
  const adj = (si: number, k: 'reps' | 'weight' | 'secs', dlt: number) => { const s = e.sets[si]; (s as any)[k] = Math.max(0, Math.round(((s as any)[k] + dlt) * 10) / 10); save(run); };
  const complete = (si: number) => { const s = e.sets[si]; if (s.done) W.undoSet(run, ei, si); else { W.completeSet(run, ei, si); setRest(e.planned.rest); } save(run); };
  const finish = () => { try { const r = W.finishRun(repo, actor, run, { rating, fatigue, dizzy }); setFin(false); setRes(r); } catch (err: any) { toast(err.message, 'bad'); } };
  const mm = (s: number) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  return (
    <Screen>
      <Header title={run.title} sub={(paused ? 'Paused · ' : '') + mm(elapsed)} onBack={() => { toast('Workout saved as a draft. Resume it any time.', 'info'); nav.pop(); }} right={<Pressable onPress={() => { paused ? W.resumeRun(run, Date.now()) : W.pauseRun(run, Date.now()); save(run); }} accessibilityLabel={paused ? 'Resume' : 'Pause'} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}><Icon name={paused ? 'play' : 'pause'} color={t.accentText} /></Pressable>} />
      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surface2, overflow: 'hidden' }}><View style={{ width: (totalSets ? (doneSets / totalSets) * 100 : 0) + '%', height: 6, backgroundColor: t.accent }} /></View>
      <Gap />
      <Row wrap>{run.exercises.map((x, i) => <Pressable key={i} onPress={() => setEi(i)} accessibilityLabel={'Exercise ' + (i + 1)} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: i === ei ? t.accent : x.skipped ? t.surface2 : x.sets.every((s) => s.done) ? t.good + '44' : t.surface, borderWidth: 1, borderColor: t.border }}><Txt v="small" style={{ fontWeight: '800', color: i === ei ? t.onAccent : t.text }}>{i + 1}</Txt></Pressable>)}</Row>
      <Gap />
      {rest > 0 && !paused ? <Card accent pad={14}><Row between><View><Txt v="label" c="onAccent">Rest</Txt><Txt v="num" c="onAccent">{rest}s</Txt></View><Btn label="Skip rest" kind="soft" small full={false} onPress={() => setRest(0)} /></Row></Card> : null}
      <Gap />
      <Card>
        <Row between><View style={{ flex: 1 }}><Txt v="label" c="accent">Exercise {ei + 1} of {run.exercises.length}</Txt><Txt v="h1">{ex?.name}</Txt></View><Pressable onPress={() => setInfo(e.exId)} accessibilityLabel="How to do it"><Icon name="info" color={t.mute} /></Pressable></Row>
        <Txt v="small" c="sub">{dose(e.planned)} planned · rest {e.planned.rest}s{e.replacedFrom ? ' · replaced ' + exName(e.replacedFrom) : ''}</Txt>
        {e.suggest ? <Txt v="small" c="accent">Suggested load: {e.suggest.kg} kg. {e.suggest.why}</Txt> : null}
        {e.skipped ? <Callout tone="info">Skipped. Tap a set to un-skip.</Callout> : null}
        <Gap />
        {e.sets.map((s, si) => (
          <Row key={si} between style={{ paddingVertical: 8, opacity: e.skipped ? 0.4 : 1 }}>
            <Txt v="h3" style={{ width: 24 }}>{si + 1}</Txt>
            {ex?.d?.secs !== undefined || e.planned.secs ? <Stepper value={s.secs} unit="s" step={5} onDec={() => adj(si, 'secs', -5)} onInc={() => adj(si, 'secs', 5)} /> : <Stepper value={s.reps} unit="reps" step={1} onDec={() => adj(si, 'reps', -1)} onInc={() => adj(si, 'reps', 1)} />}
            {W.suggestWeight([], e.exId) === null && (e.suggest || s.weight > 0 || ex?.eq.length) ? <Stepper value={s.weight} unit="kg" step={2.5} onDec={() => adj(si, 'weight', -2.5)} onInc={() => adj(si, 'weight', 2.5)} /> : null}
            <Pressable onPress={() => complete(si)} accessibilityRole="checkbox" accessibilityState={{ checked: s.done }} accessibilityLabel={'Set ' + (si + 1) + ' done'} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: s.done ? t.accent : t.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" color={s.done ? t.onAccent : t.mute} /></Pressable>
          </Row>
        ))}
      </Card>
      <Gap />
      <Row wrap>
        <Chip label="Skip exercise" icon="skip" onPress={() => { W.skipExercise(run, ei); save(run); if (ei < run.exercises.length - 1) setEi(ei + 1); }} />
        <Chip label="Replace" icon="swap" onPress={() => setSwap(true)} />
        <Chip label={e.pain ? 'Pain flagged' : 'It hurts'} icon="alert" on={!!e.pain} onPress={() => { e.pain = !e.pain; save(run); if (e.pain) toast('Stop this exercise. Do not train through pain. See a professional if it continues.', 'bad'); }} />
      </Row>
      <Gap h={20} />
      <Row><View style={{ flex: 1 }}><Btn label="Previous" kind="ghost" disabled={ei === 0} onPress={() => setEi(ei - 1)} /></View><View style={{ flex: 1 }}>{ei < run.exercises.length - 1 ? <Btn label="Next" onPress={() => setEi(ei + 1)} /> : <Btn label="Finish" icon="check" onPress={() => setFin(true)} />}</View></Row>
      <Gap />
      <Btn label="Finish workout now" kind="ghost" onPress={() => setFin(true)} />
      <Btn label="Discard workout" kind="danger" style={{ marginTop: 10 }} onPress={() => { W.discardRun(repo, actor); nav.pop(); }} />
      <ExerciseSheet exId={info} onClose={() => setInfo(null)} />
      <Sheet visible={swap} onClose={() => setSwap(false)} title="Replace exercise">{alts.length ? alts.map((a) => <ListItem key={a.id} title={a.name} sub={a.cat} onPress={() => { W.replaceExercise(run, ei, a.id, W.listWorkouts(repo, actor)); save(run); setSwap(false); }} />) : <Txt>No safe alternatives found.</Txt>}</Sheet>
      <Sheet visible={fin} onClose={() => setFin(false)} title="How did it feel?">
        <Row wrap>{[['tooEasy', 'Too easy'], ['ok', 'Just right'], ['tooHard', 'Too hard']].map(([k, l]) => <Chip key={k} label={l} on={rating === k} onPress={() => setRating(k as any)} />)}</Row>
        <Row wrap><Chip label="I felt very tired" on={fatigue} onPress={() => setFatigue(!fatigue)} /><Chip label="I felt dizzy" on={dizzy} onPress={() => setDizzy(!dizzy)} /></Row>
        {dizzy ? <Callout tone="bad">Dizziness while exercising matters. Stop, rest, and speak to a doctor if it happens again.</Callout> : null}
        <Txt v="small" c="sub">{doneSets} of {totalSets} sets completed. Skipped exercises are recorded as skipped.</Txt>
        <Btn label="Save workout" icon="check" onPress={finish} />
      </Sheet>
      <Sheet visible={!!res} onClose={() => { setRes(null); nav.pop(); }} title="Workout complete">
        {res ? <><Txt c="sub">{Math.round(res.session.durationSec / 60)} min · {res.session.exercises.reduce((s: number, x: any) => s + x.sets.filter((y: any) => y.done).length, 0)} sets logged</Txt>{res.prs.map((p, i) => <Callout key={i} tone="good" title="Personal best">{p}</Callout>)}{res.changes.map((c, i) => <Callout key={i} tone="info" title="Plan adjusted">{c}</Callout>)}{res.advisories.map((c, i) => <Callout key={i} tone="warn">{c}</Callout>)}<Btn label="Done" onPress={() => { setRes(null); nav.pop(); }} /></> : null}
      </Sheet>
    </Screen>
  );
}
function Stepper({ value, unit, onDec, onInc }: { value: number; unit: string; step: number; onDec: () => void; onInc: () => void }) {
  const { theme: t } = useApp();
  return <Row gap={4}><Pressable onPress={onDec} accessibilityLabel={'Decrease ' + unit} hitSlop={6} style={{ width: 30, height: 36, alignItems: 'center', justifyContent: 'center' }}><Txt v="h2" c="sub">−</Txt></Pressable><View style={{ minWidth: 46, alignItems: 'center' }}><Txt v="h3">{value}</Txt><Txt v="small" c="mute" style={{ fontSize: 10 }}>{unit}</Txt></View><Pressable onPress={onInc} accessibilityLabel={'Increase ' + unit} hitSlop={6} style={{ width: 30, height: 36, alignItems: 'center', justifyContent: 'center' }}><Txt v="h2" c="sub">+</Txt></Pressable></Row>;
}
function LibraryScreen() { const nav = useNav(); return <Screen><Header title="Exercise library" onBack={nav.pop} /><LibraryList /></Screen>; }
registerScreens({ home: Home, train: Train, run: Runner, library: LibraryScreen });
