// Round 8 (FIXES_ROUND8.md): ხელნაწერის ეგზემპლარები — მდგომარეობა, დროის ნაბიჯი, ჯაჭვი, სია, პრომპტი.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  INTEGRITY, initialCopies, loadCopies, saveCopies, copiesInHand, lostCount, existingCount, copyHeldBy, bestCopyInHand,
  applyHandOver, applyReturn, applyNotReturned, verifyClaimsFor, markStraySeen, applyStep, arriveProbability, summaryForServer,
  ledgerLines, statusLines, buttonMode, retrievableFrom, actionText, hash32, mulberry32, rngFactory, manuscriptConfig,
} from '../../public/js/manuscript.js';
import { derive, withDefaults, MONTHS_KA_FROM, MONTHS_KA, dateFor } from '../../public/js/calendar.js';
import { dative, toward, genitive } from '../../public/js/names.js';
import { setJSON, KEYS } from '../../public/js/storage.js';
import { byId, characters, manuscriptBehaviour as BEH } from '../../src/characters.js';
import {
  buildPrompt, sanitizeManuscript, decideAction, parseAction, manuscriptBlock, actionBlock, WHOLE_COPY_LINE, OWN_WORDS_LINE,
} from '../../src/prompt.js';
import { pacingState, redirectGateLine, isManuscriptMessage } from '../../src/pacing.js';
import { composeMockReply, MOCK_NOBODY_GAVE, MOCK_STRAY_PAGES } from '../../src/mock.js';
import { detectRedirect } from '../../src/redirect.js';
import { loadConfig } from '../../src/config.js';

const G = withDefaults({});
const CFG = { game: { ...G, manuscript: {} } };
const GS = { day: 100, season: 'winter', crackStage: 1, cycle: 1, paintingFallen: false };
/** rng ფიქსირებული მიმდევრობით: ყოველ ეგზემპლარს — იგივე სია თავიდან. */
const seq = (...xs) => () => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; };
const ALWAYS = seq(0); // ყველა ალბათობა „მოხდა“, წონიანი არჩევანი — პირველი
const cfgWith = (m) => ({ ...G, manuscript: { ...m } });
const held = (who, day = 0, extra = {}) => applyHandOver(initialCopies(G, 1), 1, who, day);

// ---------- §1 რა ამოვიდა ----------

test('§1 derive() აღარ აბრუნებს lostCopies-ს; seasons_per_lost_copy აღარ არის დეფოლტებში', () => {
  for (const d of [0, 90, 180, 270, 359]) assert.equal('lostCopies' in derive(d, G), false);
  assert.equal('seasons_per_lost_copy' in withDefaults({}), false);
  // ძველი settings.json-ის გასაღები არაფერს ცვლის
  assert.deepEqual(derive(200, withDefaults({ seasons_per_lost_copy: 2 })), derive(200, G));
});

test('§1 seasons_per_lost_copy settings.json-ში → ჩუმად იგნორირდება, ლოგში ერთი გაფრთხილება', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r8-'));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify({ game: { seasons_per_lost_copy: 2 }, gemini: { mock: true } }));
  const prev = process.env.SETTINGS_PATH;
  process.env.SETTINGS_PATH = file;
  try {
    const cfg = loadConfig();
    assert.equal('seasons_per_lost_copy' in cfg.game, false);
    assert.equal(cfg.warnings.filter((w) => w === 'seasons_per_lost_copy is no longer used').length, 1);
    assert.equal(cfg.game.manuscript.probability_scale, 1, 'game.manuscript — settings.example.json-დან');
  } finally {
    if (prev === undefined) delete process.env.SETTINGS_PATH; else process.env.SETTINGS_PATH = prev;
  }
});

// ---------- §2 მდგომარეობა ----------

test('§2 initialCopies / loadCopies: სამი ეგზემპლარი ხელში, მთელი; სხვა ციკლი ან დაზიანებული → ახლიდან', () => {
  const s = initialCopies(G, 1);
  assert.equal(s.copies.length, 3);
  assert.deepEqual(s.copies.map((c) => [c.id, c.status, c.integrity, c.holder]), [[1, 'in_hand', 'full', null], [2, 'in_hand', 'full', null], [3, 'in_hand', 'full', null]]);
  assert.equal(copiesInHand(s), 3);
  assert.equal(lostCount(s), 0);
  setJSON(KEYS.copies, null);
  const a = loadCopies(G, 1);
  assert.deepEqual(a, s);
  const changed = applyHandOver(a, 2, 'vaso', 40);
  saveCopies(changed);
  assert.deepEqual(loadCopies(G, 1), changed, 'იგივე ციკლი → შენახული');
  assert.deepEqual(loadCopies(G, 2), initialCopies(G, 2), 'ჩამონგრევა (ციკლი 2) → სამი ახალი');
  setJSON(KEYS.copies, { cycle: 2, copies: 'x' });
  assert.deepEqual(loadCopies(G, 2), initialCopies(G, 2), 'დაზიანებული → ახალი');
  assert.equal(initialCopies(withDefaults({ copies: 5 }), 1).copies.length, 5);
});

test('§2 მთლიანობის კიბე და მთვლელები: full → half → quarter → page → none', () => {
  assert.deepEqual(INTEGRITY, ['full', 'half', 'quarter', 'page', 'none']);
  let s = initialCopies(G, 1);
  s = { ...s, copies: s.copies.map((c) => (c.id === 2 ? { ...c, status: 'lost', integrity: 'none', holder: 'kote' } : c)) };
  assert.equal(lostCount(s), 1);
  assert.equal(existingCount(s), 2, 'თავზე „2/3“');
});

test('§2/§3 applyHandOver / applyReturn / bestCopyInHand: ნაწილი ნაწილად ბრუნდება და ისევ საუკეთესოა, თუ მთელი არ დარჩა', () => {
  let s = initialCopies(G, 1);
  assert.equal(bestCopyInHand(s).id, 1);
  s = applyHandOver(s, 1, 'vaso', 20);
  assert.deepEqual(copyHeldBy(s, 'vaso'), { ...s.copies[0] });
  assert.equal(s.copies[0].givenDay, 20);
  assert.equal(copiesInHand(s), 2);
  assert.equal(bestCopyInHand(s).id, 2);
  // ნახევარი ბრუნდება ნახევრად
  s = { ...s, copies: s.copies.map((c) => (c.id === 1 ? { ...c, integrity: 'half' } : c)) };
  s = applyReturn(s, 1);
  assert.deepEqual([s.copies[0].status, s.copies[0].holder, s.copies[0].givenDay, s.copies[0].integrity], ['in_hand', null, null, 'half']);
  assert.equal(bestCopyInHand(s).id, 2, 'მთელი ჯობია ნახევარს');
  s = applyHandOver(applyHandOver(s, 2, 'soso', 0), 3, 'kako', 0);
  assert.equal(bestCopyInHand(s).id, 1, 'მხოლოდ ნახევარი დარჩა — ის');
  s = applyHandOver(s, 1, 'bela', 0);
  assert.equal(bestCopyInHand(s), null);
  assert.equal(buttonMode(s, 'otari', true), null, 'ხელში არაფერია და ოთარს არაფერი აქვს');
});

// ---------- §4 დროის ნაბიჯი ----------

test('§4.2 min_days: ასაკი < min_days → არაფერი; ≥ → მოვლენა (probability_scale 1000)', () => {
  const C = cfgWith({ probability_scale: 1000 });
  const s = applyHandOver(initialCopies(G, 1), 1, 'tina', 0); // თინა: min_days 60
  assert.deepEqual(applyStep(s, C, BEH, 40, ALWAYS, byId).store, s);
  assert.equal(applyStep(s, C, BEH, 40, ALWAYS, byId).notes.length, 0);
  const r = applyStep(s, C, BEH, 60, ALWAYS, byId);
  assert.equal(r.notes.length, 1);
  assert.equal(r.store.copies[0].events.length, 1);
});

test('§4.5 probability_scale: 0 → არასდროს; 1000 → ყოველ ნაბიჯზე; 1 → ცხრილის p_event', () => {
  const s = applyHandOver(initialCopies(G, 1), 1, 'vaso', 0);
  for (let d = 20; d < 360; d += 20) assert.equal(applyStep(s, cfgWith({ probability_scale: 0 }), BEH, d, ALWAYS, byId).notes.length, 0);
  assert.equal(applyStep(s, cfgWith({ probability_scale: 1000 }), BEH, 20, seq(0.99), byId).notes.length, 1);
  // p_event 0.40: 0.39 → მოხდა, 0.41 → არა
  assert.equal(applyStep(s, cfgWith({}), BEH, 20, seq(0.39, 0), byId).notes.length, 1);
  assert.equal(applyStep(s, cfgWith({}), BEH, 20, seq(0.41, 0), byId).notes.length, 0);
});

test('§4.2 ერთ ეგზემპლარზე ერთ ნაბიჯში მაქსიმუმ ერთი მოვლენა; ხელში მყოფს არაფერი ემართება', () => {
  let s = initialCopies(G, 1);
  s = applyHandOver(applyHandOver(s, 1, 'vaso', 0), 2, 'kako', 0);
  const r = applyStep(s, cfgWith({ probability_scale: 1000 }), BEH, 20, ALWAYS, byId);
  assert.deepEqual(r.store.copies.map((c) => c.events.length), [1, 1, 0]);
  assert.equal(r.store.copies[2].status, 'in_hand');
  assert.deepEqual(r.notes.map((n) => n.character), ['vaso', 'kako']);
});

test('§4.3 stalled: მხოლოდ საბაბი; fragment: ერთი საფეხური ქვემოთ, page → none = დაკარგული', () => {
  const C = cfgWith({ probability_scale: 1000, stray_page_probability: 0 });
  let r = applyStep(held('boria'), { ...C, manuscript: { ...C.manuscript, event_override: 'stalled' } }, BEH, 20, ALWAYS, byId);
  assert.deepEqual(r.store.copies[0].events, [{ day: 20, actor: 'boria', kind: 'stalled', text_ka: 'სახლში დამრჩა, ალიონზე მოგიტანთ.', to: null }]);
  assert.equal(r.store.copies[0].status, 'held');
  assert.equal(r.store.copies[0].integrity, 'full');
  // ვასო: fragment → kote (წონა 3, პირველი)
  let s = held('vaso');
  const seen = [];
  for (const day of [20, 40, 60, 80]) {
    r = applyStep(s, { ...C, manuscript: { ...C.manuscript, event_override: 'fragment' } }, BEH, day, ALWAYS, byId);
    s = r.store;
    seen.push([s.copies[0].integrity, s.copies[0].status]);
  }
  assert.deepEqual(seen, [['half', 'held'], ['quarter', 'held'], ['page', 'held'], ['none', 'lost']]);
  assert.equal(s.copies[0].holder, 'vaso', 'ბოლო მფლობელი ჩაწერილია');
  assert.equal(r.notes[0].text_ka, 'პირველი მეოთხედი კოტეს გავატანე.');
});

test('§4.3 misplaced / damaged: დაკარგულია, მთლიანობა none, მფლობელი — ბოლო მფლობელად', () => {
  const C = cfgWith({ probability_scale: 1000, stray_page_probability: 0, event_override: 'misplaced' });
  let r = applyStep(held('director'), C, BEH, 20, ALWAYS, byId);
  assert.deepEqual([r.store.copies[0].status, r.store.copies[0].integrity, r.store.copies[0].holder], ['lost', 'none', 'director']);
  assert.equal(r.notes[0].text_ka, 'ბანკში დამრჩა. სესხბანკში თუ მშენბანკში — ვერ გეტყვი.');
  r = applyStep(held('otari'), { ...C, manuscript: { ...C.manuscript, event_override: 'damaged' } }, BEH, 20, ALWAYS, byId);
  assert.deepEqual([r.store.copies[0].status, r.store.copies[0].events[0].kind], ['lost', 'damaged']);
  assert.ok(r.store.copies[0].events[0].text_ka.includes('შაბიამანი'));
});

test('§4.5 event_override: მფლობელის სიაში ამ ტიპის პირველი; არ აქვს → ჩვეულებრივი წონიანი არჩევანი', () => {
  const r = applyStep(held('mikho'), cfgWith({ probability_scale: 1000, event_override: 'passed_on' }), BEH, 20, ALWAYS, byId);
  assert.equal(r.store.copies[0].events[0].kind, 'stalled', 'მიხოს passed_on არ აქვს → წონით პირველი');
  // წონიანი არჩევანი: ვასო 3/2/2/1/1 (სულ 9) — 0.5 × 9 = 4.5 → მეორე (fragment → bela)
  const w = applyStep(held('vaso'), cfgWith({ probability_scale: 1000, stray_page_probability: 0 }), BEH, 20, seq(0, 0.5), byId);
  assert.equal(w.store.copies[0].events[0].to, 'bela');
});

test('§5 ჯაჭვი: chain_override arrive → T ახალი მფლობელია (givenDay = დღე), claim „arrived“; lose → დაკარგულია, claim რჩება', () => {
  const base = cfgWith({ probability_scale: 1000, event_override: 'passed_on', stray_page_probability: 0 });
  let r = applyStep(held('bela', 0), { ...base, manuscript: { ...base.manuscript, chain_override: 'arrive' } }, BEH, 20, ALWAYS, byId);
  let c = r.store.copies[0];
  assert.deepEqual([c.status, c.holder, c.givenDay, c.integrity], ['held', 'leri', 20, 'full']);
  assert.deepEqual(c.claim, { from: 'bela', to: 'leri', kind: 'passed_on', day: 20, verified: false, arrived: true });
  assert.equal(r.notes[0].text_ka, 'ლერიმ წაიღო სახლში!', 'შენიშვნაში მხოლოდ მფლობელის თქმა');
  // ლერის საკუთარი min_days 0 / p_event 0.70 მოქმედებს givenDay-დან — ჯაჭვი გრძელდება
  r = applyStep(r.store, cfgWith({ probability_scale: 1000, stray_page_probability: 0 }), BEH, 40, ALWAYS, byId);
  c = r.store.copies[0];
  assert.deepEqual([c.status, c.holder, c.events.at(-1).actor, c.events.at(-1).kind], ['lost', 'leri', 'leri', 'misplaced']);

  r = applyStep(held('bela', 0), { ...base, manuscript: { ...base.manuscript, chain_override: 'lose' } }, BEH, 20, ALWAYS, byId);
  c = r.store.copies[0];
  assert.deepEqual([c.status, c.holder, c.integrity], ['lost', 'bela', 'none']);
  assert.deepEqual(c.claim, { from: 'bela', to: 'leri', kind: 'passed_on', day: 20, verified: false, arrived: false });
});

test('§5.1 უხილავი T (კოპალეიშვილი) → ყოველთვის იკარგება; p_arrive = (1−pH)(1−pT) [floor, ceiling]-ში; rng წყვეტს', () => {
  const base = cfgWith({ probability_scale: 1000, event_override: 'passed_on', stray_page_probability: 0 });
  const r = applyStep(held('otari'), { ...base, manuscript: { ...base.manuscript, chain_override: 'arrive' } }, BEH, 20, ALWAYS, byId);
  assert.deepEqual([r.store.copies[0].status, r.store.copies[0].claim.to, r.store.copies[0].claim.arrived], ['lost', 'kopaleishvili', false]);
  const M = manuscriptConfig(cfgWith({}));
  assert.ok(Math.abs(arriveProbability(BEH, 'vaso', 'boria', M) - 0.6 * 0.55) < 1e-9);
  assert.ok(Math.abs(arriveProbability(BEH, 'bela', 'leri', M) - 0.18) < 1e-9);
  assert.equal(arriveProbability(BEH, 'bela', 'leri', manuscriptConfig(cfgWith({ chain_floor: 0.5 }))), 0.5, 'floor');
  assert.equal(arriveProbability({ a: { p_event: 0 }, b: { p_event: 0 } }, 'a', 'b', M), 0.9, 'ceiling');
  // rng: [fire 0, choose 0 → (override), chain 0.10 < 0.18 → მივიდა]; 0.5 → არა
  const arrive = applyStep(held('bela'), base, BEH, 20, seq(0, 0.10), byId).store.copies[0];
  assert.equal(arrive.holder, 'leri');
  const lose = applyStep(held('bela'), base, BEH, 20, seq(0, 0.5), byId).store.copies[0];
  assert.equal(lose.status, 'lost');
});

test('§4.6 შემთხვევითი ფურცლები: fragment ხილულ to-ზე; დაკარგვისას — შემთხვევით ხილულს (არა actor, არა to); ერთ პერსონაჟზე ერთი', () => {
  const C = cfgWith({ probability_scale: 1000, stray_page_probability: 1, event_override: 'fragment' });
  let r = applyStep(held('vaso'), C, BEH, 20, ALWAYS, byId);
  assert.deepEqual(r.store.strayPages, [{ character: 'kote', copyId: 1, day: 20, seen: false }]);
  // ხაბურძანია უხილავია → არაფერი
  r = applyStep(held('bela'), C, BEH, 20, ALWAYS, byId);
  assert.deepEqual(r.store.strayPages, []);
  // დაკარგვა: rng 0 → ხილულთა დალაგებული სიიდან პირველი (არა director)
  r = applyStep(held('director'), cfgWith({ probability_scale: 1000, stray_page_probability: 1, event_override: 'misplaced' }), BEH, 20, ALWAYS, byId);
  const visible = Object.keys(byId).filter((id) => byId[id].reachable && id !== 'director').sort();
  assert.deepEqual(r.store.strayPages, [{ character: visible[0], copyId: 1, day: 20, seen: false }]);
  // ერთ პერსონაჟზე მაქსიმუმ ერთი
  let s = applyHandOver(applyHandOver(initialCopies(G, 1), 1, 'vaso', 0), 2, 'boria', 0);
  r = applyStep(s, C, BEH, 20, ALWAYS, byId); // ვასო → kote; ბორია → fragment → kako
  r = applyStep(r.store, C, BEH, 40, ALWAYS, byId);
  assert.equal(r.store.strayPages.filter((p) => p.character === 'kote').length, 1);
  assert.equal(r.store.strayPages.filter((p) => p.character === 'kako').length, 1);
  // ალბათობა 0 → არასდროს
  assert.deepEqual(applyStep(held('vaso'), cfgWith({ probability_scale: 1000, stray_page_probability: 0, event_override: 'fragment' }), BEH, 20, ALWAYS, byId).store.strayPages, []);
  s = markStraySeen(applyStep(held('vaso'), C, BEH, 20, ALWAYS, byId).store, 'kote');
  assert.equal(s.strayPages[0].seen, true);
});

test('§4.4 PRNG დეტერმინისტულია: იგივე client|cycle|copy|day → იგივე შედეგი; სხვა დღე → სხვა მიმდევრობა', () => {
  assert.equal(hash32('abc'), hash32('abc'));
  assert.notEqual(hash32('a|1|1|20'), hash32('a|1|1|40'));
  const a = mulberry32(42); const b = mulberry32(42);
  for (let i = 0; i < 5; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
  const f = rngFactory('cid', 1, 20);
  assert.equal(f(1)(), rngFactory('cid', 1, 20)(1)());
  assert.notEqual(f(1)(), rngFactory('cid', 1, 40)(1)());
  const C = cfgWith({});
  const s = applyHandOver(initialCopies(G, 1), 1, 'vaso', 0);
  assert.deepEqual(applyStep(s, C, BEH, 20, rngFactory('x', 1, 20), byId), applyStep(s, C, BEH, 20, rngFactory('x', 1, 20), byId));
});

// ---------- §5.3 / §3 ----------

test('§5.3 verifyClaimsFor: მხოლოდ ხილული T; applyNotReturned: claim → verified, claim-ის გარეშე → lossVerified', () => {
  let s = applyStep(held('bela'), cfgWith({ probability_scale: 1000, event_override: 'passed_on', chain_override: 'lose', stray_page_probability: 0 }), BEH, 20, ALWAYS, byId).store;
  assert.equal(verifyClaimsFor(s, 'vaso', byId), s, 'სხვა პერსონაჟი — უცვლელი');
  s = verifyClaimsFor(s, 'leri', byId);
  assert.equal(s.copies[0].claim.verified, true);
  const o = applyStep(held('otari'), cfgWith({ probability_scale: 1000, event_override: 'passed_on', stray_page_probability: 0 }), BEH, 20, ALWAYS, byId).store;
  assert.equal(verifyClaimsFor(o, 'kopaleishvili', byId).copies[0].claim.verified, false, 'უხილავს ვერავინ ჰკითხავს');
  assert.equal(applyNotReturned(o, 1).copies[0].claim.verified, true);
  const m = applyStep(held('director'), cfgWith({ probability_scale: 1000, event_override: 'misplaced', stray_page_probability: 0 }), BEH, 20, ALWAYS, byId).store;
  assert.equal(applyNotReturned(m, 1).copies[0].lossVerified, true);
});

test('§3.1 ღილაკის რეჟიმი: proxy-ში არასდროს; მფლობელთან / დაკარგვა ჯერ არ უთქვამს / ჯაჭვის მთქმელთან — გამორთმევა; სხვაგან — გადაცემა', () => {
  const s0 = initialCopies(G, 1);
  assert.equal(buttonMode(s0, 'vaso', true), 'hand_over');
  assert.equal(buttonMode(s0, 'givi', false), null);
  assert.equal(buttonMode(s0, 'tamari', true), 'hand_over', 'უარის მთქმელთანაც — შედეგს სერვერი წყვეტს');
  const s1 = applyHandOver(s0, 1, 'vaso', 0);
  assert.equal(buttonMode(s1, 'vaso', true), 'retrieve');
  const lost = applyStep(held('director'), cfgWith({ probability_scale: 1000, event_override: 'misplaced', stray_page_probability: 0 }), BEH, 20, ALWAYS, byId).store;
  assert.equal(buttonMode(lost, 'director', true), 'retrieve', 'დაკარგულია, მაგრამ ჯერ არ უთქვამს');
  assert.equal(buttonMode(applyNotReturned(lost, 1), 'director', true), 'hand_over', 'უკვე უთხრა → ისევ გადაცემა (ხელში 2 დარჩა)');
  const arrived = applyStep(held('bela'), cfgWith({ probability_scale: 1000, event_override: 'passed_on', chain_override: 'arrive', stray_page_probability: 0 }), BEH, 20, ALWAYS, byId).store;
  assert.equal(buttonMode(arrived, 'leri', true), 'retrieve');
  assert.equal(buttonMode(arrived, 'bela', true), 'retrieve', 'ბელა ამბობს, რომ გადასცა — მასაც შეიძლება სთხოვო');
  assert.equal(retrievableFrom(arrived, 'bela').id, 1);
});

// ---------- §8.3 სია / §3.2 სტატუსის ხაზი ----------

test('§8.3 MONTHS_KA_FROM: 12 „-დან“ ფორმა; თარიღი givenDay-დან', () => {
  assert.deepEqual(MONTHS_KA_FROM, ['იანვრიდან', 'თებერვლიდან', 'მარტიდან', 'აპრილიდან', 'მაისიდან', 'ივნისიდან', 'ივლისიდან', 'აგვისტოდან', 'სექტემბრიდან', 'ოქტომბრიდან', 'ნოემბრიდან', 'დეკემბრიდან']);
  assert.equal(MONTHS_KA_FROM.length, MONTHS_KA.length);
  assert.equal(dateFor(G, 44).getUTCMonth(), 9);
});

test('§3.2 dative() ყველა short_name_ka-ზე; genitive() („… თქმით“) ყველა გადამცემზე', () => {
  const expected = {
    director: 'ვაჟა ზაზაევიჩს', vaso: 'ვასოს', marksheideri: 'მარკშეიდერს', irodioni: 'იროდიონს', tamari: 'ქალბატონ თამარს',
    soso: 'სოსოს', grisha: 'გრიშას', bela: 'ბელას', mikho: 'მიხოს', tina: 'თინას', otari: 'ოთარს', shukri: 'შუქრის',
    boria: 'ბორიას', kako: 'კაკოს', chachanidze: 'ჩაჩანიძეს', kote: 'კოტეს', lali: 'ლალის', two_big_men: 'ორ დიდ კაცს',
    tengizi: 'თენგიზს', leri: 'ბელას ქმარს', givi: 'გივის', kuparadze: 'ყუფარაძეს', murmanidze: 'მურმანიძეს',
    gamkrelidze: 'გამყრელიძეს', kopaleishvili: 'კოპალეიშვილს', tsverava: 'წვერავას', zina: 'ზინას', shota: 'შოთას', khaburdzania: 'ხაბურძანიას',
  };
  assert.equal(Object.keys(expected).length, characters.length);
  for (const c of characters) assert.equal(dative(c.short_name_ka), expected[c.id], c.id);
  // ნათესაობითი — ყველა, ვისაც passed_on მოვლენა აქვს (მხოლოდ ისინი ჩნდებიან „… თქმით“ ხაზში)
  const gen = { soso: 'სოსოს', director: 'ვაჟა ზაზაევიჩის', tina: 'თინას', vaso: 'ვასოს', bela: 'ბელას', otari: 'ოთარის', irodioni: 'იროდიონის', kako: 'კაკოს', boria: 'ბორიას' };
  const givers = Object.keys(BEH).filter((id) => (BEH[id].events || []).some((e) => e.kind === 'passed_on'));
  assert.deepEqual(givers.sort(), Object.keys(gen).sort());
  for (const id of givers) assert.equal(genitive(byId[id].short_name_ka), gen[id], id);
  assert.equal(genitive('ჩაჩანიძე'), 'ჩაჩანიძის');
  assert.equal(toward('ვასო'), 'ვასოსთან', 'toward უცვლელია');
});

test('§8.3 ledgerLines: ყველა ფორმა ზუსტი ქართული ტექსტით', () => {
  let s = initialCopies(G, 1);
  assert.deepEqual(ledgerLines(s, byId, G), ['№1 — თქვენთან', '№2 — თქვენთან', '№3 — თქვენთან']);
  // ხელში ნახევარი; ვასოსთან 15 ოქტომბრიდან (დღე 44) — მეოთხედი; დირექტორთან დაკარგული
  s = applyHandOver(s, 2, 'vaso', 44);
  s = { ...s, copies: s.copies.map((c) => (c.id === 1 ? { ...c, integrity: 'half' } : c.id === 2 ? { ...c, integrity: 'quarter' } : c)) };
  s = applyHandOver(s, 3, 'director', 0);
  s = applyStep(s, cfgWith({ probability_scale: 1000, event_override: 'misplaced', stray_page_probability: 0 }), { director: BEH.director }, 20, ALWAYS, byId).store;
  assert.deepEqual(ledgerLines(s, byId, G), [
    '№1 — თქვენთან (ნახევარი)',
    '№2 — ვასოსთან 15 ოქტომბრიდან (მეოთხედი)',
    '№3 — დაკარგულია: ბანკში დამრჩა. სესხბანკში თუ მშენბანკში — ვერ გეტყვი. (ვაჟა ზაზაევიჩი)',
  ]);
  assert.deepEqual(ledgerLines(applyHandOver(initialCopies(G, 1), 1, 'vaso', 0), byId, G)[0], '№1 — ვასოსთან 1 სექტემბრიდან');
  // ჯაჭვი: გადაუმოწმებელი claim იმარჯვებს — „ვასოს თქმით, კოტეს გადასცა“ / „ოთარის თქმით, …“
  const chain = (who, override) => applyStep(held(who), cfgWith({ probability_scale: 1000, event_override: 'passed_on', chain_override: override, stray_page_probability: 0 }), BEH, 20, ALWAYS, byId).store;
  assert.equal(ledgerLines(chain('bela', 'arrive'), byId, G)[0], '№1 — ბელას თქმით, ბელას ქმარს გადასცა');
  assert.equal(ledgerLines(chain('bela', 'lose'), byId, G)[0], '№1 — ბელას თქმით, ბელას ქმარს გადასცა');
  assert.equal(ledgerLines(chain('otari', 'lose'), byId, G)[0], '№1 — ოთარის თქმით, კოპალეიშვილს გადასცა');
  // გადამოწმების შემდეგ: მივიდა → „ბელას ქმართან 21 სექტემბრიდან“; არა → „… ამბობს, არაფერი მიუღია.“
  assert.equal(ledgerLines(verifyClaimsFor(chain('bela', 'arrive'), 'leri', byId), byId, G)[0], '№1 — ბელას ქმართან 21 სექტემბრიდან');
  assert.equal(ledgerLines(verifyClaimsFor(chain('bela', 'lose'), 'leri', byId), byId, G)[0], '№1 — დაკარგულია: ბელას ქმარი ამბობს, არაფერი მიუღია.');
  // უხილავი T + ოთარმა უკვე უთხრა → დაკარგვის ჩვეულებრივი ფორმა
  assert.equal(ledgerLines(applyNotReturned(chain('otari', 'lose'), 1), byId, G)[0], '№1 — დაკარგულია: წავიკითხე, მომეწონა, კოპალეიშვილს გადავეცი — სად არის, არ ვიცი. (ოთარი)');
  // ნანახი ფურცელი
  let f = applyStep(held('vaso'), cfgWith({ probability_scale: 1000, stray_page_probability: 1, event_override: 'fragment' }), BEH, 20, ALWAYS, byId).store;
  assert.equal(ledgerLines(f, byId, G)[0], '№1 — ვასოსთან 1 სექტემბრიდან (ნახევარი)', 'ჯერ არ ნანახი — არ ჩანს');
  f = markStraySeen(f, 'kote');
  assert.equal(ledgerLines(f, byId, G)[0], '№1 — ვასოსთან 1 სექტემბრიდან (ნახევარი) · ერთი ფურცელი კოტესთან');
});

test('§3.2 statusLines: მფლობელი / ნაწილი / გადაუმოწმებელი claim / დაკარგული და ნათქვამი / სხვა შემთხვევაში ცარიელი', () => {
  let s = applyHandOver(initialCopies(G, 1), 2, 'vaso', 60);
  assert.equal(statusLines(s, 'vaso', 60, byId), 'ეგზემპლარი №2 ვასოსთანაა 0 დღეა');
  assert.equal(statusLines(s, 'vaso', 100, byId), 'ეგზემპლარი №2 ვასოსთანაა 40 დღეა');
  s = { ...s, copies: s.copies.map((c) => (c.id === 2 ? { ...c, integrity: 'half' } : c)) };
  assert.equal(statusLines(s, 'vaso', 100, byId), 'ეგზემპლარი №2 ვასოსთანაა 40 დღეა (ნახევარი)');
  assert.equal(statusLines(s, 'kote', 100, byId), '');
  const t = applyHandOver(initialCopies(G, 1), 1, 'tamari', 0);
  assert.equal(statusLines(t, 'tamari', 1, byId), 'ეგზემპლარი №1 ქალბატონ თამართანაა 1 დღეა');
  const lose = applyStep(held('bela'), cfgWith({ probability_scale: 1000, event_override: 'passed_on', chain_override: 'lose', stray_page_probability: 0 }), BEH, 20, ALWAYS, byId).store;
  assert.equal(statusLines(lose, 'bela', 20, byId), 'ბელას თქმით, ეგზემპლარი №1 ბელას ქმარს გადასცა');
  assert.equal(statusLines(applyNotReturned(lose, 1), 'bela', 20, byId), 'ეგზემპლარი №1 დაკარგულია: ლერიმ წაიღო სახლში!');
  const m = applyStep(held('director'), cfgWith({ probability_scale: 1000, event_override: 'misplaced', stray_page_probability: 0 }), BEH, 20, ALWAYS, byId).store;
  assert.equal(statusLines(m, 'director', 20, byId), '', 'ჯერ არ უთქვამს — ხაზი დამალულია (ღილაკი — გამორთმევა)');
  assert.equal(statusLines(applyNotReturned(m, 1), 'director', 20, byId), 'ეგზემპლარი №1 დაკარგულია: ბანკში დამრჩა. სესხბანკში თუ მშენბანკში — ვერ გეტყვი.');
});

test('§3.3 რემარკის ტექსტი: გადაცემა (მთელი / ნაწილი), გამორთმევა; სახელის გარეშე — „ავტორი“', () => {
  assert.equal(actionText('hand_over', 'ალექსანდრე', 'ვასო'), '*ალექსანდრე ვასოს ხელნაწერის ეგზემპლარს აწვდის.*');
  assert.equal(actionText('hand_over', 'ალექსანდრე', 'ვასო', 'half'), '*ალექსანდრე ვასოს ხელნაწერის ეგზემპლარის ნახევარს აწვდის.*');
  assert.equal(actionText('hand_over', '', 'ოთარი', 'quarter'), '*ავტორი ოთარს ხელნაწერის ეგზემპლარის მეოთხედს აწვდის.*');
  assert.equal(actionText('hand_over', 'ნინო', 'ქალბატონი თამარი', 'page'), '*ნინო ქალბატონ თამარს ხელნაწერის ეგზემპლარის ერთ ფურცელს აწვდის.*');
  assert.equal(actionText('retrieve', 'ნინო', 'ვასო'), '*ნინო ვასოს ეგზემპლარს უკან სთხოვს.*');
  // §7.4: მოქმედების ხაზი ხელნაწერის შეტყობინებად ითვლება
  assert.ok(isManuscriptMessage(actionText('retrieve', 'ნინო', 'ვასო')));
  const p = pacingState([{ role: 'user', content: actionText('hand_over', 'ნინო', 'ვასო') }], byId.vaso);
  assert.equal(p.manuscriptCount, 1);
});

test('§3.3 summaryForServer: რიცხვები + ბოლო 6 მოვლენა', () => {
  let s = held('vaso');
  for (let d = 20; d <= 200; d += 20) s = applyStep(s, cfgWith({ probability_scale: 1000, event_override: 'stalled' }), { vaso: { ...BEH.vaso, events: [{ kind: 'stalled', to: null, weight: 1, text_ka: 'x' }] } }, d, ALWAYS, byId).store;
  const m = summaryForServer(s);
  assert.deepEqual([m.inHand, m.lost, m.total], [2, 0, 3]);
  assert.equal(s.copies[0].events.length, 10);
  assert.equal(m.copies[0].events.length, 6);
  assert.equal(m.copies[0].events[0].day, 100);
});

// ---------- §3.3 / §7 სერვერი ----------

test('§3.3 sanitizeManuscript: არ არის → ყველა ხელში; ცუდი id / holder / მთლიანობა / სტატუსი → უარი; რიცხვები ხელახლა ითვლება', () => {
  const ok = sanitizeManuscript(undefined, CFG);
  assert.deepEqual([ok.ok, ok.summary.inHand, ok.summary.total, ok.summary.lost], [true, 3, 3, 0]);
  const good = summaryForServer(applyHandOver(initialCopies(G, 1), 2, 'vaso', 40));
  const r = sanitizeManuscript({ ...good, inHand: 99 }, CFG);
  assert.equal(r.ok, true);
  assert.equal(r.summary.inHand, 2);
  const bad = (mut) => { const m = JSON.parse(JSON.stringify(good)); mut(m); return sanitizeManuscript(m, CFG).ok; };
  assert.equal(bad((m) => { m.copies[1].id = 1; }), false, 'გამეორებული id');
  assert.equal(bad((m) => { m.copies[1].id = 7; }), false, 'დიაპაზონს გარეთ');
  assert.equal(bad((m) => { m.copies.pop(); }), false, 'რაოდენობა');
  assert.equal(bad((m) => { m.copies[1].holder = 'givi'; }), false, 'უხილავი ცხრილში არ არის');
  assert.equal(bad((m) => { m.copies[1].holder = 'nobody'; }), false);
  assert.equal(bad((m) => { m.copies[1].integrity = 'most'; }), false);
  assert.equal(bad((m) => { m.copies[1].status = 'burnt'; }), false);
  assert.equal(bad((m) => { m.copies[1].events = [{ actor: 'x', kind: 'stalled', text_ka: 'a', day: 1 }]; }), false, 'უცნობი actor');
  assert.equal(bad((m) => { m.copies[1].events = [{ actor: 'vaso', kind: 'burn', text_ka: 'a', day: 1 }]; }), false);
  assert.equal(bad((m) => { m.copies[1].claim = { from: 'vaso', to: 'zzz' }; }), false);
  assert.equal(bad((m) => { m.strayPages = [{ character: 'lali', copyId: 9 }]; }), false);
  assert.equal(sanitizeManuscript('x', CFG).ok, false);
  // დღეები იჭრება, ტექსტი ≤ 200, მოვლენები ≤ 6
  const big = JSON.parse(JSON.stringify(good));
  big.copies[1].givenDay = 99999;
  big.copies[1].events = Array.from({ length: 9 }, (_, i) => ({ actor: 'vaso', kind: 'stalled', text_ka: 'ა'.repeat(300), day: i, to: null }));
  const c = sanitizeManuscript(big, CFG).summary.copies[1];
  assert.equal(c.givenDay, 359);
  assert.equal(c.events.length, 6);
  assert.equal(c.events[0].text_ka.length, 200);
});

test('§3.3 decideAction: accepted / refused / already_holds; returned / not_returned (+ to) / nothing_to_retrieve', () => {
  const m0 = summaryForServer(initialCopies(G, 1));
  assert.equal(decideAction({ type: 'hand_over', copyId: 1 }, m0, byId.vaso).result.outcome, 'accepted');
  const ref = decideAction({ type: 'hand_over', copyId: 1 }, m0, byId.shukri).result;
  assert.deepEqual([ref.outcome, ref.reason_ka], ['refused', 'მე არ წავიკითხავ! პრინციპულად.']);
  assert.equal(decideAction({ type: 'hand_over', copyId: 1 }, m0, byId.tamari).result.reason_ka, 'სად მცალია ნეტავ მაგისთვის — ხელფასები ვერ დამირიგებია. ვინმე სხვას მიეცი.');
  assert.equal(decideAction({ type: 'hand_over', copyId: 1 }, m0, byId.leri).result.outcome, 'refused', 'ლერი მხოლოდ ჯაჭვით');
  const m1 = summaryForServer(applyHandOver(initialCopies(G, 1), 1, 'vaso', 0));
  assert.deepEqual(decideAction({ type: 'hand_over', copyId: 2 }, m1, byId.vaso), { status: 409, error: 'already_holds' });
  assert.deepEqual(decideAction({ type: 'retrieve', copyId: 1 }, m0, byId.vaso), { status: 409, error: 'nothing_to_retrieve' });
  const ret = decideAction({ type: 'retrieve', copyId: 1 }, m1, byId.vaso).result;
  assert.deepEqual([ret.outcome, ret.integrity, ret.copyId], ['returned', 'full', 1]);
  const lostDir = applyStep(applyHandOver(initialCopies(G, 1), 1, 'director', 0), cfgWith({ probability_scale: 1000, event_override: 'passed_on', chain_override: 'lose', stray_page_probability: 0 }), BEH, 20, ALWAYS, byId).store;
  const nr = decideAction({ type: 'retrieve', copyId: 1 }, summaryForServer(lostDir), byId.director).result;
  assert.deepEqual([nr.outcome, nr.reason_ka, nr.to], ['not_returned', 'თინას მივეცი, უჯრაში ჩადო, როგორც წესია.', 'tina']);
  // ჯაჭვი შედგა: ბელას ეგზემპლარი ლერისთანაა, ბელა მაინც „ლერიმ წაიღო“-ს ამბობს
  const arrived = applyStep(held('bela'), cfgWith({ probability_scale: 1000, event_override: 'passed_on', chain_override: 'arrive', stray_page_probability: 0 }), BEH, 20, ALWAYS, byId).store;
  assert.equal(decideAction({ type: 'retrieve', copyId: 1 }, summaryForServer(arrived), byId.bela).result.outcome, 'not_returned');
  assert.equal(decideAction({ type: 'retrieve', copyId: 1 }, summaryForServer(arrived), byId.leri).result.outcome, 'returned');
  // parseAction
  assert.equal(parseAction(undefined, CFG), null);
  assert.equal(parseAction({ type: 'burn', copyId: 1 }, CFG), false);
  assert.equal(parseAction({ type: 'retrieve', copyId: 4 }, CFG), false);
  assert.equal(parseAction({ type: 'retrieve', copyId: '1' }, CFG), false);
  assert.deepEqual(parseAction({ type: 'hand_over', copyId: 2, integrity: 'half' }, CFG), { type: 'hand_over', copyId: 2, integrity: 'half' });
});

const prompt = (speaker, manuscript, extra = {}) => buildPrompt({ speaker, gameState: GS, cfg: CFG, manuscript, pacing: pacingState([{ role: 'user', content: 'გამარჯობა' }], speaker), ...extra }).systemInstruction;
const block = (s) => (s.includes('# MANUSCRIPT COPIES AND YOU') ? s.slice(s.indexOf('# MANUSCRIPT COPIES AND YOU'), s.indexOf('# THE USER')) : '');

test('§7.1 მდგომარეობის ხაზი: ავტორის ეგზემპლარები (ხელში / გადაცემული / დაკარგული)', () => {
  let s = applyHandOver(initialCopies(G, 1), 1, 'vaso', 0);
  s = { ...s, copies: s.copies.map((c) => (c.id === 3 ? { ...c, status: 'lost', holder: 'kote', integrity: 'none' } : c)) };
  const p = prompt(byId.tina, summaryForServer(s));
  assert.ok(p.includes('The author owns 3 copies of the manuscript: 1 in his hands, 1 handed to colleagues, 1 lost.'));
  assert.ok(!p.includes('lost so far'));
  assert.ok(p.indexOf('The author owns') > p.indexOf('# CURRENT STATE OF THE BUILDING'));
  assert.ok(p.indexOf('The author owns') < p.indexOf('# THE USER'));
});

test('§7.2 # MANUSCRIPT COPIES AND YOU: მფლობელი (და ჯაჭვით მიღებული), დაკარგულის ბოლო მფლობელი, ჩაშლილი ჯაჭვის T, ფურცლები, უარის მთქმელი, არაფერი → ბლოკი არ არის', () => {
  // არაფერი არ ეხება → ბლოკი საერთოდ არ არის
  assert.equal(block(prompt(byId.vaso, summaryForServer(initialCopies(G, 1)))), '');
  // მფლობელი: ავტორმა 1 სექტემბერს მისცა, 100 დღის წინ; საკუთარი სიტყვები რიგით
  let s = applyHandOver(initialCopies(G, 1), 2, 'vaso', 0);
  s = applyStep(s, cfgWith({ probability_scale: 1000, event_override: 'stalled' }), { vaso: { ...BEH.vaso, events: [{ kind: 'stalled', to: null, weight: 1, text_ka: 'ჯერ სურათი.' }] } }, 20, ALWAYS, byId).store;
  let b = block(prompt(byId.vaso, summaryForServer(s)));
  assert.ok(b.includes('You currently have copy №2 (whole). The author handed it to you on 1 September 1983, 100 days ago.'), b);
  assert.ok(b.includes('You have NOT read it (two pages at most) and you never will'));
  assert.ok(b.includes('What you tell the author about it, in order (these are facts of this conversation, state them as your own words when relevant): "ჯერ სურათი."'));
  // ჯაჭვით მიღებული (ბელა → ლერი, 20-ე დღე)
  const arrived = applyStep(held('bela'), cfgWith({ probability_scale: 1000, event_override: 'passed_on', chain_override: 'arrive', stray_page_probability: 0 }), BEH, 20, ALWAYS, byId).store;
  b = block(prompt(byId.leri, summaryForServer(arrived)));
  assert.ok(b.includes('You currently have copy №1 (whole). ბელა handed it to you on 21 September 1983, 80 days ago (the author gave it to ბელა first).'), b);
  b = block(prompt(byId.bela, summaryForServer(arrived)));
  assert.ok(b.includes('What you say happened: "ლერიმ წაიღო სახლში!"'));
  assert.ok(b.includes('You say you gave it to ბელას ქმარი. (Truth: it arrived — the author cannot know this from you.)'));
  // დაკარგულის ბოლო მფლობელი
  const lost = applyStep(held('director'), cfgWith({ probability_scale: 1000, event_override: 'misplaced', stray_page_probability: 0 }), BEH, 20, ALWAYS, byId).store;
  b = block(prompt(byId.director, summaryForServer(lost)));
  assert.ok(b.includes('You had copy №1 and it is gone. What you say happened: "ბანკში დამრჩა. სესხბანკში თუ მშენბანკში — ვერ გეტყვი.". Stick to this story; you will not admit it is lost.'), b);
  // ჩაშლილი ჯაჭვი: H — „never arrived“; T — „nobody gave you anything“
  const failed = applyStep(held('vaso'), cfgWith({ probability_scale: 1000, event_override: 'passed_on', chain_override: 'lose', stray_page_probability: 0 }), BEH, 20, ALWAYS, byId).store;
  assert.ok(block(prompt(byId.vaso, summaryForServer(failed))).includes('You say you gave it to ბორია. (Truth: it never arrived'));
  b = block(prompt(byId.boria, summaryForServer(failed)));
  assert.ok(b.includes('ვასო claims to have given you copy №1. That is not true: nobody gave you anything. If asked, say so plainly (seed: „ჩემთვის არავის არაფერი მოუცია.“).'), b);
  // ფურცლები
  const stray = { ...summaryForServer(initialCopies(G, 1)), strayPages: [{ character: 'lali', copyId: 2 }] };
  assert.ok(block(prompt(byId.lali, stray)).includes('A few loose pages of a typescript titled „ტიანშანი“ turned up on your desk'));
  // უარის მთქმელი — მხოლოდ მოქმედების გარეშე
  b = block(prompt(byId.shukri, summaryForServer(initialCopies(G, 1))));
  assert.ok(b.includes('If the author tries to leave a copy with you, you do not take it. Your reason: "მე არ წავიკითხავ! პრინციპულად.".'));
  const withAction = prompt(byId.shukri, summaryForServer(initialCopies(G, 1)), { actionResult: { type: 'hand_over', copyId: 1, outcome: 'refused', integrity: 'full', reason_ka: 'მე არ წავიკითხავ! პრინციპულად.' } });
  assert.ok(!block(withAction).includes('If the author tries'));
  // proxy ჩატში ბლოკი proxy-სთვისაა
  const viaProxy = buildPrompt({ speaker: byId.vaso, invisible: byId.givi, gameState: GS, cfg: CFG, manuscript: summaryForServer(s) }).systemInstruction;
  assert.ok(viaProxy.includes('You currently have copy №2'));
  assert.equal(manuscriptBlock(byId.vaso, null, CFG), null);
});

test('§7.3 # ACTION: ოთხივე შედეგი, პრომპტის ბოლოს (PACING-ისა და რემარკის რეჟიმის შემდეგ)', () => {
  const m = summaryForServer(initialCopies(G, 1));
  const cases = {
    accepted: ['vaso', { integrity: 'full' }, 'THIS TURN: the author just handed you copy №1 (whole). You take it. Reply in character with your attitude to the manuscript; seed phrase: "კარგი, დამიტოვე, ამაღამვე დავიწყებ.". Do not promise a date you will keep; do not start reading on the spot.'],
    refused: ['tamari', { integrity: 'full', reason_ka: BEH.tamari.refuse_ka }, `THIS TURN: the author just tried to hand you copy №1. You do NOT take it; it stays with him. Reason, seed phrase: "${BEH.tamari.refuse_ka}". Say it in character, with one excuse only.`],
    returned: ['vaso', { integrity: 'half' }, 'THIS TURN: the author asks for copy №1 back. You give it back (what is left of it: half). Seed phrase: "აი, აიღე. ბოლომდე ვერ მოვასწარი, ჯერ ეს სურათი გაიტანონ.". Never claim you finished it.'],
    not_returned: ['director', { integrity: 'none', reason_ka: 'ბანკში დამრჩა.' }, 'THIS TURN: the author asks for copy №1 back. You cannot give it: "ბანკში დამრჩა.". Say this in character; do not invent a different fate for it.'],
  };
  for (const [outcome, [id, extra, line]] of Object.entries(cases)) {
    const result = { type: outcome.includes('return') ? 'retrieve' : 'hand_over', copyId: 1, outcome, ...extra };
    // Round 9: მთელი ეგზემპლარის ხაზი (accepted/full) და „ავტორის სიტყვები“ ყველა შედეგზე
    const full = `${line}${outcome === 'accepted' ? ` ${WHOLE_COPY_LINE}` : ''} ${OWN_WORDS_LINE}`;
    assert.equal(actionBlock(result, byId[id]), `# ACTION\n${full}`, outcome);
    const s = prompt(byId[id], m, { actionResult: result, stageMode: 'none' });
    assert.ok(s.trimEnd().endsWith(`# ACTION\n${full}`), outcome);
    assert.ok(s.indexOf('# PACING') < s.indexOf('# ACTION'));
  }
  assert.equal(actionBlock(null, byId.vaso), null);
  assert.ok(!prompt(byId.vaso, m).includes('# ACTION'));
});

test('§7.3 REDIRECT GATE: not_returned ხილულ to-ზე → ღიაა მანუსკრიპტის მთვლელის მიუხედავად; სხვა შემთხვევაში — ჩვეულებრივი', () => {
  const p0 = pacingState([{ role: 'user', content: 'გამარჯობა' }], byId.director);
  assert.ok(redirectGateLine(p0).includes('fewer than 3'));
  assert.ok(redirectGateLine(p0, { allow: true }).startsWith('REDIRECT GATE: open for this reply'));
  const m = summaryForServer(initialCopies(G, 1));
  const open = prompt(byId.director, m, { actionResult: { type: 'retrieve', copyId: 1, outcome: 'not_returned', integrity: 'none', reason_ka: 'თინას მივეცი.', to: 'tina' } });
  assert.ok(open.includes('REDIRECT GATE: open for this reply'));
  const inv = prompt(byId.otari, m, { actionResult: { type: 'retrieve', copyId: 1, outcome: 'not_returned', integrity: 'none', reason_ka: 'კოპალეიშვილს გადავეცი.', to: 'kopaleishvili' } });
  assert.ok(inv.includes('fewer than 3'), 'უხილავთან ვერ გაგზავნის');
  const noTo = prompt(byId.director, m, { actionResult: { type: 'retrieve', copyId: 1, outcome: 'not_returned', integrity: 'none', reason_ka: 'ბანკში დამრჩა.', to: null } });
  assert.ok(noTo.includes('fewer than 3'));
});

test('§7.5 mock: თესლი სიტყვასიტყვით; not_returned ხილულ to-ზე → „თინასთან ჩაიარეთ.“ (suggested_redirect); მფლობელი / ჩაშლილი ჯაჭვი / ფურცლები', () => {
  const m = summaryForServer(initialCopies(G, 1));
  const reply = (speaker, extra) => composeMockReply({ speaker, invisible: null, userText: 'x', historyLen: 2, gameState: GS, manuscript: m, ...extra });
  assert.ok(reply(byId.vaso, { actionResult: { outcome: 'accepted' } }).includes('კარგი, დამიტოვე, ამაღამვე დავიწყებ.'));
  assert.ok(reply(byId.shukri, { actionResult: { outcome: 'refused', reason_ka: BEH.shukri.refuse_ka } }).includes('მე არ წავიკითხავ!'));
  assert.ok(reply(byId.vaso, { actionResult: { outcome: 'returned' } }).includes('ბოლომდე ვერ მოვასწარი'));
  const nr = reply(byId.director, { actionResult: { outcome: 'not_returned', reason_ka: 'თინას მივეცი, უჯრაში ჩადო, როგორც წესია.', to: 'tina' } });
  assert.ok(nr.includes('თინას მივეცი'));
  assert.ok(nr.trimEnd().endsWith('თინასთან ჩაიარეთ.'));
  assert.equal(detectRedirect({ speaker: byId.director, reply: nr, currentId: 'director' }), 'tina');
  const inv = reply(byId.otari, { actionResult: { outcome: 'not_returned', reason_ka: 'კოპალეიშვილს გადავეცი.', to: 'kopaleishvili' } });
  assert.ok(!inv.includes('ჩაიარეთ'));
  // მფლობელი ხელნაწერზე: ბოლო საკუთარი სიტყვა; არ აქვს → პირველი stalled
  const hm = summaryForServer(applyHandOver(initialCopies(G, 1), 1, 'boria', 0));
  assert.ok(composeMockReply({ speaker: byId.boria, invisible: null, userText: 'ხელნაწერი როგორაა?', historyLen: 2, gameState: GS, manuscript: hm }).includes('სახლში დამრჩა, ალიონზე მოგიტანთ.'));
  const failed = summaryForServer(applyStep(held('vaso'), cfgWith({ probability_scale: 1000, event_override: 'passed_on', chain_override: 'lose', stray_page_probability: 0 }), BEH, 20, ALWAYS, byId).store);
  assert.ok(composeMockReply({ speaker: byId.boria, invisible: null, userText: 'ვასომ ხელნაწერი მოგცა?', historyLen: 2, gameState: GS, manuscript: failed }).includes(MOCK_NOBODY_GAVE));
  const stray = { ...m, strayPages: [{ character: 'lali', copyId: 1 }] };
  assert.ok(composeMockReply({ speaker: byId.lali, invisible: null, userText: 'გამარჯობა', historyLen: 0, gameState: GS, manuscript: stray }).includes(MOCK_STRAY_PAGES));
  assert.ok(!composeMockReply({ speaker: byId.lali, invisible: null, userText: 'გამარჯობა', historyLen: 2, gameState: GS, manuscript: stray }).includes(MOCK_STRAY_PAGES));
});

test('§6 ქცევის ცხრილი: სპეცის პერსონაჟები, ველები, მოვლენების მიმღებები არსებობს; ჯაჭვის სამიზნე — მიმღები ან chain_only', () => {
  const accepting = ['soso', 'director', 'tina', 'vaso', 'bela', 'otari', 'irodioni', 'kako', 'boria', 'kote', 'mikho'];
  const refusing = ['shukri', 'grisha', 'tamari', 'marksheideri', 'lali', 'tengizi', 'chachanidze', 'leri', 'two_big_men'];
  assert.deepEqual(Object.keys(BEH).sort(), [...accepting, ...refusing].sort());
  for (const id of accepting) {
    const b = BEH[id];
    assert.equal(b.accepts, true, id);
    assert.ok(b.accept_ka && b.return_ka && b.events.length && b.min_days >= 0 && b.p_event > 0, id);
  }
  for (const id of refusing) { assert.equal(BEH[id].accepts, false, id); assert.ok(BEH[id].refuse_ka, id); }
  assert.deepEqual([BEH.leri.chain_only, BEH.leri.min_days, BEH.leri.p_event], [true, 0, 0.70]);
  for (const [id, b] of Object.entries(BEH)) {
    for (const e of b.events || []) {
      assert.ok(['stalled', 'fragment', 'passed_on', 'misplaced', 'damaged'].includes(e.kind), `${id} ${e.kind}`);
      if (e.to) assert.ok(byId[e.to], `${id} → ${e.to}`);
      if (e.kind === 'passed_on' && byId[e.to].reachable) assert.ok(BEH[e.to].accepts || BEH[e.to].chain_only, `${id} → ${e.to}`);
    }
  }
  // ორი კანონიკური ციტატა უცვლელია
  assert.ok(BEH.bela.return_ka.includes('დავიწყე და გავწყვიტე'));
  assert.ok(BEH.tina.events.some((e) => e.text_ka.includes('ჩამარაზვინე')));
});
