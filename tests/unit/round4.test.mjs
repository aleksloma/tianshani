// Round 4 (FIXES_ROUND4.md): ეგზემპლარების ტემპი (§2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { derive, withDefaults, advanceDays } from '../../public/js/calendar.js';
import { LOST_COPY_NOTES } from '../../public/js/game.js';

// ---------- §2 ----------

test('§2 seasons_per_lost_copy: 1 → ყოველ სეზონზე ერთი; 2 → ყოველ მეორეზე; ზედა ზღვარი copies', () => {
  const G1 = withDefaults({});
  const G2 = withDefaults({ seasons_per_lost_copy: 2 });
  assert.equal(G1.seasons_per_lost_copy, 1);
  assert.equal(G2.seasons_per_lost_copy, 2);
  // სეზონის ინდექსი 0..3 (დღე 0, 90, 180, 270)
  assert.deepEqual([0, 90, 180, 270].map((d) => derive(d, G1).lostCopies), [0, 1, 2, 3]);
  assert.deepEqual([0, 90, 180, 270].map((d) => derive(d, G2).lostCopies), [0, 0, 1, 1]);
  // სეზონის შუაში არასდროს
  assert.equal(derive(89, G1).lostCopies, 0);
  assert.equal(derive(179, G1).lostCopies, 1);
  // copies-ზე მეტი არასდროს (ხუთი სეზონი, ორი ეგზემპლარი)
  const G5 = withDefaults({ seasons: ['a', 'b', 'c', 'd', 'e'], copies: 2 });
  assert.equal(derive(400, G5).lostCopies, 2);
  // ერთი სეზონის ცვლილებაზე — მაქსიმუმ ერთი
  for (const G of [G1, G2]) {
    for (let d = 0; d < 360; d += 45) {
      const r = advanceDays(d, 45, G);
      if (r.collapse) continue;
      assert.ok(derive(r.day, G).lostCopies - derive(d, G).lostCopies <= 1, `${d}`);
    }
  }
});

test('§2 seasons_per_lost_copy-ის ვალიდაცია: 0, უარყოფითი, ტექსტი → 1; 2.7 → 2', () => {
  for (const v of [0, -3, 'x', null]) assert.equal(withDefaults({ seasons_per_lost_copy: v }).seasons_per_lost_copy, 1, String(v));
  assert.equal(withDefaults({ seasons_per_lost_copy: 2.7 }).seasons_per_lost_copy, 2);
});

test('§2 ფილმის საბაბები — სამი სრული წინადადება, სპეცის ტექსტით', () => {
  assert.deepEqual(LOST_COPY_NOTES, [
    'ერთი ეგზემპლარი თინას უჯრაში დარჩა — სამი თვეა იქ დევს.',
    'ერთი ეგზემპლარი ბანკში (ან ცირკში) დარჩა.',
    'ერთი ეგზემპლარი ოთხად გაიყო — თითო ნაწილი თითო კოლეგასთან.',
  ]);
});
