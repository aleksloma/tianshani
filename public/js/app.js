// აპლიკაციის ჩატვირთვა: მონაცემები, კედელი, ჩატი, კალენდარი და ხე, ზედა ზოლი.
import { clientId, storageAvailable, clearAllChats, setJSON, KEYS } from './storage.js';
import { createWall, createOthersMenu, renderRollCall } from './wall.js';
import { createChat } from './chat.js';
import {
  loadState, saveState, applyCharacterOpen, applyExchange, nextCycle, showIntertitle, collapseScene, LOST_COPY_NOTES,
} from './game.js';
import { withDefaults, dateFor, formatDateKa, SEASON_KA } from './calendar.js';
import { treeMarkup, updateTree } from './tree.js';

let cid = clientId();
function syncClientId(id) { cid = id; setJSON(KEYS.client, id); }

/** fetch X-Client-Id ჰედერით (სერვერზე cookie პრიორიტეტულია). */
function api(path, opts = {}) {
  return fetch(path, { ...opts, credentials: 'same-origin', headers: { ...(opts.headers || {}), 'X-Client-Id': cid } });
}

const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('ka-GE');

async function main() {
  const [data, state] = await Promise.all([
    api('/api/characters').then((r) => r.json()),
    api('/api/state').then((r) => r.json()).catch(() => null),
  ]);
  const cfg = data.config;
  const gameCfg = withDefaults(cfg.game);
  const byId = Object.fromEntries(data.characters.map((c) => [c.id, c]));
  let game = loadState(gameCfg);

  // --- ზედა ზოლი: ხე + tooltip, ბზარი, ეგზემპლარები, შენობა ---
  $('season-tree-slot').innerHTML = treeMarkup();
  const tree = $('season-tree');
  const treeBtn = $('stat-season');
  treeBtn.addEventListener('click', () => treeBtn.classList.toggle('open')); // მობილურზე შეხებით
  document.addEventListener('pointerdown', (e) => { if (!treeBtn.contains(e.target)) treeBtn.classList.remove('open'); });

  function renderStatus() {
    document.body.dataset.season = game.season;
    updateTree(tree, { season: game.season, progress: game.progress });
    const date = formatDateKa(dateFor(gameCfg, game.day));
    const crack = `${game.crackStage + 1}/${gameCfg.crack_stages}`;
    const left = gameCfg.copies - game.lostCopies;
    const copies = `${left}/${gameCfg.copies}`;
    $('season-tip').textContent = `${SEASON_KA[game.season] || game.season} · ${date} · ${game.daysLeft} დღე შემდეგ სეზონამდე · ბზარი ${crack} · ეგზემპლარი ${copies}`;
    treeBtn.setAttribute('aria-label', `სეზონი: ${SEASON_KA[game.season]}, ${date}`);
    $('crack-val').textContent = crack;
    $('copies-val').textContent = copies;
    const notes = LOST_COPY_NOTES.slice(0, game.lostCopies);
    $('copies-tip').textContent = notes.length ? notes.join(' · ') : 'ყველა ეგზემპლარი ჯერ ადგილზეა.';
    $('stat-copies').setAttribute('aria-label', `ეგზემპლარი ${copies}. ${$('copies-tip').textContent}`);
    $('cycle-val').textContent = String(game.cycle);
  }
  function renderTokens(remaining) {
    if (!remaining) return;
    const n = Math.min(remaining.input, remaining.output);
    $('tokens-val').textContent = `${fmt.format(n)} ტოკ.`;
  }
  // სერვერის cookie პრიორიტეტულია: localStorage-ის ID მას ვუსწორებთ
  if (state?.client_id && state.client_id !== cid) syncClientId(state.client_id);
  renderStatus();
  renderTokens(state?.remaining);
  if (data.wall_image) {
    const w = $('wall');
    w.style.setProperty('--wall-photo', `url("${new URL(data.wall_image, window.location.href).href}")`);
    w.classList.add('has-photo');
  }
  if (data.mock_notice) { $('mock-banner').textContent = data.mock_notice; $('mock-banner').hidden = false; }
  if (!storageAvailable()) $('storage-banner').hidden = false;
  renderRollCall(data.roll_call || []);

  // --- კედელი, მენიუ, ჩატი ---
  let chat = null;
  const menu = createOthersMenu({ characters: data.characters, onPick: (id) => (chat.isOpen() ? chat.switchTo(id) : chat.open(id)) });
  const wall = createWall({
    characters: data.characters,
    wallCfg: { ...cfg.wall, layout_seed: cfg.wall.layout_seed + game.cycle },
    onOpen: (id, node) => chat.open(id, node),
    wallPhoto: Boolean(data.wall_image),
    // „გრენლანდია“ ჩამოვარდა — ამ სესიაში პერსონაჟებმა იციან; გადატვირთვაზე ისევ ეკიდება (არ ინახება)
    painting: { fallen: false, onDrop: () => { game = { ...game, paintingFallen: true }; } },
  });
  // კედელზე არმყოფი პერსონაჟის პორტრეტი (შუაში მოსატანად)
  const buildFrame = (c) => {
    const n = document.createElement('div');
    n.className = 'frame';
    n.innerHTML = '<div class="photo"><img alt=""></div><div class="plate"><span class="plate-name"></span><span class="plate-role"></span></div>';
    const img = n.querySelector('img');
    img.src = c.image || 'assets/silhouette.svg';
    if (!c.image) n.querySelector('.photo').classList.add('silhouette');
    n.querySelector('.plate-name').textContent = c.short_name_ka;
    n.querySelector('.plate-role').textContent = `(${c.role_short_ka})`;
    return n;
  };

  /** სეზონის ცვლილება(ები) და/ან ჩამონგრევა — რაც კალენდარმა დააბრუნა. */
  async function playEvents(events) {
    for (const ev of events) {
      if (ev.type === 'season') {
        wall.setStage(game.crackStage);
        const p = showIntertitle(`${SEASON_KA[ev.season]}.`, 1500);
        setTimeout(renderStatus, 300); // ფონის ტონი და ხე შავი ეკრანის მიღმა იცვლება
        await p;
      } else if (ev.type === 'collapse') {
        wall.setStage(gameCfg.crack_stages - 1);
        await chat.close({ instant: true });
        await collapseScene();
        game = nextCycle(game, gameCfg);
        saveState(game);
        clearAllChats();
        wall.setPaintingFallen(false); // ახალ შენობაში სურათი ისევ ეკიდება
        wall.setSeed(cfg.wall.layout_seed + game.cycle); // ახალი შენობა — სხვა არეულობა
        wall.setStage(0);
        renderStatus();
        return true;
      }
    }
    renderStatus();
    return false;
  }

  /** ჩატი გაიხსნა — დრო მიდის (სხვა პერსონაჟი = +N დღე). */
  async function onOpened(id) {
    const { state: s, events } = applyCharacterOpen(game, gameCfg, id);
    game = { ...s, paintingFallen: game.paintingFallen };
    saveState(game);
    await playEvents(events);
  }

  /** პასუხი დასრულდა — სტატისტიკა (+ დღეები, თუ days_per_exchange > 0). */
  async function onExchange(id) {
    const { state: s, events } = applyExchange(game, gameCfg, id);
    game = { ...s, paintingFallen: game.paintingFallen };
    saveState(game);
    await playEvents(events);
  }

  chat = createChat({
    byId, api, wall, menu, buildFrame, onExchange, onOpened,
    getConfig: () => cfg,
    getGameState: () => game,
    onTokens: renderTokens,
  });

  $('others-btn').addEventListener('click', (e) => menu.toggle(e.currentTarget, { variant: 'wall' }));

  // ფონტები ჩაიტვირთა → ზომები შეიძლება შეიცვალა
  wall.render();
  document.fonts?.ready.then(() => wall.render());
  wall.setStage(game.crackStage);

  // ტესტებისა და დებაგისთვის (მხოლოდ წასაკითხად)
  window.tianshani = {
    ...(window.tianshani || {}),
    get game() { return { ...game }; },
    get layout() { return wall.layout; },
    chat,
    ready: true,
  };
  document.body.classList.add('ready');
}

main().catch((e) => {
  console.error(e);
  const b = $('mock-banner');
  b.textContent = 'ხაზი დაკავებულია. გვერდი ვერ ჩაიტვირთა — ცოტა ხანში სცადეთ.';
  b.hidden = false;
});
