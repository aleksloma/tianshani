// Round 9 (FIXES_ROUND9.md) — მოქმედება ველზე მიმაგრებით, ორი ხატულა, სეზონის ინტერტიტრი კედელზე. დესკტოპი 1280×800 და ტელეფონი 375×812.
import { test, expect } from '@playwright/test';
import { openWall, openFrame, openFromMenu, send, waitIntertitle, storage, SHOTS } from './helpers.js';

const GIVE_PATHS = ['M5 3h8l4 4v6', 'M13 3v4h4', 'M5 3v18h7', 'M14 17h7', 'M18 14l3 3-3 3'];
const TAKE_PATHS = ['M5 3h8l4 4v6', 'M13 3v4h4', 'M5 3v18h7', 'M21 17h-7', 'M17 14l-3 3 3 3'];
const STAGE = 'ნინო ვასოს ხელნაწერის ეგზემპლარს აწვდის.';
const SEED = 'კარგი, დამიტოვე, ამაღამვე დავიწყებ.';

const paths = (loc) => loc.locator('svg path').evaluateAll((ps) => ps.map((p) => p.getAttribute('d')));
const copies = (page) => storage(page, 'tianshani.copies');

async function seedStorage(page, entries) {
  await page.addInitScript((e) => {
    if (sessionStorage.getItem('seeded')) return;
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, JSON.stringify(v));
    sessionStorage.setItem('seeded', '1');
  }, entries);
}

/** კედელზეა — ჩარჩოთი; არა — „ესაუბრე სხვას“ სიით. */
async function openAny(page, id) {
  if (await page.locator(`#frames .frame[data-id="${id}"]:not([hidden])`).count()) await openFrame(page, id);
  else await openFromMenu(page, id);
}

/** Enter (ან ღილაკი) → პასუხის დასრულება; done ივენთი. */
async function submitAndWait(page, how = 'enter') {
  const before = await page.locator('#chat-log .msg.char:not(.streaming)').count();
  const resp = page.waitForResponse((r) => r.url().endsWith('/api/chat'));
  if (how === 'enter') await page.locator('#chat-input').press('Enter');
  else await page.locator('#chat-send').click();
  await expect(page.locator('#chat-log .msg.char:not(.streaming)')).toHaveCount(before + 1, { timeout: 15_000 });
  await expect(page.locator('#chat-send')).toBeEnabled();
  const text = await (await resp).text();
  return text.split('\n\n').filter(Boolean).map((c) => JSON.parse(c.replace(/^data:\s*/, ''))).find((e) => e.done);
}

/** მიმაგრება → ✕ → ისევ მიმაგრება → სიტყვა → გაგზავნა; ორივე ზომაზე იგივე. */
async function attachFlow(page, tag) {
  const btn = page.locator('#chat-copy');
  const slip = page.locator('#chat-attach');
  const input = page.locator('#chat-input');
  await expect(btn).toHaveAttribute('data-mode', 'give');
  await expect(btn).toHaveAttribute('aria-label', 'ეგზემპლარის გადაცემა');
  expect(await paths(btn)).toEqual(GIVE_PATHS);
  await expect(slip).toBeHidden();
  await page.screenshot({ path: `${SHOTS}/R9-02-icons-give${tag}.png` });

  // მიმაგრება — არაფერი იგზავნება
  let calls = 0;
  page.on('request', (r) => { if (r.url().endsWith('/api/chat')) calls++; });
  await btn.click();
  await expect(slip).toBeVisible();
  await expect(page.locator('#chat-attach-text')).toHaveText('ეგზემპლარი №1 — გადაცემა');
  expect(await paths(slip)).toEqual(GIVE_PATHS);
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(btn).toHaveClass(/armed/);
  await expect(input).toHaveAttribute('placeholder', 'მიაყოლეთ სიტყვა, თუ გსურთ…');
  const st = await slip.evaluate((el) => { const s = getComputedStyle(el); return [s.borderTopStyle, s.backgroundColor, s.fontSize, s.color, s.fontStyle]; });
  expect(st).toEqual(['dashed', 'rgba(0, 0, 0, 0)', '12.5px', 'rgb(122, 106, 88)', 'italic']);
  const sb = await slip.boundingBox();
  const fb = await page.locator('#chat-form').boundingBox();
  expect(sb.y + sb.height).toBeLessThanOrEqual(fb.y + 1); // ველის თავზე
  expect(calls).toBe(0);
  // ✕ — მოხსნა
  await page.locator('#chat-attach-remove').click();
  await expect(slip).toBeHidden();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expect(btn).not.toHaveClass(/armed/);
  await expect(input).toHaveAttribute('placeholder', 'დაწერეთ…');
  // ისევ მიმაგრება + სიტყვა → ერთი შეტყობინება
  await btn.click();
  await input.fill('მალე წაიკითხავთ?');
  await page.screenshot({ path: `${SHOTS}/R9-01-slip${tag}.png` });
  const done = await submitAndWait(page, 'button');
  expect(calls).toBe(1);
  expect(done.action_result).toEqual({ type: 'hand_over', copyId: 1, outcome: 'accepted', integrity: 'full' });
  const rows = page.locator('#chat-log .msg.user.action');
  await expect(rows).toHaveCount(1);
  await expect(page.locator('#chat-log .msg.user')).toHaveCount(1);
  await expect(rows.locator('.stage')).toHaveText(STAGE);
  await expect(rows.locator('.speech')).toHaveText('მალე წაიკითხავთ?');
  const reply = page.locator('#chat-log .msg.char').last();
  await expect(reply).toContainText(SEED);
  const chats = await storage(page, 'tianshani.chats');
  expect(chats.vaso).toHaveLength(2);
  expect(chats.vaso[0]).toMatchObject({ role: 'user', content: `*${STAGE}*\nმალე წაიკითხავთ?`, action: { type: 'hand_over', copyId: 1 } });
  expect((await copies(page)).copies[0]).toMatchObject({ status: 'held', holder: 'vaso' });
  // მერე: გამორთმევის რეჟიმი, ფურცელი მოხსნილია, placeholder ჩვეულებრივი
  await expect(slip).toBeHidden();
  await expect(input).toHaveAttribute('placeholder', 'დაწერეთ…');
  await expect(btn).toHaveAttribute('data-mode', 'take');
  await expect(btn).toHaveAttribute('aria-label', 'ეგზემპლარის გამორთმევა');
  expect(await paths(btn)).toEqual(TAKE_PATHS);
  await page.evaluate(() => document.activeElement?.blur());
  await page.screenshot({ path: `${SHOTS}/R9-02-icons-take${tag}.png` });
}

test.describe('Round 9 — დესკტოპი 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('§1/§2 მიმაგრება → ✕ → მიმაგრება → სიტყვა → გაგზავნა: ერთი შეტყობინება (რემარკა + სიტყვა), ერთი პასუხი; ხატულები განსხვავდება', async ({ page }) => {
    await openWall(page);
    await openFrame(page, 'vaso');
    await attachFlow(page, '');
    // გამორთმევაც — ფურცლით „ეგზემპლარი №1 — გამორთმევა“, ცარიელი ველი + Enter
    await page.locator('#chat-copy').click();
    await expect(page.locator('#chat-attach-text')).toHaveText('ეგზემპლარი №1 — გამორთმევა');
    expect(await paths(page.locator('#chat-attach'))).toEqual(TAKE_PATHS);
    const done = await submitAndWait(page);
    expect(done.action_result.outcome).toBe('returned');
    await expect(page.locator('#chat-log .msg.user.action').last().locator('.stage')).toHaveText('ნინო ვასოს ეგზემპლარს უკან სთხოვს.');
    await expect(page.locator('#chat-log .msg.user.action').last().locator('.speech')).toHaveCount(0);
  });

  test('§1 ცარიელი ველი + Enter აგზავნის; ძველი „დაჭერა = გაგზავნა“ აღარ არსებობს; Esc ცარიელ ველზე მოხსნის (ჩატი ღიაა)', async ({ page }) => {
    await openWall(page);
    await openFrame(page, 'tina');
    let calls = 0;
    page.on('request', (r) => { if (r.url().endsWith('/api/chat')) calls++; });
    await page.locator('#chat-copy').click();
    await page.waitForTimeout(400);
    expect(calls).toBe(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#chat-attach')).toBeHidden();
    await expect(page.locator('#chat')).toBeVisible();
    await expect(page.locator('#chat-input')).toHaveAttribute('placeholder', 'დაწერეთ…');
    // Esc ველზე ტექსტით — ჩატი იხურება (მხოლოდ ცარიელი ველი ხსნის მიმაგრებას)
    await page.locator('#chat-copy').click();
    await page.locator('#chat-input').press('Enter');
    await expect(page.locator('#chat-log .msg.char:not(.streaming)')).toHaveCount(1, { timeout: 15_000 });
    expect(calls).toBe(1);
    await expect(page.locator('#chat-log .msg.user.action .stage')).toHaveText('ნინო თინას ხელნაწერის ეგზემპლარს აწვდის.');
    // ცარიელი ველი მიმაგრების გარეშე — არაფერი იგზავნება
    await page.locator('#chat-input').press('Enter');
    await page.waitForTimeout(300);
    expect(calls).toBe(1);
  });

  test('§1 ჩატის გადართვა / დახურვა მიმაგრებას ხსნის; გაგზავნისას ღილაკი გათიშულია; ჩავარდნილი მოთხოვნა — შეტყობინება რჩება, მდგომარეობა უცვლელი, ფურცელი მოხსნილი', async ({ page }) => {
    await openWall(page);
    await openFrame(page, 'vaso');
    await page.locator('#chat-copy').click();
    await expect(page.locator('#chat-attach')).toBeVisible();
    await openFromMenu(page, 'kote');
    await expect(page.locator('#chat-attach')).toBeHidden();
    await expect(page.locator('#chat-copy')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#chat-copy').click();
    await page.keyboard.press('Escape'); // ცარიელი ველი → მოხსნა
    await page.keyboard.press('Escape'); // → ჩატი იხურება
    await expect(page.locator('#chat')).toBeHidden();
    await openFromMenu(page, 'kote');
    await expect(page.locator('#chat-attach')).toBeHidden();
    // გაგზავნისას — ღილაკი გათიშულია (პასუხს ვაყოვნებთ)
    let release;
    const gate = new Promise((r) => { release = r; });
    await page.route('**/api/chat', async (route) => { await gate; await route.continue(); });
    await page.locator('#chat-copy').click();
    await page.locator('#chat-input').press('Enter');
    await expect(page.locator('#chat-copy')).toBeDisabled();
    await expect(page.locator('#chat-attach')).toBeHidden();
    release();
    await expect(page.locator('#chat-log .msg.char:not(.streaming)')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('#chat-copy')).toBeEnabled();
    await page.unroute('**/api/chat');
    // ჩავარდნა: სერვერი 500
    await page.route('**/api/chat', (route) => route.fulfill({ status: 500, json: { error: 'ხაზი დაკავებულია. ცოტა ხანში სცადეთ.' } }));
    const before = await copies(page);
    await page.keyboard.press('Escape');
    await openFrame(page, 'vaso');
    await page.locator('#chat-copy').click();
    await page.locator('#chat-input').fill('აი, წაიკითხეთ');
    await page.locator('#chat-input').press('Enter');
    await expect(page.locator('#chat-log .msg.system')).toHaveCount(1);
    await expect(page.locator('#chat-log .msg.user.action .speech')).toHaveText('აი, წაიკითხეთ');
    await expect(page.locator('#chat-attach')).toBeHidden();
    await expect(page.locator('#chat-copy')).toHaveAttribute('data-mode', 'give');
    expect(await copies(page)).toEqual(before);
  });

  test('§3 სეზონის ინტერტიტრი — ჩაბნელების გარეშე, თეთრი „ზამთარი.“ კედელზე; მერე კლასები იხსნება', async ({ page }) => {
    await seedStorage(page, { 'tianshani.game': { cycle: 1, day: 60, exchanges: 0, lastCharacterId: null, visited: [] } });
    await openWall(page);
    await openFrame(page, 'tina');
    await send(page, 'როგორა ხართ?');
    await page.keyboard.press('Escape'); // 60 + 45 → ზამთარი
    const it = page.locator('#intertitle');
    await expect(it).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#intertitle p')).toHaveText('ზამთარი.');
    await expect(it).toHaveClass(/overlay/);
    await expect(it).toHaveClass(/season-winter/);
    await expect(it).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(it).toHaveCSS('pointer-events', 'none');
    await expect(page.locator('#intertitle p')).toHaveCSS('color', 'rgb(246, 243, 234)');
    expect(await page.locator('#intertitle p').evaluate((el) => getComputedStyle(el).textShadow)).not.toBe('none');
    // კედელი ჩანს: ჩარჩოს ცენტრში პირველი ელემენტი ჩარჩოა, არა ინტერტიტრი
    const hit = await page.locator('#frames .frame').first().evaluate((el) => {
      const b = el.getBoundingClientRect();
      return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('.frame') === el;
    });
    expect(hit).toBe(true);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/R9-03-intertitle-winter.png` });
    await waitIntertitle(page);
    expect(await it.getAttribute('class')).not.toMatch(/overlay|season-/);
  });

  test('§3 გაზაფხული / ზაფხული / შემოდგომა — თავისი ფერით; ჩამონგრევა — ისევ შავი (#050505)', async ({ page }) => {
    await openWall(page);
    const colours = { spring: 'rgb(156, 204, 101)', summer: 'rgb(46, 125, 50)', autumn: 'rgb(227, 178, 43)' };
    const words = { spring: 'გაზაფხული.', summer: 'ზაფხული.', autumn: 'შემოდგომა.' };
    for (const [season, rgb] of Object.entries(colours)) {
      await page.evaluate(([t, s]) => { import('/js/game.js').then((m) => m.showIntertitle(t, 1500, { season: s })); }, [words[season], season]);
      await expect(page.locator('#intertitle')).toHaveClass(new RegExp(`season-${season}`));
      await expect(page.locator('#intertitle')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(page.locator('#intertitle p')).toHaveCSS('color', rgb);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/R9-03-intertitle-${season}.png` });
      await waitIntertitle(page);
    }
    // ჩამონგრევა — შავი ფენა, ფერის კლასების გარეშე
    await page.evaluate(() => {
      sessionStorage.removeItem('seeded');
      localStorage.setItem('tianshani.game', JSON.stringify({ cycle: 1, day: 320, exchanges: 0, lastCharacterId: null, visited: [] }));
    });
    await page.reload();
    await page.waitForFunction(() => window.tianshani?.ready === true);
    await openFrame(page, 'tina');
    await send(page, 'როგორა ხართ?');
    await page.locator('#chat-close').click();
    await expect(page.locator('#intertitle p')).toHaveText('შენობა ჩამოინგრა. ახალი შენობა. ყველაფერი თავიდან.', { timeout: 15_000 });
    await expect(page.locator('#intertitle')).toHaveCSS('background-color', 'rgb(5, 5, 5)');
    expect(await page.locator('#intertitle').getAttribute('class')).not.toMatch(/overlay|season-/);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/R9-04-collapse-black.png` });
    await expect(page.locator('#intertitle')).toBeHidden({ timeout: 10_000 });
  });

  test('§4.2 ჩაშლილი ჯაჭვი: თავზე 3/3, სანამ ლერის ჩატი არ გაიხსნება; მერე 2/3', async ({ page }) => {
    await page.route('**/api/characters', async (route) => {
      const res = await route.fetch();
      const j = await res.json();
      j.config.game.manuscript = { ...j.config.game.manuscript, probability_scale: 1000, event_override: 'passed_on', chain_override: 'lose', stray_page_probability: 0 };
      await route.fulfill({ response: res, json: j });
    });
    await openWall(page);
    await openAny(page, 'bela');
    await page.locator('#chat-copy').click();
    await submitAndWait(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#copy-note')).toHaveText('ბელა: ლერიმ წაიღო სახლში!', { timeout: 5000 });
    expect((await copies(page)).copies[0]).toMatchObject({ status: 'lost', claim: { to: 'leri', arrived: false, verified: false } });
    await expect(page.locator('#copies-val')).toHaveText('3/3');
    await expect(page.locator('#season-tip-meta')).toHaveText('ბზარი 1/5 · ეგზემპლარი 3/3');
    await expect(page.locator('#stat-copies')).toHaveAttribute('aria-label', /^ეგზემპლარი 3\/3\./);
    await openAny(page, 'leri');
    await page.keyboard.press('Escape');
    await expect(page.locator('#copies-val')).toHaveText('2/3');
  });
});

test.describe('Round 9 — ტელეფონი 375×812', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('§1/§2 ტელეფონზე: ფურცელი sheet-ში (კიდეებიდან 14px), მიმაგრება → სიტყვა → გაგზავნა; ზამთრის ინტერტიტრი კედელზე', async ({ page }) => {
    await openWall(page);
    await openAny(page, 'vaso');
    await expect(page.locator('#chat')).toHaveClass(/sheet/);
    await page.locator('#chat-copy').tap();
    const sb = await page.locator('#chat-attach').boundingBox();
    expect(Math.round(sb.x)).toBe(14);
    expect(Math.round(375 - sb.x - sb.width)).toBe(14);
    await page.locator('#chat-attach-remove').tap();
    await attachFlow(page, '-375');
    await page.locator('#chat-close').tap();
    await expect(page.locator('#chat')).toBeHidden();
    await page.evaluate(() => { import('/js/game.js').then((m) => m.showIntertitle('ზამთარი.', 1500, { season: 'winter' })); });
    await expect(page.locator('#intertitle')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/R9-03-intertitle-winter-375.png` });
    await waitIntertitle(page);
  });
});
