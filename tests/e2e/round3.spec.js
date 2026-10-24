// Round 3 (FIXES_ROUND3.md) — დესკტოპი: §1 ავტორის სახელი.
import { test, expect } from '@playwright/test';
import { openWall, openFrame, send, storage, frameRects, settle, e2eStore, SHOTS } from './helpers.js';

// ---------- §6 დამატებითი ზომები (სქრინშოტები): 390×844 ტელეფონი, 768×1024 პლანშეტი ----------

for (const [w, h, n] of [[390, 844, 6], [768, 1024, 9]]) {
  test.describe(`§6 ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    test(`§6 ${w}×${h}: ${n} ჩარჩო, გადაფარვის გარეშე, ზოლი ერთ რიგში`, async ({ page }) => {
      await openWall(page);
      await settle(page);
      const R = await frameRects(page);
      expect(R.frames).toHaveLength(n);
      for (let i = 0; i < R.frames.length; i++) {
        for (let j = i + 1; j < R.frames.length; j++) {
          const a = R.frames[i]; const b = R.frames[j];
          expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `${a.id}×${b.id}`).toBe(false);
        }
        expect(R.frames[i].x + R.frames[i].w).toBeLessThanOrEqual(w);
      }
      // სათაური და ინდიკატორები ერთ რიგში (mock ბანერი — ცალკე ხაზი)
      const t = await page.locator('h1.title').boundingBox();
      const s = await page.locator('#stat-tokens').boundingBox();
      expect(Math.abs((t.y + t.height / 2) - (s.y + s.height / 2))).toBeLessThan(20);
      await page.screenshot({ path: `${SHOTS}/R3-06-wall-${w}.png`, fullPage: true });
    });
  });
}

// ---------- §4 კორექტურა: { replace } — ბუშტი ჩუმად იცვლება ----------

test('§4 { replace }: ბუშტი სრულად იკითხება, მერე იგივე ბუშტში ჩუმად ჩანაცვლდება; ისტორიაში შესწორებული ტექსტია', async ({ page }) => {
  const ORIG = ['*(სურათს ახედავს)*\n', 'მე აქ ვჭედავარ ', 'ოცდაშვიდი წელიწადი!'];
  const FIXED = '*(სურათს ახედავს)*\nმე აქ ვზივარ ოცდაშვიდი წელიწადი!';
  const body = ORIG.map((d) => `data: ${JSON.stringify({ delta: d })}\n\n`).join('')
    + `data: ${JSON.stringify({ replace: FIXED })}\n\n`
    + `data: ${JSON.stringify({ done: true, usage: { input: 10, output: 10 }, remaining: { input: 499990, output: 499990 }, limits: { input: 500000, output: 500000 }, suggested_redirect: null, spoken_by: 'vaso', spoken_by_name: 'ვასო', proofread: 'changed' })}\n\n`;
  await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body }));
  await openWall(page);
  await openFrame(page, 'vaso');
  // ბუშტების რაოდენობა და DOM კვანძი უცვლელია (ხელახალი სტრიმი/ახალი ბუშტი არ ჩნდება)
  const watch = page.evaluate(() => new Promise((resolve) => {
    const log = document.getElementById('chat-log');
    const seen = new Set();
    const obs = new MutationObserver(() => { for (const b of log.querySelectorAll('.msg.char:not(.scripted) .bubble')) seen.add(b); });
    obs.observe(log, { subtree: true, childList: true, characterData: true });
    setTimeout(() => { obs.disconnect(); resolve(seen.size); }, 1500);
  }));
  await send(page, 'როგორ ხართ?');
  const bubble = page.locator('#chat-log .msg.char:not(.scripted) .bubble');
  await expect(bubble).toHaveCount(1);
  await expect(bubble).toContainText('ვზივარ');
  await expect(bubble).not.toContainText('ვჭედავარ');
  expect(await bubble.textContent()).not.toContain('*');
  await expect(bubble.locator('.stage')).toHaveText('სურათს ახედავს');
  expect(await watch).toBe(1);
  await expect(page.locator('#chat-log .msg.char.streaming')).toHaveCount(0);
  const chats = await storage(page, 'tianshani.chats');
  expect(chats.vaso.at(-1).content).toBe(FIXED);
});

test('§4 ადმინი: „შესწორებული პასუხები“ — ორიგინალი და შესწორებული გვერდიგვერდ, შეცვლილი სიტყვა მონიშნულია', async ({ page }) => {
  const store = e2eStore();
  store.touchClient('11111111-2222-4333-8444-555555555555', 'e2e', '127.0.0.1');
  store.logMessage({ client_id: '11111111-2222-4333-8444-555555555555', character_id: 'vaso', spoken_by: 'vaso', role: 'assistant', user_name: 'ნინო', content: 'მე აქ ვზივარ ოცდაშვიდი წელიწადი!', proofread_original: 'მე აქ ვჭედავარ ოცდაშვიდი წელიწადი!', proofread_changed: 1 });
  await page.goto('/admin');
  await page.locator('#pw').fill('e2e-admin-pass');
  await page.locator('#login-form button').click();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#proofread-count')).toHaveText(/\(\d+\)/);
  await page.locator('#proofread-toggle').click();
  const panel = page.locator('#proofread-panel');
  await expect(panel).toBeVisible();
  const row = panel.locator('.pr-row').first();
  await expect(row.locator('.pr-col.orig .text')).toHaveText('მე აქ ვჭედავარ ოცდაშვიდი წელიწადი!');
  await expect(row.locator('.pr-col.fixed .text')).toHaveText('მე აქ ვზივარ ოცდაშვიდი წელიწადი!');
  await expect(row.locator('.pr-col.orig mark')).toHaveText('ვჭედავარ');
  await expect(row.locator('.pr-col.fixed mark')).toHaveText('ვზივარ');
  await expect(row).toContainText('ნინო');
  await panel.screenshot({ path: `${SHOTS}/R3-04-admin-proofread.png` });
});

// ---------- §1 სახელი ----------

test('§1 „საშვი“: პირველ ვიზიტზე ბარათი (არა მოდალი) → „ნინო“ → ზოლში → გადატვირთვა → ჩატის სათაურში → mock პასუხი სახელით', async ({ page }) => {
  await openWall(page, '/', { name: null });
  const card = page.locator('#pass-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('გამომცემლობის საშვი');
  await expect(page.locator('#pass-title')).toHaveText('თქვენი სახელი'); // Round 4 §1
  await expect(page.locator('#pass-input')).toHaveAttribute('placeholder', 'სახელი');
  await expect(page.locator('#pass-input')).toHaveAttribute('maxlength', '40');
  await expect(page.locator('#pass-enter')).toHaveText('შესვლა');
  await expect(page.locator('#pass-soso')).toHaveText('სოსო ვარ');
  // არა მოდალი: ფონი არ ბნელდება, ფანჯარა არ იბლოკება, ჩარჩოები არ იძვრის
  await expect(page.locator('#chat-backdrop')).toBeHidden();
  await expect(page.locator('#limit-backdrop')).toBeHidden();
  // Round 4 §1: სახელის გარეშე — „თქვენი სახელი ✎“ („ავტორი:“ არ ჩანს)
  expect((await page.locator('#user-chip').innerText()).replace(/\s+/g, ' ').trim()).toBe('თქვენი სახელი ✎'); // ხილული ტექსტი
  await expect(page.locator('#user-chip .uc-label')).toBeHidden();
  await page.screenshot({ path: `${SHOTS}/R4-01-name-card.png` });
  const before = (await frameRects(page)).frames.map((f) => [f.id, Math.round(f.x), Math.round(f.y)]);
  await page.screenshot({ path: `${SHOTS}/R3-01-name-card.png` });

  // ცარიელი სახელი არ ინახება
  await page.locator('#pass-enter').click();
  await expect(card).toBeVisible();
  expect(await storage(page, 'tianshani.user_name')).toBeNull();

  await page.locator('#pass-input').fill('ნინო');
  await page.locator('#pass-input').press('Enter');
  await expect(card).toBeHidden();
  await expect(page.locator('#user-name')).toHaveText('ნინო');
  await expect(page.locator('#user-chip')).toContainText('ავტორი: ნინო');
  expect(await storage(page, 'tianshani.user_name')).toBe('ნინო');
  await settle(page);
  expect((await frameRects(page)).frames.map((f) => [f.id, Math.round(f.x), Math.round(f.y)])).toEqual(before);

  // გადატვირთვა — სახელი რჩება, ბარათი აღარ ჩანს
  await page.reload();
  await page.waitForFunction(() => window.tianshani?.ready === true);
  await expect(card).toBeHidden();
  await expect(page.locator('#user-name')).toHaveText('ნინო');

  // ჩატი: „საუბრობს: ნინო“; userName ყოველ მოთხოვნაში; mock პასუხი სახელით მიმართავს
  await openFrame(page, 'tina');
  await expect(page.locator('#chat-user')).toHaveText('საუბრობს: ნინო');
  const req = page.waitForRequest((r) => r.url().endsWith('/api/chat'));
  await send(page, 'გამარჯობა, დირექტორი აქ არის?');
  expect((await req).postDataJSON().userName).toBe('ნინო');
  await expect(page.locator('#chat-log .msg.char .bubble').last()).toContainText('ნინო,');
  await page.keyboard.press('Escape');

  // ზოლის სახელზე დაჭერა → ბარათი ისევ, შეცვლა
  await page.locator('#user-chip').click();
  await expect(card).toBeVisible();
  await expect(page.locator('#pass-input')).toHaveValue('ნინო');
  await page.locator('#pass-input').fill('  ქეთევან   მაისურაძე  ');
  await page.locator('#pass-enter').click();
  await expect(page.locator('#user-name')).toHaveText('ქეთევან მაისურაძე');
});

test('§1 „სოსო ვარ“ — სახელი სოსო; ✕ — სახელის გარეშე იხურება (მომავალ ჩატვირთვაზე ისევ კითხულობს)', async ({ page }) => {
  await openWall(page, '/', { name: null });
  await page.locator('#pass-close').click();
  await expect(page.locator('#pass-card')).toBeHidden();
  await page.reload();
  await page.waitForFunction(() => window.tianshani?.ready === true);
  await expect(page.locator('#pass-card')).toBeVisible();
  await page.locator('#pass-soso').click();
  await expect(page.locator('#pass-card')).toBeHidden();
  await expect(page.locator('#user-name')).toHaveText('სოსო');
  expect(await storage(page, 'tianshani.user_name')).toBe('სოსო');
});
