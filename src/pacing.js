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
  const used = (speaker?.catchphrases_ka || []).filter((c) => {
    const core = phraseCore(c);
    return core.length >= 3 && replies.includes(core);
  });
  return {
    messageCount: users.length,
    manuscriptCount: users.filter((m) => isManuscriptMessage(m.content)).length,
    usedCatchphrases: used,
  };
}

/**
 * სიგრძის მკაცრი ზღვარი ამ პასუხისთვის (რეალურმა smoke-მა აჩვენა, რომ ზოგადი წესის მიუხედავად მოდელი 4 წინადადებას წერს).
 * რემარკა (*…*) არ ითვლება.
 */
export const LENGTH_CAP_LINE = 'LENGTH FOR THIS REPLY: at most 3 short sentences in total (1–2 for small talk) — count them before answering. Each line is exactly ONE sentence: never put two sentences (e.g. a question and an exclamation) on one line. The stage direction does not count. Pick ONE thing to say and keep the rest for later turns.';

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
  const used = p.usedCatchphrases.length ? p.usedCatchphrases.map((c) => `„${phraseCore(c)}“`).join(', ') : 'none';
  return `Messages in this chat so far: ${p.messageCount}. Messages about the manuscript so far: ${p.manuscriptCount}. Catchphrases already used in this chat: [${used}]`;
}
