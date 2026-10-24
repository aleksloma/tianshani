// ჩატი: ცენტრში მოსვლა, სტრიმინგი, ისტორია (გადატვირთვა, ცალკე პერსონაჟები), უხილავები, ენა, გადამისამართება, შეცდომები.
import { test, expect } from '@playwright/test';
import { openWall, openFrame, openFromMenu, send, storage, pctShown, SHOTS } from './helpers.js';

test('ჩარჩო → ცენტრში → ჩატი; პასუხი სტრიმით; ისტორია გადატვირთვას უძლებს; Esc აბრუნებს', async ({ page }) => {
  await openWall(page);
  await openFrame(page, 'director');
  await expect(page.locator('#chat-name')).toHaveText('ვაჟა ზაზაევიჩი');
  await expect(page.locator('#frames .frame[data-id="director"]')).toHaveClass(/lifted/);
  // პორტრეტი ცენტრალურ ზონაშია, ჩატი გვერდით (დესკტოპი)
  const vp = page.viewportSize();
  const p = await page.locator('.frame.portrait').boundingBox();
  const c = await page.locator('#chat').boundingBox();
  expect(Math.abs(p.y + p.height / 2 - vp.height / 2)).toBeLessThan(60);
  expect(p.x + p.width).toBeLessThanOrEqual(c.x + 4);
  expect(p.x).toBeGreaterThan(vp.width * 0.1);

  // სტრიმინგი: ტექსტი თანდათან ჩნდება
  await page.locator('#chat-input').fill('გამარჯობათ, ერთი მოთხრობა მაქვს, წაიკითხავთ?');
  await page.locator('#chat-input').press('Enter');
  await expect(page.locator('#chat-log .msg.char.streaming')).toHaveCount(1);
  await expect(page.locator('#chat-log .msg.char:not(.streaming) .bubble')).toHaveCount(1, { timeout: 15_000 });
  const reply = await page.locator('#chat-log .msg.char .bubble').textContent();
  expect(reply.trim().length).toBeGreaterThan(5);
  await expect(page.locator('#chat-log .msg.user .bubble')).toHaveText('გამარჯობათ, ერთი მოთხრობა მაქვს, წაიკითხავთ?');
  await page.screenshot({ path: `${SHOTS}/03-chat-director.png` });

  const chats = await storage(page, 'tianshani.chats');
  expect(chats.director).toHaveLength(2);
  expect(chats.director[1]).toMatchObject({ role: 'assistant', spoken_by: 'director' });

  // Esc → ჩარჩო თავის ადგილას
  await page.keyboard.press('Escape');
  await expect(page.locator('#chat')).toBeHidden();
  await expect(page.locator('.frame.portrait')).toHaveCount(0);
  await expect(page.locator('#frames .frame[data-id="director"]')).not.toHaveClass(/lifted/);

  // გადატვირთვა → ისტორია რჩება
  await page.reload();
  await page.waitForFunction(() => window.tianshani?.ready === true);
  await openFrame(page, 'director');
  await expect(page.locator('#chat-log .msg.user')).toHaveCount(1);
  await expect(page.locator('#chat-log .msg.char')).toHaveCount(1);
  await page.locator('#chat-close').click();
  await expect(page.locator('#chat')).toBeHidden();

  // მეორე პერსონაჟი — ცალკე, ცარიელი ისტორია
  await openFrame(page, 'vaso');
  await expect(page.locator('#chat-log .msg.user')).toHaveCount(0);
  await expect(page.locator('#chat-log .msg.hint')).toBeVisible();
  await send(page, 'როგორ ხართ, ბატონო ვასო?');
  const all = await storage(page, 'tianshani.chats');
  expect(Object.keys(all).sort()).toEqual(['director', 'vaso']);
  expect(all.vaso).toHaveLength(2);
  expect(all.director).toHaveLength(2);
});

test('დახარჯული % იზრდება პასუხის შემდეგ', async ({ page }) => {
  await openWall(page);
  const before = await pctShown(page);
  await openFrame(page, 'tina');
  await send(page, 'დირექტორი აქ არის?');
  await expect.poll(() => pctShown(page)).toBeGreaterThan(before);
});

test('Round 2 §8: პასუხი ხაზებად (≥2 ხაზი ბუშტში); რემარკა ცალკე ხაზზე', async ({ page }) => {
  await openWall(page);
  await openFrame(page, 'director');
  await send(page, 'გამარჯობათ, ერთი მოთხრობა მაქვს, წაიკითხავთ?');
  const bubble = page.locator('#chat-log .msg.char .bubble').last();
  const lines = bubble.locator('.speech.line');
  expect(await lines.count()).toBeGreaterThanOrEqual(2);
  // ხაზები მართლა ცალ-ცალკე რიგებშია (ვერტიკალურად დაშორებული), ტექსტში \n/„*“ არ ჩანს
  const tops = await lines.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeGreaterThan(tops[i - 1]);
  expect(await lines.first().evaluate((e) => getComputedStyle(e).display)).toBe('block');
  expect(await bubble.textContent()).not.toContain('*');
  const stageTop = await bubble.locator('.stage').first().evaluate((e) => Math.round(e.getBoundingClientRect().bottom));
  expect(stageTop).toBeLessThanOrEqual(tops[0] + 1);
  await bubble.screenshot({ path: `${SHOTS}/R2-08-bubble-lines.png` });
});

test('ისტორიის გასუფთავება ამ პერსონაჟთან', async ({ page }) => {
  await openWall(page);
  await openFrame(page, 'bela');
  await send(page, 'ბელა, ყავა ხომ არ გაქვს?');
  await expect(page.locator('#chat-log .msg.user')).toHaveCount(1);
  await page.locator('#chat-clear').click();
  await expect(page.locator('#chat-log .msg.user')).toHaveCount(0);
  expect((await storage(page, 'tianshani.chats')).bela).toBeUndefined();
});

test('უხილავი (გივი): სილუეტი ცენტრში, პასუხობს წარმომადგენელი — „~~გივი~~ X“ ყოველ ბუშტზე', async ({ page }) => {
  await openWall(page);
  const data = await (await page.request.get('/api/characters')).json();
  const byId = Object.fromEntries(data.characters.map((c) => [c.id, c]));
  const proxyNames = byId.givi.proxies.map((id) => byId[id].short_name_ka);

  await openFromMenu(page, 'givi');
  await expect(page.locator('#chat-name s.struck')).toHaveText('გივი');
  await expect(page.locator('.frame.portrait .absent-stamp')).toHaveText('ადგილზე არ არის');
  await expect(page.locator('.frame.portrait .photo')).toHaveClass(/silhouette/);
  // წითელი გადახაზვა
  const deco = await page.locator('#chat-name s.struck').evaluate((el) => getComputedStyle(el).textDecorationColor);
  expect(deco).toBe('rgb(192, 57, 43)');

  for (let i = 0; i < 3; i++) await send(page, `გივი, ჩვენ ვართ! (${i})`);
  const whos = page.locator('#chat-log .msg.char .who');
  await expect(whos).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(whos.nth(i).locator('s.struck')).toHaveText('გივი');
    const real = (await whos.nth(i).locator('.real').textContent()).trim();
    expect(proxyNames).toContain(real);
    expect(real).not.toBe('გივი');
  }
  const header = (await page.locator('#chat-name .real').textContent()).trim();
  expect(proxyNames).toContain(header);
  const chats = await storage(page, 'tianshani.chats');
  expect(chats.givi).toHaveLength(6); // ერთი ისტორია გივისთან
  expect(chats.givi.filter((m) => m.role === 'assistant').every((m) => m.spoken_by && m.spoken_by !== 'givi')).toBe(true);
  await page.screenshot({ path: `${SHOTS}/04-chat-givi-proxy.png` });
});

test('არაქართულ შეტყობინებაზე პასუხი იმ ენაზე', async ({ page }) => {
  await openWall(page);
  await openFrame(page, 'tina');
  await send(page, 'Good morning! Is the director in today?');
  const reply = await page.locator('#chat-log .msg.char .bubble').last().textContent();
  expect(reply).toMatch(/[A-Za-z]{4,}/);
});

test('გადამისამართება (Round 2 §8): პირველ გაცვლაზე ღილაკი არ არის; ხელნაწერზე მე-3 შეტყობინების შემდეგ — „→ მივიდე X-სთან“', async ({ page }) => {
  await openWall(page);
  await openFrame(page, 'director');
  await send(page, 'მოთხრობა წაიკითხეთ?');
  await expect(page.locator('#chat-log .redirect')).toHaveCount(0);
  await send(page, 'ხელნაწერი დაგიტოვეთ, ნახეთ?');
  await expect(page.locator('#chat-log .redirect')).toHaveCount(0);
  await send(page, 'მაინც, ჩემი მოთხრობა როდის წაიკითხავთ?');
  await expect(page.locator('#chat-log .redirect')).toHaveCount(1);
  const btn = page.locator('#chat-log .redirect').last();
  const target = await btn.getAttribute('data-target');
  expect(['tina', 'vaso', 'otari']).toContain(target);
  await expect(btn).toContainText('→ მივიდე');
  await btn.click();
  await expect(page.locator('.frame.portrait')).toHaveAttribute('data-id', target, { timeout: 5000 });
  await expect(page.locator('#chat')).toBeVisible();
});

test('უცნობი 429 (rate) — ტექსტური შეტყობინება ჩატში, ფანჯრის გარეშე, JSON არ ჩანს', async ({ page }) => {
  const MSG = 'ძალიან ჩქარა წერთ. თინა ვერ ასწრებს — ერთ წუთში მობრძანდით.';
  await page.route('**/api/chat', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: MSG, code: 'rate' }) }));
  await openWall(page);
  await openFrame(page, 'otari');
  await page.locator('#chat-input').fill('გამარჯობა');
  await page.locator('#chat-input').press('Enter');
  await expect(page.locator('#chat-log .msg.system')).toHaveText(MSG);
  await expect(page.locator('#limit-modal')).toBeHidden();
  expect((await storage(page, 'tianshani.game'))?.exchanges ?? 0).toBe(0);
  await expect(page.locator('#chat-send')).toBeEnabled();
});

test('API შეცდომა სტრიმში → „ხაზი დაკავებულია…“', async ({ page }) => {
  await page.route('**/api/chat', (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: 'data: {"error":"ხაზი დაკავებულია. ცოტა ხანში სცადეთ."}\n\n',
  }));
  await openWall(page);
  await openFrame(page, 'grisha');
  await page.locator('#chat-input').fill('გამარჯობა');
  await page.locator('#chat-input').press('Enter');
  await expect(page.locator('#chat-log .msg.system')).toHaveText('ხაზი დაკავებულია. ცოტა ხანში სცადეთ.');
  await expect(page.locator('#chat-log .msg.char')).toHaveCount(0);
});

test('localStorage მიუწვდომელია → გაფრთხილება, მაგრამ ჩატი მუშაობს მეხსიერებაში', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
  });
  await openWall(page);
  await expect(page.locator('#storage-banner')).toBeVisible();
  await openFrame(page, 'mikho');
  await send(page, 'მიხო, წაიკითხავ?');
  await expect(page.locator('#chat-log .msg.char')).toHaveCount(1);
});

test('კლავიატურა: ჩარჩოზე Enter ხსნის ჩატს', async ({ page }) => {
  await openWall(page);
  await page.locator('#frames .frame[data-id="irodioni"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#chat-name')).toHaveText('იროდიონი');
});
