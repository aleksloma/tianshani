// FIXES_ROUND7 API: §3 ადმინ-გვერდი ავტორიზაციამდე — მხოლოდ შესვლის ფორმა; §4 ლოგები მომხმარებლის პროფილით.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, cookieJar, chat, userMsg, GS } from '../helpers.mjs';

let S;
before(async () => { S = await startTestServer(); });
after(async () => { await S.close(); });

async function adminJar() {
  const jar = cookieJar();
  const res = await fetch(`${S.base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-admin-pass' }) });
  jar.store(res);
  assert.equal(res.status, 200);
  return jar;
}
const get = (p, jar) => fetch(`${S.base}${p}`, { headers: jar ? { cookie: jar.header() } : {}, redirect: 'manual' });

// ---------- §3 ----------

const ARCHIVE_WORDS = ['ბიუჯეტი', 'ექსპორტი', 'ბრაუზერები'];
const ARCHIVE_TRACES = ['admin.js', '/api/admin', 'budget-card', 'client-list', 'id="app"', 'შესწორებული პასუხები'];

test('§3 ავტორიზაციის გარეშე GET /admin → მხოლოდ შესვლის ფორმა: პაროლის ველი, არც ერთი არქივის სიტყვა, სკრიპტი ან ენდპოინტი', async () => {
  const forged = cookieJar();
  forged.set('tianshani_admin', `${Date.now() + 1e6}.deadbeef`);
  const expired = cookieJar();
  expired.set('tianshani_admin', `1.${'0'.repeat(64)}`);
  for (const jar of [null, forged, expired]) {
    const r = await get('/admin', jar);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const body = await r.text();
    assert.match(body, /<input[^>]+name="password"[^>]+type="password"/);
    assert.match(body, /<form id="login-form" method="post" action="\/admin">/);
    for (const w of [...ARCHIVE_WORDS, ...ARCHIVE_TRACES]) assert.ok(!body.includes(w), `ავტორიზაციამდე ჩანს: ${w}`);
    assert.ok(!/<script/i.test(body), 'სკრიპტი არ არის');
  }
  // არქივის ფაილები სტატიკად აღარ იხსნება
  assert.equal((await get('/admin.html')).status, 404);
  assert.equal((await get('/js/admin.js')).status, 404);
});

test('§3 ავტორიზებული GET /admin → არქივი (ბიუჯეტი, ექსპორტი, ბრაუზერები) და /js/admin.js', async () => {
  const jar = await adminJar();
  const r = await get('/admin', jar);
  assert.equal(r.status, 200);
  const body = await r.text();
  for (const w of ARCHIVE_WORDS) assert.ok(body.includes(w), w);
  assert.ok(body.includes('/js/admin.js'));
  assert.ok(!body.includes('name="password"'), 'შესვლის ფორმა აღარ არის');
  const js = await get('/js/admin.js', jar);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
});

test('§3 ფორმით შესვლა იმავე მისამართზე: არასწორი პაროლი → ფორმა შეცდომით; სწორი → cookie + 303 /admin → არქივი', async () => {
  const post = (pw) => fetch(`${S.base}/admin`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `password=${encodeURIComponent(pw)}`, redirect: 'manual' });
  const bad = await post('wrong');
  assert.equal(bad.status, 401);
  const badBody = await bad.text();
  assert.match(badBody, /<p id="login-error" class="error" role="alert">პაროლი არასწორია\. საქმე დახურულია\.<\/p>/);
  for (const w of ARCHIVE_WORDS) assert.ok(!badBody.includes(w), w);
  const ok = await post('test-admin-pass');
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get('location'), '/admin');
  const jar = cookieJar();
  jar.store(ok);
  const sc = ok.headers.getSetCookie().find((c) => c.startsWith('tianshani_admin='));
  assert.ok(/HttpOnly/i.test(sc) && /SameSite=Strict/i.test(sc));
  assert.ok((await (await get('/admin', jar)).text()).includes('ბიუჯეტი'));
  // გასვლის შემდეგ — ისევ მხოლოდ ფორმა
  const out = await fetch(`${S.base}/api/admin/logout`, { method: 'POST' });
  jar.store(out);
  assert.ok(!(await (await get('/admin', jar)).text()).includes('ბიუჯეტი'));
});

// ---------- §4 ----------

test('§4 ერთი ბრაუზერი, ორი სახელი: clients.user_name — ბოლო; ყოველ რიგს თავისი დროის სახელი; ადმინის სია, პროფილი და ექსპორტი', async () => {
  const jar = cookieJar();
  const r1 = await chat(S.base, { characterId: 'tina', messages: userMsg('გამარჯობა'), gameState: GS, userName: 'ნინო' }, { jar });
  assert.equal(r1.status, 200);
  const cid = jar.get('tianshani_cid');
  const seen1 = S.store.db.prepare('SELECT last_seen FROM clients WHERE client_id = ?').get(cid).last_seen;
  await new Promise((r) => setTimeout(r, 15));
  const r2 = await chat(S.base, { characterId: 'vaso', messages: userMsg('როგორ ხართ?'), gameState: GS, userName: 'ანა' }, { jar });
  assert.equal(r2.status, 200);
  const client = S.store.db.prepare('SELECT user_name, last_seen FROM clients WHERE client_id = ?').get(cid);
  assert.equal(client.user_name, 'ანა');
  assert.ok(client.last_seen > seen1, 'last_seen განახლდა');
  const rows = S.store.db.prepare('SELECT role, character_id, user_name FROM messages WHERE client_id = ? ORDER BY id').all(cid);
  assert.deepEqual(rows, [
    { role: 'user', character_id: 'tina', user_name: 'ნინო' }, { role: 'assistant', character_id: 'tina', user_name: 'ნინო' },
    { role: 'user', character_id: 'vaso', user_name: 'ანა' }, { role: 'assistant', character_id: 'vaso', user_name: 'ანა' },
  ]);

  const admin = await adminJar();
  const list = await (await get('/api/admin/clients', admin)).json();
  assert.equal(list.clients.find((c) => c.client_id === cid).user_name, 'ანა');
  // ძებნა სახელით (ძველითაც — შეტყობინების რიგებში ინახება)
  for (const q of ['ანა', cid.slice(0, 8)]) {
    const found = await (await get(`/api/admin/clients?q=${encodeURIComponent(q)}`, admin)).json();
    assert.ok(found.clients.some((c) => c.client_id === cid), q);
  }
  const detail = await (await get(`/api/admin/clients/${cid}/messages`, admin)).json();
  assert.equal(detail.client.user_name, 'ანა');
  assert.deepEqual(detail.names.map((n) => [n.user_name, n.messages]), [['ნინო', 1], ['ანა', 1]]);
  assert.ok(detail.names.every((n) => n.first_at && n.last_at));
  const exp = await (await get(`/api/admin/export?client=${cid}`, admin)).json();
  assert.equal(exp.messages.length, 4);
  assert.ok(exp.messages.every((m) => Object.hasOwn(m, 'user_name') && m.client_id === cid));
  assert.deepEqual(exp.messages.map((m) => m.user_name), ['ნინო', 'ნინო', 'ანა', 'ანა']);
  assert.equal(exp.clients[0].user_name, 'ანა');
});

test('§4 სახელის გარეშე მოთხოვნა შენახულ სახელს არ შლის; სკრიპტული (Round 5) შეტყობინება ბაზაში არასდროს ხვდება', async () => {
  const jar = cookieJar();
  await chat(S.base, { characterId: 'tina', messages: userMsg('გამარჯობა'), gameState: GS, userName: 'ნინო' }, { jar });
  const cid = jar.get('tianshani_cid');
  const r = await chat(S.base, {
    characterId: 'tina',
    messages: [{ role: 'assistant', content: 'სკრიპტული-ხაზი-R7', scripted: true }, { role: 'user', content: 'ისევ მე ვარ' }],
    gameState: GS,
  }, { jar });
  assert.equal(r.status, 200);
  assert.equal(S.store.db.prepare('SELECT user_name FROM clients WHERE client_id = ?').get(cid).user_name, 'ნინო');
  const last = S.store.db.prepare("SELECT user_name FROM messages WHERE client_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1").get(cid);
  assert.equal(last.user_name, null, 'შეტყობინების მომენტში სახელი არ იყო');
  assert.equal(S.store.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE content LIKE '%სკრიპტული-ხაზი-R7%'").get().n, 0);
});