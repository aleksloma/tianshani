// გლობალური თვიური ბიუჯეტი (FIXES_ROUND2 §3): ყველა მომხმარებლის ჯამური ხარჯი USD-ში, კალენდარული თვე (UTC).
// ფასები კონფიგშია — Gemini 3.8 Flash-ის intro ფასი 2027-01-01-დან ორმაგდება.

export const MSG_BUDGET = 'ბიუჯეტში გარღვევა გვაქვს, თვის ბოლომდე დავიცადოთ.';

/** ხარჯი USD: input/1e6 × price_in + output/1e6 × price_out. */
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

/** რამდენი შეიძლება დაჯდეს ეს მოთხოვნა ყველაზე ცუდ შემთხვევაში (პრომპტი + max_output_tokens). */
export function reserveUsd({ promptTokens, maxOutputTokens, prices }) {
  return costUsd(promptTokens, maxOutputTokens, prices);
}

/** ბიუჯეტი ჩართულია? (0 ან უარყოფითი = გამორთული). */
export function budgetEnabled(cfg) {
  return Number(cfg.budget?.global_monthly_usd) > 0;
}

/** მიმდინარე თვის მდგომარეობა. */
export function globalStatus(store, cfg, now = new Date()) {
  const key = globalPeriodKey(now);
  const g = store.getGlobal(key);
  const budget = Number(cfg.budget?.global_monthly_usd) || 0;
  const enabled = budget > 0;
  const percent = enabled ? (g.cost_usd / budget) * 100 : 0;
  const warnAt = Number(cfg.budget?.warn_at_percent) || 80;
  // მინიმალური რეზერვი: ერთი სრული პასუხის (max_output_tokens) ფასი. თუ ეს აღარ ეტევა, არც ერთი მოთხოვნა არ გავა —
  // ბიუჯეტი ფაქტობრივად ამოწურულია და მოდალი ყველას ჩატვირთვისთანავე უნდა გამოუჩნდეს.
  const minReserve = costUsd(0, Number(cfg.gemini?.max_output_tokens) || 0, cfg.budget);
  return {
    period_key: key,
    enabled,
    budget_usd: budget,
    spent_usd: g.cost_usd,
    input_tokens: g.input_tokens,
    output_tokens: g.output_tokens,
    requests: g.requests,
    percent: Math.round(percent * 10) / 10,
    exhausted: enabled && (g.cost_usd >= budget || g.cost_usd + minReserve > budget),
    warn: enabled && percent >= warnAt,
    warn_at_percent: warnAt,
    resets_at: nextMonthISO(now),
  };
}

/** ბოლო მოთხოვნამ ბიუჯეტი არ უნდა გადააჭარბოს: თუ ხარჯი + რეზერვი ≥ ბიუჯეტი → უარი. */
export function wouldOvershoot(status, reserve) {
  if (!status.enabled) return false;
  return status.spent_usd + reserve >= status.budget_usd;
}

/** თვის ბოლოს პროგნოზი (წრფივი: გასული დღეების მიხედვით). */
export function projectedMonthEnd(spentUsd, now = new Date()) {
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const elapsed = now.getUTCDate() - 1 + (now.getUTCHours() * 60 + now.getUTCMinutes()) / 1440; // დღის წილიც
  const perDay = elapsed > 0 ? spentUsd / elapsed : spentUsd;
  return { projected_usd: Math.round(perDay * daysInMonth * 10000) / 10000, days_elapsed: Math.round(elapsed * 10) / 10, days_in_month: daysInMonth };
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
      logger.warn(`[budget] თვიური ბიუჯეტის ${status.percent}% დახარჯულია ($${status.spent_usd.toFixed(2)} / $${status.budget_usd}) — ${status.period_key}`);
      return true;
    },
  };
}
