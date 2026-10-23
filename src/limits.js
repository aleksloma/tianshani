// ტოკენების ლიმიტი თითო ბრაუზერზე (SQLite) და მარტივი rate limit (მეხსიერებაში).

// ერთი და იგივე ტექსტი ბრაუზერის ლიმიტსა და გლობალურ ბიუჯეტზე (FIXES_ROUND2 §2, §9) — ფილმის ტონით
export const MSG_LIMIT = 'ბიუჯეტში გარღვევა გვაქვს, თვის ბოლომდე დავიცადოთ.';
export const MSG_LIMIT_LIFETIME = MSG_LIMIT;
export const MSG_RATE = 'ძალიან ჩქარა წერთ. თინა ვერ ასწრებს — ერთ წუთში მობრძანდით.';
export const MSG_TOO_LONG = 'ეს უკვე მოთხრობაა და არა შეტყობინება. მოკლედ, თუ შეიძლება.';

/** პერიოდის გასაღები: monthly → YYYY-MM (UTC), lifetime → "all". */
export function periodKey(period, date = new Date()) {
  if (period === 'lifetime') return 'all';
  return date.toISOString().slice(0, 7);
}

/** როდის განახლდება ლიმიტი: monthly → მომავალი თვის 1 (UTC, ISO); lifetime → null. */
export function resetsAt(period, date = new Date()) {
  if (period === 'lifetime') return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString();
}

/** ბალანსი: გამოყენებული და დარჩენილი. */
export function balance(store, cfg, clientId, now = new Date()) {
  const key = periodKey(cfg.limits.period, now);
  const u = store.getUsage(clientId, key);
  const li = cfg.limits.per_client_input_tokens;
  const lo = cfg.limits.per_client_output_tokens;
  return {
    period: cfg.limits.period,
    period_key: key,
    resets_at: resetsAt(cfg.limits.period, now),
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
