// ფორმატირება და ლიმიტის ფანჯრის ტექსტები (FIXES_ROUND2 §1, §2, §3, §9) — სუფთა ფუნქციები, unit ტესტებისთვისაც.
import { MONTHS_KA } from './calendar.js';

export const THIN_SPACE = ' ';

/** 1987420 → „1 987 420“ (ათასების გამყოფი — თხელი სივრცე). */
export function formatTokens(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
}

/** ISO თარიღი → „1 ნოემბერს“ (მიცემითი: ნოემბერი → ნოემბერს). UTC — სერვერიც UTC-ში ითვლის. */
export function resetDateDative(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const m = MONTHS_KA[d.getUTCMonth()];
  return `${d.getUTCDate()} ${m.endsWith('ი') ? `${m.slice(0, -1)}ს` : `${m}ს`}`;
}

export const LIMIT_TITLE = 'ბიუჯეტში გარღვევა გვაქვს';
export const GLOBAL_SENTENCE = 'გამომცემლობის თვიური ბიუჯეტი ამოიწურა.';

export const CLIENT_SENTENCE = 'კითხვების თვიური ლიმიტი ამოიწურა.';

/**
 * ფანჯრის ტექსტი (სათაური — „ბიუჯეტში გარღვევა გვაქვს“). Round 4 §3: „კითხვების“ ენით, ტოკენების გარეშე.
 * ბრაუზერის ლიმიტი: „კითხვების თვიური ლიმიტი ამოიწურა. თვის ბოლომდე დავიცადოთ. განახლდება 1 ნოემბერს.“
 * გლობალური ბიუჯეტი: იგივე კუდი, პირველი წინადადების ნაცვლად — „გამომცემლობის თვიური ბიუჯეტი ამოიწურა.“
 * kind: 'client_limit' | 'global_budget'; resetsAt: ISO ან null (lifetime).
 */
export function limitBody(kind, resetsAt) {
  const when = resetDateDative(resetsAt);
  if (!when) return kind === 'global_budget' ? GLOBAL_SENTENCE : 'კითხვების ლიმიტი ამოიწურა.';
  const tail = `თვის ბოლომდე დავიცადოთ. განახლდება ${when}.`;
  return `${kind === 'global_budget' ? GLOBAL_SENTENCE : CLIENT_SENTENCE} ${tail}`;
}

// ---------- Round 4 §3: დარჩენილი კითხვები ----------

/** საშუალო შემავალი ერთ კითხვაზე, სანამ ბრაუზერს 3 მოთხოვნა არ ექნება (სისტემური პრომპტი + few-shot + ისტორია). */
export const AVG_INPUT_FALLBACK = 6000;

/**
 * რამდენი კითხვა დარჩა: დარჩენილი შემავალი / საშუალო ერთ კითხვაზე.
 * ≥ 10 → ათეულებად დამრგვალებული („დაახლოებით 80“); < 10 → ზუსტად; ლიმიტი სრულად ამოწურულია → 0.
 */
export function questionsLeft(remainingInput, avgPerRequest) {
  const rem = Math.max(0, Number(remainingInput) || 0);
  if (rem <= 0) return { n: 0, approx: false };
  const avg = Number(avgPerRequest) > 0 ? Number(avgPerRequest) : AVG_INPUT_FALLBACK;
  const q = rem / avg;
  if (q >= 10) return { n: Math.round(q / 10) * 10, approx: true };
  return { n: Math.max(1, Math.floor(q)), approx: false };
}

/** „დარჩა დაახლოებით 80 კითხვა“ / „დარჩა 7 კითხვა“ / „კითხვები აღარ დარჩა“. */
export function questionsLeftText(left) {
  if (!left || left.n <= 0) return 'კითხვები აღარ დარჩა';
  return left.approx ? `დარჩა დაახლოებით ${left.n} კითხვა` : `დარჩა ${left.n} კითხვა`;
}

// ---------- Round 3 §3: ლიმიტი პროცენტად ----------

/** დახარჯულის წილი პროცენტებში (0…100). */
export function usedPercent(used, limit) {
  const l = Number(limit);
  if (!(l > 0)) return 0;
  return Math.min(100, Math.max(0, (Number(used) / l) * 100));
}

/** 0.27 → „0,3 %“ (ერთი ათწილადი, ქართული მძიმე, უწყვეტი სივრცე % -მდე). */
export function formatPercentKa(p) {
  const v = Math.round(Math.min(100, Math.max(0, Number(p) || 0)) * 10) / 10;
  return `${v.toFixed(1).replace('.', ',')} %`;
}

/** ფერის დონე: ნეიტრალური < 70% ≤ ქარვისფერი ≤ 90% < წითელი. */
export function percentLevel(p) {
  if (p > 90) return 'hot';
  if (p >= 70) return 'warn';
  return 'ok';
}

/**
 * tooltip — ერთი ხაზი (Round 4 §3, ადამიანის ენით):
 * „კითხვების ლიმიტის 3,9 % გახარჯულია · დარჩა დაახლოებით 80 კითხვა · განახლდება 1 ნოემბერს“.
 */
export function tokensTipLine(p, period, resetsAt, left = null) {
  const parts = [`კითხვების ლიმიტის ${formatPercentKa(p)} გახარჯულია`];
  if (left) parts.push(questionsLeftText(left));
  if (period === 'lifetime') parts.push('ერთჯერადი ლიმიტი');
  else {
    const when = resetDateDative(resetsAt);
    if (when) parts.push(`განახლდება ${when}`);
  }
  return parts.join(' · ');
}

// ---------- Round 4 §8: ჩატის პირველი ხაზი ----------

/** დეტერმინისტული არჩევანი ციკლით + id-ით (FNV-1a) — ერთ შენობაში ყოველთვის ერთი და იგივე, ახალ შენობაში სხვა. */
export function pickOpener(list, cycle, id) {
  if (!Array.isArray(list) || !list.length) return null;
  let h = 2166136261;
  for (const ch of `${Number(cycle) || 1}:${id}`) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return list[(h >>> 0) % list.length];
}

/** tooltip-ის პერიოდის ხაზი. */
export function periodLine(period, resetsAt) {
  if (period === 'lifetime') return 'ერთჯერადი ლიმიტი';
  const when = resetDateDative(resetsAt);
  return when ? `ლიმიტი განახლდება ${when}` : 'თვიური ლიმიტი';
}
