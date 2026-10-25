// Round 7 §1: პერსონაჟის სახელით ხსენება ტექსტში — მატჩერი აიგება მონაცემებიდან (name_ka + short_name_ka),
// ქართული ბრუნვის დაბოლოებებით (გრიშა → გრიშას/გრიშასთან/გრიშამ; ოთარი → ოთარს/ოთართან/ოთარმა/ოთარ დავიდოვიჩს).
import { characters } from './characters.js';

/**
 * name_ka-ში სახელის გვერდით მდგარი სიტყვები, რომლებიც სახელი არ არის: წოდება, თანამდებობა, აღწერა
 * („ვაჟა ზაზაევიჩი (ბატონი ვაჟა) — დირექტორი“, „ლალი — რედაქტორი, ფრანგულს სწავლობს“, „ორი დიდი კაცი — გივის მაძებრები“).
 */
export const NAME_STOPWORDS = new Set([
  'ბატონი', 'ქალბატონი', 'ბატონო', 'ქალბატონო', 'ყოფილი', 'ორი', 'დიდი', 'კაცი', 'და',
  'დირექტორი', 'დირექტორის', 'მოადგილე', 'მდივანი', 'ბუღალტერი', 'მოლარე', 'მღებავი', 'რედაქტორი', 'პოეტი',
  'მოტობურთელი', 'ვულკანოლოგი', 'მნე', 'სამეურნეო', 'ნაწილის', 'ნაწილი', 'გამგე', 'ხელმძღვანელი', 'თანამშრომელი',
  'ფრანგულს', 'სწავლობს', 'ქმარი', 'წიგნში', 'მაძებრები',
]);

// ბრუნვის დაბოლოებები: თანხმოვანფუძე (ოთარ-) და ხმოვანფუძე (გრიშა-, გივი-); ბოლოს შეიძლება „-ც“ / „-აც“
const CONS_SUFFIX = ['ი', 'ს', 'მა', 'ის', 'ისა', 'ით', 'ად', 'ო', 'თან', 'ზე', 'ში', 'ისგან', 'ისთვის', 'ისკენ', 'იდან', 'ამდე'];
const VOW_SUFFIX = ['ს', 'მ', 'სა', 'თი', 'დ', 'სთან', 'ზე', 'ში', 'სგან', 'სთვის', 'სკენ', 'დან', 'მდე'];
const VOWELS = /[აეიოუ]$/;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alt = (arr) => [...arr].sort((a, b) => b.length - a.length).map(esc).join('|');

/** name_ka + short_name_ka → სახელის სიტყვები (აღწერილობითი სიტყვების გარეშე). */
function nameTokens(c) {
  return `${c.name_ka} ${c.short_name_ka}`
    .replace(/[()—–/,„“"'.!?:;]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t));
}

/** სიტყვა → ფუძეები: „ოთარი“ → ოთარ (თანხმ.) + ოთარი (ხმ.); „გრიშა“ → გრიშა (ხმ.); „ოთარ“ → ოთარ (თანხმ.). */
function rootsOf(token) {
  if (token.endsWith('ი')) return { cons: [token.slice(0, -1)], vow: [token] };
  if (VOWELS.test(token)) return { cons: [], vow: [token] };
  return { cons: [token], vow: [] };
}

function buildRegex({ cons, vow }) {
  const parts = [];
  if (cons.length) parts.push(`(?:${alt(cons)})(?:${alt(CONS_SUFFIX)})?`);
  if (vow.length) parts.push(`(?:${alt(vow)})(?:${alt(VOW_SUFFIX)})?`);
  if (!parts.length) return null;
  return new RegExp(`(^|[^ა-ჰ])(?:${parts.join('|')})(?:ა?ც)?(?=[^ა-ჰ]|$)`, 'g');
}

/** პირველი გავლა: ყოველი პერსონაჟის ფუძეები (სხვისი სახელის შემცველი სიტყვა — „ბელას ქმარი“, „გივის მაძებრები“ — ჯერ შიგნითაა). */
function rawRoots(c) {
  const out = { cons: new Set(), vow: new Set() };
  for (const t of nameTokens(c)) {
    const r = rootsOf(t);
    r.cons.filter((x) => x.length >= 3).forEach((x) => out.cons.add(x));
    r.vow.filter((x) => x.length >= 3).forEach((x) => out.vow.add(x));
  }
  return out;
}

/**
 * მეორე გავლა: სიტყვა, რომელიც სხვა პერსონაჟის სახელია ბრუნვაში („ბელას“ ლერის name_ka-ში, „გივის“ ორი დიდი კაცისაში),
 * ამ პერსონაჟის სახელად არ ითვლება. შედეგი: { id → { cons:[], vow:[] } }.
 */
function buildForms() {
  const raw = Object.fromEntries(characters.map((c) => [c.id, rawRoots(c)]));
  const rx = Object.fromEntries(characters.map((c) => [c.id, buildRegex({ cons: [...raw[c.id].cons], vow: [...raw[c.id].vow] })]));
  const forms = {};
  for (const c of characters) {
    const keep = nameTokens(c).filter((t) => !characters.some((o) => o.id !== c.id && rx[o.id] && new RegExp(rx[o.id].source).test(t)));
    const f = { cons: new Set(), vow: new Set() };
    for (const t of keep) {
      const r = rootsOf(t);
      r.cons.filter((x) => x.length >= 3).forEach((x) => f.cons.add(x));
      r.vow.filter((x) => x.length >= 3).forEach((x) => f.vow.add(x));
    }
    forms[c.id] = { cons: [...f.cons], vow: [...f.vow] };
  }
  return forms;
}

/**
 * კუთვნილებითი სახელი („ბელას ქმარი“): როცა ბელა ლაპარაკობს, მარტო „ქმარი“ (ქმარმა, ქმართან…) ამ პერსონაჟს ნიშნავს.
 * შედეგი: [{ id: 'leri', speaker: 'bela', regex }].
 */
function buildPossessive() {
  const out = [];
  for (const c of characters) {
    const m = c.name_ka.match(/^(\S+)ს\s+(\S+)/);
    if (!m) continue;
    const owner = characters.find((o) => o.id !== c.id && o.short_name_ka === m[1]);
    if (owner) out.push({ id: c.id, speaker: owner.id, regex: buildRegex(rootsOf(m[2])) });
  }
  return out;
}

export const NAME_FORMS = buildForms();
const REGEX = Object.fromEntries(Object.entries(NAME_FORMS).map(([id, f]) => [id, buildRegex(f)]));
const POSSESSIVE = buildPossessive();

/**
 * ტექსტში ყველა ხსენება: [{ id, index }] პოზიციის მიხედვით. `ids` — ვისი ძებნა; `speakerId` — ვინ ლაპარაკობს
 * (კუთვნილებითი სახელისთვის: ბელა + „ქმარმა“ → ლერი).
 */
export function findMentions(text, ids = Object.keys(REGEX), speakerId = null) {
  const s = String(text || '');
  const found = [];
  const scan = (id, rx) => {
    if (!rx) return;
    const r = new RegExp(rx.source, 'g');
    for (const m of s.matchAll(r)) found.push({ id, index: m.index + m[1].length });
  };
  for (const id of ids) {
    scan(id, REGEX[id]);
    for (const p of POSSESSIVE) if (p.id === id && p.speaker === speakerId) scan(id, p.regex);
  }
  return found.sort((a, b) => a.index - b.index);
}

/** ტექსტი შეიცავს ამ პერსონაჟის სახელს? */
export function mentions(text, id, speakerId = null) {
  return findMentions(text, [id], speakerId).length > 0;
}
