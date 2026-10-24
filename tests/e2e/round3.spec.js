// Round 3 (FIXES_ROUND3.md) — დესკტოპი: §1 ავტორის სახელი.
import { test, expect } from '@playwright/test';
import { openWall, openFrame, send, storage, frameRects, settle, SHOTS } from './helpers.js';

// ---------- §1 სახელი ----------

test('§1 „საშვი“: პირველ ვიზიტზე ბარათი (არა მოდალი) → „ნინო“ → ზოლში → გადატვირთვა → ჩატის სათაურში → mock პასუხი სახელით', async ({ page }) => {
  await openWall(page, '/', { name: null });
  const card = page.locator('#pass-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('გამომცემლობის საშვი');
  await expect(page.locator('#pass-title')).toHaveText('როგორ გქვიათ?');
  await expect(page.locator('#pass-input')).toHaveAttribute('maxlength', '40');
  await expect(page.locator('#pass-enter')).toHaveText('შესვლა');
  await expect(page.locator('#pass-soso')).toHaveText('სოსო ვარ');
  // არა მოდალი: ფონი არ ბნელდება, ფანჯარა არ იბლოკება, ჩარჩოები არ იძვრის
  await expect(page.locator('#chat-backdrop')).toBeHidden();
  await expect(page.locator('#limit-backdrop')).toBeHidden();
  await expect(page.locator('#user-name')).toHaveText('—');
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
