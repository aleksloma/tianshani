// თამაში (Round 1 §4 + Round 2 §5): დღეებზე დაფუძნებული დრო — ყოველი გაცვლა (შეკითხვა + პასუხი) = +20 დღე,
// პერსონაჟის გახსნა დროს არ ამატებს. 5 გაცვლა → „ზამთარი.“, ~18 → ჩამონგრევა. SVG ბზარი ამოღებულია (Round 2 §7).
import { test, expect } from '@playwright/test';
import {
  openWall, openFrame, send, sendNoWait, storage, frameRects, expectNoOverlaps, settle, treeState, waitIntertitle, SHOTS,
} from './helpers.js';

const close = async (page) => { await page.keyboard.press('Escape'); await expect(page.locator('#chat')).toBeHidden(); };

test('1 გაცვლა → „21 სექტემბერი“; 5 გაცვლა → „ზამთარი.“ და data-season="winter"; პერსონაჟის გახსნა დროს არ ამატებს', async ({ page }) => {
  await openWall(page);
  let t = await treeState(page);
  expect(t.season).toBe('autumn');
  expect(t.date).toBe('1 სექტემბერი');
  expect(t.meta).toBe('ბზარი 1/5 · ეგზემპლარი 3/3');
  expect(t.tip).not.toMatch(/შემოდგომა|1983/); // სეზონის სახელი და წელი აღარ ჩანს

  await openFrame(page, 'tina');
  expect((await treeState(page)).date).toBe('1 სექტემბერი'); // გახსნა — დრო არ მიდის
  await send(page, 'დირექტორი აქ არის?');
  t = await treeState(page);
  expect(t.date).toBe('21 სექტემბერი');
  expect(t.progress).toBeCloseTo(20 / 90, 2);
  expect(await storage(page, 'tianshani.game')).toMatchObject({ day: 20, exchanges: 1 });
  await close(page);
  // tooltip: დიდი თარიღი + პატარა „ბზარი · ეგზემპლარი“
  await page.locator('#stat-season').hover();
  await expect(page.locator('#season-tip')).toHaveCSS('opacity', '1');
  const sizes = await page.evaluate(() => ({
    d: parseFloat(getComputedStyle(document.getElementById('season-tip-date')).fontSize),
    m: parseFloat(getComputedStyle(document.getElementById('season-tip-meta')).fontSize),
  }));
  expect(sizes.d).toBeGreaterThan(sizes.m * 1.4);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/R2-07-tree-tooltip-date.png`, clip: { x: 0, y: 0, width: 1366, height: 210 } });
  await page.mouse.move(2, 400);

  await openFrame(page, 'vaso'); // სხვა პერსონაჟი — მაინც 20
  expect((await storage(page, 'tianshani.game')).day).toBe(20);
  for (const q of ['სურათი გაიტანეს?', 'კიბე სადაა?', 'მიხო მოვიდა?']) await send(page, q); // 40, 60, 80
  t = await treeState(page);
  expect(t.season).toBe('autumn');
  expect(t.date).toBe('20 ნოემბერი');

  // მე-5 გაცვლა → დღე 100 → ზამთარი: ინტერტიტრი პასუხის დასრულების შემდეგ
  await sendNoWait(page, 'ზამთარი მალე მოვა?');
  await expect(page.locator('#intertitle')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#intertitle p')).toHaveText('ზამთარი.');
  await expect(page.locator('#chat-log .msg.char.streaming')).toHaveCount(0); // სტრიმინგის შუაში არა
  await page.screenshot({ path: `${SHOTS}/05-intertitle-winter.png` });
  await waitIntertitle(page);
  t = await treeState(page);
  expect(t.season).toBe('winter');
  expect(t.date).toBe('10 დეკემბერი');
  expect(t.meta).toBe('ბზარი 2/5 · ეგზემპლარი 2/3');
  await expect(page.locator('#season-tree')).toHaveAttribute('data-season', 'winter');
  await expect(page.locator('body')).toHaveAttribute('data-season', 'winter');
  await expect(page.locator('#crack-val')).toHaveText('2/5');
  await expect(page.locator('#copies-val')).toHaveText('2/3');
  await expect(page.locator('#copies-tip')).toHaveText('ერთი თინას უჯრაშია სამი თვე');
  await expect(page.locator('#crack')).toHaveCount(0); // SVG ბზარი აღარ არსებობს
  const g = await storage(page, 'tianshani.game');
  expect(g).toMatchObject({ day: 100, cycle: 1, lastCharacterId: 'vaso', exchanges: 5 });
  expect(g.visited).toEqual(['tina', 'vaso']);
  expect(g).not.toHaveProperty('paintingFallen');

  // სერვერს ახალი თარიღი მიდის
  const req = page.waitForRequest((r) => r.url().endsWith('/api/chat'));
  await send(page, 'ცივა?');
  expect((await req).postDataJSON().gameState).toMatchObject({ day: 100, season: 'winter', crackStage: 1, lostCopies: 1, cycle: 1 });
  expect(await storage(page, 'tianshani.game')).toMatchObject({ day: 120, exchanges: 6 });
});

test('გაზაფხული → ზაფხული ერთი გაცვლით (4/5): ჩარჩოები აღარ იხრება და არაფერს ფარავს', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('tianshani.game', JSON.stringify({ cycle: 1, day: 260, exchanges: 0, lastCharacterId: 'tina', visited: [] }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  await openWall(page);
  expect((await treeState(page)).season).toBe('spring');
  await openFrame(page, 'vaso');
  await sendNoWait(page, 'რა ხდება?'); // 260 + 20 = 280 → ზაფხული
  await expect(page.locator('#intertitle p')).toHaveText('ზაფხული.', { timeout: 5000 });
  await waitIntertitle(page);
  await expect(page.locator('#crack-val')).toHaveText('4/5');
  expect((await treeState(page)).season).toBe('summer');
  await expect(page.locator('#frames .frame.tilted')).toHaveCount(0);
  await expect(page.locator('#crack, #crack path')).toHaveCount(0);
  await close(page);
  await settle(page);
  expectNoOverlaps(await frameRects(page), 0);
  await page.screenshot({ path: `${SHOTS}/06-summer-stage-4.png`, fullPage: true });
});

test('ჩამონგრევა დღე 360-ზე (გაცვლით): შენობა №2, შემოდგომა, დღე 0, ისტორია წაშლილია, ახალი განლაგება', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('tianshani.game', JSON.stringify({ cycle: 1, day: 320, exchanges: 16, lastCharacterId: null, visited: [] }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  await openWall(page);
  const before = (await frameRects(page)).frames.map((f) => [f.id, Math.round(f.x), Math.round(f.y)]);
  await openFrame(page, 'director');
  await send(page, 'მოთხრობა წაიკითხეთ?'); // 340
  expect((await storage(page, 'tianshani.game')).day).toBe(340);
  await sendNoWait(page, 'ეს ბზარი იყო აქ?'); // 360 → ჩამონგრევა
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

  // ახალ ციკლში სერვერს cycle=2, დღე 0 მიდის (გახსნა დროს აღარ ამატებს)
  const req = page.waitForRequest((r) => r.url().endsWith('/api/chat'));
  await openFrame(page, 'tina');
  await page.locator('#chat-input').fill('ახალ შენობაში ვართ?');
  await page.locator('#chat-input').press('Enter');
  expect((await req).postDataJSON().gameState).toEqual({ day: 0, season: 'autumn', crackStage: 0, lostCopies: 0, cycle: 2, paintingFallen: false });
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
  expect(t.date).toBe('28 თებერვალი');
  await expect(page.locator('#painting')).toBeVisible(); // სურათის მდგომარეობა აღარ ინახება
});

test('ფონი ეტაპების მიხედვით: ["wall.jpg","wall-b.jpg",null,null,null] → პირველი სეზონის ცვლილების შემდეგ b-ზე გადადის (cross-fade)', async ({ page }) => {
  // სერვერის კონფიგის გავლა API ტესტშია; აქ კლიენტის ქცევა — ტესტური მასივი და ტესტური სურათი
  await page.route('**/api/characters', async (route) => {
    const res = await route.fetch();
    const j = await res.json();
    j.wall_backgrounds = ['assets/wall.jpg', 'assets/wall-b.test.jpg', null, null, null];
    await route.fulfill({ response: res, json: j });
  });
  await page.route('**/assets/wall-b.test.jpg', (route) => route.fulfill({ path: 'public/assets/wall.jpg', contentType: 'image/jpeg' }));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('tianshani.game', JSON.stringify({ cycle: 1, day: 80, exchanges: 4, lastCharacterId: null, visited: [] }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  await openWall(page);
  const bg = () => page.evaluate(() => {
    const active = document.querySelector('.wall-photo.active');
    return { data: document.getElementById('wall').dataset.background, src: active?.dataset.src, image: active ? getComputedStyle(active).backgroundImage : null, layers: document.querySelectorAll('.wall-photo.active').length };
  });
  let b = await bg();
  expect(b.data).toBe('assets/wall.jpg');
  expect(b.image).toContain('assets/wall.jpg');
  expect(b.layers).toBe(1);
  // ფონი კედლის ფოტოა — ჩარჩოების ქვეშ, ხილული
  expect(await page.locator('.wall-photo.active').evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.9);
  await openFrame(page, 'tina');
  await sendNoWait(page, 'გამარჯობა'); // 80 → 100 → ზამთარი (ბზარი 2/5 = stage 1)
  await expect(page.locator('#intertitle p')).toHaveText('ზამთარი.', { timeout: 5000 });
  await waitIntertitle(page);
  await expect.poll(async () => (await bg()).data).toBe('assets/wall-b.test.jpg');
  b = await bg();
  expect(b.src).toBe('assets/wall-b.test.jpg');
  expect(b.image).toContain('wall-b.test.jpg');
  // cross-fade: opacity transition ~1.5 წმ
  const tr = await page.locator('.wall-photo.active').evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(tr).toContain('1.5s');
  // გადატვირთვაზეც სწორი საფეხური (instant)
  await page.reload();
  await page.waitForFunction(() => window.tianshani?.ready === true);
  expect((await bg()).data).toBe('assets/wall-b.test.jpg');
});
