// „ბიუჯეტში გარღვევა გვაქვს“ — ოფიციალური განცხადება ყველაფრის თავზე (FIXES_ROUND2 §2, §3).
// შეიძლება დაიხუროს (კედლის სანახავად), მაგრამ ყოველ გაგზავნის მცდელობაზე ისევ იხსნება; ჩატის ველი დაბლოკილია.
import { LIMIT_TITLE, limitBody } from './format.js';

export const BLOCKED_PLACEHOLDER = 'ბუღალტერია დაკეტილია';

export function createLimitModal() {
  const modal = document.getElementById('limit-modal');
  const backdrop = document.getElementById('limit-backdrop');
  const title = document.getElementById('limit-title');
  const body = document.getElementById('limit-body');
  const closeBtn = document.getElementById('limit-close');
  const input = document.getElementById('chat-input');
  const send = document.getElementById('chat-send');
  const normalPlaceholder = input.getAttribute('placeholder') || 'დაწერეთ…';
  let blocked = null; // { kind, resetsAt } | null

  /**
   * ველი „გამორთულია“ (readOnly + aria-disabled), მაგრამ დაჭერა მაინც აღწევს — ასე გაგზავნის ყოველი მცდელობა
   * (Enter, ღილაკი, ველზე დაჭერა) ფანჯარას ისევ ხსნის. ნამდვილი `disabled` დაჭერას საერთოდ ყლაპავს.
   */
  function applyInput() {
    const on = Boolean(blocked);
    input.readOnly = on;
    for (const el of [input, send]) {
      if (on) el.setAttribute('aria-disabled', 'true');
      else el.removeAttribute('aria-disabled');
    }
    input.setAttribute('placeholder', on ? BLOCKED_PLACEHOLDER : normalPlaceholder);
    document.body.classList.toggle('budget-blocked', on);
  }

  function open() {
    if (!blocked) return;
    title.textContent = LIMIT_TITLE;
    body.textContent = limitBody(blocked.kind, blocked.resetsAt); // არასდროს ნედლი JSON
    modal.dataset.kind = blocked.kind;
    modal.hidden = false;
    backdrop.hidden = false;
    closeBtn.focus({ preventScroll: true });
  }

  function close() {
    modal.hidden = true;
    backdrop.hidden = true;
  }

  /** დაბლოკვა: kind 'client_limit' | 'global_budget'. გლობალური უპირატესია (ის ყველასთვისაა). */
  function block(kind, resetsAt) {
    if (blocked?.kind === 'global_budget' && kind === 'client_limit') return open();
    blocked = { kind, resetsAt: resetsAt ?? null };
    applyInput();
    open();
  }

  /** განბლოკვა (მაგ. ადმინმა ბიუჯეტი გაანულა და /api/state ახლა ნორმალურია). */
  function unblock() {
    blocked = null;
    applyInput();
    close();
  }

  input.addEventListener('click', () => { if (blocked) open(); });
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) { close(); e.stopPropagation(); } }, true);

  return {
    block, unblock, open, close,
    isBlocked: () => Boolean(blocked),
    kind: () => blocked?.kind || null,
    applyInput,
  };
}
