// კედელი: ჩარჩოები, განლაგება, დაფა, „ესაუბრე სხვას“, ზედა ზოლი, მობილური.
import { test, expect } from '@playwright/test';
import { openWall, frameRects, expectNoOverlaps, settle, SHOTS } from './helpers.js';

test('კედელი: 12 ჩარჩო სახელებით, არეულად, 5–10° გადახრით, არაფერს ფარავს', async ({ page }) => {
  await openWall(page);
  await expect(page.locator('h1.title')).toHaveText('დაბეჭდე ტიანშანი');
  await expect(page.locator('.subtitle')).toHaveText('ცისფერი მთები ანუ დაუჯერებელი ამბავი — გამომცემლობა');
  const frames = page.locator('#frames .frame');
  await expect(frames).toHaveCount(12);
  // ფირფიტები: სახელი + (თანამდებობა)
  await expect(page.locator('#frames .frame[data-id="director"] .plate-name')).toHaveText('ვაჟა ზაზაევიჩი');
  await expect(page.locator('#frames .frame[data-id="director"] .plate-role')).toHaveText('(გამომცემლობის დირექტორი)');

  const R = await frameRects(page);
  expectNoOverlaps(R, 20);
  const angles = R.frames.map((f) => f.angle);
  for (const a of angles) expect(Math.abs(a)).toBeGreaterThanOrEqual(4.99), expect(Math.abs(a)).toBeLessThanOrEqual(10.01);
  expect(angles.some((a) => a < 0) && angles.some((a) => a > 0)).toBe(true);
  // ყველა ჩარჩო გვერდის სიგანეშია
  for (const f of R.frames) expect(f.x >= 0 && f.x + f.w <= R.page.w).toBe(true);
  // 3 ზომა
  const tiers = await page.locator('#frames .frame').evaluateAll((els) => [...new Set(els.map((e) => e.dataset.tier))].sort());
  expect(tiers).toEqual(['0', '1', '2']);
  // ბზარის ფენა (ცალკე SVG)
  await expect(page.locator('#crack path.trunk')).toHaveCount(2);
  await page.screenshot({ path: `${SHOTS}/01-wall-desktop.png`, fullPage: true });
});

test('განლაგება დეტერმინისტულია: გადატვირთვაზე არ ხტება; ზომის ცვლილებაზე ხელახლა ითვლება', async ({ page }) => {
  await openWall(page);
  const a = (await frameRects(page)).frames.map((f) => [f.id, Math.round(f.x), Math.round(f.y)]);
  await page.reload();
  await page.waitForFunction(() => window.tianshani?.ready === true);
  await settle(page);
  const b = (await frameRects(page)).frames.map((f) => [f.id, Math.round(f.x), Math.round(f.y)]);
  expect(b).toEqual(a);
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.waitForTimeout(400);
  await settle(page);
  const R = await frameRects(page);
  expect(R.frames).toHaveLength(12);
  expectNoOverlaps(R, 20);
});

test('„ესაუბრე სხვას“: დანარჩენები კონტენტის კლებით + „ვინც არასდროს ჩანს“', async ({ page }) => {
  await openWall(page);
  const data = await (await page.request.get('/api/characters')).json();
  await page.locator('#others-btn').click();
  const menu = page.locator('#others-menu');
  await expect(menu).toBeVisible();
  const sections = await menu.locator('.menu-section').allTextContents();
  expect(sections).toEqual(['დანარჩენები', 'ვინც არასდროს ჩანს']);
  const ids = await menu.locator('.menu-item').evaluateAll((els) => els.map((e) => e.dataset.id));
  const offWall = data.characters.filter((c) => c.reachable && !c.on_wall).sort((x, y) => y.content_score - x.content_score).map((c) => c.id);
  const invisible = data.characters.filter((c) => !c.reachable).sort((x, y) => y.content_score - x.content_score).map((c) => c.id);
  expect(ids).toEqual([...offWall, ...invisible]);
  expect(invisible).toHaveLength(9);
  await page.screenshot({ path: `${SHOTS}/02-others-menu.png` });
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('ზედა ზოლი: სეზონის ხე (ტექსტის გარეშე), ბზარი, ეგზემპლარები (tooltip), შენობა №1, ბალანსი; დაფა roll call-ით', async ({ page }) => {
  await openWall(page);
  await expect(page.locator('#season-tree')).toHaveAttribute('data-season', 'autumn');
  await expect(page.locator('#season-name')).toHaveCount(0); // სეზონის ტექსტი ზოლში აღარ ჩანს — მხოლოდ ხე
  await expect(page.locator('#crack-val')).toHaveText('1/5');
  await expect(page.locator('#copies-val')).toHaveText('3/3');
  await expect(page.locator('#cycle-val')).toHaveText('1');
  await expect(page.locator('#tokens-val')).toContainText('ტოკ.');
  await expect(page.locator('#mock-banner')).toContainText('settings.json → gemini.api_key');
  await expect(page.locator('#rollcall li')).toHaveCount(6);
  await expect(page.locator('#rollcall li').first()).toHaveText('შოთა მივლინებაშია');
});

test.describe('მობილური', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('მობილური: 12 ჩარჩო, 12px დაშორება, ვერტიკალური სქროლი, ჩატი ეკრანში ეტევა', async ({ page }) => {
    await openWall(page);
    const R = await frameRects(page);
    expect(R.frames).toHaveLength(12);
    expectNoOverlaps(R, 10);
    for (const f of R.frames) expect(f.x >= 0 && f.x + f.w <= 390).toBe(true);
    await page.screenshot({ path: `${SHOTS}/08-wall-mobile.png`, fullPage: true });
    await page.locator('#frames .frame[data-id="soso"]').scrollIntoViewIfNeeded();
    await page.locator('#frames .frame[data-id="soso"]').click();
    await expect(page.locator('#chat')).toBeVisible();
    await page.waitForTimeout(500);
    const box = await page.locator('#chat').boundingBox();
    const portrait = await page.locator('.frame.portrait').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    expect(portrait.y + portrait.height).toBeLessThanOrEqual(box.y + 2); // სურათი ზემოთ, ჩატი ქვემოთ
    await page.screenshot({ path: `${SHOTS}/09-chat-mobile.png` });
  });
});
