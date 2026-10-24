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

// ---------- §2 ეგზემპლარები ----------

test('§2 პირველი სეზონის ცვლილება → ერთხელ ჩნდება ფურცელი თინას საბაბით, მთვლელი 2/3; ~4 წმ-ში ქრება', async ({ page }) => {
  await openWall(page);
  await talkAndClose(page, 'tina', 'დირექტორი აქ არის?'); // 45 დღე — ჯერ შემოდგომა
  await expect(page.locator('#copy-note')).toBeHidden();
  const shown = page.evaluate(() => new Promise((resolve) => {
    let n = 0;
    const note = document.getElementById('copy-note');
    new MutationObserver(() => { if (!note.hidden && note.classList.contains('show')) n++; }).observe(note, { attributes: true });
    setTimeout(() => resolve(n), 9000);
  }));
  await talkAndClose(page, 'vaso', 'სურათი გაიტანეს?'); // 90 → ზამთარი
  await expect(page.locator('#intertitle p')).toHaveText('ზამთარი.', { timeout: 5000 });
  await waitIntertitle(page);
  const note = page.locator('#copy-note');
  await expect(note).toBeVisible();
  await expect(note).toHaveText('ერთი ეგზემპლარი თინას უჯრაში დარჩა — სამი თვეა იქ დევს.');
  await expect(page.locator('#copies-val')).toHaveText('2/3');
  // ზოლის ქვემოთ, ჩატი დახურულია, არა მოდალი (ფონი არ ბნელდება)
  const nb = await note.boundingBox();
  const tb = await page.locator('#topbar').boundingBox();
  expect(nb.y).toBeGreaterThanOrEqual(tb.y + tb.height - 1);
  await expect(page.locator('#chat-backdrop')).toBeHidden();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/R4-02-copy-note.png`, clip: { x: 0, y: 0, width: 1366, height: 320 } });
  await expect(note).toBeHidden({ timeout: 5500 });
  expect(await shown).toBe(1);
});

test('§2 ფურცელი შეხებით/დაჭერით იხურება', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('tianshani.game', JSON.stringify({ cycle: 1, day: 60, exchanges: 0, lastCharacterId: null, visited: [] }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  await openWall(page);
  await talkAndClose(page, 'tina', 'გამარჯობა'); // 60 + 45 → ზამთარი
  await waitIntertitle(page);
  await expect(page.locator('#copy-note')).toBeVisible();
  await page.locator('#copy-note').click();
  await expect(page.locator('#copy-note')).toBeHidden({ timeout: 1000 });
});

test('§2 seasons_per_lost_copy: 2 → პირველ სეზონზე ეგზემპლარი არ იკარგება, ფურცელი არ ჩნდება (3/3)', async ({ page }) => {
  await page.route('**/api/characters', async (route) => {
    const res = await route.fetch();
    const j = await res.json();
    j.config.game.seasons_per_lost_copy = 2;
    await route.fulfill({ response: res, json: j });
  });
  await openWall(page);
  await talkAndClose(page, 'tina', 'დირექტორი აქ არის?');
  await talkAndClose(page, 'vaso', 'სურათი გაიტანეს?'); // ზამთარი
  await expect(page.locator('#intertitle p')).toHaveText('ზამთარი.', { timeout: 5000 });
  await waitIntertitle(page);
  await page.waitForTimeout(600);
  await expect(page.locator('#copy-note')).toBeHidden();
  await expect(page.locator('#copies-val')).toHaveText('3/3');
});
