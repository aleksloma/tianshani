// Round 10 §3.2 / §4 (API): შიდა ჩანაწერის დაჭერა სერვერზე — mock ჩამრთველებით (mock_leak first/late/always, mock_truncate)
// და ყალბი Gemini SDK-ით (რეალური გზა: thought ნაწილები, MAX_TOKENS, შეწყვეტილი ცდის ტოკენები, ხელახალი გენერაციის მოთხოვნა).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, chat, cookieJar, userMsg, GS } from '../helpers.mjs';
import { _setClientForTests } from '../../src/gemini.js';
import { MOCK_LEAK_TEXT, MOCK_LATE_LEAK, MOCK_TRUNCATED_TAIL } from '../../src/mock.js';
import { REJECTED_LINE } from '../../src/prompt.js';
import { isMetaLeak } from '../../src/leak.js';

const Q = 'სამწუხაროდ ეგზემპლარები აღარ დამრჩა, მაგრამ გავითვალისწინებ.';
const HISTORY = [
  { role: 'user', content: 'ჩემი მოთხრობის ხელნაწერი მოგიტანეთ, წაიკითხავთ?' },
  { role: 'assistant', content: 'ხელნაწერი? ჯერ ეს ბიძგი გავარკვიოთ, ბატონო სანდრო.' },
  { role: 'user', content: Q },
];
const MSG_API_ERROR = 'ხაზი დაკავებულია. ცოტა ხანში სცადეთ.';
const body = (extra = {}) => ({ characterId: 'marksheideri', messages: HISTORY, gameState: GS, userName: 'სანდრო', ...extra });
const rowsOf = (S, jar) => S.store.db.prepare('SELECT role, content, meta_leak, discarded_reply, action, input_tokens, output_tokens FROM messages WHERE client_id = ? ORDER BY id').all(jar.get('tianshani_cid'));
const usageOf = (S, jar) => S.store.getUsage(jar.get('tianshani_cid'), new Date().toISOString().slice(0, 7));

const servers = {};
before(async () => {
  servers.normal = await startTestServer();
  servers.first = await startTestServer({ gemini: { mock_leak: 'first' } });
  servers.late = await startTestServer({ gemini: { mock_leak: 'late' } });
  servers.always = await startTestServer({ gemini: { mock_leak: 'always' } });
  servers.truncate = await startTestServer({ gemini: { mock_truncate: true } });
});
after(async () => { for (const S of Object.values(servers)) await S.close(); });

/** იგივე მოთხოვნა ჩვეულებრივ mock სერვერზე — „სუფთა“ პასუხი შესადარებლად. */
async function normal(extra) {
  const jar = cookieJar();
  const r = await chat(servers.normal.base, body(extra), { jar });
  assert.equal(r.status, 200);
  return { r, jar };
}

test('ჩვეულებრივი mock პასუხი: არც replace, არც meta_leak — ყველაფერი როგორც Round 9-ში', async () => {
  const { r, jar } = await normal();
  assert.ok(r.reply.length > 0);
  assert.equal(r.events.filter((e) => 'replace' in e).length, 0);
  assert.equal(r.done.proofread, 'skipped');
  const rows = rowsOf(servers.normal, jar);
  assert.deepEqual(rows.map((x) => [x.role, x.meta_leak, x.discarded_reply]), [['user', null, null], ['assistant', null, null]]);
});

test('mock_leak "first": კლიენტს მხოლოდ სუფთა ხელახალი პასუხი; meta_leak = 1, discarded_reply; ტოკენები — ორივე ცდის', async () => {
  const { r: ref } = await normal();
  const jar = cookieJar();
  const r = await chat(servers.first.base, body(), { jar });
  assert.equal(r.status, 200);
  assert.equal(r.reply, ref.reply, 'იგივე სუფთა პასუხი, რაც ჩვეულებრივ სერვერზე');
  for (const e of r.events) assert.ok(!JSON.stringify(e).includes('Context:') && !JSON.stringify(e).includes('Rules check'), JSON.stringify(e));
  assert.equal(r.events.filter((e) => 'replace' in e).length, 0);
  assert.equal(r.events.filter((e) => e.delta).length, 1, 'ერთ delta-დ');
  const rows = rowsOf(servers.first, jar);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].content, ref.reply);
  assert.equal(rows[1].meta_leak, 1);
  assert.equal(rows[1].discarded_reply, MOCK_LEAK_TEXT.slice(0, rows[1].discarded_reply.length));
  assert.ok(rows[1].discarded_reply.startsWith('Context: User says'));
  // ორი ცდა: პირველი (შეწყვეტილი, usage თავიდანვე მოვიდა) + ხელახალი
  assert.ok(r.done.usage.input > 1.9 * ref.done.usage.input, `${r.done.usage.input} vs ${ref.done.usage.input}`);
  assert.equal(r.done.usage.output, Math.ceil(MOCK_LEAK_TEXT.length / 3) + Math.ceil(ref.reply.length / 3));
  const u = usageOf(servers.first, jar);
  assert.deepEqual([u.input_tokens, u.output_tokens, u.requests], [r.done.usage.input, r.done.usage.output, 1]);
  const g = servers.first.store.getGlobal(new Date().toISOString().slice(0, 7));
  assert.deepEqual([g.input_tokens, g.output_tokens], [r.done.usage.input, r.done.usage.output]);
});

test('mock_leak "late": პირველი ხაზი გავიდა, ჭდე მოგვიანებით → { replace } სუფთა ტექსტით, ბაზაში — სუფთა', async () => {
  const { r: ref } = await normal();
  const jar = cookieJar();
  const r = await chat(servers.late.base, body(), { jar });
  assert.equal(r.status, 200);
  assert.ok(r.reply.endsWith(MOCK_LATE_LEAK), 'სტრიმში ჩანდა');
  const rep = r.events.filter((e) => 'replace' in e);
  assert.equal(rep.length, 1);
  assert.equal(rep[0].replace, ref.reply);
  assert.ok(r.events.indexOf(rep[0]) < r.events.indexOf(r.done));
  const rows = rowsOf(servers.late, jar);
  assert.equal(rows[1].content, ref.reply);
  assert.equal(rows[1].meta_leak, 1);
  assert.ok(rows[1].discarded_reply.endsWith(MOCK_LATE_LEAK));
  assert.equal(r.done.suggested_redirect, ref.done.suggested_redirect, 'ღილაკი — საბოლოო ტექსტიდან');
});

test('mock_leak "always": ხელახალიც გაჟონილია → { error } (არსებული ტექსტი), არაფერი ინახება, ტოკენები ითვლება', async () => {
  const jar = cookieJar();
  const r = await chat(servers.always.base, body(), { jar });
  assert.equal(r.status, 200);
  assert.equal(r.error, MSG_API_ERROR);
  assert.equal(r.done, null);
  assert.equal(r.events.filter((e) => e.delta).length, 0, 'გაჟონილი ტექსტი არ გაგზავნილა');
  assert.equal(rowsOf(servers.always, jar).length, 0);
  const u = usageOf(servers.always, jar);
  assert.ok(u.input_tokens > 0 && u.output_tokens > 0 && u.requests === 1);
});

test('mock_truncate (MAX_TOKENS): { replace } ბოლო სრულ წინადადებამდე; ბაზაში მოჭრილი, discarded_reply — სრული', async () => {
  const { r: ref } = await normal();
  const jar = cookieJar();
  const r = await chat(servers.truncate.base, body(), { jar });
  assert.equal(r.status, 200);
  assert.equal(r.reply, `${ref.reply}\n${MOCK_TRUNCATED_TAIL}`);
  const rep = r.events.filter((e) => 'replace' in e);
  assert.deepEqual(rep.map((e) => e.replace), [ref.reply]);
  const rows = rowsOf(servers.truncate, jar);
  assert.equal(rows[1].content, ref.reply);
  assert.equal(rows[1].meta_leak, null);
  assert.equal(rows[1].discarded_reply, `${ref.reply}\n${MOCK_TRUNCATED_TAIL}`);
});

test('ეგზემპლარის გადაცემა + "first": იგივე action_result, ერთი გაცვლა ბაზაში', async () => {
  const action = { type: 'hand_over', copyId: 1, integrity: 'full' };
  const msg = [{ role: 'user', content: '*სანდრო ვასოს ეგზემპლარს გადასცემს.*\nმალე წაიკითხავთ?' }];
  const ref = await chat(servers.normal.base, { characterId: 'vaso', messages: msg, gameState: GS, userName: 'სანდრო', action });
  const jar = cookieJar();
  const r = await chat(servers.first.base, { characterId: 'vaso', messages: msg, gameState: GS, userName: 'სანდრო', action }, { jar });
  assert.equal(r.status, 200);
  assert.deepEqual(r.done.action_result, ref.done.action_result);
  assert.equal(r.done.action_result.outcome, 'accepted');
  assert.equal(r.reply, ref.reply);
  const rows = rowsOf(servers.first, jar);
  assert.deepEqual(rows.map((x) => [x.role, x.action]), [['user', 'hand_over:accepted'], ['assistant', 'hand_over:accepted']]);
});

// ---------- რეალური გზა ყალბი SDK-ით ----------

const calls = [];
const gens = [];
let script = null; // [chunk, …] შემდეგი სტრიმისთვის
let generated = null;
const fake = {
  models: {
    list: async () => (async function* m() { yield { name: 'models/gemini-3.8-flash', supportedActions: ['generateContent'] }; }()),
    generateContentStream: async (req) => {
      calls.push(req);
      const chunks = script;
      return (async function* s() {
        for (const c of chunks) {
          if (req.config.abortSignal?.aborted) throw new Error('aborted');
          yield c;
        }
      }());
    },
    generateContent: async (req) => { gens.push(req); return generated; },
  },
};
const part = (text, extra = {}) => ({ candidates: [{ content: { parts: [{ text }] }, ...extra }] });
let R;

test('რეალური გზა: გაჟონილი ისტორიის პასუხი მოდელს არ მიდის; thought ნაწილი კლიენტამდე არ აღწევს', async () => {
  R = await startTestServer({ gemini: { api_key: 'fake-key-for-tests', mock: false, model: 'gemini-3.8-flash', proofread: false } });
  _setClientForTests(fake);
  script = [
    { candidates: [{ content: { parts: [{ text: 'Rules check: language — Georgian. Plan: two beats.', thought: true }] } }] },
    part('კი ბატონო.\n'),
    { ...part('ხვალ შემოიარეთ.'), usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 12, thoughtsTokenCount: 40 } },
  ];
  const r = await chat(R.base, { characterId: 'marksheideri', messages: [...HISTORY.slice(0, 1), { role: 'assistant', content: MOCK_LEAK_TEXT }, ...HISTORY.slice(2)], gameState: GS });
  assert.equal(r.status, 200);
  assert.equal(r.reply, 'კი ბატონო.\nხვალ შემოიარეთ.');
  assert.ok(!JSON.stringify(r.events).includes('Rules check'));
  const sent = JSON.stringify(calls.at(-1).contents);
  assert.ok(!sent.includes('Rules check') && !sent.includes('Context: User says'), 'გაჟონილი ისტორია არ გაიგზავნა');
  assert.ok(calls.at(-1).contents.at(-1).parts[0].text.endsWith(`${HISTORY[0].content}\n${Q}`), 'ორი მომხმარებლის შეტყობინება ერთ user-ად');
  assert.ok(calls.at(-1).config.systemInstruction.trimEnd().split('\n').at(-1).startsWith('OUTPUT: everything you write is shown to the visitor verbatim as მარკშეიდერი\'s words.'));
  assert.deepEqual(r.done.usage, { input: 800, output: 52 });
});

test('რეალური გზა: ადრეული გაჟონვა → სტრიმი წყდება, ხელახალი generateContent იგივე ინსტრუქციით + REJECTED; შეწყვეტილის usage ითვლება', async () => {
  script = [
    { ...part('Context: User has no copies left.\n'), usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 10 } },
    part('Speaker: მარკშეიდერი.\n'),
    part('მესამე ხაზი, რომელიც აღარ უნდა მოვიდეს.'),
  ];
  generated = { candidates: [{ content: { parts: [{ text: 'ჯერ ეს ბიძგი გავარკვიოთ, ბატონო.\nეს ბზარი იყო აქ?' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 950, candidatesTokenCount: 20 } };
  const jar = cookieJar();
  const r = await chat(R.base, body(), { jar });
  assert.equal(r.status, 200);
  assert.equal(r.reply, 'ჯერ ეს ბიძგი გავარკვიოთ, ბატონო.\nეს ბზარი იყო აქ?');
  assert.ok(!JSON.stringify(r.events).includes('Context:'));
  const g = gens.at(-1);
  const s = calls.at(-1);
  assert.equal(g.config.systemInstruction, `${s.config.systemInstruction}\n\n${REJECTED_LINE}`);
  assert.deepEqual(g.contents, s.contents);
  assert.equal(g.config.temperature, 0.8);
  assert.equal(g.config.maxOutputTokens, s.config.maxOutputTokens);
  assert.deepEqual(g.config.thinkingConfig, s.config.thinkingConfig);
  assert.deepEqual(r.done.usage, { input: 1850, output: 30 });
  const row = rowsOf(R, jar)[1];
  assert.equal(row.meta_leak, 1);
  assert.ok(row.discarded_reply.startsWith('Context: User has no copies left.\nSpeaker: მარკშეიდერი.'));
});

test('რეალური გზა: MAX_TOKENS → ბოლო სრულ წინადადებამდე ({ replace }); ჩვეულებრივი STOP — არასდროს', async () => {
  script = [part('ჯერ ეს ბიძგი გავარკვიოთ.\n'), { ...part('უბრალოდ, ახლა excuse/pol', { finishReason: 'MAX_TOKENS' }), usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 256 } }];
  const r = await chat(R.base, body());
  assert.deepEqual(r.events.filter((e) => 'replace' in e).map((e) => e.replace), ['ჯერ ეს ბიძგი გავარკვიოთ.']);
  script = [part('ჯერ ეს ბიძგი გავარკვიოთ.\n'), { ...part('უბრალოდ, ახლა', { finishReason: 'STOP' }), usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }];
  const r2 = await chat(R.base, body());
  assert.equal(r2.events.filter((e) => 'replace' in e).length, 0, 'STOP — ბოლო სიმბოლოს მიუხედავად');
  // MAX_TOKENS და სრული წინადადება საერთოდ არ არის → შეცდომა, არაფერი ინახება
  script = [{ ...part('ჯერ ეს ბიძგი', { finishReason: 'MAX_TOKENS' }), usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 256 } }];
  const jar = cookieJar();
  const r3 = await chat(R.base, body(), { jar });
  assert.equal(r3.error, MSG_API_ERROR);
  assert.equal(rowsOf(R, jar).length, 0);
});

test('რეალური გზა: ქართულ საუბარში მოკლე რუსული პირველი ხაზი („Да-да.“) — არა გაჟონვა, ხელახალი ცდა არ ხდება', async () => {
  const n = gens.length;
  script = [part('Да-да.\n'), { ...part('ეს ზავხოზთან უნდა გაიაროს, ბატონო.'), usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 9 } }];
  const r = await chat(R.base, body());
  assert.equal(r.reply, 'Да-да.\nეს ზავხოზთან უნდა გაიაროს, ბატონო.');
  assert.equal(gens.length, n);
  assert.equal(isMetaLeak(r.reply, { expectLang: 'ka' }).leak, false);
  await R.close();
});
