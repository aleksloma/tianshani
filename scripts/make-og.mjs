// Open Graph სურათი (Round 4 §8): 1200×630 კედელი რამდენიმე ჩარჩოთი — Playwright-ით (mock სერვერი), sharp-ით JPEG ≤ 200 KB.
// გამოყენება: node scripts/make-og.mjs  → public/assets/og.jpg
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const OUT = 'public/assets/og.jpg';
process.env.SETTINGS_PATH = 'tests/e2e/settings.e2e.json';
process.env.GEMINI_MOCK = '1';
process.env.DB_PATH = 'test-results/shot/og.db';
delete process.env.PORT;
const { loadConfig } = await import('../src/config.js');
const { createApp } = await import('../src/server.js');
const { app, store } = createApp(loadConfig({ server: { port: 0 } }));
const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, locale: 'ka-GE' });
await page.addInitScript(() => { try { localStorage.setItem('tianshani.user_name', JSON.stringify('ავტორი')); } catch { /* ignore */ } });
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.tianshani?.ready === true);
// სატესტო რეჟიმის ბანერი და ზოლის სტატისტიკა სურათში არ გვინდა — მხოლოდ სათაური და კედელი
await page.addStyleTag({ content: '#mock-banner, #storage-banner, .status { display: none !important; }' });
await page.evaluate(() => { window.dispatchEvent(new Event('resize')); return document.fonts.ready; });
await page.waitForTimeout(900);
await page.mouse.move(2, 2);
const png = await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } });
let q = 86;
let buf;
for (; q >= 50; q -= 6) {
  buf = await sharp(png).jpeg({ quality: q, mozjpeg: true }).toBuffer();
  if (buf.length <= 200 * 1024) break;
}
fs.writeFileSync(OUT, buf);
const m = await sharp(buf).metadata();
console.log(`${OUT}: ${m.width}×${m.height}, q=${q}, ${(buf.length / 1024).toFixed(1)} KB`);
await browser.close();
server.close();
store.close();
