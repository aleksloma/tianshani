// რეალური Gemini გზა (mock: false) ყალბი SDK კლიენტით: ListModels fallback, მოთხოვნის ფორმა, usage, retry, შეცდომები.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, chat, cookieJar, userMsg, GS } from '../helpers.mjs';
import { _setClientForTests } from '../../src/gemini.js';

const calls = [];
let mode = 'ok';
const fake = {
  models: {
    list: async () => (async function* models() {
      yield { name: 'models/gemini-2.5-flash', supportedActions: ['generateContent'] };
      yield { name: 'models/gemini-3.5-flash', supportedActions: ['generateContent', 'countTokens'] };
      yield { name: 'models/gemini-3.5-flash-lite', supportedActions: ['generateContent'] };
      yield { name: 'models/gemini-3.5-pro', supportedActions: ['generateContent'] };
      yield { name: 'models/text-embedding-004', supportedActions: ['embedContent'] };
    }()),
    generateContentStream: async (req) => {
      calls.push(req);
      if (mode === 'throw') throw new Error('503 UNAVAILABLE');
      if (mode === 'thinking' && req.config.thinkingConfig) throw new Error('thinking_budget 0 is not supported by this model');
      return (async function* stream() {
        yield { text: 'ძალიან კარგი! ' };
        yield { text: 'დატოვე თინასთან, ბანკში ვარ.' };
        yield { text: '', usageMetadata: { promptTokenCount: 1234, candidatesTokenCount: 56, thoughtsTokenCount: 4 } };
      }());
    },
  },
};

let S;
before(async () => {
  S = await startTestServer({ gemini: { api_key: 'fake-key-for-tests', mock: false, model: 'gemini-3.8-flash' } });
  _setClientForTests(fake);
});
after(async () => { await S.close(); });

test('არარსებული მოდელი → უახლესი Flash (lite/pro/embedding-ის გარეშე); მოთხოვნის ფორმა', async () => {
  assert.equal(S.cfg.gemini.mock, false);
  const jar = cookieJar();
  const r = await chat(S.base, { characterId: 'director', messages: userMsg('მოთხრობა წაიკითხეთ?'), gameState: GS }, { jar });
  assert.equal(r.status, 200);
  assert.equal(r.reply, 'ძალიან კარგი! დატოვე თინასთან, ბანკში ვარ.');
  const req = calls.at(-1);
  assert.equal(req.model, 'gemini-3.5-flash');
  assert.equal(req.config.temperature, 0.8); // Round 2 §8
  assert.equal(req.config.maxOutputTokens, 250);
  assert.deepEqual(req.config.thinkingConfig, { thinkingBudget: 0 });
  assert.ok(req.config.abortSignal);
  assert.ok(req.config.systemInstruction.includes('# WORLD'));
  assert.ok(req.config.systemInstruction.includes('Vazha Zazaevich'));
  // few-shot (3 დიალოგი = 6) + ახალი შეტყობინება; როლები user/model მონაცვლეობით
  assert.equal(req.contents.length, 7);
  assert.deepEqual(req.contents.slice(0, 2).map((c) => c.role), ['user', 'model']);
  assert.equal(req.contents.at(-1).role, 'user');
  assert.equal(req.contents.at(-1).parts[0].text, 'მოთხრობა წაიკითხეთ?');
  // usage რეალური რიცხვებიდან (thoughts → output)
  assert.deepEqual(r.done.usage, { input: 1234, output: 60 });
  // Round 2 §8: პირველ შეტყობინებაზე ღილაკი არ ჩნდება, თუნდაც პასუხი თინას ასახელებდეს
  assert.equal(r.done.suggested_redirect, null);
  assert.ok(req.config.systemInstruction.includes('# PACING\nMessages in this chat so far: 1. Messages about the manuscript so far: 1.'));
  const st = await (await fetch(`${S.base}/api/state`, { headers: { cookie: jar.header() } })).json();
  assert.deepEqual([st.used.input, st.used.output, st.used.requests], [1234, 60, 1]);
  // Round 2 §3: გლობალური ხარჯი რეალური usage-ით
  assert.ok(Math.abs(S.store.getGlobal(new Date().toISOString().slice(0, 7)).cost_usd - (1234 / 1e6 * 0.75 + 60 / 1e6 * 3.75)) < 1e-12);
  assert.equal(st.global.spent_usd, 0.0012, '/api/state — 4 ციფრამდე დამრგვალებული');
  // მე-3 შეტყობინება ხელნაწერზე → redirect
  const r3 = await chat(S.base, {
    characterId: 'director',
    messages: [
      { role: 'user', content: 'მოთხრობა წაიკითხეთ?' }, { role: 'assistant', content: 'ძალიან კარგი!' },
      { role: 'user', content: 'ხელნაწერი სად არის?' }, { role: 'assistant', content: 'აქ არის.' },
      { role: 'user', content: 'მაინც, წაიკითხავთ?' },
    ],
    gameState: GS,
  });
  assert.equal(r3.done.suggested_redirect, 'tina');
  assert.ok(calls.at(-1).config.systemInstruction.includes('Messages in this chat so far: 3. Messages about the manuscript so far: 3.'));
  const health = await (await fetch(`${S.base}/api/health`)).json();
  assert.deepEqual(health, { ok: true, provider: 'gemini', model: 'gemini-3.5-flash' });
});

test('thinking_budget-ს თუ მოდელი არ იღებს — მეორე ცდა thinkingConfig-ის გარეშე', async () => {
  mode = 'thinking';
  const n = calls.length;
  const r = await chat(S.base, { characterId: 'tina', messages: userMsg('გამარჯობა'), gameState: GS });
  mode = 'ok';
  assert.equal(r.status, 200);
  assert.ok(r.done);
  assert.equal(calls.length, n + 2);
  assert.ok(calls[n].config.thinkingConfig);
  assert.equal(calls[n + 1].config.thinkingConfig, undefined);
});

test('API შეცდომა → SSE error „ხაზი დაკავებულია…“, ლოგში პასუხი არ იწერება', async () => {
  mode = 'throw';
  const jar = cookieJar();
  const r = await chat(S.base, { characterId: 'vaso', messages: userMsg('გამარჯობა'), gameState: GS }, { jar });
  mode = 'ok';
  assert.equal(r.status, 200);
  assert.equal(r.error, 'ხაზი დაკავებულია. ცოტა ხანში სცადეთ.');
  assert.equal(r.done, null);
  const rows = S.store.db.prepare('SELECT COUNT(*) n FROM messages WHERE client_id = ?').get(jar.get('tianshani_cid'));
  assert.equal(rows.n, 0);
});

test('უხილავი რეალურ გზაზეც: წარმომადგენლის ხმა, მესამე პირი; გივის prompt მხოლოდ ფაქტად', async () => {
  const { byId } = await import('../../src/characters.js');
  const r = await chat(S.base, { characterId: 'givi', messages: userMsg('გივი არის?'), gameState: GS });
  const sys = calls.at(-1).config.systemInstruction;
  assert.ok(sys.includes('is addressing გივი, not you'));
  assert.ok(sys.includes("on გივი's behalf"));
  assert.ok(sys.includes('third person'));
  const charBlock = sys.slice(sys.indexOf('# YOUR CHARACTER'), sys.indexOf('# CURRENT STATE'));
  assert.ok(!charBlock.includes(byId.givi.system_prompt_en), 'ხმად — არასდროს');
  assert.notEqual(r.done.spoken_by, 'givi');
  // მოდელს მიდის ანოტირებული მომხმარებლის შეტყობინება, ლოგში — ორიგინალი
  const last = calls.at(-1).contents.at(-1).parts[0].text;
  assert.ok(last.startsWith('[სიტუაცია: მომხმარებელი ელაპარაკება — გივი, არა შენ. გივი აქ არ არის.'), last);
  assert.ok(last.endsWith('გივი არის?'));
  const logged = S.store.db.prepare("SELECT content FROM messages WHERE role = 'user' ORDER BY id DESC LIMIT 1").get();
  assert.equal(logged.content, 'გივი არის?');
});

test('Round 1: რეალურ მოთხოვნაში — სცენური რემარკების წესი და შიდა თარიღი', async () => {
  await chat(S.base, { characterId: 'director', messages: userMsg('გამარჯობა'), gameState: { ...GS, day: 44 } });
  const sys = calls.at(-1).config.systemInstruction;
  assert.ok(sys.includes('STAGE DIRECTIONS'));
  assert.ok(sys.includes('In-world date: 15 October 1983, autumn, day 45 of the season.'));
  assert.match(sys, /FOR THIS REPLY: (no stage direction|you may use ONE)/, 'ხილულ პერსონაჟს — none/optional');
  await chat(S.base, { characterId: 'gamkrelidze', messages: userMsg('წაიკითხეთ?'), gameState: GS });
  assert.ok(calls.at(-1).config.systemInstruction.includes('FOR THIS REPLY: start with one short stage direction'), 'წარმომადგენლის პირველი პასუხი — სცენა');
});
