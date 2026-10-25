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

// Round 1: სეზონებს დღეები მართავს. days_per_exchange > 0 → შეტყობინებებიც ამოძრავებს დროს (ძველი „exchanges_per_season“-ის ექვივალენტი).
const G = { days_per_season: 90, days_per_exchange: 45, days_per_character_switch: 20, seasons: ['autumn', 'winter', 'spring', 'summer'], crack_stages: 5, copies: 3 };

test('სეზონები days_per_exchange-ით: ყოველ 2 გაცვლაზე (45 დღე) → შემდეგი სეზონი, ბზარი +1, ეგზემპლარი −1, ბოლოს ჩამონგრევა', () => {
  let s = { ...initialState(1), season: 'autumn', crackStage: 0, lostCopies: 0 };
  let r = applyExchange(s, G, 'director');
  assert.deepEqual(r.events, []);
  assert.equal(r.state.exchanges, 1);
  assert.equal(r.state.day, 45);
  assert.deepEqual(r.state.visited, ['director']);
  r = applyExchange(r.state, G, 'vaso');
  assert.deepEqual(r.events, [{ type: 'season', season: 'winter' }]);
  assert.equal(r.state.season, 'winter');
  assert.equal(r.state.crackStage, 1);
  assert.equal(r.state.lostCopies, 1);
  assert.equal(r.state.exchanges, 2, 'exchanges სტატისტიკისთვის აღარ ნულდება');
  s = r.state;
  for (const expected of ['spring', 'summer']) {
    s = applyExchange(s, G, 'tina').state;
    r = applyExchange(s, G, 'tina');
    assert.deepEqual(r.events, [{ type: 'season', season: expected }]);
    s = r.state;
  }
  assert.equal(s.lostCopies, 3);
  assert.equal(s.crackStage, 3);
  s = applyExchange(s, G, 'tina').state;
  r = applyExchange(s, G, 'tina');
  assert.deepEqual(r.events, [{ type: 'collapse' }]);
  const n = nextCycle(r.state, G);
  assert.equal(n.cycle, 2);
  assert.equal(n.day, 0);
  assert.equal(n.season, 'autumn');
  assert.equal(n.crackStage, 0);
  assert.equal(n.lostCopies, 0);
  assert.equal(n.paintingFallen, false, 'ახალ შენობაში სურათი ისევ ეკიდება');
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

test('detectRedirect (Round 7 §1, ცვლის Round 2 §8-ს): ნებისმიერი სხვა პერსონაჟი სახელით, პირველივე შეტყობინებიდან; ბოლოს ნახსენები', () => {
  const d = byId.director;
  // ხელნაწერის მთვლელი აღარ კეტავს ღილაკს
  assert.equal(detectRedirect({ speaker: d, reply: 'დატოვე თინასთან, ბანკში ვარ.', currentId: 'director' }), 'tina');
  assert.equal(detectRedirect({ speaker: d, reply: 'ოთარ დავიდოვიჩს მიმართეთ.', currentId: 'director' }), 'otari');
  // სახელის გარეშე — არაფერი; თანამდებობა სახელი არ არის
  assert.equal(detectRedirect({ speaker: d, reply: 'ძალიან კარგი!', currentId: 'director' }), null);
  assert.equal(detectRedirect({ speaker: byId.tina, reply: 'დირექტორი ბანკშია', currentId: 'tina' }), null);
  // redirects_to-ს გარეთაც (სოსოს redirects_to ცარიელია)
  assert.equal(detectRedirect({ speaker: byId.soso, reply: 'თინა', currentId: 'soso' }), 'tina');
  // მიმდინარე ჩატის პერსონაჟზე და მოსაუბრეზე — არასდროს
  assert.equal(detectRedirect({ speaker: byId.tina, reply: 'ვაჟა ზაზაევიჩი ბანკშია', currentId: 'director' }), null);
  assert.equal(detectRedirect({ speaker: byId.bela, reply: 'ბელა ვარ, ადამიანო, წიგნში ასე წერია.', currentId: 'bela' }), null);
  // კუთვნილებითი სახელი: ბელასთვის „ქმარი“ ლერია
  assert.equal(detectRedirect({ speaker: byId.bela, reply: 'ჩემმა ქმარმა წაიღო სახლში.', currentId: 'bela' }), 'leri');
  assert.equal(detectRedirect({ speaker: byId.tina, reply: 'ჩემმა ქმარმა წაიღო სახლში.', currentId: 'tina' }), null);
  assert.equal(detectRedirect({ speaker: byId.bela, reply: 'ბატონ ვასოსთან შეიხედე.', currentId: 'bela' }), 'vaso');
  // რამდენიმე სახელი: ბოლოს ნახსენები (რეალური პასუხები Round 2 smoke-დან)
  assert.equal(detectRedirect({ speaker: byId.bela, reply: 'ლერიმ წაიღო სახლში, ბიჭო, ხომ გითხარი!\nშუქრის მიმართე ჯობია, ის უფრო ჩქარა კითხულობს.', currentId: 'bela' }), 'shukri');
  assert.equal(detectRedirect({ speaker: byId.bela, reply: 'ლერიმ წაიღო სახლში ის ნაწილი, ბიჭო, და იქნებ ბატონ ვასოს ჰკითხო?', currentId: 'bela' }), 'vaso');
  assert.equal(detectRedirect({ speaker: byId.bela, reply: 'შუქრიმ ყავა დალია.\nდანარჩენი ბატონ ვასოსთან გადავიდა და იმას ჰკითხე.', currentId: 'bela' }), 'vaso');
});

test('mock: ქართულად ქართულზე, ინგლისურად ინგლისურზე (ქართული ფრაზით), უხილავზე — „არ არის“', () => {
  const gs = { season: 'winter', crackStage: 0, lostCopies: 0, cycle: 1 };
  const ka = composeMockReply({ speaker: byId.director, invisible: null, userText: 'მოთხრობა წაიკითხეთ?', historyLen: 0, gameState: gs });
  assert.equal(guessLang(ka), 'ka');
  const en = composeMockReply({ speaker: byId.tina, invisible: null, userText: 'Hello, is the director in?', historyLen: 0, gameState: gs });
  assert.ok(en.includes('Excuse me'));
  assert.ok(en.startsWith('*('), 'Round 1: mock პასუხი რემარკით იწყება');
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
