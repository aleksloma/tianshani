// Round 6 §4: რა ეგზავნება სერვერს — ამ პერსონაჟთან ისტორიის ბოლო N შეტყობინება (N = chat.history_window),
// ძველიდან ახლისკენ, მხოლოდ { role, content }. ძველი სკრიპტული ხაზი (Round 4, `scripted: true`) არასდროს.

export function historyForServer(messages, historyWindow) {
  const n = Math.max(1, Number.parseInt(historyWindow, 10) || 20);
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.scripted !== true && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .slice(-n)
    .map(({ role, content }) => ({ role, content }));
}
