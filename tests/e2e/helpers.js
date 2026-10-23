// E2E დამხმარეები.
import { expect } from '@playwright/test';
import fs from 'node:fs';

export const SHOTS = 'test-results/screens';
fs.mkdirSync(SHOTS, { recursive: true });

/** გვერდის ჩატვირთვა და ყველა ანიმაციის დასრულება. */
export async function openWall(page, path = '/') {
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
    const frames = [...document.querySelectorAll('#frames .frame')].map((el) => {
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

/** ჩატის გახსნა კედლის ჩარჩოზე დაჭერით. */
export async function openFrame(page, id) {
  await page.locator(`#frames .frame[data-id="${id}"]`).click();
  await expect(page.locator('#chat')).toBeVisible();
  await expect(page.locator('.frame.portrait')).toHaveCount(1);
  await page.waitForTimeout(500);
}

/** ჩატის გახსნა „ესაუბრე სხვას“ მენიუდან. */
export async function openFromMenu(page, id) {
  await page.locator('#others-btn').click();
  await page.locator(`#others-menu .menu-item[data-id="${id}"]`).click();
  await expect(page.locator('#chat')).toBeVisible();
  await page.waitForTimeout(500);
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

export const storage = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), key);
