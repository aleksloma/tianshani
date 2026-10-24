// Round 4 (FIXES_ROUND4.md): ეგზემპლარების ტემპი (§2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { derive, withDefaults, advanceDays } from '../../public/js/calendar.js';
import { LOST_COPY_NOTES } from '../../public/js/game.js';
import { questionsLeft, questionsLeftText, tokensTipLine, limitBody, AVG_INPUT_FALLBACK, CLIENT_SENTENCE } from '../../public/js/format.js';

// ---------- §4 ----------
import { GENERAL_RULES_EN, buildPrompt, georgianScriptPhrases } from '../../src/prompt.js';
import { byId } from '../../src/characters.js';

test('§4 ენის წესი: უცხოენოვან პასუხში ფრაზები ქართული დამწერლობით, ტრანსლიტერაციის გარეშე; რემარკა — პასუხის ენაზე', () => {
  const lang = GENERAL_RULES_EN.find((r) => r.startsWith('LANGUAGE:'));
  assert.ok(lang.includes('When you answer in a language other than Georgian, your catchphrases, signature words and dialect forms stay in **Georgian script**, untranslated and untransliterated, embedded in the foreign-language sentence'));
  assert.ok(lang.includes('Everything else is in the user\'s language. Stage directions follow the language of the reply.'));
  // მაგალითი ნეიტრალურია — თამარის საფირმო ფრაზა/დიალექტი საერთო წესში არ ხვდება (Round 2/3)
  assert.ok(!/ნელთბილად|ბოშო/.test(lang));
  // საკუთარი სია: თამარს — ნელთბილად/ბოშო/რავა; ვასოს — არა (მისი — „ოცდაშვიდი წელიწადი“)
  const tam = georgianScriptPhrases(byId.tamari);
  for (const w of ['ვარ ნელთბილად', 'ბოშო', 'რავა']) assert.ok(tam.includes(w), w);
  const vaso = georgianScriptPhrases(byId.vaso);
  assert.ok(vaso.includes('ოცდაშვიდი წელიწადი') && !vaso.some((x) => /ბოშო|რავა|ნელთბილად/.test(x)));
  const CFG = { game: {} };
  assert.ok(buildPrompt({ speaker: byId.tamari, gameState: { day: 0 }, cfg: CFG }).systemInstruction.includes('Phrases that stay in Georgian script in any language'));
  const stage = GENERAL_RULES_EN.find((r) => r.startsWith('STAGE DIRECTIONS:'));
  assert.ok(stage.includes('in the language of the reply (Georgian by default)'));
  assert.ok(!stage.includes('Stage directions are in Georgian,'), 'წინააღმდეგობა აღარ არის');
});

// ---------- §8 ჩატის პირველი ხაზი ----------
import { characters, openersFor } from '../../src/characters.js';
import { pickOpener } from '../../public/js/format.js';
import { parseStage } from '../../public/js/stage.js';
import { findNonWords } from '../../src/georgian.js';
import { forbiddenDialectFor } from '../../src/proofread.js';

test('§8 პირველი ხაზები: ყველას 3+, თითო ≤ 3 ხაზი, ქართულად, „ტოკენ“/ლათინური/არარსებული სიტყვა არ არის; სხვისი კილო არა', () => {
  for (const c of characters) {
    const list = openersFor(c);
    assert.ok(list.length >= 3, `${c.id}: ${list.length}`);
    for (const o of list) {
      const lines = o.text.split('\n').filter((l) => l.trim());
      assert.ok(lines.length >= 1 && lines.length <= 3, `${c.id}: ${o.text}`);
      assert.ok(/[ა-ჰ]/.test(o.text) && !/[A-Za-z]/.test(o.text), `${c.id}: ${o.text}`);
      assert.ok(!/ტოკენ|სოსო,|ჩემო სოსო/.test(o.text), `${c.id}: ${o.text}`);
      assert.deepEqual(findNonWords(o.text), []);
      // * დაბალანსებულია, რემარკა სწორად იპარსება
      assert.equal((o.text.match(/\*/g) || []).length % 2, 0, `${c.id}: ${o.text}`);
      assert.ok(parseStage(o.text).some((s) => s.type === 'speech'), `${c.id}: საუბარი არ არის`);
      for (const w of forbiddenDialectFor(c)) assert.ok(!new RegExp(`(^|[^ა-ჰ])${w}([^ა-ჰ]|$)`).test(o.text), `${c.id}: ${w}`);
    }
    if (!c.reachable) {
      assert.ok(list.every((o) => o.spoken_by && o.spoken_by !== c.id), `${c.id}: წარმომადგენელი`);
      assert.ok(list.every((o) => /არ არის|დაკავებულია|დაკეტილია|არ დადის|ჯარშია|მივლინებაშია|კომისარიატშია/.test(o.text)), c.id);
    }
  }
});

test('§8 არჩევანი დეტერმინისტულია: იგივე ციკლი + id → იგივე; ციკლები შორის იცვლება', () => {
  const list = [{ text: 'a' }, { text: 'b' }, { text: 'c' }];
  assert.equal(pickOpener(list, 1, 'vaso'), pickOpener(list, 1, 'vaso'));
  const seen = new Set([1, 2, 3, 4, 5, 6].map((cy) => pickOpener(list, cy, 'vaso').text));
  assert.ok(seen.size >= 2, [...seen].join());
  assert.equal(pickOpener([], 1, 'x'), null);
  assert.equal(pickOpener(undefined, 1, 'x'), null);
});

// ---------- §9 დიალოგის ფორმა ----------
import { SHAPE_EXAMPLES, SHAPE_EXAMPLES_EN } from '../../src/prompt.js';
import { pacingState, pacingLine, touchPool, touchPoolLine, countSentences, LENGTH_CAP_LINE, phraseCore, WORLD_TOUCHES_KA } from '../../src/pacing.js';

test('§9 ზოგადი მაგალითები: ყოველ პასუხში ზუსტად 2 სასაუბრო ხაზი (რემარკის გარდა); ერთი ორ-სვლიანი მაგალითი; ნეიტრალური', () => {
  assert.ok(SHAPE_EXAMPLES.length >= 4);
  for (const ex of SHAPE_EXAMPLES) {
    for (const t of ex.turns) {
      const speech = t.reply.split('\n').filter((l) => l.trim() && !/^\s*\*[^*]*\*\s*$/.test(l));
      assert.equal(speech.length, 2, t.reply);
      assert.equal(countSentences(t.reply), 2, t.reply);
    }
  }
  assert.ok(SHAPE_EXAMPLES.some((ex) => ex.turns.length === 2), 'ორი ზედიზედ კითხვის მაგალითი');
  // ნეიტრალური: არცერთი პერსონაჟის სახელი/ცნობილი ფრაზა
  const all = SHAPE_EXAMPLES_EN.join('\n');
  for (const c of characters) for (const p of c.catchphrases_ka || []) assert.ok(!all.includes(phraseCore(p)) || phraseCore(p).length < 6, `${c.id}: ${p}`);
  for (const n of ['ვაჟა', 'ბელა', 'თინა', 'ვასო', 'სოსო']) assert.ok(!all.includes(n), n);
});

test('§9 წესები სპეცის ტექსტით; სიგრძე 2–3, არასდროს 1; max_output_tokens 180', async () => {
  const shape = GENERAL_RULES_EN.find((r) => r.startsWith('REPLY SHAPE'));
  for (const needle of [
    'Reply in two beats: (1) one sentence answering only what was asked',
    'Never pre-empt the user\'s next questions.',
    'One excuse or one piece of information per reply. The repertoire is revealed slowly over a long conversation, never listed.',
    'Stay consistent within a reply: do not refuse and then agree, or promise and then withdraw, in the same breath.',
    'Length: 2 sentences by default (one per beat), 3 at most. Never a dry one-word refusal, never a monologue.',
    'Model every reply on the dialogues of the film and the book you were given',
  ]) assert.ok(shape.includes(needle), needle);
  assert.ok(GENERAL_RULES_EN.length <= 25);
  assert.ok(LENGTH_CAP_LINE.includes('never just 1'));
  const ex = JSON.parse((await import('node:fs')).readFileSync(new URL('../../settings.example.json', import.meta.url), 'utf8'));
  assert.equal(ex.gemini.max_output_tokens, 180);
  assert.equal(ex.chat.trim_long_replies, true);
});

test('§9 touch_pool: გამოუყენებელი ფრაზები, რეალური საქმიანობა, 3 ფონური თემა; მდგომარეობის ხაზში — გამოყენებული საბაბებიც', () => {
  const tina = characters.find((c) => c.id === 'tina');
  const used = tina.catchphrases_ka[0];
  const excuse = tina.excuse_repertoire_ka[0];
  const history = [
    { role: 'user', content: 'დირექტორი სადაა?' }, { role: 'assistant', content: `${used}\n${excuse}` },
    { role: 'user', content: 'ხვალ?' },
  ];
  const p = pacingState(history, tina);
  assert.deepEqual(p.usedCatchphrases, [used]);
  assert.deepEqual(p.usedExcuses, [excuse]);
  const pool = touchPool(tina, p);
  assert.ok(!pool.includes(`„${phraseCore(used)}“`), 'გამოყენებული ფრაზა აღარ არის');
  assert.ok(pool.includes(`„${phraseCore(tina.catchphrases_ka[1])}“`));
  assert.ok(pool.some((x) => x.startsWith('what you are busy with:') && x.includes('ტელეფონი')));
  assert.equal(pool.filter((x) => WORLD_TOUCHES_KA.includes(x)).length, 3);
  assert.ok(touchPoolLine(tina, p).startsWith('TOUCH POOL for beat 2'));
  assert.ok(pacingLine(p).includes(`Excuses already used in this chat: [„${phraseCore(excuse)}“]`));
  // თემები ბრუნავს
  assert.notDeepEqual(touchPool(tina, { ...p, messageCount: 1 }).slice(-3), touchPool(tina, { ...p, messageCount: 2 }).slice(-3));
  const s = buildPrompt({ speaker: tina, gameState: { day: 0 }, cfg: { game: {} }, pacing: p }).systemInstruction;
  assert.ok(s.includes('TOUCH POOL for beat 2') && s.includes('Excuses already used in this chat'));
});

test('§9 countSentences: რემარკა არ ითვლება; ხაზები და . ! ? ყოფს; „…“ — არა', () => {
  assert.equal(countSentences('*(ყურმილს იღებს) დიახ, დიახ.*\nდღეს ბანკშია.\nხვალ ნახეთ?'), 2);
  assert.equal(countSentences('ერთი. ორი! სამი? ოთხი.'), 4);
  assert.equal(countSentences('ვკითხულობ, ვკითხულობ… ჯერ არა.'), 1);
  assert.equal(countSentences(''), 0);
});

// ---------- §3 ----------

test('§3 დარჩენილი კითხვები: საშუალოთი (≥ 3 მოთხოვნა) ან 6000-ით; ≥ 10 → ათეულებად; < 10 → ზუსტად; 0 → ამოწურულია', () => {
  assert.equal(AVG_INPUT_FALLBACK, 6000);
  assert.deepEqual(questionsLeft(480_000, null), { n: 80, approx: true }); // 480000 / 6000 = 80
  assert.deepEqual(questionsLeft(500_000, null), { n: 80, approx: true }); // 83.3 → 80
  assert.deepEqual(questionsLeft(500_000, 5000), { n: 100, approx: true });
  assert.deepEqual(questionsLeft(57_000, 6000), { n: 9, approx: false }); // 9.5 → 9 (ზუსტად)
  assert.deepEqual(questionsLeft(59_000, 6000), { n: 9, approx: false });
  assert.deepEqual(questionsLeft(60_000, 6000), { n: 10, approx: true });
  assert.deepEqual(questionsLeft(100, 6000), { n: 1, approx: false }, 'ტოკენები ჯერ არის — ერთი კითხვა მაინც');
  assert.deepEqual(questionsLeft(0, 6000), { n: 0, approx: false });
  assert.deepEqual(questionsLeft(500_000, 0), questionsLeft(500_000, null), '0/უარყოფითი საშუალო → fallback');
  assert.equal(questionsLeftText({ n: 80, approx: true }), 'დარჩა დაახლოებით 80 კითხვა');
  assert.equal(questionsLeftText({ n: 7, approx: false }), 'დარჩა 7 კითხვა');
  assert.equal(questionsLeftText({ n: 0, approx: false }), 'კითხვები აღარ დარჩა');
});

test('§3 tooltip და ფანჯარა — „კითხვების“ ენით, სიტყვა „ტოკენ“ არსად', () => {
  const NB = ' ';
  const tip = tokensTipLine(3.9, 'monthly', '2026-11-01T00:00:00.000Z', { n: 80, approx: true });
  assert.equal(tip, `კითხვების ლიმიტის 3,9${NB}% გახარჯულია · დარჩა დაახლოებით 80 კითხვა · განახლდება 1 ნოემბერს`);
  const life = tokensTipLine(3.9, 'lifetime', null, { n: 7, approx: false });
  assert.equal(life, `კითხვების ლიმიტის 3,9${NB}% გახარჯულია · დარჩა 7 კითხვა · ერთჯერადი ლიმიტი`);
  for (const s of [tip, life, limitBody('client_limit', '2026-11-01T00:00:00.000Z'), limitBody('client_limit', null), limitBody('global_budget', '2026-11-01T00:00:00.000Z')]) {
    assert.ok(!/ტოკენ/.test(s), s);
  }
  assert.ok(limitBody('client_limit', '2026-11-01T00:00:00.000Z').startsWith(CLIENT_SENTENCE));
  assert.ok(limitBody('client_limit', '2026-11-01T00:00:00.000Z').includes('თვის ბოლომდე დავიცადოთ.'));
});

// ---------- §2 ----------

test('§2 seasons_per_lost_copy: 1 → ყოველ სეზონზე ერთი; 2 → ყოველ მეორეზე; ზედა ზღვარი copies', () => {
  const G1 = withDefaults({});
  const G2 = withDefaults({ seasons_per_lost_copy: 2 });
  assert.equal(G1.seasons_per_lost_copy, 1);
  assert.equal(G2.seasons_per_lost_copy, 2);
  // სეზონის ინდექსი 0..3 (დღე 0, 90, 180, 270)
  assert.deepEqual([0, 90, 180, 270].map((d) => derive(d, G1).lostCopies), [0, 1, 2, 3]);
  assert.deepEqual([0, 90, 180, 270].map((d) => derive(d, G2).lostCopies), [0, 0, 1, 1]);
  // სეზონის შუაში არასდროს
  assert.equal(derive(89, G1).lostCopies, 0);
  assert.equal(derive(179, G1).lostCopies, 1);
  // copies-ზე მეტი არასდროს (ხუთი სეზონი, ორი ეგზემპლარი)
  const G5 = withDefaults({ seasons: ['a', 'b', 'c', 'd', 'e'], copies: 2 });
  assert.equal(derive(400, G5).lostCopies, 2);
  // ერთი სეზონის ცვლილებაზე — მაქსიმუმ ერთი
  for (const G of [G1, G2]) {
    for (let d = 0; d < 360; d += 45) {
      const r = advanceDays(d, 45, G);
      if (r.collapse) continue;
      assert.ok(derive(r.day, G).lostCopies - derive(d, G).lostCopies <= 1, `${d}`);
    }
  }
});

test('§2 seasons_per_lost_copy-ის ვალიდაცია: 0, უარყოფითი, ტექსტი → 1; 2.7 → 2', () => {
  for (const v of [0, -3, 'x', null]) assert.equal(withDefaults({ seasons_per_lost_copy: v }).seasons_per_lost_copy, 1, String(v));
  assert.equal(withDefaults({ seasons_per_lost_copy: 2.7 }).seasons_per_lost_copy, 2);
});

test('§2 ფილმის საბაბები — სამი სრული წინადადება, სპეცის ტექსტით', () => {
  assert.deepEqual(LOST_COPY_NOTES, [
    'ერთი ეგზემპლარი თინას უჯრაში დარჩა — სამი თვეა იქ დევს.',
    'ერთი ეგზემპლარი ბანკში (ან ცირკში) დარჩა.',
    'ერთი ეგზემპლარი ოთხად გაიყო — თითო ნაწილი თითო კოლეგასთან.',
  ]);
});
