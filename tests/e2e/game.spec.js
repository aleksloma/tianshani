// თამაში (Round 1 §4 → Round 3 §2): დრო მიდის მხოლოდ საუბრის დახურვისას (e2e კონფიგი: +45 დღე, თუ გაცვლა იყო).
// საუბრის შუაში — არასდროს: არც თარიღი, არც ინტერტიტრი. სეზონის/ჩამონგრევის ეფექტები — პანელის დახურვის შემდეგ.
import { test, expect } from '@playwright/test';
import {
  openWall, openFrame, send, storage, frameRects, expectNoOverlaps, settle, treeState, waitIntertitle, SHOTS,
} from './helpers.js';

const seed = (page, state) => page.addInitScript((s) => {
  if (!sessionStorage.getItem('seeded')) {
    localStorage.setItem('tianshani.game', JSON.stringify(s));
    sessionStorage.setItem('seeded', '1');
  }
}, state);

test('§2 გაცვლა ჩატის შუაში დროს არ ცვლის; დახურვა → +45; ცარიელი საუბარი → 0; მე-2 დახურვა → „ზამთარი.“ კედელზე, ჩატი დახურულია', async ({ page }) => {
  await openWall(page);
  let t = await treeState(page);
  expect(t.season).toBe('autumn');
  expect(t.date).toBe('1 სექტემბერი');
  expect(t.meta).toBe('ბზარი 1/5 · ეგზემპლარი 3/3');
  expect(t.tip).not.toMatch(/შემოდგომა|1983/);

  await openFrame(page, 'tina');
  await send(page, 'დირექტორი აქ არის?');
  await send(page, 'კიდევ ერთი კითხვა მაქვს');
  // ჩატი ღიაა — თარიღი იგივეა, ინტერტიტრი არ ყოფილა
  t = await treeState(page);
  expect(t.date).toBe('1 სექტემბერი');
  await expect(page.locator('#intertitle')).toBeHidden();
  expect(await storage(page, 'tianshani.game')).toMatchObject({ day: 0, exchanges: 2 });

  // დახურვა (Esc) → +45 დღე ერთხელ (და არა თითო გაცვლაზე)
  await page.keyboard.press('Escape');
  await expect(page.locator('#chat')).toBeHidden();
  await expect.poll(async () => (await treeState(page)).date).toBe('16 ოქტომბერი');
  t = await treeState(page);
  expect(t.progress).toBeCloseTo(45 / 90, 2);
  expect(await storage(page, 'tianshani.game')).toMatchObject({ day: 45, exchanges: 2 });
  await page.locator('#stat-season').hover();
  await expect(page.locator('#season-tip')).toHaveCSS('opacity', '1');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/R3-02-tooltip-after-close.png`, clip: { x: 0, y: 0, width: 1366, height: 210 } });
  await page.mouse.move(2, 400);

  // გახსნა-დახურვა შეტყობინების გარეშე → დრო არ მიდის
  await openFrame(page, 'vaso');
  await page.locator('#chat-close').click();
  await expect(page.locator('#chat')).toBeHidden();
  await page.waitForTimeout(200);
  expect((await storage(page, 'tianshani.game')).day).toBe(45);

  // მეორე საუბარი: შეტყობინება → ინტერტიტრი არა; დახურვა (კედელზე დაჭერა) → „ზამთარი.“ — ჩატი უკვე დახურულია
  await openFrame(page, 'vaso');
  await send(page, 'სურათი გაიტანეს?');
  await expect(page.locator('#intertitle')).toBeHidden();
  expect((await treeState(page)).season).toBe('autumn');
  await page.locator('#chat-backdrop').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#intertitle')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#intertitle p')).toHaveText('ზამთარი.');
  await expect(page.locator('#chat')).toBeHidden();
  await expect(page.locator('.frame.portrait')).toHaveCount(0); // ჩარჩო კედელზე დაბრუნდა
  await expect(page.locator('#frames .frame[data-id="vaso"]')).not.toHaveClass(/lifted/);
  await page.screenshot({ path: `${SHOTS}/R3-02-intertitle-on-close.png` });
  await waitIntertitle(page);
  t = await treeState(page);
  expect(t.season).toBe('winter');
  expect(t.date).toBe('30 ნოემბერი');
  expect(t.meta).toBe('ბზარი 2/5 · ეგზემპლარი 2/3');
  await expect(page.locator('#season-tree')).toHaveAttribute('data-season', 'winter');
  await expect(page.locator('body')).toHaveAttribute('data-season', 'winter');
  await expect(page.locator('#crack-val')).toHaveText('2/5');
  await expect(page.locator('#copies-val')).toHaveText('2/3');
  await expect(page.locator('#copies-tip')).toHaveText('ერთი ეგზემპლარი თინას უჯრაში დარჩა — სამი თვეა იქ დევს.'); // Round 4 §2
  const g = await storage(page, 'tianshani.game');
  expect(g).toMatchObject({ day: 90, cycle: 1, exchanges: 3 });
  expect(g.visited).toEqual(['tina', 'vaso']);

  // სერვერს ახალი თარიღი მიდის
  await openFrame(page, 'tina');
  const req = page.waitForRequest((r) => r.url().endsWith('/api/chat'));
  await send(page, 'ცივა?');
  expect((await req).postDataJSON().gameState).toMatchObject({ day: 90, season: 'winter', crackStage: 1, lostCopies: 1, cycle: 1 });
});

test('§2 სხვა პერსონაჟზე გადასვლა საზღვარზე: ჯერ ინტერტიტრი (ჩატი დახურულია), მერე ახალი ჩატი იხსნება', async ({ page }) => {
  await seed(page, { cycle: 1, day: 60, exchanges: 0, lastCharacterId: null, visited: [] });
  await openWall(page);
  await openFrame(page, 'tina');
  await send(page, 'ვასო სადაა?');
  await page.locator('#chat-others').click();
  await page.locator('#others-menu .menu-item[data-id="vaso"]').click();
  // 60 + 45 = 105 → ზამთარი: ინტერტიტრი, როცა არც ერთი ჩატი არ არის ღია
  await expect(page.locator('#intertitle')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#intertitle p')).toHaveText('ზამთარი.');
  await expect(page.locator('#chat')).toBeHidden();
  await expect(page.locator('.frame.portrait')).toHaveCount(0);
  await waitIntertitle(page);
  // მერე ახალი ჩატი
  await expect(page.locator('.frame.portrait[data-id="vaso"]')).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator('#chat')).toBeVisible();
  await expect(page.locator('#chat-name')).toHaveText('ვასო');
  expect((await storage(page, 'tianshani.game')).day).toBe(105);
  // გადასვლა „→ მივიდე“ ღილაკითაც დახურვაა: გაცვლის გარეშე — დრო არ მიდის
  await page.keyboard.press('Escape');
  await expect(page.locator('#chat')).toBeHidden();
  expect((await storage(page, 'tianshani.game')).day).toBe(105);
});

test('§2 გაზაფხული → ზაფხული დახურვით (4/5): ჩარჩოები არაფერს ფარავს', async ({ page }) => {
  await seed(page, { cycle: 1, day: 260, exchanges: 0, lastCharacterId: 'tina', visited: [] });
  await openWall(page);
  expect((await treeState(page)).season).toBe('spring');
  await openFrame(page, 'vaso');
  await send(page, 'რა ხდება?');
  await expect(page.locator('#intertitle')).toBeHidden();
  await page.keyboard.press('Escape'); // 260 + 45 = 305 → ზაფხული
  await expect(page.locator('#intertitle p')).toHaveText('ზაფხული.', { timeout: 5000 });
  await waitIntertitle(page);
  await expect(page.locator('#crack-val')).toHaveText('4/5');
  expect((await treeState(page)).season).toBe('summer');
  await expect(page.locator('#frames .frame.tilted')).toHaveCount(0);
  await expect(page.locator('#crack, #crack path')).toHaveCount(0);
  await settle(page);
  expectNoOverlaps(await frameRects(page), 0);
  await page.screenshot({ path: `${SHOTS}/06-summer-stage-4.png`, fullPage: true });
});

test('§2 ჩამონგრევა დახურვისას (დღე 320 + 45): შენობა №2, შემოდგომა, დღე 0, ისტორია წაშლილია, ახალი განლაგება', async ({ page }) => {
  await seed(page, { cycle: 1, day: 320, exchanges: 16, lastCharacterId: null, visited: [] });
  await openWall(page);
  const before = (await frameRects(page)).frames.map((f) => [f.id, Math.round(f.x), Math.round(f.y)]);
  await openFrame(page, 'director');
  await send(page, 'მოთხრობა წაიკითხეთ?');
  await send(page, 'ეს ბზარი იყო აქ?');
  expect((await storage(page, 'tianshani.game')).day).toBe(320); // ჩატში დრო არ მიდის
  await page.locator('#chat-close').click();
  await expect(page.locator('body')).toHaveClass(/shaking/, { timeout: 15_000 });
  await expect(page.locator('#chat')).toBeHidden();
  await expect(page.locator('#intertitle p')).toHaveText('შენობა ჩამოინგრა. ახალი შენობა. ყველაფერი თავიდან.', { timeout: 10_000 });
  await page.screenshot({ path: `${SHOTS}/07-collapse.png` });
  await expect(page.locator('#intertitle')).toBeHidden({ timeout: 10_000 });

  await expect(page.locator('#cycle-val')).toHaveText('2');
  const t = await treeState(page);
  expect(t.season).toBe('autumn');
  expect(t.date).toBe('1 სექტემბერი');
  await expect(page.locator('#crack-val')).toHaveText('1/5');
  await expect(page.locator('#copies-val')).toHaveText('3/3');
  expect(await storage(page, 'tianshani.chats')).toEqual({});
  expect(await storage(page, 'tianshani.game')).toMatchObject({ cycle: 2, day: 0, lastCharacterId: null });
  await settle(page);
  const R = await frameRects(page);
  expectNoOverlaps(R, 20);
  expect(R.frames.map((f) => [f.id, Math.round(f.x), Math.round(f.y)])).not.toEqual(before);
  expect(await page.evaluate(() => window.tianshani.layout.seed)).toBe(1983 + 2);
  await expect(page.locator('.frame.portrait')).toHaveCount(0);
  await expect(page.locator('#frames .frame.lifted')).toHaveCount(0);

  // ახალ ციკლში სერვერს cycle=2, დღე 0 მიდის
  const req = page.waitForRequest((r) => r.url().endsWith('/api/chat'));
  await openFrame(page, 'tina');
  await page.locator('#chat-input').fill('ახალ შენობაში ვართ?');
  await page.locator('#chat-input').press('Enter');
  expect((await req).postDataJSON().gameState).toEqual({ day: 0, season: 'autumn', crackStage: 0, lostCopies: 0, cycle: 2, paintingFallen: false });
});

test('ძველი ფორმატის მდგომარეობა (სეზონი დღის გარეშე) მიგრირდება', async ({ page }) => {
  await seed(page, { cycle: 1, season: 'spring', exchanges: 3, crackStage: 2, lostCopies: 2, paintingFallen: true, visited: [] });
  await openWall(page);
  const t = await treeState(page);
  expect(t.season).toBe('spring');
  expect(t.date).toBe('28 თებერვალი');
  await expect(page.locator('#painting')).toBeVisible(); // სურათის მდგომარეობა აღარ ინახება
});

test('ფონი ეტაპების მიხედვით: ["wall.jpg","wall-b.jpg",null,null,null] → სეზონის ცვლილების (დახურვის) შემდეგ b-ზე გადადის (cross-fade)', async ({ page }) => {
  await page.route('**/api/characters', async (route) => {
    const res = await route.fetch();
    const j = await res.json();
    j.wall_backgrounds = ['assets/wall.jpg', 'assets/wall-b.test.jpg', null, null, null];
    await route.fulfill({ response: res, json: j });
  });
  await page.route('**/assets/wall-b.test.jpg', (route) => route.fulfill({ path: 'public/assets/wall.jpg', contentType: 'image/jpeg' }));
  await seed(page, { cycle: 1, day: 80, exchanges: 4, lastCharacterId: null, visited: [] });
  await openWall(page);
  const bg = () => page.evaluate(() => {
    const active = document.querySelector('.wall-photo.active');
    return { data: document.getElementById('wall').dataset.background, src: active?.dataset.src, image: active ? getComputedStyle(active).backgroundImage : null, layers: document.querySelectorAll('.wall-photo.active').length };
  });
  let b = await bg();
  expect(b.data).toBe('assets/wall.jpg');
  expect(b.image).toContain('assets/wall.jpg');
  expect(b.layers).toBe(1);
  expect(await page.locator('.wall-photo.active').evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.9);
  await openFrame(page, 'tina');
  await send(page, 'გამარჯობა');
  expect((await bg()).data).toBe('assets/wall.jpg'); // ჩატის შუაში ფონი არ იცვლება
  await page.keyboard.press('Escape'); // 80 → 125 → ზამთარი (ბზარი 2/5 = stage 1)
  await expect(page.locator('#intertitle p')).toHaveText('ზამთარი.', { timeout: 5000 });
  await waitIntertitle(page);
  await expect.poll(async () => (await bg()).data).toBe('assets/wall-b.test.jpg');
  b = await bg();
  expect(b.src).toBe('assets/wall-b.test.jpg');
  expect(b.image).toContain('wall-b.test.jpg');
  const tr = await page.locator('.wall-photo.active').evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(tr).toContain('1.5s');
  await page.reload();
  await page.waitForFunction(() => window.tianshani?.ready === true);
  expect((await bg()).data).toBe('assets/wall-b.test.jpg');
});
