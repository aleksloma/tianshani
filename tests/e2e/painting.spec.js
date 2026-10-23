// „გრენლანდია“: კედლის ფოტო, ოდნავ გადახრილი ნახატი, დაჭერაზე ჩამოვარდნა და გაქრობა.
import { test, expect } from '@playwright/test';
import { openWall, openFrame, frameRects, expectNoOverlaps, storage, settle, SHOTS } from './helpers.js';

test('კედლის ფოტო არის ფონი; ნახატი ეკიდება, ოდნავ გადახრილი, არაფერს ფარავს', async ({ page }) => {
  await openWall(page);
  await expect(page.locator('#wall')).toHaveClass(/has-photo/);
  const bg = await page.locator('#wall').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('assets/wall.jpg');
  const painting = page.locator('#painting');
  await expect(painting).toBeVisible();
  await expect(painting.locator('img')).toHaveJSProperty('complete', true);
  expect(await painting.locator('img').evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
  const angle = await painting.evaluate((el) => { const m = new DOMMatrix(getComputedStyle(el).transform); return (Math.atan2(m.b, m.a) * 180) / Math.PI; });
  expect(Math.abs(angle)).toBeGreaterThanOrEqual(2.49);
  expect(Math.abs(angle)).toBeLessThanOrEqual(4.01);
  const R = await frameRects(page);
  expect(R.zones.painting).toBeTruthy();
  expectNoOverlaps(R, 20);
  await expect(page.locator('.painting-ghost')).toBeHidden();
});

test('დაჭერა → ნახატი ვარდება და ქრება; ადგილზე ლაქა რჩება; პერსონაჟებმა იციან; გადატვირთვაზე (Round 1 §1) ისევ ეკიდება', async ({ page }) => {
  await openWall(page);
  await page.locator('#painting').click();
  await expect(page.locator('#painting')).toHaveClass(/dropping/);
  await page.screenshot({ path: `${SHOTS}/11-painting-falling.png` });
  await expect(page.locator('#painting')).toBeHidden({ timeout: 5000 });
  await expect(page.locator('.painting-ghost')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/12-painting-fallen.png` });
  const before = (await frameRects(page)).frames.map((f) => [f.id, Math.round(f.x), Math.round(f.y)]);

  // ამ სესიაში სერვერს ეგზავნება paintingFallen
  const req = page.waitForRequest((r) => r.url().endsWith('/api/chat'));
  await openFrame(page, 'vaso');
  await page.locator('#chat-input').fill('სურათი სად არის?');
  await page.locator('#chat-input').press('Enter');
  expect((await req).postDataJSON().gameState.paintingFallen).toBe(true);
  await expect(page.locator('#chat-send')).toBeEnabled({ timeout: 15_000 });

  // localStorage-ში ჩამოვარდნა არ ინახება → გადატვირთვაზე სურათი ისევ ეკიდება, ჩარჩოები იმავე ადგილას
  expect(await storage(page, 'tianshani.game')).not.toHaveProperty('paintingFallen');
  await page.reload();
  await page.waitForFunction(() => window.tianshani?.ready === true);
  await settle(page);
  await expect(page.locator('#painting')).toBeVisible();
  await expect(page.locator('.painting-ghost')).toBeHidden();
  const after = (await frameRects(page)).frames.map((f) => [f.id, Math.round(f.x), Math.round(f.y)]);
  expect(after).toEqual(before);
});

test('ჩამონგრევის შემდეგ ახალ შენობაში ნახატი ისევ ეკიდება', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('tianshani.game', JSON.stringify({ cycle: 1, day: 340, exchanges: 0, lastCharacterId: 'vaso', visited: [] }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  await openWall(page);
  await page.locator('#painting').click();
  await expect(page.locator('#painting')).toBeHidden({ timeout: 5000 });
  await page.locator('#frames .frame[data-id="tina"]').click(); // 340 + 45 → ჩამონგრევა
  await expect(page.locator('#intertitle p')).toHaveText('შენობა ჩამოინგრა. ახალი შენობა. ყველაფერი თავიდან.', { timeout: 15_000 });
  await expect(page.locator('#intertitle')).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('#painting')).toBeVisible();
  await expect(page.locator('.painting-ghost')).toBeHidden();
  expect(await page.evaluate(() => window.tianshani.game.paintingFallen)).toBe(false);
  await settle(page);
  expectNoOverlaps(await frameRects(page), 20);
});

test.describe('მობილური', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('მობილურზეც ნახატი ეტევა და არაფერს ფარავს; შეხებით ვარდება', async ({ page }) => {
    await openWall(page);
    const R = await frameRects(page);
    expect(R.zones.painting.x + R.zones.painting.w).toBeLessThanOrEqual(390);
    expectNoOverlaps(R, 10);
    await page.locator('#painting').scrollIntoViewIfNeeded();
    await page.locator('#painting').tap();
    await expect(page.locator('#painting')).toBeHidden({ timeout: 5000 });
  });
});
