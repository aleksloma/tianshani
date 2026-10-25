// localStorage — ყველა read/write try/catch-ში. მიუწვდომლობისას მეხსიერებაში მუშაობს.
const memory = new Map();
let available = true;

try {
  const k = '__tianshani_probe__';
  window.localStorage.setItem(k, '1');
  window.localStorage.removeItem(k);
} catch {
  available = false;
}

export const KEYS = { chats: 'tianshani.chats', game: 'tianshani.game', client: 'tianshani.client_id', userName: 'tianshani.user_name', copies: 'tianshani.copies' };

// --- Round 3 §1: მომხმარებლის სახელი (მაქს. 40 სიმბოლო) ---
export const USER_NAME_MAX = 40;
export function normalizeUserName(v) { return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, USER_NAME_MAX); }
export function getUserName() { const v = getJSON(KEYS.userName, ''); return typeof v === 'string' ? normalizeUserName(v) : ''; }
export function setUserName(v) { setJSON(KEYS.userName, normalizeUserName(v)); }

export function storageAvailable() { return available; }

export function getJSON(key, fallback) {
  try {
    const raw = available ? window.localStorage.getItem(key) : memory.get(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setJSON(key, value) {
  const raw = JSON.stringify(value);
  try {
    if (available) window.localStorage.setItem(key, raw);
    else memory.set(key, raw);
  } catch {
    // ქვოტა ამოიწურა ან ბლოკია — მეხსიერებაში მაინც შევინახოთ
    available = false;
    memory.set(key, raw);
  }
}

export function removeKey(key) {
  try { if (available) window.localStorage.removeItem(key); } catch { /* ignore */ }
  memory.delete(key);
}

/** ანონიმური ბრაუზერის ID (UUID). სერვერიც httpOnly cookie-ს აყენებს — cookie პრიორიტეტულია. */
export function clientId() {
  let id = getJSON(KEYS.client, null);
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
    id = window.crypto?.randomUUID ? window.crypto.randomUUID() : fallbackUuid();
    setJSON(KEYS.client, id);
  }
  return id;
}

function fallbackUuid() {
  const b = new Uint8Array(16);
  window.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// --- საუბრები: { [characterId]: [{role, content, ts, spoken_by?, redirect?}] } ---

/**
 * Round 5 §1 (მიგრაცია): Round 4-ის სკრიპტული პირველი ხაზი (`scripted: true`) ამოღებულია.
 * აბრუნებს ახალ ობიექტს მის გარეშე; პერსონაჟი, ვისაც სხვა არაფერი დარჩა, ქრება. ნაგავზე არ ვარდება.
 */
export function stripScripted(chats) {
  if (!chats || typeof chats !== 'object' || Array.isArray(chats)) return {};
  const out = {};
  for (const [id, msgs] of Object.entries(chats)) {
    if (!Array.isArray(msgs)) continue;
    const kept = msgs.filter((m) => m && typeof m === 'object' && m.scripted !== true);
    if (kept.length) out[id] = kept;
  }
  return out;
}

/** ჩატვირთვისას ერთხელ: tianshani.chats ფიზიკურად იწმინდება (ჩაიწერება მხოლოდ თუ რამე შეიცვალა). true → შეიცვალა. */
export function migrateChats() {
  const raw = getJSON(KEYS.chats, null);
  if (raw == null) return false;
  const clean = stripScripted(raw);
  if (JSON.stringify(clean) === JSON.stringify(raw)) return false;
  setJSON(KEYS.chats, clean);
  return true;
}

export function getChats() { return stripScripted(getJSON(KEYS.chats, {})); }
export function getChat(id) { return getChats()[id] || []; }
export function saveChat(id, messages) {
  const all = getChats();
  all[id] = messages;
  setJSON(KEYS.chats, all);
}
export function clearChat(id) {
  const all = getChats();
  delete all[id];
  setJSON(KEYS.chats, all);
}
export function clearAllChats() { setJSON(KEYS.chats, {}); }
