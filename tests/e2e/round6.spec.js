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

test('§2 გრიშა: ფირფიტა, ჩატის სათაური და „ესაუბრე სხვას“ რიგი — „სამეურნეო ნაწილის გამგე“; „მნე“ არსად ჩანს', async ({ page }) => {
  await openWall(page);
  const frame = page.locator('#frames .frame[data-id="grisha"]');
  await expect(frame.locator('.plate-name')).toHaveText('გრიშა');
  await expect(frame.locator('.plate-role')).toHaveText(`(${GRISHA_ROLE})`);
  await expect(frame).toHaveAttribute('aria-label', `გრიშა — ${GRISHA_ROLE}. საუბრის დაწყება`);
  // ფირფიტის სტილი უცვლელია (როგორც სხვა თანამდებობებს — ზომა, nowrap/ellipsis — Round 6-ში არ შეცვლილა)
  const st = await frame.locator('.plate-role').evaluate((el) => ({ ws: getComputedStyle(el).whiteSpace, to: getComputedStyle(el).textOverflow, fs: getComputedStyle(el).fontSize }));
  expect(st).toEqual({ ws: 'nowrap', to: 'ellipsis', fs: '10.5px' });
  await frame.screenshot({ path: `${SHOTS}/R6-02-grisha-plate.png` });

  // ჩატის სათაური
  await openFrame(page, 'grisha');
  await expect(page.locator('#chat-name')).toHaveText('გრიშა');
  await expect(page.locator('#chat-role')).toHaveText(GRISHA_ROLE);
  await page.locator('#chat').screenshot({ path: `${SHOTS}/R6-02b-grisha-chat-header.png` });
  await page.keyboard.press('Escape');
  await expect(page.locator('#chat')).toBeHidden();

  // „ესაუბრე სხვას“ ჩატიდან (ყველა, გარდა მიმდინარისა) — გრიშას რიგი
  await openFrame(page, 'director');
  await page.locator('#chat-others').click();
  const row = page.locator('#others-menu .menu-item[data-id="grisha"]');
  await expect(row).toBeVisible();
  await expect(row.locator('.mi-name')).toHaveText('გრიშა');
  await expect(row.locator('.mi-role')).toHaveText(GRISHA_ROLE);
  await row.scrollIntoViewIfNeeded();
  await row.screenshot({ path: `${SHOTS}/R6-03-grisha-dropdown-row.png` });
  // მენიუ ღიაა (ყველა თანამდებობა ეკრანზეა) — „მნე“ არსად
  expect(await page.locator('body').innerText()).not.toMatch(OPAQUE);
});
