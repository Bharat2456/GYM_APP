import React, { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import FIT, { ymd } from '../engine';
import { useApp, useData, useAct } from '../app/context';
import { useNav, registerScreens } from '../app/nav';
import { Screen, Header, Txt, Card, Btn, Row, Gap, Chip, Pill, Section, ListItem, Empty, Segmented, Sheet, Callout, Toggle, Field, Divider } from '../ui/kit';
import { Icon } from '../ui/icons';
import * as W from '../services/workouts';
import * as G from '../services/gym';
import * as P from '../services/payments';
import * as NT from '../services/notifications';
import * as B from '../services/backup';
import { DEFAULT_AI, loadAiConfig, saveAiConfig, notifier, shareJson, pickJson } from '../app/platform';
import { QrScanner } from '../camera/QrScanner';
import { DEFAULT_ORIENT } from '../camera/movenet';

const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const dt = (ms?: number) => (ms ? new Date(ms).toDateString() : '—');

/* ------------------------------ PROFILE / SETTINGS ------------------------------ */
export function Profile() {
  const { repo, actor, session, theme: t, themeMode, setThemeMode, setSession, confirm, toast, reloadLlm, llm, bump } = useApp(); const nav = useNav(); const act = useAct();
  const d = useData(() => ({ prof: repo.get(actor, 'profile', actor.id) as any, prefs: NT.getPrefs(repo, actor), orient: (repo.getKV(actor, actor.id, 'camOrient') || DEFAULT_ORIENT) as { rotate: number; mirror: boolean } }));
  const [ed, setEd] = useState(false); const [name, setName] = useState(''); const [days, setDays] = useState('3'); const [mins, setMins] = useState('45'); const [wt, setWt] = useState('');
  const [aiOpen, setAiOpen] = useState(false); const [key, setKey] = useState(''); const [model, setModel] = useState(DEFAULT_AI.model); const [base, setBase] = useState(DEFAULT_AI.baseUrl);
  const [busy, setBusy] = useState(false); const [imp, setImp] = useState<any>(null);
  useEffect(() => { loadAiConfig().then((c) => { if (c) { setModel(c.model); setBase(c.baseUrl); } }); }, []);
  const openEdit = () => { setName(d.prof?.name || ''); setDays(String(d.prof?.daysPerWeek || 3)); setMins(String(d.prof?.sessionMin || 45)); setWt(String(d.prof?.weightKg || '')); setEd(true); };
  const saveProfile = () => { const dpw = Math.round(num(days)), sm = Math.round(num(mins)), w = num(wt); const ok = act(() => { if (!name.trim()) throw new Error('Enter your name.'); if (!(dpw >= 1 && dpw <= 7)) throw new Error('Days per week must be 1 to 7.'); if (!(sm >= 15 && sm <= 120)) throw new Error('Session length must be 15 to 120 minutes.'); if (!(w >= 25 && w <= 400)) throw new Error('Enter a weight between 25 and 400 kg.'); repo.put(actor, 'profile', { ...d.prof, name: name.trim(), daysPerWeek: dpw, sessionMin: sm, weightKg: w } as any); W.buildPlan(repo, actor, { reason: 'Profile updated', changes: ['Plan rebuilt from your updated profile.'] }); return true; }, 'Profile saved, plan updated'); if (ok) setEd(false); };
  const setPref = (p: Partial<NT.NotifPrefs>) => act(() => NT.setPrefs(repo, actor, p));
  const applyNotifs = async () => { setBusy(true); try { const r = await NT.applyReminders(notifier, NT.buildReminders(repo, actor)); toast(r.permission ? r.scheduled + ' reminders scheduled on this device' : 'Notification permission was not granted, so no reminders are scheduled.', r.permission ? 'good' : 'info'); } catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); } };
  const saveAi = async (clear = false) => { try { await saveAiConfig(clear ? null : { baseUrl: base.trim() || DEFAULT_AI.baseUrl, model: model.trim() || DEFAULT_AI.model, apiKey: key.trim() }); setKey(''); reloadLlm(); setAiOpen(false); toast(clear ? 'AI key removed' : 'AI key saved to the device keystore', 'good'); } catch (e: any) { toast(e.message, 'bad'); } };
  const exportData = async () => { setBusy(true); try { await shareJson('kinetic-my-data-' + ymd(repo.now()) + '.json', B.exportMine(repo, actor)); } catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); } };
  const pickImport = async () => { try { const j = await pickJson(); if (j) setImp(j); } catch (e: any) { toast(e.message, 'bad'); } };
  const sw = (k: string, label: string, sub?: string) => <Toggle label={label} sub={sub} value={!!(d.prefs as any)[k]} onChange={(v) => setPref({ [k]: v } as any)} />;
  return (
    <Screen>
      <Header title="Profile" sub={session.account.displayName} onBack={nav.pop} />
      <Card><Row gap={14}><View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}><Txt v="h1" c="onAccent">{(d.prof?.name || session.account.displayName)[0]}</Txt></View><View style={{ flex: 1 }}><Txt v="h2">{d.prof?.name || session.account.displayName}</Txt><Txt v="small" c="sub">@{session.account.username} · {session.account.role}</Txt></View></Row>
        {d.prof ? <><Gap /><Row wrap><Pill label={d.prof.daysPerWeek + ' days/week'} /><Pill label={d.prof.sessionMin + ' min'} /><Pill label={d.prof.experience} /><Pill label={d.prof.env} /></Row><Gap /><Btn label="Edit profile and rebuild plan" kind="ghost" icon="edit" onPress={openEdit} /></> : null}
      </Card>
      <Section title="Appearance"><Segmented options={[{ key: 'system', label: 'System' }, { key: 'dark', label: 'Dark' }, { key: 'light', label: 'Light' }]} value={themeMode} onChange={(m) => setThemeMode(m as any)} /></Section>
      <Section title="Notifications (on this device only)">
        <Card>{sw('workout', 'Workout reminders', 'On your planned days at ' + d.prefs.workoutTime)}<Divider />{sw('nutrition', 'Meal logging reminders')}<Divider />{sw('membership', 'Membership expiry reminders')}<Divider />{sw('announcements', 'Gym announcements')}</Card>
        <Gap h={8} /><Btn label={busy ? 'Working…' : 'Apply reminders'} icon="bell" kind="ghost" disabled={busy} onPress={applyNotifs} />
        <Txt v="small" c="mute" style={{ marginTop: 6 }}>Reminders are scheduled locally. No server or push service is involved.</Txt>
      </Section>
      {actor.role === 'user' ? <Section title="Camera coach">
        <Card><Txt v="h3">Camera orientation</Txt><Txt v="small" c="sub">If the skeleton looks rotated or mirrored on your phone, adjust it here. This is a device setting, and it has not been validated on every phone.</Txt><Gap h={8} /><Row wrap>{[0, 90, 180, 270].map((r) => <Chip key={r} label={r + '°'} on={d.orient.rotate === r} onPress={() => act(() => repo.setKV(actor, actor.id, 'camOrient', { ...d.orient, rotate: r }))} />)}<Chip label="Mirror" on={d.orient.mirror} onPress={() => act(() => repo.setKV(actor, actor.id, 'camOrient', { ...d.orient, mirror: !d.orient.mirror }))} /></Row></Card>
      </Section> : null}
      <Section title="AI (optional)">
        <Card><Row gap={12}><Icon name="zap" color={t.accentText} /><View style={{ flex: 1 }}><Txt v="h3">{llm ? 'AI key configured' : 'No AI key'}</Txt><Txt v="small" c="sub">{llm ? 'Coach answers and photo estimates may use your AI service. They are labelled "AI". Safety rules always stay local.' : 'The coach works fully offline with built-in rules. Add your own API key to enable AI wording and meal-photo estimates.'}</Txt></View></Row><Gap h={8} /><Btn label={llm ? 'Change or remove key' : 'Add API key'} kind="ghost" icon="lock" onPress={() => setAiOpen(true)} /></Card>
      </Section>
      {actor.role === 'user' ? <Section title="Your data">
        <Btn label="Export my data" icon="upload" kind="ghost" onPress={exportData} disabled={busy} /><Gap h={8} /><Btn label="Import a backup" icon="download" kind="ghost" onPress={pickImport} /><Gap h={8} />
        <Btn label="Delete my data" icon="trash" kind="danger" onPress={async () => { if (await confirm({ title: 'Delete all your data?', message: 'This removes your profile, plan, workouts, meals and chat from this device. Your login stays. It cannot be undone.', confirmLabel: 'Delete', danger: true })) { act(() => B.deleteMine(repo, actor), 'Your data was deleted'); nav.pop(); } }} />
      </Section> : null}
      <Gap h={24} /><Btn label="Sign out" icon="logout" kind="ghost" onPress={() => setSession(null)} />
      <Txt v="small" c="mute" style={{ textAlign: 'center', marginTop: 16 }}>Kinetic Coach · demo build. Fitness guidance is general and not medical advice.</Txt>
      <Sheet visible={ed} onClose={() => setEd(false)} title="Edit profile"><Field label="Name" value={name} onChangeText={setName} autoCap="words" /><Field label="Weight (kg)" value={wt} onChangeText={setWt} keyboard="numeric" /><Field label="Workout days per week (1-7)" value={days} onChangeText={setDays} keyboard="numeric" /><Field label="Session length (minutes)" value={mins} onChangeText={setMins} keyboard="numeric" /><Callout tone="info">Saving rebuilds your plan. Past workouts are kept. For goals, equipment and limits, redo setup from Settings → Delete my data.</Callout><Btn label="Save" onPress={saveProfile} /></Sheet>
      <Sheet visible={aiOpen} onClose={() => setAiOpen(false)} title="AI service">
        <Callout tone="info">Your key is stored in the Android keystore on this device. It is never written to the database, exports or the app code. Anything you ask the coach, or any photo you analyse, is sent to this service.</Callout>
        <Field label="API key" value={key} onChangeText={setKey} secure placeholder={llm ? '•••••• (leave blank to keep)' : 'sk-ant-…'} /><Field label="Model" value={model} onChangeText={setModel} /><Field label="Base URL" value={base} onChangeText={setBase} />
        <Btn label="Save key" disabled={!key.trim()} onPress={() => saveAi(false)} />{llm ? <Btn label="Remove key" kind="danger" onPress={() => saveAi(true)} /> : null}
      </Sheet>
      <Sheet visible={!!imp} onClose={() => setImp(null)} title="Import backup"><Callout tone="warn">This replaces your current data on this device with the file's contents.</Callout><Btn label="Replace my data" kind="danger" onPress={() => { act(() => { const r = B.importMine(repo, actor, imp); toast(r.imported + ' records restored', 'good'); }); setImp(null); }} /></Sheet>
    </Screen>
  );
}

/* ------------------------------ GYM (customer side) ------------------------------ */
export function GymInfo() {
  const { repo, actor, session, theme: t, toast, confirm } = useApp(); const nav = useNav(); const act = useAct();
  const [code, setCode] = useState(''); const [scan, setScan] = useState(false); const [inv, setInv] = useState<{ txn: P.Txn; text: string } | null>(null);
  const d = useData(() => {
    const ms = G.myMemberships(repo, actor).filter((m) => m.gym && m.status !== 'left'); const gymIds = ms.filter((m) => ['active', 'expiring', 'expired'].includes(m.status as string)).map((m) => m.gym!.id);
    return { ms, anns: gymIds.flatMap((id) => G.listAnnouncements(repo, actor, id).map((a: any) => ({ ...a, gymName: ms.find((m) => m.gym!.id === id)!.gym!.name }))).sort((a: any, b: any) => b.at - a.at), asg: G.myAssignments(repo, actor), chs: gymIds.flatMap((id) => G.listChallenges(repo, actor, id).map((c: any) => ({ c, p: G.challengeProgress(repo, actor, c) }))), txns: P.listTxns(repo, actor) };
  });
  useEffect(() => { try { NT.markAnnouncementsSeen(repo, actor); } catch {} }, []);
  const join = (raw: string) => { const r = act(() => G.redeemCode(repo, actor, raw), 'Request sent. The gym will review it.'); if (r) { setCode(''); setScan(false); } };
  return (
    <Screen>
      <Header title="My gym" onBack={nav.pop} />
      {d.ms.map(({ member: m, gym, status, daysLeft, pkg }) => (
        <Card key={m.id} style={{ marginBottom: 12 }}>
          <Row between><View style={{ flex: 1 }}><Txt v="h2">{gym!.name}</Txt><Txt v="small" c="sub">{gym!.address || gym!.hours}</Txt></View><Pill label={status === 'expiring' ? 'Expiring soon' : String(status)} tone={status === 'active' ? 'good' : status === 'expiring' || status === 'pending' ? 'warn' : status === 'expired' || status === 'rejected' ? 'bad' : 'mute'} /></Row>
          {m.status === 'pending' ? <Callout tone="info">Waiting for the gym to approve your request.</Callout> : null}
          {m.status === 'rejected' ? <Callout tone="bad">The gym did not approve this request.</Callout> : null}
          {m.expiresAt ? <Txt style={{ marginTop: 8 }}>{pkg?.name || 'Membership'} · {daysLeft! >= 0 ? daysLeft + ' days left' : 'expired ' + Math.abs(daysLeft!) + ' days ago'} · ends {dt(m.expiresAt)}</Txt> : null}
          {['active', 'expired'].includes(m.status) ? <><Gap h={8} /><Toggle label="Share my progress with the gym" sub="Lets staff see your workout counts, not your food or chat." value={m.shareProgress} onChange={(v) => act(() => G.setShareProgress(repo, actor, m.id, v))} />
            {status === 'expired' || status === 'expiring' ? <Callout tone="warn">To renew, ask the front desk. They record the payment for you. This demo has no in-app card payments.</Callout> : null}
            <Btn label="Leave this gym" kind="ghost" onPress={async () => { if (await confirm({ title: 'Leave ' + gym!.name + '?', message: 'You will lose access to its programmes and announcements. Your own workout history stays.', confirmLabel: 'Leave', danger: true })) act(() => G.leaveGym(repo, actor, m.id), 'You left the gym'); }} /></> : null}
        </Card>))}
      <Section title={d.ms.length ? 'Join another gym' : 'Join a gym'}>
        <Card><Txt c="sub">Enter the code from your gym, or scan its QR.</Txt><Gap h={8} /><Field label="Gym code" value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder="e.g. IRON-2026" /><Btn label="Request to join" disabled={!code.trim()} onPress={() => join(code)} /><Gap h={8} /><Btn label="Scan QR" icon="qr" kind="ghost" onPress={() => setScan(true)} /></Card>
      </Section>
      {d.asg.length ? <Section title="Assigned programmes">{d.asg.map((x: any) => <Card key={x.assignment.id} style={{ marginBottom: 8 }}><Txt v="h3">{x.programme.name}</Txt><Txt v="small" c="sub">{x.programme.description}{x.assignment.note ? ' · "' + x.assignment.note + '"' : ''}</Txt><Gap h={8} /><Row wrap>{x.programme.days.map((dd: any, i: number) => <Chip key={i} label={dd.title} icon="play" onPress={() => { act(() => W.startRun(repo, actor, { kind: 'programme', programmeId: x.programme.id, dayIndex: i })); nav.push('run'); }} />)}</Row></Card>)}</Section> : null}
      {d.chs.length ? <Section title="Challenges">{d.chs.map(({ c, p }: any) => <Card key={c.id} style={{ marginBottom: 8 }}><Txt v="h3">{c.title}</Txt><Txt v="small" c="sub">{c.description} · {dt(c.startAt)} to {dt(c.endAt)}</Txt><Gap h={6} /><View style={{ height: 8, borderRadius: 4, backgroundColor: t.surface2, overflow: 'hidden' }}><View style={{ width: p.pct + '%', height: 8, backgroundColor: t.accent }} /></View><Txt v="small" c="mute" style={{ marginTop: 4 }}>{p.value} of {c.target} {c.metric}</Txt></Card>)}</Section> : null}
      {d.anns.length ? <Section title="Announcements">{d.anns.slice(0, 10).map((a: any) => <Card key={a.id} style={{ marginBottom: 8 }} pad={14}><Row between><Txt v="h3" style={{ flex: 1 }}>{a.title}</Txt>{a.pinned ? <Icon name="pin" size={16} color={t.accentText} /> : null}</Row><Txt v="small" c="sub">{a.gymName} · {dt(a.at)}</Txt><Txt>{a.text}</Txt></Card>)}</Section> : null}
      {d.txns.length ? <Section title="Payments and invoices"><Callout tone="info">Demo payments only. No real money moved.</Callout><Gap h={8} />{d.txns.map((x) => <ListItem key={x.id} title={x.description} sub={dt(x.at) + ' · ' + x.status} right={<Txt v="h3">{inr(x.amount)}</Txt>} onPress={() => { const m = d.ms.find((y) => y.gym!.id === x.gymId); setInv({ txn: x, text: P.invoiceText(x, m?.gym?.name || 'Gym', session.account.displayName) }); }} />)}</Section> : null}
      <Sheet visible={!!inv} onClose={() => setInv(null)} title="Invoice (demo)"><Txt style={{ fontFamily: 'monospace' }}>{inv?.text}</Txt><Btn label="Share" icon="upload" kind="ghost" onPress={() => { import('../app/platform').then((p) => p.shareJson('invoice-' + inv!.txn.invoiceNo + '.json', { invoice: inv!.text, demo: true })).catch((e) => toast(e.message, 'bad')); }} /></Sheet>
      <Sheet visible={scan} onClose={() => setScan(false)} title="Scan gym QR">{scan ? <QrScanner onCode={(v) => join(v)} onError={(m) => { toast(m, 'bad'); setScan(false); }} /> : null}</Sheet>
    </Screen>
  );
}
registerScreens({ profile: Profile, gymInfo: GymInfo });
