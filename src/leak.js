// Round 10 §3.1: პასუხის ნაცვლად მოდელის შიდა ჩანაწერი (წესების შემოწმება, გეგმა) — ვიწრო გამოცნობა.
// სუფთა მოდული (იმპორტების გარეშე): სერვერიც და ბრაუზერიც იყენებს — public/js/leak.js ბაიტ-ბაიტ იგივეა (unit ტესტი ამოწმებს).

/** ჩვენი პრომპტის ჭდეები (ზუსტად, რეგისტრით) — პერსონაჟი მათ არასდროს ამბობს. */
export const LEAK_LABELS = [
  'REDIRECT GATE', 'FOR THIS REPLY', 'TOUCH POOL', 'CATCHPHRASE FOR THIS REPLY', 'LENGTH FOR THIS REPLY', 'BEAT 2 FOR THIS REPLY',
  'YOUR OWN SUBJECT', 'Messages about the manuscript so far', 'Manuscript message count', 'Rules check',
];

/** დაგეგმვის ჭდეები ხაზის დასაწყისში (რეგისტრის გარეშე, ორწერტილით) — მხოლოდ ორი სხვადასხვა ერთად ითვლება. */
export const PLANNING_LABELS = ['Context', 'Speaker', 'Language', 'User', 'Shape', 'Gate', 'Beat 1', 'Beat 2', 'Plan', 'Draft', 'Persona', 'Tone'];

// ხაზის დასაწყისი; სიის ტირე („- Language:“) დასაშვებია
const PLANNING_RE = new RegExp(`^[ \\t]*(?:[-•][ \\t]*)?(${PLANNING_LABELS.map((l) => l.replace(' ', '[ \\t]+')).join('|')})[ \\t]*:`, 'gim');
const GEORGIAN = /[Ⴀ-ჿᲐ-Ჿ]/;
const LETTER = /\p{L}/u;

/**
 * პასუხი „გაჟონილი“ შიდა ჩანაწერია? → { leak, reason }.
 * 1) ჩვენი პრომპტის ჭდე სადმე; 2) ორი ან მეტი დაგეგმვის ჭდე ხაზების დასაწყისში;
 * 3) expectLang === 'ka' და რემარკების (*…*) გარეშე ტექსტში ასოებია, ქართული — არცერთი.
 * rule — რომელმა წესმა იმუშავა (1–3) ან null.
 */
export function isMetaLeak(text, { expectLang } = {}) {
  const t = String(text || '');
  const label = LEAK_LABELS.find((l) => t.includes(l));
  if (label) return { leak: true, reason: `label „${label}“`, rule: 1 };
  const planning = new Set([...t.matchAll(PLANNING_RE)].map((m) => m[1].toLowerCase().replace(/\s+/g, ' ')));
  if (planning.size >= 2) return { leak: true, reason: `planning labels: ${[...planning].join(', ')}`, rule: 2 };
  if (expectLang === 'ka') {
    const speech = t.replace(/\*[^*]*\*?/g, ' ');
    if (LETTER.test(speech) && !GEORGIAN.test(speech)) return { leak: true, reason: 'no Georgian letter in a Georgian conversation', rule: 3 };
  }
  return { leak: false, reason: null, rule: null };
}
