// კორექტურის მეორე გავლა (FIXES_ROUND3 §4): მთავარი პასუხის სტრიმინგის შემდეგ — იაფი, არასტრიმინგული Gemini-ს გამოძახება,
// რომელიც მხოლოდ მართლწერას/გრამატიკას/ბრუნვებს/არარსებულ სიტყვებს ასწორებს. დიალექტი და ტერმინები — დაშვებულთა სიაში.
import { world, characters } from './characters.js';
import { geminiGenerate } from './gemini.js';
import { guessLang } from './lang.js';

/** ფილმის/წიგნის ლექსიკა — სწორია, არ „სწორდება“. */
export const FILM_LEXICON = [
  'სესხბანკი', 'მშენბანკი', 'მარკშეიდერი', 'კაპრემონტი', 'ზავხოზი', 'მოტობურთი', 'გრენლანდია', 'ტიან-შანი', 'ტიანშანი',
  'შაბიამანი', 'ციხისძირი', 'კომისარიატი', 'პაჟარია', 'კომსი-კომსა', 'მერსი', 'პარდონ',
];

const SPLIT = /[\s,.!?…;:—–"„“()*]+/;

/** „…“ ბრჭყალებში ჩასმული ფორმები speech_style-დან (მაგ. „ბოშო“, „რავა“, „ქე“). */
function quoted(s) {
  return [...String(s || '').matchAll(/„([^“]+)“/g)].map((m) => m[1].trim());
}

function words(phrases) {
  const out = [];
  for (const p of phrases) for (const w of String(p).split(SPLIT)) if (w.length >= 2 && /[ა-ჰ]/.test(w)) out.push(w);
  return out;
}

/**
 * დაშვებულთა სია ამ პერსონაჟისთვის: მისი საკუთარი დიალექტი/ფორმულები/ფრაზები (speech_style-ის „…“, recurring_formulae_ka,
 * catchphrases_ka) + საერთო რუსიციზმები და ბიუროკრატიული ლექსიკა + ფილმის ტერმინები + სახელები.
 * სხვა პერსონაჟის დიალექტი აქ არ ხვდება (მაგ. თამარის „რავა“ ვასოსთვის).
 */
export function allowlistFor(speaker) {
  const p = speaker?.persona_ka || {};
  const idiom = world.shared_idiom_ka || {};
  const set = new Set([
    ...words(quoted(p.speech_style)),
    ...words(speaker?.recurring_formulae_ka || []),
    ...words(speaker?.catchphrases_ka || []),
    ...(idiom.russianisms || []),
    ...(idiom.bureaucratic_lexicon || []),
    ...FILM_LEXICON,
    ...words(characters.map((c) => c.short_name_ka)),
  ]);
  return [...set];
}

/** დიალექტური (იმერული) ფორმები, რომლებიც მონაცემებში მხოლოდ თამარს აქვს ჩამოწერილი. */
export const DIALECT_FORMS = ['რავა', 'რაფერ', 'ბოშო', 'ქე', 'გაქვენ', 'ისთევლე'];

/**
 * ამ პერსონაჟისთვის აკრძალული დიალექტური ფორმები (Round 3 §4: ვასომ „რავა ვიქნები“ თქვა, თუმცა ეს თამარის მეტყველებაა).
 * ვისაც საკუთარ მონაცემებში ≥ 2 ასეთი ფორმა უწერია (თამარი) — მისი კილოა, არაფერი იკრძალება.
 */
export function forbiddenDialectFor(speaker) {
  const own = new Set(allowlistFor(speaker));
  const mine = DIALECT_FORMS.filter((w) => own.has(w));
  return mine.length >= 2 ? [] : DIALECT_FORMS.filter((w) => !own.has(w));
}

/** კორექტორის ინსტრუქცია (სპეცის ტექსტი + დაშვებულთა სია). */
export function proofreadInstruction(allowlist, forbidden = []) {
  const lines = [
    `Proofread this Georgian text. Fix only spelling, grammar, case endings and non-existent words. Keep all names, dialect words from this list [${allowlist.join(', ')}], stage directions in asterisks, line breaks and meaning exactly as they are. Return only the corrected text.`,
  ];
  // სხვისი კილო ამ პერსონაჟის პირში — სტანდარტული ფორმით (მაგ. ვასოს „რავა“ → „როგორ“)
  if (forbidden.length) lines.push(`These dialect forms do not belong to this speaker — replace each with its standard literary Georgian equivalent: ${forbidden.join(', ')}.`);
  lines.push('Do not add, remove or reorder sentences. Do not translate. Do not add quotes, comments or explanations. If nothing needs fixing, return the text unchanged.');
  return lines.join('\n');
}

/** ჩართულია? mock-ში — არა; gemini.proofread: false — არა; < 3 სიტყვა ან არაქართული პასუხი — არა. */
export function shouldProofread(cfg, text) {
  if (cfg.gemini.mock || cfg.gemini.proofread === false) return false;
  const t = String(text || '').trim();
  if (t.split(/\s+/).filter(Boolean).length < 3) return false;
  return guessLang(t) === 'ka';
}

const lines = (s) => s.split('\n').filter((l) => l.trim()).length;
const stars = (s) => (s.match(/\*/g) || []).length;

/**
 * კორექტორის პასუხის გადამოწმება: ```-ბლოკები/ბრჭყალები მოიშორება; თუ სიგრძე ძალიან შეიცვალა, ან რემარკების (*) /
 * ხაზების რაოდენობა არ ემთხვევა — უარი (null), დარჩება ორიგინალი. ფორმატს და შინაარსს კორექტორი არ უნდა ეხებოდეს.
 */
export function acceptCorrection(original, corrected) {
  if (typeof corrected !== 'string') return null;
  let c = corrected.replace(/^\s*```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  if (/^[„"«].*[“"»]$/s.test(c) && !/^[„"«].*[“"»]$/s.test(original.trim())) c = c.slice(1, -1).trim();
  if (!c) return null;
  const ratio = c.length / Math.max(1, original.trim().length);
  if (ratio < 0.6 || ratio > 1.6) return null;
  if (stars(c) !== stars(original) || lines(c) !== lines(original)) return null;
  return c;
}

/**
 * „ფიქრის“ მარაგი: gemini-3.8-flash კორექტურაზე ზოგჯერ (~1/3) ~380 „ფიქრის“ ტოკენს ხარჯავს thinkingBudget: 0-ის მიუხედავადაც
 * (გაზომილია scripts/probe-thinking.mjs-ით) და ისინი max_output_tokens-ში ითვლება → MAX_TOKENS. ხილული ტექსტის ზღვარი
 * მაინც 1.5× რჩება (acceptCorrection-ის სიგრძის შემოწმება), მარაგი მხოლოდ ფიქრს ფარავს.
 */
export const THINKING_HEADROOM = 512;

/** max_output_tokens = 1.5 × პასუხის რეალური გამომავალი ტოკენები (მინ. 64) + ფიქრის მარაგი. */
export function proofreadMaxTokens(replyTokens, text = '') {
  return Math.max(64, Math.ceil(1.5 * (Number(replyTokens) || Math.ceil(String(text).length / 2)))) + THINKING_HEADROOM;
}

/**
 * კორექტურა. აბრუნებს { text: შესწორებული | null, usage: {input, output}, reason }. temperature 0, 20 წმ ლიმიტი.
 */
export async function proofread({ cfg, text, speaker, replyTokens = 0, signal = null, timeoutMs = 20_000 }) {
  const allow = allowlistFor(speaker);
  const maxOutputTokens = proofreadMaxTokens(replyTokens, text);
  const signals = [AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])];
  const r = await geminiGenerate({
    cfg,
    systemInstruction: proofreadInstruction(allow, forbiddenDialectFor(speaker)),
    contents: [{ role: 'user', content: text }],
    temperature: 0,
    maxOutputTokens,
    signal: AbortSignal.any(signals),
  });
  if (r.finishReason && r.finishReason !== 'STOP') return { text: null, usage: r.usage, reason: `finish:${r.finishReason}` };
  const ok = acceptCorrection(text, r.text);
  return { text: ok, usage: r.usage, reason: ok ? 'ok' : 'rejected' };
}
