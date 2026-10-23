// API: /api/characters, /api/chat (SSE), უხილავთა წარმომადგენლები, client-id cookie, ლოგები SQLite-ში, სტატიკა.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestServer, chat, cookieJar, userMsg, GS } from '../helpers.mjs';

let S;
before(async () => { S = await startTestServer(); });
after(async () => { await S.close(); });

test('GET /api/characters: 29 პერსონაჟი, 12 კედელზე, პრომპტების გარეშე, თამაშის კონფიგი', async () => {
  const res = await fetch(`${S.base}/api/characters`);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.title_ka, 'დაბეჭდე ტიანშანი');
  assert.equal(j.characters.length, 29);
  assert.equal(j.characters.filter((c) => c.on_wall).length, 12);
  assert.ok(j.characters.filter((c) => c.on_wall).every((c) => c.reachable));
  const raw = JSON.stringify(j);
  assert.ok(!raw.includes('system_prompt_en') && !raw.includes('You are '), 'სრული პრომპტები კლიენტთან არ მიდის');
  assert.ok(!raw.includes('test-admin-pass'), 'ადმინის პაროლი არ ჩანს');
  assert.ok(!('gemini' in j.config) && !('admin' in j.config) && !('logging' in j.config), 'საიდუმლო კონფიგი არ ჩანს');
  // Round 1 §4: დღეებზე დაფუძნებული დრო
  assert.equal(j.config.game.start_date, '1983-09-01');
  assert.equal(j.config.game.days_per_season, 90);
  assert.equal(j.config.game.days_per_character_switch, 20);
  assert.equal(j.config.game.days_per_exchange, 0);
  assert.ok(!('_comment' in j.config.game));
  assert.deepEqual(j.config.game.seasons, ['autumn', 'winter', 'spring', 'summer']);
  assert.equal(j.config.wall.layout_seed, 1983);
  assert.equal(j.roll_call.length, 6);
  assert.equal(j.mock, true);
  assert.ok(j.mock_notice.includes('გამომცემლობას გასაღები დაეკარგა (settings.json → gemini.api_key)'));
  assert.ok(j.characters.find((c) => c.id === 'givi').proxies.length >= 2);
});

test('POST /api/chat: SSE delta-ები და done (usage, remaining, suggested_redirect, spoken_by)', async () => {
  const jar = cookieJar();
  const r = await chat(S.base, { characterId: 'director', messages: userMsg('გამარჯობათ, ერთი მოთხრობა მაქვს, წაიკითხავთ?'), gameState: GS }, { jar });
  assert.equal(r.status, 200);
  assert.ok(r.events.filter((e) => e.delta).length > 1, 'ტექსტი ნაწილ-ნაწილ მოდის');
  assert.ok(r.reply.length > 5);
  assert.ok(r.done);
  assert.equal(r.done.spoken_by, 'director');
  assert.ok(r.done.usage.input > 0 && r.done.usage.output > 0);
  assert.ok(r.done.remaining.input < 2_000_000);
  assert.ok('suggested_redirect' in r.done);
  if (r.done.suggested_redirect) assert.ok(['tina', 'vaso', 'otari'].includes(r.done.suggested_redirect));
  assert.ok(jar.get('tianshani_cid'), 'httpOnly cookie დაყენდა');
});

test('suggested_redirect: ხელნაწერზე საუბრისას ხშირად ბრუნდება და ყოველთვის redirects_to-დანაა', async () => {
  let hits = 0;
  for (let i = 0; i < 12; i++) {
    const r = await chat(S.base, {
      characterId: 'otari',
      messages: [{ role: 'user', content: `მოთხრობა წაიკითხეთ? (${i})` }],
      gameState: GS,
    });
    if (r.done.suggested_redirect) { hits++; assert.ok(['kopaleishvili', 'director', 'grisha'].includes(r.done.suggested_redirect)); }
  }
  assert.ok(hits >= 3, `hits=${hits}`);
});

test('უხილავი (გივი): პასუხობს წარმომადგენელი, არასდროს გივი; სხვადასხვა წარმომადგენელი', async () => {
  const { byId, proxyMap } = await import('../../src/characters.js');
  const seen = new Set();
  for (let i = 0; i < 25; i++) {
    const r = await chat(S.base, { characterId: 'givi', messages: userMsg(`გივი აქ არის? ${i}`), gameState: GS });
    assert.equal(r.status, 200);
    assert.notEqual(r.done.spoken_by, 'givi');
    assert.ok(proxyMap.givi.includes(r.done.spoken_by), r.done.spoken_by);
    assert.equal(r.done.spoken_by_name, byId[r.done.spoken_by].short_name_ka);
    seen.add(r.done.spoken_by);
  }
  assert.ok(seen.size >= 2, `ვარიაცია: ${[...seen]}`);
  // ყველა უხილავი
  for (const id of ['kuparadze', 'murmanidze', 'gamkrelidze', 'zina', 'kopaleishvili', 'tsverava', 'khaburdzania', 'shota']) {
    const r = await chat(S.base, { characterId: id, messages: userMsg('სად არის?'), gameState: GS });
    assert.ok(proxyMap[id].includes(r.done.spoken_by), `${id} → ${r.done.spoken_by}`);
  }
});

test('უხილავი: ვინც ჩატში დაიწყო, ის ჭარბობს (~70%)', async () => {
  const { proxyMap } = await import('../../src/characters.js');
  const pref = proxyMap.givi[0];
  let same = 0;
  for (let i = 0; i < 30; i++) {
    const r = await chat(S.base, { characterId: 'givi', messages: userMsg('ისევ მე ვარ'), gameState: GS, lastSpokenBy: pref });
    if (r.done.spoken_by === pref) same++;
  }
  assert.ok(same >= 18, `same=${same}/30`);
});

test('client id: cookie პრიორიტეტულია X-Client-Id ჰედერზე; ჰედერი გამოიყენება cookie-ს გარეშე', async () => {
  const A = crypto.randomUUID();
  const B = crypto.randomUUID();
  const jarB = cookieJar();
  jarB.set('tianshani_cid', B);
  await chat(S.base, { characterId: 'tina', messages: userMsg('გამარჯობა'), gameState: GS }, { jar: jarB, headers: { 'X-Client-Id': A } });
  const stateB = await (await fetch(`${S.base}/api/state`, { headers: { cookie: `tianshani_cid=${B}` } })).json();
  const stateA = await (await fetch(`${S.base}/api/state`, { headers: { 'X-Client-Id': A } })).json();
  assert.equal(stateB.used.requests, 1);
  assert.equal(stateA.used.requests, 0);
  // მხოლოდ ჰედერი → ის ID გამოიყენება და cookie-დაც დაყენდება; /api/state აბრუნებს ეფექტურ ID-ს
  const C = crypto.randomUUID();
  const res = await fetch(`${S.base}/api/state`, { headers: { 'X-Client-Id': C } });
  assert.ok((res.headers.getSetCookie?.() || []).some((c) => c.startsWith(`tianshani_cid=${C}`) && /HttpOnly/i.test(c)));
  assert.equal((await res.json()).client_id, C);
  // სტატიკური გვერდი ID-ს არ ანიჭებს (თორემ localStorage-ის ID-ს გადაფარავდა)
  const home = await fetch(`${S.base}/`);
  assert.equal((home.headers.getSetCookie?.() || []).length, 0);
});

test('GET /api/state: ბალანსი და პერიოდი', async () => {
  const j = await (await fetch(`${S.base}/api/state`)).json();
  assert.equal(j.period, 'monthly');
  assert.match(j.period_key, /^\d{4}-\d{2}$/);
  assert.deepEqual(j.limits, { input: 2_000_000, output: 2_000_000 });
  assert.equal(j.mock, true);
});

test('ყველა შეტყობინება იწერება SQLite-ში სეზონით, ციკლით, ენით და spoken_by-ით', async () => {
  const jar = cookieJar();
  await chat(S.base, { characterId: 'givi', messages: userMsg('Hello, is Givi here?'), gameState: { season: 'spring', crackStage: 2, lostCopies: 2, cycle: 3 } }, { jar });
  const cid = jar.get('tianshani_cid');
  const rows = S.store.db.prepare('SELECT * FROM messages WHERE client_id = ? ORDER BY id').all(cid);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].role, 'user');
  assert.equal(rows[0].character_id, 'givi');
  assert.equal(rows[0].lang_guess, 'en');
  assert.equal(rows[0].season, 'spring');
  assert.equal(rows[0].cycle, 3);
  assert.ok(rows[0].input_tokens > 0);
  assert.equal(rows[1].role, 'assistant');
  assert.equal(rows[1].character_id, 'givi', 'ისტორია უხილავის ჩატშია');
  assert.notEqual(rows[1].spoken_by, 'givi');
  assert.ok(rows[1].output_tokens > 0);
  const client = S.store.db.prepare('SELECT * FROM clients WHERE client_id = ?').get(cid);
  assert.ok(client.ip_hash && !client.ip_hash.includes('127.0.0.1'), 'IP მხოლოდ ჰეშით');
});

test('Round 1 §4: gameState.day → სერვერი სეზონს დღიდან ითვლის (ლოგში ზამთარი, თუნდაც კლიენტმა სხვა სეზონი გამოგზავნოს)', async () => {
  const jar = cookieJar();
  const r = await chat(S.base, { characterId: 'tina', messages: userMsg('გამარჯობა'), gameState: { day: 100, season: 'autumn', crackStage: 0, lostCopies: 0, cycle: 1 } }, { jar });
  assert.equal(r.status, 200);
  const row = S.store.db.prepare('SELECT season FROM messages WHERE client_id = ? AND role = ?').get(jar.get('tianshani_cid'), 'user');
  assert.equal(row.season, 'winter');
});

test('Round 1 §2: mock პასუხები შეიცავს *…* რემარკას (ხილული) და სცენის რემარკას (წარმომადგენელი)', async () => {
  const v = await chat(S.base, { characterId: 'director', messages: userMsg('გამარჯობა'), gameState: GS });
  assert.match(v.reply, /\*\(ყურმილს იღებს\)[^*]+\*/);
  const p = await chat(S.base, { characterId: 'gamkrelidze', messages: userMsg('წაიკითხეთ ჩემი მოთხრობა?'), gameState: GS });
  assert.ok(p.reply.startsWith('*(დერეფანში გამოდის'));
  assert.match(p.reply, /გამყრელიძ/);
  assert.notEqual(p.done.spoken_by, 'gamkrelidze');
});

test('არაქართულ შეტყობინებაზე პასუხი იმავე ენაზე (mock)', async () => {
  const en = await chat(S.base, { characterId: 'tina', messages: userMsg('Good morning, is the director in today?'), gameState: GS });
  assert.match(en.reply, /[A-Za-z]{4,}/);
  const ru = await chat(S.base, { characterId: 'vaso', messages: userMsg('Здравствуйте, вы прочитали мою повесть?'), gameState: GS });
  assert.match(ru.reply, /[А-Яа-я]{4,}/);
});

test('ვალიდაცია: უცნობი პერსონაჟი 400, ცარიელი 400, ბოლო არა-user 400, გრძელი 413', async () => {
  let r = await chat(S.base, { characterId: 'nobody', messages: userMsg('x'), gameState: GS });
  assert.equal(r.status, 400);
  assert.ok(r.json.error.includes('შტატში'));
  r = await chat(S.base, { characterId: 'tina', messages: [], gameState: GS });
  assert.equal(r.status, 400);
  r = await chat(S.base, { characterId: 'tina', messages: [{ role: 'assistant', content: 'x' }], gameState: GS });
  assert.equal(r.status, 400);
  r = await chat(S.base, { characterId: 'tina', messages: userMsg('ა'.repeat(2001)), gameState: GS });
  assert.equal(r.status, 413);
});

test('ისტორიის ფანჯარა: სერვერი მხოლოდ ბოლო history_window შეტყობინებას იყენებს (100 შეტყობინებაზე არ ვარდება)', async () => {
  const msgs = [];
  for (let i = 0; i < 100; i++) msgs.push({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` });
  msgs.push({ role: 'user', content: 'ბოლო' });
  const r = await chat(S.base, { characterId: 'bela', messages: msgs, gameState: GS });
  assert.equal(r.status, 200);
  assert.ok(r.done);
});

test('სტატიკა და 404', async () => {
  const home = await fetch(`${S.base}/`);
  assert.equal(home.status, 200);
  assert.ok((await home.text()).includes('დაბეჭდე ტიანშანი'));
  const admin = await fetch(`${S.base}/admin`);
  assert.equal(admin.status, 200);
  assert.ok((await admin.text()).includes('admin.js'));
  const js = await fetch(`${S.base}/js/layout.js`);
  assert.equal(js.status, 200);
  const nf = await fetch(`${S.base}/api/nothing`);
  assert.equal(nf.status, 404);
  assert.ok((await nf.json()).error);
  const health = await (await fetch(`${S.base}/api/health`)).json();
  assert.deepEqual(health, { ok: true, provider: 'mock', model: 'mock' });
});
