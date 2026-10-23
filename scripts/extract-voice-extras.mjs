// analysis/03_metyvelebis_stili_voice_bible.md → src/data/voice_extras.json
// ამოაქვს თითო პერსონაჟის DO / DON'T სიები (§N.5) და პირველი აბზაცი Voice Profile-დან (§N.1).
// გაშვება: npm run voice:extract  (შედეგი commit-დება; ბიბლია არ იცვლება)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'analysis', '03_metyvelebis_stili_voice_bible.md');
const OUT = path.join(ROOT, 'src', 'data', 'voice_extras.json');

// ბიბლიის სექციის ნომერი → characters.json-ის id. წიგნის პერსონაჟები (საშა, კოლია, ავრორა, ვარდენი) JSON-ში არ არიან.
const SECTION_TO_ID = {
  1: 'soso', 2: 'vaso', 3: 'director', 4: 'bela', 5: 'grisha', 6: 'mikho', 7: 'tamari', 8: 'tina',
  9: 'otari', 10: 'shukri', 11: 'irodioni', 12: 'kote', 13: 'boria', 14: 'kako', 17: 'marksheideri', 20: 'two_big_men',
};

const md = fs.readFileSync(SRC, 'utf8');
const lines = md.split(/\r?\n/);

const result = {};
let section = null; // { num, title }
let sub = null;     // 'profile' | 'dodont' | null
let list = null;    // 'do' | 'dont'

for (const raw of lines) {
  const line = raw.trimEnd();
  const h2 = line.match(/^## (\d+)\. (.+)$/);
  if (h2) {
    const num = Number(h2[1]);
    const id = SECTION_TO_ID[num];
    section = id ? { num, id, title: h2[2].trim() } : null;
    if (section) result[id] = { bible_section: `${num}. ${section.title}`, voice_profile: '', do: [], dont: [] };
    sub = null; list = null;
    continue;
  }
  if (!section) continue;
  const h3 = line.match(/^### (\d+)\.(\d+)/);
  if (h3) {
    const n = h3[2];
    sub = n === '1' ? 'profile' : n === '5' ? 'dodont' : null;
    list = null;
    continue;
  }
  if (sub === 'profile' && !result[section.id].voice_profile && line.trim()) {
    result[section.id].voice_profile = line.trim();
  }
  if (sub === 'dodont') {
    // ფორმატი 2: ერთ ხაზზე „**DO**: a; b; c“ (მაგ. §20)
    const inline = line.match(/^\*\*(DO|DON'T)\*\*:\s*(.+)$/);
    if (inline) {
      const key = inline[1] === 'DO' ? 'do' : 'dont';
      result[section.id][key].push(...inline[2].split(/;\s*/).map((s) => s.trim().replace(/\.$/, '')).filter(Boolean));
      list = null;
      continue;
    }
    if (/^\*\*DO\*\*/.test(line)) { list = 'do'; continue; }
    if (/^\*\*DON'T\*\*/.test(line)) { list = 'dont'; continue; }
    const li = line.match(/^- (.+)$/);
    if (li && list) result[section.id][list].push(li[1].trim());
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  _source: 'analysis/03_metyvelebis_stili_voice_bible.md (§N.1 პირველი აბზაცი, §N.5 DO/DON\'T). გენერირებულია scripts/extract-voice-extras.mjs-ით.',
  characters: result,
}, null, 2) + '\n', 'utf8');

const ids = Object.keys(result);
console.log(`voice_extras.json: ${ids.length} პერსონაჟი → ${ids.join(', ')}`);
for (const id of ids) console.log(`  ${id}: DO ${result[id].do.length}, DON'T ${result[id].dont.length}`);
