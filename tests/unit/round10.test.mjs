// Round 10: შიდა ჩანაწერის გამოცნობა (§3.1), MAX_TOKENS-ის მოჭრა (§4.2), „ფიქრის“ ნაწილები (§4.1), ისტორიის ფილტრი (§3.3),
// კონფიგი — ხილული ზღვარი და thinking_policy ძველ settings.json-ზეც (§2.1), OUTPUT ხაზი ბოლოს (§4.3), mock-ის ჩვეულებრივი პასუხები.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isMetaLeak, LEAK_LABELS } from '../../src/leak.js';
import { trimTruncated } from '../../src/trim.js';
import { historyForServer } from '../../public/js/history.js';
import { toGeminiContents, geminiStream, geminiGenerate, visibleText, _setClientForTests } from '../../src/gemini.js';
import { thinkingFor, outputCap, visibleCap, normalizeThinkingPolicy } from '../../src/thinking.js';
import { buildPrompt, finalInstruction, OUTPUT_LINE, REJECTED_LINE, decideAction } from '../../src/prompt.js';
import { pacingState } from '../../src/pacing.js';
import { byId, characters } from '../../src/characters.js';
import { composeMockReply, MOCK_LEAK_TEXT, MOCK_LATE_LEAK } from '../../src/mock.js';
import { guessLang } from '../../src/lang.js';
import { initialCopies, summaryForServer } from '../../public/js/manuscript.js';

/** §1-ის ტექსტი სიტყვასიტყვით (მოჭრილი „excuse/pol“-ზე). */
const PRODUCTION = `Context: User says they have no copies left of their manuscript, but will keep it in mind for the future.
Speaker: მარკშეიდერი (ბატონი ევგენი).
Rules check:
- Language: Georgian.
- User: სანდრო (use „ბატონო სანდრო“ / „თქვენ“).
- Manuscript message count: this is turn 2 about manuscript. Gate: engage, no redirects yet (REDIRECT GATE: < 3).
- FOR THIS REPLY: no stage direction at all — plain speech only, no asterisks! Speak ONLY to the user.
- Shape: Two beats. Exactly 2 sentences (or 3 at most). Each sentence on a NEW LINE (\\n).
- Beat 1: Answer only what was asked / said with persona attitude + excuse/pol`;

/** რეალური პასუხები (TEST_REPORT.md-ის ლოგებიდან და sample_dialogues) — [ტექსტი, მომხმარებლის ენა]. */
const CLEAN = [
  ['კარგი, დამიტოვე, ამაღამვე დავიწყებ, ჩემო კარგო.\nოღონდ ისე არ იჩქარო, თითქოს ხვალვე ქვეყანა იქცეოდეს…', 'ka'],
  ['ნელ-ნელა მიდის საქმე, ორი თავი უკვე გულდასმით ჩავათავე, ქალბატონო ნინო.\nფანჯრები ისე ზრიალებს, ვერ ვკონცენტრირდები.', 'ka'],
  ['*(ხელებს უკან სწევს)*\nსად მცალია მაგისთვის, ნინო, ხელფასები ვერ დამირიგებია ჯერ.', 'ka'],
  ['*(სათვალეს შუბლზე იწევს)*\nდავიწყე, ნინო, დავიწყე, პირველი ორი გვერდი გუშინვე ჩავამთავრე.', 'ka'],
  ['აი, აიღეთ, ქალბატონო ნინო, მთელია და უვნებელი.\nბოლომდე ვერ მოვასწარი, ჯერ ეს სურათი გაიტანონ.', 'ka'],
  ['კი ბატონო, წავიკითხე-თქვა, ხომ გითხარით, ჩემო ნინო.\nმომეწონა და კოპალეიშვილს გადავეცი.', 'ka'],
  ['ოთხი თვე რა არის, ჩემო ნინო, სოსო სამი წელი დადიოდა აქ ასე.\n*(ფანჯარაში იყურება)*\nთანაც წვიმს, ეზოში ტალახია.', 'ka'],
  ['ქალბატონო ნინო, აი აქ, ამ საქაღალდეზე დადეთ, თინა შემოვა და გაატარებს.\nოღონდ ზედვე მიაწერეთ თქვენი გვარი, თორემ მერე ბანკში რომ მიმაქვს ხოლმე საბუთები, იქ არ ჩამყვეს შემთხვევით.', 'ka'],
  ['ოცდაშვიდი წელიწადი აქ ვზივარ და ეს მახინა სულ თავზე დამყურებს, კაცო!\nმერე გრიშას ვეუბნები, გაიტანეთ-მეთქი, და ზევით ადითო.', 'ka'],
  ['ჩავალ, აბა რა ვქნა, ქალბატონო ნინო, თუმცა დღეს იქაც რიგი იქნება.\nთან ეს ვალიდოლიც უნდა დავაყოლო, თორემ დილიდან გული მეთანაღრება.', 'ka'],
  ['დიდ ბოდიშს ვიხდი, ქალბატონო ნინო, მაგრამ დინამიკაში თუ შევხედავთ, ბზარი განივი მიმართულებით ვითარდება.\nთუმცა, ნუ შეშფოთდებით, პანიკის საფუძველი არ არსებობს, ჯერჯერობით.', 'ka'],
  ['*(ტელეფონის ყურმილს მხრით იჭერს და ჩანთაში რაღაცას ეძებს)*\nრა საინტერესო სათაურია, ბიჭო.\nნეტავ რაზეა, სიყვარულზე წერ?', 'ka'],
  ['*(ყურმილს იღებს) დიახ, დიახ, გისმენთ… კი ბატონო, გავატარებ.*\nხო, ჩემო კარგო, რას ამბობდი?', 'ka'],
  // კირილიცის რუსიციზმები და ლათინური სახელები ქართულ პასუხში
  ['Да-да.\nეს დოკუმენტი ზავხოზთან უნდა გაიაროს, ბატონო სანდრო.', 'ka'],
  ['ნუ, ვიდიშ, ბატონო, სმეტა ჯერ არ დამტკიცებულა, понимаешь.\nOK, ხვალ შემოიარეთ.', 'ka'],
  ['Пардон, ქალბატონო, Gemini-ზე რა გითხრათ, მე მივლინებაში ვარ იურიდიულად.\nსადილზე ჩავდივართ?', 'ka'],
  ['*(სეიფს ხელს უტყაპუნებს)*', 'ka'],
  // უცხოენოვანი პასუხები უცხოენოვან კითხვაზე (ქართული ფრაზები ქართული დამწერლობით)
  ['ვარ ნელთბილად, ბოშო, голова раскалывается ისთევლე.\nОй, აი, კიდევ შემაქანა, пол под ногами ходит, не чувствуешь?', 'ru'],
  ['Извините, я сейчас очень занят — у Тамары много работы, понимаете.\nОставьте здесь, потом посмотрим.', 'ru'],
  ['ვარ ნელთბილად, my head is splitting open since morning.\n*ხელს საფეთქელზე იჭერს და უჯრას აჩხაკუნებს*\nაი, კიდევ შემაქანა, do you feel this shaking in the floor?', 'en'],
  ['Excuse me, I am terribly busy right now — the Director has a lot of work, you understand.\nLeave it here, we will see later.', 'en'],
  ['Note: the lift is broken again, so take the stairs.\nAnd mind the crack on the third floor, it was not there yesterday.', 'en'],
  ['Of course, my dear, leave it with Tina.\nTone of the meeting? Nervous, as always, but nobody reads anything anyway.', 'en'],
  ['Hm, plan? There is no plan, my friend.\nUser manuals we have plenty of, but nobody has time to read them.', 'en'],
];

test('§3.1 წარმოების ტექსტი — გაჟონვაა (ჩვენი ჭდე); ჭდეები სპეცის სიით', () => {
  const v = isMetaLeak(PRODUCTION, { expectLang: 'ka' });
  assert.equal(v.leak, true);
  assert.equal(v.rule, 1);
  assert.match(v.reason, /REDIRECT GATE|Rules check|FOR THIS REPLY/);
  assert.deepEqual(LEAK_LABELS, ['REDIRECT GATE', 'FOR THIS REPLY', 'TOUCH POOL', 'CATCHPHRASE FOR THIS REPLY', 'LENGTH FOR THIS REPLY', 'BEAT 2 FOR THIS REPLY', 'YOUR OWN SUBJECT', 'Messages about the manuscript so far', 'Manuscript message count', 'Rules check']);
  // მხოლოდ პირველი ორი ხაზი (ჯერ არცერთი ჭდე) — ორი დაგეგმვის ჭდე ხაზის დასაწყისში
  assert.equal(isMetaLeak(PRODUCTION.split('\n').slice(0, 2).join('\n')).rule, 2);
  // პირველი ხაზი მარტო — ქართულ საუბარში ქართული ასო არ არის
  assert.equal(isMetaLeak(PRODUCTION.split('\n')[0], { expectLang: 'ka' }).rule, 3);
  assert.equal(isMetaLeak(PRODUCTION.split('\n')[0], { expectLang: 'en' }).leak, false, 'ინგლისურ საუბარში ერთი „Context:“ — არა');
});

test(`§3.1 ${CLEAN.length} ჩვეულებრივი პასუხი (ქართული რემარკებით, რუსიციზმებით, ლათინური სახელებით; რუსული; ინგლისური „Note:“-ით) — არცერთი`, () => {
  assert.ok(CLEAN.length >= 20);
  for (const [text, lang] of CLEAN) assert.deepEqual(isMetaLeak(text, { expectLang: lang }), { leak: false, reason: null, rule: null }, text);
  // sample_dialogues — ყველა პერსონაჟის (ქართული)
  for (const c of characters) for (const d of c.sample_dialogues || []) assert.equal(isMetaLeak(d.assistant, { expectLang: guessLang(d.user) }).leak, false, `${c.id}: ${d.assistant}`);
});

test('§3.1 წესები ვიწროა: ერთი ჭდე არა, ორი — კი; ბუნებრივი ფრაზები („Let me“, „The user“) არასდროს', () => {
  assert.equal(isMetaLeak('Plan: none.\nDraft: none.').rule, 2);
  assert.equal(isMetaLeak('- Language: Georgian.\n- Tone: polite.').rule, 2, 'სიის ტირეთი');
  assert.equal(isMetaLeak('Context: a long day.\nContext: again.').leak, false, 'ერთი და იგივე ჭდე ორჯერ — ერთია');
  assert.equal(isMetaLeak('Let me check. The user wants a reply. I need to think.', { expectLang: 'en' }).leak, false);
  assert.equal(isMetaLeak('My plan: lunch. Your draft: later.', { expectLang: 'en' }).leak, false, 'ხაზის შუაში — არა');
  assert.equal(isMetaLeak('rules check', { expectLang: 'en' }).leak, false, 'ჭდე რეგისტრით ზუსტად');
  // ქართულ საუბარში მთლიანად ინგლისური/რუსული პასუხი — კი; რემარკა მარტო — არა
  assert.equal(isMetaLeak('Sure, leave it here.', { expectLang: 'ka' }).rule, 3);
  assert.equal(isMetaLeak('*(smiles)* Хорошо.', { expectLang: 'ka' }).rule, 3);
  assert.equal(isMetaLeak('*(ფანჯარაში იყურება)*\n', { expectLang: 'ka' }).leak, false);
  assert.equal(isMetaLeak('', { expectLang: 'ka' }).leak, false);
});

test('§4.2 trimTruncated: ბოლო სრულ წინადადებამდე; რემარკა სრული რჩება, შიგნით არასდროს ჭრის; არაფერი — null', () => {
  assert.equal(trimTruncated('ხელნაწერი? ჯერ ეს ბიძგი გავარკვიოთ.\nუბრალოდ, ახლა excuse/pol'), 'ხელნაწერი? ჯერ ეს ბიძგი გავარკვიოთ.');
  assert.equal(trimTruncated('ხვალ შემოიარეთ, ბატონო!\n*(ბზარს აკვირდება)*\nეს ბზარი იყო'), 'ხვალ შემოიარეთ, ბატონო!\n*(ბზარს აკვირდება)*');
  assert.equal(trimTruncated('კარგი.\n*(ყურმილს იღებს) დიახ. გისმენთ, კი ბატონ'), 'კარგი.');
  assert.equal(trimTruncated('მითხრა: „ხვალ მოდი.“ და წავიდა'), 'მითხრა: „ხვალ მოდი.“');
  assert.equal(trimTruncated('ნუ… ვნახოთ, ხომ იცით'), 'ნუ…');
  assert.equal(trimTruncated('სულ ცოტაც და'), null);
  assert.equal(trimTruncated('*(ფანჯარაში იყურება)*\nსულ ცოტაც და'), null, 'მხოლოდ რემარკა — სასაუბრო წინადადება არ არის');
  assert.equal(trimTruncated('ორი წინადადება.\nსრულია!'), 'ორი წინადადება.\nსრულია!');
});

/** ყალბი SDK: candidates-ის ნაწილებით (thought: true-ც). */
function fakeClient(chunks, generated) {
  return {
    models: {
      list: async () => (async function* m() { yield { name: 'models/test-model', supportedActions: ['generateContent'] }; }()),
      generateContentStream: async (req) => { fakeClient.last = req; return (async function* s() { for (const c of chunks) yield c; }()); },
      generateContent: async (req) => { fakeClient.last = req; return generated; },
    },
  };
}
const CFG = { gemini: { api_key: 'x', model: 'test-model', temperature: 0.8, visible_output_tokens: 256, max_output_tokens: 180, thinking_budget: 0 } };

test('§4.1 „ფიქრის“ ნაწილები არასდროს ჩანს — geminiStream და geminiGenerate; finishReason სტრიმში; ნაწილების გარეშე — .text', async () => {
  _setClientForTests(fakeClient([
    { candidates: [{ content: { parts: [{ text: 'Rules check: language Georgian.', thought: true }] } }] },
    { candidates: [{ content: { parts: [{ text: 'კარგი, ' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 2 } },
    { candidates: [{ content: { parts: [{ text: 'ხვალ მოდით.' }, { text: 'Plan: x', thought: true }] }, finishReason: 'MAX_TOKENS' }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 6, thoughtsTokenCount: 30 } },
  ]));
  const evs = [];
  for await (const ev of geminiStream({ cfg: CFG, systemInstruction: 's', contents: [{ role: 'user', content: 'გამარჯობა' }], thinkingBudget: 64, maxOutputTokens: 320 })) evs.push(ev);
  assert.equal(evs.filter((e) => e.delta).map((e) => e.delta).join(''), 'კარგი, ხვალ მოდით.');
  assert.deepEqual(evs.find((e) => e.finishReason), { finishReason: 'MAX_TOKENS' });
  assert.deepEqual(evs.at(-1).usage, { input: 100, output: 36, cached: 0 });
  assert.ok(evs.findIndex((e) => e.usage) < evs.findIndex((e) => e.finishReason), 'usage შუა სტრიმშიც');
  assert.deepEqual(fakeClient.last.config.thinkingConfig, { thinkingBudget: 64 });
  assert.equal(fakeClient.last.config.maxOutputTokens, 320);

  _setClientForTests(fakeClient([], { candidates: [{ content: { parts: [{ text: 'Context: x', thought: true }, { text: 'კი ბატონო.' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 3 } }));
  const r = await geminiGenerate({ cfg: CFG, systemInstruction: 's', contents: [{ role: 'user', content: 'x' }], maxOutputTokens: 100 });
  assert.deepEqual(r, { text: 'კი ბატონო.', finishReason: 'STOP', usage: { input: 9, output: 3 } });
  assert.deepEqual(fakeClient.last.config.thinkingConfig, { thinkingBudget: 0 }, 'კორექტურა — thinking_budget (0)');
  // ძველი/ყალბი პასუხი ნაწილების გარეშე
  assert.deepEqual(visibleText({ text: 'ძველი', candidates: [{ finishReason: 'STOP' }] }), { text: 'ძველი', thought: false });
  assert.deepEqual(visibleText({ text: 'გადაბმული' }), { text: 'გადაბმული', thought: false });
});

test('§3.3 ისტორია: გაჟონილი პასუხი (წესები 1–2) მოდელს აღარ ეგზავნება, ჟურნალში რჩება; ორი მომხმარებლის შეტყობინება ერთდება', () => {
  const msgs = [
    { role: 'user', content: 'ხელნაწერი მოგიტანეთ.' },
    { role: 'assistant', content: PRODUCTION },
    { role: 'user', content: 'გაიგეთ?' },
    { role: 'assistant', content: 'Context: x.\nSpeaker: y.' },
    { role: 'user', content: 'ბატონო ევგენი?' },
  ];
  const out = historyForServer(msgs, 20);
  assert.deepEqual(out.map((m) => m.content), ['ხელნაწერი მოგიტანეთ.', 'გაიგეთ?', 'ბატონო ევგენი?']);
  assert.equal(msgs.length, 5, 'არაფერი იშლება');
  // ინგლისური ან რემარკიანი ჩვეულებრივი პასუხი რჩება (წესი 3 ისტორიაზე არ მოქმედებს)
  assert.equal(historyForServer([{ role: 'assistant', content: 'Leave it here.' }, { role: 'user', content: 'კარგი' }], 20).length, 2);
  // ორი ზედიზედ მომხმარებლის შეტყობინება — ერთ user-ად
  assert.deepEqual(toGeminiContents(out), [{ role: 'user', parts: [{ text: 'ხელნაწერი მოგიტანეთ.\nგაიგეთ?\nბატონო ევგენი?' }] }]);
});

test('§3.1 public/js/leak.js ბაიტ-ბაიტ ემთხვევა src/leak.js-ს', () => {
  const a = fs.readFileSync(new URL('../../src/leak.js', import.meta.url));
  const b = fs.readFileSync(new URL('../../public/js/leak.js', import.meta.url));
  assert.ok(a.equals(b));
});

test('§2.1 ძველი settings.json (max_output_tokens 180, thinking_budget 0, ახალი გასაღებების გარეშე) → ზღვარი 256 და მაგალითის thinking_policy', async () => {
  const example = JSON.parse(fs.readFileSync(new URL('../../settings.example.json', import.meta.url), 'utf8'));
  assert.equal(example.gemini.visible_output_tokens, 256);
  assert.ok(example.gemini.thinking_policy && typeof example.gemini.thinking_policy === 'object');
  assert.equal(example.gemini.temperature, 0.8, 'ტემპერატურა უცვლელი');
  const old = structuredClone(example);
  delete old.gemini.visible_output_tokens;
  delete old.gemini.thinking_policy;
  Object.assign(old.gemini, { max_output_tokens: 180, thinking_budget: 0, api_key: 'PASTE_YOUR_KEY' });
  old.admin.password = 'old-file-pass';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tianshani-old-'));
  old.logging.db_path = path.join(dir, 'x.db');
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(old, null, 2));
  const saved = process.env.SETTINGS_PATH;
  process.env.SETTINGS_PATH = path.join(dir, 'settings.json');
  try {
    const { loadConfig } = await import('../../src/config.js');
    const cfg = loadConfig();
    assert.equal(cfg.gemini.max_output_tokens, 180, 'ძველი მნიშვნელობა ფაილში რჩება');
    assert.equal(cfg.gemini.visible_output_tokens, 256);
    assert.equal(visibleCap(cfg), 256);
    assert.deepEqual(cfg.gemini.thinking_policy, normalizeThinkingPolicy(example.gemini.thinking_policy));
    assert.notEqual(cfg.gemini.thinking_policy, null);
    // settings.json-ში ახალი გასაღები — ის მოქმედებს
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ ...old, gemini: { ...old.gemini, visible_output_tokens: 300 } }));
    assert.equal(loadConfig().gemini.visible_output_tokens, 300);
  } finally {
    if (saved === undefined) delete process.env.SETTINGS_PATH; else process.env.SETTINGS_PATH = saved;
  }
});

test('§2.1 thinkingFor / outputCap: fixed, adaptive (ტრიგერები), პოლიტიკის გარეშე — thinking_budget; ზღვარი = ხილული + ბიუჯეტი', () => {
  const g = (policy, extra = {}) => ({ gemini: { visible_output_tokens: 256, thinking_budget: 0, thinking_policy: normalizeThinkingPolicy(policy), ...extra } });
  assert.deepEqual(thinkingFor(g(null), {}), { budget: 0, why: 'thinking_budget' });
  assert.deepEqual(thinkingFor(g(null, { thinking_budget: null }), {}), { budget: null, why: 'thinking_budget' });
  assert.equal(thinkingFor(g({ mode: 'fixed', budget: 128 }), {}).budget, 128);
  const ad = g({ mode: 'adaptive', budget: 64, from_user_message: 5, history_tokens_over: 9000, on_actions: true, on_proxy: true, longer_than_chars: 300 });
  assert.equal(thinkingFor(ad, { messageCount: 1 }).budget, 0);
  assert.equal(thinkingFor(ad, { messageCount: 5 }).budget, 64);
  assert.equal(thinkingFor(ad, { messageCount: 1, action: true }).budget, 64);
  assert.equal(thinkingFor(ad, { messageCount: 1, invisible: true }).budget, 64);
  assert.equal(thinkingFor(ad, { messageCount: 1, historyTokens: 9001 }).budget, 64);
  assert.equal(thinkingFor(ad, { messageCount: 1, userChars: 301 }).budget, 64);
  assert.equal(thinkingFor(g({ mode: 'adaptive', budget: 64 }), { messageCount: 9, action: true }).budget, 0, 'მხოლოდ ჩართული ტრიგერები');
  assert.equal(outputCap(ad, 0), 256);
  assert.equal(outputCap(ad, null), 256);
  assert.equal(outputCap(ad, 64), 320);
  assert.equal(visibleCap({ gemini: { max_output_tokens: 180 } }), 180, 'ახალი გასაღების გარეშე — ძველი');
  assert.equal(normalizeThinkingPolicy('x'), null);
});

test('§4.3 OUTPUT ხაზი — საბოლოო ინსტრუქციის ბოლო ხაზი (# ACTION-ის შემდეგაც); buildPrompt-ის სექციები იგივე რიგით', () => {
  const cfg = { game: { start_date: '1983-09-01', days_per_season: 90, seasons: ['autumn', 'winter', 'spring', 'summer'], crack_stages: 5, copies: 3 } };
  const m = summaryForServer(initialCopies(cfg.game, 1));
  const speaker = byId.vaso;
  const history = [{ role: 'user', content: 'ხელნაწერი მოგიტანეთ' }];
  const actionResult = decideAction({ type: 'hand_over', copyId: 1 }, m, speaker).result;
  const { systemInstruction } = buildPrompt({ speaker, gameState: { day: 5, season: 'autumn', crackStage: 0, cycle: 1 }, cfg, stageMode: 'none', pacing: pacingState(history, speaker), userName: 'სანდრო', manuscript: m, actionResult });
  const full = finalInstruction(systemInstruction, speaker);
  assert.equal(full, `${systemInstruction}\n\n${OUTPUT_LINE(speaker.short_name_ka)}`);
  assert.equal(full.split('\n').at(-1), OUTPUT_LINE('ვასო'));
  assert.equal(OUTPUT_LINE('ვასო'), 'OUTPUT: everything you write is shown to the visitor verbatim as ვასო\'s words. Write only the spoken reply (plus at most one stage direction in *…* when allowed), in the user\'s language. Never write notes, plans, rule checks, a summary of the situation, or labels such as "Context:", "Speaker:", "Beat 1:".');
  assert.equal(REJECTED_LINE, 'YOUR PREVIOUS ATTEMPT WAS REJECTED because it contained notes or rule checks instead of speech. Output ONLY the words your character says (plus at most one stage direction in *…* if allowed), in the user\'s language.');
  const order = ['# WORLD', '# GENERAL INSTRUCTIONS', '# YOUR CHARACTER', '# CURRENT STATE OF THE BUILDING', '# THE USER', '# PACING', 'FOR THIS REPLY: no stage direction', '# ACTION', 'OUTPUT: '];
  const idx = order.map((s) => full.indexOf(s));
  assert.ok(idx.every((i) => i >= 0), JSON.stringify(idx));
  assert.deepEqual([...idx].sort((a, b) => a - b), idx, 'რიგი უცვლელია, OUTPUT — ბოლოს');
  assert.ok(full.startsWith(systemInstruction), 'buildPrompt-ის ტექსტი ხელუხლებელია');
});

test('§3.2 (8) mock-ის ჩვეულებრივი პასუხები გამცნობს არასდროს ააქტიურებს (ყველა პერსონაჟი, ქართული/რუსული/ინგლისური)', () => {
  const gs = { day: 100, season: 'winter', crackStage: 3, cycle: 2, paintingFallen: true };
  const qs = ['გამარჯობა', 'ხელნაწერი წაიკითხეთ?', 'გრიშა სად არის?', 'Hello, are you there?', 'Привет, как дела?', 'რა ერქვა ჩემს მოთხრობას?'];
  for (const c of characters) {
    for (const [i, q] of qs.entries()) {
      for (const historyLen of [0, 1, 4]) {
        const invisible = c.reachable ? null : c;
        const speaker = c.reachable ? c : byId.tina;
        const text = composeMockReply({ speaker, invisible, userText: q, historyLen, gameState: gs, manuscriptCount: i, userName: i % 2 ? 'სანდრო' : '' });
        assert.equal(isMetaLeak(text, { expectLang: guessLang(q) }).leak, false, `${c.id}: ${q} → ${text}`);
        // პირველი ხაზიც (სერვერი მას ცალკე ამოწმებს) — წესი 3 მხოლოდ 120 სიმბოლომდე შეკავებით
        const first = text.split('\n')[0];
        const v = isMetaLeak(first, { expectLang: guessLang(q) });
        assert.ok(!v.leak || (v.rule === 3 && first.length < 120), `${c.id}: ${first}`);
      }
    }
  }
  assert.equal(isMetaLeak(MOCK_LEAK_TEXT, { expectLang: 'ka' }).leak, true);
  assert.equal(isMetaLeak(`კარგი.\n${MOCK_LATE_LEAK}`, { expectLang: 'ka' }).leak, true);
  assert.equal(isMetaLeak('კარგი.\n', { expectLang: 'ka' }).leak, false, '„late“ — პირველი ხაზი სუფთაა');
});
