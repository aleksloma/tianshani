// Round 6 (FIXES_ROUND6.md): §2 თანამდებობის სიტყვა ეკრანზე, §3 ორი ტაქტის კავშირი + ფრაზების „როდის“, §4 კონტექსტი (კლიენტის ფანჯარა, mock-ის „მეხსიერება“).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { characters, byId, publicList, ROLE_DISPLAY_KA, triggerFor, DEFAULT_TRIGGER } from '../../src/characters.js';
import { buildPrompt, GENERAL_RULES_EN, SHAPE_EXAMPLES, SHAPE_EXAMPLES_EN } from '../../src/prompt.js';
import { touchPool, touchPoolLine, pacingState, beatLink, addressForm, mixesAddress, phraseCore, catchphraseAllowed, catchphraseGateLine } from '../../src/pacing.js';
import { historyForServer } from '../../public/js/history.js';
import { recallTitle, composeMockReply } from '../../src/mock.js';

const CFG = { game: {} };
const GS = { day: 0, season: 'autumn', crackStage: 0, lostCopies: 0, cycle: 1 };
const TRIGGERS = JSON.parse(fs.readFileSync(new URL('../../src/data/catchphrase_triggers.json', import.meta.url), 'utf8')).characters;

// ---------- §2 ----------

test('§2 გრიშა: ეკრანზე „სამეურნეო ნაწილის გამგე“ (ფირფიტა, მენიუ, ჩატის სათაური); მონაცემი და პრომპტი — „მნე“', () => {
  const list = Object.fromEntries(publicList(12).map((c) => [c.id, c]));
  assert.equal(list.grisha.role_ka, 'სამეურნეო ნაწილის გამგე');
  assert.equal(list.grisha.role_short_ka, 'სამეურნეო ნაწილის გამგე');
  // მონაცემი უცვლელია; სიტყვა მონაცემიდანაა (name_ka-ს ფრჩხილებში)
  assert.equal(byId.grisha.role_ka, 'მნე');
  assert.ok(byId.grisha.name_ka.includes('(სამეურნეო ნაწილის გამგე)'));
  // სხვა არავის — მხოლოდ გრიშა (Round 6 §2: „ერთადერთი გაუგებარი სიტყვა“)
  assert.deepEqual(Object.keys(ROLE_DISPLAY_KA), ['grisha']);
  for (const c of characters) {
    if (c.id === 'grisha') continue;
    assert.equal(list[c.id].role_ka, c.role_ka, c.id);
    assert.equal(list[c.id].role_short_ka, c.role_short_ka, c.id);
  }
  // LLM-ის პრომპტში გრიშა ისევ „მნე“-ა (საკუთარ ბლოკშიც და სხვის გადამისამართებაშიც)
  assert.ok(buildPrompt({ speaker: byId.grisha, gameState: GS, cfg: CFG }).systemInstruction.includes('გრიშა — მნე'));
  const who = characters.find((c) => (c.redirects_to || []).includes('grisha'));
  if (who) assert.ok(buildPrompt({ speaker: who, gameState: GS, cfg: CFG }).systemInstruction.includes(`${byId.grisha.short_name_ka} (მნე)`));
});

// ---------- §3 ----------

test('§3 ყოველ ცნობილ ფრაზას აქვს „როდის“ (catchphrase_triggers.json) — ზუსტად characters.json-ის ფრაზები, ზედმეტი არა', () => {
  let n = 0;
  for (const c of characters) {
    const own = TRIGGERS[c.id] || {};
    for (const p of c.catchphrases_ka || []) {
      n += 1;
      assert.ok(typeof own[p] === 'string' && own[p].trim().length >= 10, `${c.id}: „${p}“ — trigger არ არის`);
      assert.equal(triggerFor(c, p), own[p]);
    }
    for (const k of Object.keys(own)) assert.ok((c.catchphrases_ka || []).includes(k), `${c.id}: ზედმეტი გასაღები „${k}“`);
  }
  assert.equal(n, 91);
  assert.equal(triggerFor(byId.tina, 'არარსებული ფრაზა'), DEFAULT_TRIGGER);
});

test('§3 პრომპტი: ყოველი ფრაზა „„ფრაზა“ — use only when: …“ ფორმით (პერსონაჟის ბლოკი და TOUCH POOL)', () => {
  for (const id of ['director', 'vaso', 'tamari', 'two_big_men']) {
    const c = byId[id];
    const s = buildPrompt({ speaker: c, gameState: GS, cfg: CFG, pacing: pacingState([{ role: 'user', content: 'გამარჯობა' }], c) }).systemInstruction;
    for (const p of c.catchphrases_ka) assert.ok(s.includes(`„${p}“ — use only when: ${TRIGGERS[id][p]}`), `${id}: ${p}`);
    assert.ok(s.includes('use only when'));
  }
  const vaso = byId.vaso;
  const pool = touchPool(vaso, pacingState([{ role: 'user', content: 'x' }], vaso));
  const phrases = pool.filter((x) => x.startsWith('„'));
  assert.ok(phrases.length >= 1);
  for (const x of phrases) assert.match(x, /^„[^“]+“ — use only when: .{10,}/);
  assert.ok(touchPoolLine(vaso, pacingState([], vaso)).includes('a catchphrase only if its "use only when" fits'));
});

test('§3 ზოგადი წესი: ორი ტაქტი — ერთი აზრი, ხიდი, ფრაზა მხოლოდ მიზეზით (~3-დან 1), წინააღმდეგობა არა, ერთი მიმართვის ფორმა', () => {
  const rule = GENERAL_RULES_EN.find((r) => r.startsWith('BEAT 2 FOLLOWS BEAT 1'));
  assert.ok(rule, 'წესი არ არის');
  for (const needle of [
    'The two beats must form one thought. Beat 2 is a continuation of beat 1 — triggered by it, commenting on it, or by what you are physically doing while saying it — never a separate statement dropped in.',
    'Make the connection visible with a bridge: a conjunction or particle (აბა, ისე, თორემ, ოღონდ, მერე, თუმცა, ხომ იცი), a shared subject, or a stage direction that motivates the line.',
    'if a listener would ask \'why did he suddenly say that?\', rewrite beat 2.',
    'A signature catchphrase is used **only when the conversation gives it a natural reason**',
    'Catchphrases should appear in roughly one reply out of three, not in every reply.',
    'Never contradict beat 1 in beat 2 (if you just invited something, do not send the person away in the next line).',
    'Keep one form of address per conversation',
    'and then mix consistently within a reply, not across one.',
  ]) assert.ok(rule.includes(needle), needle);
  assert.ok(GENERAL_RULES_EN.find((r) => r.startsWith('REPLY SHAPE')).includes('grows out of beat 1'));
  assert.ok(GENERAL_RULES_EN.length <= 25, String(GENERAL_RULES_EN.length));
  const s = buildPrompt({ speaker: byId.director, gameState: GS, cfg: CFG }).systemInstruction;
  assert.ok(s.includes('BEAT 2 FOLLOWS BEAT 1'));
});

test('§3 ორ-სვლიანი მაგალითი: ორივე პასუხში მეორე ტაქტი ხილულად გამომდინარეობს პირველიდან; ნეიტრალური', () => {
  const two = SHAPE_EXAMPLES.find((ex) => ex.turns.length === 2);
  for (const t of two.turns) {
    const l = beatLink(t.reply, t.user);
    assert.ok(l.beat1 && l.beat2, t.reply);
    assert.ok(l.bridge, `ხიდი არ არის: ${t.reply}`);
  }
  assert.equal(beatLink(two.turns[0].reply).bridge, 'word'); // „ისე, …“
  assert.ok(beatLink(two.turns[1].reply).stageBefore); // რემარკა მოტივირებს
  const all = SHAPE_EXAMPLES_EN.join('\n');
  for (const n of ['ვაჟა', 'ბელა', 'თინა', 'ვასო', 'სოსო', 'გრიშა']) assert.ok(!all.includes(n), n);
});

test('§3 ცნობილი ფრაზა ≈ 3-დან 1: სერვერი კრძალავს, თუ ბოლო ორ პასუხში იყო (PACING ხაზი + TOUCH POOL)', () => {
  const tina = byId.tina;
  const cp = tina.catchphrases_ka[1];
  const h = (replies) => replies.flatMap((r, i) => [{ role: 'user', content: `q${i}` }, { role: 'assistant', content: r }]).concat([{ role: 'user', content: 'ახალი' }]);
  const none = pacingState(h(['ა.', 'ბ.']), tina);
  assert.equal(none.repliesSinceCatchphrase, Infinity);
  assert.equal(catchphraseAllowed(none), true);
  const last = pacingState(h(['ა.', `${cp}`]), tina);
  assert.equal(last.repliesSinceCatchphrase, 0);
  assert.equal(catchphraseAllowed(last), false);
  assert.ok(!touchPool(tina, last).some((x) => x.startsWith('„')), 'ფრაზები pool-ში აღარ არის');
  assert.ok(catchphraseGateLine(last).startsWith('CATCHPHRASE FOR THIS REPLY: none'));
  const prev = pacingState(h([`${cp}`, 'ბ.']), tina);
  assert.equal(prev.repliesSinceCatchphrase, 1);
  assert.equal(catchphraseAllowed(prev), false);
  const old = pacingState(h([`${cp}`, 'ბ.', 'გ.']), tina);
  assert.equal(old.repliesSinceCatchphrase, 2);
  assert.equal(catchphraseAllowed(old), true);
  assert.ok(catchphraseGateLine(old).startsWith('CATCHPHRASE FOR THIS REPLY: allowed'));
  // პრომპტშია; ჩატის პირველ პასუხზე — დასაშვებია
  const sys = buildPrompt({ speaker: tina, gameState: GS, cfg: CFG, pacing: last }).systemInstruction;
  assert.ok(sys.includes('CATCHPHRASE FOR THIS REPLY: none'));
  assert.ok(sys.includes('BEAT 2 FOR THIS REPLY: it must continue beat 1, visibly.'));
  assert.equal(catchphraseAllowed(pacingState([{ role: 'user', content: 'გამარჯობა' }], tina)), true);
  // 8 პასუხი ზედიზედ, მოდელი ყოველთვის ამბობს ფრაზას, როცა შეუძლია → მაქსიმუმ 3 / 8
  const replies = [];
  let n = 0;
  for (let i = 0; i < 8; i++) {
    const p = pacingState(h(replies), tina);
    const say = catchphraseAllowed(p);
    if (say) n += 1;
    replies.push(say ? tina.catchphrases_ka[i % tina.catchphrases_ka.length] : 'ჩვეულებრივი პასუხი.');
  }
  assert.equal(n, 3);
});

test('§3 beatLink / addressForm / mixesAddress — ევრისტიკა', () => {
  // სპეცის ცუდი მაგალითები: ხიდი არ არის
  assert.equal(beatLink('„ქვიშის საათი“ ერქვა.\nარაფრის არ მეშინია! ტანკისტი ვიყავი, ომამდე!', 'სათაური გახსოვთ?').bridge, null);
  assert.equal(beatLink('პირდაპირ აქ, ჩემს მაგიდაზე დადე.\nმიდექი, მოდექი, შეაწუხე ვინმე, აბა მე აქ რისთვისა ვარ?', 'სად დავდო?').bridge, null);
  // კარგი: ხიდის სიტყვა / საერთო საგანი / რემარკა
  assert.equal(beatLink('დღეს ბანკშია.\nთორემ აქ იქნებოდა.').bridge, 'word');
  assert.equal(beatLink('დღეს ბანკშია.\nბანკიდან ორჯერ დარეკა.').bridge, 'shared');
  assert.equal(beatLink('დღეს არ არის.\n*(ფანჯარასთან მიდის)*\nგარეთ ისევ წვიმს.').bridge, 'stage');
  // „თან“, „თუ“ და ნაწილაკი „-ც“ („ისიც“) — კავშირებია
  assert.equal(beatLink('კედელს თვალს ვერ ვუსწორებ.\nთან ფანჯრის ძირას ისევ ყვირიან.').bridge, 'word');
  assert.equal(beatLink('სადილად ვერ ჩავალ.\nთუ ჩახვალ, ჩაი ამომიტანე.').bridge, 'word');
  assert.equal(beatLink('ოცდაშვიდი წელია ვკითხულობ.\nგრიშასთანაც ჩავედი, არავინ იცის.').bridge, 'word');
  // უკან მიმთითებელი („ეს ამბავი“) — იგივე საგანი
  assert.equal(beatLink('კედელს მთლად გაუყვა.\nკარგი სპეციალისტი არ უნდა გვყოლოდა, რომ ეს ამბავი დროზე ენახა?').bridge, 'anaphora');
  // მეორე ტაქტი, რომელიც არც ხიდით იწყება, არც საგანს იზიარებს — ცალკე „ჩავარდნილი“ — ისევ null
  assert.equal(beatLink('დღეს ბანკშია.\nრა ლამაზი ამინდია.').bridge, null);
  assert.equal(addressForm('დაბრძანდით, დაელოდეთ.'), 'თქვენ');
  assert.equal(addressForm('მოიტანე და დატოვე.'), 'შენ');
  assert.equal(addressForm('ხომ იცი, დაბრძანდით.'), 'თქვენ'); // „ხომ იცი“ — ნაწილაკი
  assert.equal(addressForm('თქვენ იცით, შენ კი არ იცი.'), 'mixed');
  assert.equal(addressForm('*(ყურმილს იღებს) შენ არა.*\nდღეს ბანკშია.'), null); // რემარკაში — მესამე პირს
  assert.equal(mixesAddress(byId.marksheideri), false); // „თქვენ, ქალბატონო, ბატონო“
  assert.equal(mixesAddress(byId.vaso), true); // „… შენ (ახალგაზრდებს)“
});

// ---------- §4 ----------

test('§4 historyForServer: ზუსტად ბოლო N (კონფიგიდან), ძველიდან ახლისკენ, როლები მონაცვლეობს, მხოლოდ {role, content}, scripted — არა', () => {
  const ex = JSON.parse(fs.readFileSync(new URL('../../settings.example.json', import.meta.url), 'utf8'));
  const N = ex.chat.history_window;
  assert.equal(N, 20);
  const msgs = [];
  for (let i = 0; i < 25; i++) msgs.push({ role: i % 2 ? 'assistant' : 'user', content: `m${i}`, ts: i, spoken_by: 'tina', redirect: null });
  const out = historyForServer(msgs, N);
  assert.equal(out.length, N);
  assert.deepEqual(out.map((m) => m.content), msgs.slice(-N).map((m) => m.content), 'ბოლო N, ძველიდან ახლისკენ');
  for (let i = 1; i < out.length; i++) assert.notEqual(out[i].role, out[i - 1].role, `როლები მონაცვლეობს (${i})`);
  for (const m of out) assert.deepEqual(Object.keys(m).sort(), ['content', 'role']);
  // scripted ჯერ იფილტრება, მერე იჭრება — N ნამდვილი შეტყობინება რჩება
  const withOld = [{ role: 'assistant', content: 'სკრიპტული', scripted: true }, ...msgs.slice(0, 3), { role: 'assistant', content: 'კიდევ', scripted: true }];
  assert.deepEqual(historyForServer(withOld, N).map((m) => m.content), ['m0', 'm1', 'm2']);
  assert.deepEqual(historyForServer(msgs, 3).map((m) => m.content), ['m22', 'm23', 'm24']);
  // ნაგავი / უცნობი როლი არ გადის
  assert.deepEqual(historyForServer([null, { role: 'system', content: 'x' }, { role: 'user', content: 5 }, { role: 'user', content: 'ok' }], N), [{ role: 'user', content: 'ok' }]);
  assert.deepEqual(historyForServer(undefined, N), []);
});

test('§4 mock-ის „მეხსიერება“: სათაურს #1-იდან იმეორებს #3-ზე, მხოლოდ ისტორიიდან', () => {
  const history = [
    { role: 'user', content: 'ჩემს მოთხრობას „ქვიშის საათი“ ჰქვია, წაიკითხავთ?' },
    { role: 'assistant', content: 'კი, კი.' },
    { role: 'user', content: 'ამინდი როგორია?' },
    { role: 'assistant', content: 'წვიმს.' },
  ];
  assert.equal(recallTitle('რა ერქვა ჩემს მოთხრობას?', history), 'ქვიშის საათი');
  assert.equal(recallTitle('რა ერქვა ჩემს მოთხრობას?', []), null);
  assert.equal(recallTitle('ამინდი როგორია?', history), null);
  const reply = composeMockReply({ speaker: byId.vaso, invisible: null, userText: 'გახსოვთ, რა სათაური ჰქონდა?', historyLen: 4, gameState: GS, history });
  assert.ok(reply.includes('„ქვიშის საათი“'), reply);
  assert.ok(!composeMockReply({ speaker: byId.vaso, invisible: null, userText: 'გახსოვთ, რა სათაური ჰქონდა?', historyLen: 0, gameState: GS, history: [] }).includes('ქვიშის საათი'));
  void phraseCore;
});
