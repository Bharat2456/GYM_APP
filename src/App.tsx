import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Modal, Pressable, useColorScheme, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Repo } from './db/repo';
import { openExpoDb } from './db/expoAdapter';
import { migrate } from './db/schema';
import { ensureSeeded } from './db/seed';
import * as A from './services/admin';
import * as S from './services/session';
import * as G from './services/gym';
import * as NT from './services/notifications';
import { anthropicClient, LlmClient } from './services/coach';
import { applyLibrary } from './engine';
import { AppContext, ConfirmOpts } from './app/context';
import { Shell, TabDef } from './app/nav';
import { ThemeCtx, Txt, Btn, Card, Gap, ErrorBoundary } from './ui/kit';
import { darkTheme, lightTheme, withAccent } from './theme/theme';
import { loadAiConfig, notifier } from './app/platform';
import { LoginScreen, Onboarding } from './screens/auth';
import './screens/user1'; import './screens/user2'; import './screens/user3'; import './screens/gym'; import './screens/admin'; import './camera/screens';

const TABS: Record<string, TabDef[]> = {
  user: [{ key: 'home', label: 'Home', icon: 'home', screen: 'home' }, { key: 'train', label: 'Train', icon: 'activity', screen: 'train' }, { key: 'nutrition', label: 'Food', icon: 'food', screen: 'nutrition' }, { key: 'progress', label: 'Progress', icon: 'chart', screen: 'progress' }, { key: 'coach', label: 'Coach', icon: 'chat', screen: 'coach' }],
  gym: [{ key: 'dashboard', label: 'Home', icon: 'home', screen: 'dashboard' }, { key: 'members', label: 'Members', icon: 'users', screen: 'members' }, { key: 'programmes', label: 'Plans', icon: 'award', screen: 'programmes' }, { key: 'engage', label: 'Engage', icon: 'bell', screen: 'engage' }, { key: 'more', label: 'More', icon: 'more', screen: 'more' }],
  admin: [{ key: 'overview', label: 'Overview', icon: 'chart', screen: 'overview' }, { key: 'gyms', label: 'Gyms', icon: 'building', screen: 'gyms' }, { key: 'users', label: 'Accounts', icon: 'users', screen: 'users' }, { key: 'content', label: 'Content', icon: 'book', screen: 'content' }, { key: 'system', label: 'System', icon: 'sliders', screen: 'system' }],
};

/** Persistent DEMO MODE strip. It sits above the navigator and takes over the top safe-area inset so the screens below do not double-pad. */
function DemoBanner({ children, who, onSwitch }: { children: React.ReactNode; who: string; onSwitch?: () => void }) {
  const ins = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: ins.top + 2, paddingBottom: 4, paddingHorizontal: 12, backgroundColor: '#F5A524', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }} accessibilityRole="header">
        <Txt v="small" style={{ color: '#111', fontWeight: '800', fontSize: 11 }}>DEMO MODE · simulated payments · local data · {who}</Txt>
        {onSwitch ? <Pressable onPress={onSwitch} accessibilityLabel="Back to admin" hitSlop={8}><Txt v="small" style={{ color: '#111', fontWeight: '800', fontSize: 11 }}>Back to admin</Txt></Pressable> : null}
      </View>
      <SafeAreaInsetsContext.Provider value={{ ...ins, top: 0 }}><View style={{ flex: 1 }}>{children}</View></SafeAreaInsetsContext.Provider>
    </View>
  );
}

function Root() {
  const scheme = useColorScheme();
  const [repo, setRepo] = useState<Repo | null>(null); const [bootErr, setBootErr] = useState<string | null>(null);
  const [session, setSessionRaw] = useState<S.Session | null>(null); const [rev, setRev] = useState(0);
  const [mode, setMode] = useState<'system' | 'dark' | 'light'>('system');
  const [llm, setLlm] = useState<LlmClient | null>(null); const [modelStatus, setModelStatus] = useState('not checked');
  const [toastMsg, setToast] = useState<{ m: string; k: string; id: number } | null>(null);
  const [dlg, setDlg] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const toastTimer = useRef<any>(null);

  const boot = useCallback(() => {
    try {
      const db = openExpoDb(); migrate(db); const r = new Repo(db, () => Date.now());
      ensureSeeded(r); A.loadLibrary(r);
      const saved = S.getMeta(r, 'themeMode'); if (saved === 'dark' || saved === 'light' || saved === 'system') setMode(saved);
      setRepo(r); setSessionRaw(S.restoreSession(r)); setBootErr(null);
    } catch (e: any) { setBootErr(e?.message || String(e)); }
  }, []);
  useEffect(boot, [boot]);
  const reloadLlm = useCallback(() => { loadAiConfig().then((c) => setLlm(c ? anthropicClient(c) : null)); }, []);
  useEffect(reloadLlm, [reloadLlm]);

  const bump = useCallback(() => setRev((x) => x + 1), []);
  const setSession = useCallback((s: S.Session | null) => { if (repo) S.rememberSession(repo, s); setSessionRaw(s); bump(); }, [repo, bump]);
  const refreshSession = useCallback(() => { if (repo && session) { setSessionRaw(S.refresh(repo, session)); bump(); } }, [repo, session, bump]);
  const toast = useCallback((m: string, k: 'good' | 'bad' | 'info' = 'info') => { const id = Date.now(); setToast({ m, k, id }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast((x) => (x && x.id === id ? null : x)), 3800); }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setDlg({ ...o, resolve })), []);

  const base = (mode === 'system' ? scheme : mode) === 'light' ? lightTheme : darkTheme;
  const brand = useMemo(() => {
    if (!repo || !session) return null;
    try { if (session.actor.role === 'user') return G.brandFor(repo, session.actor)?.mode === 'custom' ? G.brandFor(repo, session.actor)!.color : null; if (session.actor.role === 'gym') { const g = G.myGyms(repo, session.actor).find((x) => x.id === session.activeGymId); return g?.brand.mode === 'custom' ? g.brand.color : null; } } catch {}
    return null;
  }, [repo, session, rev]);
  const theme = useMemo(() => withAccent(base, brand), [base, brand]);

  // Local notifications: surface new gym announcements while the app is open.
  useEffect(() => {
    if (!repo || !session || session.actor.role !== 'user') return;
    try { if (!NT.getPrefs(repo, session.actor).announcements) return; NT.newAnnouncements(repo, session.actor).slice(0, 2).forEach((a) => notifier.show(a.title, a.body).catch(() => {})); NT.markAnnouncementsSeen(repo, session.actor); } catch {}
  }, [repo, session?.account.id]);

  if (bootErr) return <View style={{ flex: 1, backgroundColor: darkTheme.bg, justifyContent: 'center', padding: 24 }}><Txt v="h1" style={{ color: '#fff' }}>Could not open the database</Txt><Gap /><Txt style={{ color: '#ccc' }}>{bootErr}</Txt><Gap /><Btn label="Try again" onPress={boot} /></View>;
  if (!repo) return <View style={{ flex: 1, backgroundColor: darkTheme.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={darkTheme.accent} /></View>;

  const ctx: any = {
    repo, session, actor: session?.actor, rev, bump, setSession, refreshSession, theme, themeMode: mode,
    setThemeMode: (m: any) => { setMode(m); S.setMeta(repo, 'themeMode', m); }, toast, confirm, llm, reloadLlm, modelStatus, setModelStatus,
  };
  let body: React.ReactNode;
  if (!session) body = <LoginScreen />;
  else if (session.actor.role === 'user' && !repo.get(session.actor, 'profile', session.actor.id)) body = <Onboarding />;
  else body = <Shell tabs={TABS[session.actor.role]} resetKey={session.account.id + ':' + (session.activeGymId || '')} />;
  const back = session?.originAdminId && session.account.role !== 'admin' ? () => { try { setSession(S.switchRole(repo, session, session.originAdminId!)); } catch (e: any) { toast(e.message, 'bad'); } } : undefined;

  return (
    <AppContext.Provider value={ctx}>
      <ThemeCtx.Provider value={theme}>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        <View style={{ flex: 1, backgroundColor: theme.bg }}>
          <DemoBanner who={session ? session.account.role + ' · ' + session.account.username : 'signed out'} onSwitch={back}>
            <ErrorBoundary key={session?.account.id || 'out'}>{body}</ErrorBoundary>
          </DemoBanner>
          {toastMsg ? <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 96, alignItems: 'center' }}><View style={{ backgroundColor: toastMsg.k === 'bad' ? theme.bad : toastMsg.k === 'good' ? theme.good : theme.surface2, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, maxWidth: '100%', borderWidth: 1, borderColor: theme.border }} accessibilityLiveRegion="polite"><Txt style={{ color: toastMsg.k === 'info' ? theme.text : '#fff', fontWeight: '600' }}>{toastMsg.m}</Txt></View></View> : null}
          <Modal visible={!!dlg} transparent animationType="fade" onRequestClose={() => { dlg?.resolve(false); setDlg(null); }}>
            <View style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: 'center', padding: 24 }}>
              <Card>
                <Txt v="h2">{dlg?.title}</Txt>{dlg?.message ? <><Gap h={8} /><Txt c="sub">{dlg.message}</Txt></> : null}<Gap />
                <Btn label={dlg?.confirmLabel || 'Confirm'} kind={dlg?.danger ? 'danger' : 'primary'} onPress={() => { dlg?.resolve(true); setDlg(null); }} /><Gap h={8} />
                <Btn label="Cancel" kind="ghost" onPress={() => { dlg?.resolve(false); setDlg(null); }} />
              </Card>
            </View>
          </Modal>
        </View>
      </ThemeCtx.Provider>
    </AppContext.Provider>
  );
}
export default function App() { return <SafeAreaProvider><Root /></SafeAreaProvider>; }
