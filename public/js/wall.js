// კედელი: ჩარჩოების რენდერი computeLayout-ის მიხედვით, ბზარი, „ესაუბრე სხვას“ მენიუ, განცხადებების დაფა.
import { computeLayout } from './layout.js';
import { generateCrack, drawCrack, setCrackStage, framesNearCrack } from './crack.js';

const SILHOUETTE = 'assets/silhouette.svg';

/** ფირფიტის ტექსტი. */
export function plateText(c) {
  return { name: c.short_name_ka, role: c.role_short_ka };
}

function frameNode(c) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'frame';
  el.dataset.id = c.id;
  el.setAttribute('aria-label', `${c.short_name_ka} — ${c.role_short_ka}. საუბრის დაწყება`);
  const photo = document.createElement('div');
  photo.className = 'photo';
  const img = document.createElement('img');
  img.alt = '';
  img.loading = 'lazy';
  img.src = c.image || SILHOUETTE;
  if (!c.image) photo.classList.add('silhouette');
  img.addEventListener('error', () => { img.src = SILHOUETTE; photo.classList.add('silhouette'); }, { once: true });
  photo.append(img);
  const plate = document.createElement('div');
  plate.className = 'plate';
  const { name, role } = plateText(c);
  plate.innerHTML = '<span class="plate-name"></span><span class="plate-role"></span>';
  plate.querySelector('.plate-name').textContent = name;
  plate.querySelector('.plate-role').textContent = `(${role})`;
  el.append(photo, plate);
  return el;
}

/** ზონები, რომლებსაც ჩარჩო არ უნდა ფარავდეს: „ესაუბრე სხვას“ (ქვედა მარჯვენა) და დაფა (ქვედა მარცხენა). */
function zonesFor(othersEl, boardEl) {
  return (W, H) => {
    const ob = othersEl.getBoundingClientRect();
    const bb = boardEl.getBoundingClientRect();
    const m = W < 700 ? 10 : 18;
    return [
      { name: 'others', x: W - ob.width - m, y: H - ob.height - m, w: ob.width, h: ob.height },
      { name: 'board', x: m, y: H - bb.height - m, w: bb.width, h: bb.height },
    ];
  };
}

export function createWall({ characters, wallCfg, onOpen }) {
  const wallEl = document.getElementById('wall');
  const framesEl = document.getElementById('frames');
  const crackEl = document.getElementById('crack');
  const othersEl = document.getElementById('others');
  const boardEl = document.getElementById('noticeboard');
  const topbar = document.getElementById('topbar');
  const onWall = characters.filter((c) => c.on_wall).sort((a, b) => b.content_score - a.content_score);
  const nodes = new Map();
  let layout = null;
  let crack = null;
  let seed = wallCfg.layout_seed;
  let stage = 0;

  for (const c of onWall) {
    const n = frameNode(c);
    n.addEventListener('click', () => onOpen(c.id, n));
    nodes.set(c.id, n);
    framesEl.append(n);
  }

  function render() {
    const W = document.documentElement.clientWidth;
    const H = window.innerHeight;
    const headerHeight = Math.ceil(topbar.getBoundingClientRect().height);
    layout = computeLayout({
      width: W, height: H, headerHeight, seed,
      items: onWall.map((c, i) => ({ id: c.id, rank: i })),
      zones: zonesFor(othersEl, boardEl),
    });
    wallEl.style.height = `${layout.height}px`;
    for (const f of layout.frames) {
      const n = nodes.get(f.id);
      n.style.left = `${f.x}px`;
      n.style.top = `${f.y}px`;
      n.style.width = `${f.w}px`;
      n.style.height = `${f.h}px`;
      n.style.setProperty('--rot', `${f.rotation.toFixed(2)}deg`);
      n.style.setProperty('--tilt-dir', f.rotation < 0 ? '-1' : '1');
      n.classList.toggle('small', f.tier === 2);
      n.dataset.tier = String(f.tier);
    }
    crack = generateCrack({
      width: layout.width, height: layout.height, top: headerHeight, seed,
      obstacles: layout.frames.map((f) => f.box),
    });
    drawCrack(crackEl, crack, layout.width, layout.height);
    // პირველი ჩვენება — ანიმაციის გარეშე
    crackEl.classList.add('no-anim');
    setStage(stage);
    void crackEl.getBoundingClientRect();
    crackEl.classList.remove('no-anim');
    window.tianshani = { ...(window.tianshani || {}), layout };
  }

  /** ბზარის საფეხური + 3–4 საფეხურზე ჩარჩოების დამატებითი გადახრა. */
  function setStage(s) {
    stage = s;
    setCrackStage(crackEl, s);
    const tiltCount = s >= 4 ? 3 : s >= 3 ? 2 : 0;
    const tilted = new Set(tiltCount && crack ? framesNearCrack(crack, layout.frames, tiltCount) : []);
    for (const [id, n] of nodes) n.classList.toggle('tilted', tilted.has(id));
  }

  function setSeed(newSeed) { seed = newSeed; render(); }

  let t = null;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(render, 150); });

  return {
    render, setStage, setSeed,
    frameNode: (id) => nodes.get(id) || null,
    get layout() { return layout; },
  };
}

/** განცხადებების დაფა: famous_roll_call_ka. */
export function renderRollCall(lines) {
  const ul = document.getElementById('rollcall');
  ul.replaceChildren(...lines.map((l) => { const li = document.createElement('li'); li.textContent = l; return li; }));
}

/**
 * „ესაუბრე სხვას“ მენიუ. variant 'wall' — დანარჩენები (კედელზე არმყოფნი); 'chat' — ყველა, გარდა მიმდინარისა.
 */
export function createOthersMenu({ characters, onPick }) {
  const menu = document.getElementById('others-menu');
  let anchor = null;

  function item(c) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'menu-item';
    b.setAttribute('role', 'option');
    b.dataset.id = c.id;
    b.innerHTML = '<span class="mi-name"></span><span class="mi-role"></span>';
    b.querySelector('.mi-name').textContent = c.short_name_ka;
    b.querySelector('.mi-role').textContent = c.role_short_ka;
    if (!c.reachable) b.classList.add('invisible');
    b.addEventListener('click', () => { close(); onPick(c.id); });
    return b;
  }
  function section(title, list) {
    if (!list.length) return [];
    const h = document.createElement('div');
    h.className = 'menu-section';
    h.textContent = title;
    return [h, ...list.map(item)];
  }

  function open(anchorEl, { variant = 'wall', exclude = null } = {}) {
    anchor = anchorEl;
    const byScore = (a, b) => b.content_score - a.content_score;
    const visible = characters.filter((c) => c.reachable && c.id !== exclude).sort(byScore);
    const invisible = characters.filter((c) => !c.reachable && c.id !== exclude).sort(byScore);
    const parts = variant === 'chat'
      ? [...section('კედელზე', visible.filter((c) => c.on_wall)), ...section('დანარჩენები', visible.filter((c) => !c.on_wall))]
      : section('დანარჩენები', visible.filter((c) => !c.on_wall));
    menu.replaceChildren(...parts, ...section('ვინც არასდროს ჩანს', invisible));
    menu.hidden = false;
    menu.dataset.variant = variant;
    position();
    anchor.setAttribute('aria-expanded', 'true');
    menu.querySelector('.menu-item')?.focus({ preventScroll: true });
  }
  function position() {
    const r = anchor.getBoundingClientRect();
    const mw = Math.min(340, window.innerWidth - 20);
    menu.style.width = `${mw}px`;
    const left = Math.min(window.innerWidth - mw - 10, Math.max(10, r.right - mw));
    const maxH = Math.max(160, r.top - 16);
    menu.style.left = `${left}px`;
    menu.style.maxHeight = `${Math.min(520, maxH)}px`;
    menu.style.top = `${Math.max(10, r.top - Math.min(menu.scrollHeight, Math.min(520, maxH)) - 8)}px`;
  }
  function close() {
    if (menu.hidden) return;
    menu.hidden = true;
    anchor?.setAttribute('aria-expanded', 'false');
  }
  function toggle(anchorEl, opts) { if (!menu.hidden && anchor === anchorEl) close(); else open(anchorEl, opts); }

  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !anchor?.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { close(); e.stopPropagation(); } }, true);
  window.addEventListener('resize', () => { if (!menu.hidden) position(); });

  return { open, close, toggle, isOpen: () => !menu.hidden };
}
