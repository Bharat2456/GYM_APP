import FIT from '../engine';
import { Repo, Actor } from '../db/repo';
import * as W from './workouts';
import * as N from './nutrition';
import * as G from './gym';

export interface LlmConfig { baseUrl: string; model: string; apiKey: string }
export interface LlmClient { complete(system: string, userText: string, images?: { mediaType: string; base64: string }[]): Promise<string> }
export interface CoachMsg { id: string; ownerId: string; at: number; role: 'user' | 'coach'; text: string; source?: 'local' | 'ai'; flagged?: boolean; actions?: any[] }

/** Anthropic Messages API client. The key comes from Settings (stored in the device keystore), never from source code. Prefer pointing baseUrl at your own proxy for production. */
export function anthropicClient(cfg: LlmConfig, fetchImpl: typeof fetch = fetch): LlmClient {
  return {
    async complete(system, userText, images = []) {
      const content: any[] = images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.base64 } }));
      content.push({ type: 'text', text: userText });
      const res = await fetchImpl(cfg.baseUrl.replace(/\/$/, '') + '/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: cfg.model, max_tokens: 700, system, messages: [{ role: 'user', content }] }) });
      if (!res.ok) throw new Error('AI service error ' + res.status);
      const j: any = await res.json(); return (j.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim();
    }
  };
}

export function buildContext(repo: Repo, a: Actor) {
  const now = repo.now(), profile = repo.get(a, 'profile', a.id), pd = W.getPlanDoc(repo, a);
  const gyms = G.myMemberships(repo, a).filter((m) => ['active', 'expiring', 'pending'].includes(m.status as string));
  return { profile, plan: pd?.plan, sessions: W.listWorkouts(repo, a).slice().reverse(), meals: N.listMeals(repo, a), weights: repo.list(a, 'weight', { ownerId: a.id }), now, gym: gyms.map((m) => ({ gym: m.gym?.name, status: m.status, daysLeft: m.daysLeft })), assigned: G.myAssignments(repo, a).map((x) => x.programme!.name) };
}
export const history = (repo: Repo, a: Actor) => repo.list(a, 'chat', { ownerId: a.id }) as unknown as CoachMsg[];
function store(repo: Repo, a: Actor, role: 'user' | 'coach', text: string, extra: Partial<CoachMsg> = {}) { return repo.put(a, 'chat', { id: 'msg_' + repo.now() + '_' + role + Math.floor(Math.random() * 1e4), ownerId: a.id, at: repo.now(), role, text, ...extra } as any) as unknown as CoachMsg; }
export const clearChat = (repo: Repo, a: Actor) => history(repo, a).forEach((m) => repo.del(a, 'chat', m.id));

/** The deterministic local engine always runs first. It owns every safety decision; an LLM only gets to rephrase/personalise when it is NOT a safety case. */
export async function ask(repo: Repo, a: Actor, question: string, llm: LlmClient | null): Promise<CoachMsg> {
  const q = question.trim(); if (!q) throw new Error('Type a question first.');
  store(repo, a, 'user', q);
  const ctx = buildContext(repo, a); const local = FIT.coachLocal(q, ctx);
  if (!llm || local.flagged || local.safety) return store(repo, a, 'coach', local.text, { source: 'local', flagged: !!(local.flagged || local.safety), actions: local.actions });
  try {
    const gymNote = ctx.gym.length ? '\nGym membership: ' + JSON.stringify(ctx.gym) + ' Assigned programmes: ' + JSON.stringify(ctx.assigned) : '';
    const text = await llm.complete('You are a careful, encouraging fitness coach. Use only the supplied data. Never advise training through pain, dizziness or injury. Never invent history.', FIT.coachPrompt(q, ctx, history(repo, a).map((m) => ({ role: m.role, text: m.text }))) + gymNote);
    return store(repo, a, 'coach', text || local.text, { source: text ? 'ai' : 'local', actions: local.actions });
  } catch (e: any) {
    return store(repo, a, 'coach', local.text + '\n\n(The AI service could not be reached, so this is the offline rules-based answer: ' + e.message + ')', { source: 'local', actions: local.actions });
  }
}
