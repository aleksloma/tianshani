// გვერდის სქრინშოტი mock სერვერით, მოცემულ ზომაზე — Round 3/4: „დიზაინი არ უნდა შეიცვალოს“ (before/after შედარება).
// გამოყენება: node scripts/shot-page.mjs <out.png> [--viewport 1280x800] [--mobile] [--scroll bottom] [--path /]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) || 'test-results/screens/page.png';
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const [vw, vh] = opt('--viewport', '1280x800').split('x').map(Number);
const mobile = args.includes('--mobile') || vw < 700;
const scroll = opt('--scroll', 'top');
const urlPath = opt('--path', '/');

process.env.SETTINGS_PATH = 'tests/e2e/settings.e2e.json';
process.env.GEMINI_MOCK = '1';
process.env.DB_PATH = 'test-results/shot/shot.db';
delete process.env.PORT;
const { loadConfig } = await import('../src/config.js');
const { createApp } = await import('../src/server.js');
const { app, store } = createApp(loadConfig({ server: { port: 0 } }));
const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: vw, height: vh }, isMobile: mobile, hasTouch: mobile, locale: 'ka-GE' });
// სახელის ბარათი (Round 3 §1) არ უნდა ჩანდეს — კედელი ერთნაირი უნდა იყოს
await page.addInitScript(() => { try { localStorage.setItem('tianshani.user_name', JSON.stringify('ნინო')); } catch { /* ignore */ } });
await page.goto(base + urlPath);
await page.waitForFunction(() => window.tianshani?.ready === true);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
await page.mouse.move(2, 2);
await page.waitForFunction(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity).length === 0);
if (scroll === 'bottom') { await page.evaluate(() => window.scrollTo(0, 99999)); await page.waitForTimeout(300); }
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out, fullPage: scroll !== 'bottom' });
console.log(`saved ${out} (${vw}×${vh}${mobile ? ' mobile' : ''}${scroll === 'bottom' ? ', bottom' : ', full page'})`);
await browser.close();
server.close();
store.close();
