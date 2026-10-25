// settings.json ჩატვირთვა + ვალიდაცია. იკითხება ერთხელ, სტარტზე.
// გარემოს ცვლადები (PORT, HOST, GEMINI_API_KEY, ADMIN_PASSWORD, DB_PATH, GLOBAL_MONTHLY_TOKENS) გადაფარავენ settings.json-ის ველებს,
// რომ ჰოსტინგზე settings.json საერთოდ არ დასჭირდეს.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

const PLACEHOLDER_KEYS = new Set(['', 'PASTE_YOUR_KEY', 'YOUR_KEY', 'CHANGE_ME']);

/** Round 7 §2: გლობალური ლიმიტი ახლა ტოკენებშია — ძველი დოლარის გასაღები სტარტს აჩერებს. */
export const MSG_OLD_BUDGET_KEY = 'budget.global_monthly_usd აღარ გამოიყენება — გლობალური თვიური ლიმიტი ახლა ტოკენებშია. '
  + 'წაშალეთ global_monthly_usd და ჩაწერეთ budget.global_monthly_tokens (შემავალი + გამომავალი ტოკენების ჯამი თვეში, მაგ. 45000000); '
  + 'გარემოს ცვლადი: GLOBAL_MONTHLY_TOKENS (GLOBAL_MONTHLY_USD-ის ნაცვლად).';

/** JSON-ის წაკითხვა `_comment` ველების იგნორირებით (ისინი მხოლოდ ადამიანისთვისაა). */
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** ღრმა შერწყმა: დეფოლტი ← მომხმარებლის მნიშვნელობები. */
function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      out[k] = merge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * კონფიგის ჩატვირთვა. `overrides` — ტესტებისთვის (პროგრამული გადაფარვა, env-ის მერე).
 */
export function loadConfig(overrides = {}) {
  const examplePath = path.join(ROOT, 'settings.example.json');
  const settingsPath = process.env.SETTINGS_PATH || path.join(ROOT, 'settings.json');
  const example = readJson(examplePath);
  const warnings = [];

  let user = {};
  if (fs.existsSync(settingsPath)) {
    user = readJson(settingsPath);
  } else if (!process.env.SETTINGS_PATH) {
    // პირველი გაშვება: ვქმნით settings.json-ს მაგალითიდან (შემთხვევითი ადმინის პაროლით), რომ მომხმარებელმა იცოდეს, სად ჩაწეროს გასაღები.
    const fresh = readJson(examplePath);
    fresh.admin.password = `tianshani-${crypto.randomBytes(5).toString('hex')}`;
    try {
      fs.writeFileSync(settingsPath, `${JSON.stringify(fresh, null, 2)}\n`, 'utf8');
      user = fresh;
      warnings.push(`settings.json არ არსებობდა — შეიქმნა settings.example.json-დან. ჩაწერეთ Gemini-ს გასაღები: settings.json → gemini.api_key`);
      warnings.push(`ადმინის პაროლი დაგენერირდა: ${fresh.admin.password} (შეგიძლიათ შეცვალოთ settings.json → admin.password)`);
    } catch (e) {
      // ჰოსტინგზე ფაილური სისტემა შეიძლება read-only იყოს — მაშინ მხოლოდ env ცვლადები + დეფოლტები
      warnings.push(`settings.json ვერ შეიქმნა (${e.code || e.message}) — გამოიყენება settings.example.json + გარემოს ცვლადები.`);
    }
  }

  let cfg = merge(merge(example, user), overrides);

  // --- გარემოს ცვლადები (ჰოსტინგი) ---
  const env = process.env;
  if (env.PORT !== undefined && env.PORT !== '') cfg.server.port = Number(env.PORT);
  if (env.HOST) cfg.server.host = env.HOST;
  else if (env.PORT && !user.server?.host) cfg.server.host = '0.0.0.0'; // ჰოსტინგზე ყველა ინტერფეისზე
  if (env.GEMINI_API_KEY) cfg.gemini.api_key = env.GEMINI_API_KEY;
  if (env.ADMIN_PASSWORD) cfg.admin.password = env.ADMIN_PASSWORD;
  if (env.DB_PATH) cfg.logging.db_path = env.DB_PATH;
  if (env.GEMINI_MOCK === '1' || env.GEMINI_MOCK === 'true') cfg.gemini.mock = true;
  cfg.site = cfg.site || {};
  if (env.PUBLIC_URL) cfg.site.public_url = env.PUBLIC_URL; // Round 4 §8: Open Graph-ის სრული მისამართი
  // --- გლობალური თვიური ლიმიტი (Round 7 §2: ტოკენებში; FIXES_ROUND2 §3-ის დოლარის გასაღები აღარ არსებობს) ---
  // ძველი გასაღები → სტარტი ჩერდება, რომ მფლობელმა იცოდეს: ლიმიტი აღარ ითვლება დოლარებში
  if (user.budget && Object.hasOwn(user.budget, 'global_monthly_usd')) throw new Error(`${settingsPath}: ${MSG_OLD_BUDGET_KEY}`);
  if (env.GLOBAL_MONTHLY_USD !== undefined && env.GLOBAL_MONTHLY_USD !== '') throw new Error(`env GLOBAL_MONTHLY_USD: ${MSG_OLD_BUDGET_KEY}`);
  cfg.budget = cfg.budget || {};
  delete cfg.budget.global_monthly_usd;
  if (env.GLOBAL_MONTHLY_TOKENS !== undefined && env.GLOBAL_MONTHLY_TOKENS !== '') cfg.budget.global_monthly_tokens = Number(env.GLOBAL_MONTHLY_TOKENS);
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  cfg.budget.global_monthly_tokens = num(cfg.budget.global_monthly_tokens, 45_000_000);
  cfg.budget.price_input_per_1m_usd = num(cfg.budget.price_input_per_1m_usd, 0.75);
  cfg.budget.price_output_per_1m_usd = num(cfg.budget.price_output_per_1m_usd, 3.75);
  cfg.budget.warn_at_percent = num(cfg.budget.warn_at_percent, 80);
  if (cfg.budget.global_monthly_tokens <= 0) warnings.push('budget.global_monthly_tokens ≤ 0 — გლობალური თვიური ლიმიტი გამორთულია (ტოკენები მაინც ითვლება).');

  // --- ვალიდაცია ---
  const hasKey = typeof cfg.gemini.api_key === 'string' && !PLACEHOLDER_KEYS.has(cfg.gemini.api_key.trim());
  cfg.gemini.mock = Boolean(cfg.gemini.mock) || !hasKey;
  if (!hasKey) {
    warnings.push('გამომცემლობას გასაღები დაეკარგა: Gemini API key არ არის (settings.json → gemini.api_key ან env GEMINI_API_KEY). სერვერი MOCK რეჟიმში გაეშვება — პასუხებს მონაცემთა ბაზიდან ააწყობს, LLM-ის გარეშე.');
  }
  if (!cfg.admin.password || PLACEHOLDER_KEYS.has(cfg.admin.password)) {
    cfg.admin.password = 'CHANGE_ME';
    warnings.push('ადმინის პაროლი CHANGE_ME-ა — /admin დაკეტილია, სანამ არ შეცვლით: settings.json → admin.password (ან env ADMIN_PASSWORD).');
  }
  if (!['monthly', 'lifetime'].includes(cfg.limits.period)) {
    warnings.push(`limits.period უცნობია (${cfg.limits.period}) — გამოიყენება "monthly".`);
    cfg.limits.period = 'monthly';
  }
  if (!Array.isArray(cfg.game.seasons) || cfg.game.seasons.length === 0) {
    cfg.game.seasons = ['autumn', 'winter', 'spring', 'summer'];
  }
  // Round 8 §1: ეგზემპლარები სეზონზე აღარ იკარგება — ძველი გასაღები ჩუმად იგნორირდება (ერთი ჩანაწერი ლოგში)
  if (Object.hasOwn(cfg.game, 'seasons_per_lost_copy')) {
    delete cfg.game.seasons_per_lost_copy;
    warnings.push('seasons_per_lost_copy is no longer used');
  }
  const port = Number(cfg.server.port);
  cfg.server.port = Number.isInteger(port) && port >= 0 ? port : 3000; // 0 = თავისუფალი პორტი (ტესტები)
  cfg.logging.db_path = path.isAbsolute(cfg.logging.db_path) ? cfg.logging.db_path : path.join(ROOT, cfg.logging.db_path);
  cfg.warnings = warnings;
  cfg.settingsPath = settingsPath;
  return cfg;
}
