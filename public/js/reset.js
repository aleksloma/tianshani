// Round 5 §2: „ყველაფრის განულება“ — ბმული საშვის ბარათზე („თქვენი სახელი ✎“-ის ქვეშ) და დადასტურების ფურცელი.
// არ არის მოდალი: ფურცელი ზოლის ქვემოთ ჩნდება (როგორც ეგზემპლარის ფურცელი), „დიახ“ → onConfirm, „არა“/Esc → იხურება.

export const RESET_QUESTION = 'წავშალოთ ყველა საუბარი და დავიწყოთ თავიდან?';

export function createResetControl({ onConfirm, beforeOpen = () => {} }) {
  const link = document.getElementById('reset-all');
  const note = document.getElementById('reset-note');
  const yes = document.getElementById('reset-yes');
  const no = document.getElementById('reset-no');
  let timer = null;

  function open() {
    beforeOpen(); // საშვის ბარათი იხურება
    clearTimeout(timer);
    const top = Math.ceil(document.getElementById('topbar').getBoundingClientRect().bottom);
    note.style.top = `${Math.max(0, top) + 10}px`;
    note.hidden = false;
    void note.offsetWidth; // reflow → ჩამოსრიალება
    note.classList.add('show');
    no.focus({ preventScroll: true }); // უსაფრთხო ნაგულისხმევი — „არა“
  }

  function close() {
    clearTimeout(timer);
    note.classList.remove('show');
    timer = setTimeout(() => { note.hidden = true; }, 300);
  }

  link.addEventListener('click', open);
  no.addEventListener('click', close);
  yes.addEventListener('click', async () => { close(); await onConfirm(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !note.hidden) { e.stopImmediatePropagation(); close(); }
  }, true);

  return { open, close, isOpen: () => !note.hidden };
}
