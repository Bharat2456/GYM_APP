import { Repo, Actor, POLICY } from '../db/repo';

const USER_COLLS = Object.keys(POLICY).filter((c) => POLICY[c].kind === 'user' && c !== 'draft');
/** A customer's own data as portable JSON (profile, plan, workouts, meals, weights, camera metrics, chat, settings). No gym-internal records. */
export function exportMine(repo: Repo, a: Actor) {
  const data: Record<string, any[]> = {}; USER_COLLS.forEach((c) => (data[c] = repo.list(a, c, { ownerId: a.id })));
  return { app: 'kinetic-coach', format: 1, kind: 'user-export', exportedAt: repo.now(), account: { username: repo.getAccount(a, a.id)!.username, displayName: repo.getAccount(a, a.id)!.displayName }, data, settings: { notifPrefs: repo.getKV(a, a.id, 'notifPrefs'), nutOverride: repo.getKV(a, a.id, 'nutOverride'), theme: repo.getKV(a, a.id, 'theme') } };
}
/** Replaces the signed-in customer's data with an export. Records are re-owned by the current account, so a file can never write into another account. */
export function importMine(repo: Repo, a: Actor, file: any): { imported: number } {
  if (!file || file.app !== 'kinetic-coach' || file.kind !== 'user-export' || file.format !== 1 || typeof file.data !== 'object') throw new Error('This is not a Kinetic Coach personal export.');
  let n = 0;
  repo.db.transaction(() => {
    deleteMine(repo, a, false);
    USER_COLLS.forEach((c) => (file.data[c] || []).forEach((d: any) => { const { createdAt, updatedAt, gymId, ...rest } = d; let id = c === 'profile' || c === 'plan' ? a.id : d.id; const ex = repo.db.get<any>('SELECT owner_id FROM docs WHERE collection=? AND id=?', [c, id]); if (ex && ex.owner_id !== a.id) id = id + '_' + a.id.slice(-6); repo.put(a, c, { ...rest, ownerId: a.id, id }); n++; }));
    Object.entries(file.settings || {}).forEach(([k, v]) => { if (v != null) repo.setKV(a, a.id, k, v); });
  });
  return { imported: n };
}
export function deleteMine(repo: Repo, a: Actor, includeSettings = true) { USER_COLLS.concat(['draft']).forEach((c) => repo.list(a, c, { ownerId: a.id }).forEach((d) => repo.del(a, c, d.id))); if (includeSettings) repo.db.run('DELETE FROM kv WHERE owner_id=?', [a.id]); }
