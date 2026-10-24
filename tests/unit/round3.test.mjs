// Round 3 (FIXES_ROUND3.md): ზომის კლასები და ვიწრო ეკრანის განლაგება (§6), დესკტოპის განლაგება უცვლელია.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeLayout, findOverlaps, rectsOverlap, sizeClass, NARROW_PROFILES, MIN_ROT, MAX_ROT } from '../../public/js/layout.js';
import { usedPercent, formatPercentKa, percentLevel, tokensTipLine } from '../../public/js/format.js';

// ---------- §1 ----------
import { buildPrompt, userBlock, cleanUserName, isSoso, GENERAL_RULES_EN, SHAPE_EXAMPLES_EN } from '../../src/prompt.js';
import { byId } from '../../src/characters.js';
import { composeMockReply } from '../../src/mock.js';

const CFG = { game: { seasons: ['autumn', 'winter', 'spring', 'summer'], crack_stages: 5, copies: 3 } };
const GS0 = { season: 'autumn', crackStage: 0, lostCopies: 0, cycle: 1 };

test('§1 პრომპტი: სახელი და წესი სიტყვასიტყვით; სოსოდ აღარ ითვლება', () => {
  const s = buildPrompt({ speaker: byId.director, gameState: GS0, cfg: CFG, userName: 'ნინო' }).systemInstruction;
  assert.ok(s.includes('# THE USER'));
  assert.ok(s.includes('The user\'s name is „ნინო“. Address them by this name (with ბატონო/ქალბატონო where the character\'s address_forms says so). Do not call them Soso unless their name is Soso. If no name is given, address them as „ავტორო“ / „ჩემო კარგო“ / „ახალგაზრდავ“ according to the character, and never invent a name.'));
  assert.ok(s.includes('the user\'s novella'));
  assert.ok(s.includes('სოსოც დადიოდა ასე სამი წელი'));
  assert.ok(!s.includes('The user IS Soso'));
  // მსოფლიოს ინსტრუქცია: მოთამაშე — ახალი ავტორი საკუთარი ხელნაწერით
  assert.ok(GENERAL_RULES_EN[0].includes('new author bringing their own manuscript'));
  assert.ok(!GENERAL_RULES_EN[0].includes('Soso or themselves'));
  // მაგალითებში მომხმარებელს „სოსოს“ აღარ ეძახიან
  assert.ok(!SHAPE_EXAMPLES_EN.join('\n').includes('ჩემო სოსო'));
  assert.ok(!GENERAL_RULES_EN.join('\n').includes('ხო, სოსო'));
});

test('§1 სოსო: ძველი ქცევა („ცისფერი მთები ანუ ტიან-შანი“); სახელის გარეშე — „ავტორო“, სახელს არ იგონებს', () => {
  const soso = userBlock('სოსო');
  assert.ok(soso.includes('The user IS Soso'));
  assert.ok(soso.includes('„ცისფერი მთები ანუ ტიან-შანი“'));
  assert.ok(isSoso('Soso') && isSoso(' სოსო ') && !isSoso('სოსო ბატონო') && !isSoso('ნინო'));
  const none = userBlock('');
  for (const w of ['„ავტორო“', '„ჩემო კარგო“', '„ახალგაზრდავ“', 'never invent a name', 'Do not call them Soso']) assert.ok(none.includes(w), w);
  assert.ok(!none.includes('The user\'s name is'));
  assert.ok(buildPrompt({ speaker: byId.tina, gameState: GS0, cfg: CFG }).systemInstruction.includes('has not told you their name'));
});

test('§1 სახელის გასუფთავება: მართვის სიმბოლოები, ბრჭყალები, < >, 40 სიმბოლო', () => {
  assert.equal(cleanUserName('  ნინო\n\t '), 'ნინო');
  assert.equal(cleanUserName('<b>„ნინო“</b>'), 'bნინო/b');
  assert.equal(cleanUserName('ა'.repeat(60)).length, 40);
  assert.equal(cleanUserName(null), '');
  assert.equal(cleanUserName(42), '42');
});

test('§1 mock სახელით მიმართავს (რემარკის შემდეგ, პირველ სასაუბრო ხაზზე)', () => {
  const r = composeMockReply({ speaker: byId.tina, invisible: null, userText: 'გამარჯობა', historyLen: 0, gameState: GS0, userName: 'ნინო' });
  assert.ok(r.startsWith('*('));
  assert.match(r.split('\n')[1], /^ნინო, /);
  const p = composeMockReply({ speaker: byId.soso, invisible: byId.givi, userText: 'გივი აქ არის?', historyLen: 0, gameState: GS0, userName: 'ნინო' });
  assert.ok(p.includes('ნინო, გივი ოთახში არ არის'));
  assert.ok(!composeMockReply({ speaker: byId.tina, invisible: null, userText: 'გამარჯობა', historyLen: 0, gameState: GS0 }).includes('ნინო'));
});

// ---------- §2 ----------
import { applyChatClose, applyExchange, applyCharacterOpen, initialState, withDerived } from '../../public/js/game.js';
import { withDefaults, dateFor, formatDateKa } from '../../public/js/calendar.js';

test('§2 applyChatClose: შეტყობინების გარეშე დრო არ მიდის; ≥1 გაცვლა → +20; საზღვარი → სეზონი; 350 → ჩამონგრევა', () => {
  const G = withDefaults({});
  const s0 = withDerived(initialState(1), G);
  let r = applyChatClose(s0, G, 'tina', 0);
  assert.equal(r.state.day, 0);
  assert.deepEqual(r.events, []);
  r = applyChatClose(s0, G, 'tina', 3);
  assert.equal(r.state.day, 20, 'ერთხელ +20, გაცვლების რაოდენობისგან დამოუკიდებლად');
  assert.equal(formatDateKa(dateFor(G, r.state.day)), '21 სექტემბერი');
  r = applyChatClose(withDerived({ ...initialState(1), day: 80 }, G), G, 'tina', 1);
  assert.deepEqual([r.state.day, r.state.season, r.events], [100, 'winter', [{ type: 'season', season: 'winter' }]]);
  r = applyChatClose(withDerived({ ...initialState(1), day: 350 }, G), G, 'tina', 1);
  assert.deepEqual(r.events, [{ type: 'collapse' }]);
  // საუბრის შუაში (გაცვლა/გახსნა) დრო დეფოლტით აღარ მიდის
  assert.equal(applyExchange(s0, G, 'tina').state.day, 0);
  assert.equal(applyExchange(s0, G, 'tina').state.exchanges, 1);
  assert.equal(applyCharacterOpen(s0, G, 'vaso').state.day, 0);
  // e2e კონფიგი: 45 დღე → მე-2 დახურვაზე ზამთარი
  const G45 = withDefaults({ days_per_chat_close: 45 });
  const a = applyChatClose(withDerived(initialState(1), G45), G45, 'x', 1);
  const b = applyChatClose(a.state, G45, 'y', 1);
  assert.deepEqual([a.events, b.events], [[], [{ type: 'season', season: 'winter' }]]);
  // ნულოვანი კონფიგი → დახურვაც არ ამატებს
  assert.equal(applyChatClose(s0, withDefaults({ days_per_chat_close: 0 }), 'x', 2).state.day, 0);
});

// ---------- §4 ----------
import { NON_WORDS, findNonWords } from '../../src/georgian.js';
import { allowlistFor, proofreadInstruction, shouldProofread, acceptCorrection, FILM_LEXICON, forbiddenDialectFor } from '../../src/proofread.js';

test('§4 სხვისი კილო: ვასოს „რავა/ბოშო/ქე“ ეკრძალება (პრომპტშიც, კორექტორშიც); თამარს — არა', () => {
  assert.deepEqual(forbiddenDialectFor(byId.tamari), []);
  const v = forbiddenDialectFor(byId.vaso);
  for (const w of ['რავა', 'რაფერ', 'ბოშო', 'ქე', 'გაქვენ', 'ისთევლე']) assert.ok(v.includes(w), w);
  const sv = buildPrompt({ speaker: byId.vaso, gameState: GS0, cfg: CFG }).systemInstruction;
  assert.ok(sv.includes('Dialect forms you must NOT use') && sv.includes('„რავა“'));
  const st = buildPrompt({ speaker: byId.tamari, gameState: GS0, cfg: CFG }).systemInstruction;
  assert.ok(!st.includes('Dialect forms you must NOT use'));
  const ins = proofreadInstruction(allowlistFor(byId.vaso), v);
  assert.ok(ins.includes('do not belong to this speaker') && ins.includes('რავა'));
  assert.ok(!proofreadInstruction(allowlistFor(byId.tamari), []).includes('do not belong'));
});
import { MOCK_STRINGS } from '../../src/mock.js';
import { ABSENCE_FACTS_KA } from '../../src/prompt.js';
import { diffWords } from '../../public/js/diff.js';

test('§4 არარსებული სიტყვები (ვჭედავარ…) არც მონაცემებში, არც mock-ში, არც პრომპტის მაგალითებში არ გვხვდება', () => {
  assert.ok(NON_WORDS.includes('ვჭედავარ'));
  const strings = [];
  const walk = (v) => { if (typeof v === 'string') strings.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(JSON.parse(fs.readFileSync(new URL('../../characters.json', import.meta.url), 'utf8')));
  walk(JSON.parse(fs.readFileSync(new URL('../../src/data/voice_extras.json', import.meta.url), 'utf8')));
  walk(MOCK_STRINGS);
  walk(ABSENCE_FACTS_KA);
  walk(SHAPE_EXAMPLES_EN);
  walk(GENERAL_RULES_EN);
  assert.ok(strings.length > 500, String(strings.length));
  const hits = strings.filter((s) => findNonWords(s).length);
  assert.deepEqual(hits, []);
  assert.deepEqual(findNonWords('მე აქ ვჭედავარ ოცდაშვიდი წელიწადი'), ['ვჭედავარ']);
});

test('§4 დაშვებულთა სია პერსონაჟზეა: თამარს — ბოშო/რავა/ქე, ვასოს — არა; ყველას — რუსიციზმები, ბიუროკრატია, ფილმის ტერმინები', () => {
  const tam = allowlistFor(byId.tamari);
  for (const w of ['ბოშო', 'რავა', 'ქე', 'ისთევლე', 'ნელთბილად']) assert.ok(tam.includes(w), w);
  const vaso = allowlistFor(byId.vaso);
  for (const w of ['რავა', 'ბოშო', 'ქე', 'ნელთბილად']) assert.ok(!vaso.includes(w), `ვასოს არ ეკუთვნის: ${w}`);
  assert.ok(vaso.includes('ოცდაშვიდი') && vaso.includes('კაცო'));
  for (const c of [byId.tamari, byId.vaso, byId.director, byId.tina]) {
    const a = allowlistFor(c);
    for (const w of ['პაპკა', 'კაპრემონტი', 'ზავხოზი', 'რეზოლუცია', 'სესხბანკი', 'მშენბანკი', 'მარკშეიდერი', 'თინა']) assert.ok(a.includes(w), `${c.id}: ${w}`);
  }
  assert.ok(FILM_LEXICON.includes('მოტობურთი'));
  const ins = proofreadInstruction(tam);
  assert.ok(ins.startsWith('Proofread this Georgian text. Fix only spelling, grammar, case endings and non-existent words.'));
  assert.ok(ins.includes('stage directions in asterisks, line breaks and meaning exactly as they are. Return only the corrected text.'));
  assert.ok(ins.includes('ბოშო'));
});

test('§4 როდის ეშვება კორექტურა: არა mock-ში, არა proofread:false-ზე, არა < 3 სიტყვაზე, არა არაქართულზე', () => {
  const on = { gemini: { mock: false, proofread: true } };
  assert.equal(shouldProofread(on, 'მე აქ ვზივარ ოცდაშვიდი წელიწადი!'), true);
  assert.equal(shouldProofread({ gemini: { mock: false } }, 'მე აქ ვზივარ ოცდაშვიდი წელიწადი!'), true, 'დეფოლტი ჩართულია');
  assert.equal(shouldProofread({ gemini: { mock: true, proofread: true } }, 'მე აქ ვზივარ ოცდაშვიდი წელიწადი!'), false);
  assert.equal(shouldProofread({ gemini: { mock: false, proofread: false } }, 'მე აქ ვზივარ ოცდაშვიდი წელიწადი!'), false);
  assert.equal(shouldProofread(on, 'ძალიან კარგი!'), false);
  assert.equal(shouldProofread(on, 'Excuse me, I am terribly busy right now.'), false);
});

test('§4 კორექტორის პასუხის გადამოწმება: ``` და ბრჭყალები იშლება; რემარკები/ხაზები/სიგრძე უნდა ემთხვეოდეს', () => {
  const orig = '*(სურათს ახედავს)*\nმე აქ ვჭედავარ ოცდაშვიდი წელიწადი!\nგაიტანეთ!';
  const fixed = '*(სურათს ახედავს)*\nმე აქ ვზივარ ოცდაშვიდი წელიწადი!\nგაიტანეთ!';
  assert.equal(acceptCorrection(orig, fixed), fixed);
  assert.equal(acceptCorrection(orig, `\`\`\`\n${fixed}\n\`\`\``), fixed);
  assert.equal(acceptCorrection(orig, `„${fixed}“`), fixed);
  assert.equal(acceptCorrection(orig, fixed.replace(/\*/g, '')), null, 'რემარკა დაიკარგა');
  assert.equal(acceptCorrection(orig, fixed.replace(/\n/g, ' ')), null, 'ხაზები გაერთიანდა');
  assert.equal(acceptCorrection(orig, 'კი.'), null, 'ძალიან მოკლე');
  assert.equal(acceptCorrection(orig, `${fixed}\n${fixed}\n${fixed}`), null);
  assert.equal(acceptCorrection(orig, ''), null);
  assert.equal(acceptCorrection(orig, undefined), null);
});

test('§4 ადმინის სიტყვების დიფი: მხოლოდ შეცვლილი სიტყვა მოინიშნება', () => {
  const { left, right } = diffWords('მე აქ ვჭედავარ ოცდაშვიდი წელიწადი!', 'მე აქ ვზივარ ოცდაშვიდი წელიწადი!');
  assert.deepEqual(left.filter((p) => p.changed && p.w.trim()).map((p) => p.w), ['ვჭედავარ']);
  assert.deepEqual(right.filter((p) => p.changed && p.w.trim()).map((p) => p.w), ['ვზივარ']);
  assert.equal(left.map((p) => p.w).join(''), 'მე აქ ვჭედავარ ოცდაშვიდი წელიწადი!');
  assert.equal(right.map((p) => p.w).join(''), 'მე აქ ვზივარ ოცდაშვიდი წელიწადი!');
});

// ---------- §3 ----------

test('§3 პროცენტი: ერთი ათწილადი, ქართული მძიმე, 0–100-ში', () => {
  const NB = ' ';
  assert.equal(formatPercentKa(0), `0,0${NB}%`);
  assert.equal(formatPercentKa(0.27), `0,3${NB}%`);
  assert.equal(formatPercentKa(12.345), `12,3${NB}%`);
  assert.equal(formatPercentKa(99.96), `100,0${NB}%`);
  assert.equal(formatPercentKa(140), `100,0${NB}%`);
  assert.equal(formatPercentKa(-3), `0,0${NB}%`);
  assert.equal(formatPercentKa('x'), `0,0${NB}%`);
  assert.equal(usedPercent(1500, 500000), 0.3);
  assert.equal(usedPercent(600000, 500000), 100, 'ძველი მთვლელი ახალ ლიმიტზე მეტია → 100%');
  assert.equal(usedPercent(10, 0), 0);
  assert.deepEqual([0, 69.9, 70, 90, 90.1, 100].map(percentLevel), ['ok', 'ok', 'warn', 'warn', 'hot', 'hot']);
  // Round 4 §3: ტოკენების ნაცვლად — „კითხვების ლიმიტი“
  assert.equal(tokensTipLine(0.3, 'monthly', '2026-11-01T00:00:00.000Z'), `კითხვების ლიმიტის 0,3${NB}% გახარჯულია · განახლდება 1 ნოემბერს`);
  assert.equal(tokensTipLine(5, 'lifetime', null), `კითხვების ლიმიტის 5,0${NB}% გახარჯულია · ერთჯერადი ლიმიტი`);
});

const PAINTING = { id: 'painting', rank: -1, size: { w: 450, mw: 250, aspect: 539 / 760 }, rot: [2.5, 4] };
const itemsN = (n) => [PAINTING, ...Array.from({ length: n }, (_, i) => ({ id: `c${i}`, rank: i }))];

// ---------- §6 ----------

test('§6 sizeClass: phone < 700 ≤ tablet < 900 ≤ desktop', () => {
  assert.equal(sizeClass(375), 'phone');
  assert.equal(sizeClass(699), 'phone');
  assert.equal(sizeClass(700), 'tablet');
  assert.equal(sizeClass(899), 'tablet');
  assert.equal(sizeClass(900), 'desktop');
  assert.equal(sizeClass(1280), 'desktop');
});

test('§6 დესკტოპის განლაგება ბაიტ-ბაიტ უცვლელია (Round 3-მდე გადაღებული ფიქსტურა, 7 ზომა × 3 seed)', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/desktop-layouts.json', import.meta.url), 'utf8'));
  const zones = (W, H) => [{ name: 'others', x: W - 190, y: H - 70, w: 172, h: 52 }, { name: 'board', x: 18, y: H - 190, w: 232, h: 172 }];
  for (const c of fixture) {
    for (const cls of [undefined, 'desktop']) {
      const L = computeLayout({ width: c.W, height: c.H, items: itemsN(12), seed: c.seed, headerHeight: 99, zones, sizeClass: cls });
      assert.equal(L.height, c.height, `${c.W}×${c.H}/${c.seed}`);
      assert.deepEqual(L.frames.map((f) => ({ id: f.id, tier: f.tier, x: f.x, y: f.y, w: f.w, h: f.h, rotation: f.rotation })), c.frames, `${c.W}×${c.H}/${c.seed}`);
    }
  }
});

const narrowZones = (W, H) => [{ name: 'others', x: W - 140, y: H - 46, w: 132, h: 38 }, { name: 'board', x: 8, y: H - 58, w: 46, h: 50 }];

for (const [W, H, cls, n, maxRatio] of [[375, 812, 'phone', 6, 1.3], [390, 844, 'phone', 6, 1.3], [700, 900, 'tablet', 9, 1.55], [768, 1024, 'tablet', 9, 1.5]]) {
  test(`§6 ${cls} ${W}×${H}: ${n} ჩარჩო + ნახატი, გადაფარვა არ არის, 5–10°, სიმაღლე ≤ ${maxRatio}×`, () => {
    for (const seed of [1984, 1985, 1986, 1987, 1988, 1989, 2024]) {
      const L = computeLayout({ width: W, height: H, items: itemsN(n), seed, headerHeight: 70, zones: narrowZones, sizeClass: cls });
      assert.equal(L.sizeClass, cls);
      assert.equal(L.frames.length, n + 1);
      assert.deepEqual(findOverlaps(L), [], `${seed}`);
      const f = L.frames;
      for (let i = 0; i < f.length; i++) {
        for (let j = i + 1; j < f.length; j++) assert.ok(!rectsOverlap(f[i].box, f[j].box, L.gap - 0.01), `${seed}: ${f[i].id}/${f[j].id} gap`);
        assert.ok(f[i].box.x >= 0 && f[i].box.x + f[i].box.w <= W, `${seed}: ${f[i].id} x`);
      }
      const frames = f.filter((x) => x.id !== 'painting');
      for (const fr of frames) {
        assert.ok(Math.abs(fr.rotation) >= MIN_ROT - 1e-9 && Math.abs(fr.rotation) <= MAX_ROT + 1e-9, `rot ${fr.rotation}`);
        // ჩარჩოს სიგანე — პროფილის წილი (სიგანეში ვერ ჩატევისას ოდნავ მცირდება, არა უმეტეს 15%-ით)
        const want = NARROW_PROFILES[cls].frac[fr.tier] * W;
        assert.ok(fr.w <= want + 1e-9 && fr.w >= want * 0.85, `${fr.id} w ${fr.w} / ${want}`);
      }
      assert.ok(L.height <= H * maxRatio, `${seed}: height ${L.height} > ${maxRatio}× ${H}`);
      assert.ok(L.height >= H);
      // არა ბადე: კუთხეები ორივე მიმართულებით, x-ები სხვადასხვა
      // არა ბადე: რიგის შიგნითაც სიმაღლეები განსხვავდება (არც ერთი ორი ჩარჩო ერთ y-ზე), კუთხეები განსხვავდება
      assert.ok(new Set(frames.map((x) => Math.round(x.y))).size >= n - 2, `${seed}: y`);
      assert.ok(new Set(frames.map((x) => x.rotation.toFixed(1))).size >= n - 1, `${seed}: rot`);
    }
  });
}

test('§6 დეტერმინიზმი ვიწრო ეკრანზეც: იგივე seed → იგივე, სხვა ციკლი → სხვა', () => {
  const a = computeLayout({ width: 375, height: 812, items: itemsN(6), seed: 1984, headerHeight: 70, zones: narrowZones, sizeClass: 'phone' });
  const b = computeLayout({ width: 375, height: 812, items: itemsN(6), seed: 1984, headerHeight: 70, zones: narrowZones, sizeClass: 'phone' });
  const c = computeLayout({ width: 375, height: 812, items: itemsN(6), seed: 1985, headerHeight: 70, zones: narrowZones, sizeClass: 'phone' });
  assert.deepEqual(a.frames, b.frames);
  assert.notDeepEqual(a.frames.map((f) => [f.id, f.x, f.y]), c.frames.map((f) => [f.id, f.x, f.y]));
});
