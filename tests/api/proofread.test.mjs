// Round 3 §4: კორექტურის მეორე გავლა ბოლომდე (ყალბი Gemini SDK-ით): { replace } ივენთი, ტოკენები ლიმიტსა და ბიუჯეტში,
// ორივე ვერსია SQLite-ში, ადმინის „შესწორებული პასუხები“; შეცდომა/უცვლელი ტექსტი → replace არ არის.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, chat, cookieJar, userMsg, GS } from '../helpers.mjs';
import { _setClientForTests } from '../../src/gemini.js';

const ORIGINAL = ['*(სურათს ახედავს)* ', 'მე აქ ვჭედავარ ', 'ოცდაშვიდი წელიწადი!\nგაიტანეთ, გაიტანეთ გრენლანდია!'];
const FIXED = '*(სურათს ახედავს)* მე აქ ვზივარ ოცდაშვიდი წელიწადი!\nგაიტანეთ, გაიტანეთ გრენლანდია!';
let mode = 'fix';
const proofCalls = [];
const fake = {
  models: {
    list: async () => (async function* models() { yield { name: 'models/gemini-3.8-flash', supportedActions: ['generateContent'] }; }()),
    generateContentStream: async () => (async function* stream() {
      for (const t of ORIGINAL) yield { text: t };
      yield { text: '', usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 40, thoughtsTokenCount: 0, cachedContentTokenCount: 600 } };
    }()),
    generateContent: async (req) => {
      proofCalls.push(req);
      if (mode === 'throw') throw new Error('503 UNAVAILABLE');
      const text = mode === 'same' ? req.contents.at(-1).parts[0].text : mode === 'broken' ? 'კი.' : FIXED;
      return { text, candidates: [{ finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 42 } };
    },
  },
};

let S;
before(async () => {
  S = await startTestServer({ gemini: { api_key: 'fake-key-for-tests', mock: false, model: 'gemini-3.8-flash', proofread: true } });
  _setClientForTests(fake);
});
after(async () => { await S.close(); });

const lastAssistant = (cid) => S.store.db.prepare("SELECT content, proofread_original, proofread_changed, output_tokens FROM messages WHERE client_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1").get(cid);

test('§4 შესწორდა: SSE-ში { replace } (delta-ების შემდეგ, done-მდე), usage — ორივე გამოძახება, DB-ში ორივე ვერსია, ადმინში ჩანს', async () => {
  mode = 'fix';
  const jar = cookieJar();
  const r = await chat(S.base, { characterId: 'vaso', messages: userMsg('როგორ ხართ, ბატონო ვასო?'), gameState: GS }, { jar });
  assert.equal(r.status, 200);
  assert.equal(r.reply, ORIGINAL.join(''), 'სტრიმი — ორიგინალი (ბუშტი უკვე სრულად იკითხება)');
  const iReplace = r.events.findIndex((e) => e.replace);
  const iDone = r.events.findIndex((e) => e.done);
  const iLastDelta = r.events.map((e) => Boolean(e.delta)).lastIndexOf(true);
  assert.ok(iReplace > iLastDelta && iReplace < iDone, `${iLastDelta} < ${iReplace} < ${iDone}`);
  assert.equal(r.events[iReplace].replace, FIXED);
  assert.deepEqual(r.done.usage, { input: 1300, output: 82 });
  assert.equal(r.done.proofread, 'changed');
  assert.equal(r.done.cached_tokens, 600);
  // კორექტორის მოთხოვნა: temperature 0, max = 1.5 × 40, ინსტრუქციაში ვასოს დაშვებულთა სია (თამარის „რავა“ — არა)
  const req = proofCalls.at(-1);
  assert.equal(req.config.temperature, 0);
  assert.equal(req.config.maxOutputTokens, 64 + 512, 'max(64, 1.5 × 40) + ფიქრის მარაგი');
  assert.ok(req.config.systemInstruction.startsWith('Proofread this Georgian text.'));
  assert.ok(req.config.systemInstruction.includes('ოცდაშვიდი'));
  assert.ok(!/\bრავა\b|, რავა,/.test(req.config.systemInstruction));
  assert.equal(req.contents.at(-1).parts[0].text, ORIGINAL.join(''));
  // ლიმიტი და ბიუჯეტი — კორექტურის ტოკენების ჩათვლით
  const st = await (await fetch(`${S.base}/api/state`, { headers: { cookie: jar.header() } })).json();
  assert.deepEqual([st.used.input, st.used.output], [1300, 82]);
  // DB: შესწორებული content + ორიგინალი
  const row = lastAssistant(jar.get('tianshani_cid'));
  assert.equal(row.content, FIXED);
  assert.equal(row.proofread_original, ORIGINAL.join(''));
  assert.equal(row.proofread_changed, 1);
  // ადმინი
  const aj = cookieJar();
  aj.store(await fetch(`${S.base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-admin-pass' }) }));
  const pr = await (await fetch(`${S.base}/api/admin/proofread`, { headers: { cookie: aj.header() } })).json();
  assert.ok(pr.total >= 1);
  assert.equal(pr.rows[0].content, FIXED);
  assert.equal(pr.rows[0].proofread_original, ORIGINAL.join(''));
  assert.equal(pr.rows[0].character_name, 'ვასო');
  assert.equal((await fetch(`${S.base}/api/admin/proofread`)).status, 401);
});

test('§4 უცვლელი / უარყოფილი / შეცდომა → replace არ არის, ორიგინალი რჩება; ტოკენები მაინც ითვლება (თუ დაიხარჯა)', async () => {
  for (const [m, proofread, output] of [['same', 'unchanged', 82], ['broken', 'unchanged', 82], ['throw', 'skipped', 40]]) {
    mode = m;
    const jar = cookieJar();
    const r = await chat(S.base, { characterId: 'vaso', messages: userMsg(`კიდევ ერთხელ (${m})`), gameState: GS }, { jar });
    assert.equal(r.status, 200, m);
    assert.equal(r.events.filter((e) => e.replace).length, 0, m);
    assert.equal(r.done.proofread, proofread, m);
    assert.equal(r.done.usage.output, output, m);
    const row = lastAssistant(jar.get('tianshani_cid'));
    assert.equal(row.content, ORIGINAL.join(''), m);
    assert.equal(row.proofread_changed, 0, m);
    assert.equal(row.proofread_original, null, m);
  }
  mode = 'fix';
});

test('Round 4 §9: > 3 წინადადებიანი პასუხი სრულად მიდის, მაგრამ long_reply = 1 და ადმინის „ზედმეტად გრძელი პასუხები“-ში ჩანს', async () => {
  const LONG = 'ძალიან კარგი.\nხვალ კომისიაა.\nზეგ ბანკში ვარ.\nმერე შვებულებაში მივდივარ.\nაბა, კარგად.';
  const saved = fake.models.generateContentStream;
  fake.models.generateContentStream = async () => (async function* s() { yield { text: LONG }; yield { text: '', usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 } }; }());
  mode = 'same';
  const jar = cookieJar();
  const r = await chat(S.base, { characterId: 'director', messages: userMsg('ხვალ მოვიდე?'), gameState: GS }, { jar });
  fake.models.generateContentStream = saved;
  mode = 'fix';
  assert.equal(r.reply, LONG, 'სრულად სტრიმდება');
  const row = S.store.db.prepare("SELECT long_reply FROM messages WHERE client_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1").get(jar.get('tianshani_cid'));
  assert.equal(row.long_reply, 1);
  // მოკლე პასუხი — 0
  const jar2 = cookieJar();
  await chat(S.base, { characterId: 'vaso', messages: userMsg('როგორ ხართ?'), gameState: GS }, { jar: jar2 });
  assert.equal(S.store.db.prepare("SELECT long_reply FROM messages WHERE client_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1").get(jar2.get('tianshani_cid')).long_reply, 0);
  const aj = cookieJar();
  aj.store(await fetch(`${S.base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-admin-pass' }) }));
  const st = await (await fetch(`${S.base}/api/admin/stats`, { headers: { cookie: aj.header() } })).json();
  const d = st.long_replies.find((x) => x.character_id === 'director');
  assert.ok(d && d.n >= 1 && d.name === 'ვაჟა ზაზაევიჩი', JSON.stringify(st.long_replies));
  assert.ok(!st.long_replies.some((x) => x.character_id === 'vaso'));
});

test('§4 არაქართული ან მოკლე პასუხი — კორექტურა არ ეშვება', async () => {
  const n = proofCalls.length;
  const saved = fake.models.generateContentStream;
  fake.models.generateContentStream = async () => (async function* s() { yield { text: 'Excuse me, I am busy, leave it here please.' }; yield { text: '', usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }; }());
  const r = await chat(S.base, { characterId: 'vaso', messages: userMsg('Hello, are you there?'), gameState: GS });
  fake.models.generateContentStream = saved;
  assert.equal(r.done.proofread, 'skipped');
  assert.equal(proofCalls.length, n);
});
