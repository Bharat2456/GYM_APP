import React, { useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import FIT, { EX, EXERCISES, DAY, ymd } from '../engine';
import { useApp, useData, useAct } from '../app/context';
import { useNav, registerScreens } from '../app/nav';
import { Screen, Header, Txt, Card, Btn, Row, Gap, Chip, Pill, Section, ListItem, Empty, Stat, Grid, Segmented, Sheet, Callout, Toggle, Field, Divider, Bars } from '../ui/kit';
import { Icon } from '../ui/icons';
import { STAFF_ROLES, GYM_PERMS } from '../db/repo';
import * as G from '../services/gym';
import * as P from '../services/payments';
import * as A from '../services/admin';
import { exName, dose } from './user1';
import { copyText } from '../app/platform';

const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const dt = (ms?: number) => (ms ? new Date(ms).toDateString() : '—');
const tone = (s: string) => (s === 'active' ? 'good' : s === 'expiring' || s === 'pending' ? 'warn' : s === 'expired' || s === 'rejected' ? 'bad' : 'mute') as any;

/** Active gym for the signed-in gym account, plus helpers. Suspended gyms are read-only (the data layer enforces it; the UI explains it). */
function useGym() {
  const { repo, actor, session, setSession, refreshSession } = useApp();
  const gyms = useData(() => G.myGyms(repo, actor));
  const gym = gyms.find((g) => g.id === session.activeGymId) || gyms[0];
  const can = (p: string) => actor.perms.includes('*') || actor.perms.includes(p);
  return { gym, gyms, can, gymId: gym?.id as string, readOnly: gym?.status !== 'active', setGym: (id: string) => { setSession({ ...session, activeGymId: id }); } };
}
function NoGym() { const nav = useNav(); return <Screen><Header title="No gym yet" big /><Empty icon="building" title="Create your gym" text="Set up your gym profile to start inviting members." action="Create gym" onAction={() => nav.push('gymCreate')} /></Screen>; }
const Banner = ({ g }: { g: ReturnType<typeof useGym> }) => g.gym && g.gym.status !== 'active' ? <Callout tone="warn" title={g.gym.status === 'pending' ? 'Awaiting platform approval' : 'Gym suspended'}>{g.gym.status === 'pending' ? 'Your gym is visible only to you until the platform admin approves it.' : 'Your gym is read-only. Contact the platform admin to reactivate it.'}</Callout> : null;

/* ------------------------------ DASHBOARD ------------------------------ */
export function GymDashboard() {
  const g = useGym(); const { repo, actor, theme: t } = useApp(); const nav = useNav();
  const d = useData(() => g.gym ? { s: G.gymStats(repo, actor, g.gymId), alerts: G.expiryAlerts(repo, actor, g.gymId).slice(0, 5), anns: G.listAnnouncements(repo, actor, g.gymId).slice(0, 1) } : null, [g.gymId]);
  if (!g.gym || !d) return <NoGym />;
  const s = d.s;
  return (
    <Screen>
      <Row between style={{ paddingTop: 12 }}><View style={{ flex: 1 }}><Txt v="label" c="accent">Gym dashboard</Txt><Txt v="h1">{g.gym.name}</Txt></View>{g.gyms.length > 1 ? <Btn label="Switch" kind="ghost" small full={false} onPress={() => nav.push('gymSwitch')} /> : null}</Row>
      <Gap /><Banner g={g} />
      <Grid><Stat label="Active members" value={s.active} icon="users" /><Stat label="Pending requests" value={s.pending} icon="clock" /><Stat label="Expiring soon" value={s.expiring} icon="alert" /><Stat label="Expired" value={s.expired} icon="x" /></Grid>
      <Gap /><Card accent><Txt v="label" c="onAccent">Demo revenue (no real money)</Txt><Txt v="h1" c="onAccent">{inr(s.revenue.gross - s.revenue.refunded)}</Txt><Txt style={{ color: t.onAccent }}>{s.revenue.count} payments · {s.renewalsLast30} renewals in 30 days · {s.newLast30} new members in 30 days</Txt></Card>
      <Section title="New members per week"><Card><Bars data={s.registrationsByWeek.map((w: any) => ({ label: w.label, value: w.count }))} /></Card></Section>
      {Object.keys(s.byPackage).length ? <Section title="Active by package"><Card>{Object.entries(s.byPackage).map(([k, v]) => <Row key={k} between style={{ paddingVertical: 4 }}><Txt>{k}</Txt><Txt v="h3">{v as number}</Txt></Row>)}</Card></Section> : null}
      <Section title="Needs attention" action={s.pending ? 'Review requests' : undefined} onAction={() => nav.setTab('members')}>
        {s.pending ? <Card onPress={() => nav.setTab('members')}><Row gap={12}><Icon name="clock" color={t.accentText} /><Txt style={{ flex: 1 }}>{s.pending} join request{s.pending > 1 ? 's' : ''} waiting</Txt><Icon name="right" size={18} color={t.mute} /></Row></Card> : null}
        {d.alerts.length ? d.alerts.map((a) => <ListItem key={a.member.id} title={a.name} sub={a.status === 'expired' ? 'Expired ' + Math.abs(a.daysLeft!) + ' days ago' : a.daysLeft + ' days left'} right={<Pill label={String(a.status)} tone={tone(String(a.status))} />} onPress={() => nav.push('memberDetail', { memberId: a.member.id })} />) : !s.pending ? <Card><Txt c="sub">Nothing needs attention.</Txt></Card> : null}
      </Section>
      <Section title="Referrals"><Card><Txt>{s.referrals.total} joined with your codes · {s.referrals.converted} became paying members</Txt></Card></Section>
    </Screen>
  );
}
function GymSwitch() { const g = useGym(); const nav = useNav(); return <Screen><Header title="Switch gym" onBack={nav.pop} />{g.gyms.map((x) => <ListItem key={x.id} title={x.name} sub={x.status} right={x.id === g.gymId ? <Icon name="check" color="#C6F432" /> : undefined} onPress={() => { g.setGym(x.id); nav.pop(); }} />)}</Screen>; }

/* ------------------------------ MEMBERS ------------------------------ */
export function Members() {
  const g = useGym(); const { repo, actor } = useApp(); const nav = useNav(); const act = useAct(); const [q, setQ] = useState(''); const [f, setF] = useState('all'); const [add, setAdd] = useState(false); const [appr, setAppr] = useState<any>(null);
  const d = useData(() => g.gym ? { rows: G.listMembers(repo, actor, g.gymId, { q: q || undefined }), pk: G.listPackages(repo, actor, g.gymId).filter((p) => p.active) } : null, [g.gymId, q]);
  if (!g.gym || !d) return <NoGym />;
  const pend = d.rows.filter((r) => r.status === 'pending'); const rows = d.rows.filter((r) => r.status !== 'pending' && (f === 'all' || r.status === f));
  return (
    <Screen>
      <Header title="Members" sub={d.rows.length + ' total'} big right={g.can('members.manage') && !g.readOnly ? <Pressable onPress={() => setAdd(true)} accessibilityLabel="Add customer" style={{ padding: 10 }}><Icon name="plus" color="#C6F432" /></Pressable> : undefined} />
      <Banner g={g} />
      {pend.length ? <Section title={'Join requests (' + pend.length + ')'}>{pend.map((r) => <Card key={r.member.id} style={{ marginBottom: 8 }} pad={14}><Row between><View style={{ flex: 1 }}><Txt v="h3">{r.name}</Txt><Txt v="small" c="sub">Requested {dt(r.member.requestedAt)}{r.member.via ? ' via ' + r.member.via : ''}</Txt></View></Row>{g.can('members.manage') && !g.readOnly ? <Row style={{ marginTop: 8 }}><View style={{ flex: 1 }}><Btn label="Approve" small onPress={() => setAppr(r)} /></View><View style={{ flex: 1 }}><Btn label="Reject" kind="ghost" small onPress={() => act(() => G.rejectMember(repo, actor, r.member.id), 'Rejected')} /></View></Row> : null}</Card>)}</Section> : null}
      <Field value={q} onChangeText={setQ} placeholder="Search by name or username" />
      <Gap h={8} /><Row wrap>{['all', 'active', 'expiring', 'expired', 'left'].map((x) => <Chip key={x} label={x} on={f === x} onPress={() => setF(x)} />)}</Row><Gap />
      {rows.length ? rows.map((r) => <ListItem key={r.member.id} title={r.name} sub={r.packageName + (r.daysLeft != null ? ' · ' + (r.daysLeft >= 0 ? r.daysLeft + ' days left' : 'expired') : '')} right={<Pill label={String(r.status)} tone={tone(String(r.status))} />} onPress={() => nav.push('memberDetail', { memberId: r.member.id })} />) : <Empty icon="users" title="No members here" text="Share a join code from the Engage tab to get your first members." />}
      <ApproveSheet row={appr} pk={d.pk} onClose={() => setAppr(null)} />
      <AddCustomer open={add} pk={d.pk} gymId={g.gymId} onClose={() => setAdd(false)} />
    </Screen>
  );
}
function ApproveSheet({ row, pk, onClose, renew }: { row: any; pk: G.Pkg[]; onClose: () => void; renew?: boolean }) {
  const { repo, actor } = useApp(); const act = useAct(); const [pid, setPid] = useState(''); const [pay, setPay] = useState(true);
  return (
    <Sheet visible={!!row} onClose={onClose} title={(renew ? 'Renew ' : 'Approve ') + (row?.name || '')}>
      {pk.length ? <>{pk.map((p) => <ListItem key={p.id} title={p.name} sub={p.days + ' days'} right={<Txt v="h3">{inr(p.price)}</Txt>} icon={pid === p.id ? 'check' : undefined} onPress={() => setPid(p.id)} />)}
        <Toggle label="Record a demo payment" sub="No real money moves. Creates a demo invoice." value={pay} onChange={setPay} />
        <Btn label={renew ? 'Renew' : 'Approve'} disabled={!pid} onPress={() => { const ok = act(() => (renew ? G.renewMember : G.approveMember)(repo, actor, row.member.id, pid, pay), renew ? 'Renewed' : 'Approved'); if (ok) { setPid(''); onClose(); } }} /></> : <Callout tone="warn">Create an active package first (More → Packages).</Callout>}
    </Sheet>
  );
}
function AddCustomer({ open, pk, gymId, onClose }: { open: boolean; pk: G.Pkg[]; gymId: string; onClose: () => void }) {
  const { repo, actor } = useApp(); const act = useAct(); const [n, setN] = useState(''); const [u, setU] = useState(''); const [pid, setPid] = useState(''); const [res, setRes] = useState<any>(null);
  const close = () => { setRes(null); setN(''); setU(''); setPid(''); onClose(); };
  return (
    <Sheet visible={open} onClose={close} title="Add customer">
      {res ? <><Callout tone="good" title="Customer created">Username <Txt style={{ fontWeight: '800' }}>{res.account.username}</Txt>{'\n'}Temporary password <Txt style={{ fontWeight: '800' }}>{res.password}</Txt>{'\n'}Shown once. Share it with the customer privately.</Callout><Btn label="Copy credentials" icon="copy" kind="ghost" onPress={() => copyText(res.account.username + ' / ' + res.password)} /><Btn label="Done" onPress={close} /></>
        : <><Field label="Full name" value={n} onChangeText={setN} autoCap="words" /><Field label="Username (optional)" value={u} onChangeText={setU} /><Txt v="label" c="sub">Package</Txt>{pk.map((p) => <ListItem key={p.id} title={p.name} sub={p.days + ' days · ' + inr(p.price)} icon={pid === p.id ? 'check' : undefined} onPress={() => setPid(p.id)} />)}<Btn label="Create customer" disabled={!n.trim() || !pid} onPress={() => { const r = act(() => G.addCustomer(repo, actor, gymId, { name: n, username: u || undefined, packageId: pid }), 'Customer added'); if (r) setRes(r); }} /></>}
    </Sheet>
  );
}
function MemberDetail({ memberId }: { memberId: string }) {
  const g = useGym(); const { repo, actor } = useApp(); const nav = useNav(); const act = useAct(); const [ren, setRen] = useState(false); const [asg, setAsg] = useState(false); const [note, setNote] = useState('');
  const d = useData(() => { const row = G.listMembers(repo, actor, g.gymId).find((r) => r.member.id === memberId); if (!row) return null; let prog: any = null, why = ''; try { prog = G.memberProgress(repo, actor, g.gymId, row.member.ownerId); } catch (e: any) { why = e.message; } return { row, prog, why, pk: G.listPackages(repo, actor, g.gymId).filter((p) => p.active), prg: G.listProgrammes(repo, actor, g.gymId).filter((p) => p.active), txns: P.listTxns(repo, actor, g.gymId).filter((x) => x.ownerId === row.member.ownerId) }; }, [memberId]);
  if (!d) return <Screen><Header title="Member" onBack={nav.pop} /><Empty title="Not found" /></Screen>;
  const { row } = d;
  return (
    <Screen>
      <Header title={row.name} sub={'@' + row.username} onBack={nav.pop} />
      <Card><Row between><Pill label={String(row.status)} tone={tone(String(row.status))} /><Txt v="small" c="sub">{row.packageName}</Txt></Row>{row.member.expiresAt ? <Txt style={{ marginTop: 8 }}>Ends {dt(row.member.expiresAt)} ({row.daysLeft! >= 0 ? row.daysLeft + ' days left' : 'expired'})</Txt> : null}</Card>
      {g.can('members.manage') && !g.readOnly && ['active', 'expired'].includes(row.member.status) ? <><Gap /><Btn label="Renew membership" icon="refresh" onPress={() => setRen(true)} /></> : null}
      {g.can('programmes.manage') && !g.readOnly && row.member.status === 'active' ? <><Gap h={8} /><Btn label="Assign a programme" icon="award" kind="ghost" onPress={() => setAsg(true)} /></> : null}
      <Section title="Progress">{d.prog ? <Card><Grid><Stat label="Workouts (28 d)" value={d.prog.workouts28d} /><Stat label="Minutes (28 d)" value={d.prog.minutes28d} /></Grid><Txt v="small" c="sub" style={{ marginTop: 8 }}>Last workout {dt(d.prog.lastWorkoutAt)} · {d.prog.streakWeeks} week streak · {d.prog.totalWorkouts} total</Txt></Card> : <Card><Icon name="lock" color="#888" /><Txt c="sub" style={{ marginTop: 6 }}>{d.why || 'Not shared.'}</Txt></Card>}</Section>
      {d.txns.length ? <Section title="Payments">{d.txns.map((x) => <ListItem key={x.id} title={x.description} sub={dt(x.at) + ' · ' + x.status} right={<Txt v="h3">{inr(x.amount)}</Txt>} />)}</Section> : null}
      <ApproveSheet row={ren ? row : null} pk={d.pk} renew onClose={() => setRen(false)} />
      <Sheet visible={asg} onClose={() => setAsg(false)} title="Assign programme"><Field label="Note to member (optional)" value={note} onChangeText={setNote} />{d.prg.length ? d.prg.map((p) => <ListItem key={p.id} title={p.name} sub={p.level + ' · ' + p.days.length + ' days'} onPress={() => { act(() => G.assignProgramme(repo, actor, g.gymId, row.member.ownerId, p.id, note), 'Assigned'); setAsg(false); setNote(''); }} />) : <Callout tone="info">Create a programme first.</Callout>}</Sheet>
    </Screen>
  );
}

/* ------------------------------ PROGRAMMES ------------------------------ */
const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export function Programmes() {
  const g = useGym(); const { repo, actor } = useApp(); const act = useAct(); const [ed, setEd] = useState<any>(null);
  const d = useData(() => g.gym ? { mine: G.listProgrammes(repo, actor, g.gymId), std: A.listDefaultProgrammes(repo, actor) } : null, [g.gymId]);
  if (!g.gym || !d) return <NoGym />;
  const canEdit = g.can('programmes.manage') && !g.readOnly;
  return (
    <Screen>
      <Header title="Programmes" sub="Training plans for members" big right={canEdit ? <Pressable onPress={() => setEd({ name: '', description: '', level: 'beginner', days: [{ title: 'Day 1', exercises: [] }] })} accessibilityLabel="New programme" style={{ padding: 10 }}><Icon name="plus" color="#C6F432" /></Pressable> : undefined} />
      <Banner g={g} />
      {d.mine.length ? d.mine.map((p) => <Card key={p.id} style={{ marginBottom: 10 }} onPress={canEdit ? () => setEd(JSON.parse(JSON.stringify(p))) : undefined}><Row between><View style={{ flex: 1 }}><Txt v="h3">{p.name}</Txt><Txt v="small" c="sub">{p.level} · {p.days.length} days · {p.days.reduce((s, x) => s + x.exercises.length, 0)} exercises</Txt></View>{!p.active ? <Pill label="Hidden" /> : null}</Row></Card>) : <Empty icon="award" title="No programmes yet" text="Create your own, or adopt a platform template below." />}
      {d.std.length ? <Section title="Platform templates">{d.std.map((p: any) => <Card key={p.id} style={{ marginBottom: 8 }} pad={14}><Txt v="h3">{p.name}</Txt><Txt v="small" c="sub">{p.level} · {p.days.length} days</Txt>{canEdit ? <Btn label="Add to my gym" kind="ghost" small style={{ marginTop: 8 }} onPress={() => act(() => A.adoptDefaultProgramme(repo, actor, g.gymId, p.id), 'Added. You can now edit it.')} /> : null}</Card>)}</Section> : null}
      <ProgrammeEditor value={ed} onClose={() => setEd(null)} gymId={g.gymId} />
    </Screen>
  );
}
function ProgrammeEditor({ value, onClose, gymId }: { value: any; onClose: () => void; gymId: string }) {
  const { repo, actor } = useApp(); const act = useAct(); const [p, setP] = useState<any>(null); const [pick, setPick] = useState<number | null>(null); const [q, setQ] = useState('');
  React.useEffect(() => setP(value), [value]);
  if (!p) return <Sheet visible={false} onClose={onClose} />;
  const upd = (patch: any) => setP({ ...p, ...patch });
  const updDay = (i: number, patch: any) => upd({ days: p.days.map((d: any, j: number) => (j === i ? { ...d, ...patch } : d)) });
  const list = EXERCISES.filter((e) => !e.off && (!q.trim() || e.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 30);
  const save = () => { const r = act(() => G.saveProgramme(repo, actor, gymId, { ...p, days: p.days.map((d: any) => ({ ...d, exercises: d.exercises.map((e: any) => ({ ...e, sets: Math.round(+e.sets) || 3, reps: e.secs ? undefined : Math.round(+e.reps) || 10, rest: Math.round(+e.rest) || 60 })) })) }), 'Programme saved'); if (r) onClose(); };
  return (
    <Sheet visible={!!value} onClose={onClose} title={p.id ? 'Edit programme' : 'New programme'}>
      <Field label="Name" value={p.name} onChangeText={(v) => upd({ name: v })} autoCap="sentences" /><Field label="Description" value={p.description} onChangeText={(v) => upd({ description: v })} multiline />
      <Row wrap>{LEVELS.map((l) => <Chip key={l} label={l} on={p.level === l} onPress={() => upd({ level: l })} />)}</Row>
      {p.days.map((d: any, i: number) => <Card key={i} pad={12}>
        <Row between><View style={{ flex: 1 }}><Field value={d.title} onChangeText={(v) => updDay(i, { title: v })} placeholder="Day title" /></View>{p.days.length > 1 ? <Pressable onPress={() => upd({ days: p.days.filter((_: any, j: number) => j !== i) })} accessibilityLabel="Remove day" style={{ padding: 10 }}><Icon name="trash" color="#E5484D" size={18} /></Pressable> : null}</Row>
        {d.exercises.map((e: any, k: number) => <Row key={k} between style={{ paddingVertical: 4 }}><View style={{ flex: 1 }}><Txt v="h3">{exName(e.exId)}</Txt><Txt v="small" c="sub">{dose(e)} · rest {e.rest}s</Txt></View>
          <Pressable onPress={() => updDay(i, { exercises: d.exercises.map((x: any, j: number) => (j === k ? { ...x, sets: Math.min(10, x.sets + 1) } : x)) })} accessibilityLabel="More sets" style={{ padding: 8 }}><Txt v="h3">+set</Txt></Pressable>
          <Pressable onPress={() => updDay(i, { exercises: d.exercises.filter((_: any, j: number) => j !== k) })} accessibilityLabel="Remove exercise" style={{ padding: 8 }}><Icon name="x" size={18} color="#E5484D" /></Pressable></Row>)}
        <Btn label="Add exercise" kind="ghost" small icon="plus" onPress={() => setPick(i)} />
      </Card>)}
      <Btn label="Add day" kind="ghost" icon="plus" onPress={() => upd({ days: [...p.days, { title: 'Day ' + (p.days.length + 1), exercises: [] }] })} />
      <Row><View style={{ flex: 1 }}><Toggle label="Visible to members" value={p.active !== false} onChange={(v) => upd({ active: v })} /></View></Row>
      <Btn label="Save programme" onPress={save} />
      <Sheet visible={pick != null} onClose={() => setPick(null)} title="Pick exercise"><Field value={q} onChangeText={setQ} placeholder="Search" />{list.map((e) => <ListItem key={e.id} title={e.name} sub={e.cat} onPress={() => { const dd = e.d || {}; updDay(pick!, { exercises: [...p.days[pick!].exercises, dd.secs ? { exId: e.id, sets: dd.sets || 3, secs: dd.secs, rest: 45 } : { exId: e.id, sets: dd.sets || 3, reps: dd.reps || 10, rest: 60 }] }); setPick(null); setQ(''); }} />)}</Sheet>
    </Sheet>
  );
}

/* ------------------------------ ENGAGE ------------------------------ */
export function Engage() {
  const g = useGym(); const { repo, actor, theme: t, toast } = useApp(); const act = useAct(); const [tab, setTab] = useState('ann'); const [ann, setAnn] = useState({ title: '', text: '', pinned: false }); const [annOpen, setAnnOpen] = useState(false); const [ch, setCh] = useState<any>(null); const [codeOpen, setCodeOpen] = useState(false); const [lbl, setLbl] = useState(''); const [qr, setQr] = useState<G.Code | null>(null);
  const d = useData(() => g.gym ? { anns: G.listAnnouncements(repo, actor, g.gymId), chs: G.listChallenges(repo, actor, g.gymId), codes: G.listCodes(repo, actor, g.gymId), refs: G.listReferrals(repo, actor, g.gymId) as any[], staff: G.listStaff(repo, actor, g.gymId) } : null, [g.gymId]);
  if (!g.gym || !d) return <NoGym />;
  const canAnn = g.can('announce.manage') && !g.readOnly, canMem = g.can('members.manage') && !g.readOnly;
  return (
    <Screen>
      <Header title="Engage" sub="Announcements, challenges, invites" big /><Banner g={g} />
      <Segmented options={[{ key: 'ann', label: 'News' }, { key: 'ch', label: 'Challenges' }, { key: 'code', label: 'Invite' }, { key: 'ref', label: 'Referrals' }]} value={tab} onChange={setTab} /><Gap />
      {tab === 'ann' ? <>{canAnn ? <Btn label="Post announcement" icon="plus" onPress={() => setAnnOpen(true)} /> : null}<Gap h={8} />{d.anns.length ? d.anns.map((a: any) => <Card key={a.id} style={{ marginBottom: 8 }} pad={14}><Row between><Txt v="h3" style={{ flex: 1 }}>{a.title}</Txt>{a.pinned ? <Icon name="pin" size={16} color={t.accentText} /> : null}</Row><Txt v="small" c="sub">{dt(a.at)}</Txt><Txt>{a.text}</Txt></Card>) : <Empty icon="bell" title="No announcements" text="Members see these in their app." />}</> : null}
      {tab === 'ch' ? <>{canAnn ? <Btn label="New challenge" icon="plus" onPress={() => setCh({ title: '', description: '', metric: 'workouts', target: '12', days: '30' })} /> : null}<Gap h={8} />{d.chs.length ? d.chs.map((c: any) => <Card key={c.id} style={{ marginBottom: 8 }} pad={14}><Txt v="h3">{c.title}</Txt><Txt v="small" c="sub">{c.target} {c.metric} · {dt(c.startAt)} to {dt(c.endAt)}</Txt>{c.description ? <Txt>{c.description}</Txt> : null}</Card>) : <Empty icon="flag" title="No challenges" text="Set a goal for members, like 12 workouts in 30 days." />}</> : null}
      {tab === 'code' ? <>{canMem ? <Btn label="New join code" icon="plus" onPress={() => setCodeOpen(true)} /> : null}<Gap h={8} />{d.codes.length ? d.codes.map((c) => <Card key={c.id} style={{ marginBottom: 8 }} pad={14}><Row between><View style={{ flex: 1 }}><Txt v="h2" style={{ letterSpacing: 2 }}>{c.code}</Txt><Txt v="small" c="sub">{c.label} · {c.kind === 'staff' ? 'staff referral' : 'gym'} · {c.uses} uses</Txt></View><Pressable onPress={() => setQr(c)} accessibilityLabel="Show QR" style={{ padding: 10 }}><Icon name="qr" color={t.accentText} /></Pressable><Pressable onPress={() => copyText(c.code).then(() => toast('Copied', 'good'))} accessibilityLabel="Copy code" style={{ padding: 10 }}><Icon name="copy" color={t.mute} /></Pressable></Row></Card>) : <Empty icon="qr" title="No codes" text="Create a code and let customers join by typing it or scanning its QR." />}</> : null}
      {tab === 'ref' ? (d.refs.length ? d.refs.map((r: any) => <Card key={r.id} style={{ marginBottom: 8 }} pad={14}><Row between><View style={{ flex: 1 }}><Txt v="h3">Code {r.code}</Txt><Txt v="small" c="sub">{dt(r.joinedAt)}{r.staffId ? ' · by staff' : ''}</Txt></View><Pill label={r.status} tone={r.status === 'converted' ? 'good' : 'mute'} /></Row>{r.status === 'converted' ? <Txt v="small" c="sub">Paid {inr(r.amount || 0)} · platform commission {inr(r.commission || 0)} (demo)</Txt> : null}</Card>) : <Empty icon="users" title="No referrals yet" text="When someone joins with your code it shows here." />) : null}
      <Sheet visible={annOpen} onClose={() => setAnnOpen(false)} title="New announcement"><Field label="Title" value={ann.title} onChangeText={(v) => setAnn({ ...ann, title: v })} autoCap="sentences" /><Field label="Message" value={ann.text} onChangeText={(v) => setAnn({ ...ann, text: v })} multiline autoCap="sentences" /><Toggle label="Pin to top" value={ann.pinned} onChange={(v) => setAnn({ ...ann, pinned: v })} /><Btn label="Post" onPress={() => { const r = act(() => G.postAnnouncement(repo, actor, g.gymId, ann.title, ann.text, ann.pinned), 'Posted'); if (r) { setAnn({ title: '', text: '', pinned: false }); setAnnOpen(false); } }} /></Sheet>
      <Sheet visible={!!ch} onClose={() => setCh(null)} title="New challenge">{ch ? <><Field label="Title" value={ch.title} onChangeText={(v) => setCh({ ...ch, title: v })} autoCap="sentences" /><Field label="Description" value={ch.description} onChangeText={(v) => setCh({ ...ch, description: v })} /><Row wrap>{['workouts', 'minutes'].map((m) => <Chip key={m} label={m} on={ch.metric === m} onPress={() => setCh({ ...ch, metric: m })} />)}</Row><Field label="Target" value={ch.target} onChangeText={(v) => setCh({ ...ch, target: v })} keyboard="numeric" /><Field label="Length (days)" value={ch.days} onChangeText={(v) => setCh({ ...ch, days: v })} keyboard="numeric" /><Btn label="Start challenge" onPress={() => { const now = repo.now(); const r = act(() => G.saveChallenge(repo, actor, g.gymId, { title: ch.title, description: ch.description, metric: ch.metric, target: num(ch.target), startAt: now, endAt: now + (num(ch.days) || 30) * DAY }), 'Challenge started'); if (r) setCh(null); }} /></> : null}</Sheet>
      <Sheet visible={codeOpen} onClose={() => setCodeOpen(false)} title="New join code"><Field label="Label (e.g. Front desk, Instagram)" value={lbl} onChangeText={setLbl} /><Btn label="Create customer code" onPress={() => { const r = act(() => G.createCode(repo, actor, g.gymId, { kind: 'customer', label: lbl || 'General' }), 'Code created'); if (r) { setLbl(''); setCodeOpen(false); } }} />{d.staff.map((s: any) => <Btn key={s.id} label={'Referral code for ' + s.displayName} kind="ghost" onPress={() => { act(() => G.createCode(repo, actor, g.gymId, { kind: 'customer', label: s.displayName, staffId: s.id }), 'Staff code created'); setCodeOpen(false); }} />)}</Sheet>
      <Sheet visible={!!qr} onClose={() => setQr(null)} title="Join QR">{qr ? <View style={{ alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#fff', borderRadius: 16 }}><QRCode value={G.joinPayload(qr.code)} size={220} /><Txt style={{ color: '#000', fontWeight: '800', letterSpacing: 2 }}>{qr.code}</Txt></View> : null}<Txt v="small" c="sub" style={{ textAlign: 'center' }}>Customers scan this from My gym → Scan QR.</Txt></Sheet>
    </Screen>
  );
}

/* ------------------------------ MORE ------------------------------ */
export function GymMore() {
  const g = useGym(); const nav = useNav(); const { setSession, session, theme: t } = useApp();
  if (!g.gym) return <NoGym />;
  const items: [string, string, string, string?][] = [['tag', 'Packages and pricing', 'gymPackages', 'gym.edit'], ['card', 'Billing and invoices', 'gymBilling', 'billing.manage'], ['chart', 'Reports', 'gymReports', 'reports.view'], ['users', 'Staff and permissions', 'gymStaff', 'staff.manage'], ['building', 'Gym profile and branding', 'gymProfile', 'gym.edit'], ['clock', 'Activity history', 'gymActivity', 'reports.view']];
  return (
    <Screen>
      <Header title="More" sub={g.gym.name} big /><Banner g={g} />
      {items.filter(([, , , p]) => !p || g.can(p)).map(([ic, l, s]) => <Card key={s} onPress={() => nav.push(s)} style={{ marginBottom: 8 }} pad={14}><Row gap={12}><Icon name={ic} color={t.accentText} /><Txt v="h3" style={{ flex: 1 }}>{l}</Txt><Icon name="right" size={18} color={t.mute} /></Row></Card>)}
      <Card onPress={() => nav.push('gymCreate')} style={{ marginBottom: 8 }} pad={14}><Row gap={12}><Icon name="plus" color={t.accentText} /><Txt v="h3" style={{ flex: 1 }}>Create another gym</Txt></Row></Card>
      {g.gyms.length > 1 ? <Card onPress={() => nav.push('gymSwitch')} style={{ marginBottom: 8 }} pad={14}><Row gap={12}><Icon name="swap" color={t.accentText} /><Txt v="h3" style={{ flex: 1 }}>Switch gym</Txt></Row></Card> : null}
      <Gap /><Btn label="Sign out" icon="logout" kind="ghost" onPress={() => setSession(null)} />
    </Screen>
  );
}
function Packages() {
  const g = useGym(); const { repo, actor } = useApp(); const nav = useNav(); const act = useAct(); const [ed, setEd] = useState<any>(null);
  const pk = useData(() => G.listPackages(repo, actor, g.gymId), [g.gymId]);
  return (
    <Screen><Header title="Packages" onBack={nav.pop} right={!g.readOnly ? <Pressable onPress={() => setEd({ name: '', days: '30', price: '', description: '', active: true })} accessibilityLabel="Add package" style={{ padding: 10 }}><Icon name="plus" color="#C6F432" /></Pressable> : undefined} />
      {pk.length ? pk.map((p) => <Card key={p.id} style={{ marginBottom: 8 }} pad={14} onPress={() => !g.readOnly && setEd({ ...p, days: String(p.days), price: String(p.price) })}><Row between><View style={{ flex: 1 }}><Txt v="h3">{p.name}</Txt><Txt v="small" c="sub">{p.days} days{p.description ? ' · ' + p.description : ''}</Txt></View><View style={{ alignItems: 'flex-end' }}><Txt v="h3">{inr(p.price)}</Txt>{!p.active ? <Pill label="Inactive" /> : null}</View></Row></Card>) : <Empty icon="tag" title="No packages" text="Add a package such as Monthly or Quarterly." />}
      <Sheet visible={!!ed} onClose={() => setEd(null)} title={ed?.id ? 'Edit package' : 'New package'}>{ed ? <><Field label="Name" value={ed.name} onChangeText={(v) => setEd({ ...ed, name: v })} autoCap="words" /><Field label="Duration (days)" value={ed.days} onChangeText={(v) => setEd({ ...ed, days: v })} keyboard="numeric" /><Field label="Price (₹)" value={ed.price} onChangeText={(v) => setEd({ ...ed, price: v })} keyboard="numeric" /><Field label="Description" value={ed.description} onChangeText={(v) => setEd({ ...ed, description: v })} /><Toggle label="Available to new members" value={ed.active} onChange={(v) => setEd({ ...ed, active: v })} /><Btn label="Save" onPress={() => { const r = act(() => G.savePackage(repo, actor, g.gymId, { id: ed.id, name: ed.name, days: num(ed.days), price: num(ed.price), description: ed.description, active: ed.active }), 'Saved'); if (r) setEd(null); }} /></> : null}</Sheet>
    </Screen>
  );
}
function Billing() {
  const g = useGym(); const { repo, actor, confirm } = useApp(); const nav = useNav(); const act = useAct(); const [inv, setInv] = useState<string | null>(null);
  const d = useData(() => ({ tx: P.listTxns(repo, actor, g.gymId), names: Object.fromEntries(G.listMembers(repo, actor, g.gymId).map((r) => [r.member.ownerId, r.name])) }), [g.gymId]);
  const rev = P.revenue(d.tx);
  return (
    <Screen><Header title="Billing" sub="Demo payments only" onBack={nav.pop} />
      <Callout tone="info" title="Demo mode">No real money moves. A payment provider interface exists so a real gateway can be added later.</Callout><Gap />
      <Grid><Stat label="Collected" value={inr(rev.gross - rev.refunded)} /><Stat label="Refunded" value={inr(rev.refunded)} /></Grid><Gap />
      {d.tx.length ? d.tx.map((x) => <Card key={x.id} style={{ marginBottom: 8 }} pad={14}><Row between><View style={{ flex: 1 }}><Txt v="h3">{d.names[x.ownerId] || 'Customer'}</Txt><Txt v="small" c="sub">{x.description} · {dt(x.at)}</Txt></View><View style={{ alignItems: 'flex-end' }}><Txt v="h3">{inr(x.amount)}</Txt><Pill label={x.status} tone={x.status === 'succeeded' ? 'good' : 'warn'} /></View></Row>
        <Row style={{ marginTop: 8 }}><Chip label="Invoice" icon="download" onPress={() => setInv(P.invoiceText(x, g.gym!.name, d.names[x.ownerId] || 'Customer'))} />{x.status === 'succeeded' && g.can('billing.manage') && !g.readOnly ? <Chip label="Refund" icon="repeat" onPress={async () => { if (await confirm({ title: 'Refund ' + inr(x.amount) + '?', message: 'Demo refund. The invoice is marked refunded.', confirmLabel: 'Refund', danger: true })) act(() => P.refund(repo, actor, x.id), 'Refunded'); }} /> : null}</Row></Card>) : <Empty icon="card" title="No payments yet" text="Approving or renewing a member with a demo payment creates one." />}
      <Sheet visible={!!inv} onClose={() => setInv(null)} title="Invoice (demo)"><Txt style={{ fontFamily: 'monospace' }}>{inv}</Txt><Btn label="Copy" icon="copy" kind="ghost" onPress={() => copyText(inv || '')} /></Sheet>
    </Screen>
  );
}
function Reports() {
  const g = useGym(); const { repo, actor } = useApp(); const nav = useNav();
  const s = useData(() => G.gymStats(repo, actor, g.gymId), [g.gymId]);
  return (
    <Screen><Header title="Reports" onBack={nav.pop} />
      <Grid><Stat label="Total members" value={s.total} /><Stat label="Active" value={s.active} /><Stat label="Expired / inactive" value={s.inactive} /><Stat label="Renewals (30 d)" value={s.renewalsLast30} /></Grid>
      <Section title="Registrations per week"><Card><Bars data={s.registrationsByWeek.map((w: any) => ({ label: w.label, value: w.count }))} /></Card></Section>
      <Section title="Revenue (demo)"><Card><Row between><Txt>Gross</Txt><Txt v="h3">{inr(s.revenue.gross)}</Txt></Row><Row between><Txt>Refunded</Txt><Txt v="h3">{inr(s.revenue.refunded)}</Txt></Row><Row between><Txt>Platform commission</Txt><Txt v="h3">{inr(s.revenue.commission)}</Txt></Row></Card></Section>
      <Section title="Referrals"><Card><Txt>{s.referrals.total} joined via codes, {s.referrals.converted} converted to paid.</Txt></Card></Section>
      <Txt v="small" c="mute" style={{ marginTop: 12 }}>All numbers are computed from this gym's own records. Revenue is demo data.</Txt>
    </Screen>
  );
}
function Staff() {
  const g = useGym(); const { repo, actor, confirm } = useApp(); const nav = useNav(); const act = useAct(); const [ed, setEd] = useState<any>(null); const [made, setMade] = useState<any>(null);
  const st = useData(() => G.listStaff(repo, actor, g.gymId), [g.gymId]);
  return (
    <Screen><Header title="Staff" onBack={nav.pop} right={!g.readOnly ? <Pressable onPress={() => setEd({ displayName: '', username: '', password: '', staffRole: 'receptionist', permissions: null })} accessibilityLabel="Add staff" style={{ padding: 10 }}><Icon name="plus" color="#C6F432" /></Pressable> : undefined} />
      {st.map((s: any) => <Card key={s.id} style={{ marginBottom: 8 }} pad={14}><Row between><View style={{ flex: 1 }}><Txt v="h3">{s.displayName}</Txt><Txt v="small" c="sub">@{s.username} · {STAFF_ROLES[s.extra.staffRole]?.label || 'Owner'}</Txt></View>{s.extra.staffRole && !g.readOnly ? <Pressable onPress={async () => { if (await confirm({ title: 'Remove ' + s.displayName + '?', message: 'They lose access to this gym.', confirmLabel: 'Remove', danger: true })) act(() => G.removeStaff(repo, actor, g.gymId, s.id), 'Removed'); }} accessibilityLabel="Remove staff" style={{ padding: 10 }}><Icon name="trash" color="#E5484D" size={18} /></Pressable> : null}</Row>
        {s.extra.staffRole ? <Row wrap style={{ marginTop: 6 }}>{(s.extra.permissions || STAFF_ROLES[s.extra.staffRole].perms).map((p: string) => <Pill key={p} label={p} />)}</Row> : <Pill label="Full access" tone="accent" />}</Card>)}
      <Sheet visible={!!ed} onClose={() => setEd(null)} title="Add staff">{ed ? <><Field label="Name" value={ed.displayName} onChangeText={(v) => setEd({ ...ed, displayName: v })} autoCap="words" /><Field label="Username" value={ed.username} onChangeText={(v) => setEd({ ...ed, username: v })} /><Field label="Temporary password (8+ characters)" value={ed.password} onChangeText={(v) => setEd({ ...ed, password: v })} secure /><Row wrap>{Object.entries(STAFF_ROLES).filter(([k]) => k !== 'owner').map(([k, v]) => <Chip key={k} label={v.label} on={ed.staffRole === k} onPress={() => setEd({ ...ed, staffRole: k, permissions: null })} />)}</Row><Txt v="small" c="sub">Permissions: {(STAFF_ROLES[ed.staffRole]?.perms || []).join(', ')}</Txt><Btn label="Create staff account" onPress={() => { const r = act(() => G.addStaff(repo, actor, g.gymId, ed), 'Staff added'); if (r) { setMade({ u: ed.username, p: ed.password }); setEd(null); } }} /></> : null}</Sheet>
      <Sheet visible={!!made} onClose={() => setMade(null)} title="Staff created"><Callout tone="good">Username {made?.u}{'\n'}Password {made?.p}{'\n'}Share privately; this is shown once.</Callout><Btn label="Done" onPress={() => setMade(null)} /></Sheet>
    </Screen>
  );
}
function GymProfileScreen() {
  const g = useGym(); const { repo, actor, theme: t } = useApp(); const nav = useNav(); const act = useAct();
  const [f, setF] = useState<any>(() => ({ name: g.gym?.name || '', description: g.gym?.description || '', address: g.gym?.address || '', phone: g.gym?.phone || '', email: g.gym?.email || '', hours: g.gym?.hours || '' }));
  const [b, setB] = useState<any>(() => ({ mode: g.gym?.brand.mode || 'shared', color: g.gym?.brand.color || '#C6F432', welcome: g.gym?.brand.welcome || '' }));
  const COLORS = ['#C6F432', '#FF6B35', '#2DD4BF', '#60A5FA', '#F472B6', '#FACC15', '#A78BFA'];
  const field = (k: string, label: string, extra: any = {}) => <Field label={label} value={f[k]} onChangeText={(v) => setF({ ...f, [k]: v })} {...extra} />;
  return (
    <Screen><Header title="Gym profile" onBack={nav.pop} /><Banner g={g} />
      {field('name', 'Gym name', { autoCap: 'words' })}{field('description', 'Description', { multiline: true })}{field('address', 'Address')}{field('phone', 'Phone', { keyboard: 'numeric' })}{field('email', 'Email')}{field('hours', 'Opening hours')}
      <Btn label="Save profile" disabled={g.readOnly} onPress={() => act(() => G.updateGymProfile(repo, actor, g.gymId, f), 'Profile saved')} />
      <Section title="Branding"><Callout tone="info">Members see your gym name, welcome line and accent colour in their app when you use custom branding.</Callout><Gap h={8} /><Segmented options={[{ key: 'shared', label: 'Platform look' }, { key: 'custom', label: 'My brand' }]} value={b.mode} onChange={(m) => setB({ ...b, mode: m })} />
        {b.mode === 'custom' ? <><Gap /><Row wrap>{COLORS.map((c) => <Pressable key={c} onPress={() => setB({ ...b, color: c })} accessibilityLabel={'Colour ' + c} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c, borderWidth: 3, borderColor: b.color === c ? t.text : 'transparent' }} />)}</Row><Field label="Welcome line" value={b.welcome} onChangeText={(v) => setB({ ...b, welcome: v })} /></> : null}
        <Gap /><Btn label="Save branding" disabled={g.readOnly} onPress={() => act(() => G.setBranding(repo, actor, g.gymId, b), 'Branding saved')} />
      </Section>
    </Screen>
  );
}
function GymActivity() { const g = useGym(); const { repo, actor } = useApp(); const nav = useNav(); const rows = useData(() => repo.listAudit(actor, { gymId: g.gymId, limit: 100 }), [g.gymId]); return <Screen><Header title="Activity" sub="Who did what" onBack={nav.pop} />{rows.length ? rows.map((r: any) => <ListItem key={r.seq} title={r.action} sub={dt(r.at) + ' · ' + r.actorRole + (r.detail ? ' · ' + r.detail : '')} />) : <Empty icon="clock" title="No activity yet" />}</Screen>; }
function GymCreate() {
  const { repo, actor, session, setSession, refreshSession } = useApp(); const nav = useNav(); const act = useAct(); const [f, setF] = useState({ name: '', address: '', phone: '', email: '', hours: '', description: '' });
  return (
    <Screen><Header title="Create gym" onBack={nav.pop} /><Callout tone="info">New gyms start as pending. The platform admin approves them before members can join.</Callout><Gap />
      {(['name', 'description', 'address', 'phone', 'email', 'hours'] as const).map((k) => <Field key={k} label={k[0].toUpperCase() + k.slice(1)} value={f[k]} onChangeText={(v) => setF({ ...f, [k]: v })} autoCap={k === 'name' ? 'words' : 'none'} />)}
      <Btn label="Create gym" onPress={() => { const r = act(() => G.createGym(repo, actor, f), 'Gym created, awaiting approval'); if (r) { refreshSession(); nav.pop(); } }} />
    </Screen>
  );
}
registerScreens({ dashboard: GymDashboard, members: Members, programmes: Programmes, engage: Engage, more: GymMore, memberDetail: MemberDetail as any, gymSwitch: GymSwitch, gymPackages: Packages, gymBilling: Billing, gymReports: Reports, gymStaff: Staff, gymProfile: GymProfileScreen, gymActivity: GymActivity, gymCreate: GymCreate });
