// რეალური Gemini-ს smoke ტესტი (FIXES_ROUND1 §3) — ეშვება მხოლოდ მაშინ, როცა გასაღები არსებობს
// (settings.json → gemini.api_key ან env GEMINI_API_KEY). პასუხები იწერება test-results/real-smoke.json-ში ადამიანის შესაფასებლად.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestServer, chat, cookieJar, userMsg } from '../helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLACEHOLDERS = new Set(['', 'PASTE_YOUR_KEY', 'YOUR_KEY']);

function findKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings.json'), 'utf8'));
    const k = String(s?.gemini?.api_key || '').trim();
    return PLACEHOLDERS.has(k) ? null : k;
  } catch { return null; }
}
function findModel() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'settings.json'), 'utf8')).gemini.model || 'gemini-3.8-flash'; } catch { return 'gemini-3.8-flash'; }
}

const KEY = findKey();
const OUT = path.join(ROOT, 'test-results', 'real-smoke.json');
const log = { ran_at: new Date().toISOString(), model: findModel(), cases: [] };
let S;

before(async () => {
  if (!KEY) return;
  S = await startTestServer({ gemini: { api_key: KEY, mock: false, model: findModel(), thinking_budget: 0 }, limits: { per_client_input_tokens: 10_000_000 } });
});
after(async () => {
  if (S) await S.close();
  if (KEY) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, `${JSON.stringify(log, null, 2)}\n`); }
});

const GS = { day: 44, season: 'autumn', crackStage: 0, lostCopies: 0, cycle: 1 };
const FIRST_PERSON_READ = /(^|[^ა-ჰ])(წავიკითხავ|წავიკითხე)([^ა-ჰ]|$)/;

test('რეალური API: გამყრელიძე „წაიკითხეთ ჩემი მოთხრობა?“ → წარმომადგენელი მესამე პირში, გამყრელიძე სახელით', { skip: !KEY && 'Gemini-ს გასაღები არ არის' }, async () => {
  const jar = cookieJar();
  const r1 = await chat(S.base, { characterId: 'gamkrelidze', messages: userMsg('წაიკითხეთ ჩემი მოთხრობა?'), gameState: GS }, { jar });
  assert.equal(r1.status, 200);
  assert.ok(r1.done, r1.error || 'no done');
  assert.notEqual(r1.done.spoken_by, 'gamkrelidze');
  const proxies = ['soso', 'tina'];
  assert.ok(proxies.includes(r1.done.spoken_by), r1.done.spoken_by);
  // მეორე შეტყობინება (ისტორიით): წარმომადგენელმა უნდა გაიხსენოს, რომ გამყრელიძე ისევ არ არის
  const msgs = [{ role: 'user', content: 'წაიკითხეთ ჩემი მოთხრობა?' }, { role: 'assistant', content: r1.reply }, { role: 'user', content: 'კარგი, მაშინ როდის მოვიდე?' }];
  const r2 = await chat(S.base, { characterId: 'gamkrelidze', messages: msgs, gameState: GS, lastSpokenBy: r1.done.spoken_by }, { jar });
  for (const [i, r] of [r1, r2].entries()) {
    log.cases.push({
      case: `gamkrelidze #${i + 1}`,
      user: i === 0 ? 'წაიკითხეთ ჩემი მოთხრობა?' : 'კარგი, მაშინ როდის მოვიდე?',
      spoken_by: r.done?.spoken_by,
      reply: r.reply,
      checks: {
        mentions_gamkrelidze: /გამყრელიძ/.test(r.reply),
        has_stage_direction: /\*[^*]+\*/.test(r.reply),
        starts_with_stage_direction: /^\s*\*/.test(r.reply),
        first_person_reading_phrase: FIRST_PERSON_READ.test(r.reply), // ადამიანის შესაფასებელი: თუ true, ეხება თუ არა თავად წარმომადგენელს
      },
      usage: r.done?.usage,
    });
  }
  // მკაცრი: პირველ პასუხში გამყრელიძე სახელით (ნებისმიერი ბრუნვა)
  assert.match(r1.reply, /გამყრელიძ/, `პასუხში გამყრელიძე არ არის: ${r1.reply}`);
  // მკაცრი: უხილავის პირველ პირში არ ლაპარაკობს („მე, გამყრელიძე…“)
  assert.doesNotMatch(r1.reply, /მე\s*,?\s*გამყრელიძე/);
});

test('რეალური API: ვაჟა ზაზაევიჩი — რემარკები (* *) და თარიღი; პასუხი სრულია', { skip: !KEY && 'Gemini-ს გასაღები არ არის' }, async () => {
  const replies = [];
  // ნეიტრალური კითხვები (არა ტელეფონზე) — რემარკების სიხშირის პატიოსანი გაზომვა (სერვერი ~55%-ში „არა“-ს ეუბნება)
  for (const q of ['ბატონო ვაჟა, ჩემი მოთხრობა წაიკითხეთ?', 'რა თარიღია დღეს, ბატონო ვაჟა?', 'ფეხბურთი გიყვართ, ბატონო ვაჟა?', 'რას ფიქრობთ ახალ შენობაზე?', 'ბზარი გაიზარდა, ხომ ხედავთ?', 'თინა სად არის?']) {
    const r = await chat(S.base, { characterId: 'director', messages: userMsg(q), gameState: GS });
    assert.equal(r.status, 200);
    assert.ok(r.done, r.error || 'no done');
    assert.ok(r.reply.trim().length > 10);
    replies.push({ q, r });
    // ტელეფონის საუბარი რემარკის გარეთ („დიახ, დიახ, კი, კი“ ვარსკვლავების გარეშე) — ის, რაც §2-მა უნდა გამოასწოროს
    const outside = r.reply.split('*').filter((_, i) => i % 2 === 0).join(' ');
    log.cases.push({
      case: 'director', user: q, spoken_by: r.done.spoken_by, reply: r.reply,
      checks: {
        has_stage_direction: /\*[^*]+\*/.test(r.reply),
        unbalanced_asterisks: (r.reply.match(/\*/g) || []).length % 2 === 1,
        unmarked_phone_talk: /დიახ,\s*დიახ,\s*კი,\s*კი/.test(outside),
      },
      usage: r.done.usage,
    });
  }
  // სცენური რემარკა სამიდან ერთში მაინც (წესი: 30–50%) — რბილი შემოწმება ლოგში; აქ მხოლოდ ინფორმაციულად
  log.director_stage_ratio = replies.filter(({ r }) => /\*[^*]+\*/.test(r.reply)).length / replies.length;
  log.director_unmarked_phone = log.cases.filter((c) => c.case === 'director' && c.checks.unmarked_phone_talk).length;
});

// ---------- Round 3 §4 + §1: კორექტურა (ვასო ×3, თამარი ×2), სახელით მიმართვა ----------

test('რეალური API (Round 3 §4): ვასო ×3, თამარი ×2 — ორიგინალი/შესწორებული წყვილები; საბოლოო პასუხში არარსებული სიტყვა არ არის; „ნინო“ — არა „სოსო“', { skip: !KEY && 'Gemini-ს გასაღები არ არის' }, async () => {
  const { findNonWords } = await import('../../src/georgian.js');
  const Q = [
    ['vaso', 'როგორ ხართ, ბატონო ვასო? რას შვრებით დღეს?'],
    ['vaso', 'ეს სურათი რამდენი ხანია აქ კიდია?'],
    ['vaso', 'ჩემს მოთხრობას როდის წაიკითხავთ?'],
    ['tamari', 'ქალბატონო თამარ, როგორ ბრძანდებით?'],
    ['tamari', 'ჰონორარი როდის იქნება, ხომ არ იცით?'],
  ];
  log.proofread = [];
  for (const [id, q] of Q) {
    const jar = cookieJar();
    const r = await chat(S.base, { characterId: id, messages: userMsg(q), gameState: GS, userName: 'ნინო' }, { jar });
    assert.equal(r.status, 200);
    assert.ok(r.done, r.error || 'no done');
    const replaced = r.events.find((e) => typeof e.replace === 'string')?.replace || null;
    const final = replaced || r.reply;
    const row = S.store.db.prepare("SELECT content, proofread_original, proofread_changed FROM messages WHERE client_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1").get(jar.get('tianshani_cid'));
    log.proofread.push({
      character: id, user: q, original: r.reply, proofread: replaced, changed: Boolean(replaced), status: r.done.proofread,
      usage: r.done.usage, cached_tokens: r.done.cached_tokens,
      checks: { non_words: findNonWords(final), mentions_name: final.includes('ნინო'), calls_soso: /ჩემო სოსო|,\s*სოსო[,!?.]/.test(final) },
    });
    assert.ok(['changed', 'unchanged'].includes(r.done.proofread), `კორექტურა არ შესრულდა: ${r.done.proofread}`);
    assert.deepEqual(findNonWords(final), [], final);
    assert.equal(row.content, final, 'ლოგში — საბოლოო ტექსტი');
    if (replaced) { assert.equal(row.proofread_original, r.reply); assert.equal(row.proofread_changed, 1); }
    assert.doesNotMatch(final, /ჩემო სოსო/, `მომხმარებელს სოსოს ეძახის: ${final}`);
    // ვასოს პირში თამარის იმერული ფორმები არ უნდა იყოს (FIXES_ROUND3 §4 — „რავა ვიქნები“)
    if (id === 'vaso') assert.doesNotMatch(final, /(^|[^ა-ჰ])(რავა|რაფერ|ბოშო|ისთევლე)([^ა-ჰ]|$)/, `ვასო სხვის კილოზე: ${final}`);
  }
});

// ---------- Round 2 §8: ტემპი — 5 შეტყობინება ბელასთან ----------

/** საუბრის ნაწილი (რემარკების გარეშე) → წინადადებები: . ! ? ან ახალი ხაზი; მრავალწერტილი („…“) წინადადებას არ ყოფს. */
export function sentences(reply) {
  const speech = reply.replace(/\*[^*]*\*/g, '\n').replace(/^\s*\([^)]*\)/gm, '\n');
  return speech.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => (s.match(/[ა-ჰA-Za-zА-я]/g) || []).length >= 3);
}

test('რეალური API (Round 2 §8): ბელა — „როგორ ხარ?“, 2 × ხელნაწერი, ამინდი, ხელნაწერი; ≤3 წინადადება, ფრაზა არ მეორდება, ამინდზე გადამისამართება/საბაბი არ არის', { skip: !KEY && 'Gemini-ს გასაღები არ არის' }, async () => {
  const { byId, nameStems } = await import('../../src/characters.js');
  const { phraseCore } = await import('../../src/pacing.js');
  const bela = byId.bela;
  const QUESTIONS = [
    'როგორ ხარ?',
    'ერთი მოთხრობა მაქვს, „ცისფერი მთები ანუ ტიან-შანი“. წაიკითხავ?',
    'ჩემი ხელნაწერი რომ დაგიტოვე, დაიწყე კითხვა?',
    'რა ამინდია გარეთ? მგონი თოვს.',
    'მაინც, ჩემს მოთხრობას როდის წაიკითხავ?',
  ];
  const EXCUSE = /მივდივარ|არ მცალია|მიმართეთ/;
  const redirectNames = bela.redirects_to.flatMap((id) => nameStems(byId[id])).filter((s) => !nameStems(bela).includes(s) && !['წიგნშ', 'ნაწილი', 'ხელმძღვანელ'].includes(s));
  const jar = cookieJar();
  const msgs = [];
  const turns = [];
  for (const [i, q] of QUESTIONS.entries()) {
    msgs.push({ role: 'user', content: q });
    const r = await chat(S.base, { characterId: 'bela', messages: msgs, gameState: GS }, { jar });
    assert.equal(r.status, 200);
    assert.ok(r.done, r.error || 'no done');
    msgs.push({ role: 'assistant', content: r.reply });
    const sents = sentences(r.reply);
    const usedPhrases = bela.catchphrases_ka.filter((c) => r.reply.includes(phraseCore(c)));
    const namesRedirect = redirectNames.some((s) => r.reply.includes(s));
    turns.push({ n: i + 1, q, r, sents, usedPhrases, namesRedirect });
    log.cases.push({
      case: `bela pacing #${i + 1}`, user: q, spoken_by: r.done.spoken_by, reply: r.reply,
      checks: {
        sentences: sents.length,
        lines: r.reply.split('\n').filter((l) => l.trim()).length,
        catchphrases_used: usedPhrases.map(phraseCore),
        names_redirect_target: namesRedirect,
        suggested_redirect: r.done.suggested_redirect,
        excuse_keywords: EXCUSE.test(r.reply),
      },
      usage: r.done.usage,
    });
  }
  log.bela_pacing = turns.map((t) => ({ n: t.n, sentences: t.sents.length, redirect: t.r.done.suggested_redirect, names_redirect: t.namesRedirect }));

  for (const t of turns) assert.ok(t.sents.length <= 3, `#${t.n}: ${t.sents.length} წინადადება — ${t.r.reply}`);
  // ერთი და იგივე ცნობილი ფრაზა ჩატში ორჯერ არ მეორდება
  const seen = new Map();
  for (const t of turns) for (const p of t.usedPhrases) { assert.ok(!seen.has(p), `„${p}“ განმეორდა: #${seen.get(p)} და #${t.n}`); seen.set(p, t.n); }
  // ამინდი (მე-4): არც გადამისამართება, არც საბაბი
  const weather = turns[3];
  assert.equal(weather.r.done.suggested_redirect, null);
  assert.ok(!EXCUSE.test(weather.r.reply), `ამინდზე საბაბი: ${weather.r.reply}`);
  // „გადამისამართება“ ტექსტში = სხვასთან გაგზავნა (ქმრის ხსენება თავისთავად გადამისამართება არ არის — ის მხოლოდ ლოგშია)
  const SEND_AWAY = /(თან|სთან)\s+(მიდი|მიბრძანდი|შეიხედე|შეიარე|შეუხვიე|დატოვე|გადადი|მიიტანე|წაიღე|ჰკითხე)|მიმართე|(ასთან|სთან|თან)[^.!?\n]{0,25}(მიდი|გადადი|შეიარე)/;
  assert.ok(!SEND_AWAY.test(weather.r.reply), `ამინდზე გადამისამართება: ${weather.r.reply}`);
  // გადამისამართება (თუ არის) — არა უადრეს მე-3 პასუხისა; ღილაკი — მხოლოდ ≥3 ხელნაწერის შეტყობინებაზე (მე-5)
  for (const t of turns.slice(0, 2)) assert.ok(!SEND_AWAY.test(t.r.reply), `#${t.n}: ადრეული გადამისამართება — ${t.r.reply}`);
  for (const t of turns.slice(0, 4)) assert.equal(t.r.done.suggested_redirect, null, `#${t.n}`);
});
