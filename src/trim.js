// Round 10 §4.2: max_output_tokens-ზე (finishReason MAX_TOKENS) მოჭრილი პასუხი — ბოლო სრულ წინადადებამდე.
// მხოლოდ MAX_TOKENS-ზე; ჩვეულებრივ დასრულებულ პასუხს არაფერი ეხება.

const ENDS = '.!?…';
const CLOSERS = '»“"';

/**
 * ბოლო სრული წინადადების ბოლომდე (. ! ? …, შესაძლოა დამხურავი » “ " — რემარკის გარეთ) ან ბოლო დახურულ რემარკამდე (*…*).
 * რემარკის შიგნით არასდროს ჭრის. თუ სრული სასაუბრო წინადადება აღარ დარჩა → null.
 */
export function trimTruncated(text) {
  const s = String(text || '');
  let inStage = false;
  let cut = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '*') {
      inStage = !inStage;
      if (!inStage) cut = i + 1;
      continue;
    }
    if (inStage || !ENDS.includes(ch)) continue;
    let j = i + 1;
    while (j < s.length && ENDS.includes(s[j])) j++;
    while (j < s.length && CLOSERS.includes(s[j])) j++;
    cut = j;
    i = j - 1;
  }
  const out = s.slice(0, cut).trimEnd();
  const speech = out.replace(/\*[^*]*\*/g, ' ');
  return /\p{L}/u.test(speech) && /[.!?…]/.test(speech) ? out : null;
}
