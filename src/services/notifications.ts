import { DAY } from '../engine';
import { Repo, Actor } from '../db/repo';
import * as W from './workouts';
import * as G from './gym';
import * as N from './nutrition';

export interface Reminder { id: string; title: string; body: string; kind: 'workout' | 'nutrition' | 'membership' | 'announcement' | 'completion'; trigger: { type: 'weekly'; weekday: number; hour: number; minute: number } | { type: 'daily'; hour: number; minute: number } | { type: 'date'; at: number } | { type: 'now' } }
export interface NotifPrefs { workout: boolean; nutrition: boolean; membership: boolean; announcements: boolean; workoutTime: string; nutritionTimes: string[] }
export const DEFAULT_PREFS: NotifPrefs = { workout: true, nutrition: false, membership: true, announcements: true, workoutTime: '18:00', nutritionTimes: ['13:00', '20:00'] };
const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return { hour: h || 0, minute: m || 0 }; };
export const getPrefs = (repo: Repo, a: Actor): NotifPrefs => ({ ...DEFAULT_PREFS, ...(repo.getKV(a, a.id, 'notifPrefs', {}) as any) });
export const setPrefs = (repo: Repo, a: Actor, p: Partial<NotifPrefs>) => repo.setKV(a, a.id, 'notifPrefs', { ...getPrefs(repo, a), ...p });

/** Pure: which local notifications should exist for this user. Local scheduling only; remote push needs push infrastructure that is NOT configured. */
export function buildReminders(repo: Repo, a: Actor): Reminder[] {
  if (a.role !== 'user') return [];
  const p = getPrefs(repo, a), out: Reminder[] = [], now = repo.now();
  if (p.workout) { const pd = W.getPlanDoc(repo, a); pd?.plan.days.forEach((d) => out.push({ id: 'wk_' + d.dow, title: 'Workout time', body: d.title + ' is planned for today. Listen to your body and start when you are ready.', kind: 'workout', trigger: { type: 'weekly', weekday: d.dow!, ...hm(p.workoutTime) } })); }
  if (p.nutrition) p.nutritionTimes.forEach((t, i) => out.push({ id: 'nut_' + i, title: 'Meal log', body: 'A quick moment to log what you ate. Rough estimates are fine.', kind: 'nutrition', trigger: { type: 'daily', ...hm(t) } }));
  if (p.membership) G.myMemberships(repo, a).forEach((m) => { if (m.member.status === 'active' && m.member.expiresAt) { const at = m.member.expiresAt - 3 * DAY; if (at > now) out.push({ id: 'mem_' + m.member.id, title: 'Membership ending soon', body: (m.gym?.name || 'Your gym') + ' membership expires in 3 days.', kind: 'membership', trigger: { type: 'date', at } }); } });
  return out;
}
/** Announcements newer than the last seen timestamp, to be shown as immediate local notifications when the app opens. */
export function newAnnouncements(repo: Repo, a: Actor): { id: string; title: string; body: string; at: number }[] {
  if (a.role !== 'user' || !getPrefs(repo, a).announcements) return [];
  const seen = (repo.getKV(a, a.id, 'annSeen', 0) as number) || 0;
  const list = G.listAnnouncements(repo, a).filter((x: any) => x.at > seen).map((x: any) => ({ id: x.id, title: x.title, body: x.text, at: x.at }));
  return list;
}
export const markAnnouncementsSeen = (repo: Repo, a: Actor) => repo.setKV(a, a.id, 'annSeen', repo.now());

/** Device bridge. expo-notifications is imported lazily so unit tests run without it. */
export interface Notifier { requestPermission(): Promise<boolean>; cancelAll(): Promise<void>; schedule(r: Reminder): Promise<void>; show(title: string, body: string): Promise<void> }
export async function applyReminders(n: Notifier, reminders: Reminder[]): Promise<{ scheduled: number; permission: boolean }> {
  const ok = await n.requestPermission(); await n.cancelAll(); if (!ok) return { scheduled: 0, permission: false };
  for (const r of reminders) await n.schedule(r); return { scheduled: reminders.length, permission: true };
}
