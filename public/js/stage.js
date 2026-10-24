// სცენური რემარკები (FIXES_ROUND1 §2): პასუხის ტექსტი → სეგმენტები { type: 'speech' | 'stage', text, block }.
// *…* → რემარკა; (…) წინადადების დასაწყისში (ან პასუხის დასაწყისში) → რემარკაც. დანარჩენი — საუბარი.
// სტრიმინგზე: გაუხსნელი * ან წინადადების დასაწყისის გაუხსნელი ( ბოლოში → რემარკა ტექსტის ბოლომდე. ვარსკვლავი/ფრჩხილი არასდროს ჩანს.

const SENTENCE_END = /[.!?…:;]["“”»]?\s*$/;

/** წინადადების დასაწყისია თუ არა (ცარიელი, წინადადების დასასრული ან ახალი ხაზი). */
const atSentenceStart = (before) => before.trim() === '' || SENTENCE_END.test(before) || /\n\s*$/.test(before);

/** (…) სეგმენტების გამოყოფა საუბრის ტექსტიდან. */
function splitParens(t) {
  const out = [];
  const re = /\(([^()]*)\)/g;
  let last = 0;
  let m;
  while ((m = re.exec(t))) {
    const before = t.slice(last, m.index);
    if (atSentenceStart(t.slice(0, m.index))) {
      if (before) out.push({ type: 'speech', text: before });
      out.push({ type: 'stage', text: m[1] });
      last = m.index + m[0].length;
    }
  }
  let tail = t.slice(last);
  // სტრიმინგი: წინადადების დასაწყისში გახსნილი, ჯერ დაუხურავი ფრჩხილი
  const open = tail.match(/\(([^()]*)$/);
  if (open && atSentenceStart(t.slice(0, last + open.index))) {
    const before = tail.slice(0, open.index);
    if (before) out.push({ type: 'speech', text: before });
    out.push({ type: 'stage', text: open[1] });
    tail = '';
  }
  if (tail) out.push({ type: 'speech', text: tail });
  return out;
}

/** *…*-ის შიგნით: „(ყურმილს იღებს) დიახ, დიახ“ → „ყურმილს იღებს: დიახ, დიახ“; დანარჩენი ფრჩხილები ქრება. */
function cleanStage(s) {
  return s
    // „(ყურმილს იღებს) დიახ“ → „ყურმილს იღებს: დიახ“; თუ მოქმედება უკვე პუნქტუაციით/ბრჭყალით მთავრდება — უბრალოდ სივრცე
    .replace(/^\s*\(([^()]*)\)\s*(?=\S)/, (_, inner) => (/[.!?…:;“”"»]\s*$/.test(inner) ? `${inner.trim()} ` : `${inner}: `))
    .replace(/[()]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * მთავარი პარსერი. აბრუნებს სეგმენტებს თანმიმდევრობით; მეზობელი ერთი ტიპისა ერთიანდება.
 * block: true — რემარკა მთელი წინადადებაა (ცალკე ხაზზე იწერება, როგორც სცენარში).
 */
export function parseStage(text) {
  const parts = String(text ?? '').split('*');
  const raw = [];
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i];
    if (!t) continue;
    if (i % 2 === 1) raw.push({ type: 'stage', text: cleanStage(t) }); // ვარსკვლავებს შორის (ბოლო გაუხსნელიც)
    else raw.push(...splitParens(t));
  }
  const merged = [];
  for (const s of raw) {
    if (s.type === 'stage' && !s.text.trim()) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.type === s.type) prev.text += (s.type === 'stage' ? ' ' : '') + s.text;
    else merged.push({ ...s });
  }
  for (let i = 0; i < merged.length; i++) {
    const s = merged[i];
    if (s.type !== 'stage') continue;
    const prev = merged[i - 1];
    const next = merged[i + 1];
    s.text = cleanStage(s.text);
    s.block = !prev || atSentenceStart(prev.text);
    if (s.block) {
      if (prev) prev.text = prev.text.replace(/\s+$/, '');
      if (next) next.text = next.text.replace(/^\s+/, '');
    }
  }
  return merged.filter((s) => s.text !== '');
}

/**
 * საუბრის ტექსტი ხაზებად (Round 2 §8: ყოველი წინადადება ახალ ხაზზე, როგორც სცენარში).
 * ცარიელი ხაზები ქრება; ხაზის თავ-ბოლოს სივრცეები იჭრება.
 */
export function speechLines(text) {
  return String(text).split(/\n+/).map((l) => l.trim()).filter(Boolean);
}

/** DOM რენდერი (ბრაუზერში): bubble-ის შიგთავსი სეგმენტებად. textContent — არასდროს innerHTML. */
export function renderSegments(container, text) {
  const frag = document.createDocumentFragment();
  const segs = parseStage(text);
  const inlineStage = (s) => s && s.type === 'stage' && !s.block;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.type === 'stage') {
      const span = document.createElement('span');
      span.className = `stage${s.block ? ' block' : ''}`;
      span.textContent = s.text;
      frag.append(span);
      continue;
    }
    // საუბარი: ახალი ხაზი → ცალკე ხაზი (მცირე დაშორებით); ხაზის გარეშე — ჩვეულებრივი inline span
    const lines = speechLines(s.text);
    const hasBreak = /\n/.test(s.text);
    if (!hasBreak) {
      const span = document.createElement('span');
      span.className = 'speech';
      span.textContent = s.text;
      frag.append(span);
      continue;
    }
    // Round 5 §3: რემარკა ხაზის შუაში (*…*) მეზობელ სიტყვებთან ერთ ხაზზე რჩება — მისი მოსაზღვრე ხაზის ნაწილი inline-ია
    const glueFirst = inlineStage(segs[i - 1]) && !/^\s*\n/.test(s.text);
    const glueLast = inlineStage(segs[i + 1]) && !/\n\s*$/.test(s.text);
    lines.forEach((l, k) => {
      const span = document.createElement('span');
      const before = k === 0 && glueFirst;
      const after = k === lines.length - 1 && glueLast;
      span.className = before || after ? 'speech' : 'speech line';
      // სივრცე რემარკის მხარეს რჩება (speechLines-ის trim-მა მოაშორა)
      span.textContent = `${before ? ' ' : ''}${l}${after ? ' ' : ''}`;
      frag.append(span);
    });
  }
  container.replaceChildren(frag);
}
