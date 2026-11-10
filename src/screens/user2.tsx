import React, { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import FIT, { EX, FOODS, FOOD, DAY, ymd } from '../engine';
import { useApp, useData, useAct } from '../app/context';
import { useNav, registerScreens } from '../app/nav';
import { Screen, Header, Txt, Card, Btn, Row, Gap, Chip, Pill, Section, ListItem, Empty, Stat, Grid, Segmented, Sheet, Callout, Field, Ring, Bars, LineChart, MacroBar } from '../ui/kit';
import { Icon } from '../ui/icons';
import * as W from '../services/workouts';
import * as N from '../services/nutrition';
import * as C from '../services/coach';
import { exName } from './user1';

const SLOT_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks', custom: 'Other' };
const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

/* ------------------------------ NUTRITION ------------------------------ */
export function Nutrition() {
  const { repo, actor, theme: t } = useApp();
  const today = ymd(repo.now()); const [date, setDate] = useState(today); const [slot, setSlot] = useState<N.Slot | null>(null); const [edit, setEdit] = useState<{ meal: N.Meal; item: any } | null>(null);
  const d = useData(() => ({ v: N.dayView(repo, actor, date), tg: N.targetsFor(repo, actor), week: N.weekView(repo, actor, repo.now()) }), [date]);
  const shift = (n: number) => setDate(ymd(new Date(date + 'T12:00:00').getTime() + n * DAY));
  const isToday = date === today; const tg = d.tg; const tot = d.v.totals;
  return (
    <Screen>
      <Header title="Nutrition" sub="Food diary" big />
      <Row between><Pressable onPress={() => shift(-1)} accessibilityLabel="Previous day" style={{ padding: 10 }}><Icon name="left" color={t.text} /></Pressable><Txt v="h3">{isToday ? 'Today' : new Date(date + 'T12:00:00').toDateString()}</Txt><Pressable onPress={() => shift(1)} disabled={isToday} accessibilityLabel="Next day" style={{ padding: 10, opacity: isToday ? 0.3 : 1 }}><Icon name="right" color={t.text} /></Pressable></Row>
      <Card>
        <Row gap={16}><Ring value={tot.kcal} max={tg?.kcal || 2000} size={110} label="KCAL" sub={tg ? 'of ' + tg.kcal : ''} />
          <View style={{ flex: 1, gap: 10 }}><MacroBar label="Protein" value={tot.p} target={tg?.protein} color={t.accent} /><MacroBar label="Carbs" value={tot.c} target={tg?.carbs} color={t.info} /><MacroBar label="Fat" value={tot.f} target={tg?.fat} color={t.warn} /><MacroBar label="Fibre" value={tot.fi} target={tg?.fibre} color={t.good} /></View></Row>
        <Gap h={8} /><Txt v="small" c="mute">{tg ? 'Targets are estimates from your profile' + (tg.overridden ? ' (edited by you)' : '') + ', not medical advice.' : 'Complete your profile to see targets.'}</Txt>
      </Card>
      <Gap />
      {Object.keys(SLOT_LABEL).map((s) => { const meals = d.v.bySlot[s] || []; const items = meals.flatMap((m) => m.items.map((i) => ({ m, i }))); const kc = items.reduce((a, x) => a + x.i.kcal, 0);
        if (s === 'custom' && !items.length) return null;
        return (
          <Card key={s} style={{ marginBottom: 10 }} pad={14}>
            <Row between><View><Txt v="h3">{SLOT_LABEL[s]}</Txt><Txt v="small" c="sub">{items.length ? Math.round(kc) + ' kcal' : 'Nothing logged'}</Txt></View><Pressable onPress={() => setSlot(s as N.Slot)} accessibilityLabel={'Add food to ' + SLOT_LABEL[s]} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" color={t.onAccent} /></Pressable></Row>
            {items.map(({ m, i }) => <Pressable key={i.id} onPress={() => setEdit({ meal: m, item: i })} accessibilityLabel={'Edit ' + i.name} style={{ paddingVertical: 8 }}><Row between><View style={{ flex: 1 }}><Txt>{i.name}{i.estimate ? '  ' : ''}{i.estimate ? <Txt v="small" c="warn">estimate</Txt> : null}</Txt><Txt v="small" c="mute">{i.qty} × {i.unit || 'serving'} · P {Math.round(i.p)} C {Math.round(i.c)} F {Math.round(i.f)}</Txt></View><Txt v="h3">{Math.round(i.kcal)}</Txt></Row></Pressable>)}
          </Card>); })}
      <Section title="Last 7 days"><Card><Bars data={d.week.map((w: any) => ({ label: w.label[0], value: Math.round(w.kcal) }))} /><Txt v="small" c="mute" style={{ marginTop: 6 }}>Calories logged per day. Days without entries show as empty, not as zero intake.</Txt></Card></Section>
      <Gap />
      <TargetsEditor />
      <AddFood slot={slot} date={date} onClose={() => setSlot(null)} />
      <EditItem ctx={edit} onClose={() => setEdit(null)} />
    </Screen>
  );
}
function TargetsEditor() {
  const { repo, actor } = useApp(); const act = useAct(); const [open, setOpen] = useState(false); const [k, setK] = useState(''); const [p, setP] = useState('');
  const tg = useData(() => N.targetsFor(repo, actor));
  if (!tg) return null;
  return <>
    <Btn label="Edit daily targets" kind="ghost" icon="target" onPress={() => { setK(String(tg.kcal)); setP(String(tg.protein)); setOpen(true); }} />
    <Sheet visible={open} onClose={() => setOpen(false)} title="Daily targets">
      <Callout tone="info">Estimated from your profile. Keep them within a safe range; speak to a dietitian for medical needs.</Callout>
      <Field label="Calories (kcal)" value={k} onChangeText={setK} keyboard="numeric" /><Field label="Protein (g)" value={p} onChangeText={setP} keyboard="numeric" />
      <Btn label="Save targets" onPress={() => { const ok = act(() => { N.setTargetOverride(repo, actor, { kcal: num(k), protein: num(p) }); return true; }, 'Targets saved'); if (ok) setOpen(false); }} />
      <Btn label="Reset to estimate" kind="ghost" onPress={() => { act(() => N.setTargetOverride(repo, actor, null), 'Reset'); setOpen(false); }} />
    </Sheet>
  </>;
}
function AddFood({ slot, date, onClose }: { slot: N.Slot | null; date: string; onClose: () => void }) {
  const { repo, actor, theme: t, llm, toast } = useApp(); const act = useAct(); const [mode, setMode] = useState('search'); const [q, setQ] = useState(''); const [pick, setPick] = useState<string | null>(null); const [qty, setQty] = useState('1');
  const [cn, setCn] = useState(''); const [ck, setCk] = useState(''); const [cp, setCp] = useState(''); const [cc, setCc] = useState(''); const [cf, setCf] = useState(''); const [cfi, setCfi] = useState('');
  const [busy, setBusy] = useState(false); const [est, setEst] = useState<any[] | null>(null);
  const results: any[] = q.trim() ? N.searchFoods(q).slice(0, 25) : FOODS.slice(0, 25);
  const close = () => { setPick(null); setQ(''); setQty('1'); setEst(null); setMode('search'); onClose(); };
  const photo = async (camera: boolean) => {
    if (!llm) { toast('Photo analysis needs an AI key. Add one in Profile → AI settings. You can still log food by search or manually.', 'info'); return; }
    try {
      const IP = await import('expo-image-picker');
      const perm = camera ? await IP.requestCameraPermissionsAsync() : await IP.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { toast('Permission was not granted.', 'info'); return; }
      const r = camera ? await IP.launchCameraAsync({ base64: true, quality: 0.5 }) : await IP.launchImageLibraryAsync({ base64: true, quality: 0.5 });
      if (r.canceled || !r.assets?.[0]?.base64) return;
      setBusy(true);
      const text = await llm.complete('You identify foods in photos for a calorie diary. Reply with ONLY a JSON array, no prose. Each element: {"name": string, "kcal": number, "p": number, "c": number, "f": number, "fi": number}. Estimate one typical portion visible. Prefer Indian food names where appropriate.', 'Identify each food in this meal photo and estimate nutrition for the portion shown.', [{ mediaType: r.assets[0].mimeType || 'image/jpeg', base64: r.assets[0].base64! }]);
      const m = text.match(/\[[\s\S]*\]/); const arr = m ? JSON.parse(m[0]) : [];
      if (!Array.isArray(arr) || !arr.length) throw new Error('The AI could not identify any food. Try a clearer photo or log it manually.');
      setEst(arr.slice(0, 8).map((x: any) => ({ name: String(x.name || 'Food').slice(0, 60), kcal: Math.max(0, Math.round(+x.kcal || 0)), p: +x.p || 0, c: +x.c || 0, f: +x.f || 0, fi: +x.fi || 0, keep: true })));
    } catch (e: any) { toast(e.message || 'Photo analysis failed', 'bad'); } finally { setBusy(false); }
  };
  const sel = pick ? FOOD[pick] : null;
  return (
    <Sheet visible={!!slot} onClose={close} title={'Add to ' + (slot ? SLOT_LABEL[slot] : '')}>
      <Segmented options={[{ key: 'search', label: 'Search' }, { key: 'custom', label: 'Manual' }, { key: 'photo', label: 'Photo' }]} value={mode} onChange={(m) => { setMode(m); setPick(null); }} />
      {mode === 'search' ? (sel ? <>
        <Card pad={14}><Txt v="h3">{sel.name}</Txt><Txt v="small" c="sub">{sel.unit} · {sel.kcal} kcal · P {sel.p} C {sel.c} F {sel.f} · fibre {sel.fi ?? 0} g</Txt></Card>
        <Field label="Number of servings" value={qty} onChangeText={setQty} keyboard="numeric" hint={'Total: about ' + Math.round(sel.kcal * (num(qty) || 0)) + ' kcal (approximate)'} />
        <Row><Btn label="Back" kind="ghost" full={false} onPress={() => setPick(null)} /><View style={{ flex: 1 }}><Btn label="Add" icon="plus" onPress={() => { const r = act(() => N.addFood(repo, actor, date, slot!, sel.id, num(qty)), 'Added'); if (r) close(); }} /></View></Row>
      </> : <>
        <Field value={q} onChangeText={setQ} placeholder="Search roti, dal, paneer, poha…" />
        {results.length ? results.map((f) => <ListItem key={f.id} title={f.name} sub={f.unit + ' · ' + f.kcal + ' kcal'} onPress={() => { setPick(f.id); setQty('1'); }} />) : <Empty icon="search" title="No match" text="Use the Manual tab to add it yourself." />}
      </>) : null}
      {mode === 'custom' ? <>
        <Field label="Food name" value={cn} onChangeText={setCn} autoCap="sentences" /><Field label="Calories (kcal)" value={ck} onChangeText={setCk} keyboard="numeric" />
        <Row><View style={{ flex: 1 }}><Field label="Protein g" value={cp} onChangeText={setCp} keyboard="numeric" /></View><View style={{ flex: 1 }}><Field label="Carbs g" value={cc} onChangeText={setCc} keyboard="numeric" /></View></Row>
        <Row><View style={{ flex: 1 }}><Field label="Fat g" value={cf} onChangeText={setCf} keyboard="numeric" /></View><View style={{ flex: 1 }}><Field label="Fibre g" value={cfi} onChangeText={setCfi} keyboard="numeric" /></View></Row>
        <Btn label="Add food" icon="plus" onPress={() => { const r = act(() => N.addCustom(repo, actor, date, slot!, { name: cn, kcal: num(ck), p: num(cp) || 0, c: num(cc) || 0, f: num(cf) || 0, fi: num(cfi) || 0 }), 'Added'); if (r) { setCn(''); setCk(''); setCp(''); setCc(''); setCf(''); setCfi(''); close(); } }} />
      </> : null}
      {mode === 'photo' ? (est ? <>
        <Callout tone="warn" title="AI estimate">These numbers are rough estimates from a photo. Untick anything wrong, then add. You can edit amounts afterwards.</Callout>
        {est.map((x, i) => <Card key={i} pad={12} onPress={() => setEst(est.map((y, j) => (j === i ? { ...y, keep: !y.keep } : y)))}><Row between><View style={{ flex: 1 }}><Txt v="h3" style={{ opacity: x.keep ? 1 : 0.4 }}>{x.name}</Txt><Txt v="small" c="sub">{x.kcal} kcal · P {Math.round(x.p)} C {Math.round(x.c)} F {Math.round(x.f)}</Txt></View><Icon name={x.keep ? 'check' : 'x'} color={x.keep ? t.good : t.mute} /></Row></Card>)}
        <Btn label="Add selected" onPress={() => { act(() => est.filter((x) => x.keep).forEach((x) => N.addCustom(repo, actor, date, slot!, { ...x, estimate: true })), 'Added as estimates'); close(); }} />
      </> : <>
        <Callout tone="info">{llm ? 'Your photo is sent to your configured AI service to estimate the meal. It is not stored by this app.' : 'Photo analysis is off. Add your own AI API key in Profile → AI settings to enable it. Nothing is sent anywhere until you do.'}</Callout>
        <Btn label={busy ? 'Analysing…' : 'Take a photo'} icon="camera" disabled={busy} onPress={() => photo(true)} /><Btn label="Choose from gallery" icon="image" kind="ghost" disabled={busy} onPress={() => photo(false)} />
      </>) : null}
    </Sheet>
  );
}
function EditItem({ ctx, onClose }: { ctx: { meal: N.Meal; item: any } | null; onClose: () => void }) {
  const { repo, actor } = useApp(); const act = useAct(); const [qty, setQty] = useState(''); const [kc, setKc] = useState(''); const [swap, setSwap] = useState(false); const [q, setQ] = useState('');
  React.useEffect(() => { if (ctx) { setQty(String(ctx.item.qty)); setKc(String(Math.round(ctx.item.kcal))); setSwap(false); setQ(''); } }, [ctx]);
  const i = ctx?.item; const isFood = !!(i && i.foodId && FOOD[i.foodId]);
  return (
    <Sheet visible={!!ctx} onClose={onClose} title={i?.name}>
      {i ? (swap ? <>
        <Txt c="sub">Pick what it really was:</Txt><Field value={q} onChangeText={setQ} placeholder="Search foods" />
        {(q.trim() ? N.searchFoods(q) : FOODS).slice(0, 20).map((f: any) => <ListItem key={f.id} title={f.name} sub={f.unit + ' · ' + f.kcal + ' kcal'} onPress={() => { act(() => N.editItem(repo, actor, ctx!.meal.id, i.id, { foodId: f.id, qty: num(qty) || 1 }), 'Corrected'); onClose(); }} />)}
      </> : <>
        {i.estimate ? <Callout tone="warn">This entry is an estimate.</Callout> : null}
        {isFood ? <><Field label="Servings" value={qty} onChangeText={setQty} keyboard="numeric" /><Btn label="Update servings" onPress={() => { act(() => N.editItem(repo, actor, ctx!.meal.id, i.id, { qty: num(qty) }), 'Updated'); onClose(); }} /><Btn label="It was a different food" kind="ghost" icon="swap" onPress={() => setSwap(true)} /></> : <><Field label="Calories (kcal)" value={kc} onChangeText={setKc} keyboard="numeric" /><Btn label="Update calories" onPress={() => { act(() => N.editItem(repo, actor, ctx!.meal.id, i.id, { kcal: num(kc) }), 'Updated'); onClose(); }} /><Btn label="Match to a known food" kind="ghost" icon="swap" onPress={() => setSwap(true)} /></>}
        <Btn label="Delete entry" kind="danger" icon="trash" onPress={() => { act(() => N.deleteItem(repo, actor, ctx!.meal.id, i.id), 'Removed'); onClose(); }} />
      </>) : null}
    </Sheet>
  );
}

/* ------------------------------ COACH ------------------------------ */
const SUGGEST = ['What should I train today?', 'How am I progressing?', 'What should I eat after training?', 'I missed two workouts. How should I resume?', 'What can I do at home without equipment?', 'Why is my workout getting harder?'];
export function Coach() {
  const { repo, actor, theme: t, llm, toast, confirm } = useApp(); const nav = useNav(); const bump = useApp().bump; const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const ref = React.useRef<ScrollView>(null);
  const msgs = useData(() => C.history(repo, actor).slice().sort((a, b) => a.at - b.at));
  const send = async (q: string) => { if (!q.trim() || busy) return; setBusy(true); setText(''); bump(); try { await C.ask(repo, actor, q, llm); } catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); bump(); setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 100); } };
  return (
    <Screen scroll={false} pad={false}>
      <View style={{ paddingHorizontal: 16 }}><Header title="Coach" sub={llm ? 'AI-assisted · safety rules stay local' : 'Rules-based · works offline'} big right={msgs.length ? <Pressable onPress={async () => { if (await confirm({ title: 'Clear chat?', message: 'This deletes the conversation on this device.', confirmLabel: 'Clear', danger: true })) { C.clearChat(repo, actor); bump(); } }} accessibilityLabel="Clear chat" style={{ padding: 10 }}><Icon name="trash" color={t.mute} /></Pressable> : undefined} /></View>
      <ScrollView ref={ref} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled" onContentSizeChange={() => ref.current?.scrollToEnd({ animated: false })}>
        {!msgs.length ? <><Callout tone="info">I answer from your own plan, workouts and food log. I can't diagnose injuries or give medical advice, and I never invent history. {llm ? 'An AI service is configured; answers it writes are labelled "AI".' : 'No AI service is configured, so every answer comes from built-in rules and is labelled "Local rules".'}</Callout><Row wrap>{SUGGEST.map((s) => <Chip key={s} label={s} onPress={() => send(s)} />)}</Row></> : null}
        {msgs.map((m) => m.role === 'user'
          ? <View key={m.id} style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: t.accent, borderRadius: 18, borderBottomRightRadius: 4, padding: 12 }}><Txt style={{ color: t.onAccent }}>{m.text}</Txt></View>
          : <View key={m.id} style={{ alignSelf: 'flex-start', maxWidth: '92%', backgroundColor: m.flagged ? t.bad + '22' : t.surface, borderRadius: 18, borderBottomLeftRadius: 4, padding: 12, gap: 6, borderWidth: 1, borderColor: m.flagged ? t.bad : t.border }}>
              <Txt>{m.text}</Txt>
              <Row wrap><Pill label={m.source === 'ai' ? 'AI' : 'Local rules'} tone={m.source === 'ai' ? 'info' : 'mute'} />{m.flagged ? <Pill label="Safety" tone="bad" /> : null}</Row>
              {m.actions?.length ? <Row wrap>{m.actions.map((a: any, i: number) => <Chip key={i} label={a.label} onPress={() => { if (a.type === 'tab') nav.setTab(a.tab); else if (a.type === 'screen') nav.push(a.screen, a.params); }} />)}</Row> : null}
            </View>)}
        {busy ? <Txt c="mute">Coach is typing…</Txt> : null}
      </ScrollView>
      <Row style={{ padding: 12, borderTopWidth: 1, borderColor: t.border, backgroundColor: t.bg }} gap={8}>
        <View style={{ flex: 1 }}><Field value={text} onChangeText={setText} placeholder="Ask about training, food, recovery…" autoCap="sentences" /></View>
        <Pressable onPress={() => send(text)} disabled={busy || !text.trim()} accessibilityLabel="Send" style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', opacity: busy || !text.trim() ? 0.4 : 1 }}><Icon name="right" color={t.onAccent} /></Pressable>
      </Row>
    </Screen>
  );
}

/* ------------------------------ PROGRESS ------------------------------ */
export function Progress() {
  const { repo, actor, theme: t } = useApp(); const act = useAct(); const now = repo.now(); const [tab, setTab] = useState('overview'); const [exSel, setExSel] = useState<string | null>(null); const [wOpen, setWOpen] = useState(false); const [wv, setWv] = useState(''); const [mOpen, setMOpen] = useState(false); const [mv, setMv] = useState({ waist: '', chest: '', hips: '', arm: '' });
  const d = useData(() => {
    const ws = W.listWorkouts(repo, actor), prof: any = repo.get(actor, 'profile', actor.id), pd = W.getPlanDoc(repo, actor), meals = N.listMeals(repo, actor);
    const weights = (repo.list(actor, 'weight', { ownerId: actor.id }) as any[]).sort((a, b) => a.at - b.at), meas = (repo.list(actor, 'measure', { ownerId: actor.id }) as any[]).sort((a, b) => a.at - b.at);
    return { ws, prof, weights, meas, tot: FIT.totals(ws), wk: FIT.weeklyCounts(ws, now, 8), prs: FIT.personalRecords(ws), rep: FIT.weeklyReport({ profile: prof, plan: pd?.plan, sessions: ws, meals, weights }, now), cam: W.listCameraSessions(repo, actor) };
  });
  const series = exSel ? FIT.exerciseSeries(d.ws, exSel) : [];
  const logWeight = () => { const kg = num(wv); if (!(kg >= 25 && kg <= 400)) { act(() => { throw new Error('Enter a weight between 25 and 400 kg.'); }); return; } act(() => { repo.put(actor, 'weight', { id: 'wt_' + actor.id + '_' + now, ownerId: actor.id, at: now, date: ymd(now), kg } as any); }, 'Weight logged'); setWOpen(false); setWv(''); };
  const logMeas = () => { const o: any = { id: 'ms_' + actor.id + '_' + now, ownerId: actor.id, at: now, date: ymd(now) }; let any = false; (['waist', 'chest', 'hips', 'arm'] as const).forEach((k) => { const v = num(mv[k]); if (v > 0 && v < 300) { o[k] = v; any = true; } }); if (!any) { act(() => { throw new Error('Enter at least one measurement in cm.'); }); return; } act(() => { repo.put(actor, 'measure', o); }, 'Measurements saved'); setMOpen(false); setMv({ waist: '', chest: '', hips: '', arm: '' }); };
  const prWithData = d.prs.filter((p: any) => EX[p.exId]);
  return (
    <Screen>
      <Header title="Progress" sub="Your numbers" big />
      <Segmented options={[{ key: 'overview', label: 'Overview' }, { key: 'report', label: 'Weekly' }, { key: 'records', label: 'Records' }, { key: 'body', label: 'Body' }]} value={tab} onChange={setTab} />
      <Gap />
      {!d.ws.length && tab !== 'body' ? <Empty icon="chart" title="No data yet" text="Finish a workout and your charts, records and weekly report will appear here. Nothing is shown until it is real." /> : null}
      {d.ws.length && tab === 'overview' ? <>
        <Grid><Stat label="Workouts" value={d.tot.sessions} icon="activity" /><Stat label="Minutes" value={d.tot.minutes} icon="clock" /><Stat label="Sets" value={d.tot.sets} icon="repeat" /><Stat label="Reps" value={d.tot.reps} icon="zap" /></Grid>
        <Section title="Workouts per week"><Card><Bars data={d.wk.map((w: any) => ({ label: w.label, value: w.count }))} /></Card></Section>
        {d.cam.length ? <Section title="Camera sessions"><Card><Txt v="h3">{d.cam.length} analysed</Txt><Txt v="small" c="sub">{d.cam.reduce((s: number, c: any) => s + c.reps, 0)} reps counted · average {Math.round(d.cam.reduce((s: number, c: any) => s + c.usablePct, 0) / d.cam.length)}% frames analysable. Camera counts are estimates.</Txt></Card></Section> : null}
      </> : null}
      {d.ws.length && tab === 'report' ? <>
        <Card accent><Txt v="label" c="onAccent">Last 7 days</Txt><Txt v="h1" c="onAccent">{d.rep.sessions} of {d.rep.target} sessions</Txt>{d.rep.consistency != null ? <Txt style={{ color: t.onAccent }}>Consistency {d.rep.consistency}%</Txt> : null}</Card>
        {([['Completed', d.rep.completed, 'check'], ['Improved', d.rep.improved, 'zap'], ['Needs attention', d.rep.attention, 'alert'], ['Suggested adjustments', d.rep.adjustments, 'sliders'], ['Next week', d.rep.next, 'calendar']] as any[]).map(([title, list, ic]) => list.length ? <Section key={title} title={title}><Card>{list.map((x: string, i: number) => <Row key={i} gap={10} style={{ alignItems: 'flex-start', paddingVertical: 4 }}><Icon name={ic} size={16} color={t.accentText} /><Txt style={{ flex: 1 }}>{x}</Txt></Row>)}</Card></Section> : null)}
        {d.rep.nutrition && !d.rep.nutrition.insufficient ? <Section title="Nutrition"><Card><Txt>About {d.rep.nutrition.avgKcal} kcal and {d.rep.nutrition.avgProtein} g protein on {d.rep.nutrition.days} logged days.</Txt></Card></Section> : <Section title="Nutrition"><Card><Txt c="sub">Log at least 3 days of meals to see a nutrition summary.</Txt></Card></Section>}
        {d.rep.weightNote ? <Txt v="small" c="mute" style={{ marginTop: 8 }}>{d.rep.weightNote}</Txt> : null}
      </> : null}
      {d.ws.length && tab === 'records' ? <>
        <Txt v="small" c="mute">Based on sets you completed. Tap an exercise for its trend.</Txt><Gap h={8} />
        {prWithData.map((p: any) => <Card key={p.exId} onPress={() => setExSel(p.exId)} pad={14} style={{ marginBottom: 8 }}><Txt v="h3">{exName(p.exId)}</Txt><Txt v="small" c="sub">{p.maxWeight ? 'Heaviest ' + p.maxWeight + ' kg · ' : ''}{p.maxReps ? 'most reps ' + p.maxReps : ''}{p.maxSecs ? ' · longest hold ' + p.maxSecs + ' s' : ''}</Txt></Card>)}
        <Sheet visible={!!exSel} onClose={() => setExSel(null)} title={exSel ? exName(exSel) : ''}>
          {series.length > 1 ? <LineChart points={series.map((s: any) => ({ label: s.date.slice(5), value: s.top || s.reps || s.secs }))} unit={series.some((s: any) => s.top) ? ' kg' : series.some((s: any) => s.reps) ? ' reps' : ' s'} /> : <Txt c="sub">Two or more sessions are needed to draw a trend.</Txt>}
          {series.slice().reverse().slice(0, 8).map((s: any, i: number) => <Txt key={i} v="small" c="sub">{s.date}: {s.sets} sets{s.top ? ', top ' + s.top + ' kg' : ''}, {s.reps} reps{s.secs ? ', ' + s.secs + ' s' : ''}</Txt>)}
        </Sheet>
      </> : null}
      {tab === 'body' ? <>
        <Section title="Weight" action="Log" onAction={() => setWOpen(true)}>
          <Card>{d.weights.length > 1 ? <LineChart points={d.weights.slice(-12).map((w: any) => ({ label: w.date.slice(5), value: w.kg }))} unit=" kg" /> : <Txt c="sub">{d.weights.length ? 'Latest: ' + d.weights[0].kg + ' kg. Log again to see a trend.' : 'No weight logged yet. Logging is optional.'}</Txt>}{d.weights.length ? <Txt v="small" c="mute" style={{ marginTop: 8 }}>Weight is one signal among many; it moves day to day.</Txt> : null}</Card>
        </Section>
        <Section title="Measurements" action="Add" onAction={() => setMOpen(true)}>
          {d.meas.length ? d.meas.slice().reverse().slice(0, 6).map((m: any) => <Card key={m.id} pad={12} style={{ marginBottom: 8 }}><Txt v="small" c="mute">{m.date}</Txt><Txt>{(['waist', 'chest', 'hips', 'arm'] as const).filter((k) => m[k]).map((k) => k + ' ' + m[k] + ' cm').join(' · ')}</Txt></Card>) : <Card><Txt c="sub">No measurements yet.</Txt></Card>}
        </Section>
        <Sheet visible={wOpen} onClose={() => setWOpen(false)} title="Log weight"><Field label="Weight (kg)" value={wv} onChangeText={setWv} keyboard="numeric" /><Btn label="Save" onPress={logWeight} /></Sheet>
        <Sheet visible={mOpen} onClose={() => setMOpen(false)} title="Add measurements">{(['waist', 'chest', 'hips', 'arm'] as const).map((k) => <Field key={k} label={k[0].toUpperCase() + k.slice(1) + ' (cm)'} value={mv[k]} onChangeText={(v) => setMv({ ...mv, [k]: v })} keyboard="numeric" />)}<Btn label="Save" onPress={logMeas} /></Sheet>
      </> : null}
    </Screen>
  );
}
registerScreens({ nutrition: Nutrition, coach: Coach, progress: Progress });
