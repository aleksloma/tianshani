// Express სერვერი: სტატიკა (public/), /api/characters, /api/chat (SSE), /api/state, /admin.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';

import { loadConfig, ROOT } from './config.js';
import { byId, publicList, pickProxy, famousRollCall, meta } from './characters.js';
import { buildPrompt, sanitizeGameState, annotateForProxy, pickStageMode, cleanUserName, SEASON_KA } from './prompt.js';
import { openDb } from './db.js';
import { balance, createRateLimiter, MSG_LIMIT, MSG_RATE, MSG_TOO_LONG } from './limits.js';
import {
  MSG_BUDGET, costUsd, globalStatus, wouldOvershoot, reserveUsd, estimateTokens, createWarnLogger,
} from './budget.js';
import { detectRedirect } from './redirect.js';
import { pacingState } from './pacing.js';
import { mockStream } from './mock.js';
import { shouldProofread, proofread, proofreadMaxTokens } from './proofread.js';
import { findNonWords } from './georgian.js';
import { geminiStream, resolveModel, currentModel } from './gemini.js';
import { log, logExchange } from './logger.js';
import { adminRouter } from './admin.js';

export const MSG_API_ERROR = 'ხაზი დაკავებულია. ცოტა ხანში სცადეთ.';
export const MSG_NO_KEY = 'გამომცემლობას გასაღები დაეკარგა (settings.json → gemini.api_key)';
const CLIENT_COOKIE = 'tianshani_cid';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ბრაუზერის იდენტიფიკაცია: cookie პრიორიტეტულია, მერე X-Client-Id, მერე ახალი UUID. */
function clientIdMiddleware(store) {
  return (req, res, next) => {
    // მხოლოდ API-ზე (სტატიკურ ფაილებს ID არ სჭირდება — სხვაგვარად HTML-ის მოთხოვნა localStorage-ის ID-ს გადაფარავდა)
    if (!req.path.startsWith('/api/') || req.path.startsWith('/api/admin')) return next();
    const fromCookie = req.cookies?.[CLIENT_COOKIE];
    const fromHeader = req.get('X-Client-Id');
    let id = UUID_RE.test(fromCookie || '') ? fromCookie : null;
    if (!id) id = UUID_RE.test(fromHeader || '') ? fromHeader.toLowerCase() : crypto.randomUUID();
    if (id !== fromCookie) {
      res.cookie(CLIENT_COOKIE, id, { httpOnly: true, sameSite: 'lax', maxAge: 2 * 365 * 24 * 3600 * 1000, path: '/', secure: req.secure });
    }
    req.clientId = id;
    store.touchClient(id, req.get('user-agent'), req.ip);
    next();
  };
}

/** settings-ის `_comment` ველები მხოლოდ ადამიანისთვისაა — კლიენტს არ ვუგზავნით. */
const noComments = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));

/** აპლიკაციის აწყობა (ტესტებისთვისაც). */
export function createApp(cfg) {
  const store = openDb(cfg.logging.db_path);
  const app = express();
  const rate = createRateLimiter(cfg.limits.max_requests_per_minute);
  const provider = cfg.gemini.mock ? 'mock' : 'gemini';
  const budgetWarn = createWarnLogger(log);

  /** wall.background_by_stage → მხოლოდ არსებული ფაილები (public/-ის შიგნით); დანარჩენი null. */
  const publicDir = path.join(ROOT, 'public');
  const wallBackgrounds = (Array.isArray(cfg.wall.background_by_stage) ? cfg.wall.background_by_stage : ['assets/wall.jpg'])
    .map((p) => {
      if (typeof p !== 'string' || !p) return null;
      const abs = path.resolve(publicDir, p);
      if (!abs.startsWith(publicDir + path.sep) || !fs.existsSync(abs)) {
        log.warn(`[wall] background_by_stage: ფაილი ვერ მოიძებნა — ${p} (გამოიყენება წინა საფეხურის სურათი)`);
        return null;
      }
      return p.replace(/\\/g, '/');
    });

  /** 429 — ბრაუზერის ლიმიტი ან გლობალური ბიუჯეტი; ერთი და იგივე ტექსტი, UI-ს მოდალი აჩვენებს. */
  const limitBody = (kind, resets) => ({ error: kind, message: kind === 'global_budget' ? MSG_BUDGET : MSG_LIMIT, resets_at: resets });

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // ჰოსტინგზე (Render/Railway/Fly) req.ip და req.secure სწორად
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use(clientIdMiddleware(store));

  // --- ადმინი ---
  const adminPath = cfg.admin.path || '/admin';
  app.get(adminPath, (req, res) => res.sendFile(path.join(ROOT, 'public', 'admin.html')));
  app.use('/api/admin', adminRouter(cfg, store));

  // --- სტატიკა ---
  // HTML/JS/CSS — ყოველთვის ETag-ით გადამოწმება (deploy-ის შემდეგ ძველი მოდულები არ დარჩეს); სურათები — 1 დღე
  app.use(express.static(path.join(ROOT, 'public'), {
    extensions: ['html'],
    setHeaders(res, file) {
      res.setHeader('Cache-Control', /\.(jpe?g|png|webp|svg|ico)$/i.test(file) ? 'public, max-age=86400' : 'no-cache');
    },
  }));

  app.get('/api/health', (req, res) => res.json({ ok: true, provider, model: cfg.gemini.mock ? 'mock' : (currentModel() || cfg.gemini.model) }));

  app.get('/api/characters', (req, res) => {
    res.json({
      title_ka: 'დაბეჭდე ტიანშანი',
      film_ka: meta.title_ka,
      characters: publicList(cfg.wall.characters_on_wall),
      config: {
        game: noComments(cfg.game),
        wall: noComments(cfg.wall),
        chat: { history_window: cfg.chat.history_window, max_message_chars: cfg.limits.max_message_chars },
        seasons_ka: SEASON_KA,
      },
      roll_call: famousRollCall?.lines || [],
      // კედლის ფოტოები ბზარის საფეხურის მიხედვით (Round 2 §7); არარსებული ფაილი → null (კლიენტი წინა სურათს აიღებს)
      wall_backgrounds: wallBackgrounds,
      wall_image: wallBackgrounds[0] || null,
      mock: cfg.gemini.mock,
      mock_notice: cfg.gemini.mock ? `${MSG_NO_KEY} — სატესტო რეჟიმი, პასუხები LLM-ის გარეშე.` : null,
    });
  });

  app.get('/api/state', (req, res) => {
    // client_id — რომ localStorage-ის ID cookie-ს დაემთხვეს (cookie პრიორიტეტულია)
    const g = globalStatus(store, cfg);
    res.json({
      ...balance(store, cfg, req.clientId),
      client_id: req.clientId,
      mock: cfg.gemini.mock,
      provider,
      // გლობალური ბიუჯეტი — მოდალი გვერდის ჩატვირთვისთანავე ყველას უჩანს (ხარჯის თანხა კლიენტს არ ვუჩვენებთ ტექსტად, მხოლოდ სტატუსი)
      global: { budget_usd: g.budget_usd, spent_usd: Math.round(g.spent_usd * 10000) / 10000, exhausted: g.exhausted, resets_at: g.resets_at },
    });
  });

  app.post('/api/chat', async (req, res) => {
    const clientId = req.clientId;
    const { characterId, messages } = req.body || {};
    const target = byId[characterId];
    if (!target) return res.status(400).json({ error: 'ასეთი თანამშრომელი შტატში არ ირიცხება.' });
    if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'შეტყობინება ცარიელია.' });

    // ისტორიის ნორმალიზაცია + ბოლო N
    const clean = messages
      .filter((m) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role))
      .map((m) => ({ role: m.role, content: m.content.slice(0, cfg.limits.max_message_chars * 2) }))
      .slice(-cfg.chat.history_window);
    const last = clean[clean.length - 1];
    if (!last || last.role !== 'user' || !last.content.trim()) return res.status(400).json({ error: 'ბოლო შეტყობინება მომხმარებლისა უნდა იყოს.' });
    if (last.content.length > cfg.limits.max_message_chars) return res.status(413).json({ error: MSG_TOO_LONG });

    if (!rate.allow(clientId)) return res.status(429).json({ error: MSG_RATE, code: 'rate' });
    // 1) გლობალური თვიური ბიუჯეტი (ყველასთვის ერთი)
    const gNow = globalStatus(store, cfg);
    budgetWarn.check(gNow);
    if (gNow.exhausted) return res.status(429).json(limitBody('global_budget', gNow.resets_at));
    // 2) ამ ბრაუზერის ლიმიტი
    const bal = balance(store, cfg, clientId);
    if (bal.exhausted) {
      return res.status(429).json({ ...limitBody('client_limit', bal.resets_at), code: 'limit', remaining: bal.remaining });
    }

    const gameState = sanitizeGameState(req.body.gameState, cfg);
    const userName = cleanUserName(req.body.userName); // Round 3 §1
    if (userName) store.setClientName(clientId, userName);

    // უხილავი → წარმომადგენელი. preferred = ვინც ამ ჩატში ბოლოს უპასუხა (კლიენტი აგზავნის)
    let speaker = target;
    let invisible = null;
    if (!target.reachable) {
      invisible = target;
      const preferred = typeof req.body.lastSpokenBy === 'string' ? req.body.lastSpokenBy : null;
      speaker = byId[pickProxy(target.id, preferred)];
    }

    const stageMode = pickStageMode({ invisible, historyLen: clean.length - 1 });
    const pacing = pacingState(clean, speaker);
    const { systemInstruction, fewShot } = buildPrompt({ speaker, invisible, gameState, cfg, stageMode, pacing, userName });
    // წარმომადგენლის ჩატში მომხმარებლის შეტყობინებებს (მხოლოდ მოდელისთვის) ემატება „ვის მიმართავს“ შენიშვნა; ლოგში — ორიგინალი
    const convo = invisible
      ? clean.map((m) => (m.role === 'user' ? { ...m, content: annotateForProxy(m.content, invisible, speaker) } : m))
      : clean;
    const contents = [...fewShot, ...convo];

    // 3) რეზერვი: ბოლო მოთხოვნამ ბიუჯეტი არ უნდა გადააჭარბოს (პრომპტი + max_output_tokens უარეს შემთხვევაში;
    //    კორექტურა — დაახლ. +600 შემავალი + პასუხის სიგრძე და 1.5× გამომავალი, Round 3 §4)
    const maxOut = cfg.gemini.max_output_tokens;
    const pr = !cfg.gemini.mock && cfg.gemini.proofread !== false;
    const promptTokens = estimateTokens(systemInstruction) + contents.reduce((n, m) => n + estimateTokens(m.content), 0) + (pr ? 600 + maxOut : 0);
    const reserve = reserveUsd({ promptTokens, maxOutputTokens: pr ? maxOut + proofreadMaxTokens(maxOut) : maxOut, prices: cfg.budget });
    if (wouldOvershoot(gNow, reserve)) {
      log.warn(`[budget] მოთხოვნა უარყოფილია: ხარჯი $${gNow.spent_usd.toFixed(4)} + რეზერვი $${reserve.toFixed(4)} ≥ $${gNow.budget_usd}`);
      return res.status(429).json(limitBody('global_budget', gNow.resets_at));
    }

    // --- SSE ---
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const send = (obj) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`); };

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error('timeout')), cfg.gemini.request_timeout_ms);
    res.on('close', () => { if (!res.writableEnded) ac.abort(new Error('client closed')); });

    let reply = '';
    let usage = { input: 0, output: 0 };
    try {
      const gen = cfg.gemini.mock
        ? mockStream({ systemInstruction, contents, speaker, invisible, userText: last.content, gameState, signal: ac.signal, historyLen: clean.length - 1, manuscriptCount: pacing.manuscriptCount, userName })
        : geminiStream({ cfg, systemInstruction, contents, signal: ac.signal });
      for await (const ev of gen) {
        if (ev.delta) { reply += ev.delta; send({ delta: ev.delta }); }
        if (ev.usage) usage = ev.usage;
      }
      if (!reply.trim()) throw new Error('empty reply');
    } catch (e) {
      clearTimeout(timer);
      log.error(`[chat] ${characterId}: ${e?.message || e}`);
      // ტოკენები მაინც დაიხარჯა, თუ რამე დაბრუნდა
      if (usage.input || usage.output) {
        store.addUsage(clientId, bal.period_key, usage.input, usage.output);
        store.addGlobal(gNow.period_key, usage.input, usage.output, costUsd(usage.input, usage.output, cfg.budget));
      }
      send({ error: MSG_API_ERROR });
      return res.end();
    }
    clearTimeout(timer);

    // Round 3 §4: კორექტურა — პასუხი უკვე სრულად ჩანს; თუ შესწორდა, ბოლო ივენთი { replace } ჩუმად ცვლის ბუშტის ტექსტს.
    // ტოკენები ლიმიტსა და ბიუჯეტში ითვლება; შეცდომისას ორიგინალი რჩება.
    let original = null;
    if (shouldProofread(cfg, reply) && !ac.signal.aborted) {
      try {
        const p = await proofread({ cfg, text: reply, speaker, replyTokens: usage.output, signal: ac.signal });
        usage = { ...usage, input: usage.input + p.usage.input, output: usage.output + p.usage.output, proofread: p.usage };
        if (p.text && p.text !== reply) {
          send({ replace: p.text });
          original = reply;
          reply = p.text;
        } else if (!p.text) log.warn(`[proofread] ${speaker.id}: შესწორება უარყოფილია (${p.reason}) — რჩება ორიგინალი`);
      } catch (e) {
        log.warn(`[proofread] ${speaker.id}: ${e?.message || e} — რჩება ორიგინალი`);
      }
    }
    const bad = findNonWords(reply);
    if (bad.length) log.warn(`[georgian] ${speaker.id}: არარსებული სიტყვა პასუხში: ${bad.join(', ')}`);

    store.addUsage(clientId, bal.period_key, usage.input, usage.output);
    // გლობალური ხარჯი — რეალური usageMetadata-დან (mock-ში ყალბი usage-დან)
    store.addGlobal(gNow.period_key, usage.input, usage.output, costUsd(usage.input, usage.output, cfg.budget));
    logExchange(store, cfg, { clientId, characterId: target.id, spokenBy: speaker.id, userText: last.content, reply, usage, gameState, userName, original });

    const after = balance(store, cfg, clientId);
    send({
      done: true,
      usage: { input: usage.input, output: usage.output }, // კორექტურის ტოკენების ჩათვლით
      cached_tokens: usage.cached || 0, // Round 3 §7: იმპლიციტური ქეში (გასაზომად)
      proofread: original ? 'changed' : (usage.proofread ? 'unchanged' : 'skipped'),
      remaining: after.remaining,
      limits: after.limits,
      period: after.period,
      resets_at: after.resets_at,
      exhausted: after.exhausted,
      // „→ მივიდე …“ მხოლოდ ხელნაწერზე მე-3 შეტყობინებიდან და მხოლოდ თუ პასუხში მართლა ასახელებს (FIXES_ROUND2 §8)
      suggested_redirect: detectRedirect({ speaker, reply, currentId: target.id, manuscriptCount: pacing.manuscriptCount }),
      spoken_by: speaker.id,
      spoken_by_name: speaker.short_name_ka,
    });
    res.end();
  });

  // უცნობი API → JSON 404
  app.use('/api', (req, res) => res.status(404).json({ error: 'ასეთი ოთახი არ არსებობს.' }));

  return { app, store };
}

/** სერვერის გაშვება. */
export async function start(cfg = loadConfig()) {
  for (const w of cfg.warnings) log.warn(w);
  const { app, store } = createApp(cfg);
  if (!cfg.gemini.mock) resolveModel(cfg, log).catch(() => {});
  return new Promise((resolve) => {
    const server = app.listen(cfg.server.port, cfg.server.host, () => {
      const addr = server.address();
      const host = cfg.server.host === '0.0.0.0' ? 'localhost' : cfg.server.host;
      log.info(`„დაბეჭდე ტიანშანი“ მუშაობს: http://${host}:${addr.port}  (ადმინი: ${cfg.admin.path})`);
      log.info(`LLM: ${cfg.gemini.mock ? 'MOCK რეჟიმი (გასაღები არ არის)' : `Gemini (${cfg.gemini.model})`} · ბაზა: ${cfg.logging.db_path}`);
      resolve({ server, store, port: addr.port });
    });
    const shutdown = () => { server.close(); store.close(); process.exit(0); };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) start();
