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
  // Round 2 §7: დახატული SVG ბზარი აღარ არის; ფონი — კედლის ფოტო (stage 0)
  await expect(page.locator('#crack')).toHaveCount(0);
  await expect(page.locator('#wall')).toHaveAttribute('data-background', 'assets/wall.jpg');
  await page.screenshot({ path: `${SHOTS}/01-wall-desktop.png`, fullPage: true });
});

test('შუქრის პორტრეტი (Round 2 §4): ფოტო იტვირთება, შავ-თეთრია, ფირფიტით', async ({ page }) => {
  await openWall(page);
  const frame = page.locator('#frames .frame[data-id="shukri"]');
  await expect(frame).toHaveCount(1);
  const img = frame.locator('img').first();
  await expect(img).toHaveAttribute('src', 'assets/characters/shukri.jpg');
  await expect(frame.locator('.photo')).not.toHaveClass(/silhouette/);
  await expect(frame.locator('.plate-name')).toHaveText('შუქრი');
  await expect.poll(() => img.evaluate((el) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
  // ფაილი თავად შავ-თეთრია: პიქსელებში R≈G≈B (canvas-ით, CSS ფილტრის გარეშე)
  const chroma = await page.evaluate(async () => {
    const im = new Image();
    im.src = 'assets/characters/shukri.jpg';
    await im.decode();
    const c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(im, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0; let max = 0; let n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) {
      const v = Math.max(Math.abs(d[i] - d[i + 1]), Math.abs(d[i + 1] - d[i + 2]), Math.abs(d[i] - d[i + 2]));
      sum += v; max = Math.max(max, v); n++;
    }
    return { avg: sum / n, max, w: im.naturalWidth, h: im.naturalHeight };
  });
  expect(chroma.avg).toBeLessThan(2);
  expect(chroma.max).toBeLessThanOrEqual(8);
  expect([chroma.w, chroma.h]).toEqual([360, 480]);
  await frame.scrollIntoViewIfNeeded();
  await frame.screenshot({ path: `${SHOTS}/R2-04-shukri-frame.png` });
  await page.screenshot({ path: `${SHOTS}/R2-04-wall-with-shukri.png`, fullPage: true });
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

test('„ესაუბრე სხვას“ (Round 2 §6): ერთი ბრტყელი სია ფოტოებით, ქულის კლებით, უხილავები ბოლოს; 🔒 და ჯგუფები აღარ არის', async ({ page }) => {
  await openWall(page);
  const data = await (await page.request.get('/api/characters')).json();
  const byId = Object.fromEntries(data.characters.map((c) => [c.id, c]));
  await page.locator('#others-btn').click();
  const menu = page.locator('#others-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByText('ვინც არასდროს ჩანს')).toHaveCount(0);
  expect(await menu.textContent()).not.toContain('🔒');
  await expect(menu.locator('.menu-section, hr, .menu-divider')).toHaveCount(0);
  const rows = await menu.locator('.menu-item').evaluateAll((els) => els.map((e) => {
    const img = e.querySelector('img');
    return {
      id: e.dataset.id,
      img: img ? img.getAttribute('src') : null,
      lazy: img?.getAttribute('loading'),
      w: img?.getBoundingClientRect().width,
      h: img?.getBoundingClientRect().height,
      italic: getComputedStyle(e).fontStyle,
      nameWeight: Number(getComputedStyle(e.querySelector('.mi-name')).fontWeight),
      role: e.querySelector('.mi-role')?.textContent,
    };
  }));
  const expected = data.characters.filter((c) => !c.on_wall)
    .sort((x, y) => (y.content_score - x.content_score) || (Number(y.reachable) - Number(x.reachable))).map((c) => c.id);
  expect(rows.map((r) => r.id)).toEqual(expected);
  // ქულის კლებით; უხილავები ბოლოს
  for (let i = 1; i < rows.length; i++) expect(byId[rows[i - 1].id].content_score).toBeGreaterThanOrEqual(byId[rows[i].id].content_score);
  const firstInvisible = rows.findIndex((r) => !byId[r.id].reachable);
  expect(firstInvisible).toBeGreaterThan(0);
  expect(rows.slice(firstInvisible).every((r) => !byId[r.id].reachable)).toBe(true);
  expect(rows.filter((r) => !byId[r.id].reachable)).toHaveLength(9);
  for (const r of rows) {
    expect(r.img, r.id).toBeTruthy();
    expect(r.lazy).toBe('lazy');
    expect(Math.round(r.w)).toBe(40);
    expect(Math.round(r.h)).toBe(40);
    expect(r.italic).toBe('normal');
    expect(r.nameWeight).toBeGreaterThanOrEqual(700);
    expect(r.role).toBeTruthy();
    // ვისაც სურათი აქვს — ნამდვილი ფოტო, დანარჩენს სილუეტი
    if (byId[r.id].image) expect(r.img, r.id).toBe(byId[r.id].image);
    else expect(r.img, r.id).toBe('assets/silhouette.svg');
  }
  expect(rows.filter((r) => r.img !== 'assets/silhouette.svg').length).toBeGreaterThanOrEqual(3);
  // ყველა ფოტო ჩაიტვირთა (lazy — ვასქროლავთ ბოლომდე)
  await menu.evaluate((m) => { m.scrollTop = m.scrollHeight; });
  await expect.poll(() => menu.locator('img').evaluateAll((els) => els.filter((e) => !(e.complete && e.naturalWidth > 0)).length)).toBe(0);
  await menu.evaluate((m) => { m.scrollTop = 0; });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOTS}/02-others-menu.png` });
  await menu.screenshot({ path: `${SHOTS}/R2-06-dropdown-thumbnails.png` });
  // ჩატიდან გახსნილი სიაც (ყველა, მიმდინარის გარდა) — შუქრის რიგიც ფოტოთი
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await page.locator('#frames .frame[data-id="tina"]').click();
  await expect(page.locator('#chat.shown')).toHaveCount(1);
  await page.locator('#chat-others').click();
  await expect(menu.locator('.menu-item[data-id="shukri"] img')).toHaveAttribute('src', 'assets/characters/shukri.jpg');
  await expect(menu.locator('.menu-item[data-id="tina"]')).toHaveCount(0);
});

test('ზედა ზოლი: სეზონის ხე (ტექსტის გარეშე), ბზარი, ეგზემპლარები (tooltip), შენობა №1, ბალანსი; დაფა roll call-ით', async ({ page }) => {
  await openWall(page);
  await expect(page.locator('#season-tree')).toHaveAttribute('data-season', 'autumn');
  await expect(page.locator('#season-name')).toHaveCount(0); // სეზონის ტექსტი ზოლში აღარ ჩანს — მხოლოდ ხე
  await expect(page.locator('#crack-val')).toHaveText('1/5');
  await expect(page.locator('#copies-val')).toHaveText('3/3');
  await expect(page.locator('#cycle-val')).toHaveText('1');
  await expect(page.locator('#stat-tokens')).toContainText('ტოკენები:');
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
