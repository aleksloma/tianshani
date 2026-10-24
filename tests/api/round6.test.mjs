// Round 6 §4 API: ისტორია სერვერამდე მართლა მიდის (mock იმეორებს #1-ის სათაურს #3-ზე) და სერვერი history_window-ს
// მკაცრად ზღუდავს — 500 შეტყობინებაზე ჩუმად ჭრის, შეცდომის გარეშე (ყალბი Gemini SDK ამოწმებს, რა მივიდა მოდელამდე).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, chat, cookieJar, GS } from '../helpers.mjs';
import { _setClientForTests } from '../../src/gemini.js';

const calls = [];
const fake = {
  models: {
    list: async () => (async function* models() { yield { name: 'models/gemini-3.8-flash', supportedActions: ['generateContent'] }; }()),
    generateContentStream: async (req) => {
      calls.push(req);
      return (async function* stream() {
        yield { text: 'კი ბატონო.\nდაბრძანდით.' };
        yield { text: '', usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 12 } };
      }());
    },
    generateContent: async () => ({ text: '', candidates: [{ finishReason: 'STOP' }], usageMetadata: {} }),
  },
};

const TITLE_CHAT = [
  { role: 'user', content: 'ჩემს მოთხრობას „ქვიშის საათი“ ჰქვია, წაიკითხავთ?' },
  { role: 'assistant', content: 'ვკითხულობ, ჩემო კარგო, ვამთავრებ.' },
  { role: 'user', content: 'ეს სურათი რამდენი ხანია აქ კიდია?' },
  { role: 'assistant', content: 'ოცდაშვიდი წელია.' },
  { role: 'user', content: 'გახსოვთ, რა ერქვა ჩემს მოთხრობას?' },
];

let M; // mock, history_window 20
let M1; // mock, history_window 1
let F; // ყალბი SDK
before(async () => {
  M = await startTestServer();
  M1 = await startTestServer({ chat: { history_window: 1 } });
  F = await startTestServer({ gemini: { api_key: 'fake-key-for-tests', mock: false, model: 'gemini-3.8-flash', proofread: false } });
  _setClientForTests(fake);
});
after(async () => { await M.close(); await M1.close(); await F.close(); });

test('§4 mock: #1-ში ნათქვამ სათაურს („ქვიშის საათი“) #3-ზე იმეორებს — ისტორია სერვერამდე მიდის', async () => {
  const r = await chat(M.base, { characterId: 'vaso', messages: TITLE_CHAT, gameState: GS }, { jar: cookieJar() });
  assert.equal(r.status, 200);
  assert.ok(r.done, r.error || 'no done');
  assert.match(r.reply, /„ქვიშის საათი“/, r.reply);
});

test('§4 mock: history_window = 1 → მხოლოდ ბოლო შეტყობინება, სათაური აღარ „ახსოვს“ (ანუ მას მართლა ისტორია ატარებს)', async () => {
  const r = await chat(M1.base, { characterId: 'vaso', messages: TITLE_CHAT, gameState: GS }, { jar: cookieJar() });
  assert.equal(r.status, 200);
  assert.ok(r.done, r.error || 'no done');
  assert.doesNotMatch(r.reply, /ქვიშის საათი/, r.reply);
});

/** 500 შეტყობინება მარკერებით ⟦i⟧; ბოლო — მომხმარებლის. */
function longHistory(n = 500) {
  const msgs = [];
  for (let i = 0; i < n - 1; i++) msgs.push({ role: i % 2 ? 'assistant' : 'user', content: `შეტყობინება ⟦${i}⟧` });
  msgs.push({ role: 'user', content: `ბოლო ⟦${n - 1}⟧` });
  return msgs;
}

test('§4 სერვერის მკაცრი ზღვარი: 500 შეტყობინება → 200, მოდელამდე მხოლოდ ბოლო history_window (20), ძველი — არა', async () => {
  const before = calls.length;
  const r = await chat(F.base, { characterId: 'tina', messages: longHistory(500), gameState: GS }, { jar: cookieJar() });
  assert.equal(r.status, 200);
  assert.ok(r.done, r.error || 'no done');
  assert.equal(calls.length, before + 1);
  const sent = JSON.stringify(calls.at(-1).contents);
  const seen = [...sent.matchAll(/⟦(\d+)⟧/g)].map((m) => Number(m[1]));
  assert.equal(seen.length, 20, `მოდელამდე ${seen.length} შეტყობინება მივიდა`);
  assert.deepEqual(seen, Array.from({ length: 20 }, (_, i) => 480 + i), 'ბოლო 20, ძველიდან ახლისკენ');
});

test('§4 mock სერვერიც: 500 შეტყობინება → 200, შეცდომის გარეშე', async () => {
  const r = await chat(M.base, { characterId: 'bela', messages: longHistory(500), gameState: GS }, { jar: cookieJar() });
  assert.equal(r.status, 200);
  assert.ok(r.done, r.error || 'no done');
});
