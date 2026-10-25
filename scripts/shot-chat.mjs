// ჩატის/ინტერტიტრის სქრინშოტი mock სერვერით — Round 9: before/after შედარება („დიზაინი მხოლოდ ცვლილების ადგილას იცვლება“).
// ანიმაციები, transition-ები და კურსორი გამორთულია, ფოკუსი მოხსნილია — ორი გაშვება ერთნაირი უნდა იყოს.
// გამოყენება: node scripts/shot-chat.mjs <scene> <out.png> [--viewport 1280x800]
//   scene: give — ვასოს ჩატი, ეგზემპლარის ღილაკი გადაცემის რეჟიმში
//          take — ვასოს გადაეცა ეგზემპლარი (ღილაკი გამორთმევის რეჟიმში)
//          winter — ზამთრის ინტერტიტრი კედელზე;  collapse — ჩამონგრევის ინტერტიტრი
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const [scene, out] = args.filter((a) => !a.startsWith('--') && !/^\d+x\d+$/.test(a));
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const [vw, vh] = opt('--viewport', '1280x800').split('x').map(Number);
const mobile = vw < 700;
if (!['give', 'take', 'winter', 'collapse'].includes(scene) || !out) {
  console.error('გამოყენება: node scripts/shot-chat.mjs <give|take|winter|collapse> <out.png> [--viewport WxH]');
  process.exit(2);
}

const DB = 'test-results/shot/shot-chat.db';
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) fs.rmSync(f, { force: true });
process.env.SETTINGS_PATH = 'tests/e2e/settings.e2e.json';
process.env.GEMINI_MOCK = '1';
process.env.DB_PATH = DB;
process.env.MOCK_DELAY_MS = '0';
delete process.env.PORT;
const { loadConfig } = await import('../src/config.js');
const { createApp } = await import('../src/server.js');
const { app, store } = createApp(loadConfig({ server: { port: 0 } }));
const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;

const FREEZE = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: vw, height: vh }, isMobile: mobile, hasTouch: mobile, locale: 'ka-GE' });
await page.addInitScript(() => { try { localStorage.setItem('tianshani.user_name', JSON.stringify('ნინო')); } catch { /* ignore */ } });
await page.goto(base);
await page.waitForFunction(() => window.tianshani?.ready === true);
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: FREEZE });
await page.waitForTimeout(300);

if (scene === 'give' || scene === 'take') {
  const frame = page.locator('#frames .frame[data-id="vaso"]');
  if (await frame.count()) await frame.click();
  else { await page.locator('#others-btn').click(); await page.locator('#others-menu .menu-item[data-id="vaso"]').click(); }
  await page.locator('#chat').waitFor({ state: 'visible' });
  await page.waitForTimeout(600);
  if (scene === 'take') {
    await page.locator('#chat-copy').click();
    // Round 9: ღილაკი მხოლოდ ამაგრებს — გაგზავნა Enter-ით; Round 8-ში დაჭერა თავად აგზავნიდა
    const slip = page.locator('#chat-attach');
    if (await slip.count() && await slip.isVisible()) await page.locator('#chat-input').press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('#chat-log .msg.char:not(.streaming)').length === 1, null, { timeout: 15_000 });
    await page.waitForFunction(() => !document.getElementById('chat-send').disabled);
  }
} else {
  const text = scene === 'winter' ? 'ზამთარი.' : 'შენობა ჩამოინგრა. ახალი შენობა. ყველაფერი თავიდან.';
  await page.evaluate(([t, season]) => {
    import('/js/game.js').then((m) => m.showIntertitle(t, 60_000, season ? { season } : {}));
  }, [text, scene === 'winter' ? 'winter' : null]);
  await page.locator('#intertitle').waitFor({ state: 'visible' });
}
await page.evaluate(() => document.activeElement?.blur());
await page.mouse.move(1, vh - 1);
await page.waitForTimeout(300);
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out });
console.log(`saved ${out} (${scene}, ${vw}×${vh}${mobile ? ' mobile' : ''})`);
await browser.close();
server.close();
store.close();
