// Round 3 §5 + §6: ვიწრო ეკრანები — ეშვება ორ პროექტში (playwright.config.js): phone-375 (375×812) და tablet-700 (700×900).
// §5: ჩარჩოზე დაჭერა → ჩატი მართლა ჩანს (computed opacity 1, ეკრანშია) → პასუხი ჩანს → დახურვა → ჩარჩო თავის ადგილას.
import { test, expect } from '@playwright/test';
import { openWall, send, frameState, expectSameSpot, frameRects, expectNoOverlaps, settle, SHOTS } from './helpers.js';

const tag = () => (test.info().project.name === 'tablet-700' ? '700' : '375');
const isPhone = () => test.info().project.name !== 'tablet-700';

/** კედელზე ხილული ჩარჩოები (დამალული — სხვა ზომის კლასისთვის — არ ითვლება). */
const visibleFrameIds = (page) => page.locator('#frames .frame:not([hidden])').evaluateAll((els) => els.map((e) => e.dataset.id));

const chatStyle = (page) => page.locator('#chat').evaluate((el) => {
  const s = getComputedStyle(el);
  return { opacity: s.opacity, pe: s.pointerEvents, display: s.display };
});

test('§6 კედელი: ტელეფონზე 6 / პლანშეტზე 9 ჩარჩო, არაფერი არ ედება, სახელი არ იჭრება, კედელი ~ერთი ეკრანი', async ({ page }) => {
  await openWall(page);
  await settle(page);
  const vp = page.viewportSize();
  const data = await (await page.request.get('/api/characters')).json();
  const wallOrder = data.characters.filter((c) => c.on_wall).sort((a, b) => b.content_score - a.content_score).map((c) => c.id);
  const n = isPhone() ? 6 : 9;
  const ids = await visibleFrameIds(page);
  expect(ids).toHaveLength(n);
  expect(new Set(ids)).toEqual(new Set(wallOrder.slice(0, n))); // ტოპ N კონტენტის ქულით
  const R = await frameRects(page);
  expectNoOverlaps(R, 8);
  for (const f of R.frames) {
    expect(f.x).toBeGreaterThanOrEqual(0);
    expect(f.x + f.w).toBeLessThanOrEqual(vp.width);
    expect(Math.abs(f.angle)).toBeGreaterThanOrEqual(4.99);
    expect(Math.abs(f.angle)).toBeLessThanOrEqual(10.01);
    expect(f.w / vp.width).toBeGreaterThan(isPhone() ? 0.36 : 0.26); // მობრუნებული ბოქსი ≈ 38–42% / ≈ 28%
  }
  // ნახატი ~55% (ტელეფონი)
  const pw = await page.locator('#painting').evaluate((el) => el.offsetWidth);
  if (isPhone()) expect(pw / vp.width).toBeGreaterThan(0.5);
  // სახელები: მთლიანად ჩანს (არც სიგანით, არც მესამე ხაზით არ იჭრება); თანამდებობა ფირფიტაზე არ ჩანს
  const plates = await page.locator('#frames .frame:not([hidden]) .plate-name').evaluateAll((els) => els.map((e) => ({
    t: e.textContent, sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight,
  })));
  for (const p of plates) {
    expect(p.sw, p.t).toBeLessThanOrEqual(p.cw + 1);
    expect(p.sh, p.t).toBeLessThanOrEqual(p.ch + 1);
  }
  await expect(page.locator('#frames .frame:not([hidden]) .plate-role').first()).toBeHidden();
  // კედლის სიმაღლე ≤ 1.3 × ეკრანი (ტელეფონი; პლანშეტზე 9 ჩარჩო ~28%-ით ≈ 1.5× — DECISIONS R3)
  const wallH = await page.evaluate(() => document.documentElement.scrollHeight);
  if (isPhone()) expect(wallH).toBeLessThanOrEqual(vp.height * 1.3);
  else expect(wallH).toBeLessThanOrEqual(vp.height * 1.6);
  // ზედა ზოლი — ერთი კომპაქტური რიგი (ქვესათაური და სტატისტიკა დამალულია, tooltip-შია)
  await expect(page.locator('.subtitle')).toBeHidden();
  await expect(page.locator('#stat-copies')).toBeHidden();
  await page.screenshot({ path: `${SHOTS}/R3-06-wall-${tag()}.png`, fullPage: true });
});

test('§6 დაფა იკეცება და შეხებით იშლება; „ესაუბრე სხვას“ — ქვედა ფურცელი დანარჩენებით (ფოტოებით)', async ({ page }) => {
  await openWall(page);
  const vp = page.viewportSize();
  const board = page.locator('#noticeboard');
  await expect(board).toHaveClass(/collapsed/);
  const bb = await board.boundingBox();
  expect(bb.width).toBeLessThan(70);
  await expect(page.locator('#rollcall')).toBeHidden();
  await page.locator('#noticeboard-toggle').tap();
  await expect(page.locator('#rollcall li').first()).toBeVisible();
  await expect(page.locator('#noticeboard-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#noticeboard-toggle').tap();
  await expect(page.locator('#rollcall')).toBeHidden();

  const onWall = new Set(await visibleFrameIds(page));
  await page.locator('#others-btn').scrollIntoViewIfNeeded();
  await page.locator('#others-btn').tap();
  const menu = page.locator('#others-menu');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveClass(/sheet/);
  const mb = await menu.boundingBox();
  expect(mb.x).toBeLessThanOrEqual(0.5);
  expect(mb.width).toBeGreaterThanOrEqual(vp.width - 1);
  expect(mb.y + mb.height).toBeGreaterThanOrEqual(vp.height - 1); // ქვემოთ მიკრული
  const rows = await menu.locator('.menu-item').evaluateAll((els) => els.map((e) => ({ id: e.dataset.id, img: e.querySelector('img')?.getAttribute('src') })));
  expect(rows).toHaveLength(29 - onWall.size);
  for (const r of rows) { expect(onWall.has(r.id)).toBe(false); expect(r.img).toBeTruthy(); }
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOTS}/R3-06-sheet-${tag()}.png` });
  // კედელზე არმყოფი (ამ ზომაზე) პერსონაჟი სიიდან იხსნება — პორტრეტი ახლიდან (კედლის ჩარჩოს გარეშე)
  const pick = rows.find((r) => r.id === 'grisha' || r.id === 'mikho') || rows[0];
  await menu.locator(`.menu-item[data-id="${pick.id}"]`).click();
  await expect.poll(() => chatStyle(page)).toEqual({ opacity: '1', pe: 'auto', display: 'flex' });
  await expect(page.locator(`.frame.portrait[data-id="${pick.id}"]`)).toHaveCount(1);
  await send(page, 'გამარჯობა!');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/R3-06-chat-${tag()}.png` });
  await page.locator('#chat-close').click();
  await expect(page.locator('#chat')).toBeHidden();
  await expect(page.locator('.frame.portrait')).toHaveCount(0);
  await expect(page.locator(`#frames .frame[data-id="${pick.id}"]`)).toBeHidden();
});

test('Round 4 §6: კედლის ქვემოთ ნაცრისფერი ზოლი არ არის — დოკუმენტი = კედელი, body — ბათქაშის ფერი', async ({ page }) => {
  await openWall(page);
  await settle(page);
  const m = await page.evaluate(() => ({
    doc: document.documentElement.scrollHeight,
    wall: Math.round(document.getElementById('wall').getBoundingClientRect().height),
    body: getComputedStyle(document.body).backgroundColor,
    html: getComputedStyle(document.documentElement).backgroundColor,
  }));
  expect(Math.abs(m.doc - m.wall)).toBeLessThanOrEqual(1);
  expect(m.body).toBe('rgb(176, 163, 130)');
  expect(m.html).toBe('rgb(176, 163, 130)');
  await page.evaluate(() => window.scrollTo(0, 99999));
  await page.waitForTimeout(250);
  const vp = page.viewportSize();
  // ბოლო რიგები კედელს ეკუთვნის (ფოტო/ზონები), არა body-ს
  const bottom = await page.evaluate(([w, h]) => [2, w / 2, w - 2].map((x) => {
    const el = document.elementFromPoint(x, h - 1);
    return el && (el.closest('#wall') !== null);
  }), [vp.width, vp.height]);
  expect(bottom).toEqual([true, true, true]);
  await page.screenshot({ path: `${SHOTS}/R4-06-mobile-bottom-${tag()}.png` });
});

test('§5 ჩატი ჩანს: ჩარჩო → sheet (opacity 1, ეკრანში) → პასუხი ჩანს → ✕ → ჩარჩო თავის ადგილას', async ({ page }) => {
  await openWall(page);
  const vp = page.viewportSize();
  const ids = await visibleFrameIds(page);
  const id = ids[ids.length - 1]; // ქვემოთ მდებარე — სქროლის შემთხვევაც მოწმდება
  const frame = page.locator(`#frames .frame[data-id="${id}"]`);
  await frame.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const before = await frameState(page, id);

  await frame.click();
  // ერთ წამში: ხილული, შეხებადი, მთლიანად ეკრანში
  await expect.poll(() => chatStyle(page), { timeout: 1000 }).toEqual({ opacity: '1', pe: 'auto', display: 'flex' });
  const box = await page.locator('#chat').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 0.5);
  expect(box.width).toBeGreaterThan(vp.width - 2); // მთელ სიგანეზე
  await page.waitForTimeout(500); // FLIP დასრულდა
  // პატარა პორტრეტი sheet-ის სათაურშია (არა მთელ გვერდზე)
  const head = await page.locator('#chat .chat-head').boundingBox();
  const p = await page.locator('.frame.portrait').boundingBox();
  expect(p.width).toBeLessThanOrEqual(130);
  expect(p.x).toBeGreaterThanOrEqual(head.x - 4);
  expect(p.y).toBeGreaterThanOrEqual(head.y - 4);
  expect(p.y + p.height).toBeLessThanOrEqual(head.y + head.height + 4);
  const name = await page.locator('#chat-name').boundingBox();
  expect(name.x).toBeGreaterThan(p.x + p.width - 2); // სახელი პორტრეტის გვერდით, არ ედება
  // ველი ≥16px (iOS zoom) და ეკრანშია
  expect(await page.locator('#chat-input').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  const inp = await page.locator('#chat-input').boundingBox();
  expect(inp.y + inp.height).toBeLessThanOrEqual(vp.height);
  // გვერდი sheet-ის ქვეშ არ სქროლავს
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');

  // Round 4 §8: პირველი ხაზი უკვე ჩანს; მობილურზე მთავარი მოქმედება — „გაგზავნა“ ღილაკი
  await expect(page.locator('#chat-log .msg.char.scripted')).toHaveCount(1);
  await page.locator('#chat-input').fill('გამარჯობა, როგორ ხართ?');
  await page.locator('#chat-send').tap();
  await expect(page.locator('#chat-log .msg.char:not(.streaming):not(.scripted)')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('#chat-send')).toBeEnabled();
  const bubble = page.locator('#chat-log .msg.char .bubble').last();
  await expect(bubble).toBeVisible();
  const bb = await bubble.boundingBox();
  expect(bb.y).toBeGreaterThanOrEqual(0);
  expect(bb.y + bb.height).toBeLessThanOrEqual(vp.height);
  expect(bb.x + bb.width).toBeLessThanOrEqual(vp.width);
  await page.screenshot({ path: `${SHOTS}/R3-05-chat-${tag()}.png` });

  await page.locator('#chat-close').click();
  await expect(page.locator('#chat')).toBeHidden();
  await expect(page.locator('.frame.portrait')).toHaveCount(0);
  await page.waitForTimeout(100);
  const after = await frameState(page, id);
  expectSameSpot(after, before);
  expect(after.visible).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
});
