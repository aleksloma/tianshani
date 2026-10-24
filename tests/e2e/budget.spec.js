// FIXES_ROUND2 §1–§3, §9: ტოკენების მთვლელი, ბრაუზერის ლიმიტის ფანჯარა, გლობალური თვიური ბიუჯეტი (ორ ბრაუზერში), ადმინის ბარათი.
// ლიმიტები ნამდვილი სერვერის გზით მოწმდება: ტესტი e2e ბაზაში წერს გამოყენებას/ხარჯს, სერვერი თავად აბრუნებს 429-ს და /api/state-ს.
import { test, expect, request as pwRequest } from '@playwright/test';
import { openWall, openFrame, send, sendNoWait, sseDone, pctShown, e2eStore, monthKey, adminApi, SHOTS } from './helpers.js';
import { resetDateDative, GLOBAL_SENTENCE, CLIENT_SENTENCE, formatPercentKa } from '../../public/js/format.js';

const nextMonthISO = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString(); };
// Round 4 §3: „კითხვების“ ენით; კუდი ორივე ფანჯარაში ერთნაირია
const TAIL = () => `თვის ბოლომდე დავიცადოთ. განახლდება ${resetDateDative(nextMonthISO())}.`;
const CLIENT_BODY = () => `${CLIENT_SENTENCE} ${TAIL()}`;
const noTokenWord = async (page) => {
  for (const sel of ['#topbar', '#tokens-tip', '#limit-modal']) {
    expect(await page.locator(sel).evaluate((el) => el.textContent + (el.getAttribute('aria-label') || '')), sel).not.toMatch(/ტოკენ/);
  }
  expect(await page.locator('#stat-tokens').getAttribute('aria-label')).not.toMatch(/ტოკენ/);
};
const THIN = ' ';
const clientIdOf = (page) => page.evaluate(async () => (await (await fetch('/api/state', { credentials: 'same-origin' })).json()).client_id);

// ---------- §1 (Round 3 §3: ერთი რიცხვი, ერთი ვიზუალი) ----------

test('Round 3 §3 ინდიკატორი: რგოლი + „0,0 %“; პასუხის შემდეგ იზრდება ზუსტად usage.input / ლიმიტი-ით; აბსოლუტური რიცხვები აღარ ჩანს; tooltip — ერთი ხაზი', async ({ page }) => {
  await openWall(page);
  const counter = page.locator('#stat-tokens');
  await expect(counter).toBeVisible();
  const st = await (await page.request.get('/api/state')).json();
  const limit = st.limits.input;
  await expect(page.locator('#tokens-pct')).toHaveText(formatPercentKa(((limit - st.remaining.input) / limit) * 100));
  await expect(page.locator('#tokens-pct')).toHaveText(/^\d{1,3},\d %$/);
  await expect(counter.locator('svg.tok-ring circle.fill')).toHaveCount(1);
  const before = await pctShown(page);

  await openFrame(page, 'tina');
  const resP = page.waitForResponse((r) => r.url().endsWith('/api/chat'));
  await send(page, 'დირექტორი აქ არის?');
  const done = await sseDone(await resP);
  expect(done.usage.input).toBeGreaterThan(0);
  await expect.poll(() => pctShown(page)).toBeCloseTo(before + (done.usage.input / limit) * 100, 9);
  await page.keyboard.press('Escape');
  // ზედა ზოლში არც „/ 2 000 000“, არც „ტოკენები:“, არც გამომავალი
  const header = await page.locator('#topbar').textContent();
  expect(header).not.toMatch(/\/\s*\d{1,3}(?:[   ]\d{3})+/); // „/ 2 000 000“-ის მსგავსი არაფერი
  expect(header).not.toContain('ტოკენები:');
  expect(header).not.toContain('გამ.:');
  await expect(counter).toHaveAttribute('data-level', 'ok');

  await counter.hover();
  const tip = page.locator('#tokens-tip');
  await expect(tip).toHaveCSS('opacity', '1');
  const p = await pctShown(page);
  // Round 4 §3: ადამიანის ენით — „კითხვების ლიმიტის X % გახარჯულია · დარჩა დაახლოებით N კითხვა · განახლდება …“
  const left = Number(await counter.getAttribute('data-left'));
  await expect(tip).toHaveText(`კითხვების ლიმიტის ${formatPercentKa(p)} გახარჯულია · დარჩა დაახლოებით ${left} კითხვა · განახლდება ${resetDateDative(nextMonthISO())}`);
  await expect(tip).toContainText('კითხვ');
  await expect(tip).toContainText('დარჩა');
  expect(left % 10).toBe(0); // ≥ 10 → ათეულებად
  await noTokenWord(page);
  // ერთი ხაზი (padding-ის გარეშე)
  expect(await tip.evaluate((el) => { const s = getComputedStyle(el); return Math.round((el.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)) / parseFloat(s.lineHeight)); })).toBe(1);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/R3-03-ring-desktop.png`, clip: { x: 640, y: 0, width: 726, height: 150 } });
  await page.screenshot({ path: `${SHOTS}/R4-03-tooltip-questions.png`, clip: { x: 480, y: 0, width: 886, height: 130 } });
});

test('Round 4 §3 დარჩენილი კითხვები მცირდება პასუხის შემდეგ (< 10 — ზუსტი რიცხვი)', async ({ page }) => {
  const store = e2eStore();
  await openWall(page);
  const cid = await clientIdOf(page);
  const lim = (await (await page.request.get('/api/state')).json()).limits;
  try {
    store.addUsage(cid, monthKey(), lim.input - 50_000, 0); // დარჩა 50 000 → 50000 / 6000 ≈ 8 კითხვა
    await page.reload();
    await page.waitForFunction(() => window.tianshani?.ready === true);
    const counter = page.locator('#stat-tokens');
    const before = Number(await counter.getAttribute('data-left'));
    expect(before).toBe(8);
    await expect(page.locator('#tokens-tip')).toContainText('დარჩა 8 კითხვა');
    await openFrame(page, 'tina');
    await send(page, 'დირექტორი აქ არის?');
    await expect.poll(async () => Number(await counter.getAttribute('data-left'))).toBeLessThan(before);
    await expect(page.locator('#tokens-tip')).toContainText(/დარჩა \d კითხვა/);
    await noTokenWord(page);
  } finally {
    store.resetUsage(cid, monthKey());
  }
});

test('Round 3 §3 ფერი: ნეიტრალური < 70% ≤ ქარვისფერი ≤ 90% < წითელი', async ({ page }) => {
  const store = e2eStore();
  await openWall(page);
  const cid = await clientIdOf(page);
  const limit = (await (await page.request.get('/api/state')).json()).limits.input;
  try {
    for (const [pct, level] of [[75, 'warn'], [95, 'hot']]) {
      store.resetUsage(cid, monthKey());
      store.addUsage(cid, monthKey(), Math.round((limit * pct) / 100), 0);
      await page.reload();
      await page.waitForFunction(() => window.tianshani?.ready === true);
      await expect(page.locator('#tokens-pct')).toHaveText(`${pct},0 %`);
      await expect(page.locator('#stat-tokens')).toHaveAttribute('data-level', level);
    }
  } finally {
    store.resetUsage(cid, monthKey());
  }
});

test.describe('მობილური', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  test('Round 3 §3 ინდიკატორი 375px-ზე ჩანს და ეკრანში ეტევა', async ({ page }) => {
    await openWall(page);
    const counter = page.locator('#stat-tokens');
    await expect(counter).toBeVisible();
    await expect(page.locator('#tokens-pct')).toBeVisible();
    const box = await counter.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    await expect(page.locator('#tokens-pct')).toHaveText(/^\d{1,3},\d %$/);
    await page.locator('#topbar').screenshot({ path: `${SHOTS}/R3-03-ring-mobile.png` });
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
    const lim = (await (await page.request.get('/api/state')).json()).limits; // Round 3 §8: ლიმიტი კონფიგიდან
    store.addUsage(cid, monthKey(), lim.input, 0);
    const resP = page.waitForResponse((r) => r.url().endsWith('/api/chat'));
    await page.locator('#chat-input').fill('ოთარ დავიდოვიჩ, წაიკითხეთ?');
    await page.locator('#chat-input').press('Enter');
    const res = await resP;
    expect(res.status()).toBe(429);
    expect(await res.json()).toEqual({ error: 'client_limit', message: 'ბიუჯეტში გარღვევა გვაქვს, თვის ბოლომდე დავიცადოთ.', resets_at: nextMonthISO(), code: 'limit', remaining: { input: 0, output: lim.output } });

    const modal = page.locator('#limit-modal');
    await expect(modal).toBeVisible();
    await expect(page.locator('#limit-title')).toHaveText('ბიუჯეტში გარღვევა გვაქვს');
    await expect(page.locator('#limit-body')).toHaveText(CLIENT_BODY());
    await expect(modal.locator('.limit-stamp')).toHaveText('შეჩერებულია');
    expect(await modal.textContent()).not.toMatch(/[{}]|client_limit|resets_at/); // ნედლი JSON არასდროს
    await noTokenWord(page); // Round 4 §3
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
    await expect(page.locator('#tokens-pct')).toHaveText('100,0 %');
    await expect(page.locator('#stat-tokens')).toHaveAttribute('data-level', 'hot');
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
    const lim = (await (await page.request.get('/api/state')).json()).limits;
    store.addUsage(cid, monthKey(), lim.input - 10, 0); // ერთი მოთხოვნა კიდევ გავა
    await openFrame(page, 'bela');
    await sendNoWait(page, 'ბელა, როგორ ხარ?');
    await expect(page.locator('#limit-modal')).toBeVisible();
    await expect(page.locator('#limit-body')).toHaveText(CLIENT_BODY());
    await expect(page.locator('#chat-log .msg.char:not(.scripted)')).toHaveCount(1); // პასუხი მოვიდა (პირველი ხაზის გარდა)
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
      await expect(p.locator('#limit-body')).toHaveText(`${GLOBAL_SENTENCE} ${TAIL()}`);
      await noTokenWord(p);
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
