// game.js (სუფთა ლოგიკა), limits.js, lang.js, redirect.js, mock.js, gemini.toGeminiContents, config.js env.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyExchange, nextCycle, initialState } from '../../public/js/game.js';
import { periodKey, createRateLimiter, balance } from '../../src/limits.js';
import { guessLang, mentionsManuscript } from '../../src/lang.js';
import { detectRedirect } from '../../src/redirect.js';
import { composeMockReply, dative } from '../../src/mock.js';
import { toGeminiContents } from '../../src/gemini.js';
import { byId } from '../../src/characters.js';

const G = { exchanges_per_season: 2, seasons: ['autumn', 'winter', 'spring', 'summer'], crack_stages: 5, copies: 3 };

test('სეზონები: ყოველ N გაცვლაზე → შემდეგი სეზონი, ბზარი +1, ეგზემპლარი −1', () => {
  let s = initialState(1, G.seasons);
  let r = applyExchange(s, G, 'director');
  assert.equal(r.event, null);
  assert.equal(r.state.exchanges, 1);
  assert.deepEqual(r.state.visited, ['director']);
  r = applyExchange(r.state, G, 'vaso');
  assert.equal(r.event, 'season');
  assert.equal(r.state.season, 'winter');
  assert.equal(r.state.crackStage, 1);
  assert.equal(r.state.lostCopies, 1);
  assert.equal(r.state.exchanges, 0);
  s = r.state;
  for (const expected of ['spring', 'summer']) {
    s = applyExchange(s, G, 'tina').state;
    r = applyExchange(s, G, 'tina');
    assert.equal(r.event, 'season');
    assert.equal(r.state.season, expected);
    s = r.state;
  }
  assert.equal(s.lostCopies, 3);
  assert.equal(s.crackStage, 3);
  // ზაფხულის ბოლო → ჩამონგრევა
  s = applyExchange(s, G, 'tina').state;
  r = applyExchange(s, G, 'tina');
  assert.equal(r.event, 'collapse');
  assert.equal(r.state.crackStage, 4);
  const n = nextCycle(r.state, G);
  assert.deepEqual({ ...n, visited: [] }, { cycle: 2, season: 'autumn', exchanges: 0, crackStage: 0, lostCopies: 0, visited: [] });
});

test('periodKey: monthly → YYYY-MM, lifetime → all', () => {
  assert.equal(periodKey('monthly', new Date('2026-10-23T12:00:00Z')), '2026-10');
  assert.equal(periodKey('lifetime'), 'all');
});

test('balance: დარჩენილი და exhausted', () => {
  const store = { getUsage: () => ({ input_tokens: 90, output_tokens: 10, requests: 3 }) };
  const cfg = { limits: { period: 'monthly', per_client_input_tokens: 100, per_client_output_tokens: 100 } };
  let b = balance(store, cfg, 'x');
  assert.deepEqual(b.remaining, { input: 10, output: 90 });
  assert.equal(b.exhausted, false);
  cfg.limits.per_client_input_tokens = 90;
  b = balance(store, cfg, 'x');
  assert.equal(b.exhausted, true);
});

test('rate limiter: N წუთში, მერე უარი, წუთის შემდეგ ისევ', () => {
  const r = createRateLimiter(3);
  assert.ok(r.allow('a', 0) && r.allow('a', 1) && r.allow('a', 2));
  assert.ok(!r.allow('a', 3));
  assert.ok(r.allow('b', 3));
  assert.ok(r.allow('a', 60_500));
});

test('guessLang / mentionsManuscript', () => {
  assert.equal(guessLang('გამარჯობა, როგორ ხართ?'), 'ka');
  assert.equal(guessLang('Hello there, how are you?'), 'en');
  assert.equal(guessLang('Здравствуйте, как дела?'), 'ru');
  assert.equal(guessLang('123 !!!'), 'unknown');
  assert.ok(mentionsManuscript('ჩემი მოთხრობა წაიკითხეთ?'));
  assert.ok(mentionsManuscript('Will you read my manuscript?'));
  assert.ok(!mentionsManuscript('როგორი ამინდია?'));
});

test('detectRedirect: ტექსტში ნახსენები redirects_to; სხვა შემთხვევაში 50% ხელნაწერზე', () => {
  const d = byId.director;
  assert.equal(detectRedirect({ speaker: d, reply: 'დატოვე თინასთან, ბანკში ვარ.', userText: 'გამარჯობა', currentId: 'director' }), 'tina');
  assert.equal(detectRedirect({ speaker: d, reply: 'ოთარ დავიდოვიჩს მიმართეთ.', userText: 'x', currentId: 'director' }), 'otari');
  assert.equal(detectRedirect({ speaker: d, reply: 'ძალიან კარგი!', userText: 'ამინდი?', currentId: 'director' }), null);
  assert.ok(d.redirects_to.includes(detectRedirect({ speaker: d, reply: 'ძალიან კარგი!', userText: 'მოთხრობა წაიკითხეთ?', currentId: 'director', rnd: () => 0.1 })));
  assert.equal(detectRedirect({ speaker: d, reply: 'ძალიან კარგი!', userText: 'მოთხრობა წაიკითხეთ?', currentId: 'director', rnd: () => 0.9 }), null);
  // სოსოს redirects_to ცარიელია
  assert.equal(detectRedirect({ speaker: byId.soso, reply: 'თინა', userText: 'მოთხრობა', currentId: 'soso' }), null);
  // მიმდინარე ჩატის პერსონაჟზე არ გადავამისამართებთ
  assert.equal(detectRedirect({ speaker: byId.tina, reply: 'დირექტორი ბანკშია', userText: 'x', currentId: 'director' }), null);
});

test('mock: ქართულად ქართულზე, ინგლისურად ინგლისურზე (ქართული ფრაზით), უხილავზე — „არ არის“', () => {
  const gs = { season: 'winter', crackStage: 0, lostCopies: 0, cycle: 1 };
  const ka = composeMockReply({ speaker: byId.director, invisible: null, userText: 'მოთხრობა წაიკითხეთ?', historyLen: 0, gameState: gs });
  assert.equal(guessLang(ka), 'ka');
  const en = composeMockReply({ speaker: byId.tina, invisible: null, userText: 'Hello, is the director in?', historyLen: 0, gameState: gs });
  assert.ok(en.startsWith('Excuse me'));
  assert.ok(/[Ⴀ-ჿ]/.test(en), 'ცნობილი ფრაზა ქართულად რჩება');
  const absent = composeMockReply({ speaker: byId.two_big_men, invisible: byId.givi, userText: 'გივი აქ არის?', historyLen: 0, gameState: gs });
  assert.ok(absent.includes('გივი ოთახში არ არის'));
  assert.equal(dative('ოთარი'), 'ოთარს');
  assert.equal(dative('თინა'), 'თინას');
});

test('toGeminiContents: user/model როლები, ერთნაირი ერთიანდება, პირველი — user', () => {
  const c = toGeminiContents([
    { role: 'assistant', content: 'a' }, { role: 'user', content: 'b' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'd' },
  ]);
  assert.deepEqual(c.map((x) => x.role), ['user', 'model', 'user', 'model']);
  assert.equal(c[2].parts[0].text, 'b\nc');
});

test('config: env ცვლადები გადაფარავს settings.json-ს; გასაღების გარეშე → mock', async () => {
  const { loadConfig } = await import('../../src/config.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tianshani-cfg-'));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify({ gemini: { api_key: 'PASTE_YOUR_KEY' }, admin: { password: 'CHANGE_ME' } }));
  const saved = { ...process.env };
  try {
    process.env.SETTINGS_PATH = file;
    delete process.env.GEMINI_API_KEY; delete process.env.PORT; delete process.env.HOST; delete process.env.GEMINI_MOCK;
    let cfg = loadConfig();
    assert.equal(cfg.gemini.mock, true);
    assert.ok(cfg.warnings.some((w) => w.includes('გამომცემლობას გასაღები დაეკარგა')));
    assert.ok(cfg.warnings.some((w) => w.includes('CHANGE_ME')));
    assert.equal(cfg.server.host, '127.0.0.1');
    assert.equal(cfg.limits.period, 'monthly');
    Object.assign(process.env, { PORT: '8080', GEMINI_API_KEY: 'k-123', ADMIN_PASSWORD: 'pw', DB_PATH: path.join(dir, 'x.db') });
    cfg = loadConfig();
    assert.equal(cfg.server.port, 8080);
    assert.equal(cfg.server.host, '0.0.0.0', 'ჰოსტინგზე 0.0.0.0');
    assert.equal(cfg.gemini.api_key, 'k-123');
    assert.equal(cfg.gemini.mock, false);
    assert.equal(cfg.admin.password, 'pw');
    assert.equal(cfg.logging.db_path, path.join(dir, 'x.db'));
    process.env.HOST = '127.0.0.2';
    assert.equal(loadConfig().server.host, '127.0.0.2');
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
