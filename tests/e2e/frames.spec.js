// Round 1 §1: ჩარჩოები კედელზე ბრუნდება — დახურვის შემდეგ, სხვაზე გადასვლისას, გადატვირთვაზე, ზომის ცვლილებისას.
import { test, expect } from '@playwright/test';
import {
  openWall, openFrame, openFromMenu, settle, frameState, expectSameSpot, frameRects, expectNoOverlaps, waitIntertitle, SHOTS,
} from './helpers.js';

/** ჩარჩოზე „ცენტრში ყოფნის“ არაფერი დარჩა: კლასი, inline transform/transition/opacity. */
function expectClean(s) {
  expect(s.lifted).toBe(false);
  expect(s.visible).toBe(true);
  expect(s.inlineTransform).toBe('');
  expect(s.inlineTransition).toBe('');
  expect(s.inlineOpacity).toBe('');
}

for (const how of ['✕', 'Esc', 'ჩაბნელებული კედელი']) {
  test(`(a) გახსნა → დახურვა (${how}) → ჩარჩო ზუსტად თავის ადგილას (±2px), იგივე კუთხე, სუფთა`, async ({ page }) => {
    await openWall(page);
    const orig = await frameState(page, 'director');
    await openFrame(page, 'director');
    expect((await frameState(page, 'director')).lifted).toBe(true);
    if (how === '✕') await page.locator('#chat-close').click();
    else if (how === 'Esc') await page.keyboard.press('Escape');
    else await page.mouse.click(15, page.viewportSize().height - 15); // backdrop (პორტრეტისა და პანელის გარეთ)
    await expect(page.locator('#chat')).toBeHidden();
    await expect(page.locator('.frame.portrait')).toHaveCount(0);
    await settle(page);
    const after = await frameState(page, 'director');
    expectSameSpot(after, orig);
    expectClean(after);
    if (how === '✕') await page.screenshot({ path: `${SHOTS}/16-wall-after-open-close.png` });
  });
}

test('(a) დახურვის ანიმაცია (reverse FLIP): იგივე ~420ms და easing, ბოლო კადრი ჩარჩოს ადგილას', async ({ page }) => {
  await openWall(page);
  const home = await frameState(page, 'vaso');
  await openFrame(page, 'vaso');
  const openTransition = await page.locator('.frame.portrait').evaluate((el) => el.style.transition);
  // კადრ-კადრ ჩანაწერი ბრაუზერის შიგნით (Playwright-ის click-ის დაყოვნების გარეშე)
  const frames = await page.evaluate(() => new Promise((resolve) => {
    const out = [];
    const t0 = performance.now();
    document.getElementById('chat-close').click();
    const tick = () => {
      const p = document.querySelector('.frame.portrait');
      const t = performance.now() - t0;
      if (!p) { resolve({ out, removedAt: t }); return; }
      const b = p.getBoundingClientRect();
      out.push({ t, cx: b.left + b.width / 2 + scrollX, cy: b.top + b.height / 2 + scrollY, transition: p.style.transition });
      requestAnimationFrame(tick);
    };
    tick();
  }));
  // იგივე ხანგრძლივობა, როგორც გახსნისას
  expect(openTransition).toContain('420ms');
  expect(frames.out[0].transition).toContain('420ms');
  expect(frames.removedAt).toBeGreaterThan(380);
  expect(frames.removedAt).toBeLessThan(700);
  // მოძრაობს ცენტრიდან ჩარჩოსკენ (მანძილი მცირდება). ზუსტი საბოლოო ადგილი — შემდეგ ტესტში (headless-ში კადრები იშვიათია)
  const hx = home.x + home.w / 2;
  const hy = home.y + home.h / 2;
  const dist = (f) => Math.hypot(f.cx - hx, f.cy - hy);
  expect(frames.out.length).toBeGreaterThan(1);
  expect(dist(frames.out[frames.out.length - 1])).toBeLessThan(dist(frames.out[0]));
});

test('(a) დახურვის ანიმაციის საბოლოო კადრი = ჩარჩოს ზუსტი ადგილი (±2px) და კუთხე', async ({ page }) => {
  await openWall(page);
  const home = await frameState(page, 'marksheideri');
  await openFrame(page, 'marksheideri');
  // დახურვა, მერე მიმდინარე transition-ის ბოლოში გადასვლა (finish) და გაზომვა, სანამ პორტრეტი წაიშლება
  const end = await page.evaluate(() => new Promise((resolve) => {
    document.getElementById('chat-close').click();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const p = document.querySelector('.frame.portrait');
      p.getAnimations().forEach((a) => a.finish());
      const b = p.getBoundingClientRect();
      const m = new DOMMatrix(getComputedStyle(p).transform);
      resolve({ x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height, angle: (Math.atan2(m.b, m.a) * 180) / Math.PI });
    }));
  }));
  for (const k of ['x', 'y', 'w', 'h']) expect(Math.abs(end[k] - home[k]), k).toBeLessThanOrEqual(2);
  expect(Math.abs(end.angle - home.angle)).toBeLessThanOrEqual(0.5);
  await expect(page.locator('.frame.portrait')).toHaveCount(0, { timeout: 2000 });
  await settle(page);
  expectSameSpot(await frameState(page, 'marksheideri'), home);
});

test('(b) A → „ესაუბრე სხვას“ → B: A კედელზეა, B ცენტრში; ცენტრში არასდროს ორი', async ({ page }) => {
  await openWall(page);
  const a0 = await frameState(page, 'director');
  const b0 = await frameState(page, 'vaso');
  await openFrame(page, 'director');
  // გადასვლის დროს ცენტრში ერთზე მეტი პორტრეტი არ უნდა იყოს
  const maxPortraits = page.evaluate(() => new Promise((resolve) => {
    let max = 0;
    const obs = new MutationObserver(() => { max = Math.max(max, document.querySelectorAll('.frame.portrait').length); });
    obs.observe(document.body, { childList: true });
    setTimeout(() => { obs.disconnect(); resolve(max); }, 2500);
  }));
  await openFromMenu(page, 'vaso');
  expect(await maxPortraits).toBeLessThanOrEqual(1);
  await expect(page.locator('.frame.portrait')).toHaveCount(1);
  await expect(page.locator('.frame.portrait')).toHaveAttribute('data-id', 'vaso');
  await expect(page.locator('#chat-name')).toHaveText('ვასო');
  const a1 = await frameState(page, 'director');
  expectSameSpot(a1, a0);
  expectClean(a1);
  expect((await frameState(page, 'vaso')).lifted).toBe(true);
  // B-ს დახურვა → B-იც თავის ადგილას
  await page.keyboard.press('Escape');
  await expect(page.locator('#chat')).toBeHidden();
  await settle(page);
  expectSameSpot(await frameState(page, 'vaso'), b0);
  await expect(page.locator('#frames .frame.lifted')).toHaveCount(0);
});

test('(b) „→ მივიდე …-სთან“: მიმდინარე ბრუნდება, ახალი მოდის ცენტრში', async ({ page }) => {
  await openWall(page);
  const a0 = await frameState(page, 'director');
  await openFrame(page, 'director');
  let found = false;
  for (let i = 0; i < 8 && !found; i++) {
    await page.locator('#chat-input').fill(`მოთხრობა წაიკითხეთ? ${i}`);
    await page.locator('#chat-input').press('Enter');
    await expect(page.locator('#chat-send')).toBeEnabled({ timeout: 15_000 });
    found = (await page.locator('#chat-log .redirect').count()) > 0;
  }
  expect(found).toBe(true);
  const target = await page.locator('#chat-log .redirect').last().getAttribute('data-target');
  await page.locator('#chat-log .redirect').last().click();
  await expect(page.locator(`.frame.portrait[data-id="${target}"]`)).toHaveCount(1, { timeout: 5000 });
  await waitIntertitle(page);
  await expect(page.locator('.frame.portrait')).toHaveCount(1);
  await settle(page);
  const a1 = await frameState(page, 'director');
  expectSameSpot(a1, a0);
  expectClean(a1);
});

test('(c) გახსნა → გადატვირთვა: ყველა ჩარჩო კედელზე, ცენტრში არავინ, ჩატი დახურულია', async ({ page }) => {
  await openWall(page);
  const before = (await frameRects(page)).frames.map((f) => [f.id, Math.round(f.x), Math.round(f.y), Math.round(f.angle * 10)]);
  await openFrame(page, 'tamari');
  await page.reload();
  await page.waitForFunction(() => window.tianshani?.ready === true);
  await settle(page);
  await expect(page.locator('#chat')).toBeHidden();
  await expect(page.locator('.frame.portrait')).toHaveCount(0);
  await expect(page.locator('#frames .frame.lifted')).toHaveCount(0);
  await expect(page.locator('#chat-backdrop')).toBeHidden();
  const after = (await frameRects(page)).frames.map((f) => [f.id, Math.round(f.x), Math.round(f.y), Math.round(f.angle * 10)]);
  expect(after).toEqual(before);
  // localStorage-ში ჩარჩოს/პორტრეტის კვალი არ არის
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.sort()).toEqual(['tianshani.chats', 'tianshani.client_id', 'tianshani.game', 'tianshani.user_name']); // chats — Round 4 §8 პირველი ხაზი // Round 3 §1: სახელი
  const g = await page.evaluate(() => JSON.parse(localStorage.getItem('tianshani.game')));
  expect(Object.keys(g).sort()).toEqual(['cycle', 'day', 'exchanges', 'lastCharacterId', 'visited']);
});

test('ზომის ცვლილება ღია ჩატით: პორტრეტი ცენტრში რჩება, დახურვისას ჩარჩოს ახალ ადგილას ბრუნდება', async ({ page }) => {
  await openWall(page);
  await openFrame(page, 'irodioni');
  await page.setViewportSize({ width: 1100, height: 780 });
  await page.waitForTimeout(400);
  const p = await page.locator('.frame.portrait').boundingBox();
  expect(Math.abs(p.y + p.height / 2 - 780 / 2)).toBeLessThan(60);
  await page.keyboard.press('Escape');
  await expect(page.locator('#chat')).toBeHidden();
  await settle(page);
  const home = await page.evaluate(() => {
    const f = window.tianshani.layout.frames.find((x) => x.id === 'irodioni');
    return { cx: f.x + f.w / 2, cy: f.y + f.h / 2 };
  });
  const s = await frameState(page, 'irodioni');
  expect(Math.abs(s.x + s.w / 2 - home.cx)).toBeLessThanOrEqual(2);
  expect(Math.abs(s.y + s.h / 2 - home.cy)).toBeLessThanOrEqual(2);
  expectClean(s);
  expectNoOverlaps(await frameRects(page), 20);
});
