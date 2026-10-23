// ტოკენების ლიმიტი (SQLite) და მარტივი rate limit (მეხსიერებაში).

export const MSG_LIMIT = 'ლიმიტი ამოიწურა. ბუღალტერია დაკეტილია, მომავალ თვეში მობრძანდით.';
export const MSG_LIMIT_LIFETIME = 'ლიმიტი ამოიწურა. ბუღალტერია დაკეტილია — ამ ბრაუზერის ფონდი ამოიწურა.';
export const MSG_RATE = 'ძალიან ჩქარა წერთ. თინა ვერ ასწრებს — ერთ წუთში მობრძანდით.';
export const MSG_TOO_LONG = 'ეს უკვე მოთხრობაა და არა შეტყობინება. მოკლედ, თუ შეიძლება.';

/** პერიოდის გასაღები: monthly → YYYY-MM (UTC), lifetime → "all". */
export function periodKey(period, date = new Date()) {
  if (period === 'lifetime') return 'all';
  return date.toISOString().slice(0, 7);
}

/** ბალანსი: გამოყენებული და დარჩენილი. */
export function balance(store, cfg, clientId) {
  const key = periodKey(cfg.limits.period);
  const u = store.getUsage(clientId, key);
  const li = cfg.limits.per_client_input_tokens;
  const lo = cfg.limits.per_client_output_tokens;
  return {
    period: cfg.limits.period,
    period_key: key,
    limits: { input: li, output: lo },
    used: { input: u.input_tokens, output: u.output_tokens, requests: u.requests },
    remaining: { input: Math.max(0, li - u.input_tokens), output: Math.max(0, lo - u.output_tokens) },
    exhausted: u.input_tokens >= li || u.output_tokens >= lo,
  };
}

/** მარტივი სრიალა ფანჯარა: max მოთხოვნა 60 წამში თითო გასაღებზე. */
export function createRateLimiter(maxPerMinute) {
  const hits = new Map();
  return {
    /** true — დაშვებულია; false — ლიმიტს გადააჭარბა. */
    allow(key, now = Date.now()) {
      const arr = (hits.get(key) || []).filter((t) => now - t < 60_000);
      if (arr.length >= maxPerMinute) { hits.set(key, arr); return false; }
      arr.push(now);
      hits.set(key, arr);
      if (hits.size > 50_000) hits.clear(); // მეხსიერების დაცვა
      return true;
    },
  };
}
