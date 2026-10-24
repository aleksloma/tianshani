// favicon.svg → PNG fallback-ები (Round 4 §8): favicon.png 64×64, apple-touch-icon.png 180×180. sharp (librsvg) ხატავს SVG-ს.
// გამოყენება: node scripts/make-favicon.mjs
import sharp from 'sharp';

const SRC = 'public/assets/favicon.svg';
for (const [out, size] of [['public/assets/favicon.png', 64], ['public/assets/apple-touch-icon.png', 180]]) {
  await sharp(SRC, { density: Math.ceil((size / 32) * 72) }).resize(size, size).png({ compressionLevel: 9 }).toFile(out);
  const m = await sharp(out).metadata();
  console.log(`${out}: ${m.width}×${m.height}`);
}
