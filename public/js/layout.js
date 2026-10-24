// áƒ™áƒ”áƒ“áƒšáƒ˜áƒ¡ áƒ’áƒáƒœáƒšáƒáƒ’áƒ”áƒ‘áƒ â€” áƒ¡áƒ£áƒ¤áƒ—áƒ áƒ¤áƒ£áƒœáƒ¥áƒªáƒ˜áƒ”áƒ‘áƒ˜ (DOM-áƒ˜áƒ¡ áƒ’áƒáƒ áƒ”áƒ¨áƒ”), áƒ áƒáƒ› Node-áƒ˜áƒ¡ unit áƒ¢áƒ”áƒ¡áƒ¢áƒ”áƒ‘áƒ›áƒáƒª áƒ’áƒáƒ›áƒáƒ˜áƒ§áƒ”áƒœáƒáƒœ.
// áƒ©áƒáƒ áƒ©áƒáƒ”áƒ‘áƒ˜ áƒ¨áƒ”áƒ›áƒ—áƒ®áƒ•áƒ”áƒ•áƒ˜áƒ—, seed-áƒ˜áƒ—: áƒáƒ áƒ áƒ‘áƒáƒ“áƒ”áƒ–áƒ”, áƒáƒ áƒ áƒ¡áƒ˜áƒ›áƒ”áƒ¢áƒ áƒ˜áƒ£áƒšáƒáƒ“; collision check rotate-áƒ˜áƒ¡ áƒ¨áƒ”áƒ›áƒ“áƒ”áƒ’áƒ˜ bounding box-áƒ˜áƒ—.

/** áƒ“áƒ”áƒ¢áƒ”áƒ áƒ›áƒ˜áƒœáƒ˜áƒ¡áƒ¢áƒ£áƒšáƒ˜ PRNG (mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** áƒ‘áƒ–áƒáƒ áƒ˜áƒ¡ áƒ›áƒ”-3/4 áƒ¡áƒáƒ¤áƒ”áƒ®áƒ£áƒ áƒ–áƒ” áƒ©áƒáƒ áƒ©áƒ áƒ™áƒ˜áƒ“áƒ”áƒ• ~3Â°-áƒ˜áƒ— áƒ˜áƒ®áƒ áƒ”áƒ‘áƒ â€” áƒáƒ› áƒ›áƒáƒ áƒáƒ’áƒ¡ áƒ¬áƒ˜áƒœáƒáƒ¡áƒ¬áƒáƒ  áƒ•áƒ˜áƒ—áƒ•áƒáƒšáƒ˜áƒ¡áƒ¬áƒ˜áƒœáƒ”áƒ‘áƒ—, áƒ áƒáƒ› áƒ›áƒáƒ¨áƒ˜áƒœáƒáƒª áƒáƒ áƒáƒ¤áƒ”áƒ áƒ˜ áƒ’áƒáƒ“áƒáƒ˜áƒ¤áƒáƒ áƒáƒ¡. */
export const TILT_RESERVE_DEG = 3;
export const MIN_ROT = 5;
export const MAX_ROT = 10;
export const MOBILE_BREAKPOINT = 700;

/** áƒ–áƒáƒ›áƒ˜áƒ¡ áƒ™áƒšáƒáƒ¡áƒ˜ (Round 3 Â§5/Â§6) â€” CSS-áƒ˜áƒ¡ media query-áƒ”áƒ‘áƒ—áƒáƒœ áƒ”áƒ áƒ—áƒáƒ“: phone < 700 â‰¤ tablet < 900 â‰¤ desktop. */
export const PHONE_MAX = 699;
export const TABLET_MAX = 899;
export function sizeClass(width) {
  if (width <= PHONE_MAX) return 'phone';
  if (width <= TABLET_MAX) return 'tablet';
  return 'desktop';
}

/** wÃ—h áƒ›áƒáƒ áƒ—áƒ™áƒ£áƒ—áƒ®áƒ”áƒ“áƒ˜áƒ¡ bounding box deg áƒ’áƒ áƒáƒ“áƒ£áƒ¡áƒ˜áƒ— áƒ›áƒáƒ‘áƒ áƒ£áƒœáƒ”áƒ‘áƒ˜áƒ¡ áƒ¨áƒ”áƒ›áƒ“áƒ”áƒ’. */
export function rotatedSize(w, h, deg) {
  const r = (Math.abs(deg) * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { bw: w * c + h * s, bh: w * s + h * c };
}

/** áƒáƒ áƒ˜ áƒ›áƒáƒ áƒ—áƒ™áƒ£áƒ—áƒ®áƒ”áƒ“áƒ˜ ({x,y,w,h}) áƒ”áƒ®áƒ”áƒ‘áƒ áƒ—áƒ£ áƒáƒ áƒ áƒ”áƒ áƒ—áƒ›áƒáƒœáƒ”áƒ—áƒ¡ gap áƒ“áƒáƒ¨áƒáƒ áƒ”áƒ‘áƒ˜áƒ¡ áƒ’áƒáƒ—áƒ•áƒáƒšáƒ˜áƒ¡áƒ¬áƒ˜áƒœáƒ”áƒ‘áƒ˜áƒ—. */
export function rectsOverlap(a, b, gap = 0) {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

/** áƒ–áƒáƒ›áƒ˜áƒ¡ áƒ™áƒšáƒáƒ¡áƒ˜ áƒ áƒáƒœáƒ’áƒ˜áƒ—: 0 áƒ“áƒ˜áƒ“áƒ˜, 1 áƒ¡áƒáƒ¨áƒ£áƒáƒšáƒ, 2 áƒžáƒáƒ¢áƒáƒ áƒ. */
export function tierForRank(rank, total) {
  if (rank < Math.max(2, Math.round(total * 0.25))) return 0;
  if (rank < Math.round(total * 0.6)) return 1;
  return 2;
}

const BASE_W = { desktop: [205, 168, 140], mobile: [128, 108, 92] };
export const FRAME_ASPECT = 1.42; // áƒ¡áƒ˜áƒ›áƒáƒ¦áƒšáƒ” / áƒ¡áƒ˜áƒ’áƒáƒœáƒ” (áƒ¤áƒáƒ¢áƒ + áƒ¤áƒ˜áƒ áƒ¤áƒ˜áƒ¢áƒ)

/**
 * áƒ›áƒ—áƒáƒ•áƒáƒ áƒ˜ áƒáƒšáƒ’áƒáƒ áƒ˜áƒ—áƒ›áƒ˜.
 * @param {object} p
 * @param {number} p.width  â€” áƒ™áƒ”áƒ“áƒšáƒ˜áƒ¡ áƒ¡áƒ˜áƒ’áƒáƒœáƒ”
 * @param {number} p.height â€” áƒ®áƒ˜áƒšáƒ£áƒšáƒ˜ áƒ¡áƒ˜áƒ›áƒáƒ¦áƒšáƒ” (áƒ—áƒ£ áƒáƒ  áƒ©áƒáƒ”áƒ¢áƒ˜áƒ, áƒ™áƒ”áƒ“áƒ”áƒšáƒ˜ áƒ¥áƒ•áƒ”áƒ›áƒáƒ— áƒ˜áƒ–áƒ áƒ“áƒ”áƒ‘áƒ â†’ áƒ¡áƒ¥áƒ áƒáƒšáƒ˜)
 * @param {Array<{id:string, rank:number}>} p.items â€” áƒ™áƒáƒœáƒ¢áƒ”áƒœáƒ¢áƒ˜áƒ¡ áƒ¥áƒ£áƒšáƒ˜áƒ¡ áƒ™áƒšáƒ”áƒ‘áƒ˜áƒ—
 * @param {number} p.seed
 * @param {number} [p.headerHeight]
 * @param {(W:number,H:number)=>Array<{x,y,w,h,name?}>} [p.zones] â€” áƒáƒ™áƒ áƒ«áƒáƒšáƒ£áƒšáƒ˜ áƒ–áƒáƒœáƒ”áƒ‘áƒ˜ (áƒ¦áƒ˜áƒšáƒáƒ™áƒ”áƒ‘áƒ˜, áƒ“áƒáƒ¤áƒ)
 */
export function computeLayout({ width, height, items, seed, headerHeight = 0, zones = () => [], sizeClass: cls = null }) {
  // Round 3 Â§6: áƒ•áƒ˜áƒ¬áƒ áƒ áƒ”áƒ™áƒ áƒáƒœáƒ”áƒ‘áƒ¡ (phone/tablet) áƒ¡áƒáƒ™áƒ£áƒ—áƒáƒ áƒ˜, áƒ™áƒáƒ›áƒžáƒáƒ¥áƒ¢áƒ£áƒ áƒ˜ áƒ’áƒáƒœáƒšáƒáƒ’áƒ”áƒ‘áƒ áƒáƒ¥áƒ•áƒ¡; áƒ“áƒ”áƒ¡áƒ™áƒ¢áƒáƒžáƒ˜áƒ¡ áƒ’áƒ–áƒ áƒ£áƒªáƒ•áƒšáƒ”áƒšáƒ˜áƒ
  if (cls === 'phone' || cls === 'tablet') return computeSlotLayout({ width, height, items, seed, headerHeight, zones, sizeClass: cls });
  const W = Math.max(280, Math.floor(width));
  const mobile = W < MOBILE_BREAKPOINT;
  const gap = mobile ? 12 : 24;
  const margin = mobile ? 10 : 18;
  const base = mobile ? BASE_W.mobile : BASE_W.desktop;
  // áƒ’áƒáƒœáƒ¡áƒáƒ™áƒ£áƒ—áƒ áƒ”áƒ‘áƒ£áƒšáƒ˜ áƒ”áƒšáƒ”áƒ›áƒ”áƒœáƒ¢áƒ”áƒ‘áƒ˜ (áƒ›áƒáƒ’. áƒœáƒáƒ®áƒáƒ¢áƒ˜): áƒ¡áƒáƒ™áƒ£áƒ—áƒáƒ áƒ˜ áƒ–áƒáƒ›áƒ/áƒžáƒ áƒáƒžáƒáƒ áƒªáƒ˜áƒ/áƒ’áƒáƒ“áƒáƒ®áƒ áƒ â€” { size: {w, mw, aspect}, rot: [min, max] }
  const special = items.filter((it) => it.size);
  const plain = items.filter((it) => !it.size);
  const total = plain.length;
  const tiers = plain.map((it) => tierForRank(it.rank, total));
  const specialW = (it) => (mobile ? it.size.mw || it.size.w * 0.65 : it.size.w);

  // áƒ›áƒáƒ¡áƒ¨áƒ¢áƒáƒ‘áƒ˜: áƒ“áƒ”áƒ¡áƒ™áƒ¢áƒáƒžáƒ–áƒ” áƒ©áƒáƒ áƒ©áƒáƒ”áƒ‘áƒ˜ áƒ™áƒ”áƒ“áƒšáƒ˜áƒ¡ ~26%-áƒ¡ áƒ˜áƒ™áƒáƒ•áƒ”áƒ‘áƒ¡; áƒ›áƒáƒ‘áƒ˜áƒšáƒ£áƒ áƒ–áƒ” áƒ¡áƒ˜áƒ’áƒáƒœáƒ˜áƒ—
  const sumArea = (tiers.reduce((n, t) => n + base[t] * base[t] * FRAME_ASPECT, 0)
    + special.reduce((n, it) => n + specialW(it) ** 2 * it.size.aspect, 0)) || 1;
  const usable = W * Math.max(200, height - headerHeight);
  const scale = mobile
    ? Math.min(1.15, Math.max(0.8, W / 400))
    : Math.min(1.3, Math.max(0.55, Math.sqrt((0.26 * usable) / sumArea)));

  // áƒ’áƒáƒœáƒ¡áƒáƒ™áƒ£áƒ—áƒ áƒ”áƒ‘áƒ£áƒšáƒ”áƒ‘áƒ˜ áƒ“áƒ áƒ“áƒ˜áƒ“áƒ”áƒ‘áƒ˜ áƒ¯áƒ”áƒ  â€” áƒáƒ¡áƒ” áƒ£áƒ¤áƒ áƒ áƒ›áƒ”áƒ¢áƒ˜ áƒáƒ“áƒ’áƒ˜áƒšáƒ˜ áƒ áƒ©áƒ”áƒ‘áƒ
  const order = [
    ...special.map((it) => ({ ...it, tier: -1 })),
    ...plain.map((it, i) => ({ ...it, tier: tiers[i] })).sort((a, b) => a.tier - b.tier || a.rank - b.rank),
  ];

  let H = Math.max(Math.floor(height), headerHeight + 200);
  for (let grow = 0; grow < 20; grow++) {
    const rnd = mulberry32(seed);
    const reserved = [{ x: 0, y: 0, w: W, h: headerHeight, name: 'header' }, ...zones(W, H)];
    const placed = [];
    let ok = true;
    for (const it of order) {
      let w = (it.size ? specialW(it) : base[it.tier]) * scale;
      let h = w * (it.size ? it.size.aspect : FRAME_ASPECT);
      const [rMin, rMax] = it.rot || [MIN_ROT, MAX_ROT];
      const rotation = (rnd() < 0.5 ? -1 : 1) * (rMin + rnd() * (rMax - rMin));
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
        if (!found) { w *= 0.92; h *= 0.92; } // 200 áƒªáƒ“áƒáƒ¨áƒ˜ áƒ•áƒ”áƒ  â€” áƒáƒ“áƒœáƒáƒ• áƒ•áƒáƒ›áƒªáƒ˜áƒ áƒ”áƒ‘áƒ—
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
    H = Math.round(H + Math.max(240, height * 0.25)); // áƒáƒ  áƒ©áƒáƒ”áƒ¢áƒ˜áƒ â€” áƒ™áƒ”áƒ“áƒ”áƒšáƒ˜ áƒ˜áƒ–áƒ áƒ“áƒ”áƒ‘áƒ áƒ¥áƒ•áƒ”áƒ›áƒáƒ—
  }
  throw new Error('layout: áƒáƒ“áƒ’áƒ˜áƒšáƒ˜ áƒ•áƒ”áƒ  áƒ›áƒáƒ˜áƒ«áƒ”áƒ‘áƒœáƒ');
}

/**
 * áƒ•áƒ˜áƒ¬áƒ áƒ áƒ”áƒ™áƒ áƒáƒœáƒ˜áƒ¡ áƒžáƒ áƒáƒ¤áƒ˜áƒšáƒ”áƒ‘áƒ˜ (Round 3 Â§6). áƒ¡áƒ˜áƒ’áƒáƒœáƒ”áƒ”áƒ‘áƒ˜ â€” W-áƒ˜áƒ¡ áƒ¬áƒ˜áƒšáƒ˜ áƒ–áƒáƒ›áƒ˜áƒ¡ áƒ™áƒšáƒáƒ¡áƒ˜áƒ¡ áƒ›áƒ˜áƒ®áƒ”áƒ“áƒ•áƒ˜áƒ— (áƒ“áƒ˜áƒ“áƒ˜/áƒ¡áƒáƒ¨áƒ£áƒáƒšáƒ/áƒžáƒáƒ¢áƒáƒ áƒ).
 * áƒ¢áƒ”áƒšáƒ”áƒ¤áƒáƒœáƒ–áƒ” áƒ áƒ˜áƒ’áƒ¨áƒ˜ 2 áƒ©áƒáƒ áƒ©áƒáƒ, áƒžáƒšáƒáƒœáƒ¨áƒ”áƒ¢áƒ–áƒ” 3; áƒœáƒáƒ®áƒáƒ¢áƒ˜ áƒ¢áƒ”áƒšáƒ”áƒ¤áƒáƒœáƒ–áƒ” áƒªáƒáƒšáƒ™áƒ” áƒ áƒ˜áƒ’áƒ¨áƒ˜áƒ, áƒžáƒšáƒáƒœáƒ¨áƒ”áƒ¢áƒ–áƒ” 2 áƒ©áƒáƒ áƒ©áƒáƒ¡áƒ—áƒáƒœ áƒ”áƒ áƒ—áƒáƒ“.
 */
export const NARROW_PROFILES = {
  phone: { perRow: 2, frac: [0.40, 0.38, 0.36], paintFrac: 0.54, paintRowSlots: 0, gap: 10, margin: 8, jitter: 5 },
  tablet: { perRow: 3, frac: [0.27, 0.26, 0.25], paintFrac: 0.34, paintRowSlots: 2, gap: 12, margin: 10, jitter: 8 },
};

/**
 * áƒ™áƒáƒ›áƒžáƒáƒ¥áƒ¢áƒ£áƒ áƒ˜ áƒ’áƒáƒœáƒšáƒáƒ’áƒ”áƒ‘áƒ áƒ•áƒ˜áƒ¬áƒ áƒ áƒ”áƒ™áƒ áƒáƒœáƒ–áƒ”: seed-áƒ˜áƒáƒœáƒ˜, â€žáƒ áƒ˜áƒ’áƒ”áƒ‘áƒáƒ“â€œ (áƒ áƒáƒ› ~áƒ”áƒ áƒ— áƒ”áƒ™áƒ áƒáƒœáƒ¨áƒ˜ áƒ©áƒáƒ”áƒ¢áƒ˜áƒáƒ¡), áƒ›áƒáƒ’áƒ áƒáƒ› áƒáƒ áƒ áƒ‘áƒáƒ“áƒ” â€”
 * áƒ áƒ˜áƒ’áƒ˜áƒ¡ áƒ¨áƒ˜áƒ’áƒœáƒ˜áƒ— áƒáƒ“áƒ’áƒ˜áƒšáƒ”áƒ‘áƒ˜, áƒ™áƒ£áƒ—áƒ®áƒ”áƒ”áƒ‘áƒ˜ (5â€“10Â°), áƒ•áƒ”áƒ áƒ¢áƒ˜áƒ™áƒáƒšáƒ£áƒ áƒ˜ áƒ¬áƒáƒœáƒáƒªáƒ•áƒšáƒ”áƒ‘áƒ áƒ“áƒ áƒ áƒ˜áƒ’áƒ”áƒ‘áƒ¡ áƒ¨áƒáƒ áƒ˜áƒ¡ áƒ“áƒáƒ¨áƒáƒ áƒ”áƒ‘áƒ áƒ¨áƒ”áƒ›áƒ—áƒ®áƒ•áƒ”áƒ•áƒ˜áƒ—áƒ˜áƒ.
 * áƒ¨áƒ”áƒ›áƒ—áƒ®áƒ•áƒ”áƒ•áƒ˜áƒ— áƒ«áƒ”áƒ‘áƒœáƒáƒ¡ áƒáƒ áƒ˜ ~40%-áƒ˜áƒáƒœáƒ˜ áƒ›áƒáƒ‘áƒ áƒ£áƒœáƒ”áƒ‘áƒ£áƒšáƒ˜ áƒ©áƒáƒ áƒ©áƒ 375px-áƒ¨áƒ˜ áƒ•áƒ”áƒ  â€žáƒžáƒáƒ£áƒšáƒáƒ‘áƒ¡â€œ (áƒ‘áƒáƒ¥áƒ¡áƒ˜ â‰ˆ 1.12â€“1.23 Ã— áƒ¡áƒ˜áƒ’áƒáƒœáƒ”), áƒáƒ›áƒ˜áƒ¢áƒáƒ› áƒ áƒ˜áƒ’áƒ”áƒ‘áƒ˜.
 */
export function computeSlotLayout({ width, height, items, seed, headerHeight = 0, zones = () => [], sizeClass: cls }) {
  const W = Math.max(280, Math.floor(width));
  const P = NARROW_PROFILES[cls];
  const rnd = mulberry32(seed);
  const span = W - 2 * P.margin;
  const special = items.filter((it) => it.size);
  const plain = items.filter((it) => !it.size);
  const total = plain.length;

  // áƒ©áƒáƒ áƒ©áƒáƒ”áƒ‘áƒ˜: áƒ–áƒáƒ›áƒ áƒ áƒáƒœáƒ’áƒ˜áƒ—, áƒ—áƒáƒœáƒ›áƒ˜áƒ›áƒ“áƒ”áƒ•áƒ áƒáƒ‘áƒ â€” seed-áƒ˜áƒáƒœáƒ˜ áƒáƒ áƒ”áƒ•áƒ (Fisherâ€“Yates)
  const frames = plain.map((it) => {
    const tier = tierForRank(it.rank, total);
    return { ...it, tier, w: P.frac[tier] * W, aspect: FRAME_ASPECT, rotRange: [MIN_ROT, MAX_ROT] };
  });
  for (let i = frames.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [frames[i], frames[j]] = [frames[j], frames[i]];
  }
  const paintings = special.map((it) => ({ ...it, tier: -1, w: P.paintFrac * W, aspect: it.size.aspect, rotRange: it.rot || [MIN_ROT, MAX_ROT] }));

  // áƒ áƒ˜áƒ’áƒ”áƒ‘áƒ˜: áƒžáƒšáƒáƒœáƒ¨áƒ”áƒ¢áƒ–áƒ” áƒœáƒáƒ®áƒáƒ¢áƒ˜áƒ¡ áƒ áƒ˜áƒ’áƒ¨áƒ˜ 2 áƒ©áƒáƒ áƒ©áƒáƒª áƒ¯áƒ“áƒ”áƒ‘áƒ; áƒ“áƒáƒœáƒáƒ áƒ©áƒ”áƒœáƒ˜ áƒ—áƒáƒœáƒáƒ‘áƒ áƒáƒ“ (9 â†’ [áƒœáƒáƒ®áƒáƒ¢áƒ˜+2], 3, 2, 2; áƒ¢áƒ”áƒšáƒ”áƒ¤áƒáƒœáƒ–áƒ” 6 â†’ 2, 2, 2)
  const take = paintings.length ? Math.min(P.paintRowSlots, frames.length) : 0;
  const rest = frames.slice(take);
  const nRows = Math.ceil(rest.length / P.perRow);
  const rows = [];
  for (let r = 0, k = 0; r < nRows; r++) {
    const n = Math.floor(rest.length / nRows) + (r < rest.length % nRows ? 1 : 0);
    rows.push(rest.slice(k, k + n));
    k += n;
  }
  for (const [pi, p] of paintings.entries()) {
    const row = [p, ...(pi === 0 ? frames.slice(0, take) : [])];
    for (let i = row.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [row[i], row[j]] = [row[j], row[i]]; }
    rows.splice(Math.floor(rnd() * (rows.length + 1)), 0, row);
  }

  // áƒ—áƒ˜áƒ—áƒ áƒ áƒ˜áƒ’áƒ˜: áƒ™áƒ£áƒ—áƒ®áƒ”áƒ”áƒ‘áƒ˜ â†’ (áƒ—áƒ£ áƒáƒ  áƒ”áƒ¢áƒ”áƒ•áƒ) áƒ™áƒ£áƒ—áƒ®áƒ˜áƒ¡ áƒ–áƒ¦áƒ•áƒáƒ áƒ˜ áƒ˜áƒ™áƒšáƒ”áƒ‘áƒ¡ 5Â°-áƒ›áƒ“áƒ” â†’ (áƒ—áƒ£ áƒ›áƒáƒ˜áƒœáƒª áƒáƒ áƒ) áƒ–áƒáƒ›áƒ áƒ˜áƒ™áƒšáƒ”áƒ‘áƒ¡
  const laid = rows.map((row) => {
    const drawn = row.map((it) => {
      const [a, b] = it.rotRange;
      return { it, sign: rnd() < 0.5 ? -1 : 1, mag: a + rnd() * (b - a), min: a };
    });
    let scale = 1;
    let t = 1; // 1 → შემთხვევითი კუთხეები; 0 → ყველა მინიმალურზე (5°). პროპორციულად — კუთხეები ერთმანეთისგან განსხვავებული რჩება
    const fit = () => drawn.map((d) => {
      const w = d.it.w * scale;
      const h = w * d.it.aspect;
      const mag = d.min + (d.mag - d.min) * t;
      return { ...d, w, h, mag, ...rotatedSize(w, h, mag) };
    });
    let cells = fit();
    const need = () => cells.reduce((n, c) => n + c.bw, 0) + P.gap * (cells.length - 1);
    while (need() > span && t > 0) { t = Math.max(0, t - 0.05); cells = fit(); }
    while (need() > span && scale > 0.5) { scale *= 0.96; cells = fit(); }
    // + jitter: ყველაზე მაღალ ჩარჩოსაც აქვს ვერტიკალური თავისუფლება — რიგი „სწორი ხაზი“ არ არის
    return { cells, height: Math.max(...cells.map((c) => c.bh)) + P.jitter, free: span - need() };
  });

  // áƒ•áƒ”áƒ áƒ¢áƒ˜áƒ™áƒáƒšáƒ˜: áƒ áƒ˜áƒ’áƒ”áƒ‘áƒ¡ áƒ¨áƒáƒ áƒ˜áƒ¡ áƒ¨áƒ”áƒ›áƒ—áƒ®áƒ•áƒ”áƒ•áƒ˜áƒ—áƒ˜ áƒ“áƒáƒ¨áƒáƒ áƒ”áƒ‘áƒ; áƒ°áƒáƒ áƒ˜áƒ–áƒáƒœáƒ¢áƒáƒšáƒ˜: áƒ—áƒáƒ•áƒ˜áƒ¡áƒ£áƒ¤áƒáƒšáƒ˜ áƒáƒ“áƒ’áƒ˜áƒšáƒ˜ áƒ™áƒ˜áƒ“áƒ”áƒ”áƒ‘áƒ¡áƒ áƒ“áƒ áƒ©áƒáƒ áƒ©áƒáƒ”áƒ‘áƒ¡ áƒ¨áƒáƒ áƒ˜áƒ¡
  const gaps = laid.map((_, i) => (i === 0 ? 0 : P.gap));
  const hx = laid.map((row) => {
    const wts = Array.from({ length: row.cells.length + 1 }, () => rnd());
    const sum = wts.reduce((n, x) => n + x, 0) || 1;
    return wts.map((x) => (row.free * x) / sum);
  });
  const vy = laid.map((row) => row.cells.map(() => rnd()));
  const content = laid.reduce((n, r) => n + r.height, 0) + gaps.reduce((n, g) => n + g, 0);

  /** áƒ’áƒáƒœáƒ—áƒáƒ•áƒ¡áƒ”áƒ‘áƒ áƒ›áƒáƒªáƒ”áƒ›áƒ£áƒšáƒ˜ áƒ“áƒáƒ›áƒáƒ¢áƒ”áƒ‘áƒ˜áƒ—áƒ˜ áƒ“áƒáƒ¨áƒáƒ áƒ”áƒ‘áƒ”áƒ‘áƒ˜áƒ— (extra[i] â€” i-áƒ” áƒ áƒ˜áƒ’áƒ˜áƒ¡ áƒ¬áƒ˜áƒœ). */
  const place = (extra) => {
    const out = [];
    let y = headerHeight + P.margin;
    laid.forEach((row, ri) => {
      y += gaps[ri] + extra[ri];
      let x = P.margin + hx[ri][0];
      row.cells.forEach((c, ci) => {
        const box = { x, y: y + vy[ri][ci] * (row.height - c.bh), w: c.bw, h: c.bh }; // áƒ áƒ˜áƒ’áƒ˜áƒ¡ áƒ¨áƒ˜áƒ’áƒœáƒ˜áƒ— áƒ–áƒ”áƒ›áƒáƒ—/áƒ¥áƒ•áƒ”áƒ›áƒáƒ—
        const cx = box.x + box.w / 2;
        const cy = box.y + box.h / 2;
        out.push({ id: c.it.id, tier: c.it.tier, rank: c.it.rank, x: cx - c.w / 2, y: cy - c.h / 2, w: c.w, h: c.h, rotation: c.sign * c.mag, box });
        x += c.bw + P.gap + hx[ri][ci + 1];
      });
      y += row.height;
    });
    return out;
  };

  // áƒ¡áƒ˜áƒ›áƒáƒ¦áƒšáƒ”: áƒ¨áƒ˜áƒ’áƒ—áƒáƒ•áƒ¡áƒ˜ + áƒ¥áƒ•áƒ”áƒ“áƒ áƒ™áƒ£áƒ—áƒ®áƒ”áƒ”áƒ‘áƒ˜áƒ¡ áƒ¦áƒ˜áƒšáƒáƒ™áƒ”áƒ‘áƒ˜ (áƒ›áƒ®áƒáƒšáƒáƒ“ áƒ—áƒ£ áƒ‘áƒáƒšáƒ áƒ áƒ˜áƒ’áƒ˜ áƒ›áƒáƒ— áƒ”áƒ®áƒ”áƒ‘áƒ); áƒ”áƒ™áƒ áƒáƒœáƒ–áƒ” áƒ›áƒáƒ™áƒšáƒ” áƒ™áƒ”áƒ“áƒ”áƒšáƒ˜ â€” áƒ–áƒ”áƒ“áƒ›áƒ”áƒ¢áƒ˜ áƒáƒ“áƒ’áƒ˜áƒšáƒ˜ áƒ áƒ˜áƒ’áƒ”áƒ‘áƒ¡ áƒ¨áƒáƒ áƒ˜áƒ¡
  const bottom = headerHeight + P.margin + content + P.margin;
  let H = Math.max(Math.floor(height), Math.ceil(bottom));
  const extra = laid.map(() => 0);
  const spread = (amount) => {
    const wts = laid.map(() => 0.5 + rnd());
    const sum = wts.reduce((n, x) => n + x, 0);
    wts.forEach((x, i) => { extra[i] += (amount * x) / sum; });
  };
  if (H > bottom) spread(H - bottom);
  const placed = place(extra);
  for (let i = 0; i < 3; i++) {
    const zs = zones(W, H);
    const depth = Math.max(0, ...placed.flatMap((f) => zs.filter((z) => rectsOverlap(f.box, z, P.gap)).map((z) => f.box.y + f.box.h + P.gap - z.y)));
    if (!depth) break;
    H = Math.ceil(H + depth); // áƒ–áƒáƒœáƒ”áƒ‘áƒ˜ áƒ¥áƒ•áƒ”áƒ›áƒáƒ— áƒ˜áƒ¬áƒ”áƒ•áƒ¡ â€” áƒ©áƒáƒ áƒ©áƒáƒ”áƒ‘áƒ˜ áƒáƒ“áƒ’áƒ˜áƒšáƒ–áƒ” áƒ áƒ©áƒ”áƒ‘áƒ
  }

  const reserved = [{ x: 0, y: 0, w: W, h: headerHeight, name: 'header' }, ...zones(W, H)];
  return { width: W, height: H, mobile: cls === 'phone', sizeClass: cls, gap: P.gap, frames: placed, zones: reserved, seed };
}

/** áƒ¢áƒ”áƒ¡áƒ¢áƒ”áƒ‘áƒ˜áƒ¡áƒ áƒ“áƒ áƒ“áƒ”áƒ‘áƒáƒ’áƒ˜áƒ¡áƒ—áƒ•áƒ˜áƒ¡: áƒ®áƒáƒ› áƒáƒ  áƒ¤áƒáƒ áƒáƒ•áƒ¡ áƒ áƒáƒ›áƒ” áƒ áƒáƒ›áƒ”áƒ¡. */
export function findOverlaps(layout) {
  const out = [];
  const f = layout.frames;
  for (let i = 0; i < f.length; i++) {
    for (let j = i + 1; j < f.length; j++) if (rectsOverlap(f[i].box, f[j].box, 0)) out.push([f[i].id, f[j].id]);
    for (const z of layout.zones) if (rectsOverlap(f[i].box, z, 0)) out.push([f[i].id, z.name || 'zone']);
  }
  return out;
}
