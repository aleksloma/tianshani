// თამაშის მექანიკა: სეზონები, ბზარი, ეგზემპლარები, ჩამონგრევა. მდგომარეობა — localStorage (tianshani.game).
import { getJSON, setJSON, KEYS } from './storage.js';

export const SEASON_ICON = { autumn: '🍂', winter: '❄', spring: '🌱', summer: '☀' };
export const LOST_COPY_NOTES = ['ერთი თინას უჯრაშია სამი თვე', 'ერთი ბანკში დარჩა', 'ერთი ოთხად გაიყო'];
export const COLLAPSE_TEXT = 'შენობა ჩამოინგრა. ახალი შენობა. ყველაფერი თავიდან.';

export function initialState(cycle = 1, seasons = ['autumn']) {
  return { cycle, season: seasons[0], exchanges: 0, crackStage: 0, lostCopies: 0, visited: [] };
}

export function loadState(gameCfg) {
  const s = getJSON(KEYS.game, null);
  const base = initialState(1, gameCfg.seasons);
  if (!s || typeof s !== 'object') return base;
  return {
    cycle: Number.isInteger(s.cycle) && s.cycle > 0 ? s.cycle : 1,
    season: gameCfg.seasons.includes(s.season) ? s.season : base.season,
    exchanges: Number.isInteger(s.exchanges) && s.exchanges >= 0 ? s.exchanges : 0,
    crackStage: Math.min(gameCfg.crack_stages - 1, Math.max(0, s.crackStage | 0)),
    lostCopies: Math.min(gameCfg.copies, Math.max(0, s.lostCopies | 0)),
    visited: Array.isArray(s.visited) ? s.visited.filter((x) => typeof x === 'string') : [],
  };
}

export function saveState(state) { setJSON(KEYS.game, state); }

/**
 * ერთი შეტყობინება-პასუხი დასრულდა. აბრუნებს: { state, event: null | 'season' | 'collapse' }.
 * სუფთა ფუნქცია (DOM-ის გარეშე).
 */
export function applyExchange(state, gameCfg, characterId) {
  const s = { ...state, visited: state.visited.includes(characterId) ? state.visited : [...state.visited, characterId] };
  s.exchanges += 1;
  if (s.exchanges < gameCfg.exchanges_per_season) return { state: s, event: null };
  s.exchanges = 0;
  const idx = gameCfg.seasons.indexOf(s.season);
  if (idx < gameCfg.seasons.length - 1) {
    s.season = gameCfg.seasons[idx + 1];
    s.crackStage = Math.min(gameCfg.crack_stages - 1, s.crackStage + 1);
    s.lostCopies = Math.min(gameCfg.copies, s.lostCopies + 1);
    return { state: s, event: 'season' };
  }
  // ზაფხული დასრულდა → ჩამონგრევა
  s.crackStage = gameCfg.crack_stages - 1;
  return { state: s, event: 'collapse' };
}

/** ჩამონგრევის შემდეგ: ახალი შენობა, ახალი ციკლი. */
export function nextCycle(state, gameCfg) {
  return { ...initialState(state.cycle + 1, gameCfg.seasons), visited: state.visited };
}

// ---------- ეფექტები (DOM) ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** შავი ინტერტიტრი ფილმის სტილში. */
export async function showIntertitle(text, ms = 1500) {
  const el = document.getElementById('intertitle');
  el.querySelector('p').textContent = text;
  el.hidden = false;
  el.classList.remove('out');
  // reflow → fade-in
  void el.offsetWidth;
  el.classList.add('in');
  await sleep(ms);
  el.classList.remove('in');
  el.classList.add('out');
  await sleep(350);
  el.hidden = true;
  el.classList.remove('out');
}

/** ბათქაშის ნამსხვრევები. */
export function plasterDebris(count = 90) {
  const box = document.getElementById('debris');
  box.replaceChildren();
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    const size = 3 + Math.random() * 11;
    p.style.left = `${Math.random() * 100}%`;
    p.style.width = `${size}px`;
    p.style.height = `${size * (0.6 + Math.random() * 0.8)}px`;
    p.style.animationDelay = `${Math.random() * 1.6}s`;
    p.style.animationDuration = `${1.2 + Math.random() * 1.4}s`;
    p.style.setProperty('--drift', `${(Math.random() - 0.5) * 120}px`);
    p.style.setProperty('--spin', `${(Math.random() - 0.5) * 720}deg`);
    box.append(p);
  }
  setTimeout(() => box.replaceChildren(), 4200);
}

/** მთლიანი ჩამონგრევის სცენა: შერყევა → ნამსხვრევები → ჩარჩოები ცვივა → ინტერტიტრი. */
export async function collapseScene() {
  document.body.classList.add('shaking');
  plasterDebris();
  await sleep(900);
  document.body.classList.add('collapsing');
  await sleep(1700);
  document.body.classList.remove('shaking');
  const p = showIntertitle(COLLAPSE_TEXT, 2600);
  await sleep(400);
  document.body.classList.remove('collapsing');
  await p;
}
