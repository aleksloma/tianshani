// ადმინ-გვერდი: პაროლი, ბრაუზერების სია, საუბრები პერსონაჟებად, ლიმიტის განულება.
import { test, expect } from '@playwright/test';
import { openWall, openFrame, openFromMenu, send, SHOTS } from './helpers.js';

test('/admin: არასწორი პაროლი → შეცდომა; სწორი → სტატისტიკა, კლიენტი, საუბრები პერსონაჟებად', async ({ page }) => {
  // ჯერ რამე საუბარი ამ ბრაუზერიდან
  await openWall(page);
  await openFrame(page, 'otari');
  await send(page, 'ოთარ დავიდოვიჩ, მოთხრობა წაიკითხეთ?');
  await page.keyboard.press('Escape');
  await openFromMenu(page, 'kopaleishvili');
  await send(page, 'კოპალეიშვილი სად არის?');
  const cid = await page.evaluate(() => JSON.parse(localStorage.getItem('tianshani.client_id')));

  await page.goto('/admin');
  await expect(page.locator('#login')).toBeVisible();
  await page.locator('#pw').fill('wrong');
  await page.locator('#login-form button').click();
  await expect(page.locator('#login-error')).toContainText('პაროლი არასწორია');

  await page.locator('#pw').fill('e2e-admin-pass');
  await page.locator('#login-form button').click();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#stats .stat-card')).toHaveCount(5);
  await expect(page.locator('#mode-line')).toContainText('MOCK');

  const item = page.locator(`#client-list button[data-id="${cid}"]`);
  await expect(item).toBeVisible();
  await expect(item).toContainText('შეტყობინება: 2');
  await item.click();
  await expect(page.locator('#detail-title')).toHaveText(cid);
  const tabs = page.locator('#char-tabs button');
  await expect(tabs).toHaveCount(2);
  const names = await tabs.allTextContents();
  expect(names.some((n) => n.startsWith('ოთარი'))).toBe(true);
  expect(names.some((n) => n.startsWith('კოპალეიშვილი'))).toBe(true);
  await page.locator('#char-tabs button', { hasText: 'კოპალეიშვილი' }).click();
  await expect(page.locator('#conversation .cmsg')).toHaveCount(2);
  await expect(page.locator('#conversation .cmsg.assistant s.struck')).toHaveText('კოპალეიშვილი');
  await expect(page.locator('#conversation .cmsg.user .text')).toHaveText('კოპალეიშვილი სად არის?');
  // Round 1 §4: მეორე პერსონაჟის გახსნა (45+45 დღე, e2e კონფიგი) → ზამთარი; სერვერი სეზონს დღიდან ითვლის
  await expect(page.locator('#conversation .badge').first()).toContainText('ზამთარი · შენობა №1');
  await page.screenshot({ path: `${SHOTS}/10-admin.png`, fullPage: true });

  // ძებნა
  await page.locator('#search').fill('ოთარ დავიდოვიჩ');
  await expect(page.locator('#client-list button')).toHaveCount(1);

  // ლიმიტის განულება
  await page.locator('#reset-limit').click();
  await expect(page.locator('#reset-limit')).toHaveText('განულებულია ✓');
  const st = await (await page.request.get('/api/state', { headers: { 'X-Client-Id': cid } })).json();
  expect(st.used.input).toBe(0);

  // გასვლა
  await page.locator('#logout').click();
  await expect(page.locator('#login')).toBeVisible();
});
