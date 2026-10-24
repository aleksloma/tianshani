// „გამომცემლობის საშვი“ (FIXES_ROUND3 §1): კედელზე მიმაგრებული ბარათი — „როგორ გქვიათ?“.
// არ არის მოდალი: ფონი არ ბნელდება, კედელი და ჩარჩოები არ იძვრის (position: fixed, ზედა ფენა). სახელი — localStorage-ში.
import { getUserName, setUserName, USER_NAME_MAX } from './storage.js';

export const SOSO = 'სოსო';

export function createNameCard({ onChange }) {
  const card = document.getElementById('pass-card');
  const form = document.getElementById('pass-form');
  const input = document.getElementById('pass-input');
  const soso = document.getElementById('pass-soso');
  const closeBtn = document.getElementById('pass-close');
  input.maxLength = USER_NAME_MAX;

  /** ბარათი სათაურის ქვემოთ (ზოლის სიმაღლე ეკრანის ზომაზეა დამოკიდებული). */
  function place() {
    const top = Math.ceil(document.getElementById('topbar').getBoundingClientRect().bottom);
    card.style.top = `${Math.max(0, top) + 18}px`;
  }

  function open() {
    input.value = getUserName();
    place();
    card.hidden = false;
    input.focus({ preventScroll: true });
    input.select();
  }

  function close() { card.hidden = true; }

  function save(name) {
    const v = String(name).replace(/\s+/g, ' ').trim();
    if (!v) { input.focus(); card.classList.remove('nudge'); void card.offsetWidth; card.classList.add('nudge'); return; }
    setUserName(v);
    close();
    onChange(getUserName());
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); save(input.value); });
  soso.addEventListener('click', () => save(SOSO));
  closeBtn.addEventListener('click', close); // სახელის გარეშე — მომავალ ვიზიტზე ისევ ვკითხავთ
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  window.addEventListener('resize', () => { if (!card.hidden) place(); });

  return { open, close, isOpen: () => !card.hidden };
}
