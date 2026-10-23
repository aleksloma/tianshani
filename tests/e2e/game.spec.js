// თამაში: სეზონის ცვლილება (exchanges_per_season = 2), ბზარი, ეგზემპლარები, ჩამონგრევა, ახალი შენობა.
import { test, expect } from '@playwright/test';
import { openWall, openFrame, send, storage, frameRects, expectNoOverlaps, settle, SHOTS } from './helpers.js';

test('2 გაცვლის შემდეგ: ინტერტიტრი „ზამთარი.“, ბზარი 2/5, ეგზემპლარი 2/3, ზამთრის ტონი', async ({ page }) => {
  await openWall(page);
  await openFrame(page, 'tina');
  await send(page, 'დირექტორი აქ არის?');
  await expect(page.locator('#season-name')).toHaveText('შემოდგომა');
  // მეორე გაცვლა — ინტერტიტრი უნდა გამოჩნდეს
  await page.locator('#chat-input').fill('როდის მოვა?');
  await page.locator('#chat-input').press('Enter');
  await expect(page.locator('#intertitle')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#intertitle p')).toHaveText('ზამთარი.');
  await page.screenshot({ path: `${SHOTS}/05-intertitle-winter.png` });
  await expect(page.locator('#intertitle')).toBeHidden({ timeout: 5000 });
  await expect(page.locator('#season-name')).toHaveText('ზამთარი');
  await expect(page.locator('body')).toHaveAttribute('data-season', 'winter');
  await expect(page.locator('#crack-val')).toHaveText('2/5');
  await expect(page.locator('#copies-val')).toHaveText('2/3');
  await expect(page.locator('#copies-tip')).toHaveText('ერთი თინას უჯრაშია სამი თვე');
  await expect(page.locator('#crack')).toHaveAttribute('data-stage', '1');
  const g = await storage(page, 'tianshani.game');
  expect(g).toMatchObject({ season: 'winter', crackStage: 1, lostCopies: 1, exchanges: 0, cycle: 1 });
  expect(g.visited).toEqual(['tina']);
});

test('ბზარი იზრდება: ძირითადი ხაზის ხილული ნაწილი საფეხურთან ერთად', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('tianshani.game', JSON.stringify({ cycle: 1, season: 'spring', exchanges: 1, crackStage: 2, lostCopies: 2, visited: [] }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  await openWall(page);
  const visibleFrac = () => page.locator('#crack path.crack-dark.trunk').evaluate((el) => 1 - Number(el.style.strokeDashoffset) / Number(el.dataset.len));
  const before = await visibleFrac();
  expect(before).toBeCloseTo(0.56, 2);
  await openFrame(page, 'vaso');
  await send(page, 'სურათი გაიტანეს?');
  await expect(page.locator('#crack-val')).toHaveText('4/5');
  expect(await visibleFrac()).toBeCloseTo(0.8, 2);
  // 3–4 საფეხურზე ზოგი ჩარჩო დამატებით იხრება
  await expect(page.locator('#frames .frame.tilted')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await settle(page);
  expectNoOverlaps(await frameRects(page), 0);
  await page.screenshot({ path: `${SHOTS}/06-crack-stage-4.png`, fullPage: true });
});

test('ზაფხულის ბოლოს ჩამონგრევა: შერყევა, ინტერტიტრი, შენობა №2, შემოდგომა, ისტორია წაშლილია, ახალი განლაგება', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('tianshani.game', JSON.stringify({ cycle: 1, season: 'summer', exchanges: 1, crackStage: 3, lostCopies: 3, visited: ['vaso'] }));
      localStorage.setItem('tianshani.chats', JSON.stringify({ vaso: [{ role: 'user', content: 'ძველი', ts: 1 }, { role: 'assistant', content: 'ძველი პასუხი', ts: 2, spoken_by: 'vaso' }] }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  await openWall(page);
  await expect(page.locator('#season-name')).toHaveText('ზაფხული');
  await expect(page.locator('#copies-val')).toHaveText('0/3');
  const before = (await frameRects(page)).frames.map((f) => [f.id, Math.round(f.x), Math.round(f.y)]);

  await openFrame(page, 'director');
  await page.locator('#chat-input').fill('შენობა იბზარება, ბატონო ვაჟა!');
  await page.locator('#chat-input').press('Enter');
  await expect(page.locator('body')).toHaveClass(/shaking/, { timeout: 15_000 });
  await expect(page.locator('#chat')).toBeHidden();
  await expect(page.locator('#debris i').first()).toBeAttached();
  await expect(page.locator('#intertitle p')).toHaveText('შენობა ჩამოინგრა. ახალი შენობა. ყველაფერი თავიდან.', { timeout: 10_000 });
  await page.screenshot({ path: `${SHOTS}/07-collapse.png` });
  await expect(page.locator('#intertitle')).toBeHidden({ timeout: 10_000 });

  await expect(page.locator('#cycle-val')).toHaveText('2');
  await expect(page.locator('#season-name')).toHaveText('შემოდგომა');
  await expect(page.locator('#crack-val')).toHaveText('1/5');
  await expect(page.locator('#copies-val')).toHaveText('3/3');
  expect(await storage(page, 'tianshani.chats')).toEqual({});
  expect(await storage(page, 'tianshani.game')).toMatchObject({ cycle: 2, season: 'autumn', crackStage: 0, lostCopies: 0, exchanges: 0 });

  await settle(page);
  const R = await frameRects(page);
  expectNoOverlaps(R, 20);
  const after = R.frames.map((f) => [f.id, Math.round(f.x), Math.round(f.y)]);
  expect(after).not.toEqual(before); // ახალი seed — სხვა არეულობა
  expect(await page.evaluate(() => window.tianshani.layout.seed)).toBe(1983 + 2);

  // ახალ ციკლში სერვერს cycle=2 მიდის
  const req = page.waitForRequest((r) => r.url().endsWith('/api/chat'));
  await openFrame(page, 'tina');
  await page.locator('#chat-input').fill('ახალ შენობაში ვართ?');
  await page.locator('#chat-input').press('Enter');
  const body = (await req).postDataJSON();
  expect(body.gameState).toEqual({ season: 'autumn', crackStage: 0, lostCopies: 0, cycle: 2, paintingFallen: false });
});
