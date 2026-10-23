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

/**
 * ფანჯრის ტექსტი. ბრაუზერის ლიმიტი და გლობალური ბიუჯეტი იდენტურია, გლობალურს ერთი დამატებითი წინადადება აქვს.
 * kind: 'client_limit' | 'global_budget'; resetsAt: ISO ან null (lifetime).
 */
export function limitBody(kind, resetsAt) {
  const when = resetDateDative(resetsAt);
  const base = when ? `თვის ბოლომდე დავიცადოთ. ლიმიტი განახლდება ${when}.` : 'ლიმიტი ამოწურულია.';
  return kind === 'global_budget' ? `${GLOBAL_SENTENCE} ${base}` : base;
}

/** tooltip-ის პერიოდის ხაზი. */
export function periodLine(period, resetsAt) {
  if (period === 'lifetime') return 'ერთჯერადი ლიმიტი';
  const when = resetDateDative(resetsAt);
  return when ? `ლიმიტი განახლდება ${when}` : 'თვიური ლიმიტი';
}
