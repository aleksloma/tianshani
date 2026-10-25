// Round 10 (FIXES_ROUND10.md) — შიდა ჩანაწერი („Context: … Rules check: …“) ვიზიტორს არასდროს ჩანს. დესკტოპი 1280×800 და ტელეფონი 375×812.
// ცალკე mock სერვერები (gemini.mock_leak) ამავე პროცესში; ჩამრთველი მოთხოვნის დროს იკითხება, ამიტომ ტესტი მას შუაშიც ცვლის.
import { test, expect } from '@playwright/test';
import { startTestServer } from '../helpers.mjs';
import { openWall, openFrame, openFromMenu, send, storage } from './helpers.js';

process.env.MOCK_DELAY_MS = '15'; // სტრიმინგი ნამდვილივით (helpers.mjs 0-ს აყენებს)
const MSG_API_ERROR = 'ხაზი დაკავებულია. ცოტა ხანში სცადეთ.';
const Q = 'სამწუხაროდ ეგზემპლარები აღარ დამრჩა, მაგრამ გავითვალისწინებ.';
const LEAK_RE = /Context:|Rules check|REDIRECT GATE|FOR THIS REPLY|Speaker:/;

let S;
test.beforeAll(async () => { S = await startTestServer({ admin: { password: 'e2e-admin-pass' } }); });
test.afterAll(async () => { await S?.close(); });

async function openAny(page, id) {
  if (await page.locator(`#frames .frame[data-id="${id}"]:not([hidden])`).count()) await openFrame(page, id);
  else await openFromMenu(page, id);
}

/** ჩატის ჟურნალში ოდესმე გამოჩნდა თუ არა შიდა ჩანაწერი (სტრიმინგის დროსაც) — MutationObserver. */
async function watchLeaks(page) {
  await page.evaluate((src) => {
    const re = new RegExp(src);
    window.__leakSeen = [];
    const log = document.getElementById('chat-log');
    const check = () => { if (re.test(log.textContent)) window.__leakSeen.push(log.textContent.slice(-200)); };
    new MutationObserver(check).observe(log, { childList: true, subtree: true, characterData: true });
  }, LEAK_RE.source);
}

for (const [label, vp, tag] of [['desktop 1280×800', { width: 1280, height: 800 }, ''], ['phone 375×812', { width: 375, height: 812 }, '-375']]) {
  test.describe(`Round 10 — ${label}`, () => {
    test.use({ viewport: vp, ...(tag ? { isMobile: true, hasTouch: true } : {}) });

    test('mock_leak "first": „Context:“ არასდროს ჩანს — არც სტრიმინგისას, არც ბოლოს, არც ისტორიაში', async ({ page }) => {
      S.cfg.gemini.mock_leak = 'first';
      try {
        await openWall(page, `${S.base}/`);
        await openAny(page, 'marksheideri');
        await watchLeaks(page);
        await send(page, Q);
        expect(await page.evaluate(() => window.__leakSeen)).toEqual([]);
        const bubble = page.locator('#chat-log .msg.char .bubble').last();
        await expect(bubble).not.toHaveText(LEAK_RE);
        expect((await bubble.textContent()).length).toBeGreaterThan(10);
        await expect(page.locator('#chat-log .msg.system')).toHaveCount(0);
        const chats = await storage(page, 'tianshani.chats');
        expect(JSON.stringify(chats)).not.toMatch(LEAK_RE);
        expect(chats.marksheideri.map((m) => m.role)).toEqual(['user', 'assistant']);
        await page.screenshot({ path: `test-results/screens/R10-01-leak-caught${tag}.png` });
      } finally { S.cfg.gemini.mock_leak = null; }
    });

    test('mock_leak "always": არსებული შეცდომის რიგი, შეტყობინება რჩება, დრო არ მიდის; მერე ჩვეულებრივი შეტყობინება მუშაობს', async ({ page }) => {
      S.cfg.gemini.mock_leak = 'always';
      try {
        await openWall(page, `${S.base}/`);
        const day0 = (await storage(page, 'tianshani.game'))?.day ?? 0;
        await openAny(page, 'marksheideri');
        await watchLeaks(page);
        await page.locator('#chat-input').fill(Q);
        await page.locator('#chat-input').press('Enter');
        await expect(page.locator('#chat-log .msg.system')).toHaveText(MSG_API_ERROR, { timeout: 15_000 });
        await expect(page.locator('#chat-send')).toBeEnabled();
        await expect(page.locator('#chat-log .msg.char')).toHaveCount(0);
        await expect(page.locator('#chat-log .msg.user')).toHaveCount(1);
        expect(await page.evaluate(() => window.__leakSeen)).toEqual([]);
        expect((await storage(page, 'tianshani.chats')).marksheideri.map((m) => m.role)).toEqual(['user']);
        // დახურვა — გაცვლა არ შედგა, კალენდარი არ იძვრის
        await page.keyboard.press('Escape');
        await expect(page.locator('#chat')).toBeHidden();
        expect((await storage(page, 'tianshani.game'))?.day ?? 0).toBe(day0);
        // ჩვეულებრივი რეჟიმი — შეტყობინება მუშაობს
        S.cfg.gemini.mock_leak = null;
        await openAny(page, 'marksheideri');
        await send(page, 'კარგით, ბზარზე რას მეტყვით?');
        await expect(page.locator('#chat-log .msg.char')).toHaveCount(1);
        expect(await page.evaluate(() => window.__leakSeen)).toEqual([]);
      } finally { S.cfg.gemini.mock_leak = null; }
    });
  });
}
