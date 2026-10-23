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
