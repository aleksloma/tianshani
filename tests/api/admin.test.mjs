// API: /api/admin/* — პაროლი, ხელმოწერილი cookie, სტატისტიკა, კლიენტები, საუბრები პერსონაჟებად, ლიმიტის განულება, ექსპორტი.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, chat, cookieJar, userMsg, GS } from '../helpers.mjs';

let S;
let userJar;
before(async () => {
  S = await startTestServer({ limits: { per_client_input_tokens: 100_000 } });
  userJar = cookieJar();
  await chat(S.base, { characterId: 'director', messages: userMsg('გამარჯობათ, მოთხრობა წაიკითხეთ?'), gameState: GS }, { jar: userJar });
  await chat(S.base, { characterId: 'givi', messages: userMsg('გივი აქ არის?'), gameState: { ...GS, season: 'winter' } }, { jar: userJar });
  await chat(S.base, { characterId: 'givi', messages: userMsg('ისევ გივი?'), gameState: { ...GS, season: 'winter' } }, { jar: userJar });
});
after(async () => { await S.close(); });

async function login(password) {
  const res = await fetch(`${S.base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  const jar = cookieJar();
  jar.store(res);
  return { res, jar, json: await res.json() };
}
const get = (jar, p) => fetch(`${S.base}${p}`, { headers: { cookie: jar.header() } });

test('ავტორიზაციის გარეშე ყველა /api/admin/* → 401', async () => {
  for (const p of ['/api/admin/stats', '/api/admin/clients', '/api/admin/export', '/api/admin/me', `/api/admin/clients/x/messages`]) {
    const r = await fetch(`${S.base}${p}`);
    assert.equal(r.status, 401, p);
  }
  const r = await fetch(`${S.base}/api/admin/clients/x/reset-limit`, { method: 'POST' });
  assert.equal(r.status, 401);
});

test('არასწორი პაროლი → 401; ყალბი cookie → 401', async () => {
  const bad = await login('wrong');
  assert.equal(bad.res.status, 401);
  assert.ok(bad.json.error.includes('პაროლი'));
  const forged = cookieJar();
  forged.set('tianshani_admin', `${Date.now() + 1e6}.deadbeef`);
  assert.equal((await get(forged, '/api/admin/stats')).status, 401);
  const expired = cookieJar();
  expired.set('tianshani_admin', `1.${'0'.repeat(64)}`);
  assert.equal((await get(expired, '/api/admin/stats')).status, 401);
});

test('სწორი პაროლი → httpOnly cookie; სტატისტიკა, კლიენტები, საუბრები პერსონაჟებად', async () => {
  const { res, jar } = await login('test-admin-pass');
  assert.equal(res.status, 200);
  const sc = res.headers.getSetCookie().find((c) => c.startsWith('tianshani_admin='));
  assert.ok(/HttpOnly/i.test(sc) && /SameSite=Strict/i.test(sc));

  const stats = await (await get(jar, '/api/admin/stats')).json();
  assert.ok(stats.totals.clients >= 1);
  assert.equal(stats.totals.messages, 6);
  assert.equal(stats.totals.user_messages, 3);
  assert.ok(stats.totals.input_tokens > 0 && stats.totals.output_tokens > 0);
  assert.equal(stats.top_characters[0].character_id, 'givi');
  assert.equal(stats.top_characters[0].n, 2);

  const cid = userJar.get('tianshani_cid');
  const list = await (await get(jar, '/api/admin/clients')).json();
  const me = list.clients.find((c) => c.client_id === cid);
  assert.ok(me);
  assert.equal(me.messages, 3);
  assert.equal(me.characters, 2);
  assert.ok(me.input_tokens > 0);
  assert.ok(me.limit_pct >= 0 && me.limit_pct <= 100);

  // ძებნა ტექსტით
  const found = await (await get(jar, `/api/admin/clients?q=${encodeURIComponent('ისევ გივი')}`)).json();
  assert.deepEqual(found.clients.map((c) => c.client_id), [cid]);
  const none = await (await get(jar, '/api/admin/clients?q=zzzz-nothing')).json();
  assert.equal(none.clients.length, 0);

  const conv = await (await get(jar, `/api/admin/clients/${cid}/messages`)).json();
  assert.deepEqual(conv.characters.map((g) => g.character_id), ['givi', 'director']);
  const givi = conv.characters[0];
  assert.equal(givi.reachable, false);
  assert.equal(givi.messages.length, 4);
  assert.equal(givi.messages[0].season, 'winter');
  assert.ok(givi.messages[1].spoken_by && givi.messages[1].spoken_by !== 'givi');
  assert.ok(givi.messages[1].spoken_by_name);
  // ქრონოლოგია
  const ids = givi.messages.map((m) => m.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
});

test('ლიმიტის განულება ამ კლიენტისთვის', async () => {
  const { jar } = await login('test-admin-pass');
  const cid = userJar.get('tianshani_cid');
  const before = await (await fetch(`${S.base}/api/state`, { headers: { cookie: userJar.header() } })).json();
  assert.ok(before.used.input > 0);
  const r = await fetch(`${S.base}/api/admin/clients/${cid}/reset-limit`, { method: 'POST', headers: { cookie: jar.header() } });
  assert.equal(r.status, 200);
  const after = await (await fetch(`${S.base}/api/state`, { headers: { cookie: userJar.header() } })).json();
  assert.equal(after.used.input, 0);
  assert.equal(after.used.requests, 0);
});

test('ექსპორტი JSON-ად (ყველა და ერთი კლიენტი)', async () => {
  const { jar } = await login('test-admin-pass');
  const r = await get(jar, '/api/admin/export');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /attachment; filename="tianshani-export-/);
  const all = await r.json();
  assert.ok(all.clients.length >= 1 && all.messages.length === 6);
  const cid = userJar.get('tianshani_cid');
  const one = await (await get(jar, `/api/admin/export?client=${cid}`)).json();
  assert.ok(one.messages.every((m) => m.client_id === cid));
  assert.equal(one.clients.length, 1);
});

test('logout შლის cookie-ს', async () => {
  const r = await fetch(`${S.base}/api/admin/logout`, { method: 'POST' });
  assert.equal(r.status, 200);
  assert.ok(r.headers.getSetCookie().some((c) => c.startsWith('tianshani_admin=;')));
});

test('პაროლი CHANGE_ME → ადმინი დაკეტილია (403)', async () => {
  const S2 = await startTestServer({ admin: { password: 'CHANGE_ME' } });
  try {
    const res = await fetch(`${S2.base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'CHANGE_ME' }) });
    assert.equal(res.status, 403);
  } finally { await S2.close(); }
});
