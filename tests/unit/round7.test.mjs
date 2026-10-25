// FIXES_ROUND7: §1 გადამისამართების ღილაკი სახელით ნახსენები პერსონაჟიდან.
import test from 'node:test';
import assert from 'node:assert/strict';
import { characters, byId } from '../../src/characters.js';
import { NAME_FORMS, NAME_STOPWORDS, findMentions, mentions } from '../../src/names.js';
import { detectRedirect } from '../../src/redirect.js';
import { composeMockReply, sendTo } from '../../src/mock.js';
import { toward } from '../../public/js/names.js';
import { loadConfig, MSG_OLD_BUDGET_KEY } from '../../src/config.js';
import { tempSettings } from '../helpers.mjs';

const GS0 = { season: 'autumn', crackStage: 0, lostCopies: 0, cycle: 1, day: 0 };

// ---------- §1 ----------

test('§1 toward: „-სთან“ სწორი ბრუნვით (ხმოვანზე / თანხმოვანზე / მრავალსიტყვიანი)', () => {
  const cases = {
    გრიშა: 'გრიშასთან', კოტე: 'კოტესთან', სოსო: 'სოსოსთან', ვასო: 'ვასოსთან', თინა: 'თინასთან',
    ოთარი: 'ოთართან', იროდიონი: 'იროდიონთან', კოპალეიშვილი: 'კოპალეიშვილთან',
    გივი: 'გივისთან', ლალი: 'ლალისთან', შუქრი: 'შუქრისთან',
    'ქალბატონი თამარი': 'ქალბატონ თამართან', 'ვაჟა ზაზაევიჩი': 'ვაჟა ზაზაევიჩთან',
    'ორი დიდი კაცი': 'ორ დიდ კაცთან', 'ბელას ქმარი': 'ბელას ქმართან', მურმანიძე: 'მურმანიძესთან',
  };
  for (const [n, want] of Object.entries(cases)) assert.equal(toward(n), want, n);
  // ყველა პერსონაჟის ღილაკი „-თან“-ით მთავრდება და სახელს შეიცავს
  for (const c of characters) assert.match(toward(c.short_name_ka), /თან$/, c.id);
});

test('§1 სახელის ფორმები მონაცემებიდან: თანამდებობა/აღწერა არ ითვლება; ყველას აქვს სახელი, გარდა „ორი დიდი კაცისა“', () => {
  for (const c of characters) {
    const f = NAME_FORMS[c.id];
    const all = [...f.cons, ...f.vow];
    if (c.id === 'two_big_men') { assert.deepEqual(all, [], 'მხოლოდ აღწერაა, სახელი არა'); continue; }
    assert.ok(all.length >= 1, c.id);
    for (const r of all) assert.ok(!NAME_STOPWORDS.has(r) && !NAME_STOPWORDS.has(`${r}ი`), `${c.id}: ${r}`);
  }
  assert.deepEqual(NAME_FORMS.leri, { cons: ['ლერ'], vow: ['ლერი'] }, '„ბელას“ ბელას ეკუთვნის');
  assert.ok(!NAME_FORMS.grisha.vow.includes('მნე') && !NAME_FORMS.director.cons.includes('დირექტორ'));
});

test('§1 მატჩერი: ბრუნვის ფორმები, სიტყვის საზღვარი, სხვა სიტყვის ნაწილი არა', () => {
  const ids = (t) => findMentions(t).map((m) => m.id);
  for (const t of ['გრიშა', 'გრიშას', 'გრიშასთან ჩაიარე ქვევით', 'გრიშამ თქვა', 'გრიშაც აქაა', 'გრიშასთანაც']) assert.deepEqual(ids(t), ['grisha'], t);
  for (const t of ['ოთარი', 'ოთარს', 'ოთართან', 'ოთარმა', 'ოთარო!', 'კოპალეიშვილს ჰკითხეთ']) assert.ok(ids(t).length === 1, t);
  assert.deepEqual([...new Set(ids('ოთარ დავიდოვიჩს მიმართეთ'))], ['otari']);
  assert.deepEqual(ids('კოტეს ჰკითხე'), ['kote']);
  assert.deepEqual(ids('ვასოსთან შეიარე'), ['vaso']);
  assert.deepEqual(ids('გივი ოთახში არ არის, გივის ეძებენ'), ['givi', 'givi']);
  // სხვა სიტყვის ნაწილი / მსგავსი სიტყვა — არა
  for (const t of ['მოგივა', 'ბელადი', 'თინათინი', 'ლალისფერი ცა', 'დირექტორთან ჩაიარე', 'მნე მოვიდა']) assert.deepEqual(ids(t), [], t);
  assert.equal(mentions('ჩემმა ქმარმა წაიღო', 'leri', 'bela'), true);
  assert.equal(mentions('ჩემმა ქმარმა წაიღო', 'leri', 'tina'), false);
});

test('§1 detectRedirect: ბოლოს ნახსენები; არასდროს მოსაუბრე / მიმდინარე უხილავი; უხილავიც შეიძლება; მომხმარებლის სახელი არ ითვლება', () => {
  // ოთარის სცენა (FIXES_ROUND7 §1): „გრიშასთან ჩაიარე ქვევით“
  assert.equal(detectRedirect({ speaker: byId.otari, reply: 'ოთხი თვე? კოპალეიშვილს გადავეცი.\nგრიშასთან ჩაიარე ქვევით.', currentId: 'otari' }), 'grisha');
  assert.equal(detectRedirect({ speaker: byId.otari, reply: 'გრიშასთან იყავი? აბა, კოპალეიშვილს გადავეცი.', currentId: 'otari' }), 'kopaleishvili');
  // უხილავის ჩატი: წარმომადგენელი უხილავს ასახელებს — ეს ღილაკი არ არის; სხვა კარი — არის
  assert.equal(detectRedirect({ speaker: byId.soso, reply: 'გივი ოთახში არ არის.', currentId: 'givi' }), null);
  assert.equal(detectRedirect({ speaker: byId.soso, reply: 'გივი ოთახში არ არის.\nთინასთან დატოვეთ.', currentId: 'givi' }), 'tina');
  assert.equal(detectRedirect({ speaker: byId.tina, reply: '*(ტელეფონი რეკავს)* სოსო, შენ არა… გივი ისევ არ ჩანს.', currentId: 'tina' }), 'givi');
  // მომხმარებელს სოსო ჰქვია → „სოსო, ...“ მიმართვაა, არა სოსო-პერსონაჟის ხსენება
  assert.equal(detectRedirect({ speaker: byId.tina, reply: 'სოსო, დაბრძანდით.', currentId: 'tina', userName: 'სოსო' }), null);
  assert.equal(detectRedirect({ speaker: byId.tina, reply: 'სოსო, დაბრძანდით.', currentId: 'tina', userName: 'ნინო' }), 'soso');
});

test('§1 mock: მომხმარებელი სხვას ასახელებს → „<სახელი>-სთან ჩაიარეთ.“ (დეტერმინისტული, ტესტებისთვის)', () => {
  assert.equal(sendTo({ speaker: byId.otari, invisible: null, userText: 'გრიშა სად არის?' }), 'grisha');
  assert.equal(sendTo({ speaker: byId.otari, invisible: null, userText: 'ოთარ დავიდოვიჩ, წაიკითხეთ?' }), null, 'საკუთარი სახელი');
  assert.equal(sendTo({ speaker: byId.soso, invisible: byId.givi, userText: 'გივი აქ არის?' }), null, 'მიმდინარე უხილავი');
  const r = composeMockReply({ speaker: byId.otari, invisible: null, userText: 'გრიშა სად არის?', historyLen: 0, gameState: GS0 });
  assert.ok(r.endsWith('გრიშასთან ჩაიარეთ.'), r);
  assert.equal(detectRedirect({ speaker: byId.otari, reply: r, currentId: 'otari' }), 'grisha');
  const g = composeMockReply({ speaker: byId.tina, invisible: null, userText: 'გივი სად არის?', historyLen: 0, gameState: GS0 });
  assert.ok(g.endsWith('გივისთან ჩაიარეთ.'), g);
});

// ---------- §2 ----------

/** loadConfig დროებითი settings.json-ით (env-ის გარეშე). */
function withSettings(overrides, env = {}, fn) {
  const saved = { SETTINGS_PATH: process.env.SETTINGS_PATH, GLOBAL_MONTHLY_TOKENS: process.env.GLOBAL_MONTHLY_TOKENS, GLOBAL_MONTHLY_USD: process.env.GLOBAL_MONTHLY_USD };
  process.env.SETTINGS_PATH = tempSettings(overrides).file;
  delete process.env.GLOBAL_MONTHLY_TOKENS; delete process.env.GLOBAL_MONTHLY_USD;
  Object.assign(process.env, env);
  try { return fn(); } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

test('§2 კონფიგი: ნაგულისხმევი 45 000 000 ტოკენი; env GLOBAL_MONTHLY_TOKENS გადაფარავს; ფასები — მხოლოდ შეფასებისთვის', () => {
  withSettings({}, {}, () => {
    const cfg = loadConfig();
    assert.equal(cfg.budget.global_monthly_tokens, 45_000_000);
    assert.ok(!('global_monthly_usd' in cfg.budget));
    assert.equal(cfg.budget.price_input_per_1m_usd, 0.75);
    assert.equal(cfg.budget.warn_at_percent, 80);
  });
  withSettings({ budget: { global_monthly_tokens: 1000 } }, { GLOBAL_MONTHLY_TOKENS: '7' }, () => assert.equal(loadConfig().budget.global_monthly_tokens, 7));
});

test('§2 ძველი budget.global_monthly_usd settings-ში ან env-ში → სტარტი ჩერდება მკაფიო ტექსტით (ახალი გასაღების სახელით)', () => {
  withSettings({ budget: { global_monthly_usd: 50 } }, {}, () => {
    assert.throws(() => loadConfig(), (e) => e.message.includes('global_monthly_tokens') && e.message.includes('GLOBAL_MONTHLY_TOKENS') && e.message.includes('settings.json'));
  });
  withSettings({}, { GLOBAL_MONTHLY_USD: '50' }, () => assert.throws(() => loadConfig(), /GLOBAL_MONTHLY_TOKENS/));
  assert.match(MSG_OLD_BUDGET_KEY, /global_monthly_usd აღარ გამოიყენება/);
});
