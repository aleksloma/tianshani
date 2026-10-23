// public/js/layout.js + crack.js: არეული, მაგრამ დეტერმინისტული განლაგება, გადაფარვის გარეშე.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLayout, findOverlaps, rotatedSize, rectsOverlap, mulberry32, MIN_ROT, MAX_ROT, TILT_RESERVE_DEG,
} from '../../public/js/layout.js';
import { generateCrack, polyLength, framesNearCrack } from '../../public/js/crack.js';

const items = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, rank: i }));
const zones = (W, H) => [
  { name: 'others', x: W - 190, y: H - 70, w: 172, h: 52 },
  { name: 'board', x: 18, y: H - 190, w: 232, h: 172 },
];
const VIEWPORTS = [
  [1440, 900], [1920, 1080], [1280, 720], [1024, 768], [800, 600], [390, 844], [360, 640], [768, 1024],
];

test('mulberry32 დეტერმინისტულია', () => {
  const a = mulberry32(1984); const b = mulberry32(1984);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
  assert.notEqual(mulberry32(1984)(), mulberry32(1985)());
});

test('rotatedSize / rectsOverlap', () => {
  const r = rotatedSize(100, 200, 90);
  assert.ok(Math.abs(r.bw - 200) < 1e-6 && Math.abs(r.bh - 100) < 1e-6);
  assert.ok(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }, 11));
  assert.ok(!rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }, 9));
});

for (const [W, H] of VIEWPORTS) {
  for (const seed of [1984, 1985, 1986, 2024]) {
    test(`განლაგება ${W}×${H} seed ${seed}: ყველა ჩარჩო, გადაფარვის გარეშე, gap-ით`, () => {
      const L = computeLayout({ width: W, height: H, items, seed, headerHeight: W < 700 ? 120 : 96, zones });
      assert.equal(L.frames.length, 12);
      assert.deepEqual(findOverlaps(L), []);
      const gap = W < 700 ? 12 : 24;
      assert.equal(L.gap, gap);
      for (let i = 0; i < L.frames.length; i++) {
        const f = L.frames[i];
        // მობრუნება 5°–10° (მარცხნივ ან მარჯვნივ), არასდროს 0-სთან ახლოს
        assert.ok(Math.abs(f.rotation) >= MIN_ROT && Math.abs(f.rotation) <= MAX_ROT, `rot ${f.rotation}`);
        // bbox ითვალისწინებს მობრუნებას (+ ბზარის გადახრის მარაგს)
        const { bw, bh } = rotatedSize(f.w, f.h, Math.abs(f.rotation) + TILT_RESERVE_DEG);
        assert.ok(Math.abs(f.box.w - bw) < 0.01 && Math.abs(f.box.h - bh) < 0.01);
        // კედლის შიგნით
        assert.ok(f.box.x >= 0 && f.box.x + f.box.w <= L.width, 'x');
        assert.ok(f.box.y >= 0 && f.box.y + f.box.h <= L.height, 'y');
        // მინიმალური დაშორება
        for (let j = i + 1; j < L.frames.length; j++) assert.ok(!rectsOverlap(f.box, L.frames[j].box, gap - 0.001), `${f.id}/${L.frames[j].id} gap`);
        for (const z of L.zones) assert.ok(!rectsOverlap(f.box, z, gap - 0.001), `${f.id}/${z.name} gap`);
      }
    });
  }
}

test('ზომის კლასები: უფრო „მდიდარი“ პერსონაჟი უფრო დიდია (3 ზომა)', () => {
  const L = computeLayout({ width: 1440, height: 900, items, seed: 1984, headerHeight: 96, zones });
  const tiers = new Set(L.frames.map((f) => f.tier));
  assert.deepEqual([...tiers].sort(), [0, 1, 2]);
  const top = L.frames.find((f) => f.rank === 0);
  const last = L.frames.find((f) => f.rank === 11);
  assert.ok(top.w >= last.w);
});

test('დეტერმინიზმი: იგივე seed → იგივე; სხვა seed (ახალი ციკლი) → სხვა', () => {
  const a = computeLayout({ width: 1280, height: 800, items, seed: 1984, headerHeight: 90, zones });
  const b = computeLayout({ width: 1280, height: 800, items, seed: 1984, headerHeight: 90, zones });
  const c = computeLayout({ width: 1280, height: 800, items, seed: 1985, headerHeight: 90, zones });
  assert.deepEqual(a.frames.map((f) => [f.x, f.y, f.rotation]), b.frames.map((f) => [f.x, f.y, f.rotation]));
  assert.notDeepEqual(a.frames.map((f) => [f.x, f.y]), c.frames.map((f) => [f.x, f.y]));
});

test('არა ბადე: x და y კოორდინატები არ ემთხვევა რიგებად/სვეტებად', () => {
  const L = computeLayout({ width: 1440, height: 900, items, seed: 1984, headerHeight: 96, zones });
  const xs = new Set(L.frames.map((f) => Math.round(f.x / 10)));
  const ys = new Set(L.frames.map((f) => Math.round(f.y / 10)));
  assert.ok(xs.size >= 8 && ys.size >= 8, `${xs.size}/${ys.size}`);
  assert.ok(L.frames.some((f) => f.rotation < 0) && L.frames.some((f) => f.rotation > 0), 'ორივე მიმართულება');
});

test('მობილური: კედელი ვერტიკალურად იზრდება, თუ არ ჩაეტია', () => {
  const L = computeLayout({ width: 320, height: 480, items, seed: 1984, headerHeight: 130, zones });
  assert.equal(L.frames.length, 12);
  assert.deepEqual(findOverlaps(L), []);
  assert.ok(L.height >= 480);
  assert.ok(L.mobile);
});

test('ბზარი: დეტერმინისტული, კედლის ფარგლებში, ტოტებით და საფეხურებით', () => {
  const L = computeLayout({ width: 1280, height: 800, items, seed: 1984, headerHeight: 90, zones });
  const obstacles = L.frames.map((f) => f.box);
  const a = generateCrack({ width: 1280, height: 800, top: 90, seed: 1984, obstacles });
  const b = generateCrack({ width: 1280, height: 800, top: 90, seed: 1984, obstacles });
  assert.deepEqual(a, b);
  assert.ok(polyLength(a.trunk) > 600);
  assert.ok(a.trunk.every((p) => p.x >= 0 && p.x <= 1280 && p.y >= 90 && p.y <= 800));
  assert.ok(a.branches.length >= 5);
  assert.ok(a.branches.every((br) => br.stage >= 1 && br.stage <= 4));
  // ბზარი ძირითადად ჩარჩოებს შორის გადის
  const inside = a.trunk.filter((p) => obstacles.some((o) => p.x > o.x && p.x < o.x + o.w && p.y > o.y && p.y < o.y + o.h)).length;
  assert.ok(inside / a.trunk.length < 0.15, `${inside}/${a.trunk.length}`);
  assert.equal(framesNearCrack(a, L.frames, 3).length, 3);
});
