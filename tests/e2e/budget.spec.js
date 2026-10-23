// FIXES_ROUND2 §1–§3, §9: ტოკენების მთვლელი, ბრაუზერის ლიმიტის ფანჯარა, გლობალური თვიური ბიუჯეტი (ორ ბრაუზერში), ადმინის ბარათი.
// ლიმიტები ნამდვილი სერვერის გზით მოწმდება: ტესტი e2e ბაზაში წერს გამოყენებას/ხარჯს, სერვერი თავად აბრუნებს 429-ს და /api/state-ს.
import { test, expect, request as pwRequest } from '@playwright/test';
import { openWall, openFrame, send, sendNoWait, sseDone, tokensShown, e2eStore, monthKey, adminApi, SHOTS } from './helpers.js';
import { resetDateDative, GLOBAL_SENTENCE } from '../../public/js/format.js';

const nextMonthISO = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString(); };
const CLIENT_BODY = () => `თვის ბოლომდე დავიცადოთ. ლიმიტი განახლდება ${resetDateDative(nextMonthISO())}.`;
const THIN = ' ';
const clientIdOf = (page) => page.evaluate(async () => (await (await fetch('/api/state', { credentials: 'same-origin' })).json()).client_id);

// ---------- §1 მთვლელი ----------

test('§1 მთვლელი: ჩატვირთვისას ჩანს; პასუხის შემდეგ მცირდება ზუსტად usage.input-ით; tooltip — შემავალი/გამომავალი/პერიოდი', async ({ page }) => {
  await openWall(page);
  const counter = page.locator('#stat-tokens');
  await expect(counter).toBeVisible();
  await expect(counter).toContainText(`ტოკენები: 2${THIN}000${THIN}000 / 2${THIN}000${THIN}000`);
  await expect(page.locator('#tokens-bar')).toHaveAttribute('style', /width: 100%/);
  const before = await tokensShown(page);
  const beforeOut = Number(await page.locator('#tokens-out').getAttribute('data-value'));

  await openFrame(page, 'tina');
  const resP = page.waitForResponse((r) => r.url().endsWith('/api/chat'));
  await send(page, 'დირექტორი აქ არის?');
  const done = await sseDone(await resP);
  expect(done.usage.input).toBeGreaterThan(0);
  await expect.poll(() => tokensShown(page)).toBe(before - done.usage.input);
  expect(Number(await page.locator('#tokens-out').getAttribute('data-value'))).toBe(beforeOut - done.usage.output);
  // რიცხვები თხელი სივრცით
  expect(await page.locator('#tokens-in').textContent()).toMatch(new RegExp(`^\\d{1,3}(${THIN}\\d{3})+$`));
  await page.keyboard.press('Escape');

  await counter.hover();
  const tip = page.locator('#tokens-tip');
  await expect(tip).toHaveCSS('opacity', '1');
  await expect(tip).toContainText('შემავალი:');
  await expect(tip).toContainText('გამომავალი:');
  await expect(tip).toContainText(`ლიმიტი განახლდება ${resetDateDative(nextMonthISO())}`);
  await page.waitForTimeout(250);
  // tooltip ზოლის ქვემოთ ჩამოდის — კადრი ზოლზე ოდნავ მაღალია
  await page.screenshot({ path: `${SHOTS}/R2-01-counter-desktop.png`, clip: { x: 0, y: 0, width: 1366, height: 210 } });
});

test.describe('მობილური', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('§1 მთვლელი 390px-ზე ჩანს და ეკრანში ეტევა', async ({ page }) => {
    await openWall(page);
    const counter = page.locator('#stat-tokens');
    await expect(counter).toBeVisible();
    await expect(page.locator('#tokens-in')).toBeVisible();
    const box = await counter.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThan(10);
    expect(await tokensShown(page)).toBeGreaterThan(0);
    await page.locator('#topbar').screenshot({ path: `${SHOTS}/R2-01-counter-mobile.png` });
  });
});

// ---------- §2 ბრაუზერის ლიმიტი ----------

test('§2 ბრაუზერის ლიმიტი: ნამდვილი 429 → ფანჯარა (სათაური, ტექსტი, შტამპი), ველი დაბლოკილია, ყოველ მცდელობაზე ისევ იხსნება, გადატვირთვას უძლებს', async ({ page }) => {
  const store = e2eStore();
  await openWall(page);
  const cid = await clientIdOf(page);
  try {
    await openFrame(page, 'otari');
    // ლიმიტი ამოიწურა (სხვა ჩანართში დახარჯა) — გვერდმა ჯერ არ იცის; სერვერი 429-ს დააბრუნებს
    store.addUsage(cid, monthKey(), 2_000_000, 0);
    const resP = page.waitForResponse((r) => r.url().endsWith('/api/chat'));
    await page.locator('#chat-input').fill('ოთარ დავიდოვიჩ, წაიკითხეთ?');
    await page.locator('#chat-input').press('Enter');
    const res = await resP;
    expect(res.status()).toBe(429);
    expect(await res.json()).toEqual({ error: 'client_limit', message: 'ბიუჯეტში გარღვევა გვაქვს, თვის ბოლომდე დავიცადოთ.', resets_at: nextMonthISO(), code: 'limit', remaining: { input: 0, output: 2_000_000 } });

    const modal = page.locator('#limit-modal');
    await expect(modal).toBeVisible();
    await expect(page.locator('#limit-title')).toHaveText('ბიუჯეტში გარღვევა გვაქვს');
    await expect(page.locator('#limit-body')).toHaveText(CLIENT_BODY());
    await expect(modal.locator('.limit-stamp')).toHaveText('შეჩერებულია');
    expect(await modal.textContent()).not.toMatch(/[{}]|client_limit|resets_at/); // ნედლი JSON არასდროს
    await expect(modal).toHaveAttribute('data-kind', 'client_limit');
    // ყველაფრის თავზე
    const z = await page.evaluate(() => ({ m: Number(getComputedStyle(document.getElementById('limit-modal')).zIndex), c: Number(getComputedStyle(document.getElementById('chat')).zIndex) }));
    expect(z.m).toBeGreaterThan(z.c);
    // მომხმარებლის შეტყობინება ისტორიაში რჩება; სისტემური ტექსტი ჩატში არ ჩნდება
    await expect(page.locator('#chat-log .msg.user .bubble')).toHaveText('ოთარ დავიდოვიჩ, წაიკითხეთ?');
    await expect(page.locator('#chat-log .msg.system')).toHaveCount(0);
    await expect(page.locator('#chat-input')).toBeDisabled();
    await expect(page.locator('#chat-input')).toHaveAttribute('placeholder', 'ბუღალტერია დაკეტილია');
    await page.screenshot({ path: `${SHOTS}/R2-02-limit-modal-client.png` });

    // დახურვა → კედელი ჩანს; გაგზავნის ცდა → ისევ იხსნება
    await page.locator('#limit-close').click();
    await expect(modal).toBeHidden();
    // aria-disabled ღილაკი მომხმარებლისთვის დაჭერადია (Playwright-ს force სჭირდება, რადგან მას „გამორთულად“ თვლის)
    await expect(page.locator('#chat-send')).toHaveAttribute('aria-disabled', 'true');
    await page.locator('#chat-send').click({ force: true });
    await expect(modal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(page.locator('#chat')).toBeVisible(); // Esc მხოლოდ ფანჯარას ხურავს
    await page.locator('#chat-input').click({ force: true });
    await expect(modal).toBeVisible();
    await page.locator('#limit-close').click();
    await page.locator('#chat-input').focus();
    await page.keyboard.press('Enter');
    await expect(modal).toBeVisible();

    // გადატვირთვა ფანჯარას ვერ გვერდს უვლის (/api/state)
    await page.reload();
    await page.waitForFunction(() => window.tianshani?.ready === true);
    await expect(modal).toBeVisible();
    await expect(page.locator('#limit-body')).toHaveText(CLIENT_BODY());
    await page.locator('#limit-close').click();
    await openFrame(page, 'tina');
    await expect(page.locator('#chat-input')).toBeDisabled();
    await expect(page.locator('#tokens-in')).toHaveText('0');
  } finally {
    store.resetUsage(cid, monthKey());
  }
  // ლიმიტის განულების შემდეგ — ნორმალურად
  await page.reload();
  await page.waitForFunction(() => window.tianshani?.ready === true);
  await expect(page.locator('#limit-modal')).toBeHidden();
  await openFrame(page, 'tina');
  await expect(page.locator('#chat-input')).toBeEnabled();
  await send(page, 'ისევ აქ ვარ');
});

test('§2 done.exhausted: ბოლო პასუხმა ამოწურა → ფანჯარა პასუხის შემდეგ', async ({ page }) => {
  const store = e2eStore();
  await openWall(page);
  const cid = await clientIdOf(page);
  try {
    store.addUsage(cid, monthKey(), 2_000_000 - 10, 0); // ერთი მოთხოვნა კიდევ გავა
    await openFrame(page, 'bela');
    await sendNoWait(page, 'ბელა, როგორ ხარ?');
    await expect(page.locator('#limit-modal')).toBeVisible();
    await expect(page.locator('#limit-body')).toHaveText(CLIENT_BODY());
    await expect(page.locator('#chat-log .msg.char')).toHaveCount(1); // პასუხი მოვიდა
  } finally {
    store.resetUsage(cid, monthKey());
  }
});

// ---------- §3 გლობალური ბიუჯეტი ----------

test('§3 გლობალური ბიუჯეტი: ორ სხვადასხვა ბრაუზერში ფანჯარა ჩატვირთვისთანავე, ველი დაბლოკილია; ადმინის განულების შემდეგ ქრება', async ({ browser, baseURL }) => {
  const store = e2eStore();
  const ctxA = await browser.newContext({ baseURL, viewport: { width: 1366, height: 860 }, locale: 'ka-GE' });
  const ctxB = await browser.newContext({ baseURL, viewport: { width: 1366, height: 860 }, locale: 'ka-GE' });
  const admin = await pwRequest.newContext({ baseURL });
  try {
    store.addGlobal(monthKey(), 0, 0, 1000); // თვის ხარჯი > $50
    const pages = [await ctxA.newPage(), await ctxB.newPage()];
    const ids = [];
    for (const p of pages) {
      await openWall(p);
      await expect(p.locator('#limit-modal')).toBeVisible();
      await expect(p.locator('#limit-modal')).toHaveAttribute('data-kind', 'global_budget');
      await expect(p.locator('#limit-title')).toHaveText('ბიუჯეტში გარღვევა გვაქვს');
      // იგივე ტექსტი, რაც ბრაუზერის ლიმიტზე + ერთი დამატებითი წინადადება
      await expect(p.locator('#limit-body')).toHaveText(`${GLOBAL_SENTENCE} ${CLIENT_BODY()}`);
      await expect(p.locator('#chat-input')).toBeDisabled();
      ids.push(await clientIdOf(p));
    }
    expect(ids[0]).not.toBe(ids[1]);
    await pages[0].screenshot({ path: `${SHOTS}/R2-03-limit-modal-global.png` });
    // ჩატის გახსნაც შეიძლება, მაგრამ გაგზავნა — არა (სერვერიც 429 global_budget)
    await pages[1].locator('#limit-close').click();
    await openFrame(pages[1], 'vaso');
    await expect(pages[1].locator('#chat-input')).toBeDisabled();
    const r = await pages[1].evaluate(async () => {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ characterId: 'vaso', messages: [{ role: 'user', content: 'x' }] }) });
      return { status: res.status, body: await res.json() };
    });
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('global_budget');

    // ადმინი: „ბიუჯეტის განულება ამ თვისთვის“
    const out = await adminApi(admin, 'POST', '/api/admin/budget/reset');
    expect(out.ok).toBe(true);
    for (const p of pages) {
      await p.reload();
      await p.waitForFunction(() => window.tianshani?.ready === true);
      await expect(p.locator('#limit-modal')).toBeHidden();
    }
    await openFrame(pages[0], 'tina');
    await expect(pages[0].locator('#chat-input')).toBeEnabled();
    await send(pages[0], 'ბიუჯეტი დაბრუნდა?');
  } finally {
    store.resetGlobal(monthKey());
    await ctxA.close();
    await ctxB.close();
    await admin.dispose();
  }
});

test('§3 ადმინის ბიუჯეტის ბარათი: ხარჯი, %, ტოკენები, პროგნოზი; ყვითელი ბანერი 80%-ზე; განულება', async ({ page }) => {
  const store = e2eStore();
  try {
    store.resetGlobal(monthKey());
    store.addGlobal(monthKey(), 1_234_567, 98_765, 41.25); // 82.5%
    await page.goto('/admin');
    await page.locator('#pw').fill('e2e-admin-pass');
    await page.locator('#login-form button').click();
    await expect(page.locator('#app')).toBeVisible();
    const card = page.locator('#budget-card');
    await expect(card).toBeVisible();
    await expect(page.locator('#b-spent')).toHaveText('$41.25 / $50');
    await expect(page.locator('#b-pct')).toHaveText('82.5%');
    await expect(page.locator('#b-tokens')).toContainText('234');
    await expect(page.locator('#b-proj')).toContainText('$');
    await expect(page.locator('#budget-warn')).toBeVisible();
    await expect(page.locator('#budget-warn')).toContainText('82.5%');
    const bg = await page.locator('#budget-warn').evaluate((el) => getComputedStyle(el).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    expect(r).toBeGreaterThan(200); expect(g).toBeGreaterThan(180); expect(b).toBeLessThan(170); // ყვითელი
    // ბარათი გვერდის ზედა ნაწილშია (სტატისტიკამდე)
    const cardTop = (await card.boundingBox()).y;
    const statsTop = (await page.locator('#stats').boundingBox()).y;
    expect(cardTop).toBeLessThan(statsTop);
    // კლიენტების სიაში ხარჯი
    await expect(page.locator('#client-list .cmeta.cost').first()).toContainText('$');
    await page.screenshot({ path: `${SHOTS}/R2-05-admin-budget.png`, fullPage: true });
    await card.screenshot({ path: `${SHOTS}/R2-05-admin-budget-card.png` });

    await page.locator('#budget-reset').click();
    await expect(page.locator('#budget-reset')).toHaveText('განულებულია ✓');
    await expect(page.locator('#b-pct')).toHaveText('0%');
    await expect(page.locator('#budget-warn')).toBeHidden();
  } finally {
    store.resetGlobal(monthKey());
  }
});
