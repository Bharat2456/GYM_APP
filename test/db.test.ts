import { freshRepo, as, t, ok, eq, throws, section, done, clock, NOW } from './helpers';
import { SYSTEM, Forbidden } from '../src/db/repo';
import { IDS } from '../src/db/seed';

section('Schema, seed, accounts');
t('migrations bring a new database to the current schema version and seed loads', () => { const r = freshRepo(); eq(r.db.get<any>('PRAGMA user_version').user_version, r.schemaVersion); ok(r.stats().accounts >= 12); });
t('demo logins: admin/gym/user work, wrong password and unknown user fail', () => {
  const r = freshRepo();
  eq(r.verifyLogin('admin', 'admin123')!.role, 'admin'); eq(r.verifyLogin('gym', 'gym123')!.role, 'gym'); eq(r.verifyLogin('user', 'user123')!.role, 'user');
  eq(r.verifyLogin('admin', 'nope'), null); eq(r.verifyLogin('ghost', 'x'), null); eq(r.verifyLogin('ADMIN', 'admin123')!.username, 'admin', 'case-insensitive username');
});
t('passwords are stored salted+hashed, never in plain text', () => { const r = freshRepo(); const row = r.db.get<any>('SELECT * FROM accounts WHERE username=?', ['admin']); ok(!JSON.stringify(row).includes('admin123')); ok(row.salt.length >= 8 && row.pass_hash.length === 64); });
t('sign-up creates a customer, rejects duplicates, short passwords and elevated roles', () => {
  const r = freshRepo(); const a = r.createAccount(null, { username: 'newbie', password: 'pass1234', role: 'user', displayName: 'New Bie' }); eq(a.role, 'user');
  throws(() => r.createAccount(null, { username: 'newbie', password: 'pass1234', role: 'user', displayName: 'x' }), /taken/);
  throws(() => r.createAccount(null, { username: 'newb2', password: 'abc', role: 'user', displayName: 'x' }), /at least 4/);
  throws(() => r.createAccount(null, { username: 'hacker', password: 'pass1234', role: 'admin', displayName: 'x' }), /without signing in/);
});

section('Tenant isolation at the data layer');
t('Gym A staff cannot read Gym B members, programmes, codes, txns, staff or audit', () => {
  const r = freshRepo(); const a = as(r, 'gym');
  eq(r.list(a, 'gym_member').every((m) => m.gymId === IDS.gymIron), true); ok(r.list(a, 'gym_member').length >= 3);
  throws(() => r.list(a, 'gym_member', { gymId: IDS.gymPulse }), /another gym/); throws(() => r.list(a, 'gym_programme', { gymId: IDS.gymPulse }), /another gym/);
  throws(() => r.get(a, 'gym_member', 'mem_meera'), /another gym/); throws(() => r.get(a, 'gym_code', 'code_p1'), /another gym/); throws(() => r.get(a, 'gym', IDS.gymPulse), /not your gym/);
  throws(() => r.listAudit(a, { gymId: IDS.gymPulse }), /another gym/); eq(r.list(a, 'gym_txn').every((x) => x.gymId === IDS.gymIron), true);
  eq(r.listAccounts(a).some((x) => x.id === IDS.accMeera || x.id === IDS.accRohit), false, 'no accounts from the other gym');
  throws(() => r.getAccount(a, IDS.accMeera), /no access/);
});
t('Gym A cannot write into Gym B, nor move a record into it', () => {
  const r = freshRepo(); const a = as(r, 'gym');
  throws(() => r.put(a, 'gym_announcement', { id: 'x1', gymId: IDS.gymPulse, title: 't', text: 'x' }), /another gym/);
  throws(() => r.put(a, 'gym_member', { id: 'mem_meera', gymId: IDS.gymPulse, ownerId: IDS.accMeera, status: 'left' }), /another gym/);
  throws(() => r.put(a, 'gym_announcement', { id: 'ann_1', gymId: IDS.gymPulse, title: 'moved', text: 'x' }), /cannot be moved/);
  throws(() => r.del(a, 'gym_announcement', 'ann_3'), /another gym/);
  eq((r.get(SYSTEM, 'gym_announcement', 'ann_3') as any).gymId, IDS.gymPulse, 'record untouched');
});
t('staff permissions: receptionist cannot manage programmes or staff; fitness staff cannot touch members or billing', () => {
  const r = freshRepo(); const dev = as(r, 'dev'), rohit = as(r, 'rohit');
  throws(() => r.put(dev, 'gym_programme', { id: 'p9', gymId: IDS.gymIron, name: 'x', days: [] }), /missing permission/);
  throws(() => r.createAccount(dev, { username: 'sneaky', password: 'pass1234', role: 'gym', displayName: 's', extra: { gymIds: [IDS.gymIron], staffRole: 'manager' } }), /cannot create staff/);
  throws(() => r.list(rohit, 'gym_member', { gymId: IDS.gymPulse }), /missing permission|not visible/); eq(r.list(rohit, 'gym_member').length, 0, 'fitness staff sees no members silently');
  r.put(dev, 'gym_announcement', { id: 'ann_dev', gymId: IDS.gymIron, title: 'ok', text: 'receptionist may announce' });
});
t('customers: own data only, not other customers, not gym internals, cannot self-approve', () => {
  const r = freshRepo(); const u = as(r, 'user');
  ok(r.list(u, 'workout', { ownerId: u.id }).length > 5); throws(() => r.list(u, 'workout', { ownerId: IDS.accRiya }), /not your record/); throws(() => r.get(u, 'workout', 'w_acc_riya_1_0'), /not your record/);
  eq(r.list(u, 'workout').every((w) => w.ownerId === u.id), true, 'unscoped list is filtered to own');
  eq(r.list(u, 'gym_code').length, 0, 'codes are silently invisible to customers');
});
t('customers cannot read gym codes/referrals/txns of others, and see only gyms they belong to', () => {
  const r = freshRepo(); const u = as(r, 'user');
  eq(r.list(u, 'gym_code').length, 0); eq(r.list(u, 'gym_referral').length, 0); eq(r.list(u, 'gym_txn').every((x) => x.ownerId === u.id), true);
  eq(r.list(u, 'gym').map((g) => g.id).join(), IDS.gymIron); eq(r.list(u, 'gym_announcement').every((x) => x.gymId === IDS.gymIron), true);
  throws(() => r.get(u, 'gym', IDS.gymPulse), /not your gym/); throws(() => r.list(u, 'gym_programme', { gymId: IDS.gymPulse }), /not visible/);
  const m = r.get(u, 'gym_member', 'mem_user') as any;
  throws(() => r.put(u, 'gym_member', { ...m, expiresAt: NOW + 9e9 }), /only change sharing/); throws(() => r.put(u, 'gym_member', { ...m, status: 'expired' }), /cannot change membership status/); r.put(u, 'gym_member', { ...m, shareProgress: true });
  throws(() => r.put(u, 'gym_member', { id: 'forged', gymId: IDS.gymPulse, ownerId: u.id, status: 'active' }), /starts as pending/);
});
t('only the platform admin changes gym status; gym owners can edit their profile but not status', () => {
  const r = freshRepo(); const a = as(r, 'gym'); const g = r.get(a, 'gym', IDS.gymIron) as any;
  r.put(a, 'gym', { ...g, description: 'edited' }); throws(() => r.put(a, 'gym', { ...g, status: 'suspended' }), /only the platform admin/);
  throws(() => r.put(a, 'sub_plan', { id: 'x', name: 'free' }), /admin only/); throws(() => r.setKV(a, 'platform', 'referral.commissionPct', 90), /belong to their owner/);
});
t('customers and gyms cannot export or import platform data; admin can', () => {
  const r = freshRepo(); throws(() => r.exportAll(as(r, 'user')), /only the platform admin/); throws(() => r.exportAll(as(r, 'gym')), /only the platform admin/); ok(r.exportAll(as(r, 'admin')).docs.length > 50);
});
t('audit history records who did what; gym sees only its own gym', () => {
  const r = freshRepo(); const a = as(r, 'gym'); clock.t += 1000; r.put(a, 'gym_announcement', { id: 'ann_new', gymId: IDS.gymIron, title: 'Hello', text: 'x' });
  const mine = r.listAudit(a); ok(mine.length > 0 && mine.every((e) => e.gymId === IDS.gymIron)); ok(r.listAudit(as(r, 'admin')).some((e) => e.action === 'gym_announcement.create' && e.actorId === a.id));
  throws(() => r.listAudit(as(r, 'user')), /no audit/);
});
t('settings belong to their owner', () => { const r = freshRepo(); const u = as(r, 'user'); r.setKV(u, u.id, 'theme', 'dark'); eq(r.getKV(u, u.id, 'theme'), 'dark'); throws(() => r.getKV(as(r, 'riya'), u.id, 'theme'), /belong/); });
done();
