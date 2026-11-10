import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useApp, useAct } from '../app/context';
import { Screen, Txt, Card, Btn, Field, Row, Gap, Chip, Pill, Callout, Sheet, Toggle, Segmented, Header, DemoBadge } from '../ui/kit';
import { Icon } from '../ui/icons';
import * as S from '../services/session';
import * as W from '../services/workouts';
import { DEMO } from '../db/seed';
import type { Role } from '../db/repo';

const ROLES: { role: Role; title: string; blurb: string; icon: string; cred: { username: string; password: string } }[] = [
  { role: 'user', title: 'User', blurb: 'Workouts, camera coach, nutrition, progress', icon: 'activity', cred: DEMO.user },
  { role: 'gym', title: 'Gym', blurb: 'Members, programmes, staff, billing (demo)', icon: 'building', cred: DEMO.gym },
  { role: 'admin', title: 'Admin', blurb: 'Platform control, content, reports, reset', icon: 'shield', cred: DEMO.admin }
];

export function LoginScreen() {
  const { repo, setSession, theme: t, toast } = useApp();
  const [role, setRole] = useState<Role>('user'); const [un, setUn] = useState(DEMO.user.username); const [pw, setPw] = useState(DEMO.user.password); const [err, setErr] = useState(''); const [signup, setSignup] = useState(false);
  const pick = (r: typeof ROLES[number]) => { setRole(r.role); setUn(r.cred.username); setPw(r.cred.password); setErr(''); };
  const go = () => { try { const s = S.login(repo, un, pw); S.rememberSession(repo, s); setSession(s); } catch (e: any) { setErr(e.message); } };
  return (
    <Screen>
      <Gap h={24} />
      <Row between><View><Txt v="label" c="accent">Fitness · Gym · Coach</Txt><Txt v="huge">KINETIC{'\n'}COACH</Txt></View><DemoBadge /></Row>
      <Gap h={8} /><Txt c="sub">Choose how you want to explore the app. Everything is stored on this phone.</Txt>
      <Gap h={20} />
      <View style={{ gap: 10 }}>
        {ROLES.map((r) => { const on = role === r.role; return (
          <Pressable key={r.role} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => pick(r)}>
            <Card accent={on} pad={14}><Row gap={14}><View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: on ? t.onAccent : t.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon name={r.icon} color={on ? t.accent : t.accentText} /></View><View style={{ flex: 1 }}><Txt v="h2" c={on ? 'onAccent' : undefined}>{r.title}</Txt><Txt v="small" style={{ color: on ? t.onAccent : t.sub }}>{r.blurb}</Txt></View></Row></Card>
          </Pressable>); })}
      </View>
      <Gap h={20} />
      <View style={{ gap: 12 }}>
        <Field label="Username" value={un} onChangeText={(s) => { setUn(s); setErr(''); }} />
        <Field label="Password" value={pw} onChangeText={(s) => { setPw(s); setErr(''); }} secure error={err} />
        <Btn label="Log in" onPress={go} icon="right" />
      </View>
      <Gap h={12} />
      <Btn label="Create a customer profile" kind="ghost" onPress={() => setSignup(true)} />
      <Gap h={16} />
      <Callout tone="warn" title="Prototype accounts">These demo logins live only on this device and are not production security. Demo credentials are pre-filled for each role: admin / admin123, gym / gym123, user / user123.</Callout>
      <SignUpSheet visible={signup} onClose={() => setSignup(false)} />
    </Screen>
  );
}
function SignUpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { repo, setSession } = useApp(); const [n, setN] = useState(''); const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState('');
  const go = () => { try { if (!n.trim()) throw new Error('Enter your name.'); const s = S.signUpCustomer(repo, { username: u, password: p, displayName: n }); S.rememberSession(repo, s); setSession(s); } catch (e: any) { setErr(e.message); } };
  return <Sheet visible={visible} onClose={onClose} title="New customer profile"><Field label="Your name" value={n} onChangeText={setN} autoCap="words" /><Field label="Username" value={u} onChangeText={setU} hint="3-24 letters, numbers, dots or dashes" /><Field label="Password" value={p} onChangeText={setP} secure error={err} hint="Local prototype password" /><Btn label="Create profile" onPress={go} /></Sheet>;
}

/* ---------------- onboarding ---------------- */
const GOALS = [['strength', 'Get stronger'], ['muscle', 'Build muscle'], ['weight', 'Lose weight'], ['endurance', 'Endurance'], ['general', 'General fitness'], ['mobility', 'Mobility']];
const EQUIP = [['dumbbells', 'Dumbbells'], ['bands', 'Resistance bands'], ['kettlebell', 'Kettlebell'], ['barbell', 'Barbell'], ['bench', 'Bench'], ['pullup', 'Pull-up bar'], ['treadmill', 'Treadmill']];
const AREAS = ['knee', 'back', 'shoulder', 'wrist', 'elbow', 'hip', 'ankle', 'neck'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function Onboarding({ editing, onDone }: { editing?: boolean; onDone?: () => void }) {
  const { repo, actor, bump, toast, session } = useApp(); const act = useAct();
  const old: any = repo.get(actor, 'profile', actor.id);
  const [step, setStep] = useState(0); const [err, setErr] = useState('');
  const [f, setF] = useState<any>(() => old ? { ...old, h: String(old.heightCm), w: String(old.weightKg), a: String(old.age), units: old.units || 'metric' } : { name: session.account.displayName.split(' ')[0], a: '', h: '', w: '', units: 'metric', sex: null, goals: ['general'], experience: 'beginner', env: 'home', equipment: [], daysPerWeek: 3, sessionMin: 40, restDays: [], limits: { areas: [], painNow: false, medical: false }, ack: false, consents: { camera: true, dataLocal: true }, baseline: {}, activity: 'moderate' });
  const set = (k: string, v: any) => { setF((x: any) => ({ ...x, [k]: v })); setErr(''); };
  const toggle = (k: string, v: string) => set(k, f[k].includes(v) ? f[k].filter((x: string) => x !== v) : [...f[k], v]);
  const imp = f.units === 'imperial';
  const heightCm = () => (imp ? Math.round(parseFloat(f.h) * 2.54) : parseFloat(f.h)), weightKg = () => (imp ? Math.round(parseFloat(f.w) * 0.4536 * 10) / 10 : parseFloat(f.w));
  const validate = (): string => {
    if (step === 0) { if (!f.name.trim()) return 'Please enter your first name.'; const a = parseInt(f.a, 10); if (!(a >= 14 && a <= 90)) return 'Enter an age between 14 and 90.'; if (!(heightCm() >= 120 && heightCm() <= 230)) return 'Height looks off. Check the number and unit.'; if (!(weightKg() >= 30 && weightKg() <= 250)) return 'Weight looks off. Check the number and unit.'; }
    if (step === 1 && !f.goals.length) return 'Pick at least one goal.';
    if (step === 3 && f.restDays.length > 7 - 2) return 'Leave at least two days available for training.';
    if (step === 4 && !f.ack) return 'Please tick the box to confirm you have read the safety note.';
    return '';
  };
  const next = () => { const e = validate(); if (e) return setErr(e); if (step < 5) setStep(step + 1); else finish(); };
  const finish = () => act(() => {
    const prof = { id: actor.id, ownerId: actor.id, name: f.name.trim(), age: parseInt(f.a, 10), heightCm: heightCm(), weightKg: weightKg(), units: f.units, sex: f.sex, activity: f.activity, goals: f.goals, experience: f.experience, env: f.env, equipment: f.env === 'gym' ? [] : f.equipment, daysPerWeek: Math.min(f.daysPerWeek, 7 - f.restDays.length), sessionMin: f.sessionMin, restDays: f.restDays, limits: f.limits, consents: f.consents, baseline: f.baseline };
    repo.put(actor, 'profile', prof);
    const had = !!W.getPlanDoc(repo, actor);
    W.buildPlan(repo, actor, { reason: had ? 'Profile updated' : 'Initial plan', changes: had ? ['Plan rebuilt from your updated profile.'] : [] });
    onDone?.();
  }, editing ? 'Profile saved' : 'Your plan is ready');
  const titles = ['About you', 'Your goals', 'Experience and equipment', 'Schedule', 'Safety and limits', 'Privacy and review'];
  const lim = f.limits;
  return (
    <Screen>
      <Header title={titles[step]} sub={'Step ' + (step + 1) + ' of 6'} onBack={step > 0 ? () => setStep(step - 1) : editing ? onDone : undefined} />
      <View style={{ height: 6, borderRadius: 3, backgroundColor: '#8883', overflow: 'hidden', marginBottom: 20 }}><View style={{ width: (((step + 1) / 6) * 100 + '%') as any, height: 6, backgroundColor: '#C6F432' }} /></View>
      <View style={{ gap: 14 }}>
        {step === 0 && <>
          <Field label="First name" value={f.name} onChangeText={(v) => set('name', v)} autoCap="words" />
          <Segmented options={[{ key: 'metric', label: 'kg / cm' }, { key: 'imperial', label: 'lb / in' }]} value={f.units} onChange={(v) => set('units', v)} />
          <Row gap={10}><View style={{ flex: 1 }}><Field label="Age" value={f.a} onChangeText={(v) => set('a', v)} keyboard="number-pad" /></View><View style={{ flex: 1 }}><Field label={'Height (' + (imp ? 'in' : 'cm') + ')'} value={f.h} onChangeText={(v) => set('h', v)} keyboard="decimal-pad" /></View><View style={{ flex: 1 }}><Field label={'Weight (' + (imp ? 'lb' : 'kg') + ')'} value={f.w} onChangeText={(v) => set('w', v)} keyboard="decimal-pad" /></View></Row>
          <Txt v="label" c="sub">Sex (optional)</Txt>
          <Row wrap>{[['female', 'Female'], ['male', 'Male'], [null, 'Prefer not to say']].map(([k, l]: any) => <Chip key={String(k)} label={l} on={f.sex === k} onPress={() => set('sex', k)} />)}</Row>
          <Txt v="small" c="mute">Why we ask: sex is only used to make your calorie estimate a little more accurate. Leave it blank and we use a neutral estimate. It never changes your workouts.</Txt>
        </>}
        {step === 1 && <><Txt c="sub">Pick everything that matters. Your plan balances them.</Txt><Row wrap>{GOALS.map(([k, l]) => <Chip key={k} label={l} on={f.goals.includes(k)} onPress={() => toggle('goals', k)} />)}</Row></>}
        {step === 2 && <>
          <Txt v="label" c="sub">Experience</Txt><Segmented options={[{ key: 'beginner', label: 'Beginner' }, { key: 'intermediate', label: 'Intermediate' }, { key: 'advanced', label: 'Advanced' }]} value={f.experience} onChange={(v) => set('experience', v)} />
          <Txt v="label" c="sub">Where do you train?</Txt><Segmented options={[{ key: 'home', label: 'Home' }, { key: 'gym', label: 'Gym' }, { key: 'both', label: 'Both' }]} value={f.env} onChange={(v) => set('env', v)} />
          {f.env !== 'gym' && <><Txt v="label" c="sub">Equipment at home (optional)</Txt><Row wrap>{EQUIP.map(([k, l]) => <Chip key={k} label={l} on={f.equipment.includes(k)} onPress={() => toggle('equipment', k)} />)}</Row></>}
        </>}
        {step === 3 && <>
          <Txt v="label" c="sub">Days per week: {f.daysPerWeek}</Txt><Row wrap>{[2, 3, 4, 5, 6].map((d) => <Chip key={d} label={String(d)} on={f.daysPerWeek === d} onPress={() => set('daysPerWeek', d)} />)}</Row>
          <Txt v="label" c="sub">Minutes per session</Txt><Row wrap>{[20, 30, 40, 50, 60].map((d) => <Chip key={d} label={d + ' min'} on={f.sessionMin === d} onPress={() => set('sessionMin', d)} />)}</Row>
          <Txt v="label" c="sub">Days you cannot train (optional)</Txt><Row wrap>{DAYS.map((d, i) => <Chip key={d} label={d} on={f.restDays.includes(i)} onPress={() => set('restDays', f.restDays.includes(i) ? f.restDays.filter((x: number) => x !== i) : [...f.restDays, i])} />)}</Row>
        </>}
        {step === 4 && <>
          <Callout tone="info" title="Safety first">This app gives general fitness guidance, not medical advice. It cannot diagnose anything. If you have pain, an injury, a medical condition or are unsure, check with a doctor or physiotherapist first.</Callout>
          <Txt v="label" c="sub">Areas to protect (optional)</Txt><Row wrap>{AREAS.map((a) => <Chip key={a} label={a} on={lim.areas.includes(a)} onPress={() => set('limits', { ...lim, areas: lim.areas.includes(a) ? lim.areas.filter((x: string) => x !== a) : [...lim.areas, a] })} />)}</Row>
          <Toggle label="I have pain right now" sub="Your plan will be gentle mobility and light work only." value={lim.painNow} onChange={(v) => set('limits', { ...lim, painNow: v })} />
          <Toggle label="A doctor has restricted my exercise" sub="Same safe mode. Follow your doctor's advice." value={lim.medical} onChange={(v) => set('limits', { ...lim, medical: v })} />
          {(lim.painNow || lim.medical) && <Callout tone="warn">Because of this, you will get a restricted plan. Please see a qualified professional about the pain or restriction before increasing activity.</Callout>}
          <Toggle label="I have read this safety note" value={f.ack} onChange={(v) => set('ack', v)} />
        </>}
        {step === 5 && <>
          <Toggle label="Allow camera for movement analysis" sub="Only asked when you start a camera session. Video is processed on the phone and never saved or uploaded." value={f.consents.camera} onChange={(v) => set('consents', { ...f.consents, camera: v })} />
          <Card><Txt v="h3">Your summary</Txt><Gap h={6} /><Txt c="sub">{f.name || 'You'}, {f.a} years, {Math.round(heightCm() || 0)} cm, {weightKg() || 0} kg{'\n'}Goals: {f.goals.join(', ')}{'\n'}{f.experience} · {f.env} · {f.daysPerWeek} days × {f.sessionMin} min{'\n'}Limits: {lim.painNow || lim.medical ? 'restricted plan' : lim.areas.length ? 'protecting ' + lim.areas.join(', ') : 'none reported'}</Txt></Card>
          <Txt v="small" c="mute">You can change all of this later in Profile. Your calorie and protein targets are rough estimates.</Txt>
        </>}
      </View>
      <Gap h={20} />
      {err ? <><Callout tone="bad">{err}</Callout><Gap /></> : null}
      <Btn label={step < 5 ? 'Continue' : editing ? 'Save changes' : 'Build my plan'} onPress={next} icon={step < 5 ? 'right' : 'check'} />
    </Screen>
  );
}
