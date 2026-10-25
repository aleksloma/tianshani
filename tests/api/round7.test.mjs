// FIXES_ROUND7 API: §3 ადმინ-გვერდი ავტორიზაციამდე — მხოლოდ შესვლის ფორმა; §4 ლოგები მომხმარებლის პროფილით.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, cookieJar } from '../helpers.mjs';

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
