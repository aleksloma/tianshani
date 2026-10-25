// Round 4 §2: პატარა ქაღალდის ფურცელი ზოლის ქვემოთ (~4 წმ). Round 8 §8.4: ეგზემპლარების მოვლენები — რიგით, ერთი მეორის მერე.
// არ არის მოდალი: არაფერს ბლოკავს, შეხებით/დაჭერით იხურება (რიგში შემდეგი მაშინვე ჩნდება).

export function createCopyNote({ ms = 4000 } = {}) {
  const note = document.getElementById('copy-note');
  const text = document.getElementById('copy-note-text');
  let timer = null;
  let pending = [];

  function hide() {
    clearTimeout(timer);
    note.classList.remove('show');
    timer = setTimeout(() => {
      if (pending.length) display(pending.shift());
      else note.hidden = true;
    }, 300);
  }

  function display(msg) {
    clearTimeout(timer);
    text.textContent = msg;
    const top = Math.ceil(document.getElementById('topbar').getBoundingClientRect().bottom);
    note.style.top = `${Math.max(0, top) + 10}px`;
    note.hidden = false;
    void note.offsetWidth; // reflow → ჩამოსრიალება
    note.classList.add('show');
    timer = setTimeout(hide, ms);
  }

  function show(msg) {
    pending = [];
    display(msg);
  }

  /** რამდენიმე ფურცელი რიგით; თუ ერთი უკვე ჩანს — რიგის ბოლოს. */
  function queue(msgs) {
    const list = (msgs || []).filter(Boolean);
    if (!list.length) return;
    if (!note.hidden) { pending.push(...list); return; }
    pending = list.slice(1);
    display(list[0]);
  }

  /** ყველაფრის განულება: ჩანს და რიგში მყოფიც ქრება. */
  function clear() {
    pending = [];
    hide();
  }

  note.addEventListener('click', hide);

  return { show, queue, hide: clear, isShown: () => !note.hidden };
}
