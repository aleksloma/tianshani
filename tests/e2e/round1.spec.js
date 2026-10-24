// Round 1 §2, §3, §4, §5: სცენური რემარკები, წარმომადგენლის UI, სეზონის ხე (ოთხივე სეზონის სქრინშოტი).
import { test, expect } from '@playwright/test';
import { openWall, openFrame, openFromMenu, send, treeState, settle, SHOTS } from './helpers.js';

// ---------- §2 სცენური რემარკები ----------

test('§2 ვაჟას პასუხი: ტელეფონის რემარკა ცალკე სტილში (დახრილი, სხვა შრიფტი, ჩამქრალი), ვარსკვლავი/ფრჩხილი არ ჩანს', async ({ page }) => {
  await openWall(page);
  await openFrame(page, 'director');
  await send(page, 'გამარჯობათ, ერთი მოთხრობა მაქვს, წაიკითხავთ?');
  const bubble = page.locator('#chat-log .msg.char .bubble').last();
  const stage = bubble.locator('.stage');
  await expect(stage.first()).toBeVisible();
  await expect(stage.first()).toContainText('ყურმილს იღებს');
  await expect(stage.first()).toContainText('დიახ, დიახ');
  const st = await stage.first().evaluate((el) => {
    const s = getComputedStyle(el);
    const sp = el.parentElement.querySelector('.speech');
    const ss = sp ? getComputedStyle(sp) : null;
    return { italic: s.fontStyle, family: s.fontFamily, color: s.color, size: parseFloat(s.fontSize), display: s.display, speechFamily: ss?.fontFamily, speechSize: ss ? parseFloat(ss.fontSize) : 0, speechColor: ss?.color };
  });
  expect(st.italic).toBe('italic');
  expect(st.family).not.toBe(st.speechFamily);
  expect(st.color).not.toBe(st.speechColor);
  expect(st.size).toBeLessThan(st.speechSize);
  expect(st.display).toBe('block'); // მთელი წინადადება — ცალკე ხაზზე
  const text = await page.locator('#chat-log .msg.char .bubble').allTextContents();
  for (const t of text) expect(t).not.toContain('*');
  for (const t of await page.locator('#chat-log .stage').allTextContents()) expect(t).not.toMatch(/[()]/);
  await bubble.screenshot({ path: `${SHOTS}/13-vazha-phone-stage.png` });
  await page.locator('#chat').screenshot({ path: `${SHOTS}/13b-vazha-chat-panel.png` });
  // ისტორიიდან ხელახლა რენდერიც სწორია
  await page.reload();
  await page.waitForFunction(() => window.tianshani?.ready === true);
  await openFrame(page, 'director');
  await expect(page.locator('#chat-log .msg.char .bubble .stage').first()).toContainText('ყურმილს იღებს');
});

test('§2 სტრიმინგი: გაუხსნელი * ბოლოში → რემარკა ბოლომდე; შუალედურ ნაწილებშიც * არ ჩანს', async ({ page }) => {
  // SSE ნაწილებად: ვარსკვლავი სხვადასხვა delta-შია, ბოლო რემარკა არ იხურება
  const deltas = ['ძალიან კარგი! *', '(ყურმილს ', 'იღებს) დიახ, დიახ…*', ' რას ამბობდი? *ტელეფონი ისევ რეკავს'];
  const body = deltas.map((d) => `data: ${JSON.stringify({ delta: d })}\n\n`).join('')
    + `data: ${JSON.stringify({ done: true, usage: { input: 1, output: 1 }, remaining: { input: 9, output: 9 }, suggested_redirect: null, spoken_by: 'director', spoken_by_name: 'ვაჟა ზაზაევიჩი' })}\n\n`;
  await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body }));
  await openWall(page);
  await openFrame(page, 'director');
  // შუალედური მდგომარეობის შემოწმება: MutationObserver ყოველ ცვლილებაზე
  const seenStar = page.evaluate(() => new Promise((resolve) => {
    let star = false;
    const log = document.getElementById('chat-log');
    const obs = new MutationObserver(() => { if ([...log.querySelectorAll('.msg.char .bubble')].some((b) => b.textContent.includes('*'))) star = true; });
    obs.observe(log, { subtree: true, childList: true, characterData: true });
    setTimeout(() => { obs.disconnect(); resolve(star); }, 2000);
  }));
  await page.locator('#chat-input').fill('გამარჯობა');
  await page.locator('#chat-input').press('Enter');
  await expect(page.locator('#chat-log .msg.char:not(.streaming)')).toHaveCount(1);
  expect(await seenStar).toBe(false);
  const stages = await page.locator('#chat-log .msg.char .stage').allTextContents();
  expect(stages).toEqual(['ყურმილს იღებს: დიახ, დიახ…', 'ტელეფონი ისევ რეკავს']);
  await expect(page.locator('#chat-log .msg.char .speech').first()).toHaveText('ძალიან კარგი!');
});

// ---------- §3 წარმომადგენელი ----------

test('§3 გამყრელიძე: სათაურში ~~გამყრელიძე~~ + წარმომადგენელი, ქვესათაური „მის ნაცვლად“, ბუშტზე მუქი სახელი + თამბნეილი, ცენტრში „პასუხობს: X“', async ({ page }) => {
  await openWall(page);
  const data = await (await page.request.get('/api/characters')).json();
  const byId = Object.fromEntries(data.characters.map((c) => [c.id, c]));
  const proxyNames = byId.gamkrelidze.proxies.map((id) => byId[id].short_name_ka);

  await openFromMenu(page, 'gamkrelidze');
  await expect(page.locator('#chat-name s.struck')).toHaveText('გამყრელიძე');
  const header = (await page.locator('#chat-name .real').textContent()).trim();
  expect(proxyNames).toContain(header);
  await expect(page.locator('#chat-sub')).toBeVisible();
  await expect(page.locator('#chat-sub')).toContainText('მის ნაცვლად');
  await expect(page.locator('#chat-sub')).toContainText(`გამყრელიძე ადგილზე არ არის — ${header} პასუხობს`);
  // სათაურში წარმომადგენლის სახელი უფრო დიდი და მუქია, ვიდრე გადახაზული
  const hs = await page.locator('#chat-name').evaluate((el) => ({
    real: parseFloat(getComputedStyle(el.querySelector('.real')).fontSize),
    struck: parseFloat(getComputedStyle(el.querySelector('s.struck')).fontSize),
    weight: Number(getComputedStyle(el.querySelector('.real')).fontWeight),
    line: getComputedStyle(el.querySelector('s.struck')).textDecorationLine,
    color: getComputedStyle(el.querySelector('s.struck')).textDecorationColor,
  }));
  expect(hs.real).toBeGreaterThan(hs.struck);
  expect(hs.weight).toBeGreaterThanOrEqual(700);
  expect(hs.line).toContain('line-through');
  expect(hs.color).toBe('rgb(192, 57, 43)');
  // ცენტრალურ სილუეტზე ბეჯი
  await expect(page.locator('.frame.portrait .proxy-badge .cap')).toHaveText(`პასუხობს: ${header}`);
  await expect(page.locator('.frame.portrait .proxy-badge img.thumb')).toBeVisible();

  await send(page, 'წაიკითხეთ ჩემი მოთხრობა?');
  const label = page.locator('#chat-log .msg.char .who').last();
  await expect(label.locator('s.struck')).toHaveText('გამყრელიძე');
  const real = label.locator('b.real');
  const name = (await real.textContent()).trim();
  expect(proxyNames).toContain(name);
  expect(Number(await real.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(700);
  const accent = await real.evaluate((el) => getComputedStyle(el).color);
  expect(accent).not.toBe('rgb(42, 38, 34)');
  const th = label.locator('img.thumb');
  await expect(th).toBeVisible();
  const box = await th.boundingBox();
  expect(Math.round(box.width)).toBe(24);
  // პასუხი მესამე პირშია (mock): სცენა + გამყრელიძე სახელით
  const bubble = page.locator('#chat-log .msg.char .bubble').last();
  await expect(bubble.locator('.stage').first()).toContainText('დერეფანში გამოდის');
  await expect(bubble).toContainText('გამყრელიძე');
  // სათაური მოპასუხეს მიჰყვება
  await expect(page.locator('#chat-name .real')).toHaveText(name);
  await page.screenshot({ path: `${SHOTS}/14-gamkrelidze-proxy.png` });

  // §5: სახელების ლეიბლი არასდროს იპარსება როგორც რემარკა
  expect(await page.locator('#chat-name .stage, #chat-log .who .stage').count()).toBe(0);
});

test('§3 ხილული პერსონაჟის ბუშტი ჩვეულებრივი ლეიბლით (თამბნეილისა და გადახაზვის გარეშე)', async ({ page }) => {
  await openWall(page);
  await openFrame(page, 'tina');
  await send(page, 'დირექტორი აქ არის?');
  const label = page.locator('#chat-log .msg.char .who').last();
  await expect(label).toHaveText('თინა');
  await expect(label.locator('img.thumb, s.struck')).toHaveCount(0);
  await expect(page.locator('#chat-sub')).toBeHidden();
  await expect(page.locator('.frame.portrait .proxy-badge')).toHaveCount(0);
});

test('§5 ლეიბლი: სახელი ვარსკვლავით/ფრჩხილით ლეიბლს არ არღვევს (textContent, პარსერის გარეშე)', async ({ page }) => {
  // მონაცემებში ასეთი სახელი არ არის — ვამოწმებთ, რომ ლეიბლის ტექსტი ზუსტად ის არის, რაც მოვიდა
  await page.route('**/api/characters', async (route) => {
    const res = await route.fetch();
    const j = await res.json();
    const z = j.characters.find((c) => c.id === 'zina');
    z.short_name_ka = 'ზი*ნა (ბუღ*)';
    const t = j.characters.find((c) => c.id === 'tamari');
    t.short_name_ka = '*თამარი*';
    await route.fulfill({ response: res, json: j });
  });
  await openWall(page);
  await openFromMenu(page, 'zina');
  await expect(page.locator('#chat-name s.struck')).toHaveText('ზი*ნა (ბუღ*)');
  await send(page, 'ზინა სად არის?');
  const label = page.locator('#chat-log .msg.char .who').last();
  await expect(label.locator('s.struck')).toHaveText('ზი*ნა (ბუღ*)');
  expect(await label.locator('.stage').count()).toBe(0);
});

// ---------- §4 ხე ოთხ სეზონში ----------

for (const [season, day, label] of [['autumn', 50, '21 ოქტომბერი'], ['winter', 150, '29 იანვარი'], ['spring', 240, '28 აპრილი'], ['summer', 300, '27 ივნისი']]) {
  test(`§4 ხე — ${season} (დღე ${day}): data-season, tooltip, სქრინშოტი`, async ({ page }) => {
    await page.addInitScript(([d]) => {
      localStorage.setItem('tianshani.game', JSON.stringify({ cycle: 1, day: d, exchanges: 0, lastCharacterId: null, visited: [] }));
    }, [day]);
    await openWall(page);
    await settle(page);
    const t = await treeState(page);
    expect(t.season).toBe(season);
    expect(t.date).toBe(label); // Round 2 §5: მთავარი ხაზი — თარიღი
    expect(t.meta).toMatch(/^ბზარი \d\/5 · ეგზემპლარი \d\/3$/);
    await expect(page.locator('#season-tree')).toHaveAttribute('data-season', season);
    // ჯგუფების ხილვადობა სეზონის მიხედვით
    const op = await page.locator('#season-tree').evaluate((svg) => Object.fromEntries(
      ['t-crown', 't-snow', 't-buds', 't-blossom', 't-fall', 't-flakes'].map((c) => [c, Number(getComputedStyle(svg.querySelector(`.${c}`)).opacity)]),
    ));
    const expected = {
      summer: { 't-crown': [1, 1], 't-snow': [0, 0], 't-blossom': [0, 0], 't-flakes': [0, 0] },
      autumn: { 't-crown': [0.5, 1], 't-fall': [0.5, 1], 't-snow': [0, 0], 't-blossom': [0, 0] },
      winter: { 't-crown': [0, 0], 't-snow': [0.3, 1], 't-flakes': [0.5, 1], 't-blossom': [0, 0] },
      spring: { 't-blossom': [0.3, 1], 't-buds': [0.5, 1], 't-snow': [0, 0], 't-fall': [0, 0] },
    }[season];
    for (const [g, [lo, hi]] of Object.entries(expected)) {
      expect(op[g], `${season} ${g}`).toBeGreaterThanOrEqual(lo - 0.01);
      expect(op[g], `${season} ${g}`).toBeLessThanOrEqual(hi + 0.01);
    }
    // ზოლში სეზონის ტექსტი არ ჩანს; tooltip — hover-ზე
    await page.locator('#stat-season').hover();
    await expect(page.locator('#season-tip')).toHaveCSS('opacity', '1');
    // tooltip იკითხება: ხაზები ერთმანეთზე არ ედება (line-height > 0, სიმაღლე ≥ ერთი ხაზი)
    const tip = await page.locator('#season-tip').evaluate((el) => ({ lh: parseFloat(getComputedStyle(el).lineHeight), fs: parseFloat(getComputedStyle(el).fontSize), h: el.getBoundingClientRect().height, right: el.getBoundingClientRect().right }));
    expect(tip.lh).toBeGreaterThan(tip.fs);
    expect(tip.h).toBeGreaterThan(tip.fs * 1.3);
    expect(tip.right).toBeLessThanOrEqual(page.viewportSize().width);
    await page.waitForTimeout(350);
    await page.locator('#topbar').screenshot({ path: `${SHOTS}/15-tree-${season}.png` });
    await page.locator('#stat-season').screenshot({ path: `${SHOTS}/15-tree-${season}-closeup.png` });
  });
}

test('§4 ხე: სეზონის შიგნით პროგრესი (შემოდგომა ყვითელ-მწვანიდან ნარინჯისფრისკენ)', async ({ page }) => {
  const fill = async (day) => {
    await page.evaluate((d) => localStorage.setItem('tianshani.game', JSON.stringify({ cycle: 1, day: d, exchanges: 0, lastCharacterId: null, visited: [] })), day);
    await page.reload();
    await page.waitForFunction(() => window.tianshani?.ready === true);
    return page.locator('#season-tree .t-crown').evaluate((g) => g.style.fill);
  };
  await openWall(page);
  const early = await fill(2);
  const late = await fill(85);
  expect(early).not.toBe(late);
  // ნარინჯისფრისკენ: წითელი არხი იზრდება, მწვანე მცირდება
  const rgb = (s) => (s.match(/\d+/g) || []).map(Number);
  expect(rgb(late)[0]).toBeGreaterThan(rgb(early)[0]);
  expect(rgb(late)[1]).toBeLessThan(rgb(early)[1]);
});

test.describe('მობილური', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('§4 ხე მობილურზე: შეხებით ჩანს tooltip', async ({ page }) => {
    await openWall(page);
    await page.locator('#stat-season').tap();
    await expect(page.locator('#stat-season')).toHaveClass(/open/);
    await expect(page.locator('#season-tip')).toHaveCSS('opacity', '1');
    // Round 2 §5: თარიღი წლის და სეზონის სახელის გარეშე + ბზარი/ეგზემპლარი
    await expect(page.locator('#season-tip-date')).toHaveText('1 სექტემბერი');
    await expect(page.locator('#season-tip-meta')).toHaveText('ბზარი 1/5 · ეგზემპლარი 3/3');
    await expect(page.locator('#season-tip')).not.toContainText('შემოდგომა');
  });
});
