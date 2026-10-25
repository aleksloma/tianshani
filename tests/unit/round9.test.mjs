// Round 9 (FIXES_ROUND9.md): მოქმედება ველზე მიმაგრებით (§1), ორი ხატულა (§2), მთელი ეგზემპლარის ხაზები (§4.1), ცნობილი დანაკარგი (§4.2).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialCopies, applyHandOver, applyReturn, applyStep, applyNotReturned, verifyClaimsFor, summaryForServer,
  existingCount, lostCount, knownLostCount, attachText, actionMessage, attachmentValid, actionText, MODE_ATTR, ACTION_ICONS,
} from '../../public/js/manuscript.js';
import { withDefaults } from '../../public/js/calendar.js';
import { byId, manuscriptBehaviour as BEH } from '../../src/characters.js';
import { buildPrompt, actionBlock, WHOLE_COPY_LINE, OWN_WORDS_LINE } from '../../src/prompt.js';
import { pacingState } from '../../src/pacing.js';
import { composeMockReply, actionExtraText } from '../../src/mock.js';
import { parseStage } from '../../public/js/stage.js';

const G = withDefaults({});
const CFG = { game: { ...G, manuscript: {} } };
const GS = { day: 100, season: 'winter', crackStage: 1, cycle: 1, paintingFallen: false };
const ALWAYS = () => () => 0;
const held = (who) => applyHandOver(initialCopies(G, 1), 1, who, 0);
const step = (store, m) => applyStep(store, { ...G, manuscript: { probability_scale: 1000, stray_page_probability: 0, ...m } }, BEH, 20, ALWAYS, byId).store;
const withIntegrity = (s, id, integrity) => ({ ...s, copies: s.copies.map((c) => (c.id === id ? { ...c, integrity } : c)) });

// ---------- §1 ----------

test('§1 მიმაგრების ფურცლის ტექსტი: გადაცემა (მთელი / ნახევარი / მეოთხედი / ერთი ფურცელი), გამორთმევა', () => {
  assert.equal(attachText('hand_over', 2), 'ეგზემპლარი №2 — გადაცემა');
  assert.equal(attachText('hand_over', 2, 'full'), 'ეგზემპლარი №2 — გადაცემა');
  assert.equal(attachText('hand_over', 1, 'half'), 'ეგზემპლარის ნახევარი №1 — გადაცემა');
  assert.equal(attachText('hand_over', 3, 'quarter'), 'ეგზემპლარის მეოთხედი №3 — გადაცემა');
  assert.equal(attachText('hand_over', 3, 'page'), 'ეგზემპლარის ერთი ფურცელი №3 — გადაცემა');
  assert.equal(attachText('retrieve', 2, 'half'), 'ეგზემპლარი №2 — გამორთმევა');
});

test('§1 შეტყობინება: რემარკა + (თუ დაწერა) ახალ ხაზზე სიტყვები; რენდერი — .stage და .speech', () => {
  const stage = actionText('hand_over', 'ნინო', 'ვასო');
  assert.equal(actionMessage(stage, ''), '*ნინო ვასოს ხელნაწერის ეგზემპლარს აწვდის.*');
  assert.equal(actionMessage(stage, '   '), stage);
  assert.equal(actionMessage(stage, '  მალე წაიკითხავთ? '), '*ნინო ვასოს ხელნაწერის ეგზემპლარს აწვდის.*\nმალე წაიკითხავთ?');
  assert.equal(actionMessage(actionText('hand_over', 'ნინო', 'ვასო', 'half'), 'აი'), '*ნინო ვასოს ხელნაწერის ეგზემპლარის ნახევარს აწვდის.*\nაი');
  assert.equal(actionMessage(actionText('retrieve', '', 'ოთარი'), 'მომეცით'), '*ავტორი ოთარს ეგზემპლარს უკან სთხოვს.*\nმომეცით');
  assert.deepEqual(parseStage(actionMessage(stage, 'მალე წაიკითხავთ?')).map((s) => [s.type, s.text.trim()]), [
    ['stage', 'ნინო ვასოს ხელნაწერის ეგზემპლარს აწვდის.'], ['speech', 'მალე წაიკითხავთ?'],
  ]);
});

test('§1 მიმაგრების გადამოწმება გაგზავნისას: მართებული / ეგზემპლარი აღარ არის ხელში / რეჟიმი შეიცვალა / proxy', () => {
  const s0 = initialCopies(G, 1);
  const give = { type: 'hand_over', copyId: 1, integrity: 'full' };
  assert.equal(attachmentValid(s0, give, 'vaso', true), true);
  assert.equal(attachmentValid(applyHandOver(s0, 1, 'kote', 0), give, 'vaso', true), false, '№1 უკვე სხვასთანაა');
  assert.equal(attachmentValid(applyHandOver(s0, 2, 'vaso', 0), give, 'vaso', true), false, 'ვასოს უკვე აქვს — რეჟიმი გამორთმევაა');
  assert.equal(attachmentValid(s0, give, 'givi', false), false, 'უხილავი');
  const s1 = applyHandOver(s0, 1, 'vaso', 0);
  const take = { type: 'retrieve', copyId: 1, integrity: 'full' };
  assert.equal(attachmentValid(s1, take, 'vaso', true), true);
  assert.equal(attachmentValid(applyReturn(s1, 1), take, 'vaso', true), false, 'უკვე დაბრუნდა');
  assert.equal(attachmentValid(s1, null, 'vaso', true), false);
});

test('§1 # ACTION ბლოკი ყველა შედეგზე ამატებს „ავტორის სიტყვების“ წინადადებას', () => {
  assert.equal(OWN_WORDS_LINE, "The author's own words, if any, follow the stage direction in his last message — answer them too, inside the same two beats.");
  for (const outcome of ['accepted', 'refused', 'returned', 'not_returned']) {
    const b = actionBlock({ type: 'hand_over', copyId: 1, outcome, integrity: 'half', reason_ka: 'x' }, byId.vaso);
    assert.ok(b.endsWith(OWN_WORDS_LINE), outcome);
  }
});

test('§1 mock: მოქმედება + სიტყვები → თესლი და მერე ჩვეულებრივი პასუხის ხაზი; სიტყვების გარეშე — როგორც Round 8', () => {
  const stage = actionText('hand_over', 'ნინო', 'ვასო');
  assert.equal(actionExtraText(stage), '');
  assert.equal(actionExtraText(`${stage}\nმალე წაიკითხავთ?`), 'მალე წაიკითხავთ?');
  const m = summaryForServer(initialCopies(G, 1));
  const base = { speaker: byId.vaso, invisible: null, historyLen: 0, gameState: GS, manuscript: m, actionResult: { outcome: 'accepted' } };
  const plain = composeMockReply({ ...base, userText: stage });
  const withWords = composeMockReply({ ...base, userText: `${stage}\nროგორ ხარ?` });
  const normal = composeMockReply({ speaker: byId.vaso, invisible: null, historyLen: 0, gameState: GS, userText: 'როგორ ხარ?' }).split('\n')[1];
  assert.ok(plain.includes('კარგი, დამიტოვე, ამაღამვე დავიწყებ.'));
  assert.ok(withWords.includes('კარგი, დამიტოვე, ამაღამვე დავიწყებ.'));
  assert.ok(withWords.includes(normal), `${withWords}\n— ${normal}`);
  assert.ok(withWords.indexOf('ამაღამვე') < withWords.indexOf(normal), 'თესლი პირველია');
  assert.ok(!plain.includes(normal));
});

// ---------- §2 ----------

test('§2 ხატულები: data-mode give/take; ერთი ფურცელი, ისარი გადის / შემოდის; ხაზოვანი, 22×22', () => {
  assert.deepEqual(MODE_ATTR, { hand_over: 'give', retrieve: 'take' });
  const paths = (svg) => [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  const give = paths(ACTION_ICONS.give);
  const take = paths(ACTION_ICONS.take);
  assert.deepEqual(give.slice(0, 3), take.slice(0, 3), 'იგივე ფურცელი');
  assert.deepEqual(give.slice(3), ['M14 17h7', 'M18 14l3 3-3 3']);
  assert.deepEqual(take.slice(3), ['M21 17h-7', 'M17 14l-3 3 3 3']);
  for (const svg of Object.values(ACTION_ICONS)) {
    for (const a of ['viewBox="0 0 24 24"', 'width="22"', 'height="22"', 'fill="none"', 'stroke="currentColor"', 'stroke-width="1.6"', 'stroke-linecap="round"', 'stroke-linejoin="round"', 'aria-hidden="true"']) assert.ok(svg.includes(a), a);
  }
});

// ---------- §4.1 ----------

const block = (speaker, store) => {
  const s = buildPrompt({ speaker, gameState: GS, cfg: CFG, manuscript: summaryForServer(store), pacing: pacingState([{ role: 'user', content: 'x' }], speaker) }).systemInstruction;
  return s.slice(s.indexOf('# MANUSCRIPT COPIES AND YOU'), s.indexOf('# THE USER'));
};

test('§4.1 მფლობელის ხაზი მთლიანობის მიხედვით: მთელი — „ნუ იტყვი, რომ აკლია“; ნაწილი — „ბუნებრივია, დანარჩენზე იჩივლო“', () => {
  assert.equal(WHOLE_COPY_LINE, 'The copy you hold is complete: every page is there. Do not claim pages are missing, torn out or skipped — use any other excuse for not having read it.');
  assert.ok(block(byId.vaso, held('vaso')).includes(WHOLE_COPY_LINE));
  for (const [integrity, en] of [['half', 'half'], ['quarter', 'a quarter'], ['page', 'a single page']]) {
    const b = block(byId.vaso, withIntegrity(held('vaso'), 1, integrity));
    assert.ok(b.includes(`You hold only ${en} of it; it is natural to complain that the rest is missing.`), integrity);
    assert.ok(!b.includes(WHOLE_COPY_LINE), integrity);
  }
});

test('§4.1 # ACTION accepted: მთელი ეგზემპლარი → იგივე წინადადება; ნაწილი ან სხვა შედეგი → არა', () => {
  assert.ok(actionBlock({ type: 'hand_over', copyId: 1, outcome: 'accepted', integrity: 'full' }, byId.vaso).includes(WHOLE_COPY_LINE));
  assert.ok(!actionBlock({ type: 'hand_over', copyId: 1, outcome: 'accepted', integrity: 'half' }, byId.vaso).includes(WHOLE_COPY_LINE));
  assert.ok(!actionBlock({ type: 'retrieve', copyId: 1, outcome: 'returned', integrity: 'full' }, byId.vaso).includes(WHOLE_COPY_LINE));
});

// ---------- §4.2 ----------

test('§4.2 რაოდენობა — რაც ავტორმა იცის: ჩაშლილი ჯაჭვი (გადაუმოწმებელი) → 3/3; T-ს გახსნის შემდეგ → 2/3; misplaced / damaged → 2/3 მაშინვე', () => {
  const failed = step(held('bela'), { event_override: 'passed_on', chain_override: 'lose' });
  assert.equal(lostCount(failed), 1, 'სიმართლე');
  assert.equal(knownLostCount(failed), 0);
  assert.equal(existingCount(failed), 3);
  const verified = verifyClaimsFor(failed, 'leri', byId);
  assert.equal(existingCount(verified), 2);
  assert.equal(knownLostCount(verified), 1);
  // H-მა თავად უთხრა (not_returned) → დადასტურებულია
  assert.equal(existingCount(applyNotReturned(failed, 1)), 2);
  // უხილავი T: გადამოწმება არ ხდება — სანამ ოთარი არ ეტყვის, 3/3
  const otari = step(held('otari'), { event_override: 'passed_on' });
  assert.equal(existingCount(verifyClaimsFor(otari, 'kopaleishvili', byId)), 3);
  for (const kind of ['misplaced', 'damaged']) {
    const lost = step(held(kind === 'misplaced' ? 'director' : 'otari'), { event_override: kind });
    assert.deepEqual([existingCount(lost), lostCount(lost), knownLostCount(lost)], [2, 1, 1], kind);
  }
});

test('§4.2 მოდელის მდგომარეობის ხაზიც ცნობილ რაოდენობას იყენებს (პერსონაჟი სიმართლეს არ ამხელს)', () => {
  const failed = step(held('bela'), { event_override: 'passed_on', chain_override: 'lose' });
  const line = (store) => buildPrompt({ speaker: byId.tina, gameState: GS, cfg: CFG, manuscript: summaryForServer(store) }).systemInstruction.match(/The author owns .*? lost\./)[0];
  assert.equal(line(failed), 'The author owns 3 copies of the manuscript: 2 in his hands, 1 handed to colleagues, 0 lost.');
  assert.equal(line(verifyClaimsFor(failed, 'leri', byId)), 'The author owns 3 copies of the manuscript: 2 in his hands, 0 handed to colleagues, 1 lost.');
  const m = summaryForServer(failed);
  assert.deepEqual([m.lost, m.knownLost], [1, 0]);
});
