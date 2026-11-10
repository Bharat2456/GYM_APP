import React, { createContext, useCallback, useContext, useMemo } from 'react';
import type { Repo, Actor } from '../db/repo';
import type { Session } from '../services/session';
import type { Theme } from '../theme/theme';
import type { LlmClient } from '../services/coach';

export interface ConfirmOpts { title: string; message?: string; confirmLabel?: string; danger?: boolean }
export interface AppCtx {
  repo: Repo; session: Session; actor: Actor; rev: number; bump: () => void;
  setSession: (s: Session | null) => void; refreshSession: () => void;
  theme: Theme; themeMode: 'system' | 'dark' | 'light'; setThemeMode: (m: 'system' | 'dark' | 'light') => void;
  toast: (msg: string, kind?: 'good' | 'bad' | 'info') => void; confirm: (o: ConfirmOpts) => Promise<boolean>;
  llm: LlmClient | null; reloadLlm: () => void; modelStatus: string; setModelStatus: (s: string) => void;
}
export const AppContext = createContext<AppCtx>(null as any);
export const useApp = () => useContext(AppContext);

/** Re-computes `fn` after every database write (rev bump). All reads are synchronous SQLite, so this is cheap. */
export function useData<T>(fn: () => T, deps: any[] = []): T {
  const { rev } = useApp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(fn, [rev, ...deps]);
}
/** Runs a data mutation: toasts the error (never crashes), bumps the revision and optionally shows a success message. */
export function useAct() {
  const { bump, toast } = useApp();
  return useCallback(<T,>(fn: () => T, okMsg?: string): T | undefined => {
    try { const r = fn(); bump(); if (okMsg) toast(okMsg, 'good'); return r; } catch (e: any) { toast(e?.message || 'Something went wrong', 'bad'); return undefined; }
  }, [bump, toast]);
}
