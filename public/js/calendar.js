// შიდა კალენდარი (FIXES_ROUND1 §4): დღე → სეზონი/ბზარი/ეგზემპლარები, დღეების წინსვლა საზღვრების გადაკვეთით, თარიღი.
// სუფთა ფუნქციები, DOM-ის გარეშე — იყენებს კლიენტი (game.js, tree), სერვერი (prompt.js) და unit ტესტები.

export const MONTHS_KA = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];
export const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const SEASON_KA = { autumn: 'შემოდგომა', winter: 'ზამთარი', spring: 'გაზაფხული', summer: 'ზაფხული' };

const DEFAULTS = {
  seasons: ['autumn', 'winter', 'spring', 'summer'],
  days_per_season: 90,
  // Round 3 §2: დრო მიდის მხოლოდ საუბრის დახურვისას (+20 დღე, თუ საუბარში ერთი შეტყობინება მაინც იყო) — საუბრის შუაში არასდროს.
  // დანარჩენი ორი კონფიგურირებადია, მაგრამ ნულია.
  days_per_chat_close: 20,
  days_per_character_switch: 0,
  days_per_exchange: 0,
  start_date: '1983-09-01',
  crack_stages: 5,
  copies: 3,
};

/** კონფიგის ნორმალიზაცია დეფოლტებით (ძველი settings.json-ის ან ნაკლული ველების შემთხვევაშიც მუშაობს). */
export function withDefaults(cfg = {}) {
  const out = { ...DEFAULTS, ...(cfg || {}) };
  for (const k of ['days_per_season', 'days_per_chat_close', 'days_per_character_switch', 'days_per_exchange', 'crack_stages', 'copies']) {
    const n = Number(out[k]);
    out[k] = Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULTS[k];
  }
  if (!Array.isArray(out.seasons) || !out.seasons.length) out.seasons = DEFAULTS.seasons;
  if (out.days_per_season < 1) out.days_per_season = DEFAULTS.days_per_season;
  if (out.crack_stages < 1) out.crack_stages = DEFAULTS.crack_stages;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(out.start_date))) out.start_date = DEFAULTS.start_date;
  return out;
}

/** დღეების რაოდენობა ერთ ციკლში (4 × 90 = 360): ამ დღეს შენობა ინგრევა. */
export function totalDays(cfgRaw) {
  const cfg = withDefaults(cfgRaw);
  return cfg.seasons.length * cfg.days_per_season;
}

/** დღის ნომრის ვალიდაცია: 0 … totalDays-1. */
export function clampDay(day, cfgRaw) {
  const n = Number.parseInt(day, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(totalDays(cfgRaw) - 1, Math.max(0, n));
}

/** სეზონის სახელი → ამ სეზონის პირველი დღე (ძველი მდგომარეობის მიგრაციისთვის). */
export function dayFromSeason(season, cfgRaw) {
  const cfg = withDefaults(cfgRaw);
  const idx = cfg.seasons.indexOf(season);
  return idx < 0 ? 0 : idx * cfg.days_per_season;
}

/**
 * დღე → ყველაფერი, რაც მისგან გამომდინარეობს.
 * crackStage და lostCopies სეზონის ინდექსიდან ითვლება (შემოდგომა 0, ზამთარი 1, …) — ზუსტად როგორც ადრე, ოღონდ ტრიგერი დღეებია.
 */
export function derive(day, cfgRaw) {
  const cfg = withDefaults(cfgRaw);
  const dps = cfg.days_per_season;
  const d = Math.max(0, Number.parseInt(day, 10) || 0);
  const seasonIndex = Math.min(cfg.seasons.length - 1, Math.floor(d / dps));
  const dayInSeason = Math.min(dps - 1, d - seasonIndex * dps);
  return {
    day: d,
    season: cfg.seasons[seasonIndex],
    seasonIndex,
    dayInSeason,
    daysLeft: dps - dayInSeason,
    progress: dayInSeason / dps, // 0 … <1 სეზონის შიგნით (ხის ფერისთვის)
    crackStage: Math.min(cfg.crack_stages - 1, seasonIndex),
    lostCopies: Math.min(cfg.copies, seasonIndex),
  };
}

/**
 * დღეების წინსვლა. აბრუნებს { day, seasons: [გადაკვეთილი სეზონების სახელები], collapse }.
 * რამდენიმე საზღვრის ერთ ნახტომში გადაკვეთა ციკლით მუშავდება; ჩამონგრევისას (day ≥ totalDays) ჩერდება.
 */
export function advanceDays(day, days, cfgRaw) {
  const cfg = withDefaults(cfgRaw);
  const dps = cfg.days_per_season;
  const total = cfg.seasons.length * dps;
  let d = Math.max(0, Number.parseInt(day, 10) || 0);
  const target = d + Math.max(0, Number.parseInt(days, 10) || 0);
  const crossed = [];
  while (d < target) {
    const nextBoundary = (Math.floor(d / dps) + 1) * dps;
    if (nextBoundary > target) { d = target; break; }
    d = nextBoundary;
    if (d >= total) return { day: total, seasons: crossed, collapse: true };
    crossed.push(cfg.seasons[Math.floor(d / dps)]);
  }
  return { day: d, seasons: crossed, collapse: false };
}

/** შიდა თარიღი: start_date + day (UTC — DST-ის გარეშე). */
export function dateFor(cfgRaw, day) {
  const cfg = withDefaults(cfgRaw);
  const [y, m, d] = cfg.start_date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + Math.max(0, Number.parseInt(day, 10) || 0) * 86_400_000);
}

/** „15 ოქტომბერი“ */
export function formatDateKa(date) {
  return `${date.getUTCDate()} ${MONTHS_KA[date.getUTCMonth()]}`;
}

/** „15 October 1983“ */
export function formatDateEn(date) {
  return `${date.getUTCDate()} ${MONTHS_EN[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
