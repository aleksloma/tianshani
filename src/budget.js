// გლობალური თვიური ლიმიტი (Round 7 §2, ცვლის FIXES_ROUND2 §3-ის დოლარებს): ყველა მომხმარებლის ჯამური ტოკენები
// (შემავალი + გამომავალი), კალენდარული თვე (UTC). ფასები კონფიგში მხოლოდ ადმინის დოლარის შეფასებისთვისაა — არაფერს კეტავს.

import { visibleCap } from './thinking.js';

export const MSG_BUDGET = 'ბიუჯეტში გარღვევა გვაქვს, თვის ბოლომდე დავიცადოთ.';

/** ხარჯის შეფასება USD: input/1e6 × price_in + output/1e6 × price_out (მხოლოდ საჩვენებლად). */
export function costUsd(input, output, prices) {
  const pi = Number(prices?.price_input_per_1m_usd) || 0;
  const po = Number(prices?.price_output_per_1m_usd) || 0;
  return (Math.max(0, input | 0) / 1e6) * pi + (Math.max(0, output | 0) / 1e6) * po;
}

/** გლობალური პერიოდი ყოველთვის კალენდარული თვეა (UTC), limits.period-ისგან დამოუკიდებლად. */
export function globalPeriodKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

/** მომავალი თვის პირველი დღე (UTC, ISO) — „ლიმიტი განახლდება …“. */
export function nextMonthISO(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString();
}

/** უხეში შეფასება: ~4 სიმბოლო = 1 ტოკენი (რეზერვისთვის საკმარისია). */
export function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

/** რამდენი ტოკენი შეიძლება დაჯდეს ეს მოთხოვნა ყველაზე ცუდ შემთხვევაში (პრომპტი + max_output_tokens). */
export function reserveTokens({ promptTokens, maxOutputTokens }) {
  return Math.max(0, promptTokens | 0) + Math.max(0, maxOutputTokens | 0);
}

/** ლიმიტი ჩართულია? (0 ან უარყოფითი = გამორთული). */
export function budgetEnabled(cfg) {
  return Number(cfg.budget?.global_monthly_tokens) > 0;
}

/** მიმდინარე თვის მდგომარეობა (ტოკენებში) + დოლარის შეფასება. */
export function globalStatus(store, cfg, now = new Date()) {
  const key = globalPeriodKey(now);
  const g = store.getGlobal(key);
  const limit = Number(cfg.budget?.global_monthly_tokens) || 0;
  const enabled = limit > 0;
  const used = (g.input_tokens | 0) + (g.output_tokens | 0);
  const percent = enabled ? (used / limit) * 100 : 0;
  const warnAt = Number(cfg.budget?.warn_at_percent) || 80;
  // მინიმალური რეზერვი: ერთი სრული პასუხი (ხილული ზღვარი — Round 10: visible_output_tokens). თუ ესეც აღარ ეტევა, არც ერთი
  // მოთხოვნა არ გავა — ლიმიტი ფაქტობრივად ამოწურულია და მოდალი ყველას ჩატვირთვისთანავე უნდა გამოუჩნდეს.
  const minReserve = visibleCap(cfg);
  return {
    period_key: key,
    enabled,
    tokens_limit: limit,
    tokens_used: used,
    input_tokens: g.input_tokens,
    output_tokens: g.output_tokens,
    requests: g.requests,
    percent: Math.round(percent * 10) / 10,
    exhausted: enabled && (used >= limit || used + minReserve > limit),
    warn: enabled && percent >= warnAt,
    warn_at_percent: warnAt,
    resets_at: nextMonthISO(now),
    estimated_usd: costUsd(g.input_tokens, g.output_tokens, cfg.budget),
  };
}

/** ბოლო მოთხოვნამ ლიმიტი არ უნდა გადააჭარბოს: თუ გამოყენებული + რეზერვი ≥ ლიმიტი → უარი. */
export function wouldOvershoot(status, reserve) {
  if (!status.enabled) return false;
  return status.tokens_used + reserve >= status.tokens_limit;
}

/** თვის ბოლოს პროგნოზი (წრფივი: გასული დღეების მიხედვით) — ნებისმიერი დაგროვებადი სიდიდისთვის (ტოკენები). */
export function projectedMonthEnd(value, now = new Date()) {
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const elapsed = now.getUTCDate() - 1 + (now.getUTCHours() * 60 + now.getUTCMinutes()) / 1440; // დღის წილიც
  const perDay = elapsed > 0 ? value / elapsed : value;
  return { projected: Math.round(perDay * daysInMonth), days_elapsed: Math.round(elapsed * 10) / 10, days_in_month: daysInMonth };
}

/** გაფრთხილება ლოგში დღეში ერთხელ, როცა warn_at_percent გადაილახა. */
export function createWarnLogger(logger) {
  let lastDay = null;
  return {
    check(status, now = new Date()) {
      if (!status.warn) return false;
      const day = now.toISOString().slice(0, 10);
      if (day === lastDay) return false;
      lastDay = day;
      logger.warn(`[budget] თვიური ლიმიტის ${status.percent}% დახარჯულია (${status.tokens_used} / ${status.tokens_limit} ტოკენი) — ${status.period_key}`);
      return true;
    },
  };
}
