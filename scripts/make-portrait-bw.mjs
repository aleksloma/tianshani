// პორტრეტი შავ-თეთრად (FIXES_ROUND2 §4): sharp-ით — გაუფერულება, ოდნავ მეტი კონტრასტი, 3:4 crop (სახეზე), 360×480,
// JPEG ≤150 KB. სეპიის გარეშე — სუფთა B&W, საბჭოური საპასპორტო ფოტოს მსგავსად. პიქსელები ხელით არ იცვლება.
// გამოყენება: node scripts/make-portrait-bw.mjs <input> <output.jpg> [--focus 0.25] [--max 150]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [, , input, output, ...rest] = process.argv;
if (!input || !output) {
  console.error('usage: node scripts/make-portrait-bw.mjs <input> <output.jpg> [--focus 0.25] [--max 150]');
  process.exit(2);
}
const opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? Number(rest[i + 1]) : d; };
const W = 360;
const H = 480;
const FOCUS = opt('focus', 0.25); // ვერტიკალური ფოკუსი crop-ისთვის: 0 ზედა … 1 ქვედა
const MAX_KB = opt('max', 150);

const meta = await sharp(input).metadata();
const sw = meta.width;
const sh = meta.height;
// 3:4 crop: თუ სურათი განიერია — სიგანე ვიწროვდება ცენტრში; თუ მაღალია — სიმაღლე, FOCUS-ით
let left = 0; let top = 0; let cw = sw; let ch = sh;
if (sw / sh > W / H) { cw = Math.round(sh * (W / H)); left = Math.round((sw - cw) / 2); } else { ch = Math.round(sw * (H / W)); top = Math.round((sh - ch) * FOCUS); }

let quality = 88;
let buf;
for (; quality >= 40; quality -= 6) {
  buf = await sharp(input)
    .extract({ left, top, width: cw, height: ch })
    .resize(W, H, { kernel: 'lanczos3' })
    .grayscale()                       // გაუფერულება (სეპიის გარეშე)
    .linear(1.12, -12)                 // ოდნავ მეტი კონტრასტი
    .normalise({ lower: 1, upper: 99 }) // ტონების დიაპაზონი
    .sharpen({ sigma: 0.6 })
    .toColourspace('b-w')              // ერთარხიანი ნაცრისფერი JPEG
    .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();
  if (buf.length / 1024 <= MAX_KB) break;
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, buf);
const out = await sharp(buf).metadata();
console.log(`${path.basename(output)}: ${sw}×${sh} → crop ${cw}×${ch}@${left},${top} → ${out.width}×${out.height}, ${out.channels} ch, q=${quality}, ${(buf.length / 1024).toFixed(1)} KB`);
