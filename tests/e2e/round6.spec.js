// Round 6 (FIXES_ROUND6.md) — დესკტოპი: §1 ცარიელი ჩატი (ელემენტი და ტექსტი — არა), §2 გრიშას თანამდებობა ეკრანზე.
import { test, expect } from '@playwright/test';
import { openWall, openFrame, expectEmptyLog, SHOTS } from './helpers.js';

const GRISHA_ROLE = 'სამეურნეო ნაწილის გამგე';
const OPAQUE = /(^|[^ა-ჰ])მნე([^ა-ჰ]|$)/;

test('§1 ახალი ჩატი: შეტყობინებების სიაში 0 ელემენტი, არც ერთი სიმბოლო (ხილულ და უხილავ ჩატში)', async ({ page }) => {
  await openWall(page);
  for (const id of ['tina', 'vaso']) {
    await openFrame(page, id);
    await expectEmptyLog(page);
    // ზონა მართლა ცარიელია — ::before/::after-ით ჩასმული ტექსტიც არ არის
    const pseudo = await page.locator('#chat-log').evaluate((el) => [getComputedStyle(el, '::before').content, getComputedStyle(el, '::after').content]);
    for (const c of pseudo) expect(['none', 'normal', '""']).toContain(c);
    await page.keyboard.press('Escape');
    await expect(page.locator('#chat')).toBeHidden();
  }
});
