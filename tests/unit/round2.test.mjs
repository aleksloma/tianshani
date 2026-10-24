// FIXES_ROUND2: ბიუჯეტი (§3), ფორმატირება/ფანჯრის ტექსტი (§1, §2, §9), ფონი ეტაპების მიხედვით (§7), ტემპი და მონაცემები (§8), მენიუს რიგი (§6).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  costUsd, globalPeriodKey, nextMonthISO, estimateTokens, reserveUsd, globalStatus, wouldOvershoot, projectedMonthEnd,
  createWarnLogger, budgetEnabled, MSG_BUDGET,
} from '../../src/budget.js';
import { resetsAt, MSG_LIMIT, periodKey } from '../../src/limits.js';
import { formatTokens, THIN_SPACE, resetDateDative, limitBody, periodLine, LIMIT_TITLE, GLOBAL_SENTENCE } from '../../public/js/format.js';
import { resolveBackground } from '../../public/js/background.js';
import { pacingState, pacingLine, isManuscriptMessage, phraseCore } from '../../src/pacing.js';
import { menuOrder } from '../../public/js/wall.js';
import { composeMockReply, scriptLines } from '../../src/mock.js';
import { characters, byId, world } from '../../src/characters.js';
import { buildPrompt } from '../../src/prompt.js';
import { parseStage } from '../../public/js/stage.js';

const PRICES = { price_input_per_1m_usd: 0.75, price_output_per_1m_usd: 3.75 };
const near = (a, b, eps = 1e-12) => Math.abs(a - b) < eps;

// ---------- §3 ბიუჯეტი ----------

test('ხარჯის ფორმულა: input/1e6 × 0.75 + output/1e6 × 3.75', () => {
  assert.ok(near(costUsd(1_000_000, 0, PRICES), 0.75));
  assert.ok(near(costUsd(0, 1_000_000, PRICES), 3.75));
  assert.ok(near(costUsd(4000, 250, PRICES), 4000 / 1e6 * 0.75 + 250 / 1e6 * 3.75));
  assert.equal(costUsd(-5, -5, PRICES), 0);
  // 2027-01-01-ის ორმაგი ფასი
  assert.ok(near(costUsd(1_000_000, 1_000_000, { price_input_per_1m_usd: 1.5, price_output_per_1m_usd: 7.5 }), 9));
});

test('გლობალური პერიოდი: UTC კალენდარული თვე; განახლება — მომავალი თვის 1-ში', () => {
  assert.equal(globalPeriodKey(new Date('2026-10-31T23:59:59Z')), '2026-10');
  assert.equal(globalPeriodKey(new Date('2026-11-01T00:00:00Z')), '2026-11');
  assert.equal(nextMonthISO(new Date('2026-10-24T12:00:00Z')), '2026-11-01T00:00:00.000Z');
  assert.equal(nextMonthISO(new Date('2026-12-05T00:00:00Z')), '2027-01-01T00:00:00.000Z');
  assert.equal(resetsAt('monthly', new Date('2026-10-24T12:00:00Z')), '2026-11-01T00:00:00.000Z');
  assert.equal(resetsAt('lifetime'), null);
  assert.equal(periodKey('lifetime'), 'all');
});

function fakeStore(cost, input = 0, output = 0) {
  return { getGlobal: () => ({ cost_usd: cost, input_tokens: input, output_tokens: output, requests: 1 }) };
}

test('რეზერვი: პრომპტის შეფასება + max_output_tokens; ბოლო მოთხოვნა ბიუჯეტს არ გადააჭარბებს', () => {
  assert.equal(estimateTokens('a'.repeat(400)), 100);
  assert.equal(estimateTokens(''), 0);
  const r = reserveUsd({ promptTokens: 4000, maxOutputTokens: 250, prices: PRICES });
  assert.ok(near(r, costUsd(4000, 250, PRICES)));
  const cfg = { budget: { global_monthly_usd: 50, warn_at_percent: 80, ...PRICES } };
  const now = new Date('2026-10-15T12:00:00Z');
  // ხარჯი ბიუჯეტამდე ძალიან ახლოს → რეზერვი გადააჭარბებს → უარი
  const s1 = globalStatus(fakeStore(50 - r / 2), cfg, now);
  assert.equal(s1.exhausted, false);
  assert.equal(wouldOvershoot(s1, r), true);
  // საკმარისი ადგილი → ნებადართულია
  const s2 = globalStatus(fakeStore(10), cfg, now);
  assert.equal(wouldOvershoot(s2, r), false);
  // ამოწურული
  const s3 = globalStatus(fakeStore(50), cfg, now);
  assert.equal(s3.exhausted, true);
  assert.equal(s3.resets_at, '2026-11-01T00:00:00.000Z');
  // გაფრთხილება 80%-ზე
  assert.equal(globalStatus(fakeStore(39.9), cfg, now).warn, false);
  assert.equal(globalStatus(fakeStore(40), cfg, now).warn, true);
  assert.equal(globalStatus(fakeStore(40), cfg, now).percent, 80);
});

test('ბიუჯეტი 0 ან უარყოფითი → გამორთულია (არასდროს ბლოკავს)', () => {
  for (const v of [0, -1, undefined]) {
    const cfg = { budget: { global_monthly_usd: v, ...PRICES } };
    assert.equal(budgetEnabled(cfg), false);
    const s = globalStatus(fakeStore(1000), cfg);
    assert.equal(s.exhausted, false);
    assert.equal(wouldOvershoot(s, 1000), false);
  }
});

test('თვის ბოლოს პროგნოზი და დღეში ერთი გაფრთხილება', () => {
  const p = projectedMonthEnd(10, new Date('2026-10-11T00:00:00Z')); // 10 დღე გავიდა, 31-დღიანი თვე
  assert.equal(p.days_in_month, 31);
  assert.equal(p.days_elapsed, 10);
  assert.ok(near(p.projected_usd, 31, 1e-9));
  const logs = [];
  const w = createWarnLogger({ warn: (m) => logs.push(m) });
  const st = { warn: true, percent: 85, spent_usd: 42.5, budget_usd: 50, period_key: '2026-10' };
  assert.equal(w.check(st, new Date('2026-10-11T01:00:00Z')), true);
  assert.equal(w.check(st, new Date('2026-10-11T20:00:00Z')), false, 'იმავე დღეს მეორედ არა');
  assert.equal(w.check(st, new Date('2026-10-12T01:00:00Z')), true);
  assert.equal(w.check({ ...st, warn: false }, new Date('2026-10-13T01:00:00Z')), false);
  assert.equal(logs.length, 2);
});

test('შეტყობინებები: კლიენტის და გლობალური ლიმიტი — იდენტური ტექსტი', () => {
  assert.equal(MSG_LIMIT, 'ბიუჯეტში გარღვევა გვაქვს, თვის ბოლომდე დავიცადოთ.');
  assert.equal(MSG_BUDGET, MSG_LIMIT);
});

// ---------- §1, §2, §9 ფორმატი და ფანჯარა ----------

test('ტოკენები თხელი სივრცით: 1987420 → „1 987 420“', () => {
  assert.equal(THIN_SPACE, ' ');
  assert.equal(formatTokens(1987420), `1${THIN_SPACE}987${THIN_SPACE}420`);
  assert.equal(formatTokens(2000000), `2${THIN_SPACE}000${THIN_SPACE}000`);
  assert.equal(formatTokens(999), '999');
  assert.equal(formatTokens(-4), '0');
  assert.equal(formatTokens('x'), '0');
});

test('ფანჯრის ტექსტი: სათაური, განახლების თარიღი მიცემითში, გლობალურს — ერთი დამატებითი წინადადება', () => {
  assert.equal(LIMIT_TITLE, 'ბიუჯეტში გარღვევა გვაქვს');
  assert.equal(resetDateDative('2026-11-01T00:00:00.000Z'), '1 ნოემბერს');
  assert.equal(resetDateDative('2027-01-01T00:00:00.000Z'), '1 იანვარს');
  assert.equal(resetDateDative(null), null);
  assert.equal(resetDateDative('garbage'), null);
  const client = limitBody('client_limit', '2026-11-01T00:00:00.000Z');
  const global = limitBody('global_budget', '2026-11-01T00:00:00.000Z');
  // Round 4 §3: იგივე კუდი, სხვადასხვა პირველი წინადადება; „ტოკენ“ არსად
  assert.equal(client, 'კითხვების თვიური ლიმიტი ამოიწურა. თვის ბოლომდე დავიცადოთ. განახლდება 1 ნოემბერს.');
  assert.equal(global, `${GLOBAL_SENTENCE} თვის ბოლომდე დავიცადოთ. განახლდება 1 ნოემბერს.`);
  assert.equal(limitBody('client_limit', null), 'კითხვების ლიმიტი ამოიწურა.');
  for (const t of [client, global]) assert.ok(!/[{}"]|error|client_limit|global_budget/.test(t), 'JSON/კოდი არასდროს ჩანს');
  assert.equal(periodLine('monthly', '2026-11-01T00:00:00.000Z'), 'ლიმიტი განახლდება 1 ნოემბერს');
  assert.equal(periodLine('lifetime', null), 'ერთჯერადი ლიმიტი');
});

// ---------- §7 ფონი ეტაპების მიხედვით ----------

test('resolveBackground: null → უახლოესი წინა არა-null', () => {
  const list = ['a.jpg', 'b.jpg', null, null, null];
  assert.equal(resolveBackground(list, 0), 'a.jpg');
  assert.equal(resolveBackground(list, 1), 'b.jpg');
  assert.equal(resolveBackground(list, 2), 'b.jpg');
  assert.equal(resolveBackground(list, 4), 'b.jpg');
  assert.equal(resolveBackground(list, 99), 'b.jpg', 'საზღვრის მიღმა — ბოლო');
  assert.equal(resolveBackground(['a.jpg', null, 'c.jpg', null, null], 3), 'c.jpg');
  assert.equal(resolveBackground([null, null, 'c.jpg'], 1), null);
  assert.equal(resolveBackground([], 0), null);
  assert.equal(resolveBackground(undefined, 2), null);
  assert.equal(resolveBackground(['a.jpg', null], -3), 'a.jpg');
});

// ---------- §6 მენიუ ----------

test('menuOrder: content_score კლებით, თანაბარზე — ხილული წინ; უხილავები ბოლოს', () => {
  const list = [
    { id: 'x', content_score: 2, reachable: false },
    { id: 'a', content_score: 5, reachable: true },
    { id: 'y', content_score: 2, reachable: true },
    { id: 'b', content_score: 8, reachable: true },
  ];
  assert.deepEqual(menuOrder(list).map((c) => c.id), ['b', 'a', 'y', 'x']);
  // რეალურ მონაცემებში: ყველა უხილავი ყველა ხილულის შემდეგ (მათი ქულა უფრო დაბალია)
  const real = menuOrder(characters);
  const firstInvisible = real.findIndex((c) => !c.reachable);
  assert.ok(firstInvisible > 0);
  assert.ok(real.slice(firstInvisible).every((c) => !c.reachable), real.map((c) => `${c.id}:${c.content_score}`).join(' '));
  for (let i = 1; i < real.length; i++) assert.ok(real[i - 1].content_score >= real[i].content_score);
});

// ---------- §8 მონაცემები და ტემპი ----------

test('shared_idiom_ka: „ნელთბილად“ და სხვა პერსონაჟის საფირმო ფრაზები აღარ არის საერთო სიებში', () => {
  const shared = JSON.stringify(world.shared_idiom_ka);
  assert.ok(!shared.includes('ნელთბილად'));
  for (const s of ['ვმუშაობდი', 'ძალიან კარგი!', 'ფაქტიურად', 'დასწრება სავალდებულოა', 'გაატარეთ კანცელარიაში', 'დანომრეთ', 'პაჟარია', 'ზედმეტია']) {
    assert.ok(!shared.includes(s), s);
  }
  // თამარს თავისი ფრაზა რჩება; რუსიზმები და დიალექტი ხელუხლებელია
  assert.ok(byId.tamari.catchphrases_ka.includes('ვარ ნელთბილად.'));
  assert.ok(byId.irodioni.catchphrases_ka.some((c) => c.includes('პაჟარია')));
  assert.ok(byId.tina.catchphrases_ka.includes('დასწრება სავალდებულოა.'));
  assert.ok(world.shared_idiom_ka.russianisms.includes('კაპრემონტი'));
  assert.ok(byId.tamari.persona_ka.speech_style.includes('ბოშო'));
  // ბელას პრომპტში „ნელთბილად“ აღარ ჩანს
  const s = buildPrompt({ speaker: byId.bela, gameState: { day: 0 }, cfg: { game: {} } }).systemInstruction;
  assert.ok(!s.includes('ნელთბილად'));
});

test('ქართული მონაცემების შესწორებები (Round 2 §8)', () => {
  assert.ok(world.setting_ka.includes('ახალგაზრდა მწერალ სოსოს მოაქვს მოთხრობა „ცისფერი მთები ანუ ტიან-შანი“'));
  assert.ok(byId.mikho.persona_ka.real_activity.includes('სხვის ხელნაწერს ფარულად კითხულობს'));
  assert.ok(byId.mikho.persona_ka.personality.includes('ინტერესი ლიტერატურისადმი'));
  assert.ok(byId.tamari.persona_ka.real_activity.startsWith('თავს უჩივის'));
});

test('ხელნაწერის საკვანძო სიტყვები', () => {
  for (const t of ['ჩემი მოთხრობა წაიკითხეთ?', 'ხელნაწერი სად არის?', 'დაბეჭდავთ?', 'ეგზემპლარი დამიბრუნეთ', 'ტიან-შანი', 'ცისფერი მთები', 'Did you read my manuscript?']) {
    assert.ok(isManuscriptMessage(t), t);
  }
  for (const t of ['როგორ ხარ?', 'რა ამინდია?', 'ჭადრაკს თამაშობთ?']) assert.ok(!isManuscriptMessage(t), t);
});

test('ტემპის ხაზი: შეტყობინებები, ხელნაწერზე შეტყობინებები, უკვე გამოყენებული ფრაზები', () => {
  const bela = byId.bela;
  const history = [
    { role: 'user', content: 'როგორ ხარ?' },
    { role: 'assistant', content: `კარგად, ადამიანო.\n${phraseCore(bela.catchphrases_ka[0])}!` },
    { role: 'user', content: 'ჩემი მოთხრობა წაიკითხე?' },
    { role: 'assistant', content: 'დავიწყე და გავწყვიტე.' },
    { role: 'user', content: 'ხელნაწერი სად არის?' },
  ];
  const p = pacingState(history, bela);
  assert.equal(p.messageCount, 3);
  assert.equal(p.manuscriptCount, 2);
  assert.deepEqual(p.usedCatchphrases, [bela.catchphrases_ka[0]]);
  const line = pacingLine(p);
  assert.ok(line.startsWith('Messages in this chat so far: 3. Messages about the manuscript so far: 2. Catchphrases already used in this chat: [„'), line);
  assert.equal(pacingLine({ messageCount: 1, manuscriptCount: 0, usedCatchphrases: [] }),
    'Messages in this chat so far: 1. Messages about the manuscript so far: 0. Catchphrases already used in this chat: [none]');
  // მომხმარებლის შეტყობინებაში ნახსენები ფრაზა „გამოყენებულად“ არ ითვლება
  assert.deepEqual(pacingState([{ role: 'user', content: bela.catchphrases_ka[0] }], bela).usedCatchphrases, []);
  // პრომპტში — # PACING სექცია
  const s = buildPrompt({ speaker: bela, gameState: { day: 0 }, cfg: { game: {} }, pacing: p }).systemInstruction;
  assert.ok(s.includes(`# PACING\n${line}\nLENGTH FOR THIS REPLY: at most 3 short sentences`));
  // გადამისამართების ჩამკეტი: <3 → აკრძალულია, ≥3 → ნებადართული
  assert.ok(s.includes('REDIRECT GATE: the manuscript has come up 2 time(s) — fewer than 3. In THIS reply do NOT send the user to anyone else'));
  const s3 = buildPrompt({ speaker: bela, gameState: { day: 0 }, cfg: { game: {} }, pacing: { ...p, manuscriptCount: 3 } }).systemInstruction;
  assert.ok(s3.includes('REDIRECT GATE: the manuscript has come up 3+ times — now you may'));
});

test('phraseCore: ფრჩხილები, „— პასუხი“, ბოლო პუნქტუაცია ქრება; გრძელი ფრაზა — პირველი 4 სიტყვა', () => {
  assert.equal(phraseCore('არტემ ჩაჩანიძე. ლირიკა. მშვენიერია. (დირექტორი მასზე)'), 'არტემ ჩაჩანიძე. ლირიკა. მშვენიერია');
  assert.equal(phraseCore('როგორ ბრძანდებით? — ნელთბილად.'), 'როგორ ბრძანდებით');
  assert.equal(phraseCore('ერთი ორი სამი ოთხი ხუთი ექვსი შვიდი.'), 'ერთი ორი სამი ოთხი');
});

test('mock: პასუხები ხაზებად (\\n); გადამისამართება მხოლოდ ≥3 ხელნაწერის შეტყობინებიდან', () => {
  const gs = { season: 'autumn', crackStage: 0, lostCopies: 0, cycle: 1, day: 0 };
  assert.equal(scriptLines('ერთი. ორი? სამი! ოთხი… ხუთი'), 'ერთი.\nორი?\nსამი!\nოთხი… ხუთი');
  assert.equal(scriptLines('(ფრჩხილი. შიგნით) და „ციტატა. აქ“ რჩება.'), '(ფრჩხილი. შიგნით) და „ციტატა. აქ“ რჩება.');
  let multi = 0;
  for (const id of ['director', 'tina', 'otari', 'bela', 'vaso', 'shukri']) {
    const sp = byId[id];
    const r0 = composeMockReply({ speaker: sp, invisible: null, userText: 'ჩემი მოთხრობა წაიკითხეთ?', historyLen: 0, gameState: gs, manuscriptCount: 1 });
    assert.ok(r0.includes('\n'), `${id}: ${r0}`);
    const speechLines = parseStage(r0).filter((s) => s.type === 'speech').map((s) => s.text).join('').split('\n').filter((l) => l.trim());
    if (speechLines.length >= 2) multi++;
    assert.ok(!/მიმართეთ\.$/.test(r0), `${id}: პირველ შეტყობინებაზე გადამისამართება არ არის`);
    if (sp.redirects_to?.length) {
      const r3 = composeMockReply({ speaker: sp, invisible: null, userText: 'ჩემი მოთხრობა წაიკითხეთ?', historyLen: 4, gameState: gs, manuscriptCount: 3 });
      assert.ok(/მიმართეთ\.$/.test(r3), `${id}: ${r3}`);
    }
  }
  assert.ok(multi >= 4, `ხაზებად დაყოფილი საუბარი: ${multi}`);
});
