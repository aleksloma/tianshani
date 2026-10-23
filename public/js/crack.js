// ბზარი: seed-იანი პროცედურული ხაზი (ტოტებით), ცალკე SVG ფენა. საფეხური 0–4 → სიგრძე იზრდება stroke-dashoffset-ით.
import { mulberry32 } from './layout.js';

/** ბზარის ძირითადი ხაზის ხილული წილი თითო საფეხურზე. */
export const STAGE_FRACTION = [0.14, 0.34, 0.56, 0.8, 1.0];

const inside = (p, boxes, pad = 4) => boxes.some((b) => p.x > b.x - pad && p.x < b.x + b.w + pad && p.y > b.y - pad && p.y < b.y + b.h + pad);

/** პოლიხაზის სიგრძე. */
export function polyLength(pts) {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return n;
}

/**
 * ბზარის გენერაცია: ზემოდან ქვემოთ, ჩარჩოებს შორის გზის ძებნით (obstacles = ჩარჩოების bbox-ები).
 * @returns {{trunk: Array<{x,y}>, branches: Array<{points, stage}>}}
 */
export function generateCrack({ width, height, top = 0, seed, obstacles = [], stages = 5, startX = null }) {
  const rnd = mulberry32(seed * 7 + 11);
  const step = 13;
  const rx = width * (0.3 + rnd() * 0.4);
  // startX: კედლის ფოტოზე არსებული ბზარის ადგილი — ახალი ბზარი იქიდან „იზრდება“
  let p = { x: startX ?? rx, y: top + 4 };
  let a = Math.PI / 2 + (rnd() - 0.5) * 0.6;
  const trunk = [p];
  for (let i = 0; i < 1200 && p.y < height - 8; i++) {
    a += (rnd() - 0.5) * 0.9;
    a = a * 0.82 + (Math.PI / 2) * 0.18; // ქვემოთ მიზიდულობა
    let next = null;
    for (const da of [0, 0.45, -0.45, 0.9, -0.9, 1.3, -1.3]) {
      const aa = a + da;
      const cand = { x: p.x + Math.cos(aa) * step, y: p.y + Math.sin(aa) * step };
      if (cand.x < 6 || cand.x > width - 6) continue;
      if (!inside(cand, obstacles)) { next = cand; a = aa; break; }
    }
    if (!next) next = { x: Math.min(width - 6, Math.max(6, p.x + Math.cos(a) * step)), y: p.y + Math.abs(Math.sin(a)) * step + 2 };
    trunk.push(next);
    p = next;
  }

  // ტოტები: ძირითადი ხაზის წერტილებიდან, საფეხური — როცა ხაზი იქამდე მივა (ან მოგვიანებით)
  const branches = [];
  const nBranches = 9 + Math.floor(rnd() * 5);
  const totalLen = polyLength(trunk);
  for (let k = 0; k < nBranches; k++) {
    const idx = 3 + Math.floor(rnd() * Math.max(1, trunk.length - 6));
    const along = polyLength(trunk.slice(0, idx + 1)) / (totalLen || 1);
    const reachStage = STAGE_FRACTION.findIndex((f) => f >= along);
    const stage = Math.min(stages - 1, Math.max(reachStage, 1 + Math.floor(rnd() * (stages - 1))));
    let q = trunk[idx];
    const side = rnd() < 0.5 ? -1 : 1;
    let b = Math.PI / 2 + side * (0.6 + rnd() * 0.8);
    const pts = [q];
    const len = 5 + Math.floor(rnd() * 14);
    for (let i = 0; i < len; i++) {
      b += (rnd() - 0.5) * 0.7;
      const n = { x: q.x + Math.cos(b) * 10, y: q.y + Math.sin(b) * 10 };
      if (n.x < 4 || n.x > width - 4 || n.y > height - 4 || n.y < top) break;
      if (inside(n, obstacles, 0)) break;
      pts.push(n);
      q = n;
    }
    if (pts.length > 2) branches.push({ points: pts, stage });
  }
  return { trunk, branches };
}

const d = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
const NS = 'http://www.w3.org/2000/svg';

function pathEl(pts, cls) {
  const el = document.createElementNS(NS, 'path');
  el.setAttribute('d', d(pts));
  el.setAttribute('class', cls);
  const L = polyLength(pts);
  el.dataset.len = String(L);
  el.style.strokeDasharray = `${L} ${L}`;
  el.style.strokeDashoffset = String(L);
  return el;
}

/** SVG-ს შევსება (ერთხელ ყოველ ხელახლა განლაგებაზე). */
export function drawCrack(svg, crack, width, height) {
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.replaceChildren();
  const g = document.createElementNS(NS, 'g');
  const trunkShadow = pathEl(crack.trunk.map((p) => ({ x: p.x + 1.2, y: p.y + 1.2 })), 'crack-light trunk');
  const trunk = pathEl(crack.trunk, 'crack-dark trunk');
  g.append(trunkShadow, trunk);
  for (const b of crack.branches) {
    const light = pathEl(b.points.map((p) => ({ x: p.x + 1, y: p.y + 1 })), 'crack-light branch');
    const dark = pathEl(b.points, 'crack-dark branch');
    light.dataset.stage = dark.dataset.stage = String(b.stage);
    g.append(light, dark);
  }
  svg.append(g);
}

/** საფეხურის ჩვენება (CSS transition-ით იზრდება). */
export function setCrackStage(svg, stage) {
  const f = STAGE_FRACTION[Math.max(0, Math.min(STAGE_FRACTION.length - 1, stage))];
  svg.dataset.stage = String(stage);
  for (const el of svg.querySelectorAll('.trunk')) {
    const L = Number(el.dataset.len);
    el.style.strokeDashoffset = String(L * (1 - f));
  }
  for (const el of svg.querySelectorAll('.branch')) {
    const L = Number(el.dataset.len);
    el.style.strokeDashoffset = Number(el.dataset.stage) <= stage ? '0' : String(L);
  }
}

/** ბზართან ყველაზე ახლოს მყოფი ჩარჩოები (3–4 საფეხურზე იხრება). */
export function framesNearCrack(crack, frames, count) {
  const dist = (f) => {
    const cx = f.box.x + f.box.w / 2;
    const cy = f.box.y + f.box.h / 2;
    let best = Infinity;
    for (let i = 0; i < crack.trunk.length; i += 3) best = Math.min(best, Math.hypot(crack.trunk[i].x - cx, crack.trunk[i].y - cy));
    return best;
  };
  return [...frames].sort((a, b) => dist(a) - dist(b)).slice(0, count).map((f) => f.id);
}
