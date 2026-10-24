// Round 3 API: §1 userName (პრომპტამდე, SQLite-ში, ადმინში).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, chat, cookieJar, userMsg, GS } from '../helpers.mjs';

let S;
before(async () => { S = await startTestServer(); });
after(async () => { await S.close(); });

async function adminJar() {
  const jar = cookieJar();
  const r = await fetch(`${S.base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-admin-pass' }) });
  jar.store(r);
  return jar;
}

test('§1 userName: mock პასუხი სახელით; messages.user_name და clients.user_name; ადმინის სიაში სახელი', async () => {
  const jar = cookieJar();
  const r = await chat(S.base, { characterId: 'tina', messages: userMsg('გამარჯობა'), gameState: GS, userName: '  ნინო  ' }, { jar });
  assert.equal(r.status, 200);
  assert.match(r.reply, /ნინო, /);
  const cid = jar.get('tianshani_cid');
  const rows = S.store.db.prepare('SELECT role, user_name FROM messages WHERE client_id = ? ORDER BY id').all(cid);
  assert.deepEqual(rows, [{ role: 'user', user_name: 'ნინო' }, { role: 'assistant', user_name: 'ნინო' }]);
  assert.equal(S.store.db.prepare('SELECT user_name FROM clients WHERE client_id = ?').get(cid).user_name, 'ნინო');
  // სახელის გარეშე — ბოლო ცნობილი სახელი კლიენტზე რჩება, შეტყობინებაზე null
  await chat(S.base, { characterId: 'tina', messages: userMsg('კიდევ ერთხელ'), gameState: GS }, { jar });
  assert.equal(S.store.db.prepare('SELECT user_name FROM messages WHERE client_id = ? ORDER BY id DESC LIMIT 1').get(cid).user_name, null);
  assert.equal(S.store.db.prepare('SELECT user_name FROM clients WHERE client_id = ?').get(cid).user_name, 'ნინო');
  // ადმინი: სიაში და ძებნით
  const aj = await adminJar();
  const list = await (await fetch(`${S.base}/api/admin/clients?q=${encodeURIComponent('ნინო')}`, { headers: { cookie: aj.header() } })).json();
  const row = list.clients.find((c) => c.client_id === cid);
  assert.ok(row, 'სახელით იძებნება');
  assert.equal(row.user_name, 'ნინო');
  const detail = await (await fetch(`${S.base}/api/admin/clients/${cid}/messages`, { headers: { cookie: aj.header() } })).json();
  assert.equal(detail.client.user_name, 'ნინო');
});

test('§1 userName: გრძელი/სახიფათო სახელი იწმინდება (40 სიმბოლო, ბრჭყალებისა და < > გარეშე)', async () => {
  const jar = cookieJar();
  await chat(S.base, { characterId: 'vaso', messages: userMsg('გამარჯობა'), gameState: GS, userName: `<script>„${'ა'.repeat(80)}“` }, { jar });
  const n = S.store.db.prepare('SELECT user_name FROM clients WHERE client_id = ?').get(jar.get('tianshani_cid')).user_name;
  assert.equal(n.length, 40);
  assert.ok(!/[<>„“]/.test(n));
});
