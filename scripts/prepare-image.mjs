// სურათის მომზადება ჩარჩოსთვის: crop (პორტრეტი 3:4) + ზომა + JPEG ≤150KB.
// იყენებს Playwright-ის Chromium-ს (canvas), დამატებითი ბიბლიოთეკების გარეშე.
// გამოყენება:
//   node scripts/prepare-image.mjs <input> <output.jpg> [--w 360] [--h 480] [--focus 0.3] [--max 150]
//   --focus: ვერტიკალური ფოკუსი 0 (ზედა) … 1 (ქვედა); სახეებისთვის ~0.25–0.35
//   --cover: crop-ის გარეშე, მხოლოდ ზომა (ტექსტურებისთვის)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [, , input, output, ...rest] = process.argv;
if (!input || !output) {
  console.error('usage: node scripts/prepare-image.mjs <input> <output.jpg> [--w 360] [--h 480] [--focus 0.3] [--max 150] [--cover]');
  process.exit(2);
}
const opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? Number(rest[i + 1]) : d; };
const W = opt('w', 360);
const H = opt('h', 480);
const FOCUS = opt('focus', 0.3);
const MAX_KB = opt('max', 150);
const COVER = rest.includes('--cover');

const buf = fs.readFileSync(input);
const sig = buf.subarray(0, 12).toString('hex');
const mime = sig.startsWith('ffd8ff') ? 'image/jpeg'
  : sig.startsWith('89504e47') ? 'image/png'
  : buf.subarray(8, 12).toString() === 'WEBP' ? 'image/webp'
  : sig.startsWith('47494638') ? 'image/gif' : null;
if (!mime) { console.error(`${input}: არ არის სურათი (signature ${sig})`); process.exit(1); }

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
  const result = await page.evaluate(async ({ dataUrl, W, H, FOCUS, MAX_KB, COVER }) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    let sw = img.naturalWidth; let sh = img.naturalHeight; let sx = 0; let sy = 0;
    let outW = W; let outH = H;
    if (COVER) {
      const scale = Math.min(1, W / sw);
      outW = Math.round(sw * scale); outH = Math.round(sh * scale);
    } else {
      const target = W / H;
      if (sw / sh > target) { const nw = sh * target; sx = (sw - nw) / 2; sw = nw; } else { const nh = sw / target; sy = (sh - nh) * FOCUS; sh = nh; }
    }
    const c = document.createElement('canvas');
    c.width = outW; c.height = outH;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#e9e1cc';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
    let q = 0.86; let url = '';
    for (; q >= 0.4; q -= 0.06) {
      url = c.toDataURL('image/jpeg', q);
      if ((url.length - 23) * 0.75 / 1024 <= MAX_KB) break;
    }
    return { url, q, natural: [img.naturalWidth, img.naturalHeight], out: [outW, outH] };
  }, { dataUrl, W, H, FOCUS, MAX_KB, COVER });
  const out = Buffer.from(result.url.split(',')[1], 'base64');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, out);
  console.log(`${path.basename(output)}: ${result.natural.join('×')} → ${result.out.join('×')}, q=${result.q.toFixed(2)}, ${(out.length / 1024).toFixed(1)} KB`);
} finally {
  await browser.close();
}
