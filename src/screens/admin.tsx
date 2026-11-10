import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { EXERCISES, EX } from '../engine';
import { useApp, useData, useAct } from '../app/context';
import { useNav, registerScreens } from '../app/nav';
import { Screen, Header, Txt, Card, Btn, Row, Gap, Chip, Pill, Section, ListItem, Empty, Stat, Grid, Segmented, Sheet, Callout, Toggle, Field } from '../ui/kit';
import { Icon } from '../ui/icons';
import * as A from '../services/admin';
import * as G from '../services/gym';
import * as P from '../services/payments';
import * as S from '../services/session';
import { shareJson, pickJson } from '../app/platform';

const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const dt = (ms?: number) => (ms ? new Date(ms).toDateString() : '—');

/* ------------------------------ OVERVIEW ------------------------------ */
export function AdminOverview() {
  const { repo, actor, theme: t } = useApp(); const nav = useNav();
  const d = useData(() => ({ s: A.platformStats(repo, actor), pend: A.listGyms(repo, actor).filter((x) => x.gym.status === 'pending') }));
  const s = d.s;
  return (
    <Screen>
      <View style={{ paddingTop: 12 }}><Txt v="label" c="accent">Platform admin</Txt><Txt v="h1">Overview</Txt></View><Gap />
      <Grid><Stat label="Customers" value={s.users} icon="users" /><Stat label="Gyms" value={s.gyms.total} icon="building" sub={s.gyms.active + ' active'} /><Stat label="Workouts logged" value={s.workoutsLogged} icon="activity" sub={s.workouts7d + ' in 7 days'} /><Stat label="Camera sessions" value={s.cameraSessions} icon="camera" /></Grid>
      <Gap /><Card accent><Txt v="label" c="onAccent">Demo revenue (no real money)</Txt><Txt v="h1" c="onAccent">{inr(s.demoRevenue)}</Txt><Txt style={{ color: t.onAccent }}>Platform commission {inr(s.demoCommission)} · {s.demoTxns} transactions</Txt></Card>
      <Section title="Needs approval" action={d.pend.length ? 'Open gyms' : undefined} onAction={() => nav.setTab('gyms')}>{d.pend.length ? d.pend.map((x) => <ListItem key={x.gym.id} title={x.gym.name} sub="Pending approval" icon="building" onPress={() => nav.setTab('gyms')} />) : <Card><Txt c="sub">No gyms are waiting.</Txt></Card>}</Section>
      <Section title="Memberships"><Card><Txt>{s.memberships.active} active · {s.memberships.pending} pending · {s.memberships.total} total</Txt><Txt v="small" c="sub">{s.referrals.converted} of {s.referrals.total} referrals converted · {s.newUsers30d} new customers in 30 days</Txt></Card></Section>
      <Section title="Accounts"><Card><Txt>{s.users} customers, {s.gymAccounts} gym accounts, {s.admins} admin{s.admins === 1 ? '' : 's'} · {s.suspendedAccounts} suspended</Txt></Card></Section>
    </Screen>
  );
}

/* ------------------------------ GYMS ------------------------------ */
export function AdminGyms() {
  const { repo, actor, confirm } = useApp(); const act = useAct(); const [mk, setMk] = useState(false); const [f, setF] = useState({ name: '', ownerUsername: '' });
  const d = useData(() => ({ gyms: A.listGyms(repo, actor), owners: repo.listAccounts(actor).filter((a) => a.role === 'gym' && !a.extra.staffRole || a.extra.staffRole === 'owner') }));
  const [owner, setOwner] = useState<string>('');
  return (
    <Screen>
      <Header title="Gyms" sub={d.gyms.length + ' on the platform'} big right={<Pressable onPress={() => setMk(true)} accessibilityLabel="Create gym" style={{ padding: 10 }}><Icon name="plus" color="#C6F432" /></Pressable>} />
      {d.gyms.length ? d.gyms.map(({ gym, stats }) => <Card key={gym.id} style={{ marginBottom: 10 }}>
        <Row between><View style={{ flex: 1 }}><Txt v="h3">{gym.name}</Txt><Txt v="small" c="sub">{stats.active} active members · {stats.pending} pending · {inr(stats.revenue.gross)} demo revenue</Txt></View><Pill label={gym.status} tone={gym.status === 'active' ? 'good' : gym.status === 'pending' ? 'warn' : 'bad'} /></Row>
        <Row wrap style={{ marginTop: 8 }}>
          {gym.status === 'pending' ? <Chip label="Approve" icon="check" onPress={() => act(() => A.approveGym(repo, actor, gym.id), 'Approved')} /> : null}
          {gym.status === 'active' ? <Chip label="Suspend" icon="alert" onPress={async () => { if (await confirm({ title: 'Suspend ' + gym.name + '?', message: 'The gym becomes read-only and cannot accept members.', confirmLabel: 'Suspend', danger: true })) act(() => A.suspendGym(repo, actor, gym.id), 'Suspended'); }} /> : null}
          {gym.status === 'suspended' ? <Chip label="Reactivate" icon="refresh" onPress={() => act(() => A.reactivateGym(repo, actor, gym.id), 'Reactivated')} /> : null}
        </Row></Card>) : <Empty icon="building" title="No gyms" />}
      <Sheet visible={mk} onClose={() => setMk(false)} title="Create gym">
        <Field label="Gym name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} autoCap="words" />
        <Txt v="label" c="sub">Owner account</Txt>{d.owners.map((o) => <ListItem key={o.id} title={o.displayName} sub={'@' + o.username} icon={owner === o.id ? 'check' : undefined} onPress={() => setOwner(o.id)} />)}
        <Btn label="Create (active)" disabled={!f.name.trim() || !owner} onPress={() => { const r = act(() => { const x = G.createGym(repo, actor, { name: f.name, ownerId: owner }); A.approveGym(repo, actor, x.gym.id); return x; }, 'Gym created'); if (r) { setMk(false); setF({ name: '', ownerUsername: '' }); } }} />
      </Sheet>
    </Screen>
  );
}

/* ------------------------------ USERS ------------------------------ */
export function AdminUsers() {
  const { repo, actor, session, setSession, confirm, toast } = useApp(); const act = useAct(); const [tab, setTab] = useState('user'); const [mk, setMk] = useState(false); const [f, setF] = useState({ displayName: '', username: '', password: '', role: 'user' as any }); const [pw, setPw] = useState<any>(null); const [np, setNp] = useState('');
  const d = useData(() => ({ users: A.listUsers(repo, actor), accs: repo.listAccounts(actor) }));
  const rows = tab === 'user' ? d.users.map((u) => ({ a: u.account, sub: u.workouts + ' workouts · ' + u.gyms + ' gyms' })) : d.accs.filter((a) => a.role === tab).map((a) => ({ a, sub: a.role === 'gym' ? (a.extra.staffRole || 'owner') : 'platform admin' }));
  const viewAs = (id: string) => { try { setSession(S.switchRole(repo, session, id)); } catch (e: any) { toast(e.message, 'bad'); } };
  return (
    <Screen>
      <Header title="Accounts" big right={<Pressable onPress={() => setMk(true)} accessibilityLabel="Create account" style={{ padding: 10 }}><Icon name="plus" color="#C6F432" /></Pressable>} />
      <Segmented options={[{ key: 'user', label: 'Customers' }, { key: 'gym', label: 'Gyms' }, { key: 'admin', label: 'Admins' }]} value={tab} onChange={setTab} /><Gap />
      {rows.map(({ a, sub }) => <Card key={a.id} style={{ marginBottom: 8 }} pad={14}>
        <Row between><View style={{ flex: 1 }}><Txt v="h3">{a.displayName}</Txt><Txt v="small" c="sub">@{a.username} · {sub}</Txt></View><Pill label={a.status} tone={a.status === 'active' ? 'good' : 'bad'} /></Row>
        <Row wrap style={{ marginTop: 8 }}>
          {a.id !== actor.id ? <Chip label="View as" icon="user" onPress={() => viewAs(a.id)} /> : null}
          {a.id !== actor.id ? <Chip label={a.status === 'active' ? 'Suspend' : 'Reactivate'} onPress={() => act(() => A.setAccountStatus(repo, actor, a.id, a.status === 'active' ? 'suspended' : 'active'), a.status === 'active' ? 'Suspended' : 'Reactivated')} /> : null}
          <Chip label="Reset password" icon="lock" onPress={() => { setPw(a); setNp(''); }} />
          {a.id !== actor.id ? <Chip label="Delete" icon="trash" onPress={async () => { if (await confirm({ title: 'Delete ' + a.displayName + '?', message: 'Removes the account and its data. This cannot be undone.', confirmLabel: 'Delete', danger: true })) act(() => A.deleteAccount(repo, actor, a.id), 'Deleted'); }} /> : null}
        </Row></Card>)}
      <Sheet visible={mk} onClose={() => setMk(false)} title="Create account"><Field label="Name" value={f.displayName} onChangeText={(v) => setF({ ...f, displayName: v })} autoCap="words" /><Field label="Username" value={f.username} onChangeText={(v) => setF({ ...f, username: v })} /><Field label="Password (8+ characters)" value={f.password} onChangeText={(v) => setF({ ...f, password: v })} secure /><Row wrap>{(['user', 'gym', 'admin'] as const).map((r) => <Chip key={r} label={r} on={f.role === r} onPress={() => setF({ ...f, role: r })} />)}</Row><Btn label="Create" onPress={() => { const r = act(() => A.createAccount(repo, actor, f), 'Account created'); if (r) { setMk(false); setF({ displayName: '', username: '', password: '', role: 'user' }); } }} /></Sheet>
      <Sheet visible={!!pw} onClose={() => setPw(null)} title={'Reset password: ' + (pw?.displayName || '')}><Field label="New password (8+ characters)" value={np} onChangeText={setNp} secure /><Btn label="Reset" onPress={() => { const r = act(() => A.resetPassword(repo, actor, pw.id, np), 'Password reset'); if (r) setPw(null); }} /></Sheet>
    </Screen>
  );
}

/* ------------------------------ CONTENT ------------------------------ */
export function AdminContent() {
  const { repo, actor } = useApp(); const act = useAct(); const [tab, setTab] = useState('ex'); const [q, setQ] = useState(''); const [ex, setEx] = useState<any>(null); const [cat, setCat] = useState(''); const [pct, setPct] = useState(''); const [br, setBr] = useState<any>(null); const [df, setDf] = useState<any>(null); const [sp, setSp] = useState<any>(null);
  const d = useData(() => ({ cats: A.categories(repo, actor), progs: A.listDefaultProgrammes(repo, actor), plans: A.listSubPlans(repo, actor), pct: P.commissionPct(repo), br: A.getBranding(repo), df: A.getDefaults(repo) }));
  const list = EXERCISES.filter((e) => !q.trim() || e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <Screen>
      <Header title="Content" sub="Library, templates, settings" big />
      <Segmented options={[{ key: 'ex', label: 'Exercises' }, { key: 'cat', label: 'Categories' }, { key: 'plans', label: 'Plans' }, { key: 'set', label: 'Settings' }]} value={tab} onChange={setTab} /><Gap />
      {tab === 'ex' ? <><Field value={q} onChangeText={setQ} placeholder="Search exercises" />{list.map((e) => <ListItem key={e.id} title={e.name} sub={e.cat + (e.off ? ' · disabled' : '') + ((e as any).custom ? ' · custom' : '')} right={<Pill label={e.off ? 'Off' : 'On'} tone={e.off ? 'bad' : 'good'} />} onPress={() => setEx({ id: e.id, name: e.name, desc: e.desc, safety: e.safety || '', off: !!e.off, cat: e.cat })} />)}</> : null}
      {tab === 'cat' ? <><Row wrap>{d.cats.map((c) => <Chip key={c} label={c} icon={A.CATEGORIES_DEFAULT.includes(c) ? undefined : 'x'} onPress={A.CATEGORIES_DEFAULT.includes(c) ? undefined : () => act(() => A.removeCategory(repo, actor, c), 'Removed')} />)}</Row><Gap /><Field label="New category" value={cat} onChangeText={setCat} autoCap="words" /><Btn label="Add category" onPress={() => { if (act(() => A.addCategory(repo, actor, cat), 'Added') !== undefined) setCat(''); }} /></> : null}
      {tab === 'plans' ? <>
        <Section title="Default programmes (templates for gyms)">{d.progs.length ? d.progs.map((p) => <ListItem key={p.id} title={p.name} sub={p.level + ' · ' + p.days.length + ' days'} right={<Pressable onPress={() => act(() => A.deleteDefaultProgramme(repo, actor, p.id), 'Deleted')} accessibilityLabel="Delete template"><Icon name="trash" size={18} color="#E5484D" /></Pressable>} />) : <Card><Txt c="sub">No templates.</Txt></Card>}</Section>
        <Section title="Gym subscription plans (demo)" action="Add" onAction={() => setSp({ name: '', priceMonthly: '', memberLimit: '', features: '' })}>{d.plans.map((p) => <ListItem key={p.id} title={p.name} sub={inr(p.priceMonthly) + '/month · up to ' + p.memberLimit + ' members'} />)}</Section>
      </> : null}
      {tab === 'set' ? <>
        <Card><Txt v="h3">Referral commission</Txt><Txt v="small" c="sub">Demo commission the platform earns when a referred member first pays. Currently {d.pct}%.</Txt><Field label="Percent (0-50)" value={pct || String(d.pct)} onChangeText={setPct} keyboard="numeric" /><Btn label="Save commission" kind="ghost" onPress={() => act(() => A.setCommissionPct(repo, actor, num(pct || String(d.pct))), 'Saved')} /></Card><Gap />
        <Card><Txt v="h3">Branding</Txt><Field label="App name" value={(br || d.br).appName} onChangeText={(v) => setBr({ ...(br || d.br), appName: v })} /><Field label="Accent colour (#RRGGBB)" value={(br || d.br).accent} onChangeText={(v) => setBr({ ...(br || d.br), accent: v })} /><Btn label="Save branding" kind="ghost" onPress={() => act(() => A.setBranding(repo, actor, br || d.br), 'Saved. Restart the app to see the new accent everywhere.')} /></Card><Gap />
        <Card><Txt v="h3">New-user defaults</Txt><Field label="Days per week (2-6)" value={String((df || d.df).daysPerWeek)} onChangeText={(v) => setDf({ ...(df || d.df), daysPerWeek: num(v) || 0 })} keyboard="numeric" /><Field label="Session minutes" value={String((df || d.df).sessionMin)} onChangeText={(v) => setDf({ ...(df || d.df), sessionMin: num(v) || 0 })} keyboard="numeric" /><Btn label="Save defaults" kind="ghost" onPress={() => act(() => A.setDefaults(repo, actor, df || d.df), 'Saved')} /></Card>
      </> : null}
      <Sheet visible={!!ex} onClose={() => setEx(null)} title={ex?.name}>{ex ? <><Field label="Description" value={ex.desc} onChangeText={(v) => setEx({ ...ex, desc: v })} multiline /><Field label="Safety note" value={ex.safety} onChangeText={(v) => setEx({ ...ex, safety: v })} multiline /><Toggle label="Available in the app" sub="Disabled exercises disappear from the library and new plans." value={!ex.off} onChange={(v) => setEx({ ...ex, off: !v })} /><Btn label="Save" onPress={() => { const r = act(() => A.editExercise(repo, actor, ex.id, { desc: ex.desc, safety: ex.safety, off: ex.off }), 'Saved'); if (r !== undefined || true) setEx(null); }} /></> : null}</Sheet>
      <Sheet visible={!!sp} onClose={() => setSp(null)} title="New subscription plan">{sp ? <><Field label="Name" value={sp.name} onChangeText={(v) => setSp({ ...sp, name: v })} /><Field label="Price per month (₹)" value={sp.priceMonthly} onChangeText={(v) => setSp({ ...sp, priceMonthly: v })} keyboard="numeric" /><Field label="Member limit" value={sp.memberLimit} onChangeText={(v) => setSp({ ...sp, memberLimit: v })} keyboard="numeric" /><Field label="Features (comma separated)" value={sp.features} onChangeText={(v) => setSp({ ...sp, features: v })} /><Btn label="Save plan" onPress={() => { const r = act(() => A.saveSubPlan(repo, actor, { name: sp.name, priceMonthly: num(sp.priceMonthly), memberLimit: Math.round(num(sp.memberLimit)), features: sp.features.split(',').map((x: string) => x.trim()).filter(Boolean) }), 'Saved'); if (r) setSp(null); }} /></> : null}</Sheet>
    </Screen>
  );
}

/* ------------------------------ SYSTEM ------------------------------ */
export function AdminSystem() {
  const { repo, actor, session, setSession, confirm, toast, modelStatus, bump } = useApp(); const act = useAct(); const [tab, setTab] = useState('pay'); const [imp, setImp] = useState<any>(null); const [busy, setBusy] = useState(false);
  const d = useData(() => ({ tx: P.listTxns(repo, actor), gyms: Object.fromEntries((repo.list(actor, 'gym') as any[]).map((g) => [g.id, g.name])), diag: A.diagnostics(repo, actor, { cameraModel: modelStatus, provider: 'Demo provider (no real payments)' }) as any, audit: A.activity(repo, actor, 80), refs: G.listReferrals(repo, actor) as any[], targets: S.demoSwitchTargets(repo, session) }), [modelStatus]);
  const rev = P.revenue(d.tx);
  return (
    <Screen>
      <Header title="System" sub="Payments, audit, backup" big />
      <Segmented options={[{ key: 'pay', label: 'Payments' }, { key: 'ref', label: 'Referrals' }, { key: 'audit', label: 'Audit' }, { key: 'diag', label: 'Health' }, { key: 'data', label: 'Data' }]} value={tab} onChange={setTab} /><Gap />
      {tab === 'pay' ? <><Callout tone="info" title="Demo payments">All transactions are simulated. The payment provider interface is ready for a real gateway (for example FitnessPay) in a later version.</Callout><Gap /><Grid><Stat label="Gross" value={inr(rev.gross)} /><Stat label="Commission" value={inr(rev.commission)} /></Grid><Gap />{d.tx.length ? d.tx.slice(0, 50).map((x) => <ListItem key={x.id} title={d.gyms[x.gymId] || 'Gym'} sub={x.description + ' · ' + dt(x.at) + ' · ' + x.status} right={<Txt v="h3">{inr(x.amount)}</Txt>} />) : <Empty icon="card" title="No transactions" />}</> : null}
      {tab === 'ref' ? (d.refs.length ? d.refs.map((r: any) => <ListItem key={r.id} title={'Code ' + r.code} sub={(d.gyms[r.gymId] || 'Gym') + ' · ' + r.status + (r.commission ? ' · commission ' + inr(r.commission) : '')} />) : <Empty icon="users" title="No referrals" />) : null}
      {tab === 'audit' ? (d.audit.length ? d.audit.map((r: any) => <ListItem key={r.seq} title={r.action} sub={dt(r.at) + ' · ' + r.actorRole + (r.detail ? ' · ' + r.detail : '')} />) : <Empty icon="clock" title="No audit entries" />) : null}
      {tab === 'diag' ? <Card>{[['Schema version', d.diag.schemaVersion], ['Accounts', d.diag.accounts], ['Records', d.diag.records], ['Audit entries', d.diag.auditEntries], ['Exercises', d.diag.exercisesInLibrary], ['Foods', d.diag.foodsInDatabase], ['DB integrity', d.diag.integrity], ['Pose model', d.diag.cameraModel || 'not checked'], ['Payments', d.diag.provider]].map(([k, v]) => <Row key={String(k)} between style={{ paddingVertical: 5 }}><Txt c="sub">{k}</Txt><Txt v="h3" style={{ maxWidth: '60%', textAlign: 'right' }}>{String(v)}</Txt></Row>)}</Card> : null}
      {tab === 'data' ? <>
        <Callout tone="warn">Exports contain every account's records, including password hashes. Keep them private.</Callout><Gap />
        <Btn label="Export everything" icon="upload" disabled={busy} onPress={async () => { setBusy(true); try { await shareJson('kinetic-platform-export.json', A.exportAll(repo, actor)); } catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); } }} /><Gap h={8} />
        <Btn label="Import a platform export" icon="download" kind="ghost" onPress={async () => { try { const j = await pickJson(); if (j) setImp(j); } catch (e: any) { toast(e.message, 'bad'); } }} /><Gap h={8} />
        <Btn label="Reset demo data" icon="refresh" kind="danger" onPress={async () => { if (await confirm({ title: 'Reset the demo?', message: 'Deletes everything and re-creates the seeded demo gyms and users. You will be signed out.', confirmLabel: 'Reset', danger: true })) { try { A.resetDemo(repo, actor); setSession(null); bump(); } catch (e: any) { toast(e.message, 'bad'); } } }} />
        <Section title="Demo role switching"><Txt v="small" c="sub" style={{ marginBottom: 8 }}>Open the app as another account to test its screens. The Accounts tab has the same option.</Txt>{d.targets.filter((a) => a.id !== actor.id).map((a) => <ListItem key={a.id} title={a.displayName} sub={a.role} icon="user" onPress={() => { try { setSession(S.switchRole(repo, session, a.id)); } catch (e: any) { toast(e.message, 'bad'); } }} />)}</Section>
      </> : null}
      <Sheet visible={!!imp} onClose={() => setImp(null)} title="Import export"><Callout tone="warn">This replaces ALL data on this device.</Callout><Btn label="Replace everything" kind="danger" onPress={() => { act(() => { const r: any = A.importAll(repo, actor, imp); toast('Imported', 'good'); return r; }); setImp(null); setSession(null); }} /></Sheet>
    </Screen>
  );
}
registerScreens({ overview: AdminOverview, gyms: AdminGyms, users: AdminUsers, content: AdminContent, system: AdminSystem });
