// FIXES_ROUND1: კალენდარი (§4), თამაშის მდგომარეობა და რა ინახება (§1, §4), სცენური რემარკები (§2), წარმომადგენლის პრომპტი (§3).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  derive, advanceDays, totalDays, dateFor, formatDateKa, formatDateEn, clampDay, dayFromSeason, withDefaults,
} from '../../public/js/calendar.js';
import { applyCharacterOpen, applyExchange, nextCycle, initialState, withDerived, saveState, loadState } from '../../public/js/game.js';
import { parseStage } from '../../public/js/stage.js';
import { mixColor } from '../../public/js/tree.js';
import { characters, byId, world } from '../../src/characters.js';
import { buildPrompt, proxyBlock, sanitizeGameState, GENERAL_RULES_EN, ABSENCE_FACTS_KA } from '../../src/prompt.js';
import { composeMockReply } from '../../src/mock.js';
import * as proxyModule from '../../src/prompt.js';

const G = withDefaults({});
const CFG = { game: G };

// ---------- §4 კალენდარი ----------

test('დეფოლტები (Round 2 §5): 1983-09-01, 90 დღე სეზონი, 0 დღე გადასვლაზე, 20 დღე გაცვლაზე, 360 დღე ციკლი', () => {
  assert.equal(G.start_date, '1983-09-01');
  assert.equal(G.days_per_season, 90);
  assert.equal(G.days_per_character_switch, 0);
  assert.equal(G.days_per_exchange, 20);
  assert.equal(totalDays(G), 360);
});

test('დღე → სეზონი/ბზარი/ეგზემპლარები საზღვრებზე', () => {
  const cases = [
    [0, 'autumn', 0, 0, 0, 90], [89, 'autumn', 0, 0, 89, 1],
    [90, 'winter', 1, 1, 0, 90], [179, 'winter', 1, 1, 89, 1],
    [180, 'spring', 2, 2, 0, 90], [269, 'spring', 2, 2, 89, 1],
    [270, 'summer', 3, 3, 0, 90], [359, 'summer', 3, 3, 89, 1],
  ];
  for (const [day, season, crack, lost, dis, left] of cases) {
    const d = derive(day, G);
    assert.deepEqual([d.season, d.crackStage, d.lostCopies, d.dayInSeason, d.daysLeft], [season, crack, lost, dis, left], `day ${day}`);
  }
  assert.equal(derive(45, G).progress, 0.5);
  assert.equal(clampDay(999, G), 359);
  assert.equal(clampDay(-5, G), 0);
  assert.equal(clampDay('x', G), 0);
  assert.equal(dayFromSeason('spring', G), 180);
});

test('advanceDays: ერთი საზღვარი, რამდენიმე საზღვარი ერთ ნახტომში, ჩამონგრევა', () => {
  assert.deepEqual(advanceDays(70, 20, G), { day: 90, seasons: ['winter'], collapse: false });
  assert.deepEqual(advanceDays(60, 20, G), { day: 80, seasons: [], collapse: false });
  assert.deepEqual(advanceDays(80, 200, G), { day: 280, seasons: ['winter', 'spring', 'summer'], collapse: false });
  assert.deepEqual(advanceDays(350, 20, G), { day: 360, seasons: [], collapse: true });
  assert.deepEqual(advanceDays(10, 0, G), { day: 10, seasons: [], collapse: false });
  // 45 დღე/გადასვლა (e2e კონფიგი): 2 გადასვლა → ზამთარი, 8 → ჩამონგრევა
  const G45 = withDefaults({ days_per_character_switch: 45 });
  let d = 0; const seen = [];
  for (let i = 1; i <= 8; i++) {
    const r = advanceDays(d, 45, G45);
    seen.push(...r.seasons);
    d = r.day;
    if (i === 2) assert.equal(derive(d, G45).season, 'winter');
    if (i < 8) assert.equal(r.collapse, false);
    else assert.equal(r.collapse, true);
  }
  assert.deepEqual(seen, ['winter', 'spring', 'summer']);
});

test('თარიღი: start_date + day, ქართული და ინგლისური ფორმატი', () => {
  assert.equal(formatDateKa(dateFor(G, 0)), '1 სექტემბერი');
  assert.equal(formatDateKa(dateFor(G, 44)), '15 ოქტომბერი');
  assert.equal(formatDateEn(dateFor(G, 44)), '15 October 1983');
  assert.equal(formatDateKa(dateFor(G, 122)), '1 იანვარი');
  assert.equal(formatDateEn(dateFor(G, 122)), '1 January 1984');
  assert.equal(formatDateKa(dateFor(G, 359)), '25 აგვისტო');
});

// ---------- §4 + §1 თამაშის მდგომარეობა ----------

test('Round 2: პერსონაჟის გახსნა დროს აღარ ამატებს (switch 0), მაგრამ visited/lastCharacterId ითვლება', () => {
  let r = applyCharacterOpen(withDerived(initialState(1), G), G, 'director');
  r = applyCharacterOpen(r.state, G, 'vaso');
  assert.equal(r.state.day, 0);
  assert.deepEqual(r.events, []);
  assert.equal(r.state.lastCharacterId, 'vaso');
  assert.deepEqual(r.state.visited, ['director', 'vaso']);
});

test('Round 2: ყოველი გაცვლა = +20 დღე; 1 → 21 სექტემბერი, 5 → ზამთარი, 18 → ჩამონგრევა', () => {
  let s = withDerived(initialState(1), G);
  const seen = [];
  let collapseAt = null;
  for (let i = 1; i <= 18; i++) {
    const r = applyExchange(s, G, 'tina');
    s = r.state;
    for (const e of r.events) { if (e.type === 'season') seen.push([i, e.season]); else collapseAt = i; }
    if (i === 1) assert.equal(formatDateKa(dateFor(G, s.day)), '21 სექტემბერი');
    if (i === 4) assert.equal(s.season, 'autumn');
    if (i === 5) { assert.equal(s.season, 'winter'); assert.equal(s.crackStage, 1); assert.equal(s.lostCopies, 1); }
  }
  assert.deepEqual(seen, [[5, 'winter'], [9, 'spring'], [14, 'summer']]);
  assert.equal(collapseAt, 18);
  assert.equal(s.exchanges, 18);
});

test('ძველი რეჟიმი კონფიგით: days_per_character_switch 20 → სხვა პერსონაჟის გახსნა = +20 დღე; იგივე — არა', () => {
  const GS = withDefaults({ days_per_character_switch: 20, days_per_exchange: 0 });
  let s = withDerived(initialState(1), GS);
  let r = applyCharacterOpen(s, GS, 'director');
  assert.equal(r.state.day, 20);
  assert.equal(r.state.lastCharacterId, 'director');
  r = applyCharacterOpen(r.state, GS, 'director');
  assert.equal(r.state.day, 20);
  assert.deepEqual(r.events, []);
  r = applyCharacterOpen(r.state, GS, 'vaso');
  assert.equal(r.state.day, 40);
  assert.deepEqual(r.state.visited, ['director', 'vaso']);
  // 5 გადასვლა → ზამთარი
  s = r.state;
  let events = [];
  for (const id of ['tina', 'otari', 'bela']) { const x = applyCharacterOpen(s, GS, id); s = x.state; events = events.concat(x.events); }
  assert.equal(s.day, 100);
  assert.equal(s.season, 'winter');
  assert.equal(s.crackStage, 1);
  assert.equal(s.lostCopies, 1);
  assert.deepEqual(events, [{ type: 'season', season: 'winter' }]);
});

test('ჩამონგრევა დღე 360-ზე → nextCycle: ციკლი+1, დღე 0', () => {
  const s = withDerived({ ...initialState(1), day: 350, lastCharacterId: 'a' }, G);
  const r = applyExchange(s, G, 'a');
  assert.deepEqual(r.events, [{ type: 'collapse' }]);
  const n = nextCycle(r.state, G);
  assert.equal(n.cycle, 2);
  assert.equal(n.day, 0);
  assert.equal(n.season, 'autumn');
  assert.equal(n.lastCharacterId, null);
});

test('days_per_exchange: 0 → შეტყობინება დროს არ ამატებს (exchanges მაინც ითვლება); >0 → ამატებს', () => {
  const G0 = withDefaults({ days_per_exchange: 0 });
  const s = withDerived(initialState(1), G0);
  let r = applyExchange(s, G0, 'tina');
  assert.equal(r.state.day, 0);
  assert.equal(r.state.exchanges, 1);
  const G2 = withDefaults({ days_per_exchange: 2 });
  r = applyExchange(withDerived({ ...initialState(1), day: 89 }, G2), G2, 'tina');
  assert.equal(r.state.day, 91);
  assert.deepEqual(r.events, [{ type: 'season', season: 'winter' }]);
});

test('localStorage-ში ჩარჩოს/სურათის მდგომარეობა არ ინახება; ძველი ფორმატი მიგრირდება', () => {
  saveState({ ...withDerived({ ...initialState(2), day: 130, lastCharacterId: 'tina', visited: ['tina'] }, G), paintingFallen: true, portrait: 'x', lifted: true });
  const loaded = loadState(G);
  assert.equal(loaded.cycle, 2);
  assert.equal(loaded.day, 130);
  assert.equal(loaded.season, 'winter');
  assert.equal(loaded.paintingFallen, false, 'სურათი გადატვირთვაზე ისევ ეკიდება');
  assert.equal(loaded.lastCharacterId, 'tina');
});

// ---------- §2 სცენური რემარკები ----------

const stages = (t) => parseStage(t).filter((s) => s.type === 'stage').map((s) => s.text);
const speech = (t) => parseStage(t).filter((s) => s.type === 'speech').map((s) => s.text).join('|');

test('*…* → რემარკა, ტელეფონის საუბარი შიგნით; ვარსკვლავები და ფრჩხილები არ ჩანს', () => {
  const t = 'ძალიან კარგი! *(ყურმილს იღებს) დიახ, დიახ, გისმენთ… კი ბატონო, გავატარებ.* ხო, სოსო, რას ამბობდი?';
  const segs = parseStage(t);
  assert.deepEqual(segs.map((s) => s.type), ['speech', 'stage', 'speech']);
  assert.equal(segs[1].text, 'ყურმილს იღებს: დიახ, დიახ, გისმენთ… კი ბატონო, გავატარებ.');
  assert.equal(segs[1].block, true);
  for (const s of segs) assert.ok(!/[*()]/.test(s.text), s.text);
});

test('რეალური მოდელის პასუხი: ბრჭყალით დამთავრებული მოქმედება — „!“:“ არ ჩნდება', () => {
  const t = '*(ყურმილში მოკლედ ჩასძახებს: „არა, კაცო, არავინ არ არის!“) და მერე თქვენ მოგიბრუნდებათ.* როდის და ხვალ შემოიარეთ.';
  assert.deepEqual(stages(t), ['ყურმილში მოკლედ ჩასძახებს: „არა, კაცო, არავინ არ არის!“ და მერე თქვენ მოგიბრუნდებათ.']);
  assert.equal(speech(t), 'როდის და ხვალ შემოიარეთ.');
});

test('(…) პასუხის/წინადადების დასაწყისში → რემარკა; წინადადების შუაში → საუბარი', () => {
  assert.deepEqual(stages('(შაბიამნის ტომრებს გვერდით გადადებს) წავიკითხე, ჩემო ძმაო.'), ['შაბიამნის ტომრებს გვერდით გადადებს']);
  assert.deepEqual(stages('… (დუმს, გიყურებთ) … ბელასთან რა გინდა?'), ['დუმს, გიყურებთ']);
  assert.deepEqual(stages('ძალიან კარგი! (ყურმილში) დიახ, დიახ.'), ['ყურმილში']);
  assert.deepEqual(stages('ეს კაცი (ოთარ დავიდოვიჩი) ბანკშია.'), []);
  assert.equal(speech('ეს კაცი (ოთარ დავიდოვიჩი) ბანკშია.'), 'ეს კაცი (ოთარ დავიდოვიჩი) ბანკშია.');
  assert.deepEqual(stages('ტუ-ტუ-ტუ… (დაკავებულია.) … ხრაშუნი'), ['დაკავებულია.']);
});

test('სტრიმინგი: გაუხსნელი * ან ( ბოლოში → რემარკა ბოლომდე, ვარსკვლავი არ ჩანს', () => {
  const partial = ['ძალიან კარგი! *', 'ძალიან კარგი! *(ყურმი', 'ძალიან კარგი! *(ყურმილს იღებს) დიახ, დი', 'ბატონო. (კარ'];
  for (const p of partial) {
    const segs = parseStage(p);
    for (const s of segs) assert.ok(!s.text.includes('*') && !s.text.includes('('), `${p} → ${JSON.stringify(segs)}`);
  }
  assert.deepEqual(stages('ძალიან კარგი! *(ყურმი'), ['ყურმი']);
  assert.deepEqual(stages('ბატონო. (კარ'), ['კარ']);
  assert.deepEqual(parseStage('*').length, 0);
  assert.deepEqual(stages('ბოლოს *ტელეფონი რეკავს'), ['ტელეფონი რეკავს'], 'გაუხსნელი * ბოლოში');
});

test('არსებული sample_dialogues: ფრჩხილები სწორად იპარსება, ვარსკვლავი/ფრჩხილი არ რჩება რემარკებში', () => {
  for (const c of characters) {
    for (const d of c.sample_dialogues || []) {
      for (const s of parseStage(d.assistant)) {
        if (s.type === 'stage') assert.ok(!/[*()]/.test(s.text), `${c.id}: ${s.text}`);
        assert.ok(!s.text.includes('*'), `${c.id}`);
      }
    }
  }
  // მაგ.: გივის და ყუფარაძის ნიმუშები მთლიანად რემარკებია
  assert.ok(stages(byId.givi.sample_dialogues[0].assistant).length >= 1);
});

test('mock პასუხები შეიცავს რემარკას (ხილული პერსონაჟი) და წარმომადგენლის სცენას (უხილავი)', () => {
  const gs = { season: 'autumn', crackStage: 0, lostCopies: 0, cycle: 1, day: 0 };
  for (const id of ['director', 'vaso', 'tina', 'otari', 'kako', 'lali']) {
    const r = composeMockReply({ speaker: byId[id], invisible: null, userText: 'გამარჯობა', historyLen: 0, gameState: gs });
    assert.ok(stages(r).length >= 1, `${id}: ${r}`);
  }
  const p = composeMockReply({ speaker: byId.soso, invisible: byId.gamkrelidze, userText: 'წაიკითხეთ ჩემი მოთხრობა?', historyLen: 0, gameState: gs });
  assert.ok(p.startsWith('*(დერეფანში გამოდის'));
  assert.ok(p.includes('გამყრელიძე'));
  // წარმომადგენელი თავის საკუთარ ხელნაწერზე რეაქციას არ ამატებს (სოსოს „წავიკითხავ… თქვენ ჩემი ხომ არ…“)
  for (const d of byId.soso.sample_dialogues) assert.ok(!p.includes(d.assistant), p);
  assert.doesNotMatch(p, /წავიკითხავ|წაგიკითხავთ/);
  assert.ok(p.endsWith('ხელნაწერი თინასთან დატოვეთ.'), 'სოსოს redirects_to ცარიელია → თინა');
});

// ---------- §3 წარმომადგენლის პრომპტი ----------

test('ზოგადი წესები: სცენური რემარკების წესი და მაგალითები', () => {
  const all = GENERAL_RULES_EN.join('\n');
  assert.ok(all.includes('STAGE DIRECTIONS'));
  assert.ok(all.includes('wrapped in asterisks'));
  assert.ok(all.includes('30–50%'));
  const { systemInstruction: s } = buildPrompt({ speaker: byId.director, gameState: { season: 'autumn', crackStage: 0, lostCopies: 0, cycle: 1, day: 44 }, cfg: CFG });
  assert.ok(s.includes('Stage-direction examples'));
  assert.ok(s.includes('*(ყურმილს იღებს)'));
  assert.ok(s.includes('In-world date: 15 October 1983, autumn, day 45 of the season.'));
});

for (const inv of characters.filter((c) => !c.reachable)) {
  test(`წარმომადგენლის ბლოკი — ${inv.id}: „on ${inv.short_name_ka}'s behalf“, მესამე პირი, ფაქტები, sample_dialogues-ის გარეშე`, () => {
    const proxy = byId[inv.proxies?.[0] || 'tina'] || byId.tina;
    const { systemInstruction: s, fewShot } = buildPrompt({ speaker: proxy, invisible: inv, gameState: { season: 'autumn', crackStage: 0, lostCopies: 0, cycle: 1, day: 0 }, cfg: CFG });
    assert.ok(s.includes(`on ${inv.short_name_ka}'s behalf`));
    assert.ok(s.includes('third person'));
    assert.ok(s.includes(`is addressing ${inv.short_name_ka}, not you`));
    assert.ok(s.includes(`You, ${proxy.short_name_ka}, happen to be nearby`));
    assert.ok(s.includes('never speak as'));
    assert.ok(s.includes('*(დერეფანში გამოდის, კარს უყურებს)*'));
    assert.ok(s.includes(ABSENCE_FACTS_KA[inv.id]), 'ცნობილი ფაქტი');
    assert.ok(s.includes(world.game_mechanics_en.mentioned_only_characters), 'game_mechanics_en.mentioned_only_characters');
    for (const d of inv.sample_dialogues || []) {
      assert.ok(!s.includes(d.assistant), 'უხილავის sample_dialogues არ შედის');
      assert.ok(!fewShot.some((m) => m.content === d.assistant || m.content === d.user), 'few-shot — მხოლოდ წარმომადგენლის');
    }
    // „YOUR CHARACTER“ — წარმომადგენელია, არა უხილავი
    assert.ok(s.includes(`# YOUR CHARACTER: ${proxy.name_ka}`));
    assert.ok(!s.includes(`# YOUR CHARACTER: ${inv.name_ka}`));
  });
}

test('roll call ფაქტები წარმომადგენლის ბლოკში (შოთა, ხაბურძანია, წვერავა)', () => {
  assert.ok(proxyBlock(byId.shota, byId.soso).includes('შოთა მივლინებაშია'));
  assert.ok(proxyBlock(byId.khaburdzania, byId.soso).includes('ხაბურძანია არ დადის'));
  assert.ok(proxyBlock(byId.tsverava, byId.irodioni).includes('წვერავა ჯარშია'));
  assert.ok(proxyBlock(byId.gamkrelidze, byId.soso).includes('დასკვნა'));
});

test('რემარკის რეჟიმი: წარმომადგენლის პირველი პასუხი — სცენა; დანარჩენი ~55% „არა“', () => {
  const { pickStageMode, STAGE_MODE_LINES } = proxyModule;
  assert.equal(pickStageMode({ invisible: byId.givi, historyLen: 0 }), 'scene');
  let seq = 0;
  const rnd = () => { seq = (seq * 9301 + 49297) % 233280; return seq / 233280; };
  const modes = Array.from({ length: 2000 }, () => pickStageMode({ invisible: null, historyLen: 3, rnd }));
  const none = modes.filter((m) => m === 'none').length / modes.length;
  assert.ok(none > 0.5 && none < 0.6, String(none));
  assert.ok(modes.every((m) => m === 'none' || m === 'optional'));
  for (const mode of ['scene', 'none', 'optional']) {
    const s = buildPrompt({ speaker: byId.director, gameState: { day: 0 }, cfg: CFG, stageMode: mode }).systemInstruction;
    assert.ok(s.trimEnd().endsWith(STAGE_MODE_LINES[mode]), mode);
  }
  assert.ok(!buildPrompt({ speaker: byId.director, gameState: { day: 0 }, cfg: CFG }).systemInstruction.includes('FOR THIS REPLY'));
});

test('sanitizeGameState: დღე სიმართლის წყაროა; დღის გარეშე — ძველი ველები', () => {
  const c = { game: G };
  assert.deepEqual(sanitizeGameState({ day: 100, season: 'summer', crackStage: 4 }, c),
    { day: 100, season: 'winter', crackStage: 1, lostCopies: 1, cycle: 1, paintingFallen: false });
  assert.deepEqual(sanitizeGameState({ day: 9999 }, c).day, 359);
  assert.deepEqual(sanitizeGameState({ season: 'spring', crackStage: 2, lostCopies: 2 }, c),
    { day: 180, season: 'spring', crackStage: 2, lostCopies: 2, cycle: 1, paintingFallen: false });
});

test('ხე: ფერის ინტერპოლაცია', () => {
  assert.equal(mixColor('#000000', '#ffffff', 0), '#000000');
  assert.equal(mixColor('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mixColor('#000000', '#ffffff', 0.5), '#808080');
});
