// Round 8: ხელნაწერის ეგზემპლარები — გადაცემა, დაკარგვა, უკან დაბრუნება.
// მდგომარეობა localStorage-ში (tianshani.copies), იწერება მხოლოდ saveCopies()-ით. ყველა ცვლილება ახალ ობიექტს აბრუნებს.
// სუფთა ფუნქციები DOM-ის გარეშე — იყენებს კლიენტი (app.js, chat.js), სერვერი (prompt.js, server.js) და unit ტესტები.
import { getJSON, setJSON, KEYS } from './storage.js';
import { withDefaults, dateFor, MONTHS_KA_FROM } from './calendar.js';
import { toward, dative, genitive } from './names.js';

export const INTEGRITY = ['full', 'half', 'quarter', 'page', 'none'];
export const INTEGRITY_KA = { full: 'მთელი', half: 'ნახევარი', quarter: 'მეოთხედი', page: 'ერთი ფურცელი' };
/** „…ეგზემპლარის ნახევარს აწვდის“ (§3.3) */
export const INTEGRITY_ACC_KA = { half: 'ნახევარს', quarter: 'მეოთხედს', page: 'ერთ ფურცელს' };
export const INTEGRITY_EN = { full: 'whole', half: 'half', quarter: 'a quarter', page: 'a single page' };
export const STATUSES = ['in_hand', 'held', 'lost'];
export const EVENT_KINDS = ['stalled', 'fragment', 'passed_on', 'misplaced', 'damaged'];
export const ACTION_TYPES = ['hand_over', 'retrieve'];

/** game.manuscript (settings.example.json) — ნაკლული ველები დეფოლტით. */
export const MANUSCRIPT_DEFAULTS = {
  probability_scale: 1,
  stray_page_probability: 0.4,
  chain_floor: 0.15,
  chain_ceiling: 0.9,
  chain_override: null,
  event_override: null,
};

export function manuscriptConfig(cfgGame) {
  const m = { ...MANUSCRIPT_DEFAULTS, ...((cfgGame && cfgGame.manuscript) || {}) };
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  return {
    probability_scale: num(m.probability_scale, 1),
    stray_page_probability: Math.min(1, num(m.stray_page_probability, 0.4)),
    chain_floor: Math.min(1, num(m.chain_floor, 0.15)),
    chain_ceiling: Math.min(1, num(m.chain_ceiling, 0.9)),
    chain_override: ['arrive', 'lose'].includes(m.chain_override) ? m.chain_override : null,
    event_override: EVENT_KINDS.includes(m.event_override) ? m.event_override : null,
  };
}

// ---------- დეტერმინისტული შემთხვევითობა (§4.4) ----------

/** FNV-1a, 32 ბიტი. */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (const ch of String(str)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: seed → ფუნქცია, რომელიც [0, 1) რიცხვებს აბრუნებს. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** rng ქარხანა ერთი ნაბიჯისთვის: copyId → mulberry32(hash(`${clientId}|${cycle}|${copyId}|${day}`)). */
export function rngFactory(clientId, cycle, day) {
  return (copyId) => mulberry32(hash32(`${clientId}|${cycle}|${copyId}|${day}`));
}

// ---------- მდგომარეობა ----------

export function initialCopies(cfgGame, cycle = 1) {
  const n = withDefaults(cfgGame).copies;
  const copies = [];
  for (let id = 1; id <= n; id++) {
    copies.push({ id, status: 'in_hand', holder: null, givenDay: null, integrity: 'full', claim: null, lossVerified: false, events: [] });
  }
  return { cycle, copies, strayPages: [] };
}

function validStore(s, n, cycle) {
  return s && typeof s === 'object' && s.cycle === cycle && Array.isArray(s.copies) && s.copies.length === n
    && s.copies.every((c, i) => c && c.id === i + 1 && STATUSES.includes(c.status) && INTEGRITY.includes(c.integrity) && Array.isArray(c.events))
    && Array.isArray(s.strayPages);
}

/** ჩატვირთვა; თუ არ არის, დაზიანებულია ან სხვა ციკლისაა (ჩამონგრევა) — სამი ახალი ეგზემპლარი ხელში. */
export function loadCopies(cfgGame, cycle = 1) {
  const n = withDefaults(cfgGame).copies;
  const s = getJSON(KEYS.copies, null);
  if (validStore(s, n, cycle)) return s;
  const fresh = initialCopies(cfgGame, cycle);
  saveCopies(fresh);
  return fresh;
}

/** tianshani.copies-ის ერთადერთი ჩამწერი. */
export function saveCopies(store) {
  setJSON(KEYS.copies, store);
}

// ---------- მოთხოვნები ----------

export const copiesInHand = (store) => store.copies.filter((c) => c.status === 'in_hand').length;
/** ნამდვილად დაკარგული (ტესტები, სერვერი). */
export const lostCount = (store) => store.copies.filter((c) => c.status === 'lost').length;
/** Round 9 §4.2: რაც ავტორმა იცის — დაკარგული, რომლის „გადავეცი“ ჯერ არ გადამოწმებულა, ჯერ არსებობს. */
export const knownLostCount = (store) => store.copies.filter((c) => c.status === 'lost' && !(c.claim && !c.claim.verified)).length;
/** რამდენი ეგზემპლარი არსებობს ავტორის ცოდნით (თავზე „2/3“). */
export const existingCount = (store) => store.copies.length - knownLostCount(store);
export const copyHeldBy = (store, id) => store.copies.find((c) => c.status === 'held' && c.holder === id) || null;

/** ხელში არსებულიდან საუკეთესო: ყველაზე მთელი, შემდეგ ყველაზე პატარა ნომერი. */
export function bestCopyInHand(store) {
  const inHand = store.copies.filter((c) => c.status === 'in_hand');
  inHand.sort((a, b) => INTEGRITY.indexOf(a.integrity) - INTEGRITY.indexOf(b.integrity) || a.id - b.id);
  return inHand[0] || null;
}

/** მომხმარებელს ჯერ არ შეუტყვია (ბოლო მფლობელისგან), რომ ეს ეგზემპლარი დაიკარგა? */
const lossUntold = (c) => (c.claim ? !c.claim.verified : !c.lossVerified);

/**
 * რომელი ეგზემპლარი შეიძლება მოსთხოვო id-ს (§3.1, §5.2): ჯერ ის, რაც მასთანაა; მერე მასთან დაკარგული, რაც ჯერ არ უთქვამს;
 * მერე ის, რაც მისი თქმით სხვას გადასცა (გადაცემა შეიძლება მართლა შედგა — მაშინ ეგზემპლარი უკვე სხვასთანაა).
 */
export function retrievableFrom(store, id) {
  return copyHeldBy(store, id)
    || store.copies.find((c) => c.status === 'lost' && c.holder === id && lossUntold(c))
    || store.copies.find((c) => c.claim && c.claim.from === id && !c.claim.verified)
    || null;
}

/** ღილაკის რეჟიმი (§3.1): 'retrieve' | 'hand_over' | null. უხილავებთან (proxy) — არასდროს. */
export function buttonMode(store, id, reachable) {
  if (!reachable) return null;
  if (retrievableFrom(store, id)) return 'retrieve';
  if (!copyHeldBy(store, id) && copiesInHand(store) > 0) return 'hand_over';
  return null;
}

/** ბოლო მოვლენა, რომელიც id-მ თქვა ამ ეგზემპლარზე (თუ არ არის — ბოლო მოვლენა საერთოდ). */
export function lastEventBy(copy, id) {
  for (let i = copy.events.length - 1; i >= 0; i--) if (copy.events[i].actor === id) return copy.events[i];
  return copy.events.at(-1) || null;
}

// ---------- ცვლილებები (ყოველთვის ახალი ობიექტი) ----------

function mapCopy(store, copyId, fn) {
  return { ...store, copies: store.copies.map((c) => (c.id === copyId ? fn(c) : c)) };
}

/** §3.3 accepted: ეგზემპლარი პერსონაჟთანაა, მთლიანობა უცვლელი. */
export function applyHandOver(store, copyId, characterId, day) {
  return mapCopy(store, copyId, (c) => ({ ...c, status: 'held', holder: characterId, givenDay: day, claim: null, lossVerified: false }));
}

/** §3.3 returned: ისევ ხელშია; ნაწილი ნაწილად ბრუნდება. */
export function applyReturn(store, copyId) {
  return mapCopy(store, copyId, (c) => ({ ...c, status: 'in_hand', holder: null, givenDay: null, claim: null, lossVerified: false }));
}

/** §3.3 not_returned: მომხმარებელმა უკვე იცის — claim დადასტურდა ან დაკარგვა ეთქვა. */
export function applyNotReturned(store, copyId) {
  return mapCopy(store, copyId, (c) => (c.claim ? { ...c, claim: { ...c.claim, verified: true } } : { ...c, lossVerified: true }));
}

/** §5.3: T-სთან საუბრის გახსნა — ყველა claim, რომელიც T-ს ასახელებს, დადასტურებულია (უხილავს ვერავინ ჰკითხავს). */
export function verifyClaimsFor(store, characterId, byId = {}) {
  if (!byId[characterId]?.reachable) return store;
  if (!store.copies.some((c) => c.claim && c.claim.to === characterId && !c.claim.verified)) return store;
  return { ...store, copies: store.copies.map((c) => (c.claim && c.claim.to === characterId && !c.claim.verified ? { ...c, claim: { ...c.claim, verified: true } } : c)) };
}

/** §4.6: R-სთან საუბარი გაიხსნა — მისი ფურცლები სიაში ჩანს. */
export function markStraySeen(store, characterId) {
  if (!store.strayPages.some((p) => p.character === characterId && !p.seen)) return store;
  return { ...store, strayPages: store.strayPages.map((p) => (p.character === characterId ? { ...p, seen: true } : p)) };
}

// ---------- დროის ნაბიჯი (§4, §5) ----------

function pickWeighted(events, r) {
  const total = events.reduce((s, e) => s + (Number(e.weight) > 0 ? Number(e.weight) : 0), 0);
  if (total <= 0) return events[0];
  let x = r * total;
  for (const e of events) {
    const w = Number(e.weight) > 0 ? Number(e.weight) : 0;
    if (x < w) return e;
    x -= w;
  }
  return events.at(-1);
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** §5.1: p_arrive = (1 − p_event[H]) × (1 − p_event[T]), [chain_floor, chain_ceiling]-ში. */
export function arriveProbability(behaviour, from, to, mcfg) {
  const pH = Number(behaviour[from]?.p_event) || 0;
  const pT = Number(behaviour[to]?.p_event) || 0;
  return clamp((1 - pH) * (1 - pT), mcfg.chain_floor, mcfg.chain_ceiling);
}

/** შეუძლია T-ს ეგზემპლარის მიღება ჯაჭვით? (ხილულია და ცხრილშია accepts-ით ან chain_only-ით) */
function chainTarget(behaviour, byId, to) {
  const b = behaviour[to];
  return Boolean(byId[to]?.reachable && b && (b.accepts === true || b.chain_only === true));
}

/**
 * ერთი ნაბიჯი (ერთი დახურვა): ყოველ ხელში არ მყოფ (held) ეგზემპლარზე მაქსიმუმ ერთი მოვლენა.
 * rngFor(copyId) → () => [0,1). აბრუნებს { store, notes: [{ character, copyId, text_ka }] } — რას ამბობს მფლობელი.
 */
export function applyStep(store, cfgGame, behaviour, day, rngFor, byId = {}) {
  const mcfg = manuscriptConfig(cfgGame);
  const notes = [];
  let strayPages = [...store.strayPages];
  const hasStray = (id) => strayPages.some((p) => p.character === id);
  const addStray = (character, copyId) => { if (!hasStray(character)) strayPages.push({ character, copyId, day, seen: false }); };
  const visibleIds = Object.keys(byId).filter((id) => byId[id]?.reachable).sort();

  const copies = store.copies.map((copy) => {
    if (copy.status !== 'held') return copy;
    const holder = copy.holder;
    const B = behaviour[holder];
    if (!B || !Array.isArray(B.events) || !B.events.length) return copy;
    const age = day - (Number(copy.givenDay) || 0);
    if (age < (Number(B.min_days) || 0)) return copy;
    const rng = rngFor(copy.id);
    if (!(rng() < Math.min(1, (Number(B.p_event) || 0) * mcfg.probability_scale))) return copy;
    const forced = mcfg.event_override && B.events.find((e) => e.kind === mcfg.event_override);
    const ev = forced || pickWeighted(B.events, rng());
    const to = ev.to || null;
    const event = { day, actor: holder, kind: ev.kind, text_ka: ev.text_ka, to };
    let next = { ...copy, events: [...copy.events, event] };
    const strayOnLoss = () => {
      if (!(rng() < mcfg.stray_page_probability)) return;
      const pool = visibleIds.filter((id) => id !== holder && id !== to && !hasStray(id));
      if (pool.length) addStray(pool[Math.floor(rng() * pool.length)], copy.id);
    };
    const lose = (extra = {}) => { next = { ...next, status: 'lost', integrity: 'none', claim: null, lossVerified: false, ...extra }; strayOnLoss(); };

    if (ev.kind === 'fragment') {
      const integrity = INTEGRITY[Math.min(INTEGRITY.length - 1, INTEGRITY.indexOf(copy.integrity) + 1)];
      if (integrity === 'none') lose();
      else {
        next = { ...next, integrity };
        if (to && byId[to]?.reachable && rng() < mcfg.stray_page_probability) addStray(to, copy.id);
      }
    } else if (ev.kind === 'passed_on' && to) {
      const claim = { from: holder, to, kind: 'passed_on', day, verified: false };
      const arrives = chainTarget(behaviour, byId, to)
        && (mcfg.chain_override ? mcfg.chain_override === 'arrive' : rng() < arriveProbability(behaviour, holder, to, mcfg));
      if (arrives) next = { ...next, holder: to, givenDay: day, claim: { ...claim, arrived: true }, lossVerified: false };
      else lose({ claim: { ...claim, arrived: false } });
    } else if (ev.kind === 'misplaced' || ev.kind === 'damaged') {
      lose();
    }
    // stalled: მხოლოდ საბაბი ჩაიწერა
    notes.push({ character: holder, copyId: copy.id, text_ka: ev.text_ka });
    return next;
  });
  return { store: { ...store, copies, strayPages }, notes };
}

// ---------- სერვერისთვის (§3.3) ----------

export function summaryForServer(store) {
  const total = store.copies.length;
  const inHand = copiesInHand(store);
  const lost = lostCount(store);
  return {
    inHand, lost, knownLost: knownLostCount(store), total,
    copies: store.copies.map((c) => ({
      id: c.id, status: c.status, holder: c.holder, givenDay: c.givenDay, integrity: c.integrity,
      claim: c.claim, lossVerified: c.lossVerified, events: c.events.slice(-6),
    })),
    strayPages: store.strayPages.map(({ character, copyId }) => ({ character, copyId })),
  };
}

// ---------- ტექსტები (§3.2, §3.3, §8.3) ----------

const shortOf = (byId, id) => byId[id]?.short_name_ka || id;

/** ჩატის რემარკა: „*ალექსანდრე ვასოს ხელნაწერის ეგზემპლარს აწვდის.*“ / „*ავტორი ვასოს ეგზემპლარს უკან სთხოვს.*“ */
export function actionText(type, author, shortName, integrity = 'full') {
  const who = String(author || '').trim() || 'ავტორი';
  const to = dative(shortName);
  if (type === 'retrieve') return `*${who} ${to} ეგზემპლარს უკან სთხოვს.*`;
  if (INTEGRITY_ACC_KA[integrity]) return `*${who} ${to} ხელნაწერის ეგზემპლარის ${INTEGRITY_ACC_KA[integrity]} აწვდის.*`;
  return `*${who} ${to} ხელნაწერის ეგზემპლარს აწვდის.*`;
}

// ---------- Round 9: მოქმედება ჩატის ველზე „მიმაგრებულია“ (§1) და ორი ხატულა (§2) ----------

/** ღილაკის `data-mode`: გადაცემა → give, გამორთმევა → take. */
export const MODE_ATTR = { hand_over: 'give', retrieve: 'take' };

const SVG_OPEN = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const SHEET = '<path d="M5 3h8l4 4v6"/><path d="M13 3v4h4"/><path d="M5 3v18h7"/>';
/** ფურცელი მოკეცილი კუთხით; ისარი გადის (give) ან შემოდის (take). */
export const ACTION_ICONS = {
  give: `${SVG_OPEN}${SHEET}<path d="M14 17h7"/><path d="M18 14l3 3-3 3"/></svg>`,
  take: `${SVG_OPEN}${SHEET}<path d="M21 17h-7"/><path d="M17 14l-3 3 3 3"/></svg>`,
};

/** მიმაგრების ფურცელი: „ეგზემპლარი №2 — გადაცემა“, „ეგზემპლარის ნახევარი №2 — გადაცემა“, „ეგზემპლარი №2 — გამორთმევა“. */
export function attachText(type, copyId, integrity = 'full') {
  if (type === 'retrieve') return `ეგზემპლარი №${copyId} — გამორთმევა`;
  if (integrity !== 'full' && INTEGRITY_KA[integrity]) return `ეგზემპლარის ${INTEGRITY_KA[integrity]} №${copyId} — გადაცემა`;
  return `ეგზემპლარი №${copyId} — გადაცემა`;
}

/** შეტყობინება: რემარკა და, თუ მომხმარებელმა რამე დაწერა, ახალ ხაზზე — მისი სიტყვები. */
export function actionMessage(stage, typed = '') {
  const t = String(typed || '').trim();
  return t ? `${stage}\n${t}` : stage;
}

/** გაგზავნისას: მიმაგრება ისევ მართებულია? (ეგზემპლარი ისევ ხელშია / ისევ ამ პერსონაჟთან შეიძლება მოთხოვნა) */
export function attachmentValid(store, att, characterId, reachable) {
  if (!att || !store) return false;
  if (buttonMode(store, characterId, reachable) !== att.type) return false;
  if (att.type === 'hand_over') return store.copies.some((c) => c.id === att.copyId && c.status === 'in_hand');
  return retrievableFrom(store, characterId)?.id === att.copyId;
}

const part = (integrity) => (integrity !== 'full' && INTEGRITY_KA[integrity] ? ` (${INTEGRITY_KA[integrity]})` : '');
/** „ვასოს თქმით, … კოტეს გადასცა“ — მთქმელი ნათესაობითში (ოთარის, ვაჟა ზაზაევიჩის), მიმღები მიცემითში. */
const claimSaid = (byId, claim) => `${genitive(shortOf(byId, claim.from))} თქმით,`;

/** ჩატის თავში ხაზი (§3.2) id-სთან საუბრისას; რამდენიმე — „ · “-ით. ცარიელი → დამალული. */
export function statusLines(store, id, day, byId = {}) {
  const lines = [];
  for (const c of store.copies) {
    if (c.claim && !c.claim.verified && c.claim.from === id) {
      lines.push(`${claimSaid(byId, c.claim)} ეგზემპლარი №${c.id} ${dative(shortOf(byId, c.claim.to))} გადასცა`);
    } else if (c.status === 'held' && c.holder === id) {
      lines.push(`ეგზემპლარი №${c.id} ${toward(shortOf(byId, id))}აა ${Math.max(0, day - (Number(c.givenDay) || 0))} დღეა${part(c.integrity)}`);
    } else if (c.status === 'lost' && c.holder === id && !lossUntold(c)) {
      lines.push(`ეგზემპლარი №${c.id} დაკარგულია: ${lastEventBy(c, id)?.text_ka || ''}`.trim());
    }
  }
  return lines.join(' · ');
}

/** „15 ოქტომბრიდან“ */
export function sinceDate(cfgGame, day) {
  const d = dateFor(cfgGame, day);
  return `${d.getUTCDate()} ${MONTHS_KA_FROM[d.getUTCMonth()]}`;
}

/** ეგზემპლარების სია (§8.3): თითო ხაზი თითო ეგზემპლარზე, ნომრის მიხედვით. */
export function ledgerLines(store, byId = {}, cfgGame = {}) {
  return store.copies.map((c) => {
    let line;
    if (c.claim && !c.claim.verified) {
      line = `№${c.id} — ${claimSaid(byId, c.claim)} ${dative(shortOf(byId, c.claim.to))} გადასცა`;
    } else if (c.status === 'in_hand') {
      line = `№${c.id} — თქვენთან${part(c.integrity)}`;
    } else if (c.status === 'held') {
      line = `№${c.id} — ${toward(shortOf(byId, c.holder))} ${sinceDate(cfgGame, c.givenDay)}${part(c.integrity)}`;
    } else if (c.claim && c.claim.arrived === false && byId[c.claim.to]?.reachable) {
      line = `№${c.id} — დაკარგულია: ${shortOf(byId, c.claim.to)} ამბობს, არაფერი მიუღია.`;
    } else {
      line = `№${c.id} — დაკარგულია: ${lastEventBy(c, c.holder)?.text_ka || ''} (${shortOf(byId, c.holder)})`;
    }
    for (const p of store.strayPages) {
      if (p.copyId === c.id && p.seen) line += ` · ერთი ფურცელი ${toward(shortOf(byId, p.character))}`;
    }
    return line;
  });
}
