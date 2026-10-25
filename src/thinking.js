// Round 10 §2.1: ხილული პასუხის ზღვარი და „ფიქრის“ ბიუჯეტი თითო პასუხზე (gemini.visible_output_tokens, gemini.thinking_policy).
// ძველი gemini.max_output_tokens / gemini.thinking_budget — მხოლოდ სათადარიგოდ, თუ ახალი გასაღებები არ არის.

/** ხილული პასუხის ზღვარი (ტოკენებში): visible_output_tokens, თუ არა — ძველი max_output_tokens. */
export function visibleCap(cfg) {
  const g = cfg?.gemini || {};
  return Number(g.visible_output_tokens ?? g.max_output_tokens) || 0;
}

const nonNegInt = (v) => (Number.isInteger(Number(v)) && Number(v) >= 0 && v !== null && v !== '' ? Number(v) : null);

/** thinking_policy-ის ნორმალიზაცია; არ არის / არასწორია → null (მაშინ ძველი thinking_budget). */
export function normalizeThinkingPolicy(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const mode = raw.mode === 'adaptive' ? 'adaptive' : 'fixed';
  const p = { mode, budget: nonNegInt(raw.budget) ?? 0 };
  if (mode === 'adaptive') {
    for (const k of ['from_user_message', 'history_tokens_over', 'longer_than_chars']) {
      const v = nonNegInt(raw[k]);
      if (v !== null) p[k] = v;
    }
    for (const k of ['on_actions', 'on_proxy']) if (raw[k] === true) p[k] = true;
  }
  return p;
}

/**
 * ამ პასუხის „ფიქრის“ ბიუჯეტი. turn: { messageCount, historyTokens, action, invisible, userChars }.
 * აბრუნებს { budget, why }; budget null → thinkingConfig არ იგზავნება (მოდელის დეფოლტი).
 */
export function thinkingFor(cfg, turn = {}) {
  const p = cfg?.gemini?.thinking_policy;
  const legacy = cfg?.gemini?.thinking_budget;
  const base = legacy === null || legacy === undefined ? null : Number(legacy);
  if (!p) return { budget: base, why: 'thinking_budget' };
  if (p.mode === 'fixed') return { budget: p.budget, why: 'fixed' };
  const why = [];
  if (p.on_actions && turn.action) why.push('action');
  if (p.on_proxy && turn.invisible) why.push('proxy');
  if (p.from_user_message !== undefined && (turn.messageCount || 0) >= p.from_user_message) why.push('long chat');
  if (p.history_tokens_over !== undefined && (turn.historyTokens || 0) > p.history_tokens_over) why.push('long history');
  if (p.longer_than_chars !== undefined && (turn.userChars || 0) > p.longer_than_chars) why.push('long message');
  return why.length ? { budget: p.budget, why: why.join(', ') } : { budget: base, why: 'normal turn' };
}

/** maxOutputTokens: ხილული ზღვარი + ფიქრის ბიუჯეტი (ფიქრის ტოკენები Gemini-ში ამ ზღვარში ითვლება). */
export function outputCap(cfg, budget) {
  return visibleCap(cfg) + (Number(budget) > 0 ? Number(budget) : 0);
}

/** სტარტის ლოგისთვის: რა მოქმედებს. */
export function describeThinking(cfg) {
  const p = cfg?.gemini?.thinking_policy;
  if (!p) return `thinking_budget ${cfg?.gemini?.thinking_budget ?? 'null (მოდელის დეფოლტი)'}`;
  if (p.mode === 'fixed') return `fixed, ბიუჯეტი ${p.budget}`;
  const on = [
    p.on_actions && 'მოქმედებები', p.on_proxy && 'წარმომადგენელი',
    p.from_user_message !== undefined && `${p.from_user_message}-ე შეტყობინებიდან`,
    p.history_tokens_over !== undefined && `ისტორია > ${p.history_tokens_over} ტოკენი`,
    p.longer_than_chars !== undefined && `შეტყობინება > ${p.longer_than_chars} სიმბოლო`,
  ].filter(Boolean);
  return `adaptive, ბიუჯეტი ${p.budget} (${on.join(', ') || '—'}), სხვა პასუხებზე ${cfg.gemini.thinking_budget ?? 'null'}`;
}
