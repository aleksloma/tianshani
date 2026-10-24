// Round 5 (FIXES_ROUND5.md) — დესკტოპი: §1 ცარიელი ჩატი + მიგრაცია, §2 „ყველაფრის განულება“, §3 რემარკა ხაზის შუაში, დარჩენილი კითხვები.
import { test, expect } from '@playwright/test';
import {
  openWall, openFrame, openFromMenu, send, storage, treeState, frameRects, expectNoOverlaps, settle, expectEmptyLog, SHOTS,
} from './helpers.js';

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

test('§1 + Round 6 §1: ახალი ჩატი სრულად ცარიელია (არც ბუშტი, არც ტექსტი), სერვერთან მოთხოვნა არ არის, ისტორიაში არაფერი; გასუფთავება → ისევ ცარიელი', async ({ page }) => {
  const calls = [];
  page.on('request', (r) => { if (r.url().endsWith('/api/chat')) calls.push(r); });
  await openWall(page);
  await openFrame(page, 'director');
  await expectEmptyLog(page);
  await page.waitForTimeout(300);
  expect(calls).toHaveLength(0);
  expect(await storage(page, 'tianshani.chats')).toBeNull();
  await page.screenshot({ path: `${SHOTS}/R6-01-empty-chat-desktop.png` });

  // პირველი შეტყობინება → სერვერს მხოლოდ ის მიდის
  const req = page.waitForRequest((r) => r.url().endsWith('/api/chat'));
  await send(page, 'გამარჯობათ!');
  expect((await req).postDataJSON().messages).toEqual([{ role: 'user', content: 'გამარჯობათ!' }]);
  // „ისტორიის გასუფთავება“ → მართლა ცარიელი
  await page.locator('#chat-clear').click();
  await expectEmptyLog(page);
  expect((await storage(page, 'tianshani.chats')).director).toBeUndefined();
  // ხელახლა გახსნა — ისევ ცარიელი (ბუშტი არ „ითესება“)
  await page.keyboard.press('Escape');
  await expect(page.locator('#chat')).toBeHidden();
  await openFrame(page, 'director');
  await expectEmptyLog(page);
});

test('§1 + Round 6 §1: უხილავი (გივი): ცარიელ ჩატში არც ბუშტი, არც ტექსტი', async ({ page }) => {
  await openWall(page);
  await openFromMenu(page, 'givi');
  await expectEmptyLog(page);
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
  await expectEmptyLog(page);
});

// ---------- §2 ყველაფრის განულება ----------

test('§2 „ყველაფრის განულება“: ორი საუბრის შემდეგ → ისტორია ცარიელია, 1 სექტემბერი, შენობა №1, სახელი და client_id რჩება', async ({ page }) => {
  await seedStorage(page, { 'tianshani.game': { cycle: 2, day: 0, exchanges: 0, lastCharacterId: null, visited: [] } });
  await openWall(page);
  await expect(page.locator('#cycle-val')).toHaveText('2');
  const layoutBefore = await page.evaluate(() => window.tianshani.layout.frames.map((f) => [f.id, Math.round(f.x), Math.round(f.y)]));
  await talkAndClose(page, 'tina', 'დირექტორი აქ არის?');
  await talkAndClose(page, 'vaso', 'სურათი გაიტანეს?'); // +90 დღე → ზამთარი
  await expect(page.locator('#copy-note')).toBeHidden({ timeout: 6000 });
  let t = await treeState(page);
  expect(t.season).toBe('winter');
  expect(Object.keys(await storage(page, 'tianshani.chats')).sort()).toEqual(['tina', 'vaso']);
  const cidBefore = await storage(page, 'tianshani.client_id');

  // სახელზე დაჭერა → საშვის ბარათი, ქვემოთ პატარა „ყველაფრის განულება“
  await page.locator('#user-chip').click();
  await expect(page.locator('#pass-card')).toBeVisible();
  const link = page.locator('#reset-all');
  await expect(link).toHaveText('ყველაფრის განულება');
  expect(await link.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBe(13);
  // ბმული შტამპს („№ 1983“) და ღილაკებს არ ედება
  const lb = await link.boundingBox();
  const sb = await page.locator('.pass-stamp').boundingBox();
  expect(lb.x + lb.width <= sb.x || lb.y >= sb.y + sb.height || lb.y + lb.height <= sb.y).toBe(true);
  await page.waitForTimeout(300);
  await page.locator('#pass-card').screenshot({ path: `${SHOTS}/R5-02a-name-card-reset-link.png` });
  await link.click();
  await expect(page.locator('#pass-card')).toBeHidden();
  const note = page.locator('#reset-note');
  await expect(note).toBeVisible();
  await expect(page.locator('#reset-note-text')).toHaveText('წავშალოთ ყველა საუბარი და დავიწყოთ თავიდან?');
  await expect(page.locator('#reset-yes')).toHaveText('დიახ');
  await expect(page.locator('#reset-no')).toHaveText('არა');
  // ფურცელი ზოლის ქვემოთაა და კედელს არ ბნელავს (არა მოდალი)
  await page.waitForTimeout(400);
  const nb = await note.boundingBox();
  const tb = await page.locator('#topbar').boundingBox();
  expect(nb.y).toBeGreaterThanOrEqual(tb.y + tb.height - 1);
  await expect(page.locator('#chat-backdrop')).toBeHidden();
  await page.screenshot({ path: `${SHOTS}/R5-02-reset-confirm.png`, clip: { x: 0, y: 0, width: 1366, height: 340 } });

  // „არა“ → არაფერი იცვლება
  await page.locator('#reset-no').click();
  await expect(note).toBeHidden();
  expect(Object.keys(await storage(page, 'tianshani.chats')).sort()).toEqual(['tina', 'vaso']);
  expect((await treeState(page)).season).toBe('winter');
  // Esc-იც ხურავს
  await page.locator('#user-chip').click();
  await page.locator('#reset-all').click();
  await expect(note).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(note).toBeHidden();

  // „დიახ“ → ყველაფერი თავიდან
  await page.locator('#user-chip').click();
  await page.locator('#reset-all').click();
  await page.locator('#reset-yes').click();
  await expect(note).toBeHidden();
  await settle(page);
  expect(await storage(page, 'tianshani.chats')).toEqual({});
  expect(await storage(page, 'tianshani.game')).toEqual({ cycle: 1, day: 0, exchanges: 0, lastCharacterId: null, visited: [] });
  t = await treeState(page);
  expect(t.date).toBe('1 სექტემბერი');
  expect(t.season).toBe('autumn');
  expect(t.meta).toBe('ბზარი 1/5 · ეგზემპლარი 3/3');
  await expect(page.locator('#cycle-val')).toHaveText('1');
  await expect(page.locator('#copies-val')).toHaveText('3/3');
  await expect(page.locator('#crack-val')).toHaveText('1/5');
  expect(await page.evaluate(() => document.body.dataset.season)).toBe('autumn');
  // სახელი და ბრაუზერის ID რჩება
  expect(await storage(page, 'tianshani.user_name')).toBe('ნინო');
  expect(await page.locator('#user-chip').evaluate((el) => el.innerText.replace(/\s+/g, ' ').trim())).toBe('ავტორი: ნინო ✎');
  expect(await storage(page, 'tianshani.client_id')).toBe(cidBefore);
  // კედელი ხელახლა დაიკიდა (შენობა №1-ის განლაგება), ჩარჩოები ერთმანეთს არ ფარავს, ჩატი დახურულია
  await expect(page.locator('#chat')).toBeHidden();
  const layoutAfter = await page.evaluate(() => window.tianshani.layout.frames.map((f) => [f.id, Math.round(f.x), Math.round(f.y)]));
  expect(layoutAfter).toHaveLength(layoutBefore.length);
  expect(layoutAfter).not.toEqual(layoutBefore);
  expectNoOverlaps(await frameRects(page), 0);
  await page.screenshot({ path: `${SHOTS}/R5-03-header-after-reset.png`, clip: { x: 0, y: 0, width: 1366, height: 200 } });

  // ისტორია მართლა ცარიელია: ჩატში არაფერია
  await openFrame(page, 'tina');
  await expectEmptyLog(page);
  // გადატვირთვის შემდეგაც
  await page.reload();
  await page.waitForFunction(() => window.tianshani?.ready === true);
  expect((await treeState(page)).date).toBe('1 სექტემბერი');
  await expect(page.locator('#cycle-val')).toHaveText('1');
});

test('§2 განულება ღია ჩატისას: ჩატი იხურება დროის წაწევის გარეშე, სტრიმის დასრულება ისტორიაში აღარაფერს წერს', async ({ page }) => {
  await openWall(page);
  await openFrame(page, 'tina');
  await send(page, 'დირექტორი აქ არის?');
  // ნელი პასუხი: სანამ მოდის, ყველაფერი ნულდება
  await page.route('**/api/chat', async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(['გვიანი პასუხი.'], { usage: { input: 5, output: 5 }, remaining: { input: 400000, output: 400000 }, limits: { input: 500000, output: 500000 }, spoken_by: 'tina' }) });
  });
  await page.locator('#chat-input').fill('კიდევ ერთი კითხვა');
  await page.locator('#chat-input').press('Enter');
  await expect(page.locator('#chat-log .msg.char.streaming')).toHaveCount(1);
  await page.evaluate(() => window.tianshani.resetAll());
  await expect(page.locator('#chat')).toBeHidden();
  await page.waitForTimeout(1800); // სტრიმი დასრულდა
  expect(await storage(page, 'tianshani.chats')).toEqual({});
  expect(await storage(page, 'tianshani.game')).toMatchObject({ cycle: 1, day: 0, exchanges: 0 });
  expect((await treeState(page)).date).toBe('1 სექტემბერი');
  await expect(page.locator('#intertitle')).toBeHidden();
});

// ---------- §3 რემარკა ხაზის შუაში ----------

test('§3 რემარკა წინადადების შუაში (*…*) — რემარკის სტილით, იმავე ხაზზე; ხაზის დასაწყისში — ცალკე ხაზზე; ვარსკვლავი არ ჩანს', async ({ page }) => {
  const body = sse(
    ['*(ტელეფონში)* დიახ, გისმენთ…\n', 'ვაჟა ზაზაევიჩი *(ყურმილს ', 'ფარავს)* ერთი წუთით გავიდა.'],
    { usage: { input: 1, output: 1 }, remaining: { input: 9, output: 9 }, suggested_redirect: null, spoken_by: 'tina', spoken_by_name: 'თინა', proofread: 'skipped', cached_tokens: 0, future_field: { x: [1] } },
  );
  await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body }));
  await openWall(page);
  await openFrame(page, 'tina');
  await page.locator('#chat-input').fill('დირექტორი აქ არის?');
  await page.locator('#chat-input').press('Enter');
  await expect(page.locator('#chat-log .msg.char:not(.streaming)')).toHaveCount(1);
  const bubble = page.locator('#chat-log .msg.char .bubble');
  await expect(bubble).not.toContainText('*');
  const stages = bubble.locator('.stage');
  await expect(stages).toHaveText(['ტელეფონში', 'ყურმილს ფარავს']);
  const info = await bubble.evaluate((b) => {
    // ხაზის ფრაგმენტები (getClientRects): გრძელი span შეიძლება ორ ხაზზე გადავიდეს — ვადარებთ მის პირველ/ბოლო ხაზს
    const st = (el) => {
      const s = getComputedStyle(el);
      const r = [...el.getClientRects()];
      return { display: s.display, italic: s.fontStyle, family: s.fontFamily, color: s.color, top: r[0].top, bottom: r.at(-1).bottom, firstBottom: r[0].bottom, lastBottom: r.at(-1).bottom };
    };
    const [lead, inline] = b.querySelectorAll('.stage');
    const speech = [...b.querySelectorAll('.speech')];
    return { lead: st(lead), inline: st(inline), leadBlock: lead.classList.contains('block'), inlineBlock: inline.classList.contains('block'), speech: speech.map(st), speechText: speech.map((s) => s.textContent) };
  });
  // ორივე — რემარკის სტილი (დახრილი, სხვა შრიფტი, ჩამქრალი ფერი)
  for (const s of [info.lead, info.inline]) {
    expect(s.italic).toBe('italic');
    expect(s.family).not.toBe(info.speech[0].family);
    expect(s.color).not.toBe(info.speech[0].color);
  }
  expect(info.leadBlock).toBe(true);
  expect(info.lead.display).toBe('block');
  expect(info.inlineBlock).toBe(false);
  expect(info.inline.display).toBe('inline');
  // შუა რემარკა მეზობელ სიტყვებთან („ვაჟა ზაზაევიჩი“ … „ერთი წუთით გავიდა.“) ერთ ხაზზეა; პირველი ხაზი — ცალკე
  const [first, before, last] = info.speech;
  expect(info.speechText.map((x) => x.trim())).toEqual(['დიახ, გისმენთ…', 'ვაჟა ზაზაევიჩი', 'ერთი წუთით გავიდა.']);
  expect(Math.abs(info.inline.firstBottom - last.firstBottom)).toBeLessThanOrEqual(6);
  expect(Math.abs(info.inline.firstBottom - before.lastBottom)).toBeLessThanOrEqual(6);
  expect(first.lastBottom).toBeLessThanOrEqual(before.top + 2);
  await bubble.screenshot({ path: `${SHOTS}/R5-04-inline-stage.png` });
});

// ---------- §3 დარჩენილი კითხვები ----------

test('§3 „დარჩა … კითხვა“ ყოველი პასუხის შემდეგ ახლდება done-ის usage/საშუალოთი (route: 60 000/5 000 → 10, 54 000/6 000 → 9)', async ({ page }) => {
  const replies = [
    { remaining: { input: 60000, output: 400000 }, avg_input_per_request: 5000 },
    { remaining: { input: 54000, output: 399000 }, avg_input_per_request: 6000 },
  ];
  let n = 0;
  await page.route('**/api/chat', (route) => {
    const r = replies[Math.min(n++, replies.length - 1)];
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(['კი ბატონო.'], { usage: { input: 6000, output: 10 }, limits: { input: 500000, output: 500000 }, period: 'monthly', resets_at: '2026-11-01T00:00:00.000Z', spoken_by: 'tina', ...r }) });
  });
  await openWall(page);
  await openFrame(page, 'tina');
  const tip = page.locator('#tokens-tip');
  await send(page, 'პირველი');
  await expect(page.locator('#stat-tokens')).toHaveAttribute('data-left', '10');
  await expect(tip).toContainText('დარჩა დაახლოებით 10 კითხვა');
  await send(page, 'მეორე');
  await expect(page.locator('#stat-tokens')).toHaveAttribute('data-left', '9');
  await expect(tip).toContainText('დარჩა 9 კითხვა');
  await expect(tip).not.toContainText('დაახლოებით');
});

test('§3 mock სერვერი: 3 პასუხის შემდეგ შეფასება ამ ბრაუზერის ნამდვილი საშუალოთია (/api/state-ის avg_input_per_request)', async ({ page }) => {
  await openWall(page);
  await openFrame(page, 'otari');
  for (const q of ['გამარჯობათ', 'როგორ ბრძანდებით?', 'ხელნაწერი წაიკითხეთ?']) await send(page, q);
  const state = await (await page.request.get('/api/state', { headers: { 'X-Client-Id': await storage(page, 'tianshani.client_id') } })).json();
  expect(state.avg_input_per_request).toBeGreaterThan(0);
  const expected = await page.evaluate(async ({ rem, avg }) => (await import('/js/format.js')).questionsLeft(rem, avg).n, { rem: state.remaining.input, avg: state.avg_input_per_request });
  await expect(page.locator('#stat-tokens')).toHaveAttribute('data-left', String(expected));
});
