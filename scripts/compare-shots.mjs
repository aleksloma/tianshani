// ორი PNG-ის პიქსელური შედარება (sharp) — Round 3 §6: დესკტოპი before/after იდენტური უნდა იყოს ზედა ზოლის ქვემოთ.
// გამოყენება: node scripts/compare-shots.mjs a.png b.png [--skip-top 100] [--out diff.png]
import sharp from 'sharp';

const args = process.argv.slice(2);
const [a, b] = args;
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const skipTop = Number(opt('--skip-top', 0));
const out = opt('--out', null);
if (!a || !b) { console.error('usage: compare-shots a.png b.png [--skip-top N] [--out diff.png]'); process.exit(2); }

const [A, B] = await Promise.all([a, b].map((f) => sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
const same = A.info.width === B.info.width && A.info.height === B.info.height;
console.log(`A ${A.info.width}×${A.info.height}, B ${B.info.width}×${B.info.height}${same ? '' : ' — ზომები განსხვავდება!'}`);
const W = Math.min(A.info.width, B.info.width);
const H = Math.min(A.info.height, B.info.height);
let diff = 0;
let diffBelow = 0;
const mask = out ? Buffer.alloc(W * H * 4) : null;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const ia = (y * A.info.width + x) * 4;
    const ib = (y * B.info.width + x) * 4;
    const d = Math.abs(A.data[ia] - B.data[ib]) + Math.abs(A.data[ia + 1] - B.data[ib + 1]) + Math.abs(A.data[ia + 2] - B.data[ib + 2]);
    const differs = d > 24; // JPEG/antialias ხმაური არ ითვლება
    if (differs) { diff++; if (y >= skipTop) diffBelow++; }
    if (mask) { const o = (y * W + x) * 4; mask[o] = differs ? 255 : A.data[ia] >> 2; mask[o + 1] = differs ? 0 : A.data[ia + 1] >> 2; mask[o + 2] = differs ? 0 : A.data[ia + 2] >> 2; mask[o + 3] = 255; }
  }
}
const pct = (n) => `${((n / (W * H)) * 100).toFixed(3)}%`;
console.log(`განსხვავებული პიქსელი სულ: ${diff} (${pct(diff)}); ზედა ${skipTop}px-ის ქვემოთ: ${diffBelow} (${pct(diffBelow)})`);
if (mask) { await sharp(mask, { raw: { width: W, height: H, channels: 4 } }).png().toFile(out); console.log(`diff → ${out}`); }
process.exit(same && diffBelow === 0 ? 0 : 1);
