// Round 11 §1 (FIXES_ROUND11.md) — ტელეფონზე კლავიატურა ჩატის ველს აღარ ფარავს. ტელეფონი 375×812, პლანშეტი 700×900, დესკტოპი 1280×800.
// (a) Android/Chrome: meta interactive-widget=resizes-content → კლავიატურა viewport-ს ამცირებს (setViewportSize);
// (b) iOS: ყალბი window.visualViewport (resize/scroll); (c) კედლის სქროლი და ჩარჩოები დახურვის შემდეგ უცვლელი; (d) დესკტოპი — არაფერი.
import { test, expect } from '@playwright/test';
import { openWall, openFrame, openFromMenu, send, SHOTS } from './helpers.js';

async function openAny(page, id) {
  if (await page.locator(`#frames .frame[data-id="${id}"]:not([hidden])`).count()) await openFrame(page, id);
  else await openFromMenu(page, id);
}
const box = (page, sel) => page.locator(sel).boundingBox();
const vars = (page) => page.locator('#chat').evaluate((el) => [el.style.getPropertyValue('--vvh'), el.style.getPropertyValue('--vvt')]);
const framePositions = (page) => page.evaluate(() => [...document.querySelectorAll('#frames .frame')].map((f) => `${f.dataset.id}:${f.style.left},${f.style.top},${f.hidden}`));

/** ჩატი ვასოსთან: ერთი გაცვლა, მერე ეგზემპლარის მიმაგრება (ფურცელი ჩანს, ველს ფოკუსი აქვს). */
async function chatWithSlip(page) {
  await openAny(page, 'vaso');
  await send(page, 'გამარჯობა, ბატონო ვასო!');
  await page.locator('#chat-copy').click();
  await expect(page.locator('#chat-attach')).toBeVisible();
  await expect(page.locator('#chat-input')).toBeFocused();
}

/** ველი, ღილაკი, ფურცელი — მთლიანად 0…H-ში; ბოლო შეტყობინება ფურცლის ზემოთ ჩანს. */
async function expectComposerVisible(page, H, top = 0) {
  for (const sel of ['#chat-input', '#chat-send', '#chat-attach', '#chat-form']) {
    const b = await box(page, sel);
    expect(b.y, sel).toBeGreaterThanOrEqual(top - 0.5);
    expect(b.y + b.height, sel).toBeLessThanOrEqual(top + H + 0.5);
  }
  const last = await box(page, '#chat-log .msg:last-child');
  const logB = await box(page, '#chat-log');
  const slip = await box(page, '#chat-attach');
  expect(last.y + last.height).toBeLessThanOrEqual(slip.y + 0.5);
  expect(last.y + last.height).toBeLessThanOrEqual(logB.y + logB.height + 0.5);
  expect(last.y + last.height).toBeGreaterThan(logB.y + 10); // ბოლო შეტყობინების ბოლო ხილულ ზონაშია (სქროლი ქვემოთაა)
}

for (const [label, vp, kb, tag] of [['phone 375×812', { width: 375, height: 812 }, 450, '-375'], ['tablet 700×900', { width: 700, height: 900 }, 500, '-700']]) {
  test.describe(`Round 11 — ${label}`, () => {
    test.use({ viewport: vp, isMobile: true, hasTouch: true });

    test('(a) კლავიატურა (resizes-content): ველი, „გაგზავნა“ და ფურცელი ჩანს, ბოლო შეტყობინება მათ ზემოთაა; კედელი არ იძვრის', async ({ page }) => {
      await openWall(page);
      await chatWithSlip(page);
      expect(await vars(page)).toEqual([`${vp.height}px`, '0px']);
      const frames = await framePositions(page);
      await page.screenshot({ path: `${SHOTS}/R11-01-no-keyboard${tag}.png` });

      await page.setViewportSize({ width: vp.width, height: kb }); // კლავიატურა
      await expect.poll(() => vars(page)).toEqual([`${kb}px`, '0px']);
      const sheet = await box(page, '#chat');
      expect(Math.round(sheet.height)).toBe(kb);
      await expect(page.locator('#chat-input')).toBeFocused();
      await expectComposerVisible(page, kb);
      // პორტრეტი სათაურში რჩება
      const head = await box(page, '#chat .chat-head');
      const p = await box(page, '.frame.portrait');
      expect(p.y).toBeGreaterThanOrEqual(head.y - 4);
      expect(p.y + p.height).toBeLessThanOrEqual(head.y + head.height + 4);
      await page.screenshot({ path: `${SHOTS}/R11-01-keyboard${tag}.png` });
      await page.waitForTimeout(400); // კედლის resize-ის დაყოვნება (150 მს) გავიდა
      expect(await framePositions(page)).toEqual(frames);

      await page.setViewportSize(vp); // კლავიატურა დაიმალა
      await expect.poll(() => vars(page)).toEqual([`${vp.height}px`, '0px']);
      expect(Math.round((await box(page, '#chat')).height)).toBe(vp.height);
      await page.waitForTimeout(400);
      expect(await framePositions(page)).toEqual(frames);
    });

    test('(c) კლავიატურით დახურვა: კედლის სქროლი და ჩარჩოები იგივეა, რაც გახსნამდე', async ({ page }) => {
      await openWall(page);
      const frames = await framePositions(page);
      // ჩარჩო შუა ნაწილში — გვერდი ცოტა ჩამოსქროლილია, გახსნა სქროლს არ ცვლის
      const id = (await page.evaluate(() => [...document.querySelectorAll('#frames .frame:not([hidden])')].map((f) => f.dataset.id)))[3];
      await page.locator(`#frames .frame[data-id="${id}"]`).scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 40));
      await page.waitForTimeout(200);
      const y0 = await page.evaluate(() => window.scrollY);
      expect(y0).toBeGreaterThan(0);
      await page.locator(`#frames .frame[data-id="${id}"]`).click();
      await expect(page.locator('#chat')).toBeVisible();
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => window.scrollY)).toBe(y0); // sheet სქროლს „ყინავს“
      await page.locator('#chat-input').focus();
      await page.setViewportSize({ width: vp.width, height: kb });
      await page.waitForTimeout(300);
      await page.locator('#chat-close').click(); // ✕ — კლავიატურა ჯერ კიდევ ღიაა
      await expect(page.locator('#chat')).toBeHidden();
      await page.setViewportSize(vp); // ველმა ფოკუსი დაკარგა — კლავიატურა დაიმალა
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => window.scrollY)).toBe(y0);
      expect(await framePositions(page)).toEqual(frames);
      expect(await page.evaluate(() => document.documentElement.classList.contains('sheet-lock'))).toBe(false);
      expect(await page.locator('#chat').evaluate((el) => el.style.getPropertyValue('--vvh'))).toBe('');
    });
  });
}

test.describe('Round 11 — iOS (ყალბი visualViewport), 375×812', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('(b) visualViewport resize/scroll: sheet = ხილული ზონა, პორტრეტი მიჰყვება; უკან — მთელი სიმაღლე', async ({ page }) => {
    await page.addInitScript(() => {
      const vv = new EventTarget();
      let h = null;
      let top = 0;
      Object.defineProperty(vv, 'height', { get: () => h ?? window.innerHeight });
      Object.defineProperty(vv, 'offsetTop', { get: () => top });
      vv.fake = (nh, nt = 0) => { h = nh; top = nt; vv.dispatchEvent(new Event('resize')); vv.dispatchEvent(new Event('scroll')); };
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    });
    await openWall(page);
    await chatWithSlip(page);
    const frames = await framePositions(page);
    const y0 = await page.evaluate(() => window.scrollY);

    await page.evaluate(() => window.visualViewport.fake(450, 0));
    await expect.poll(() => vars(page)).toEqual(['450px', '0px']);
    expect(Math.round((await box(page, '#chat')).height)).toBe(450);
    await expectComposerVisible(page, 450);

    // iOS ხილულ ზონას ქვემოთ წევს (offsetTop) — sheet და პორტრეტი მას მიჰყვება
    await page.evaluate(() => window.visualViewport.fake(450, 120));
    await expect.poll(() => vars(page)).toEqual(['450px', '120px']);
    const sheet = await box(page, '#chat');
    expect(Math.round(sheet.y)).toBe(120);
    expect(Math.round(sheet.height)).toBe(450);
    expect((await box(page, '.frame.portrait')).y).toBeGreaterThanOrEqual(120 - 4);
    await expectComposerVisible(page, 450, 120);
    await page.screenshot({ path: `${SHOTS}/R11-02-ios-offset-375.png` });

    await page.evaluate(() => window.visualViewport.fake(812, 0));
    await expect.poll(() => vars(page)).toEqual(['812px', '0px']);
    const full = await box(page, '#chat');
    expect([Math.round(full.y), Math.round(full.height)]).toEqual([0, 812]);
    expect((await box(page, '.frame.portrait')).y).toBeLessThan(40);

    await page.locator('#chat-close').click();
    await expect(page.locator('#chat')).toBeHidden();
    expect(await page.evaluate(() => window.scrollY)).toBe(y0);
    expect(await framePositions(page)).toEqual(frames);
    expect(await vars(page)).toEqual(['', '']);
  });
});

test.describe('Round 11 — desktop 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('(d) დესკტოპზე არც sheet, არც ცვლადები; ჩატი როგორც ადრე', async ({ page }) => {
    await openWall(page);
    await openFrame(page, 'vaso');
    await expect(page.locator('#chat')).not.toHaveClass(/sheet/);
    expect(await vars(page)).toEqual(['', '']);
    expect(await page.evaluate(() => document.documentElement.classList.contains('sheet-lock'))).toBe(false);
    await send(page, 'გამარჯობა');
    expect(await vars(page)).toEqual(['', '']);
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.waitForTimeout(200);
    expect(await vars(page)).toEqual(['', '']);
  });
});
