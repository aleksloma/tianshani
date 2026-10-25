// Round 8 (FIXES_ROUND8.md) — ხელნაწერის ეგზემპლარები: გადაცემა, დაკარგვა, უკან დაბრუნება. დესკტოპი 1280×800 და ტელეფონი 375×812.
// e2e კონფიგი: +45 დღე ყოველ დახურვაზე. ალბათობები კლიენტზეა — /api/characters-ში game.manuscript-ით ვაკონტროლებთ.
import { test, expect } from '@playwright/test';
import { openWall, openFrame, openFromMenu, send, waitIntertitle, storage, SHOTS } from './helpers.js';

/** game.manuscript კლიენტისთვის (probability_scale, event_override, chain_override, stray_page_probability). */
async function manuscriptCfg(page, m) {
  await page.route('**/api/characters', async (route) => {
    const res = await route.fetch();
    const j = await res.json();
    j.config.game.manuscript = { ...j.config.game.manuscript, ...m };
    await route.fulfill({ response: res, json: j });
  });
}

/** localStorage-ის თესვა ერთხელ (გადატვირთვაზე აღარ). */
async function seedStorage(page, entries) {
  await page.addInitScript((e) => {
    if (sessionStorage.getItem('seeded')) return;
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, JSON.stringify(v));
    sessionStorage.setItem('seeded', '1');
  }, entries);
}

/** ეგზემპლარის ღილაკი → (Round 9) მიმაგრება ველზე → Enter (ტექსტის გარეშე) → პასუხის დასრულება. */
async function clickCopy(page) {
  const before = await page.locator('#chat-log .msg.char:not(.streaming)').count();
  const resp = page.waitForResponse((r) => r.url().endsWith('/api/chat'));
  await page.locator('#chat-copy').click();
  await expect(page.locator('#chat-attach')).toBeVisible();
  await page.locator('#chat-input').press('Enter');
  await expect(page.locator('#chat-log .msg.char:not(.streaming)')).toHaveCount(before + 1, { timeout: 15_000 });
  await expect(page.locator('#chat-send')).toBeEnabled();
  const text = await (await resp).text();
  return text.split('\n\n').filter(Boolean).map((c) => JSON.parse(c.replace(/^data:\s*/, ''))).find((e) => e.done);
}

async function closeChat(page) {
  await page.keyboard.press('Escape');
  await expect(page.locator('#chat')).toBeHidden();
}

const ledgerTexts = (page, sel = '#copy-ledger-list li') => page.locator(sel).allTextContents();
const copies = (page) => storage(page, 'tianshani.copies');

/** კედელზეა — ჩარჩოთი; არა — „ესაუბრე სხვას“ სიით. */
async function openAny(page, id) {
  if (await page.locator(`#frames .frame[data-id="${id}"]:not([hidden])`).count()) await openFrame(page, id);
  else await openFromMenu(page, id);
}
const IN_HAND = ['№1 — თქვენთან', '№2 — თქვენთან', '№3 — თქვენთან'];

test.describe('Round 8 — დესკტოპი 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('§3.1 proxy ჩატში ღილაკი არ ჩანს; ხილულთან — გადაცემის რეჟიმი, ტექსტის ველის მარცხნივ, ველის ზომით', async ({ page }) => {
    await openWall(page);
    await openFromMenu(page, 'givi');
    await expect(page.locator('#chat-name s.struck')).toHaveText('გივი');
    await expect(page.locator('#chat-copy')).toBeHidden();
    await closeChat(page);
    await openFrame(page, 'vaso');
    const btn = page.locator('#chat-copy');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-label', 'ეგზემპლარის გადაცემა');
    await expect(btn).toHaveAttribute('title', 'ეგზემპლარის გადაცემა');
    await expect(btn).toHaveAttribute('data-mode', 'give');
    const b = await btn.boundingBox();
    const t = await page.locator('#chat-input').boundingBox();
    expect(b.x + b.width).toBeLessThanOrEqual(t.x);
    expect(Math.round(b.width)).toBe(44);
    expect(Math.round(b.height)).toBe(44);
    const st = await btn.evaluate((el) => { const s = getComputedStyle(el); return [s.backgroundColor, s.borderTopStyle, s.borderTopWidth, s.borderRadius, s.fontSize]; });
    expect(st).toEqual(['rgb(255, 253, 246)', 'solid', '1px', '2px', '20px']);
    await expect(page.locator('#chat-copy-status')).toBeHidden();
    await page.screenshot({ path: `${SHOTS}/R8-01-chat-copy-button.png` });
  });

  test('§3 ვასოს გადაცემა: რემარკა (.stage, წყვეტილი ჩარჩო) → პასუხი → სტატუსი „0 დღეა“ → გამორთმევის რეჟიმი → 3/3', async ({ page }) => {
    await manuscriptCfg(page, { probability_scale: 0 });
    await openWall(page);
    await openFrame(page, 'vaso');
    const done = await clickCopy(page);
    expect(done.action_result).toEqual({ type: 'hand_over', copyId: 1, outcome: 'accepted', integrity: 'full' });
    const row = page.locator('#chat-log .msg.user.action').last();
    await expect(row.locator('.stage')).toHaveText('ნინო ვასოს ხელნაწერის ეგზემპლარს აწვდის.');
    expect(await row.locator('.bubble').evaluate((el) => [getComputedStyle(el).borderTopStyle, getComputedStyle(el).backgroundColor])).toEqual(['dashed', 'rgba(0, 0, 0, 0)']);
    await expect(page.locator('#chat-log .msg.char').last()).toContainText('კარგი, დამიტოვე, ამაღამვე დავიწყებ.');
    await expect(page.locator('#chat-copy-status')).toHaveText('ეგზემპლარი №1 ვასოსთანაა 0 დღეა');
    await expect(page.locator('#chat-copy')).toHaveAttribute('data-mode', 'take');
    await expect(page.locator('#chat-copy')).toHaveAttribute('aria-label', 'ეგზემპლარის გამორთმევა');
    await expect(page.locator('#chat-copy .ico svg')).toHaveCount(1); // Round 9 §2: რეჟიმი — ხატულა და data-mode (ხაზგასმა აღარ არის)
    await expect(page.locator('#copies-val')).toHaveText('3/3');
    expect((await copies(page)).copies[0]).toMatchObject({ status: 'held', holder: 'vaso', givenDay: 0, integrity: 'full' });
    // ისტორიაში action-ით ინახება და გადატვირთვის მერეც რემარკად ჩანს
    const chats = await storage(page, 'tianshani.chats');
    expect(chats.vaso[0]).toMatchObject({ role: 'user', content: '*ნინო ვასოს ხელნაწერის ეგზემპლარს აწვდის.*', action: { type: 'hand_over', copyId: 1 } });
    await page.screenshot({ path: `${SHOTS}/R8-02-chat-retrieve-status.png` });
    // ლოგში ორივე რიგს action აქვს
    await closeChat(page);
    await page.reload();
    await page.waitForFunction(() => window.tianshani?.ready === true);
    await openFrame(page, 'vaso');
    await expect(page.locator('#chat-log .msg.user.action .stage')).toHaveText('ნინო ვასოს ხელნაწერის ეგზემპლარს აწვდის.');
    await expect(page.locator('#chat-copy-status')).toHaveText('ეგზემპლარი №1 ვასოსთანაა 45 დღეა');
  });

  test('§4/§8 დახურვა → ფურცელი „ვასო: …“ ჩნდება და ქრება; სია (#stat-copies) სწორ ხაზს აჩვენებს; Esc ხურავს; უკან დაბრუნება', async ({ page }) => {
    await manuscriptCfg(page, { probability_scale: 1000, event_override: 'fragment', stray_page_probability: 0 });
    await openWall(page);
    await openFrame(page, 'vaso');
    await clickCopy(page);
    await closeChat(page); // +45 დღე → ნაბიჯი: fragment → kote
    const note = page.locator('#copy-note');
    await expect(note).toBeVisible({ timeout: 5000 });
    await expect(note).toHaveText('ვასო: პირველი მეოთხედი კოტეს გავატანე.');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/R8-04-copy-note.png`, clip: { x: 0, y: 0, width: 1280, height: 320 } });
    await expect(note).toBeHidden({ timeout: 5500 });
    await expect(page.locator('#copies-val')).toHaveText('3/3');
    // სია
    await page.locator('#stat-copies').click();
    const ledger = page.locator('#copy-ledger');
    await expect(ledger).toBeVisible();
    await expect(ledger.locator('.ledger-title')).toHaveText('„ტიანშანი“ — 3 ეგზემპლარი');
    expect(await ledgerTexts(page)).toEqual(['№1 — ვასოსთან 1 სექტემბრიდან (ნახევარი)', '№2 — თქვენთან', '№3 — თქვენთან']);
    await expect(page.locator('#copies-tip')).toHaveText('№1 — ვასოსთან 1 სექტემბრიდან (ნახევარი) · №2 — თქვენთან · №3 — თქვენთან');
    await page.waitForTimeout(400); // ჩამოსრიალება (0.3 წმ)
    const lb = await ledger.boundingBox();
    const tb = await page.locator('#topbar').boundingBox();
    const sc = await page.locator('#stat-copies').boundingBox();
    expect(lb.y).toBeGreaterThanOrEqual(tb.y + tb.height); // ზოლის ქვემოთ (−1.5° დახრის ჩათვლით)
    expect(lb.x).toBeGreaterThanOrEqual(0);
    expect(lb.x + lb.width).toBeLessThanOrEqual(1280);
    expect(lb.x).toBeLessThanOrEqual(sc.x + sc.width); // #stat-copies-ის ქვეშ
    expect(lb.x + lb.width).toBeGreaterThanOrEqual(sc.x);
    await page.screenshot({ path: `${SHOTS}/R8-03-ledger.png`, clip: { x: 0, y: 0, width: 1280, height: 360 } });
    await page.keyboard.press('Escape');
    await expect(ledger).toBeHidden();
    // კლავიატურით: Enter ხსნის, გარეთ დაჭერა ხურავს
    await page.locator('#stat-copies').focus();
    await page.keyboard.press('Enter');
    await expect(ledger).toBeVisible();
    await page.locator('#topbar .title').click(); // გარეთ (ჩარჩოზე არა — ის ჩატს გახსნიდა)
    await expect(ledger).toBeHidden();
    await expect(page.locator('#chat')).toBeHidden();
    // ისევ ვასოსთან: ნახევარი, 45 დღე → გამორთმევა → ნახევარი ბრუნდება
    await openFrame(page, 'vaso');
    await expect(page.locator('#chat-copy-status')).toHaveText('ეგზემპლარი №1 ვასოსთანაა 45 დღეა (ნახევარი)');
    const done = await clickCopy(page);
    expect(done.action_result).toEqual({ type: 'retrieve', copyId: 1, outcome: 'returned', integrity: 'half' });
    await expect(page.locator('#chat-log .msg.user.action .stage').last()).toHaveText('ნინო ვასოს ეგზემპლარს უკან სთხოვს.');
    await expect(page.locator('#chat-copy')).toHaveAttribute('data-mode', 'give');
    await expect(page.locator('#chat-copy-status')).toBeHidden();
    expect((await copies(page)).copies[0]).toMatchObject({ status: 'in_hand', holder: null, integrity: 'half' });
    await expect(page.locator('#copies-tip')).toHaveText('№1 — თქვენთან (ნახევარი) · №2 — თქვენთან · №3 — თქვენთან');
  });

  test('§4.5 probability_scale 0: სამ დახურვაზე არაფერი იცვლება, ფურცელი არ ჩნდება', async ({ page }) => {
    await manuscriptCfg(page, { probability_scale: 0 });
    await openWall(page);
    await openFrame(page, 'vaso');
    await clickCopy(page);
    const shown = page.evaluate(() => new Promise((resolve) => {
      let n = 0;
      const el = document.getElementById('copy-note');
      new MutationObserver(() => { if (!el.hidden) n++; }).observe(el, { attributes: true });
      setTimeout(() => resolve(n), 6000);
    }));
    await closeChat(page);
    for (const id of ['tina', 'vaso']) {
      await openFrame(page, id);
      await send(page, 'როგორა ხართ?');
      await closeChat(page);
      await waitIntertitle(page);
    }
    expect(await shown).toBe(0);
    const s = await copies(page);
    expect(s.copies[0]).toMatchObject({ status: 'held', holder: 'vaso', integrity: 'full', events: [] });
    expect((await storage(page, 'tianshani.game')).day).toBe(135);
    await expect(page.locator('#copies-tip')).toHaveText('№1 — ვასოსთან 1 სექტემბრიდან · №2 — თქვენთან · №3 — თქვენთან');
  });

  test('§5 ჯაჭვი ბელა → ლერი (arrive): ბელას თქმა სიაში; ლერისთან გამორთმევის რეჟიმი; გახსნის მერე — „ბელას ქმართან“', async ({ page }) => {
    await manuscriptCfg(page, { probability_scale: 1000, event_override: 'passed_on', chain_override: 'arrive', stray_page_probability: 0 });
    await openWall(page);
    await openAny(page, 'bela');
    await clickCopy(page);
    await closeChat(page);
    await expect(page.locator('#copy-note')).toHaveText('ბელა: ლერიმ წაიღო სახლში!', { timeout: 5000 });
    await expect(page.locator('#copies-tip')).toHaveText('№1 — ბელას თქმით, ბელას ქმარს გადასცა · №2 — თქვენთან · №3 — თქვენთან');
    await openAny(page, 'leri');
    await expect(page.locator('#chat-copy')).toHaveAttribute('data-mode', 'take');
    await expect(page.locator('#chat-copy-status')).toHaveText('ეგზემპლარი №1 ბელას ქმართანაა 0 დღეა');
    await closeChat(page); // გაცვლის გარეშე — დრო არ მიდის
    await expect(page.locator('#copies-tip')).toHaveText('№1 — ბელას ქმართან 16 ოქტომბრიდან · №2 — თქვენთან · №3 — თქვენთან');
  });

  test('§5 ჯაჭვი ბელა → ლერი (lose): ლერის გახსნის მერე სია — „დაკარგულია: ბელას ქმარი ამბობს, არაფერი მიუღია.“', async ({ page }) => {
    await manuscriptCfg(page, { probability_scale: 1000, event_override: 'passed_on', chain_override: 'lose', stray_page_probability: 0 });
    await openWall(page);
    await openAny(page, 'bela');
    await clickCopy(page);
    await closeChat(page);
    await expect(page.locator('#copy-note')).toHaveText('ბელა: ლერიმ წაიღო სახლში!', { timeout: 5000 });
    await expect(page.locator('#copies-val')).toHaveText('3/3'); // Round 9 §4.2: ავტორმა ჯერ არ იცის
    await expect(page.locator('#copies-tip')).toContainText('№1 — ბელას თქმით, ბელას ქმარს გადასცა');
    await openAny(page, 'leri');
    await expect(page.locator('#chat-copy')).toHaveAttribute('data-mode', 'give');
    await closeChat(page);
    await expect(page.locator('#copies-val')).toHaveText('2/3');
    await expect(page.locator('#copies-tip')).toHaveText('№1 — დაკარგულია: ბელას ქმარი ამბობს, არაფერი მიუღია. · №2 — თქვენთან · №3 — თქვენთან');
    expect(await ledgerTexts(page)).toEqual(['№1 — დაკარგულია: ბელას ქმარი ამბობს, არაფერი მიუღია.', '№2 — თქვენთან', '№3 — თქვენთან']);
  });

  test('§3.3 უარი (ქალბატონი თამარი): რაოდენობა და ღილაკი უცვლელი, ეგზემპლარი ხელში რჩება', async ({ page }) => {
    await openWall(page);
    await openAny(page, 'tamari');
    const done = await clickCopy(page);
    expect(done.action_result).toEqual({ type: 'hand_over', copyId: 1, outcome: 'refused', integrity: 'full', reason_ka: 'სად მცალია ნეტავ მაგისთვის — ხელფასები ვერ დამირიგებია. ვინმე სხვას მიეცი.' });
    await expect(page.locator('#chat-log .msg.user.action .stage')).toHaveText('ნინო ქალბატონ თამარს ხელნაწერის ეგზემპლარს აწვდის.');
    await expect(page.locator('#chat-log .msg.char').last()).toContainText('სად მცალია ნეტავ მაგისთვის');
    await expect(page.locator('#chat-copy')).toBeVisible();
    await expect(page.locator('#chat-copy')).toHaveAttribute('data-mode', 'give');
    await expect(page.locator('#chat-copy-status')).toBeHidden();
    await expect(page.locator('#copies-val')).toHaveText('3/3');
    expect((await copies(page)).copies.map((c) => c.status)).toEqual(['in_hand', 'in_hand', 'in_hand']);
  });

  test('§9 ჩამონგრევა (დღე 320 + 45) → სამი ახალი ეგზემპლარი ხელში; „ყველაფრის განულება“ → იგივე', async ({ page }) => {
    await seedStorage(page, {
      'tianshani.game': { cycle: 1, day: 320, exchanges: 10, lastCharacterId: null, visited: [] },
      'tianshani.copies': {
        cycle: 1,
        copies: [
          { id: 1, status: 'held', holder: 'vaso', givenDay: 300, integrity: 'half', claim: null, lossVerified: false, events: [] },
          { id: 2, status: 'lost', holder: 'director', givenDay: 200, integrity: 'none', claim: null, lossVerified: true, events: [{ day: 260, actor: 'director', kind: 'misplaced', text_ka: 'ბანკში დამრჩა. სესხბანკში თუ მშენბანკში — ვერ გეტყვი.', to: null }] },
          { id: 3, status: 'in_hand', holder: null, givenDay: null, integrity: 'full', claim: null, lossVerified: false, events: [] },
        ],
        strayPages: [{ character: 'lali', copyId: 2, day: 260, seen: true }],
      },
    });
    await openWall(page);
    await expect(page.locator('#copies-val')).toHaveText('2/3');
    expect(await ledgerTexts(page)).toEqual([
      '№1 — ვასოსთან 27 ივნისიდან (ნახევარი)', // დღე 300 = 1984-06-27
      '№2 — დაკარგულია: ბანკში დამრჩა. სესხბანკში თუ მშენბანკში — ვერ გეტყვი. (ვაჟა ზაზაევიჩი) · ერთი ფურცელი ლალისთან',
      '№3 — თქვენთან',
    ]);
    await openFrame(page, 'tina');
    await send(page, 'დირექტორი აქ არის?');
    await page.locator('#chat-close').click();
    await expect(page.locator('#intertitle p')).toHaveText('შენობა ჩამოინგრა. ახალი შენობა. ყველაფერი თავიდან.', { timeout: 15_000 });
    await expect(page.locator('#intertitle')).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('#cycle-val')).toHaveText('2');
    await expect(page.locator('#copies-val')).toHaveText('3/3');
    expect(await ledgerTexts(page)).toEqual(IN_HAND);
    expect(await storage(page, 'tianshani.copies')).toMatchObject({ cycle: 2, strayPages: [] });
    // განულება: ჯერ ვასოს ვაძლევთ, მერე ყველაფერი თავიდან
    await openFrame(page, 'vaso');
    await clickCopy(page);
    await closeChat(page);
    await page.evaluate(() => window.tianshani.resetAll());
    await expect(page.locator('#cycle-val')).toHaveText('1');
    expect(await ledgerTexts(page)).toEqual(IN_HAND);
    expect(await storage(page, 'tianshani.copies')).toMatchObject({ cycle: 1, strayPages: [] });
  });
});

test.describe('Round 8 — ტელეფონი 375×812', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('§3/§8.3 ტელეფონზე: ღილაკი sheet-ში (44×44, ველის მარცხნივ), გადაცემა, სტატუსი; სია ხის tooltip-ში', async ({ page }) => {
    await manuscriptCfg(page, { probability_scale: 1000, event_override: 'fragment', stray_page_probability: 0 });
    await openWall(page);
    await expect(page.locator('#stat-copies')).toBeHidden();
    await openFrame(page, 'vaso');
    await expect(page.locator('#chat')).toHaveClass(/sheet/);
    const btn = page.locator('#chat-copy');
    await expect(btn).toBeVisible();
    const b = await btn.boundingBox();
    const t = await page.locator('#chat-input').boundingBox();
    expect(b.x + b.width).toBeLessThanOrEqual(t.x);
    expect([Math.round(b.width), Math.round(b.height)]).toEqual([44, 44]);
    await page.screenshot({ path: `${SHOTS}/R8-01-chat-copy-button-375.png` });
    await clickCopy(page);
    await expect(page.locator('#chat-copy-status')).toHaveText('ეგზემპლარი №1 ვასოსთანაა 0 დღეა');
    await expect(btn).toHaveAttribute('data-mode', 'take');
    await page.screenshot({ path: `${SHOTS}/R8-02-chat-retrieve-status-375.png` });
    await page.locator('#chat-close').tap();
    await expect(page.locator('#chat')).toBeHidden();
    await expect(page.locator('#copy-note')).toHaveText('ვასო: პირველი მეოთხედი კოტეს გავატანე.', { timeout: 5000 });
    await page.locator('#copy-note').tap();
    await expect(page.locator('#copy-note')).toBeHidden({ timeout: 1000 });
    // სია — ხის tooltip-ში (ცალკე ფურცელი არ არის)
    await page.locator('#stat-season').tap();
    await expect(page.locator('#season-tip')).toHaveCSS('opacity', '1');
    expect(await ledgerTexts(page, '#season-tip-ledger li')).toEqual(['№1 — ვასოსთან 1 სექტემბრიდან (ნახევარი)', '№2 — თქვენთან', '№3 — თქვენთან']);
    await expect(page.locator('#copy-ledger')).toBeHidden();
    await expect(page.locator('#season-tip-ledger')).toBeVisible();
    const tip = await page.locator('#season-tip').boundingBox();
    expect(tip.x).toBeGreaterThanOrEqual(0);
    expect(tip.x + tip.width).toBeLessThanOrEqual(375);
    await page.screenshot({ path: `${SHOTS}/R8-03-ledger-375.png`, clip: { x: 0, y: 0, width: 375, height: 360 } });
  });
});

test('§8.3 დესკტოპზე ხის tooltip-ში სია დამალულია (მხოლოდ < 900px)', async ({ page }) => {
  await openWall(page);
  await page.locator('#stat-season').hover();
  await expect(page.locator('#season-tip')).toHaveCSS('opacity', '1');
  await expect(page.locator('#season-tip-ledger')).toBeHidden();
  expect(await ledgerTexts(page, '#season-tip-ledger li')).toEqual(IN_HAND);
});
