/** Thin wrappers over native modules, loaded lazily so logic and tests never import them. */
import type { LlmConfig } from '../services/coach';
import type { Notifier, Reminder } from '../services/notifications';

const AI_KEY = 'kinetic.ai.cfg';
export const DEFAULT_AI: LlmConfig = { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-5', apiKey: '' };

/** The API key lives in the platform keystore (expo-secure-store), never in source, SQLite or exports. */
export async function loadAiConfig(): Promise<LlmConfig | null> {
  try { const SS = await import('expo-secure-store'); const raw = await SS.getItemAsync(AI_KEY); if (!raw) return null; const c = JSON.parse(raw); return c?.apiKey ? { ...DEFAULT_AI, ...c } : null; } catch { return null; }
}
export async function saveAiConfig(c: LlmConfig | null): Promise<void> {
  const SS = await import('expo-secure-store');
  if (!c || !c.apiKey) await SS.deleteItemAsync(AI_KEY); else await SS.setItemAsync(AI_KEY, JSON.stringify(c));
}

export const notifier: Notifier = {
  async requestPermission() { const N = await import('expo-notifications'); const cur = await N.getPermissionsAsync(); if (cur.granted) return true; return (await N.requestPermissionsAsync()).granted; },
  async cancelAll() { const N = await import('expo-notifications'); await N.cancelAllScheduledNotificationsAsync(); },
  async schedule(r: Reminder) {
    const N = await import('expo-notifications'); const t = r.trigger as any;
    const trigger: any = t.type === 'weekly' ? { type: N.SchedulableTriggerInputTypes.WEEKLY, weekday: t.weekday + 1, hour: t.hour, minute: t.minute }
      : t.type === 'daily' ? { type: N.SchedulableTriggerInputTypes.DAILY, hour: t.hour, minute: t.minute }
      : t.type === 'date' ? { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(t.at) } : null;
    await N.scheduleNotificationAsync({ identifier: r.id, content: { title: r.title, body: r.body }, trigger });
  },
  async show(title: string, body: string) { const N = await import('expo-notifications'); await N.scheduleNotificationAsync({ content: { title, body }, trigger: null }); },
};

/** Writes JSON to the app cache and opens the system share sheet (Save to Files, Drive, WhatsApp…). */
export async function shareJson(name: string, data: unknown): Promise<void> {
  const FS = await import('expo-file-system'); const Sharing = await import('expo-sharing');
  const uri = (FS.cacheDirectory || '') + name; await FS.writeAsStringAsync(uri, JSON.stringify(data, null, 2));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device. The file was saved to the app cache only.');
  await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: name });
}
export async function pickJson(): Promise<any | null> {
  const DP = await import('expo-document-picker'); const FS = await import('expo-file-system');
  const r = await DP.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.[0]) return null;
  const txt = await FS.readAsStringAsync(r.assets[0].uri); try { return JSON.parse(txt); } catch { throw new Error('That file is not valid JSON.'); }
}
export async function copyText(s: string): Promise<void> { const C = await import('expo-clipboard'); await C.setStringAsync(s); }
