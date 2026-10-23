// MOCK პროვაიდერი: როცა Gemini-ს გასაღები არ არის. პასუხს აწყობს characters.json-ის მონაცემებიდან
// (sample_dialogues, excuse_repertoire_ka, catchphrases_ka) და სტრიმავს სიტყვა-სიტყვით — იგივე ინტერფეისით, რაც gemini.js.
import { byId } from './characters.js';
import { ABSENCE_FACTS_KA } from './prompt.js';
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

/** აწყობს mock პასუხის ტექსტს. */
export function composeMockReply({ speaker, invisible, userText, historyLen, gameState }) {
  const h = hash(`${speaker.id}|${userText}|${historyLen}`);
  const lang = guessLang(userText);
  const catchphrase = pick(speaker.catchphrases_ka || [], h >>> 3);
  const parts = [];

  if (invisible) {
    const absence = (ABSENCE_FACTS_KA[invisible.id] || `${invisible.short_name_ka} არ არის.`).split(';')[0].trim();
    if (lang === 'ka' || lang === 'unknown') parts.push(`${absence}.`.replace(/\.\.$/, '.'));
    else parts.push((FOREIGN_ABSENT[lang] || FOREIGN_ABSENT.other)(enShort(invisible)));
  }

  if (lang !== 'ka' && lang !== 'unknown') {
    parts.push((FOREIGN[lang] || FOREIGN.other)(enShort(speaker)));
    if (catchphrase) parts.push(catchphrase);
    return parts.join(' ');
  }

  const dialogues = speaker.sample_dialogues || [];
  const aboutManuscript = mentionsManuscript(userText);
  if (aboutManuscript) {
    const d = dialogues.find((x) => mentionsManuscript(x.user)) || dialogues[0];
    const excuse = pick(speaker.excuse_repertoire_ka || [], h);
    parts.push(historyLen % 2 === 0 && d ? d.assistant : (excuse || d?.assistant || catchphrase));
  } else {
    const pool = [...dialogues.map((d) => d.assistant), ...(speaker.excuse_repertoire_ka || [])];
    parts.push(pick(pool, h) || catchphrase || '…');
  }

  // გარემო: სეზონი, ბზარი, ახალი შენობა — ყოველ მეორე პასუხში
  if ((h & 1) === 0) parts.push(pick(SEASON_LINES[gameState.season] || [], h >>> 5));
  if (gameState.crackStage >= 2 && (h & 2) === 0) parts.push(pick(CRACK_LINES, h >>> 7));
  if (gameState.cycle > 1 && historyLen < 2) parts.push(NEW_BUILDING);
  if (gameState.paintingFallen && (h & 8) === 0) parts.push(PAINTING_LINES[speaker.id] || 'სურათი ჩამოვარდა, გაიგეთ?');

  // გადამისამართება სახელით (ნახევარ შემთხვევაში)
  const redirects = (speaker.redirects_to || []).filter((id) => byId[id] && id !== invisible?.id);
  if (redirects.length && (h & 4) === 0) {
    const r = byId[pick(redirects, h >>> 9)];
    parts.push(`${dative(r.short_name_ka)} მიმართეთ.`);
  }
  return parts.filter(Boolean).join(' ');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * იგივე ინტერფეისი, რაც gemini.streamChat: async generator → { delta } ... ბოლოს { usage }.
 */
export async function* mockStream({ systemInstruction, contents, speaker, invisible, userText, gameState, signal }) {
  const historyLen = contents.length;
  const text = composeMockReply({ speaker, invisible, userText, historyLen, gameState });
  const delay = Number(process.env.MOCK_DELAY_MS ?? 25);
  // სიტყვა + მისი მომდევნო სივრცე ერთ delta-დ
  const words = text.match(/\S+\s*/g) || [text];
  for (const w of words) {
    if (signal?.aborted) return;
    yield { delta: w };
    if (delay) await sleep(delay);
  }
  const inputChars = systemInstruction.length + contents.reduce((n, c) => n + c.content.length, 0);
  yield { usage: { input: Math.ceil(inputChars / 4), output: Math.ceil(text.length / 3) } };
}
