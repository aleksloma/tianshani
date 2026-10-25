// Round 10 §7.3: დრო პირველ ხილულ delta-მდე (SSE) mock სერვერზე — before/after შედარებისთვის (ჩვეულებრივი პასუხები).
// გამოყენება: node scripts/measure-first-delta.mjs [--runs 40] [--delay 25] [--out test-results/first-delta.json]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const runs = Number(opt('--runs', 40));
const out = opt('--out', 'test-results/first-delta.json');
process.env.MOCK_DELAY_MS = opt('--delay', '25');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tianshani-latency-'));
const settings = path.join(dir, 'settings.json');
fs.writeFileSync(settings, JSON.stringify({ gemini: { api_key: '', mock: true }, limits: { max_requests_per_minute: 100000 }, admin: { password: 'x-latency' }, logging: { db_path: path.join(dir, 'l.db') } }));
process.env.SETTINGS_PATH = settings;
delete process.env.PORT;
const { loadConfig } = await import('../src/config.js');
const { createApp } = await import('../src/server.js');
const { app, store } = createApp(loadConfig({ server: { port: 0 } }));
const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;

const IDS = ['vaso', 'director', 'marksheideri', 'tina', 'bela', 'grisha', 'tamari', 'otari'];
const QS = ['გამარჯობა, როგორ ბრძანდებით?', 'ხელნაწერი წაიკითხეთ?', 'ამინდი როგორ მოგწონთ?', 'ხვალ შემოვიარო?', 'Hello, how are you?', 'Как дела?'];
const rows = [];
for (let i = 0; i < runs; i++) {
  const id = IDS[i % IDS.length];
  const q = QS[i % QS.length];
  const t0 = performance.now();
  const res = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ characterId: id, messages: [{ role: 'user', content: q }], gameState: { day: 10, season: 'autumn', crackStage: 0, cycle: 1 } }) });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let first = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    if (first === null && buf.includes('"delta"')) first = performance.now() - t0;
  }
  rows.push({ id, q, first: Math.round(first), end: Math.round(performance.now() - t0) });
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const summary = { runs, delay_ms: Number(process.env.MOCK_DELAY_MS), median_first_ms: med(rows.map((r) => r.first)), max_first_ms: Math.max(...rows.map((r) => r.first)), median_end_ms: med(rows.map((r) => r.end)) };
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({ summary, rows }, null, 1)}\n`);
console.log(JSON.stringify(summary));
server.close();
store.close();
