// SQLite (better-sqlite3): სქემა და მიგრაცია სტარტზე. ფაილი: logging.db_path (დეფოლტი data/tianshani.db, gitignored).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clients (
  client_id  TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen  TEXT NOT NULL,
  user_agent TEXT,
  ip_hash    TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id     TEXT NOT NULL,
  character_id  TEXT NOT NULL,
  spoken_by     TEXT,
  role          TEXT NOT NULL,
  content       TEXT NOT NULL,
  lang_guess    TEXT,
  input_tokens  INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  season        TEXT,
  cycle         INTEGER,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_client ON messages(client_id, character_id, id);
CREATE TABLE IF NOT EXISTS global_usage (
  period_key    TEXT PRIMARY KEY,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd      REAL NOT NULL DEFAULT 0,
  requests      INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usage (
  client_id     TEXT NOT NULL,
  period_key    TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  requests      INTEGER NOT NULL DEFAULT 0,
  first_seen    TEXT NOT NULL,
  last_seen     TEXT NOT NULL,
  PRIMARY KEY (client_id, period_key)
);
`;

/** ბაზის გახსნა/შექმნა. აბრუნებს { db, secret, ...helpers }. */
export function openDb(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  // Round 3: ახალი სვეტები არსებულ ბაზაზეც (ALTER TABLE მხოლოდ თუ ჯერ არ არის)
  const addColumn = (table, col, type) => {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  };
  addColumn('clients', 'user_name', 'TEXT');               // §1 — ბოლოს მითითებული სახელი
  addColumn('messages', 'user_name', 'TEXT');              // §1
  addColumn('messages', 'proofread_original', 'TEXT');     // §4 — პასუხი კორექტურამდე (თუ შეიცვალა)
  addColumn('messages', 'proofread_changed', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('messages', 'long_reply', 'INTEGER NOT NULL DEFAULT 0');          // Round 4 §9 — > 3 წინადადება

  // ინსტალაციის საიდუმლო: ადმინის cookie-ს ხელმოწერა და IP-ს ჰეში. რეპოში არასდროს ხვდება.
  let row = db.prepare('SELECT value FROM meta WHERE key = ?').get('secret');
  if (!row) {
    const secret = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('secret', secret);
    row = { value: secret };
  }
  const secret = row.value;
  const now = () => new Date().toISOString();

  const stmts = {
    upsertClient: db.prepare(`
      INSERT INTO clients (client_id, first_seen, last_seen, user_agent, ip_hash) VALUES (@client_id, @now, @now, @ua, @ip)
      ON CONFLICT(client_id) DO UPDATE SET last_seen = @now, user_agent = COALESCE(@ua, user_agent), ip_hash = COALESCE(@ip, ip_hash)`),
    insertMessage: db.prepare(`
      INSERT INTO messages (client_id, character_id, spoken_by, role, content, lang_guess, input_tokens, output_tokens, season, cycle, created_at, user_name, proofread_original, proofread_changed, long_reply)
      VALUES (@client_id, @character_id, @spoken_by, @role, @content, @lang_guess, @input_tokens, @output_tokens, @season, @cycle, @created_at, @user_name, @proofread_original, @proofread_changed, @long_reply)`),
    setClientName: db.prepare('UPDATE clients SET user_name = ? WHERE client_id = ?'),
    getUsage: db.prepare('SELECT * FROM usage WHERE client_id = ? AND period_key = ?'),
    addUsage: db.prepare(`
      INSERT INTO usage (client_id, period_key, input_tokens, output_tokens, requests, first_seen, last_seen)
      VALUES (@client_id, @period_key, @input, @output, 1, @now, @now)
      ON CONFLICT(client_id, period_key) DO UPDATE SET
        input_tokens = input_tokens + @input, output_tokens = output_tokens + @output, requests = requests + 1, last_seen = @now`),
    resetUsage: db.prepare('DELETE FROM usage WHERE client_id = ? AND period_key = ?'),
    getGlobal: db.prepare('SELECT * FROM global_usage WHERE period_key = ?'),
    addGlobal: db.prepare(`
      INSERT INTO global_usage (period_key, input_tokens, output_tokens, cost_usd, requests, updated_at)
      VALUES (@period_key, @input, @output, @cost, 1, @now)
      ON CONFLICT(period_key) DO UPDATE SET
        input_tokens = input_tokens + @input, output_tokens = output_tokens + @output, cost_usd = cost_usd + @cost,
        requests = requests + 1, updated_at = @now`),
    resetGlobal: db.prepare('DELETE FROM global_usage WHERE period_key = ?'),
  };

  return {
    db,
    secret,
    hashIp(ip) { return ip ? crypto.createHmac('sha256', secret).update(String(ip)).digest('hex').slice(0, 16) : null; },
    touchClient(clientId, ua, ip) {
      stmts.upsertClient.run({ client_id: clientId, now: now(), ua: ua ? String(ua).slice(0, 300) : null, ip: this.hashIp(ip) });
    },
    logMessage(m) {
      stmts.insertMessage.run({
        spoken_by: null, lang_guess: null, input_tokens: 0, output_tokens: 0, season: null, cycle: null, created_at: now(),
        user_name: null, proofread_original: null, proofread_changed: 0, long_reply: 0, ...m,
      });
    },
    setClientName(clientId, name) { if (name) stmts.setClientName.run(name, clientId); },
    getUsage(clientId, periodKey) {
      return stmts.getUsage.get(clientId, periodKey) || { input_tokens: 0, output_tokens: 0, requests: 0 };
    },
    addUsage(clientId, periodKey, input, output) {
      stmts.addUsage.run({ client_id: clientId, period_key: periodKey, input, output, now: now() });
    },
    resetUsage(clientId, periodKey) { return stmts.resetUsage.run(clientId, periodKey).changes; },
    // გლობალური თვიური ხარჯი (ყველა ბრაუზერი ერთად)
    getGlobal(periodKey) {
      return stmts.getGlobal.get(periodKey) || { period_key: periodKey, input_tokens: 0, output_tokens: 0, cost_usd: 0, requests: 0 };
    },
    addGlobal(periodKey, input, output, cost) {
      stmts.addGlobal.run({ period_key: periodKey, input, output, cost, now: now() });
    },
    resetGlobal(periodKey) { return stmts.resetGlobal.run(periodKey).changes; },
    close() { db.close(); },
  };
}
