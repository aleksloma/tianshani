// FIXES_ROUND7 (დესკტოპი): §1 „→ მივიდე …-სთან“ ღილაკი სახელით ნახსენები პერსონაჟიდან.
import { test, expect } from '@playwright/test';
import { openWall, openFrame, send, frameState, expectSameSpot, settle, waitIntertitle, storage, SHOTS } from './helpers.js';

// ---------- §1 ----------

test('§1 ოთარი: „გრიშა სად არის?“ → პირველივე პასუხზე „→ მივიდე გრიშასთან“; დაჭერა → ოთარი კედელზე, გრიშა ცენტრში, კალენდარი +45', async ({ page }) => {
  await openWall(page);
  const home = await frameState(page, 'otari');
  await openFrame(page, 'otari');
  const day0 = (await storage(page, 'tianshani.game')).day;
  await send(page, 'გრიშა სად არის?');
  const btn = page.locator('#chat-log .msg.char .redirect');
  await expect(btn).toHaveCount(1);
  await expect(btn).toHaveText('→ მივიდე გრიშასთან');
  await expect(btn).toHaveAttribute('data-target', 'grisha');
  await page.waitForTimeout(200);
  await page.locator('#chat').screenshot({ path: `${SHOTS}/R7-01-redirect-button.png` });

  await btn.click();
  await expect(page.locator('.frame.portrait[data-id="grisha"]')).toHaveCount(1, { timeout: 5000 });
  await waitIntertitle(page);
  await expect(page.locator('.frame.portrait')).toHaveCount(1);
  await expect(page.locator('#chat')).toBeVisible();
  await expect(page.locator('#chat-name')).toHaveText('გრიშა');
  // Round 3 §2: გადასვლა = საუბრის დახურვა (გაცვლა იყო) → +days_per_chat_close (e2e: 45)
  expect((await storage(page, 'tianshani.game')).day).toBe(day0 + 45);
  await settle(page);
  expectSameSpot(await frameState(page, 'otari'), home);
});

test('§1 უხილავი: თინა „გივი სად არის?“ → „→ მივიდე გივისთან“ → გივის ჩატი, პასუხობს წარმომადგენელი', async ({ page }) => {
  await openWall(page);
  await openFrame(page, 'tina');
  await send(page, 'გივი სად არის?');
  const btn = page.locator('#chat-log .msg.char .redirect').last();
  await expect(btn).toHaveText('→ მივიდე გივისთან');
  await btn.click();
  await expect(page.locator('.frame.portrait[data-id="givi"]')).toHaveCount(1, { timeout: 5000 });
  await waitIntertitle(page);
  await expect(page.locator('#chat-name s.struck')).toHaveText('გივი');
});
