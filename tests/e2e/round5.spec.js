// Round 5 (FIXES_ROUND5.md) — დესკტოპი: §1 ცარიელი ჩატი + მიგრაცია, §2 „ყველაფრის განულება“, §3 რემარკა ხაზის შუაში, დარჩენილი კითხვები.
import { test, expect } from '@playwright/test';
import {
  openWall, openFrame, openFromMenu, send, storage, treeState, frameRects, expectNoOverlaps, settle, SHOTS,
} from './helpers.js';

const HINT = 'დაიწყეთ საუბარი. ხელნაწერზეც შეგიძლიათ ჰკითხოთ — ან ნებისმიერ სხვა რამეზე.';
const HINT_ABSENT = 'კარზე დააკაკუნეთ. იქნებ ვინმემ გიპასუხოთ.';

/** localStorage-ის ერთჯერადი თესვა (გადატვირთვაზე აღარ) — key → value. */
const seedStorage = (page, entries) => page.addInitScript((e) => {
  if (sessionStorage.getItem('r5-seeded')) return;
  for (const [k, v] of Object.entries(e)) localStorage.setItem(k, JSON.stringify(v));
  sessionStorage.setItem('r5-seeded', '1');
}, entries);

/** ერთი საუბარი: გახსნა → შეტყობინება → დახურვა (e2e კონფიგი: +45 დღე). */
async function talkAndClose(page, id, text) {
  await openFrame(page, id);
  await send(page, text);
  await page.keyboard.press('Escape');
  await expect(page.locator('#chat')).toBeHidden();
  await expect(page.locator('#intertitle')).toBeHidden({ timeout: 15_000 });
}

/** SSE პასუხი route-ისთვის. */
const sse = (deltas, done) => deltas.map((d) => `data: ${JSON.stringify({ delta: d })}\n\n`).join('') + `data: ${JSON.stringify({ done: true, ...done })}\n\n`;

// ---------- §1 ცარიელი ჩატი ----------

test('§1 ახალი ჩატი ცარიელია: მხოლოდ „დაიწყეთ საუბარი…“, სერვერთან მოთხოვნა არ არის, ისტორიაში არაფერი; გასუფთავება → ისევ ცარიელი', async ({ page }) => {
  const calls = [];
  page.on('request', (r) => { if (r.url().endsWith('/api/chat')) calls.push(r); });
  await openWall(page);
  await openFrame(page, 'director');
  await expect(page.locator('#chat-log .msg')).toHaveCount(1);
  await expect(page.locator('#chat-log .msg.hint')).toHaveText(HINT);
  await expect(page.locator('#chat-log .msg.char')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(calls).toHaveLength(0);
  expect(await storage(page, 'tianshani.chats')).toBeNull();
  await page.screenshot({ path: `${SHOTS}/R5-01-empty-chat-desktop.png` });

  // პირველი შეტყობინება → სერვერს მხოლოდ ის მიდის, მინიშნება ქრება
  const req = page.waitForRequest((r) => r.url().endsWith('/api/chat'));
  await send(page, 'გამარჯობათ!');
  expect((await req).postDataJSON().messages).toEqual([{ role: 'user', content: 'გამარჯობათ!' }]);
  await expect(page.locator('#chat-log .msg.hint')).toHaveCount(0);
  // „ისტორიის გასუფთავება“ → მართლა ცარიელი
  await page.locator('#chat-clear').click();
  await expect(page.locator('#chat-log .msg')).toHaveCount(1);
  await expect(page.locator('#chat-log .msg.hint')).toHaveText(HINT);
  expect((await storage(page, 'tianshani.chats')).director).toBeUndefined();
  // ხელახლა გახსნა — ისევ ცარიელი (ბუშტი არ „ითესება“)
  await page.keyboard.press('Escape');
  await expect(page.locator('#chat')).toBeHidden();
  await openFrame(page, 'director');
  await expect(page.locator('#chat-log .msg.char')).toHaveCount(0);
});

test('§1 უხილავი (გივი): ცარიელ ჩატში მხოლოდ „კარზე დააკაკუნეთ…“, ბუშტი არ არის', async ({ page }) => {
  await openWall(page);
  await openFromMenu(page, 'givi');
  await expect(page.locator('#chat-log .msg')).toHaveCount(1);
  await expect(page.locator('#chat-log .msg.hint')).toHaveText(HINT_ABSENT);
});

test('§1 + Round 3 §2: გახსნა-დახურვა შეტყობინების გარეშე დროს არ წევს (სკრიპტული ხაზი აღარ არის, რომ „გაცვლად“ ჩაითვალოს)', async ({ page }) => {
  await openWall(page);
  for (const id of ['tina', 'vaso', 'otari']) {
    await openFrame(page, id);
    await page.keyboard.press('Escape');
    await expect(page.locator('#chat')).toBeHidden();
  }
  await page.waitForTimeout(400);
  await expect(page.locator('#intertitle')).toBeHidden();
  expect((await treeState(page)).date).toBe('1 სექტემბერი');
  expect(await storage(page, 'tianshani.game')).toMatchObject({ day: 0, exchanges: 0 });
  expect(await storage(page, 'tianshani.chats')).toBeNull();
});

test('§1 მიგრაცია: ძველი `scripted: true` შეტყობინებები ჩატვირთვისას იშლება და სერვერს არ ეგზავნება', async ({ page }) => {
  const OPENER = '*(ყურმილს არ უშვებს)* დიახ, დიახ… აბა, ჩემო კარგო, რა გაქვს?';
  await seedStorage(page, {
    'tianshani.chats': {
      director: [
        { role: 'assistant', content: OPENER, ts: 1, scripted: true },
        { role: 'user', content: 'გამარჯობათ', ts: 2 },
        { role: 'assistant', content: 'ძალიან კარგი!', ts: 3, spoken_by: 'director' },
      ],
      givi: [{ role: 'assistant', content: 'გივი ოთახში არ არის.', ts: 4, scripted: true, spoken_by: 'two_big_men' }],
    },
  });
  await openWall(page);
  const chats = await storage(page, 'tianshani.chats');
  expect(Object.keys(chats)).toEqual(['director']);
  expect(chats.director).toHaveLength(2);
  expect(JSON.stringify(chats)).not.toContain('"scripted"');
  await openFrame(page, 'director');
  await expect(page.locator('#chat-log .msg.user')).toHaveCount(1);
  await expect(page.locator('#chat-log .msg.char')).toHaveCount(1);
  await expect(page.locator('#chat-log')).not.toContainText('ჩემო კარგო, რა გაქვს');
  const req = page.waitForRequest((r) => r.url().endsWith('/api/chat'));
  await send(page, 'ხელნაწერი წაიკითხეთ?');
  const sent = (await req).postDataJSON().messages;
  expect(sent.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  expect(JSON.stringify(sent)).not.toContain('ჩემო კარგო, რა გაქვს');
  await page.keyboard.press('Escape');
  await openFromMenu(page, 'givi');
  await expect(page.locator('#chat-log .msg.char')).toHaveCount(0);
  await expect(page.locator('#chat-log .msg.hint')).toHaveText(HINT_ABSENT);
});
