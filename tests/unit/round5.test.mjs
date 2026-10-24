// Round 5 (FIXES_ROUND5.md): §1 სკრიპტული ხაზის მიგრაცია, §2 ახალი შენობა განულებისას, §3 SSE-ის პარსინგი და რემარკა წინადადების შუაში.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripScripted, migrateChats, getChats, getJSON, setJSON, KEYS } from '../../public/js/storage.js';
import { freshState, initialState } from '../../public/js/game.js';
import { parseSseChunk, tokensFromDone } from '../../public/js/sse.js';
import { parseStage } from '../../public/js/stage.js';

// ---------- §1 მიგრაცია ----------

const OLD = {
  director: [
    { role: 'assistant', content: '*(ყურმილს არ უშვებს)* დიახ, დიახ…', ts: 1, scripted: true },
    { role: 'user', content: 'გამარჯობათ', ts: 2 },
    { role: 'assistant', content: 'ძალიან კარგი!', ts: 3, spoken_by: 'director', redirect: 'otari' },
  ],
  givi: [{ role: 'assistant', content: 'გივი ოთახში არ არის.', ts: 4, scripted: true, spoken_by: 'two_big_men' }],
  vaso: [{ role: 'user', content: 'როგორ ხართ?', ts: 5 }, { role: 'assistant', content: 'ვზივარ.', ts: 6, spoken_by: 'vaso' }],
};

test('§1 stripScripted: scripted: true ქრება, დანარჩენი უცვლელია (თანმიმდევრობა, ველები); ცარიელი ჩატი ქრება', () => {
  const out = stripScripted(OLD);
  assert.deepEqual(Object.keys(out).sort(), ['director', 'vaso'], 'გივის მხოლოდ სკრიპტული ხაზი ჰქონდა → გასაღები ქრება');
  assert.deepEqual(out.director, OLD.director.slice(1));
  assert.deepEqual(out.vaso, OLD.vaso);
  assert.equal(OLD.director.length, 3, 'შემავალი ობიექტი არ იცვლება');
  // scripted: false / სხვა მნიშვნელობა — რჩება (მხოლოდ ზუსტად true იშლება)
  assert.equal(stripScripted({ a: [{ role: 'user', content: 'x', scripted: false }] }).a.length, 1);
});

test('§1 stripScripted: ნაგავზე არ ვარდება', () => {
  for (const bad of [null, undefined, 42, 'str', [], [1, 2]]) assert.deepEqual(stripScripted(bad), {});
  assert.deepEqual(stripScripted({ a: 'not-an-array', b: null, c: [null, 7, 'x', { role: 'user', content: 'ok' }] }), { c: [{ role: 'user', content: 'ok' }] });
});

test('§1 migrateChats: tianshani.chats ფიზიკურად იწმინდება, ერთხელ; სუფთა ისტორიას არ ეხება', () => {
  // Node-ში localStorage არ არის → storage.js მეხსიერებაში მუშაობს (იგივე getJSON/setJSON)
  setJSON(KEYS.chats, OLD);
  assert.equal(migrateChats(), true);
  const stored = getJSON(KEYS.chats, null);
  assert.ok(!JSON.stringify(stored).includes('"scripted":true'));
  assert.deepEqual(stored, stripScripted(OLD));
  assert.equal(migrateChats(), false, 'მეორედ შესაცვლელი აღარაფერია');
  // getChats ყოველთვის სუფთაა, თუნდაც ვინმემ მიგრაციის შემდეგ ძველი ჩაწეროს
  setJSON(KEYS.chats, { tina: [{ role: 'assistant', content: 'დაბრძანდით', scripted: true }] });
  assert.deepEqual(getChats(), {});
  // ისტორია არ არსებობს → არაფერი იწერება
  setJSON(KEYS.chats, null);
  assert.equal(migrateChats(), false);
});

// ---------- §2 ახალი შენობა ----------

test('§2 freshState: შენობა №1, დღე 0, შემოდგომა, ბზარი 0, ეგზემპლარი არ დაკარგულა, არავინ ნანახი', () => {
  const s = freshState({ days_per_season: 90 });
  assert.equal(s.cycle, 1);
  assert.equal(s.day, 0);
  assert.equal(s.season, 'autumn');
  assert.equal(s.crackStage, 0);
  assert.equal(s.lostCopies, 0);
  assert.deepEqual(s.visited, []);
  assert.equal(s.lastCharacterId, null);
  assert.equal(s.exchanges, 0);
  assert.deepEqual(Object.keys(initialState(1)).every((k) => k in s), true);
});

// ---------- §3 SSE ----------

const DONE_NOW = {
  done: true,
  usage: { input: 6271, output: 58 },
  cached_tokens: 0,
  proofread: 'unchanged',
  remaining: { input: 487000, output: 499000 },
  limits: { input: 500000, output: 500000 },
  period: 'monthly',
  resets_at: '2026-11-01T00:00:00.000Z',
  avg_input_per_request: 6458,
  requests: 4,
  exhausted: false,
  suggested_redirect: null,
  spoken_by: 'tina',
  spoken_by_name: 'თინა',
};

test('§3 done: ყველა დღევანდელი ველი + უცნობი მომავალი ველები → პარსინგი არ ტყდება, მთვლელი მხოლოდ საჭირო ველებს იღებს', () => {
  const future = { ...DONE_NOW, future_field: 'x', nested: { a: [1, { b: null }] }, list: [1, 2, 3], emoji: '📄', n: 1e308 };
  const ev = parseSseChunk(`data: ${JSON.stringify(future)}`);
  assert.equal(ev.done, true);
  assert.equal(ev.spoken_by, 'tina');
  assert.deepEqual(tokensFromDone(ev), {
    remaining: DONE_NOW.remaining, limits: DONE_NOW.limits, period: 'monthly', resets_at: DONE_NOW.resets_at, avg_input_per_request: 6458,
  });
  // SSE-ს შეიძლება სხვა ხაზებიც ჰქონდეს (event:, id:, კომენტარი) — data ხაზი მაინც მოიძებნება
  assert.equal(parseSseChunk(`: ping\nevent: message\nid: 7\ndata: ${JSON.stringify(DONE_NOW)}`).avg_input_per_request, 6458);
  // ველი აკლია → undefined (renderTokens ძველ მნიშვნელობას ინარჩუნებს), remaining არ არის → null
  assert.equal(tokensFromDone({ ...DONE_NOW, avg_input_per_request: undefined }).avg_input_per_request, undefined);
  assert.equal(tokensFromDone({ done: true }), null);
  assert.equal(tokensFromDone(null), null);
});

test('§3 SSE: delta / replace / error ივენთები უცვლელად; გაფუჭებული ნაწილი → null (არ ისვრის)', () => {
  assert.deepEqual(parseSseChunk('data: {"delta":"დიახ, "}'), { delta: 'დიახ, ' });
  assert.deepEqual(parseSseChunk('data: {"replace":"შესწორებული"}'), { replace: 'შესწორებული' });
  assert.deepEqual(parseSseChunk('data: {"error":"ხაზი დაკავებულია."}'), { error: 'ხაზი დაკავებულია.' });
  for (const bad of ['', 'data:', 'data: {"delta":', 'data: null', 'data: 42', 'data: [1]', 'data: "str"', ': keep-alive', null, undefined]) {
    assert.equal(parseSseChunk(bad), null, String(bad));
  }
});

// ---------- §3 რემარკა წინადადების შუაში ----------

test('§3 რემარკა ხაზის შუაში (*…*) — stage, inline (არა block); ხაზის დასაწყისში — block', () => {
  const segs = parseStage('*(ტელეფონში)* დიახ, გისმენთ, *(ყურმილს ფარავს)* ერთი წუთით.');
  assert.deepEqual(segs.map((s) => [s.type, s.text, Boolean(s.block)]), [
    ['stage', 'ტელეფონში', true],
    ['speech', 'დიახ, გისმენთ, ', false],
    ['stage', 'ყურმილს ფარავს', false],
    ['speech', ' ერთი წუთით.', false],
  ]);
  const mid = parseStage('ვაჟა ზაზაევიჩი *(ყურმილს ფარავს)* ერთი წუთით გავიდა.');
  assert.deepEqual(mid.map((s) => s.type), ['speech', 'stage', 'speech']);
  assert.equal(mid[1].block, false);
  assert.ok(!mid.some((s) => s.text.includes('*') || /[()]/.test(s.text)));
  // ხაზის გადატანის შემდეგ, მომდევნო ხაზის შუაში — ისევ inline (რენდერი მეზობელ ნაწილებს ამ ხაზზე აწებებს)
  const multi = parseStage('დიახ, გისმენთ…\nვაჟა ზაზაევიჩი *(ყურმილს ფარავს)* ერთი წუთით გავიდა.');
  assert.deepEqual(multi.map((s) => [s.type, Boolean(s.block)]), [['speech', false], ['stage', false], ['speech', false]]);
});
