// კედლის განლაგება — სუფთა ფუნქციები (DOM-ის გარეშე), რომ Node-ის unit ტესტებმაც გამოიყენონ.
// ჩარჩოები შემთხვევით, seed-ით: არა ბადეზე, არა სიმეტრიულად; collision check rotate-ის შემდეგი bounding box-ით.

/** დეტერმინისტული PRNG (mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ბზარის მე-3/4 საფეხურზე ჩარჩო კიდევ ~3°-ით იხრება — ამ მარაგს წინასწარ ვითვალისწინებთ, რომ მაშინაც არაფერი გადაიფაროს. */
export const TILT_RESERVE_DEG = 3;
export const MIN_ROT = 5;
export const MAX_ROT = 10;
export const MOBILE_BREAKPOINT = 700;

/** w×h მართკუთხედის bounding box deg გრადუსით მობრუნების შემდეგ. */
export function rotatedSize(w, h, deg) {
  const r = (Math.abs(deg) * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { bw: w * c + h * s, bh: w * s + h * c };
}

/** ორი მართკუთხედი ({x,y,w,h}) ეხება თუ არა ერთმანეთს gap დაშორების გათვალისწინებით. */
export function rectsOverlap(a, b, gap = 0) {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

/** ზომის კლასი რანგით: 0 დიდი, 1 საშუალო, 2 პატარა. */
export function tierForRank(rank, total) {
  if (rank < Math.max(2, Math.round(total * 0.25))) return 0;
  if (rank < Math.round(total * 0.6)) return 1;
  return 2;
}

const BASE_W = { desktop: [205, 168, 140], mobile: [128, 108, 92] };
export const FRAME_ASPECT = 1.42; // სიმაღლე / სიგანე (ფოტო + ფირფიტა)

/**
 * მთავარი ალგორითმი.
 * @param {object} p
 * @param {number} p.width  — კედლის სიგანე
 * @param {number} p.height — ხილული სიმაღლე (თუ არ ჩაეტია, კედელი ქვემოთ იზრდება → სქროლი)
 * @param {Array<{id:string, rank:number}>} p.items — კონტენტის ქულის კლებით
 * @param {number} p.seed
 * @param {number} [p.headerHeight]
 * @param {(W:number,H:number)=>Array<{x,y,w,h,name?}>} [p.zones] — აკრძალული ზონები (ღილაკები, დაფა)
 */
export function computeLayout({ width, height, items, seed, headerHeight = 0, zones = () => [] }) {
  const W = Math.max(280, Math.floor(width));
  const mobile = W < MOBILE_BREAKPOINT;
  const gap = mobile ? 12 : 24;
  const margin = mobile ? 10 : 18;
  const base = mobile ? BASE_W.mobile : BASE_W.desktop;
  const total = items.length;
  const tiers = items.map((it) => tierForRank(it.rank, total));

  // მასშტაბი: დესკტოპზე ჩარჩოები კედლის ~26%-ს იკავებს; მობილურზე სიგანით
  const sumArea = tiers.reduce((n, t) => n + base[t] * base[t] * FRAME_ASPECT, 0) || 1;
  const usable = W * Math.max(200, height - headerHeight);
  const scale = mobile
    ? Math.min(1.15, Math.max(0.8, W / 400))
    : Math.min(1.3, Math.max(0.55, Math.sqrt((0.26 * usable) / sumArea)));

  // დიდები ჯერ — ასე უფრო მეტი ადგილი რჩება
  const order = items.map((it, i) => ({ ...it, tier: tiers[i] })).sort((a, b) => a.tier - b.tier || a.rank - b.rank);

  let H = Math.max(Math.floor(height), headerHeight + 200);
  for (let grow = 0; grow < 20; grow++) {
    const rnd = mulberry32(seed);
    const reserved = [{ x: 0, y: 0, w: W, h: headerHeight, name: 'header' }, ...zones(W, H)];
    const placed = [];
    let ok = true;
    for (const it of order) {
      let w = base[it.tier] * scale;
      let h = w * FRAME_ASPECT;
      const rotation = (rnd() < 0.5 ? -1 : 1) * (MIN_ROT + rnd() * (MAX_ROT - MIN_ROT));
      let found = null;
      for (let shrink = 0; shrink < 6 && !found; shrink++) {
        const { bw, bh } = rotatedSize(w, h, Math.abs(rotation) + TILT_RESERVE_DEG);
        const spanX = W - 2 * margin - bw;
        const spanY = H - headerHeight - 2 * margin - bh;
        if (spanX > 0 && spanY > 0) {
          for (let t = 0; t < 200; t++) {
            const box = { x: margin + rnd() * spanX, y: headerHeight + margin + rnd() * spanY, w: bw, h: bh };
            if (placed.some((p) => rectsOverlap(box, p.box, gap))) continue;
            if (reserved.some((z) => rectsOverlap(box, z, gap))) continue;
            found = box;
            break;
          }
        }
        if (!found) { w *= 0.92; h *= 0.92; } // 200 ცდაში ვერ — ოდნავ ვამცირებთ
      }
      if (!found) { ok = false; break; }
      const cx = found.x + found.w / 2;
      const cy = found.y + found.h / 2;
      placed.push({
        id: it.id, tier: it.tier, rank: it.rank,
        x: cx - w / 2, y: cy - h / 2, w, h, rotation, box: found,
      });
    }
    if (ok) return { width: W, height: H, mobile, gap, frames: placed, zones: reserved, seed };
    H = Math.round(H + Math.max(240, height * 0.25)); // არ ჩაეტია — კედელი იზრდება ქვემოთ
  }
  throw new Error('layout: ადგილი ვერ მოიძებნა');
}

/** ტესტებისა და დებაგისთვის: ხომ არ ფარავს რამე რამეს. */
export function findOverlaps(layout) {
  const out = [];
  const f = layout.frames;
  for (let i = 0; i < f.length; i++) {
    for (let j = i + 1; j < f.length; j++) if (rectsOverlap(f[i].box, f[j].box, 0)) out.push([f[i].id, f[j].id]);
    for (const z of layout.zones) if (rectsOverlap(f[i].box, z, 0)) out.push([f[i].id, z.name || 'zone']);
  }
  return out;
}
