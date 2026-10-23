// სეზონის ხე (FIXES_ROUND1 §4): inline SVG ზედა ზოლში; ოთხი მდგომარეობა გლუვი გადასვლით, სეზონის შიგნით პროგრესიც ჩანს.
// ფერები/გამჭვირვალობები inline სტილით იწერება, CSS-ში transition 1.5s.

const CROWN = {
  summer: ['#4f9c3f', '#2f7a2c'],   // ღია მწვანე → მუქი მწვანე
  autumn: ['#b8b43a', '#d8621c'],   // ყვითალ-მწვანე → ნარინჯისფერი
};

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lerp(a, b, t) { return a + (b - a) * t; }
/** ორი ფერის ინტერპოლაცია (0…1). */
export function mixColor(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const c = (x) => Math.round(x).toString(16).padStart(2, '0');
  return `#${c(lerp(r1, r2, t))}${c(lerp(g1, g2, t))}${c(lerp(b1, b2, t))}`;
}

/** ხის SVG მარკაპი (40×48). ჯგუფები: ტანი/ტოტები, გვირგვინი, თოვლი, კვირტები, ყვავილები, ჩამოვარდნილი ფოთლები, ფიფქები. */
export function treeMarkup() {
  const tips = [[15, 20], [27, 17], [11, 23], [30, 22], [14, 31], [20, 12], [24, 27]];
  const snow = tips.map(([x, y]) => `<ellipse cx="${x}" cy="${y - 1.2}" rx="2.6" ry="1.3"/>`).join('');
  const buds = [...tips, [18, 16], [23, 20], [17, 26]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.25"/>`).join('');
  const blossoms = [[16, 18], [26, 15], [12, 21], [29, 20], [20, 10], [22, 24], [15, 29], [25, 29], [19, 15]]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${1.4 + (i % 3) * 0.3}"/>`).join('');
  const leaves = [[14, 18], [24, 14], [19, 24]].map(([x, y], i) => `<ellipse class="leaf" style="animation-delay:${i * 1.1}s" cx="${x}" cy="${y}" rx="1.9" ry="1.1"/>`).join('');
  const flakes = [[9, 4], [21, 2], [31, 6], [16, 8]].map(([x, y], i) => `<circle class="flake" style="animation-delay:${i * 0.9}s" cx="${x}" cy="${y}" r="1.1"/>`).join('');
  return `<svg id="season-tree" class="tree" viewBox="0 0 40 48" width="40" height="48" aria-hidden="true" data-season="autumn" data-progress="0">
  <g class="t-trunk"><path d="M19 47 L19 28 Q19 24 15 20 M21 47 L21 26 Q22 21 27 17 M20 33 Q14 29 11 23 M20 30 Q26 27 30 22 M20 36 Q17 35 14 31 M20 28 Q23 28 24 27 M20 18 L20 12" fill="none" stroke="#5a3b22" stroke-width="2.3" stroke-linecap="round"/></g>
  <g class="t-crown"><circle cx="20" cy="14" r="9"/><circle cx="12" cy="20" r="6.5"/><circle cx="28" cy="19" r="6.5"/><circle cx="15" cy="10" r="5.5"/><circle cx="26" cy="9" r="5.5"/><circle cx="20" cy="23" r="5"/></g>
  <g class="t-snow">${snow}</g>
  <g class="t-buds">${buds}</g>
  <g class="t-blossom">${blossoms}</g>
  <g class="t-fall">${leaves}</g>
  <g class="t-flakes">${flakes}</g>
</svg>`;
}

/**
 * მდგომარეობის განახლება. view: { season, progress (0…1) }.
 * ზაფხული — სავსე მწვანე; შემოდგომა — ყვითელი→ნარინჯისფერი, თხელდება, ფოთლები ცვივა;
 * ზამთარი — შიშველი ტოტები, თოვლი გროვდება, ფიფქები; გაზაფხული — კვირტები და ყვავილები მატულობს.
 */
export function updateTree(svg, view) {
  const p = Math.max(0, Math.min(1, Number(view.progress) || 0));
  const season = view.season;
  const g = (cls) => svg.querySelector(`.${cls}`);
  const set = (cls, opacity, fill = null) => {
    const el = g(cls);
    el.style.opacity = String(opacity);
    if (fill) el.style.fill = fill;
  };
  svg.dataset.season = season;
  svg.dataset.progress = p.toFixed(2);
  const crownFill = season === 'summer' ? mixColor(CROWN.summer[0], CROWN.summer[1], p)
    : season === 'autumn' ? mixColor(CROWN.autumn[0], CROWN.autumn[1], p)
      : season === 'spring' ? mixColor('#cfe3a0', '#8cc45a', p) : '#c9d2c4';
  set('t-crown', season === 'summer' ? 1 : season === 'autumn' ? 1 - 0.45 * p : season === 'spring' ? 0.25 * p : 0, crownFill);
  set('t-snow', season === 'winter' ? 0.35 + 0.65 * p : 0, '#f4f7fb');
  set('t-buds', season === 'spring' ? 0.5 + 0.5 * p : 0, '#9ed36a');
  set('t-blossom', season === 'spring' ? Math.min(1, 0.15 + p) : 0, mixColor('#f7c9d4', '#ec8fb0', p));
  set('t-fall', season === 'autumn' ? 0.9 : 0, mixColor('#c9a227', '#c0531a', p));
  set('t-flakes', season === 'winter' ? 0.9 : 0, '#ffffff');
}
