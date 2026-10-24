// დიალოგის ტემპი (FIXES_ROUND2 §8): ისტორიიდან სერვერზე ითვლება, რამდენი შეტყობინება იყო, რამდენი — ხელნაწერზე,
// და რომელი ცნობილი ფრაზები უკვე გამოიყენა პერსონაჟმა. ეს ხაზი პრომპტში ჯდება, რომ მოდელმა რეპერტუარი ნელა დახარჯოს.

/** ხელნაწერზე საუბრის ქართული საკვანძო ძირები (+ ინგლისური/რუსული, რომ სხვა ენაზეც ითვლებოდეს). */
export const MANUSCRIPT_KEYWORDS = [
  'მოთხრობ', 'ხელნაწერ', 'წაიკითხ', 'დაბეჭდ', 'ეგზემპლარ', 'ტიან-შან', 'ტიანშან', 'ცისფერ',
  'manuscript', 'novel', 'story', 'рукопис', 'рассказ', 'повест',
];

export function isManuscriptMessage(text) {
  const t = String(text || '').toLowerCase();
  return MANUSCRIPT_KEYWORDS.some((k) => t.includes(k));
}

/** ფრაზის „ბირთვი“ შესადარებლად: ფრჩხილები, ბოლო პუნქტუაცია, ბრჭყალები და „— პასუხი“ ნაწილი ქრება. */
export function phraseCore(phrase) {
  let p = String(phrase || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[„“"«»]/g, '')
    .split(/\s[—–]\s/)[0]
    .replace(/[.!?…,:;\s]+$/u, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // გრძელი ფრაზა — პირველი 4 სიტყვა საკმარისია ამოსაცნობად
  const words = p.split(' ');
  if (words.length > 6) p = words.slice(0, 4).join(' ');
  return p;
}

/**
 * ტემპის მდგომარეობა ამ პასუხის წინ.
 * @param {Array<{role, content}>} history — საუბარი, ბოლო = მომხმარებლის მიმდინარე შეტყობინება
 * @param {object} speaker — ვინც პასუხობს (მისი catchphrases_ka)
 */
export function pacingState(history, speaker) {
  const users = history.filter((m) => m.role === 'user');
  const replies = history.filter((m) => m.role === 'assistant').map((m) => m.content).join('\n');
  const usedOf = (list) => (list || []).filter((c) => {
    const core = phraseCore(c);
    return core.length >= 3 && replies.includes(core);
  });
  return {
    messageCount: users.length,
    manuscriptCount: users.filter((m) => isManuscriptMessage(m.content)).length,
    usedCatchphrases: usedOf(speaker?.catchphrases_ka),
    usedExcuses: usedOf(speaker?.excuse_repertoire_ka), // Round 4 §9: საბაბიც არ მეორდება
  };
}

/**
 * სიგრძის ზღვარი ამ პასუხისთვის (Round 4 §9: ორი „ტაქტი“ — პასუხი + ერთი დამახასიათებელი შტრიხი).
 * რემარკა (*…*) არ ითვლება.
 */
export const LENGTH_CAP_LINE = 'LENGTH FOR THIS REPLY: two beats — 2 sentences by default (one per beat), 3 at most, never just 1. Each line is exactly ONE sentence. The stage direction does not count. Answer only what was asked; do not answer questions that were not asked.';

/** Round 4 §9: შენობის „მარადიული“ ფონური თემები (world.setting_ka-ს მოტივები) — მეორე ტაქტისთვის. */
export const WORLD_TOUCHES_KA = [
  'ფანჯრის მიღმა მოტობურთის მატჩი და მტვერი',
  'ბზარი კედელში — თითქოს გაიზარდა',
  'ლიფტი, რომელიც ისევ გაიჭედა',
  'ამინდი და სეზონი',
  'სადილი / ბუფეტი',
  'ტელეფონი, რომელიც არ ჩერდება',
  'ვინ არის შვებულებაში ან მივლინებაში',
];

/**
 * Round 4 §9: მეორე ტაქტის მასალა კანონიდან — ჯერ გამოუყენებელი ცნობილი ფრაზები (≤ 4), რეალური საქმიანობა
 * და 3 ფონური თემა (შეტყობინებების რაოდენობით ბრუნავს, რომ ტაქტები იცვლებოდეს).
 */
export function touchPool(speaker, pacing) {
  const used = new Set((pacing?.usedCatchphrases || []).map(phraseCore));
  const phrases = (speaker?.catchphrases_ka || []).map(phraseCore).filter((c) => c.length >= 3 && !used.has(c)).slice(0, 4);
  const activity = String(speaker?.persona_ka?.real_activity || '').trim();
  const n = WORLD_TOUCHES_KA.length;
  const start = (pacing?.messageCount || 0) % n;
  const world = [0, 1, 2].map((i) => WORLD_TOUCHES_KA[(start + i) % n]);
  return [
    ...phrases.map((p) => `„${p}“`),
    ...(activity ? [`what you are busy with: ${activity}`] : []),
    ...world,
  ];
}

export function touchPoolLine(speaker, pacing) {
  return `TOUCH POOL for beat 2 (pick ONE, or ask a counter-question; it is never more information about the request): [${touchPool(speaker, pacing).join('; ')}]`;
}

/**
 * წინადადებების რაოდენობა (რემარკების *…* გარეშე): ახალი ხაზი ან . ! ? ყოფს; „…“ არ ყოფს; მოკლე ნამსხვრევები არ ითვლება.
 * Round 4 §9 — „ზედმეტად გრძელი პასუხები“ (> 3) და რეალური smoke.
 */
export function countSentences(text) {
  const speech = String(text || '').replace(/\*[^*]*\*?/g, '\n').replace(/^\s*\([^)]*\)/gm, '\n');
  return speech.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => (s.match(/[ა-ჰA-Za-zА-яЁё]/g) || []).length >= 3).length;
}

/**
 * გადამისამართების „ჩამკეტი“ ამ პასუხისთვის: ზოგადი წესი საკმარისი არ აღმოჩნდა (რეალური smoke: ბელამ ხელნაწერის
 * პირველსავე შეტყობინებაზე „ვასოსთან გადადი“ თქვა). მთვლელი სერვერზეა, ამიტომ პირდაპირ ვეუბნებით, რა შეიძლება ახლა.
 */
export function redirectGateLine(p) {
  if (p.manuscriptCount < 3) {
    return `REDIRECT GATE: the manuscript has come up ${p.manuscriptCount} time(s) — fewer than 3. In THIS reply do NOT send the user to anyone else (no "go to X", "take it to X", "X has it"), do NOT say you are leaving or busy. Engage: react, ask, promise something small.`;
  }
  return 'REDIRECT GATE: the manuscript has come up 3+ times — now you may suddenly have to go, or send the user to ONE of your redirects. If the user then changes the subject, talk gladly.';
}

/** პრომპტის ხაზი (სპეცის ფორმატით). */
export function pacingLine(p) {
  const list = (arr) => (arr?.length ? arr.map((c) => `„${phraseCore(c)}“`).join(', ') : 'none');
  return `Messages in this chat so far: ${p.messageCount}. Messages about the manuscript so far: ${p.manuscriptCount}. Catchphrases already used in this chat: [${list(p.usedCatchphrases)}]. Excuses already used in this chat: [${list(p.usedExcuses)}]`;
}
