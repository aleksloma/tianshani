// ტესტების დამხმარე: დროებითი settings.json + ბაზა, სერვერი თავისუფალ პორტზე (in-process), SSE-ის წაკითხვა.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.MOCK_DELAY_MS = '0';

/** ქმნის დროებით საქაღალდეს settings.json-ით და აბრუნებს მის გზას. */
export function tempSettings(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tianshani-test-'));
  const base = {
    server: { port: 0, host: '127.0.0.1' },
    gemini: { api_key: '', mock: true },
    limits: { max_requests_per_minute: 1000 },
    admin: { password: 'test-admin-pass' },
    logging: { db_path: path.join(dir, 'test.db') },
  };
  const merged = deepMerge(base, overrides);
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify(merged, null, 2));
  return { dir, file };
}

function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? deepMerge(a[k], v) : v;
  }
  return out;
}

/** სერვერის გაშვება ტესტისთვის. აბრუნებს { base, close, cfg, store }. */
export async function startTestServer(overrides = {}) {
  const { file } = tempSettings(overrides);
  process.env.SETTINGS_PATH = file;
  for (const k of ['PORT', 'HOST', 'GEMINI_API_KEY', 'ADMIN_PASSWORD', 'DB_PATH', 'GEMINI_MOCK', 'GLOBAL_MONTHLY_USD']) delete process.env[k];
  const { loadConfig } = await import('../src/config.js');
  const { createApp } = await import('../src/server.js');
  const cfg = loadConfig();
  const { app, store } = createApp(cfg);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base, cfg, store,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => { store.close(); r(); }); }),
  };
}

/** მარტივი cookie jar. */
export function cookieJar() {
  const jar = new Map();
  return {
    header() { return [...jar].map(([k, v]) => `${k}=${v}`).join('; '); },
    store(res) {
      for (const c of res.headers.getSetCookie?.() || []) {
        const [kv] = c.split(';');
        const i = kv.indexOf('=');
        jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
      }
    },
    get(k) { return jar.get(k); },
    set(k, v) { jar.set(k, v); },
  };
}

/** POST /api/chat და SSE-ის სრული წაკითხვა. */
export async function chat(base, body, { jar = null, headers = {} } = {}) {
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(jar ? { cookie: jar.header() } : {}), ...headers },
    body: JSON.stringify(body),
  });
  jar?.store(res);
  if (!(res.headers.get('content-type') || '').includes('text/event-stream')) {
    return { status: res.status, json: await res.json(), events: [] };
  }
  const text = await res.text();
  const events = text.split('\n\n').filter(Boolean).map((chunk) => JSON.parse(chunk.replace(/^data:\s*/, '')));
  const done = events.find((e) => e.done) || null;
  const reply = events.filter((e) => e.delta).map((e) => e.delta).join('');
  return { status: res.status, events, done, reply, error: events.find((e) => e.error)?.error || null };
}

export const userMsg = (content) => [{ role: 'user', content }];
export const GS = { season: 'autumn', crackStage: 0, lostCopies: 0, cycle: 1 };
