// Round 3 (FIXES_ROUND3.md): ზომის კლასები და ვიწრო ეკრანის განლაგება (§6), დესკტოპის განლაგება უცვლელია.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeLayout, findOverlaps, rectsOverlap, sizeClass, NARROW_PROFILES, MIN_ROT, MAX_ROT } from '../../public/js/layout.js';
import { usedPercent, formatPercentKa, percentLevel, tokensTipLine } from '../../public/js/format.js';

// ---------- §3 ----------

test('§3 პროცენტი: ერთი ათწილადი, ქართული მძიმე, 0–100-ში', () => {
  const NB = ' ';
  assert.equal(formatPercentKa(0), `0,0${NB}%`);
  assert.equal(formatPercentKa(0.27), `0,3${NB}%`);
  assert.equal(formatPercentKa(12.345), `12,3${NB}%`);
  assert.equal(formatPercentKa(99.96), `100,0${NB}%`);
  assert.equal(formatPercentKa(140), `100,0${NB}%`);
  assert.equal(formatPercentKa(-3), `0,0${NB}%`);
  assert.equal(formatPercentKa('x'), `0,0${NB}%`);
  assert.equal(usedPercent(1500, 500000), 0.3);
  assert.equal(usedPercent(600000, 500000), 100, 'ძველი მთვლელი ახალ ლიმიტზე მეტია → 100%');
  assert.equal(usedPercent(10, 0), 0);
  assert.deepEqual([0, 69.9, 70, 90, 90.1, 100].map(percentLevel), ['ok', 'ok', 'warn', 'warn', 'hot', 'hot']);
  assert.equal(tokensTipLine(0.3, 'monthly', '2026-11-01T00:00:00.000Z'), `გახარჯულია შემომავალი ტოკენების 0,3${NB}% · განახლდება 1 ნოემბერს`);
  assert.equal(tokensTipLine(5, 'lifetime', null), `გახარჯულია შემომავალი ტოკენების 5,0${NB}% · ერთჯერადი ლიმიტი`);
});

const PAINTING = { id: 'painting', rank: -1, size: { w: 450, mw: 250, aspect: 539 / 760 }, rot: [2.5, 4] };
const itemsN = (n) => [PAINTING, ...Array.from({ length: n }, (_, i) => ({ id: `c${i}`, rank: i }))];

// ---------- §6 ----------

test('§6 sizeClass: phone < 700 ≤ tablet < 900 ≤ desktop', () => {
  assert.equal(sizeClass(375), 'phone');
  assert.equal(sizeClass(699), 'phone');
  assert.equal(sizeClass(700), 'tablet');
  assert.equal(sizeClass(899), 'tablet');
  assert.equal(sizeClass(900), 'desktop');
  assert.equal(sizeClass(1280), 'desktop');
});

test('§6 დესკტოპის განლაგება ბაიტ-ბაიტ უცვლელია (Round 3-მდე გადაღებული ფიქსტურა, 7 ზომა × 3 seed)', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/desktop-layouts.json', import.meta.url), 'utf8'));
  const zones = (W, H) => [{ name: 'others', x: W - 190, y: H - 70, w: 172, h: 52 }, { name: 'board', x: 18, y: H - 190, w: 232, h: 172 }];
  for (const c of fixture) {
    for (const cls of [undefined, 'desktop']) {
      const L = computeLayout({ width: c.W, height: c.H, items: itemsN(12), seed: c.seed, headerHeight: 99, zones, sizeClass: cls });
      assert.equal(L.height, c.height, `${c.W}×${c.H}/${c.seed}`);
      assert.deepEqual(L.frames.map((f) => ({ id: f.id, tier: f.tier, x: f.x, y: f.y, w: f.w, h: f.h, rotation: f.rotation })), c.frames, `${c.W}×${c.H}/${c.seed}`);
    }
  }
});

const narrowZones = (W, H) => [{ name: 'others', x: W - 140, y: H - 46, w: 132, h: 38 }, { name: 'board', x: 8, y: H - 58, w: 46, h: 50 }];

for (const [W, H, cls, n, maxRatio] of [[375, 812, 'phone', 6, 1.3], [390, 844, 'phone', 6, 1.3], [700, 900, 'tablet', 9, 1.55], [768, 1024, 'tablet', 9, 1.5]]) {
  test(`§6 ${cls} ${W}×${H}: ${n} ჩარჩო + ნახატი, გადაფარვა არ არის, 5–10°, სიმაღლე ≤ ${maxRatio}×`, () => {
    for (const seed of [1984, 1985, 1986, 1987, 1988, 1989, 2024]) {
      const L = computeLayout({ width: W, height: H, items: itemsN(n), seed, headerHeight: 70, zones: narrowZones, sizeClass: cls });
      assert.equal(L.sizeClass, cls);
      assert.equal(L.frames.length, n + 1);
      assert.deepEqual(findOverlaps(L), [], `${seed}`);
      const f = L.frames;
      for (let i = 0; i < f.length; i++) {
        for (let j = i + 1; j < f.length; j++) assert.ok(!rectsOverlap(f[i].box, f[j].box, L.gap - 0.01), `${seed}: ${f[i].id}/${f[j].id} gap`);
        assert.ok(f[i].box.x >= 0 && f[i].box.x + f[i].box.w <= W, `${seed}: ${f[i].id} x`);
      }
      const frames = f.filter((x) => x.id !== 'painting');
      for (const fr of frames) {
        assert.ok(Math.abs(fr.rotation) >= MIN_ROT - 1e-9 && Math.abs(fr.rotation) <= MAX_ROT + 1e-9, `rot ${fr.rotation}`);
        // ჩარჩოს სიგანე — პროფილის წილი (სიგანეში ვერ ჩატევისას ოდნავ მცირდება, არა უმეტეს 15%-ით)
        const want = NARROW_PROFILES[cls].frac[fr.tier] * W;
        assert.ok(fr.w <= want + 1e-9 && fr.w >= want * 0.85, `${fr.id} w ${fr.w} / ${want}`);
      }
      assert.ok(L.height <= H * maxRatio, `${seed}: height ${L.height} > ${maxRatio}× ${H}`);
      assert.ok(L.height >= H);
      // არა ბადე: კუთხეები ორივე მიმართულებით, x-ები სხვადასხვა
      // არა ბადე: რიგის შიგნითაც სიმაღლეები განსხვავდება (არც ერთი ორი ჩარჩო ერთ y-ზე), კუთხეები განსხვავდება
      assert.ok(new Set(frames.map((x) => Math.round(x.y))).size >= n - 2, `${seed}: y`);
      assert.ok(new Set(frames.map((x) => x.rotation.toFixed(1))).size >= n - 1, `${seed}: rot`);
    }
  });
}

test('§6 დეტერმინიზმი ვიწრო ეკრანზეც: იგივე seed → იგივე, სხვა ციკლი → სხვა', () => {
  const a = computeLayout({ width: 375, height: 812, items: itemsN(6), seed: 1984, headerHeight: 70, zones: narrowZones, sizeClass: 'phone' });
  const b = computeLayout({ width: 375, height: 812, items: itemsN(6), seed: 1984, headerHeight: 70, zones: narrowZones, sizeClass: 'phone' });
  const c = computeLayout({ width: 375, height: 812, items: itemsN(6), seed: 1985, headerHeight: 70, zones: narrowZones, sizeClass: 'phone' });
  assert.deepEqual(a.frames, b.frames);
  assert.notDeepEqual(a.frames.map((f) => [f.id, f.x, f.y]), c.frames.map((f) => [f.id, f.x, f.y]));
});
