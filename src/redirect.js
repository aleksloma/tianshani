// suggested_redirect (FIXES_ROUND2 §8): მხოლოდ მაშინ, როცა ხელნაწერზე ≥ 3 შეტყობინება იყო
// და პასუხი მართლა ასახელებს redirects_to-დან ვინმეს. შემთხვევითი („50%“) წესი ამოღებულია — ღილაკი პირველივე პასუხზე აღარ ჩნდება.
import { byId, nameStems } from './characters.js';

export const REDIRECT_MIN_MANUSCRIPT = 3;

// name_ka-დან მიღებული ზოგადი სიტყვები, რომლებიც სახელი არ არის („ნაწილის ხელმძღვანელი“, „(წიგნში — ლერი)“)
const GENERIC_STEMS = new Set(['ნაწილი', 'ხელმძღვანელ', 'წიგნშ', 'წარმომადგენელ', 'თანამშრომელ', 'რედაქტორ']);

/** „გაგზავნის“ ნიშნები: მიმართე, მიდი, შეიარე, ჰკითხე, გადადი, დატოვე, მიიტანე, „-სთან/-თან“ (ვასოსთან, ოთართან). */
const SEND_CUES = /მიმართ|მიდი|მიბრძანდ|შეიარ|შეიხედ|შეუხვი|ჰკითხ|გადადი|დატოვ|დაუტოვ|მიიტან|გადაეც|[ა-ჰ]{2,}(?:ს)?თან(?=[\s,.!?…]|$)/g;

/** სამიზნის სახელის ძირები — მოსაუბრის საკუთარი სახელის ძირების გარეშე (ბელა → „ბელას ქმარი“ ბელას არ ნიშნავს). */
function targetStems(target, speaker) {
  const own = new Set(nameStems(speaker));
  return nameStems(target).filter((s) => !own.has(s) && !GENERIC_STEMS.has(s));
}

/**
 * @param {object} speaker — ვინც უპასუხა
 * @param {string} reply — პასუხის ტექსტი
 * @param {string} currentId — ვისთან არის ჩატი (მასზე არ გადავამისამართებთ)
 * @param {number} manuscriptCount — მომხმარებლის რამდენი შეტყობინება იყო ხელნაწერზე (მიმდინარის ჩათვლით)
 */
export function detectRedirect({ speaker, reply, currentId, manuscriptCount = 0 }) {
  if (manuscriptCount < REDIRECT_MIN_MANUSCRIPT) return null;
  const targets = (speaker.redirects_to || []).filter((id) => byId[id] && id !== currentId && id !== speaker.id);
  if (!targets.length) return null;
  // 1) წინადადება „გაგზავნის“ ზმნით (მიმართე, ჰკითხე, შეიარე, …-სთან): სამიზნე, რომლის სახელიც ზმნასთან ყველაზე ახლოსაა.
  //    („ლერიმ წაიღო სახლში. შუქრის მიმართე“ → შუქრი, არა ლერი.)
  for (const sentence of reply.split(/(?<=[.!?])\s+|\n+/)) {
    const cues = [...sentence.matchAll(SEND_CUES)].map((m) => m.index);
    if (!cues.length) continue;
    let best = null;
    for (const id of targets) {
      for (const s of targetStems(byId[id], speaker)) {
        const at = sentence.indexOf(s);
        if (at < 0) continue;
        const dist = Math.min(...cues.map((c) => Math.abs(c - at)));
        if (!best || dist < best.dist) best = { id, dist };
      }
    }
    if (best) return best.id;
  }
  // 2) ზმნის გარეშე — პირველი ნახსენები redirects_to-ს რიგით
  for (const id of targets) {
    if (targetStems(byId[id], speaker).some((s) => reply.includes(s))) return id;
  }
  return null;
}
