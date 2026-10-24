// Round 5 API (ყალბი Gemini SDK-ით): §1 `scripted: true` შეტყობინება მოდელამდე არასდროს აღწევს; /api/characters-ში openers აღარ არის.
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

let S;
before(async () => {
  S = await startTestServer({ gemini: { api_key: 'fake-key-for-tests', mock: false, model: 'gemini-3.8-flash', proofread: false } });
  _setClientForTests(fake);
});
after(async () => { await S.close(); });

const OPENER = 'დიახ, დიახ… აბა, ჩემო კარგო, რა გაქვს?';

test('§1 ძველი სკრიპტული ხაზი (scripted: true) მოდელს არ ეგზავნება — ისტორიაში მხოლოდ ნამდვილი შეტყობინებები', async () => {
  const jar = cookieJar();
  const messages = [
    { role: 'assistant', content: OPENER, scripted: true },
    { role: 'user', content: 'გამარჯობათ' },
    { role: 'assistant', content: 'ძალიან კარგი!' },
    { role: 'user', content: 'ხელნაწერი წაიკითხეთ?' },
  ];
  const r = await chat(S.base, { characterId: 'director', messages, gameState: GS }, { jar });
  assert.equal(r.status, 200);
  assert.ok(r.done, r.error || 'no done');
  const sent = JSON.stringify(calls.at(-1).contents);
  assert.ok(!sent.includes(OPENER), 'სკრიპტული ხაზი მოდელამდე მივიდა');
  assert.ok(sent.includes('ხელნაწერი წაიკითხეთ?') && sent.includes('ძალიან კარგი!'));
});

test('§1 მხოლოდ სკრიპტული ასისტენტის ხაზი + მომხმარებელი → მუშაობს (ბოლო — მომხმარებელი)', async () => {
  const r = await chat(S.base, { characterId: 'tina', messages: [{ role: 'assistant', content: OPENER, scripted: true }, { role: 'user', content: 'დირექტორი აქ არის?' }], gameState: GS }, { jar: cookieJar() });
  assert.equal(r.status, 200);
  assert.ok(!JSON.stringify(calls.at(-1).contents).includes(OPENER));
});

test('§1 /api/characters: openers ველი აღარ არის', async () => {
  const j = await (await fetch(`${S.base}/api/characters`)).json();
  assert.ok(j.characters.length > 20);
  for (const c of j.characters) assert.ok(!('openers' in c), c.id);
});
