import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt, ErrorBoundary, useTheme } from '../ui/kit';
import { Icon } from '../ui/icons';

export const SCREENS: Record<string, React.ComponentType<any>> = {};
export const registerScreens = (m: Record<string, React.ComponentType<any>>) => Object.assign(SCREENS, m);

interface Entry { id: number; name: string; params: any }
interface NavApi { push: (name: string, params?: any) => void; pop: () => void; replace: (name: string, params?: any) => void; popToTabs: () => void; tab: string; setTab: (k: string) => void; depth: number }
const NavCtx = createContext<NavApi>(null as any);
export const useNav = () => useContext(NavCtx);
export interface TabDef { key: string; label: string; icon: string; screen: string }

/** Minimal stack + bottom-tab navigator. Pushed screens cover the tabs; Android back pops them. */
export function Shell({ tabs, resetKey }: { tabs: TabDef[]; resetKey: string }) {
  const t = useTheme(); const ins = useSafeAreaInsets();
  const [stack, setStack] = useState<Entry[]>([]); const [tab, setTab] = useState(tabs[0].key); const seq = useRef(1);
  useEffect(() => { setStack([]); setTab(tabs[0].key); }, [resetKey]); // new session or role => fresh navigation
  const api = useMemo<NavApi>(() => ({
    push: (name, params) => setStack((s) => [...s, { id: seq.current++, name, params: params || {} }]),
    pop: () => setStack((s) => s.slice(0, -1)), replace: (name, params) => setStack((s) => [...s.slice(0, -1), { id: seq.current++, name, params: params || {} }]),
    popToTabs: () => setStack([]), tab, setTab: (k) => { setStack([]); setTab(k); }, depth: stack.length
  }), [stack.length, tab]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (stack.length) { setStack((s) => s.slice(0, -1)); return true; } if (tab !== tabs[0].key) { setTab(tabs[0].key); return true; } return false; });
    return () => sub.remove();
  }, [stack.length, tab, tabs]);
  const top = stack[stack.length - 1];
  const TabScreen = SCREENS[tabs.find((x) => x.key === tab)!.screen];
  const Top = top ? SCREENS[top.name] : null;
  return (
    <NavCtx.Provider value={api}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ErrorBoundary key={top ? 'p' + top.id : 't' + tab}>
          {Top ? <Top key={top.id} {...top.params} /> : TabScreen ? <TabScreen /> : <Txt>Missing screen</Txt>}
        </ErrorBoundary>
        {!top ? (
          <View style={{ flexDirection: 'row', backgroundColor: t.surface, borderTopWidth: 1, borderColor: t.border, paddingBottom: ins.bottom, paddingTop: 6 }} accessibilityRole="tablist">
            {tabs.map((x) => { const on = x.key === tab; return (
              <Pressable key={x.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={x.label} onPress={() => api.setTab(x.key)} style={{ flex: 1, alignItems: 'center', paddingVertical: 6, gap: 3 }}>
                <View style={{ backgroundColor: on ? t.accent : 'transparent', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 5 }}><Icon name={x.icon} size={20} color={on ? t.onAccent : t.mute} /></View>
                <Txt v="small" style={{ fontSize: 10, fontWeight: on ? '800' : '500', color: on ? t.text : t.mute }}>{x.label}</Txt>
              </Pressable>); })}
          </View>
        ) : null}
      </View>
    </NavCtx.Provider>
  );
}
