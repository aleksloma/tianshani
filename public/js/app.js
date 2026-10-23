// აპლიკაციის ჩატვირთვა: მონაცემები, კედელი, ჩატი, თამაში, ზედა ზოლი.
import { clientId, storageAvailable, clearAllChats, setJSON, KEYS } from './storage.js';
import { createWall, createOthersMenu, renderRollCall } from './wall.js';
import { createChat } from './chat.js';
import {
  loadState, saveState, applyExchange, nextCycle, showIntertitle, collapseScene, SEASON_ICON, LOST_COPY_NOTES,
} from './game.js';

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
  const byId = Object.fromEntries(data.characters.map((c) => [c.id, c]));
  let game = loadState(cfg.game);

  // --- ზედა ზოლი ---
  function renderStatus() {
    document.body.dataset.season = game.season;
    $('season-ico').textContent = SEASON_ICON[game.season] || '';
    $('season-name').textContent = cfg.seasons_ka[game.season] || game.season;
    $('crack-val').textContent = `${game.crackStage + 1}/${cfg.game.crack_stages}`;
    const left = cfg.game.copies - game.lostCopies;
    $('copies-val').textContent = `${left}/${cfg.game.copies}`;
    const notes = LOST_COPY_NOTES.slice(0, game.lostCopies);
    $('copies-tip').textContent = notes.length ? notes.join(' · ') : 'ყველა ეგზემპლარი ჯერ ადგილზეა.';
    $('stat-copies').setAttribute('aria-label', `ეგზემპლარი ${left}/${cfg.game.copies}. ${$('copies-tip').textContent}`);
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
  if (data.wall_image) document.getElementById('wall').style.setProperty('--wall-photo', `url("${new URL(data.wall_image, window.location.href).href}")`);
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
  });
  // კედელზე არმყოფი პერსონაჟის პორტრეტი (შუაში მოსატანად)
  const buildFrame = (c) => {
    const tmp = document.createElement('div');
    const n = document.createElement('div');
    n.className = 'frame';
    n.innerHTML = '<div class="photo"><img alt=""></div><div class="plate"><span class="plate-name"></span><span class="plate-role"></span></div>';
    const img = n.querySelector('img');
    img.src = c.image || 'assets/silhouette.svg';
    if (!c.image) n.querySelector('.photo').classList.add('silhouette');
    n.querySelector('.plate-name').textContent = c.short_name_ka;
    n.querySelector('.plate-role').textContent = `(${c.role_short_ka})`;
    tmp.append(n);
    return n;
  };

  async function onExchange(id) {
    const { state: s, event } = applyExchange(game, cfg.game, id);
    game = s;
    saveState(game);
    if (event === 'season') {
      wall.setStage(game.crackStage);
      const p = showIntertitle(`${cfg.seasons_ka[game.season]}.`, 1500);
      setTimeout(renderStatus, 300); // ფონის ტონი შავი ეკრანის მიღმა იცვლება
      await p;
    } else if (event === 'collapse') {
      wall.setStage(game.crackStage);
      renderStatus();
      await chat.close({ instant: true });
      await collapseScene();
      game = nextCycle(game, cfg.game);
      saveState(game);
      clearAllChats();
      wall.setSeed(cfg.wall.layout_seed + game.cycle); // ახალი შენობა — სხვა არეულობა
      wall.setStage(0);
      renderStatus();
    } else {
      renderStatus();
    }
  }

  chat = createChat({
    byId, api, wall, menu, buildFrame, onExchange,
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
