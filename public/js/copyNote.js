// Round 4 §2: ეგზემპლარი დაიკარგა → პატარა ქაღალდის ფურცელი ზოლის ქვემოთ (~4 წმ), ფილმის საბაბით.
// არ არის მოდალი: არაფერს ბლოკავს, შეხებით/დაჭერით იხურება.

export function createCopyNote({ ms = 4000 } = {}) {
  const note = document.getElementById('copy-note');
  const text = document.getElementById('copy-note-text');
  let timer = null;

  function hide() {
    clearTimeout(timer);
    note.classList.remove('show');
    timer = setTimeout(() => { note.hidden = true; }, 300);
  }

  function show(msg) {
    clearTimeout(timer);
    text.textContent = msg;
    const top = Math.ceil(document.getElementById('topbar').getBoundingClientRect().bottom);
    note.style.top = `${Math.max(0, top) + 10}px`;
    note.hidden = false;
    void note.offsetWidth; // reflow → ჩამოსრიალება
    note.classList.add('show');
    timer = setTimeout(hide, ms);
  }

  note.addEventListener('click', hide);

  return { show, hide, isShown: () => !note.hidden };
}
