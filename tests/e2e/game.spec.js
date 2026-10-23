// თამაში (Round 1 §4): დღეებზე დაფუძნებული დრო — e2e კონფიგში ყოველი სხვა პერსონაჟი = 45 დღე.
// 2 გადასვლა → „ზამთარი.“, 8 გადასვლა → ჩამონგრევა; ბზარი/ეგზემპლარები/ფონი სეზონიდან.
import { test, expect } from '@playwright/test';
import { openWall, openFrame, send, storage, frameRects, expectNoOverlaps, settle, treeState, waitIntertitle, SHOTS } from './helpers.js';

const close = async (page) => { await page.keyboard.press('Escape'); await expect(page.locator('#chat')).toBeHidden(); };

test('2 პერსონაჟის გადასვლა (45+45 დღე) → „ზამთარი.“, ხე ზამთრისაა, tooltip-ში ახალი თარიღი; იგივე პერსონაჟი დროს არ ამატებს', async ({ page }) => {
  await openWall(page);
  let t = await treeState(page);
  expect(t.season).toBe('autumn');
  expect(t.tip).toContain('შემოდგომა · 1 სექტემბერი');
  expect(t.tip).toContain('ბზარი 1/5');
  expect(t.tip).toContain('ეგზემპლარი 3/3');

  await openFrame(page, 'tina'); // დღე 45
  t = await treeState(page);
  expect(t.season).toBe('autumn');
  expect(t.tip).toContain('16 ოქტომბერი');
  expect(t.progress).toBeCloseTo(0.5, 2);
  await close(page);

  await openFrame(page, 'tina'); // იგივე პერსონაჟი — დრო არ მიდის
  expect((await storage(page, 'tianshani.game')).day).toBe(45);
  await close(page);

  // მეორე პერსონაჟი → დღე 90 → ზამთარი
  await page.locator('#frames .frame[data-id="vaso"]').click();
  await expect(page.locator('#intertitle')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#intertitle p')).toHaveText('ზამთარი.');
  await page.screenshot({ path: `${SHOTS}/05-intertitle-winter.png` });
  await waitIntertitle(page);
  t = await treeState(page);
  expect(t.season).toBe('winter');
  expect(t.tip).toContain('ზამთარი · 30 ნოემბერი');
  expect(t.tip).toContain('90 დღე შემდეგ სეზონამდე');
  await expect(page.locator('#season-tree')).toHaveAttribute('data-season', 'winter');
  await expect(page.locator('body')).toHaveAttribute('data-season', 'winter');
  await expect(page.locator('#crack-val')).toHaveText('2/5');
  await expect(page.locator('#copies-val')).toHaveText('2/3');
  await expect(page.locator('#copies-tip')).toHaveText('ერთი თინას უჯრაშია სამი თვე');
  await expect(page.locator('#crack')).toHaveAttribute('data-stage', '1');
  const g = await storage(page, 'tianshani.game');
  expect(g).toMatchObject({ day: 90, cycle: 1, lastCharacterId: 'vaso', exchanges: 0 });
  expect(g.visited).toEqual(['tina', 'vaso']);
  expect(g).not.toHaveProperty('paintingFallen');

  // შეტყობინება დროს არ ამატებს (days_per_exchange: 0); სერვერს თარიღი მიდის
  const req = page.waitForRequest((r) => r.url().endsWith('/api/chat'));
  await send(page, 'სურათი გაიტანეს?');
  expect((await req).postDataJSON().gameState).toMatchObject({ day: 90, season: 'winter', crackStage: 1, lostCopies: 1, cycle: 1 });
  expect((await storage(page, 'tianshani.game'))).toMatchObject({ day: 90, exchanges: 1 });
});

test('ბზარი იზრდება სეზონთან: გაზაფხული → ზაფხული (4/5), ჩარჩოები იხრება და მაინც არაფერს ფარავს', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('tianshani.game', JSON.stringify({ cycle: 1, day: 260, exchanges: 0, lastCharacterId: 'tina', visited: [] }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  await openWall(page);
  const visibleFrac = () => page.locator('#crack path.crack-dark.trunk').evaluate((el) => 1 - Number(el.style.strokeDashoffset) / Number(el.dataset.len));
  expect(await visibleFrac()).toBeCloseTo(0.56, 2);
  expect((await treeState(page)).season).toBe('spring');
  await openFrame(page, 'vaso'); // 260 + 45 = 305 → ზაფხული
  await expect(page.locator('#crack-val')).toHaveText('4/5');
  expect(await visibleFrac()).toBeCloseTo(0.8, 2);
  expect((await treeState(page)).season).toBe('summer');
  await expect(page.locator('#frames .frame.tilted')).toHaveCount(2);
  await close(page);
  await settle(page);
  expectNoOverlaps(await frameRects(page), 0);
  await page.screenshot({ path: `${SHOTS}/06-crack-stage-4.png`, fullPage: true });
});

test('8 პერსონაჟის გადასვლა → ჩამონგრევა: შენობა №2, შემოდგომა, დღე 0, ისტორია წაშლილია, ახალი განლაგება', async ({ page }) => {
  await openWall(page);
  const before = (await frameRects(page)).frames.map((f) => [f.id, Math.round(f.x), Math.round(f.y)]);
  const seasons = [];
  page.on('console', () => {});
  const ids = ['tina', 'vaso', 'otari', 'bela', 'grisha', 'mikho', 'soso'];
  for (const id of ids) {
    await page.locator(`#frames .frame[data-id="${id}"]`).click();
    await expect(page.locator('#chat')).toBeVisible();
    await page.waitForTimeout(200);
    if (await page.locator('#intertitle').isVisible()) seasons.push(await page.locator('#intertitle p').textContent());
    await waitIntertitle(page);
    seasons.push(`·${(await treeState(page)).season}`);
    await close(page);
  }
  expect((await storage(page, 'tianshani.game')).day).toBe(315);
  expect(seasons.filter((s) => !s.startsWith('·'))).toEqual(['ზამთარი.', 'გაზაფხული.', 'ზაფხული.']);
  // მე-8 გადასვლა
  await page.locator('#frames .frame[data-id="director"]').click();
  await expect(page.locator('body')).toHaveClass(/shaking/, { timeout: 15_000 });
  await expect(page.locator('#chat')).toBeHidden();
  await expect(page.locator('#intertitle p')).toHaveText('შენობა ჩამოინგრა. ახალი შენობა. ყველაფერი თავიდან.', { timeout: 10_000 });
  await page.screenshot({ path: `${SHOTS}/07-collapse.png` });
  await expect(page.locator('#intertitle')).toBeHidden({ timeout: 10_000 });

  await expect(page.locator('#cycle-val')).toHaveText('2');
  expect((await treeState(page)).season).toBe('autumn');
  expect((await treeState(page)).tip).toContain('1 სექტემბერი');
  await expect(page.locator('#crack-val')).toHaveText('1/5');
  await expect(page.locator('#copies-val')).toHaveText('3/3');
  expect(await storage(page, 'tianshani.chats')).toEqual({});
  expect(await storage(page, 'tianshani.game')).toMatchObject({ cycle: 2, day: 0, lastCharacterId: null });
  await settle(page);
  const R = await frameRects(page);
  expectNoOverlaps(R, 20);
  expect(R.frames.map((f) => [f.id, Math.round(f.x), Math.round(f.y)])).not.toEqual(before);
  expect(await page.evaluate(() => window.tianshani.layout.seed)).toBe(1983 + 2);
  // არც ერთი ჩარჩო არ დარჩა ცენტრში
  await expect(page.locator('.frame.portrait')).toHaveCount(0);
  await expect(page.locator('#frames .frame.lifted')).toHaveCount(0);

  // ახალ ციკლში სერვერს cycle=2, დღე 45 მიდის
  const req = page.waitForRequest((r) => r.url().endsWith('/api/chat'));
  await openFrame(page, 'tina');
  await page.locator('#chat-input').fill('ახალ შენობაში ვართ?');
  await page.locator('#chat-input').press('Enter');
  expect((await req).postDataJSON().gameState).toEqual({ day: 45, season: 'autumn', crackStage: 0, lostCopies: 0, cycle: 2, paintingFallen: false });
});

test('ძველი ფორმატის მდგომარეობა (სეზონი დღის გარეშე) მიგრირდება', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('tianshani.game', JSON.stringify({ cycle: 1, season: 'spring', exchanges: 3, crackStage: 2, lostCopies: 2, paintingFallen: true, visited: [] }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  await openWall(page);
  const t = await treeState(page);
  expect(t.season).toBe('spring');
  expect(t.tip).toContain('28 თებერვალი');
  await expect(page.locator('#painting')).toBeVisible(); // სურათის მდგომარეობა აღარ ინახება
});
