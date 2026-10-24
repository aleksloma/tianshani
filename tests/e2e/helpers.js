// E2E დამხმარეები.
import { expect } from '@playwright/test';
import fs from 'node:fs';
import { openDb } from '../../src/db.js';

/** e2e სერვერის ბაზა (WAL) — ტესტი პირდაპირ წერს ხარჯს/გამოყენებას, რომ ნამდვილი 429/state გზა შემოწმდეს. */
let dbStore = null;
export function e2eStore() {
  if (!dbStore) dbStore = openDb('test-results/e2e/e2e.db');
  return dbStore;
}
export const monthKey = () => new Date().toISOString().slice(0, 7);

/** ადმინის API (ცალკე request context-ით). */
export async function adminApi(request, method, path) {
  const login = await request.post('/api/admin/login', { data: { password: 'e2e-admin-pass' } });
  expect(login.status()).toBe(200);
  const res = await request.fetch(path, { method });
  expect(res.status()).toBe(200);
  return res.json();
}

export const SHOTS = 'test-results/screens';
fs.mkdirSync(SHOTS, { recursive: true });

/** e2e-ის ნაგულისხმევი ავტორი (Round 3 §1) — რომ „საშვის“ ბარათი სხვა ტესტებს არ ეფარებოდეს. */
export const E2E_NAME = 'ნინო';

/**
 * გვერდის ჩატვირთვა და ყველა ანიმაციის დასრულება.
 * name: null — სახელი არ ითესება (პირველი ვიზიტი, „საშვის“ ბარათი ჩანს).
 */
export async function openWall(page, path = '/', { name = E2E_NAME } = {}) {
  if (name !== null) {
    await page.addInitScript((n) => {
      try { if (localStorage.getItem('tianshani.user_name') === null) localStorage.setItem('tianshani.user_name', JSON.stringify(n)); } catch { /* მიუწვდომელია */ }
    }, name);
  }
  await page.goto(path);
  await page.waitForFunction(() => window.tianshani?.ready === true);
  await settle(page);
}

/** ველოდებით, სანამ CSS transition/animation-ები დასრულდება (უსასრულოების გარდა). */
export async function settle(page) {
  await page.mouse.move(2, 2);
  await page.waitForFunction(() => document.getAnimations()
    .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity).length === 0, null, { timeout: 15_000 });
}

/** ჩარჩოების (მობრუნებული) მართკუთხედები + აკრძალული ზონები. */
export async function frameRects(page) {
  return page.evaluate(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; };
    const frames = [...document.querySelectorAll('#frames .frame:not([hidden])')].map((el) => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return { id: el.dataset.id, ...r(el), angle: (Math.atan2(m.b, m.a) * 180) / Math.PI };
    });
    const painting = document.getElementById('painting');
    const zones = { topbar: r(document.getElementById('topbar')), others: r(document.getElementById('others')), board: r(document.getElementById('noticeboard')) };
    if (painting && !painting.hidden) zones.painting = r(painting); // ნახატიც დაბრკოლებაა
    return {
      frames,
      zones,
      page: { w: document.documentElement.clientWidth, h: document.documentElement.scrollHeight },
    };
  });
}

export function overlaps(a, b, gap = 0) {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

/** ჩარჩოები ერთმანეთს და ზონებს არ ფარავს (gap-ით). */
export function expectNoOverlaps({ frames, zones }, gap) {
  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      expect(overlaps(frames[i], frames[j], gap), `${frames[i].id} × ${frames[j].id}`).toBe(false);
    }
    for (const [name, z] of Object.entries(zones)) {
      expect(overlaps(frames[i], z, gap), `${frames[i].id} × ${name}`).toBe(false);
    }
  }
}

/** გახსნამ შეიძლება დრო გადაწიოს (Round 1 §4) → ინტერტიტრის დასრულებას ველოდებით. */
export async function waitIntertitle(page) {
  await page.waitForTimeout(80);
  await expect(page.locator('#intertitle')).toBeHidden({ timeout: 15_000 });
}

/** „საშვის“ ბარათი (სახელის გარეშე ჩატვირთვისას) — დავხუროთ, თუ ჩანს. */
export async function closePassCard(page) {
  if (await page.locator('#pass-card').isVisible()) await page.locator('#pass-close').click();
}

/** ჩატის გახსნა კედლის ჩარჩოზე დაჭერით. */
export async function openFrame(page, id) {
  await closePassCard(page);
  await page.locator(`#frames .frame[data-id="${id}"]`).click();
  await expect(page.locator('#chat')).toBeVisible();
  await expect(page.locator('.frame.portrait')).toHaveCount(1);
  await page.waitForTimeout(500);
  await waitIntertitle(page);
}

/** ჩატის გახსნა „ესაუბრე სხვას“ მენიუდან (კედლის კუთხის ღილაკი, ან ჩატის ქვედა ზოლი, თუ ჩატი ღიაა). */
export async function openFromMenu(page, id) {
  // ჩატი „ღიაა“ მხოლოდ მაშინ, როცა .shown აქვს (დახურვის ანიმაციის დროს #chat ჯერ კიდევ ჩანს, მაგრამ უკვე იხურება)
  await closePassCard(page);
  const inChat = (await page.locator('#chat.shown').count()) > 0;
  if (!inChat) await expect(page.locator('#chat')).toBeHidden();
  await page.locator(inChat ? '#chat-others' : '#others-btn').click();
  await page.locator(`#others-menu .menu-item[data-id="${id}"]`).click();
  await expect(page.locator('#chat')).toBeVisible();
  await expect(page.locator(`.frame.portrait[data-id="${id}"]`)).toHaveCount(1, { timeout: 5000 });
  await page.waitForTimeout(500);
  await waitIntertitle(page);
}

/** ჩარჩოს მართკუთხედი + კუთხე + რა სტილი აქვს „ზედმეტად“ (ცენტრში ყოფნის კვალი). */
export async function frameState(page, id) {
  return page.locator(`#frames .frame[data-id="${id}"]`).evaluate((el) => {
    const b = el.getBoundingClientRect();
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return {
      x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height,
      angle: (Math.atan2(m.b, m.a) * 180) / Math.PI,
      lifted: el.classList.contains('lifted'),
      visible: getComputedStyle(el).visibility === 'visible',
      inlineTransform: el.style.transform,
      inlineTransition: el.style.transition,
      inlineOpacity: el.style.opacity,
    };
  });
}

/** ორი მდგომარეობა ერთნაირია (±2px, კუთხე ±0.05°). */
export function expectSameSpot(a, b) {
  for (const k of ['x', 'y', 'w', 'h']) expect(Math.abs(a[k] - b[k]), k).toBeLessThanOrEqual(2);
  expect(Math.abs(a.angle - b.angle)).toBeLessThanOrEqual(0.05);
}

/** სეზონის ხის მდგომარეობა და tooltip-ის ტექსტი. */
export async function treeState(page) {
  return page.evaluate(() => {
    const t = document.getElementById('season-tree');
    const date = document.getElementById('season-tip-date').textContent;
    const meta = document.getElementById('season-tip-meta').textContent;
    return { season: t.dataset.season, progress: Number(t.dataset.progress), date, meta, tip: `${date} | ${meta}` };
  });
}

/** შეტყობინების გაგზავნა და პასუხის დასრულებამდე ლოდინი (ინტერტიტრის ჩათვლით). */
export async function send(page, text) {
  const before = await page.locator('#chat-log .msg.char:not(.streaming)').count();
  await page.locator('#chat-input').fill(text);
  await page.locator('#chat-input').press('Enter');
  await expect(page.locator('#chat-log .msg.char:not(.streaming)')).toHaveCount(before + 1, { timeout: 15_000 });
  await expect(page.locator('#chat-send')).toBeEnabled();
  await expect(page.locator('#intertitle')).toBeHidden({ timeout: 15_000 });
}

/** შეტყობინების გაგზავნა; ველოდებით მხოლოდ პასუხს (ინტერტიტრს — არა), რომ ტესტმა ის თავად დაიჭიროს. */
export async function sendNoWait(page, text) {
  const before = await page.locator('#chat-log .msg.char:not(.streaming)').count();
  await page.locator('#chat-input').fill(text);
  await page.locator('#chat-input').press('Enter');
  await expect(page.locator('#chat-log .msg.char:not(.streaming)')).toHaveCount(before + 1, { timeout: 15_000 });
}

/** SSE პასუხის done ივენთი (page.waitForResponse-ის შედეგიდან). */
export async function sseDone(response) {
  const text = await response.text();
  const events = text.split('\n\n').filter(Boolean).map((c) => JSON.parse(c.replace(/^data:\s*/, '')));
  return events.find((e) => e.done) || null;
}

/** ტოკენების ინდიკატორი (Round 3 §3): დახარჯული შემავალის % (დაუმრგვალებელი — data-value). */
export const pctShown = (page) => page.locator('#tokens-pct').evaluate((el) => Number(el.dataset.value));

export const storage = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), key);
