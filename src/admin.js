// ადმინ-API: პაროლი → HMAC-ით ხელმოწერილი httpOnly cookie. ყველა /api/admin/* (გარდა login-ისა) მოითხოვს მას.
import crypto from 'node:crypto';
import express from 'express';
import { byId } from './characters.js';
import { periodKey, createRateLimiter } from './limits.js';
import { globalStatus, globalPeriodKey, costUsd, projectedMonthEnd } from './budget.js';

const COOKIE = 'tianshani_admin';
const SESSION_MS = 12 * 60 * 60 * 1000; // 12 საათი

function sign(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** cookie-ს შემოწმება: "<expiry>.<hmac>" */
export function isAdmin(req, secret) {
  const v = req.cookies?.[COOKIE];
  if (!v || typeof v !== 'string') return false;
  const [exp, mac] = v.split('.');
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  return safeEqual(mac, sign(secret, `admin:${exp}`));
}

export function adminRouter(cfg, store) {
  const r = express.Router();
  const loginLimiter = createRateLimiter(10);
  const { db, secret } = store;

  r.post('/login', (req, res) => {
    if (!loginLimiter.allow(req.ip || 'x')) return res.status(429).json({ error: 'ძალიან ბევრი ცდა. ერთ წუთში სცადეთ.' });
    const pw = String(req.body?.password ?? '');
    if (!cfg.admin.password || cfg.admin.password === 'CHANGE_ME') {
      return res.status(403).json({ error: 'ადმინის პაროლი არ არის დაყენებული (settings.json → admin.password ან env ADMIN_PASSWORD).' });
    }
    if (!safeEqual(pw, cfg.admin.password)) {
      return res.status(401).json({ error: 'პაროლი არასწორია. საქმე დახურულია.' });
    }
    const exp = String(Date.now() + SESSION_MS);
    res.cookie(COOKIE, `${exp}.${sign(secret, `admin:${exp}`)}`, {
      httpOnly: true, sameSite: 'strict', maxAge: SESSION_MS, path: '/', secure: req.secure,
    });
    res.json({ ok: true });
  });

  r.post('/logout', (req, res) => { res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });

  // --- ყველაფერი ქვემოთ დაცულია ---
  r.use((req, res, next) => (isAdmin(req, secret) ? next() : res.status(401).json({ error: 'საჭიროა ავტორიზაცია.' })));

  r.get('/me', (req, res) => res.json({ ok: true }));

  r.get('/stats', (req, res) => {
    const key = periodKey(cfg.limits.period);
    const totals = db.prepare(`SELECT
        (SELECT COUNT(*) FROM clients) AS clients,
        (SELECT COUNT(*) FROM messages) AS messages,
        (SELECT COUNT(*) FROM messages WHERE role = 'user') AS user_messages,
        (SELECT COALESCE(SUM(input_tokens),0) FROM usage) AS input_tokens,
        (SELECT COALESCE(SUM(output_tokens),0) FROM usage) AS output_tokens,
        (SELECT COALESCE(SUM(input_tokens),0) FROM usage WHERE period_key = ?) AS period_input_tokens,
        (SELECT COALESCE(SUM(output_tokens),0) FROM usage WHERE period_key = ?) AS period_output_tokens`).get(key, key);
    const top = db.prepare(`SELECT character_id, COUNT(*) AS n FROM messages WHERE role = 'user'
        GROUP BY character_id ORDER BY n DESC LIMIT 10`).all()
      .map((t) => ({ ...t, name: byId[t.character_id]?.short_name_ka || t.character_id }));
    // გლობალური თვიური ბიუჯეტი (FIXES_ROUND2 §3)
    const g = globalStatus(store, cfg);
    const proj = projectedMonthEnd(g.spent_usd);
    res.json({
      totals, top_characters: top, period: cfg.limits.period, period_key: key, mock: cfg.gemini.mock,
      budget: {
        ...g,
        ...proj,
        projected_percent: g.budget_usd > 0 ? Math.round((proj.projected_usd / g.budget_usd) * 1000) / 10 : 0,
        prices: { input_per_1m: cfg.budget.price_input_per_1m_usd, output_per_1m: cfg.budget.price_output_per_1m_usd },
      },
    });
  });

  /** მიმდინარე თვის გლობალური მთვლელის განულება (ბრაუზერების მთვლელები უცვლელი რჩება). */
  r.post('/budget/reset', (req, res) => {
    const removed = store.resetGlobal(globalPeriodKey());
    res.json({ ok: true, removed });
  });

  r.get('/clients', (req, res) => {
    const key = periodKey(cfg.limits.period);
    const q = String(req.query.q || '').trim();
    const like = `%${q}%`;
    const rows = db.prepare(`
      SELECT c.client_id, c.first_seen, c.last_seen, c.user_agent,
        (SELECT COUNT(*) FROM messages m WHERE m.client_id = c.client_id AND m.role = 'user') AS messages,
        (SELECT COUNT(DISTINCT character_id) FROM messages m WHERE m.client_id = c.client_id) AS characters,
        COALESCE(u.input_tokens, 0) AS input_tokens, COALESCE(u.output_tokens, 0) AS output_tokens,
        (SELECT COALESCE(SUM(input_tokens),0) FROM usage x WHERE x.client_id = c.client_id) AS total_input_tokens,
        (SELECT COALESCE(SUM(output_tokens),0) FROM usage x WHERE x.client_id = c.client_id) AS total_output_tokens
      FROM clients c LEFT JOIN usage u ON u.client_id = c.client_id AND u.period_key = @key
      WHERE @q = '' OR c.client_id LIKE @like OR c.user_agent LIKE @like
        OR EXISTS (SELECT 1 FROM messages m WHERE m.client_id = c.client_id AND m.content LIKE @like)
      ORDER BY c.last_seen DESC LIMIT 500`).all({ key, q, like });
    const li = cfg.limits.per_client_input_tokens;
    const lo = cfg.limits.per_client_output_tokens;
    res.json({
      period_key: key,
      clients: rows.map((c) => ({
        ...c,
        limit_pct: Math.min(100, Math.round(100 * Math.max(c.input_tokens / li, c.output_tokens / lo))),
        // ხარჯი USD — იგივე ფორმულით, რაც გლობალურ ბიუჯეტში (მიმდინარე პერიოდი და სულ)
        cost_usd: Math.round(costUsd(c.input_tokens, c.output_tokens, cfg.budget) * 10000) / 10000,
        total_cost_usd: Math.round(costUsd(c.total_input_tokens, c.total_output_tokens, cfg.budget) * 10000) / 10000,
      })),
    });
  });

  r.get('/clients/:id/messages', (req, res) => {
    const rows = db.prepare('SELECT * FROM messages WHERE client_id = ? ORDER BY id').all(req.params.id);
    const groups = new Map();
    for (const m of rows) {
      if (!groups.has(m.character_id)) {
        const c = byId[m.character_id];
        groups.set(m.character_id, { character_id: m.character_id, name: c?.short_name_ka || m.character_id, reachable: c?.reachable ?? true, messages: [] });
      }
      groups.get(m.character_id).messages.push({
        ...m, spoken_by_name: m.spoken_by ? (byId[m.spoken_by]?.short_name_ka || m.spoken_by) : null,
      });
    }
    const client = db.prepare('SELECT * FROM clients WHERE client_id = ?').get(req.params.id) || null;
    res.json({ client, characters: [...groups.values()].sort((a, b) => b.messages.length - a.messages.length) });
  });

  r.post('/clients/:id/reset-limit', (req, res) => {
    const removed = store.resetUsage(req.params.id, periodKey(cfg.limits.period));
    res.json({ ok: true, removed });
  });

  r.get('/export', (req, res) => {
    const id = req.query.client ? String(req.query.client) : null;
    const clients = id
      ? db.prepare('SELECT * FROM clients WHERE client_id = ?').all(id)
      : db.prepare('SELECT * FROM clients ORDER BY last_seen DESC').all();
    const messages = id
      ? db.prepare('SELECT * FROM messages WHERE client_id = ? ORDER BY id').all(id)
      : db.prepare('SELECT * FROM messages ORDER BY id').all();
    const usage = id
      ? db.prepare('SELECT * FROM usage WHERE client_id = ?').all(id)
      : db.prepare('SELECT * FROM usage').all();
    const name = `tianshani-export-${id ? id.slice(0, 8) + '-' : ''}${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.json({ exported_at: new Date().toISOString(), clients, messages, usage });
  });

  return r;
}
