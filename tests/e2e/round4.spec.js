// Round 4 (FIXES_ROUND4.md) — დესკტოპი.
import { test, expect } from '@playwright/test';
import { openWall, openFrame, send, waitIntertitle, SHOTS } from './helpers.js';

/** ერთი საუბარი: გახსნა → შეტყობინება → დახურვა (e2e კონფიგი: +45 დღე). */
async function talkAndClose(page, id, text) {
  await openFrame(page, id);
  await send(page, text);
  await page.keyboard.press('Escape');
  await expect(page.locator('#chat')).toBeHidden();
}

// ---------- §8 Enter / Shift+Enter (სკრიპტული პირველი ხაზი Round 5 §1-ით ამოღებულია) ----------

test('§8 Enter აგზავნის; Shift+Enter — ახალი ხაზი, გაგზავნის გარეშე', async ({ page }) => {
  await openWall(page);
  await openFrame(page, 'tina');
  const calls = [];
  page.on('request', (r) => { if (r.url().endsWith('/api/chat')) calls.push(r); });
  const input = page.locator('#chat-input');
  await input.fill('პირველი ხაზი');
  await input.press('Shift+Enter');
  await input.type('მეორე ხაზი');
  await expect(input).toHaveValue('პირველი ხაზი\nმეორე ხაზი');
  await page.waitForTimeout(300);
  expect(calls).toHaveLength(0);
  await input.press('Enter');
  await expect(page.locator('#chat-log .msg.user .bubble').last()).toHaveText('პირველი ხაზი\nმეორე ხაზი');
  await expect.poll(() => calls.length).toBe(1);
  await expect(input).toHaveValue('');
});

// ---------- §6 ქვედა კიდე: 390×844 და 768×1024 ----------

for (const [w, h] of [[390, 844], [768, 1024]]) {
  test.describe(`§6 ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    test(`§6 ${w}×${h}: კედლის ქვემოთ ნაცრისფერი ზოლი არ არის`, async ({ page }) => {
      await openWall(page);
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => ({ doc: document.documentElement.scrollHeight, wall: Math.round(document.getElementById('wall').getBoundingClientRect().height), body: getComputedStyle(document.body).backgroundColor }));
      expect(Math.abs(m.doc - m.wall)).toBeLessThanOrEqual(1);
      expect(m.body).toBe('rgb(176, 163, 130)');
      await page.evaluate(() => window.scrollTo(0, 99999));
      await page.waitForTimeout(250);
      expect(await page.evaluate(([vw, vh]) => document.elementFromPoint(vw / 2, vh - 1)?.closest('#wall') !== null, [w, h])).toBe(true);
      await page.screenshot({ path: `${SHOTS}/R4-06-mobile-bottom-${w}.png` });
    });
  });
}

// ---------- §2 ეგზემპლარები: Round 8-მა სეზონური დაკარგვა ამოიღო (tests/e2e/round8.spec.js) ----------

test('§2 → Round 8: სეზონის ცვლილებაზე ხელში მყოფი ეგზემპლარი აღარ იკარგება — ფურცელი არ ჩნდება, 3/3', async ({ page }) => {
  await openWall(page);
  await talkAndClose(page, 'tina', 'დირექტორი აქ არის?');
  await talkAndClose(page, 'vaso', 'სურათი გაიტანეს?'); // 90 → ზამთარი
  await expect(page.locator('#intertitle p')).toHaveText('ზამთარი.', { timeout: 5000 });
  await waitIntertitle(page);
  await page.waitForTimeout(600);
  await expect(page.locator('#copy-note')).toBeHidden();
  await expect(page.locator('#copies-val')).toHaveText('3/3');
});