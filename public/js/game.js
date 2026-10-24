// თამაშის მექანიკა: შიდა კალენდარი (დღეები), სეზონები, ბზარი, ეგზემპლარები, ჩამონგრევა.
// მდგომარეობა localStorage-ში (tianshani.game): მხოლოდ { cycle, day, exchanges, lastCharacterId, visited }.
// ყველაფერი, რაც დღიდან გამომდინარეობს (სეზონი, ბზარი, ეგზემპლარები), ხელახლა ითვლება; ჩარჩოების/ნახატის მდგომარეობა არასდროს ინახება.
import { getJSON, setJSON, KEYS } from './storage.js';
import { derive, advanceDays, withDefaults, clampDay, dayFromSeason } from './calendar.js';

// Round 4 §2: ფილმის საბაბები — ეგზემპლარების tooltip-იც და დაკარგვისას გამოჩენილი ფურცელიც
export const LOST_COPY_NOTES = [
  'ერთი ეგზემპლარი თინას უჯრაში დარჩა — სამი თვეა იქ დევს.',
  'ერთი ეგზემპლარი ბანკში (ან ცირკში) დარჩა.',
  'ერთი ეგზემპლარი ოთხად გაიყო — თითო ნაწილი თითო კოლეგასთან.',
];
export const COLLAPSE_TEXT = 'შენობა ჩამოინგრა. ახალი შენობა. ყველაფერი თავიდან.';

export function initialState(cycle = 1) {
  return { cycle, day: 0, exchanges: 0, lastCharacterId: null, visited: [], paintingFallen: false };
}

/** მდგომარეობა + გამოთვლილი ველები (season, crackStage, lostCopies, dayInSeason, daysLeft, progress). */
export function withDerived(state, cfgRaw) {
  const d = derive(state.day, cfgRaw);
  return { ...state, season: d.season, seasonIndex: d.seasonIndex, dayInSeason: d.dayInSeason, daysLeft: d.daysLeft, progress: d.progress, crackStage: d.crackStage, lostCopies: d.lostCopies };
}

export function loadState(cfgRaw) {
  const cfg = withDefaults(cfgRaw);
  const s = getJSON(KEYS.game, null);
  if (!s || typeof s !== 'object') return withDerived(initialState(1), cfg);
  // ძველი ფორმატი (სეზონი დღეების გარეშე) → სეზონის პირველი დღე
  const day = Number.isInteger(s.day) ? clampDay(s.day, cfg) : dayFromSeason(s.season, cfg);
  return withDerived({
    cycle: Number.isInteger(s.cycle) && s.cycle > 0 ? s.cycle : 1,
    day,
    exchanges: Number.isInteger(s.exchanges) && s.exchanges >= 0 ? s.exchanges : 0,
    lastCharacterId: typeof s.lastCharacterId === 'string' ? s.lastCharacterId : null,
    visited: Array.isArray(s.visited) ? s.visited.filter((x) => typeof x === 'string') : [],
    paintingFallen: false, // დროებითი UI მდგომარეობა — გადატვირთვაზე სურათი ისევ ეკიდება
  }, cfg);
}

/** ინახება მხოლოდ ის, რაც საჭიროა — არც ერთი ჩარჩოს/სურათის მდგომარეობა. */
export function saveState(state) {
  const { cycle, day, exchanges, lastCharacterId, visited } = state;
  setJSON(KEYS.game, { cycle, day, exchanges, lastCharacterId, visited });
}

function toEvents(r) {
  return [...r.seasons.map((season) => ({ type: 'season', season })), ...(r.collapse ? [{ type: 'collapse' }] : [])];
}

/**
 * ჩატი გაიხსნა. სხვა პერსონაჟთან გადასვლა = +days_per_character_switch დღე; იგივე პერსონაჟი — დრო არ მიდის.
 * აბრუნებს { state, events: [{type:'season', season}…, {type:'collapse'}] }.
 */
export function applyCharacterOpen(state, cfgRaw, characterId) {
  const cfg = withDefaults(cfgRaw);
  const visited = state.visited.includes(characterId) ? state.visited : [...state.visited, characterId];
  if (state.lastCharacterId === characterId) return { state: withDerived({ ...state, visited }, cfg), events: [] };
  const r = advanceDays(state.day, cfg.days_per_character_switch, cfg);
  return { state: withDerived({ ...state, visited, day: r.day, lastCharacterId: characterId }, cfg), events: toEvents(r) };
}

/** შეტყობინება-პასუხი დასრულდა: exchanges++ (სტატისტიკა); days_per_exchange > 0 → დროც მიდის. */
export function applyExchange(state, cfgRaw, characterId) {
  const cfg = withDefaults(cfgRaw);
  const visited = state.visited.includes(characterId) ? state.visited : [...state.visited, characterId];
  const base = { ...state, visited, exchanges: state.exchanges + 1 };
  if (cfg.days_per_exchange <= 0) return { state: withDerived(base, cfg), events: [] };
  const r = advanceDays(state.day, cfg.days_per_exchange, cfg);
  return { state: withDerived({ ...base, day: r.day }, cfg), events: toEvents(r) };
}

/**
 * Round 3 §2: საუბარი დაიხურა (✕, Esc, ჩაბნელებული კედელი, სხვა პერსონაჟზე გადასვლა).
 * +days_per_chat_close დღე, მაგრამ მხოლოდ თუ ამ საუბარში ერთი გაცვლა მაინც შედგა — გახსნა-დახურვა დროს არ ამატებს.
 */
export function applyChatClose(state, cfgRaw, characterId, exchangesInChat = 0) {
  const cfg = withDefaults(cfgRaw);
  if (!(exchangesInChat > 0) || cfg.days_per_chat_close <= 0) return { state: withDerived(state, cfg), events: [] };
  const r = advanceDays(state.day, cfg.days_per_chat_close, cfg);
  return { state: withDerived({ ...state, day: r.day }, cfg), events: toEvents(r) };
}

/** Round 5 §2: „ყველაფრის განულება“ — ახალი შენობა თავიდან: ციკლი 1, დღე 0 (შემოდგომა), არავინ ნანახი. */
export function freshState(cfgRaw) {
  return withDerived(initialState(1), cfgRaw);
}

/** ჩამონგრევის შემდეგ: ახალი შენობა, ახალი ციკლი, დღე 0, სურათი ისევ ეკიდება. */
export function nextCycle(state, cfgRaw) {
  return withDerived({ ...initialState(state.cycle + 1), visited: state.visited }, cfgRaw);
}

// ---------- ეფექტები (DOM) ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** შავი ინტერტიტრი ფილმის სტილში. */
export async function showIntertitle(text, ms = 1500) {
  const el = document.getElementById('intertitle');
  el.querySelector('p').textContent = text;
  el.hidden = false;
  el.classList.remove('out');
  void el.offsetWidth; // reflow → fade-in
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
