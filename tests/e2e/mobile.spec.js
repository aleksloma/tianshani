// Round 3 §5 + §6: ვიწრო ეკრანები — ეშვება ორ პროექტში (playwright.config.js): phone-375 (375×812) და tablet-700 (700×900).
// §5: ჩარჩოზე დაჭერა → ჩატი მართლა ჩანს (computed opacity 1, ეკრანშია) → პასუხი ჩანს → დახურვა → ჩარჩო თავის ადგილას.
import { test, expect } from '@playwright/test';
import { openWall, send, frameState, expectSameSpot, SHOTS } from './helpers.js';

const tag = () => (test.info().project.name === 'tablet-700' ? '700' : '375');

/** კედელზე ხილული ჩარჩოები (დამალული — სხვა ზომის კლასისთვის — არ ითვლება). */
const visibleFrameIds = (page) => page.locator('#frames .frame:not([hidden])').evaluateAll((els) => els.map((e) => e.dataset.id));

const chatStyle = (page) => page.locator('#chat').evaluate((el) => {
  const s = getComputedStyle(el);
  return { opacity: s.opacity, pe: s.pointerEvents, display: s.display };
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

  await send(page, 'გამარჯობა, როგორ ხართ?');
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
