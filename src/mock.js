// MOCK პროვაიდერი: როცა Gemini-ს გასაღები არ არის. პასუხს აწყობს characters.json-ის მონაცემებიდან
// (sample_dialogues, excuse_repertoire_ka, catchphrases_ka) და სტრიმავს სიტყვა-სიტყვით — იგივე ინტერფეისით, რაც gemini.js.
import { byId, characters, manuscriptBehaviour } from './characters.js';
import { ABSENCE_FACTS_KA } from './prompt.js';
import { isManuscriptMessage } from './pacing.js';
import { findMentions } from './names.js';
import { toward } from '../public/js/names.js';
import { guessLang, mentionsManuscript } from './lang.js';

const SEASON_LINES = {
  autumn: ['ფოთლები ცვივა, საწვიმარი არ დაგრჩეს.', 'შემოდგომაა, ყველაფერი თავიდან იწყება.'],
  winter: ['ცივა დღეს, ქურქი არ გამიხდია.', 'როგორ თოვს, ხომ ხედავ.'],
  spring: ['კაპრემონტს გვპირდებიან გაზაფხულზე.', 'ბათქაში ცვივა, ფრთხილად იარე.'],
  summer: ['სიცხეა, ფანჯარას ნუ გააღებ — მოტობურთის მტვერი შემოვა.', 'ეს შენობა რაღაცას ტკაცუნობს.'],
};
const CRACK_LINES = ['ეს ბზარი იყო აქ?', 'ბზარი გაიზარდა, არა?'];
const NEW_BUILDING = 'ახალ შენობაში ვართ, ყველაფერი თავიდან.';
const PAINTING_LINES = {
  vaso: 'სურათი ჩამოვარდა! ხომ ვამბობდი, ოცდაშვიდი წელია ვამბობ!',
  grisha: 'სურათი ჩამოვარდა? ვინ მოგცათ ჩამოვარდნის უფლება!',
  mikho: 'ჩამოვარდა… მარტო ხომ ვერ ავწევ.',
};

// სცენური რემარკები (*…*) — პერსონაჟის რეალური საქმიანობიდან; ტესტები ამოწმებენ, რომ .stage ელემენტები ჩანს და * არ ჩანს
const STAGE_LINES = {
  director: '*(ყურმილს იღებს) დიახ, დიახ, კი, კი, გისმენთ… არა, შენ არა, ყურმილს ვეუბნები.*',
  vaso: '*(სურათს ახედავს, მაგიდას სულს უბერავს)*',
  marksheideri: '*(კედელს თითით ეხება, ბზარს აკვირდება)*',
  irodioni: '*(სეიფს ხელს უტყაპუნებს)*',
  tamari: '*(სიგარეტს ეძებს, თავზე ხელს იდებს)*',
  grisha: '*(უწყისებს ფურცლავს)*',
  mikho: '*(კიბეს მხარზე იდებს)*',
  bela: '*(ყურმილს აიღებს) ალო, ბავშვი გამოიყვანეთ? კარგი, კარგი.*',
  tina: '*(ტელეფონი რეკავს) დიახ, გისმენთ. არა, არ არი.*',
  otari: '*(შაბიამნის ტომრებს გვერდით გადადებს, ხელებს ერთმანეთზე დაიბერტყავს)*',
  shukri: '*(ნაბდის ქუდს ისწორებს, წიგნს მაგიდის ქვეშ მალავს)*',
  two_big_men: '*(კარზე აკაკუნებენ, გასაღებების რგოლს ატრიალებენ)*',
};
const STAGE_PROXY = '*(დერეფანში გამოდის, კარს უყურებს)*';

/** ყველა ჩაშენებული ქართული ფრაზა (Round 3 §4: unit ტესტი ამოწმებს, რომ არარსებული სიტყვა არ გვხვდება). */
export const MOCK_STRINGS = [
  ...Object.values(SEASON_LINES).flat(), ...CRACK_LINES, NEW_BUILDING, ...Object.values(PAINTING_LINES),
  ...Object.values(STAGE_LINES), STAGE_PROXY,
];

/** რემარკა მოსაუბრისთვის; თუ ცხრილში არ არის — persona_ka.real_activity-დან. */
export function stageFor(speaker) {
  if (STAGE_LINES[speaker.id]) return STAGE_LINES[speaker.id];
  const act = (speaker.persona_ka?.real_activity || '').split(/[,.;]/)[0].trim();
  return act ? `*(${act})*` : '*(ფანჯარაში იყურება)*';
}

// არაქართულ შეტყობინებაზე — პასუხი იმავე ენაზე, ცნობილი ფრაზა ქართულად რჩება
const FOREIGN = {
  en: (name) => `Excuse me, I am terribly busy right now — ${name} has a lot of work, you understand. Leave it here, we will see later.`,
  ru: (name) => `Извините, я сейчас очень занят — у ${name} много работы, понимаете. Оставьте здесь, потом посмотрим.`,
  other: (name) => `Excuse me — ${name} is very busy right now. Leave it here, we will see later.`,
};
const FOREIGN_ABSENT = {
  en: (n) => `${n} is not here right now, please wait — they will be back soon.`,
  ru: (n) => `${n} сейчас нет на месте, подождите — скоро вернётся.`,
  other: (n) => `${n} is not here right now, please wait.`,
};

/** მარტივი დეტერმინისტული ჰეში — ერთსა და იმავე მესიჯზე მსგავსი, მაგრამ ისტორიით ცვალებადი პასუხი. */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = (arr, n) => (arr.length ? arr[n % arr.length] : '');

/** ინგლისური მოკლე სახელი: "Vazha Zazaevich — the Director" → "Vazha Zazaevich". */
const enShort = (c) => (c.name_en || c.id).split(/\s[—(]|\s\(/)[0].trim();

/** მიცემითი ბრუნვა: ოთარი → ოთარს, თინა → თინას, ვაჟა ზაზაევიჩი → ვაჟა ზაზაევიჩს. */
export function dative(name) {
  return name.endsWith('ი') ? `${name.slice(0, -1)}ს` : `${name}ს`;
}

/** სცენარის ფორმატი (Round 2 §8): ყოველი წინადადება ახალ ხაზზე. ფრჩხილების/ვარსკვლავების შიგნით არ ვყოფთ. */
export function scriptLines(text) {
  let depth = 0;
  let out = '';
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '„') depth++;
    if ((ch === ')' || ch === '“') && depth > 0) depth--;
    if (depth === 0 && /[.!?]/.test(ch) && s[i + 1] === ' ' && /\S/.test(s[i + 2] || '') && !/[.!?…]/.test(s[i + 2])) {
      out += `${ch}\n`;
      i++; // სივრცე ქრება
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * აწყობს mock პასუხის ტექსტს. Round 2 §8: ხაზები \n-ით (როგორც რეალურ მოდელს ვთხოვთ), ერთი იდეა + მაქს. ერთი გარემოს შტრიხი,
 * გადამისამართება მხოლოდ ხელნაწერზე მე-3 შეტყობინებიდან (manuscriptCount ≥ 3).
 */
/**
 * Round 6 §4 (ტესტებისთვის): თუ მომხმარებელი სათაურს კითხულობს („რა ერქვა…?“) და ადრე, ამ ჩატის ისტორიაში, ბრჭყალებში
 * სათაური დაწერა — mock მას იმეორებს. ასე ინტეგრაციის ტესტი ამტკიცებს, რომ ისტორია სერვერამდე მართლა მიდის.
 */
export function recallTitle(userText, history = []) {
  if (!/(სათაურ|ერქვა|ჰქვია)[^?]*\?|\?.*(სათაურ|ერქვა|ჰქვია)/.test(String(userText || ''))) return null;
  for (const m of history) {
    if (m?.role !== 'user') continue;
    const t = String(m.content || '').match(/„([^“„]{2,60})“/);
    if (t) return t[1].trim();
  }
  return null;
}

/**
 * Round 7 §1 (ტესტებისთვის): თუ მომხმარებელი სახელით ახსენებს სხვა პერსონაჟს („გრიშა სად არის?“), mock იქ აგზავნის —
 * „გრიშასთან ჩაიარეთ.“ — ასე ტესტი დეტერმინისტულად იღებს პასუხს, რომელიც სახელს ასახელებს (→ suggested_redirect).
 */
export function sendTo({ speaker, invisible, userText }) {
  const ids = characters.filter((c) => c.id !== speaker.id && c.id !== invisible?.id).map((c) => c.id);
  const found = findMentions(userText, ids, speaker.id);
  return found.length ? found[found.length - 1].id : null;
}

// Round 8 §7.5: ეგზემპლარების ფრაზები (ცხრილის თესლების გარდა)
export const MOCK_NOBODY_GAVE = 'ჩემთვის არავის არაფერი მოუცია.';
export const MOCK_STRAY_PAGES = 'რაღაც ფურცლები მიდევს მაგიდაზე, არ ვიცი ვისია.';
MOCK_STRINGS.push(MOCK_NOBODY_GAVE, MOCK_STRAY_PAGES);

/** მოქმედების პასუხი: თესლი სიტყვასიტყვით + ერთი შტრიხი; not_returned ხილულ პერსონაჟზე → „<სახელი>-სთან ჩაიარეთ.“ */
function actionParts({ speaker, actionResult, gameState, h }) {
  const B = manuscriptBehaviour[speaker.id] || {};
  const seed = {
    accepted: B.accept_ka, refused: actionResult.reason_ka || B.refuse_ka, returned: B.return_ka, not_returned: actionResult.reason_ka,
  }[actionResult.outcome];
  const parts = [stageFor(speaker), scriptLines(seed || '…'), pick(SEASON_LINES[gameState.season] || [], h >>> 5)];
  const to = actionResult.outcome === 'not_returned' ? actionResult.to : null;
  if (to && byId[to]?.reachable) parts.push(`${toward(byId[to].short_name_ka)} ჩაიარეთ.`);
  return parts;
}

/** Round 9 §1: მოქმედების შეტყობინებაში რემარკის (*…*) შემდეგ დაწერილი სიტყვები; არ არის → ''. */
export function actionExtraText(userText) {
  return String(userText || '').replace(/^\s*\*[^*]*\*/, '').trim();
}

/** მოსაუბრეს ეგზემპლარი აქვს და ხელნაწერზე ეკითხებიან → მისი ბოლო სიტყვა მასზე (ან პირველი „stalled“ საბაბი). */
function holderLine(speaker, manuscript) {
  const c = manuscript?.copies.find((x) => x.status === 'held' && x.holder === speaker.id);
  if (!c) return null;
  const own = c.events.filter((e) => e.actor === speaker.id && e.day >= c.givenDay).at(-1);
  return own?.text_ka || (manuscriptBehaviour[speaker.id]?.events || []).find((e) => e.kind === 'stalled')?.text_ka || null;
}

export function composeMockReply({ speaker, invisible, userText, historyLen, gameState, manuscriptCount = 0, userName = '', history = [], manuscript = null, actionResult = null }) {
  const h = hash(`${speaker.id}|${userText}|${historyLen}`);
  const parts = actionResult
    ? actionParts({ speaker, actionResult, gameState, h })
    : composeParts({ speaker, invisible, userText, historyLen, gameState, manuscriptCount });
  // Round 9 §1: მოქმედებას მომხმარებლის სიტყვები მოჰყვა (რემარკის შემდეგ) → თესლის შემდეგ ჩვეულებრივი პასუხის ხაზი მათზე
  const extra = actionResult ? actionExtraText(userText) : '';
  if (extra) {
    const reply = composeParts({ speaker, invisible, userText: extra, historyLen, gameState, manuscriptCount })[1];
    if (reply) parts.splice(2, 0, reply);
  }
  if (!actionResult && !invisible && isManuscriptMessage(userText) && ['ka', 'unknown'].includes(guessLang(userText))) {
    // ჯაჭვი არ შედგა → T-მ არაფერი იცის; მფლობელი → თავისი ამბავი (ხელნაწერის ხაზის ნაცვლად)
    const failed = manuscript?.copies.some((c) => c.claim && c.claim.to === speaker.id && c.claim.arrived === false);
    const line = failed ? MOCK_NOBODY_GAVE : holderLine(speaker, manuscript);
    if (line) parts.splice(1, 1, line);
  }
  if (historyLen === 0 && !invisible && manuscript?.strayPages.some((p) => p.character === speaker.id)) parts.push(MOCK_STRAY_PAGES);
  const to = actionResult ? null : sendTo({ speaker, invisible, userText });
  if (to) parts.push(`${toward(byId[to].short_name_ka)} ჩაიარეთ.`);
  const title = recallTitle(userText, history);
  if (title) {
    const i = parts.findIndex((p) => p && !/^[*(]/.test(p));
    parts.splice(i >= 0 ? i : parts.length, 0, `„${title}“ — ასე ერქვა, ხომ?`);
  }
  // Round 3 §1: სახელით მიმართვა (e2e ამოწმებს, რომ სახელი პასუხამდე აღწევს) — პირველ სასაუბრო ხაზს ემატება
  if (userName) {
    const i = parts.findIndex((p) => p && !/^[*(]/.test(p)); // რემარკა არა
    if (i >= 0) parts[i] = `${userName}, ${parts[i]}`;
  }
  return parts.filter(Boolean).join('\n');
}

function composeParts({ speaker, invisible, userText, historyLen, gameState, manuscriptCount }) {
  const h = hash(`${speaker.id}|${userText}|${historyLen}`);
  const lang = guessLang(userText);
  const catchphrase = pick(speaker.catchphrases_ka || [], h >>> 3);
  const parts = [];

  if (invisible) {
    // წარმომადგენელი (Round 1 §3): მხოლოდ უხილავზე, მესამე პირში — სად არის, რატომ არ არის, სად წავიდეს მომხმარებელი.
    // წარმომადგენლის საკუთარ „ხელნაწერზე რეაქციას“ აქ არ ვამატებთ — სწორედ ეს აბნევდა მომხმარებელს.
    if (historyLen < 2) parts.push(STAGE_PROXY);
    const absence = (ABSENCE_FACTS_KA[invisible.id] || `${invisible.short_name_ka} არ არის.`).split(';')[0].trim();
    if (lang !== 'ka' && lang !== 'unknown') {
      parts.push((FOREIGN_ABSENT[lang] || FOREIGN_ABSENT.other)(enShort(invisible)));
      return parts;
    }
    parts.push(`${absence}.`.replace(/\.\.$/, '.'), `${invisible.short_name_ka} ისევ არ ჩანს — დაელოდეთ, ან სხვას ჰკითხეთ.`);
    if ((h & 1) === 0) parts.push(pick(SEASON_LINES[gameState.season] || [], h >>> 5));
    const doors = (speaker.redirects_to || []).filter((id) => byId[id] && byId[id].reachable && id !== invisible.id);
    parts.push(doors.length ? `${dative(byId[pick(doors, h >>> 9)].short_name_ka)} მიმართეთ.` : 'ხელნაწერი თინასთან დატოვეთ.');
    return parts;
  }
  parts.push(stageFor(speaker));

  if (lang !== 'ka' && lang !== 'unknown') {
    parts.push((FOREIGN[lang] || FOREIGN.other)(enShort(speaker)));
    if (catchphrase) parts.push(catchphrase);
    return parts;
  }

  const dialogues = speaker.sample_dialogues || [];
  const aboutManuscript = mentionsManuscript(userText);
  if (aboutManuscript) {
    const d = dialogues.find((x) => mentionsManuscript(x.user)) || dialogues[0];
    const excuse = pick(speaker.excuse_repertoire_ka || [], h);
    parts.push(scriptLines(historyLen % 2 === 0 && d ? d.assistant : (excuse || d?.assistant || catchphrase)));
  } else {
    const pool = [...dialogues.map((d) => d.assistant), ...(speaker.excuse_repertoire_ka || [])];
    parts.push(scriptLines(pick(pool, h) || catchphrase || '…'));
  }

  // გარემო: მაქსიმუმ ერთი შტრიხი (ტემპი — ერთი იდეა პასუხზე)
  const env = [
    gameState.cycle > 1 && historyLen < 2 ? NEW_BUILDING : null,
    gameState.paintingFallen && (h & 8) === 0 ? (PAINTING_LINES[speaker.id] || 'სურათი ჩამოვარდა, გაიგეთ?') : null,
    gameState.crackStage >= 2 && (h & 2) === 0 ? pick(CRACK_LINES, h >>> 7) : null,
    (h & 1) === 0 ? pick(SEASON_LINES[gameState.season] || [], h >>> 5) : null,
  ].find(Boolean);
  if (env) parts.push(env);

  // გადამისამართება სახელით — მხოლოდ ხელნაწერზე მე-3 შეტყობინებიდან
  const redirects = (speaker.redirects_to || []).filter((id) => byId[id] && id !== invisible?.id);
  if (redirects.length && manuscriptCount >= 3) {
    const r = byId[pick(redirects, h >>> 9)];
    parts.push(`${dative(r.short_name_ka)} მიმართეთ.`);
  }
  return parts;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Round 10 §3.2 / §6: ტესტის ჩამრთველები (gemini.mock_leak, gemini.mock_truncate) ----------

/** წარმოების „გაჟონილი“ პასუხი (FIXES_ROUND10 §1) — mock_leak: "first" | "always". */
export const MOCK_LEAK_TEXT = 'Context: User says they have no copies left of their manuscript, but will keep it in mind for the future.\nSpeaker: მარკშეიდერი (ბატონი ევგენი).\nRules check:\n- Language: Georgian.\n- User: სანდრო (use „ბატონო სანდრო“ / „თქვენ“).\n- Manuscript message count: this is turn 2 about manuscript. Gate: engage, no redirects yet (REDIRECT GATE: < 3).';
/** mock_leak: "late" — ნორმალური პასუხის შემდეგ, მეორე ხაზიდან. */
export const MOCK_LATE_LEAK = 'Rules check:\n- Language: Georgian.';
/** mock_truncate — max_output_tokens-ზე მოჭრილი ბოლო (სრული წინადადების გარეშე). */
export const MOCK_TRUNCATED_TAIL = 'ისე, ჯერ ეს ბიძგი გავარკვიოთ, მერე';

const mockUsage = (systemInstruction, contents, text) => ({
  input: Math.ceil((systemInstruction.length + contents.reduce((n, c) => n + c.content.length, 0)) / 4),
  output: Math.ceil(text.length / 3),
});

function replyFor({ contents, speaker, invisible, userText, gameState, historyLen: convLen, manuscriptCount = 0, userName = '', manuscript = null, actionResult = null }) {
  // საუბრის სიგრძე few-shot-ის გარეშე (წინა შეტყობინებების რაოდენობა); ძველი გამოძახებისთვის — contents.length
  const historyLen = Number.isInteger(convLen) ? convLen : contents.length;
  // საუბარი few-shot-ის გარეშე: ბოლო historyLen + 1 (მიმდინარე) ელემენტი — წინა შეტყობინებები, ისევე როგორც მოდელი იღებს
  const history = contents.slice(Math.max(0, contents.length - historyLen - 1), -1);
  return composeMockReply({ speaker, invisible, userText, historyLen, gameState, manuscriptCount, userName, history, manuscript, actionResult });
}

/**
 * იგივე ინტერფეისი, რაც gemini.streamChat: async generator → { delta } ... { finishReason } ... ბოლოს { usage }.
 * leak / truncate — Round 10-ის ტესტის ჩამრთველები (ჩვეულებრივ null / false — პასუხი იგივეა, რაც ადრე).
 */
export async function* mockStream({ systemInstruction, contents, signal, leak = null, truncate = false, ...args }) {
  let text = replyFor({ contents, ...args });
  let finishReason = 'STOP';
  if (leak === 'first' || leak === 'always') {
    text = MOCK_LEAK_TEXT;
    // რეალური სტრიმივით usageMetadata თავიდანვე — შეწყვეტილი ცდის ტოკენებიც ითვლება
    yield { usage: mockUsage(systemInstruction, contents, text) };
  } else if (leak === 'late') {
    text = `${text}\n${MOCK_LATE_LEAK}`;
  }
  if (truncate) { text = `${text}\n${MOCK_TRUNCATED_TAIL}`; finishReason = 'MAX_TOKENS'; }
  const delay = Number(process.env.MOCK_DELAY_MS ?? 25);
  // სიტყვა + მისი მომდევნო სივრცე ერთ delta-დ
  const words = text.match(/\S+\s*/g) || [text];
  for (const w of words) {
    if (signal?.aborted) return;
    yield { delta: w };
    if (delay) await sleep(delay);
  }
  yield { finishReason };
  yield { usage: mockUsage(systemInstruction, contents, text) };
}

/** Round 10 §3.2: ხელახალი გენერაცია (არასტრიმინგული, geminiGenerate-ის ფორმით) — სუფთა პასუხი; "always" — ისევ გაჟონილი. */
export async function mockGenerate({ systemInstruction, contents, leak = null, ...args }) {
  const text = leak === 'always' ? MOCK_LEAK_TEXT : replyFor({ contents, ...args });
  return { text, finishReason: 'STOP', usage: mockUsage(systemInstruction, contents, text) };
}
