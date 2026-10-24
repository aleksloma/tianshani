// კედელი: ჩარჩოების რენდერი computeLayout-ის მიხედვით, „ესაუბრე სხვას“ მენიუ, განცხადებების დაფა.
// Round 2 §7: დახატული SVG ბზარი ამოღებულია — ბზარი ახლა კედლის ფოტოებშია (background.js, wall.background_by_stage).
import { computeLayout, sizeClass } from './layout.js';

export const SILHOUETTE = 'assets/silhouette.svg';

// „გრენლანდია“ — ვასოს თავზე ჩამოკიდებული სურათი (public/assets/painting.webp, 760×539, ჩარჩოიანი, გამჭვირვალე კიდეებით)
export const PAINTING = { id: 'painting', src: 'assets/painting.webp', size: { w: 450, mw: 250, aspect: 539 / 760 }, rot: [2.5, 4] };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ფირფიტაზე გრძელი სიტყვა (მაგ. „მარკშეიდერი“) — შრიფტი მცირდება, სანამ არ ჩაეტევა. */
export function fitText(el, min = 8.5, { height = false } = {}) {
  if (!el || !el.clientWidth) return; // დამალული ჩარჩო — გაზომვა შეუძლებელია
  el.style.fontSize = '';
  let size = parseFloat(getComputedStyle(el).fontSize);
  // სიგანე (გრძელი სიტყვა); ვიწრო ეკრანზე სიმაღლეც (2 ხაზზე მეტი — line-clamp ჩუმად „…“-ს დაწერდა) — სახელი არასდროს იჭრება.
  // დესკტოპზე სიმაღლის შემოწმება გამორთულია, რომ დამტკიცებული დესკტოპი პიქსელამდე უცვლელი დარჩეს (Round 3 §6).
  const over = () => el.scrollWidth > el.clientWidth + 0.5 || (height && el.scrollHeight > el.clientHeight + 0.5);
  while (over() && size > min) {
    size -= 0.5;
    el.style.fontSize = `${size}px`;
  }
}

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
    const bb = boardEl.getBoundingClientRect(); // ვიწრო ეკრანზე — მხოლოდ დაკეცილი „ხატულა“ (გაშლილი სია მის გარეთ ჩანს)
    const m = W < 700 ? 10 : 18;
    return [
      { name: 'others', x: W - ob.width - m, y: H - ob.height - m, w: ob.width, h: ob.height },
      { name: 'board', x: m, y: H - bb.height - m, w: bb.width, h: bb.height },
    ];
  };
}

/** ნახატის ელემენტი + მისი „კვალი“ კედელზე (ჩამოვარდნის შემდეგ). */
function paintingNodes() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'painting';
  btn.className = 'painting';
  btn.title = 'გრენლანდია. ოცდაშვიდი წელია ყანყალებს…';
  btn.setAttribute('aria-label', 'სურათი „გრენლანდია“ — ყანყალებს. დააჭირეთ და ჩამოვარდება');
  const img = document.createElement('img');
  img.src = PAINTING.src;
  img.alt = '';
  btn.append(img);
  const ghost = document.createElement('div');
  ghost.className = 'painting-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.innerHTML = '<i class="nail"></i><i class="nail"></i>';
  return { btn, ghost };
}

export function createWall({ characters, wallCfg, onOpen, painting = { fallen: false, onDrop: () => {} } }) {
  const wallEl = document.getElementById('wall');
  const framesEl = document.getElementById('frames');
  const othersEl = document.getElementById('others');
  const boardEl = document.getElementById('noticeboard');
  const topbar = document.getElementById('topbar');
  const onWall = characters.filter((c) => c.on_wall).sort((a, b) => b.content_score - a.content_score);
  const nodes = new Map();
  let layout = null;
  let seed = wallCfg.layout_seed;
  let fallen = Boolean(painting.fallen);
  let dropping = false;

  const pn = paintingNodes();
  framesEl.append(pn.ghost, pn.btn);
  pn.btn.addEventListener('click', () => drop());
  let cls = 'desktop';
  let visible = new Set(onWall.map((c) => c.id));

  /** Round 3 §6: რამდენი ჩარჩო ეკიდოს — ტელეფონზე 6, პლანშეტზე 9, დესკტოპზე ყველა (characters_on_wall). */
  function countFor(c) {
    if (c === 'phone') return Number(wallCfg.characters_on_wall_mobile) || 6;
    if (c === 'tablet') return Number(wallCfg.characters_on_wall_tablet) || 9;
    return onWall.length;
  }

  // განცხადებების დაფა ვიწრო ეკრანზე — პატარა მიმაგრებული ფურცელი, შეხებით იშლება
  const boardToggle = document.getElementById('noticeboard-toggle');
  boardToggle?.addEventListener('click', () => {
    const open = !boardEl.classList.contains('open');
    boardEl.classList.toggle('open', open);
    boardToggle.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('pointerdown', (e) => {
    if (boardEl.classList.contains('open') && !boardEl.contains(e.target)) {
      boardEl.classList.remove('open');
      boardToggle?.setAttribute('aria-expanded', 'false');
    }
  });

  for (const c of onWall) {
    const n = frameNode(c);
    n.addEventListener('click', () => onOpen(c.id, n));
    nodes.set(c.id, n);
    framesEl.append(n);
  }

  /** ნახატის მდგომარეობა DOM-ში (ჩამოკიდებული / ჩამოვარდნილი). */
  function showPainting() {
    pn.btn.hidden = fallen;
    pn.ghost.hidden = !fallen;
    pn.btn.getAnimations().forEach((a) => a.cancel());
    pn.btn.style.opacity = '';
  }

  /** ჯერ ერთი ლურსმანი უშვებს (გადაიხრება), მერე ვარდება და ქრება. */
  async function drop() {
    if (fallen || dropping) return;
    dropping = true;
    pn.btn.classList.add('dropping');
    const f = layout.frames.find((x) => x.id === PAINTING.id);
    const rot = f.rotation;
    const dir = rot < 0 ? -1 : 1;
    const slip = pn.btn.animate([
      { transform: `rotate(${rot}deg)` },
      { transform: `translateY(8px) rotate(${rot + 10 * dir}deg)`, offset: 0.4 },
      { transform: `translateY(5px) rotate(${rot + 6 * dir}deg)`, offset: 0.65 },
      { transform: `translateY(12px) rotate(${rot + 15 * dir}deg)` },
    ], { duration: 700, easing: 'ease-out', fill: 'forwards' });
    await slip.finished;
    plasterPuff(f);
    const fallPx = Math.max(window.innerHeight, layout.height) - f.y + 200;
    const fall = pn.btn.animate([
      { transform: `translateY(12px) rotate(${rot + 15 * dir}deg)`, opacity: 1 },
      { transform: `translateY(${fallPx}px) rotate(${rot + 38 * dir}deg)`, opacity: 0.85 },
    ], { duration: 950, easing: 'cubic-bezier(.45,0,1,.55)', fill: 'forwards' });
    await fall.finished;
    fallen = true;
    dropping = false;
    pn.btn.classList.remove('dropping');
    showPainting();
    painting.onDrop(); // მდგომარეობა მაშინვე ინახება
    // დარტყმა იატაკზე
    document.body.classList.add('thud');
    await sleep(260);
    document.body.classList.remove('thud');
  }

  /** ცოტა ბათქაში იქიდან, სადაც სურათი ეკიდა. */
  function plasterPuff(f) {
    for (let i = 0; i < 18; i++) {
      const p = document.createElement('i');
      p.className = 'puff';
      p.style.left = `${f.x + f.w * (0.1 + Math.random() * 0.8)}px`;
      p.style.top = `${f.y + Math.random() * 10}px`;
      p.style.setProperty('--drift', `${(Math.random() - 0.5) * 60}px`);
      p.style.animationDelay = `${Math.random() * 0.3}s`;
      framesEl.append(p);
      setTimeout(() => p.remove(), 2200);
    }
  }

  function render() {
    const W = document.documentElement.clientWidth;
    const H = window.innerHeight;
    // ზომის კლასი — window.innerWidth-ით, ზუსტად ისე, როგორც CSS media query-ები ითვლის
    cls = sizeClass(window.innerWidth);
    const shown = onWall.slice(0, countFor(cls));
    visible = new Set(shown.map((c) => c.id));
    for (const [id, n] of nodes) n.hidden = !visible.has(id);
    const narrow = cls !== 'desktop';
    boardEl.classList.toggle('collapsed', narrow);
    if (!narrow) { boardEl.classList.remove('open'); boardToggle?.setAttribute('aria-expanded', 'false'); }
    const headerHeight = Math.ceil(topbar.getBoundingClientRect().height);
    layout = computeLayout({
      width: W, height: H, headerHeight, seed, sizeClass: cls,
      // ნახატი ჩამოვარდნის შემდეგაც ინახავს ადგილს — კედელზე ღია ლაქა რჩება, სხვები არ ხტებიან
      items: [{ id: PAINTING.id, rank: -1, size: PAINTING.size, rot: PAINTING.rot }, ...shown.map((c, i) => ({ id: c.id, rank: i }))],
      zones: zonesFor(othersEl, boardEl),
    });
    wallEl.style.height = `${layout.height}px`;
    for (const f of layout.frames) {
      // ჩარჩოს მხოლოდ განლაგების left/top/size/--rot ეწერება; ცენტრში ყოფნის კვალი (lifted) აქ არ იცვლება
      if (f.id === PAINTING.id) {
        for (const el of [pn.btn, pn.ghost]) {
          Object.assign(el.style, { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` });
          el.style.setProperty('--rot', `${f.rotation.toFixed(2)}deg`);
        }
        continue;
      }
      const n = nodes.get(f.id);
      n.style.left = `${f.x}px`;
      n.style.top = `${f.y}px`;
      n.style.width = `${f.w}px`;
      n.style.height = `${f.h}px`;
      n.style.setProperty('--rot', `${f.rotation.toFixed(2)}deg`);
      n.classList.toggle('small', f.tier === 2);
      n.dataset.tier = String(f.tier);
      if (narrow) fitText(n.querySelector('.plate-name'), 9.5, { height: true });
      else fitText(n.querySelector('.plate-name'));
    }
    showPainting();
    window.tianshani = { ...(window.tianshani || {}), layout };
  }

  function setSeed(newSeed) { seed = newSeed; render(); }

  /** ახალ შენობაში სურათი ისევ ეკიდება. */
  function setPaintingFallen(v) { fallen = Boolean(v); showPainting(); }

  let t = null;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(render, 150); });

  return {
    render, setSeed, setPaintingFallen, dropPainting: drop,
    // ამ ზომაზე კედელზე არმყოფი (დამალული) ჩარჩო „არ არსებობს“ — ჩატი პორტრეტს ახლიდან აწყობს
    frameNode: (id) => (visible.has(id) ? nodes.get(id) || null : null),
    isOnWall: (id) => visible.has(id),
    sizeClass: () => cls,
    get layout() { return layout; },
  };
}

/** განცხადებების დაფა: famous_roll_call_ka. */
export function renderRollCall(lines) {
  const ul = document.getElementById('rollcall');
  ul.replaceChildren(...lines.map((l) => { const li = document.createElement('li'); li.textContent = l; return li; }));
}

/** მენიუს რიგი (Round 2 §6): ქულის კლებით; თანაბარ ქულაზე — ხილული ჯერ, უხილავი (appears ≠ on_screen) ბოლოს. */
export function menuOrder(list) {
  return [...list].sort((a, b) => (b.content_score - a.content_score) || (Number(b.reachable) - Number(a.reachable)));
}

/**
 * „ესაუბრე სხვას“ მენიუ — ერთი ბრტყელი სია ფოტოებით (Round 2 §6): ჯგუფების, ხაზების და 🔒-ის გარეშე.
 * variant 'wall' — კედელზე არმყოფნი; 'chat' — ყველა, გარდა მიმდინარისა.
 */
export function createOthersMenu({ characters, onPick, isOnWall = (id) => characters.find((c) => c.id === id)?.on_wall }) {
  const menu = document.getElementById('others-menu');
  let anchor = null;

  function item(c) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'menu-item';
    b.setAttribute('role', 'option');
    b.dataset.id = c.id;
    const img = document.createElement('img');
    img.className = 'mi-thumb';
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 40;
    img.height = 40;
    img.src = c.image || SILHOUETTE;
    if (!c.image) img.classList.add('silhouette');
    img.addEventListener('error', () => { img.src = SILHOUETTE; img.classList.add('silhouette'); }, { once: true });
    const text = document.createElement('span');
    text.className = 'mi-text';
    text.innerHTML = '<span class="mi-name"></span><span class="mi-role"></span>';
    text.querySelector('.mi-name').textContent = c.short_name_ka;
    text.querySelector('.mi-role').textContent = c.role_short_ka;
    b.append(img, text);
    b.addEventListener('click', () => { close(); onPick(c.id); });
    return b;
  }

  function open(anchorEl, { variant = 'wall', exclude = null } = {}) {
    anchor = anchorEl;
    // „კედელზე“ — ამ ეკრანის ზომაზე (Round 3 §6: ტელეფონზე 6, პლანშეტზე 9) — დანარჩენი სიაშია
    const pool = characters.filter((c) => c.id !== exclude && (variant === 'chat' || !isOnWall(c.id)));
    menu.replaceChildren(...menuOrder(pool).map(item));
    menu.hidden = false;
    menu.dataset.variant = variant;
    position();
    anchor.setAttribute('aria-expanded', 'true');
    menu.querySelector('.menu-item')?.focus({ preventScroll: true });
  }
  function position() {
    // ვიწრო ეკრანზე — სრული სიგანის „ქვედა ფურცელი“ (bottom sheet); ზომა/ადგილი CSS-შია
    const sheet = sizeClass(window.innerWidth) !== 'desktop';
    menu.classList.toggle('sheet', sheet);
    if (sheet) {
      for (const k of ['left', 'top', 'width', 'maxHeight']) menu.style[k] = '';
      return;
    }
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
