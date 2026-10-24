// დესკტოპის (1280×800) სქრინშოტი mock სერვერით — Round 3 §6: „დესკტოპი არ უნდა შეიცვალოს“ (before/after შედარებისთვის).
// გამოყენება: node scripts/shot-desktop.mjs test-results/screens/R3-00-desktop-before.png
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const out = process.argv[2] || 'test-results/screens/R3-00-desktop.png';
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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: 'ka-GE' });
// სახელის ბარათი (Round 3 §1) არ უნდა ჩანდეს — კედელი ერთნაირი უნდა იყოს
await page.addInitScript(() => { try { localStorage.setItem('tianshani.user_name', JSON.stringify('ნინო')); } catch { /* ignore */ } });
await page.goto(base);
await page.waitForFunction(() => window.tianshani?.ready === true);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
await page.mouse.move(2, 2);
await page.waitForFunction(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity).length === 0);
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out, fullPage: true });
console.log(`saved ${out}`);
await browser.close();
server.close();
store.close();
