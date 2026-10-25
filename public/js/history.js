// Round 6 §4: რა ეგზავნება სერვერს — ამ პერსონაჟთან ისტორიის ბოლო N შეტყობინება (N = chat.history_window),
// ძველიდან ახლისკენ, მხოლოდ { role, content }. ძველი სკრიპტული ხაზი (Round 4, `scripted: true`) არასდროს.
// Round 10 §3.3: შიდა ჩანაწერად „გაჟონილი“ პასუხი (წესები 1–2) მოდელს აღარ ეგზავნება — ჟურნალში რჩება, არაფერი იშლება.
import { isMetaLeak } from './leak.js';

export function historyForServer(messages, historyWindow) {
  const n = Math.max(1, Number.parseInt(historyWindow, 10) || 20);
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.scripted !== true && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .filter((m) => !(m.role === 'assistant' && isMetaLeak(m.content).leak))
    .slice(-n)
    .map(({ role, content }) => ({ role, content }));
}
