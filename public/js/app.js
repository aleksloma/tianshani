// აპლიკაციის ჩატვირთვა: მონაცემები, კედელი, ჩატი, კალენდარი და ხე, ტოკენების მთვლელი, ლიმიტის ფანჯარა.
import { clientId, storageAvailable, clearAllChats, setJSON, KEYS, getUserName } from './storage.js';
import { createNameCard } from './userName.js';
import { createWall, createOthersMenu, renderRollCall } from './wall.js';
import { createChat } from './chat.js';
import {
  loadState, saveState, applyCharacterOpen, applyExchange, applyChatClose, nextCycle, showIntertitle, collapseScene, LOST_COPY_NOTES,
} from './game.js';
import { withDefaults, dateFor, formatDateKa, SEASON_KA } from './calendar.js';
import { treeMarkup, updateTree } from './tree.js';
import { usedPercent, formatPercentKa, percentLevel, tokensTipLine } from './format.js';
import { createLimitModal } from './limitModal.js';
import { createWallBackground } from './background.js';

let cid = clientId();
function syncClientId(id) { cid = id; setJSON(KEYS.client, id); }

/** fetch X-Client-Id ჰედერით (სერვერზე cookie პრიორიტეტულია). */
function api(path, opts = {}) {
  return fetch(path, { ...opts, credentials: 'same-origin', headers: { ...(opts.headers || {}), 'X-Client-Id': cid } });
}

const $ = (id) => document.getElementById(id);

async function main() {
  const [data, state] = await Promise.all([
    api('/api/characters').then((r) => r.json()),
    api('/api/state').then((r) => r.json()).catch(() => null),
  ]);
  const cfg = data.config;
  const gameCfg = withDefaults(cfg.game);
  const byId = Object.fromEntries(data.characters.map((c) => [c.id, c]));
  let game = loadState(gameCfg);
  const modal = createLimitModal();

  // --- ზედა ზოლი: ხე + tooltip (თარიღი), ბზარი, ეგზემპლარები, შენობა ---
  $('season-tree-slot').innerHTML = treeMarkup();
  const tree = $('season-tree');
  const treeBtn = $('stat-season');
  treeBtn.addEventListener('click', () => treeBtn.classList.toggle('open')); // მობილურზე შეხებით
  document.addEventListener('pointerdown', (e) => { if (!treeBtn.contains(e.target)) treeBtn.classList.remove('open'); });

  function renderStatus() {
    document.body.dataset.season = game.season;
    updateTree(tree, { season: game.season, progress: game.progress });
    const date = formatDateKa(dateFor(gameCfg, game.day)); // წლის გარეშე: „10 სექტემბერი“
    const crack = `${game.crackStage + 1}/${gameCfg.crack_stages}`;
    const left = gameCfg.copies - game.lostCopies;
    const copies = `${left}/${gameCfg.copies}`;
    // Round 2 §5: სეზონის სახელი აღარ ჩანს (ხე თავად არის სეზონი) — მთავარი ხაზი თარიღია
    $('season-tip-date').textContent = date;
    $('season-tip-meta').textContent = `ბზარი ${crack} · ეგზემპლარი ${copies}`;
    treeBtn.setAttribute('aria-label', `${date} (${SEASON_KA[game.season]})`);
    $('crack-val').textContent = crack;
    $('copies-val').textContent = copies;
    const notes = LOST_COPY_NOTES.slice(0, game.lostCopies);
    $('copies-tip').textContent = notes.length ? notes.join(' · ') : 'ყველა ეგზემპლარი ჯერ ადგილზეა.';
    $('stat-copies').setAttribute('aria-label', `ეგზემპლარი ${copies}. ${$('copies-tip').textContent}`);
    $('cycle-val').textContent = String(game.cycle);
    // Round 3 §6: ვიწრო ეკრანზე ბზარი/ეგზემპლარი/შენობა მხოლოდ ხის tooltip-შია (ეს ხაზი დესკტოპზე დამალულია)
    $('season-tip-cycle').textContent = `შენობა №${game.cycle}`;
  }

  // --- ტოკენები (Round 3 §3): რგოლი + „0,3 %“ — დახარჯული შემავალი ტოკენების წილი ამ პერიოდში.
  //     /api/state ჩატვირთვისას, done ყოველი პასუხის შემდეგ (Round 2 §1) ---
  let tokenInfo = { limits: state?.limits, period: state?.period, resets_at: state?.resets_at };
  const RING = 2 * Math.PI * 11;
  function renderTokens(info) {
    if (!info?.remaining) return;
    tokenInfo = { ...tokenInfo, ...Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined)) };
    const { remaining, limits } = tokenInfo;
    const limit = Number(limits?.input) || 0;
    const pct = usedPercent(limit - remaining.input, limit);
    $('tokens-pct').textContent = formatPercentKa(pct);
    $('tokens-pct').dataset.value = String(pct);
    $('tokens-ring').setAttribute('stroke-dasharray', `${((RING * pct) / 100).toFixed(2)} ${RING.toFixed(2)}`);
    $('stat-tokens').dataset.level = percentLevel(pct);
    $('tokens-tip').textContent = tokensTipLine(pct, tokenInfo.period, tokenInfo.resets_at);
    $('stat-tokens').setAttribute('aria-label', $('tokens-tip').textContent);
  }

  /** ლიმიტის/ბიუჯეტის მდგომარეობა სერვერიდან — გადატვირთვა ფანჯარას ვერ გვერდს აუვლის. */
  function applyLimitState(s) {
    if (!s) return;
    if (s.global?.exhausted) modal.block('global_budget', s.global.resets_at);
    else if (s.exhausted) modal.block('client_limit', s.resets_at ?? null);
    else if (modal.isBlocked()) modal.unblock();
  }

  // სერვერის cookie პრიორიტეტულია: localStorage-ის ID მას ვუსწორებთ
  if (state?.client_id && state.client_id !== cid) syncClientId(state.client_id);
  renderStatus();
  renderTokens(state);
  if (data.mock_notice) { $('mock-banner').textContent = data.mock_notice; $('mock-banner').hidden = false; }
  if (!storageAvailable()) $('storage-banner').hidden = false;
  renderRollCall(data.roll_call || []);

  // --- კედლის ფონი ბზარის საფეხურის მიხედვით (Round 2 §7) ---
  const background = createWallBackground(data.wall_backgrounds || (data.wall_image ? [data.wall_image] : []));
  background.set(game.crackStage, { instant: true });

  // --- კედელი, მენიუ, ჩატი ---
  let chat = null;
  let wall = null;
  const menu = createOthersMenu({
    characters: data.characters,
    onPick: (id) => (chat.isOpen() ? chat.switchTo(id) : chat.open(id)),
    isOnWall: (id) => Boolean(wall?.isOnWall(id)), // ამ ეკრანის ზომაზე (Round 3 §6)
  });
  wall = createWall({
    characters: data.characters,
    wallCfg: { ...cfg.wall, layout_seed: cfg.wall.layout_seed + game.cycle },
    onOpen: (id, node) => chat.open(id, node),
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

  /** სეზონის ცვლილება(ები) და/ან ჩამონგრევა — რაც კალენდარმა დააბრუნა. პასუხის დასრულების შემდეგ ეშვება. */
  async function playEvents(events) {
    for (const ev of events) {
      if (ev.type === 'season') {
        const p = showIntertitle(`${SEASON_KA[ev.season]}.`, 1500);
        setTimeout(() => { renderStatus(); background.set(game.crackStage); }, 300); // ფონი და ხე შავი ეკრანის მიღმა იცვლება
        await p;
      } else if (ev.type === 'collapse') {
        await chat.close({ instant: true, silent: true });
        await collapseScene();
        game = nextCycle(game, gameCfg);
        saveState(game);
        clearAllChats();
        wall.setPaintingFallen(false); // ახალ შენობაში სურათი ისევ ეკიდება
        wall.setSeed(cfg.wall.layout_seed + game.cycle); // ახალი შენობა — სხვა არეულობა
        background.set(0, { instant: true });
        renderStatus();
        return true;
      }
    }
    renderStatus();
    return false;
  }

  /** ჩატი გაიხსნა — დრო მიდის, თუ days_per_character_switch > 0 (Round 2-ის დეფოლტი 0). */
  async function onOpened(id) {
    const { state: s, events } = applyCharacterOpen(game, gameCfg, id);
    game = { ...s, paintingFallen: game.paintingFallen };
    saveState(game);
    await playEvents(events);
  }

  /** პასუხი დასრულდა — exchanges++ (სტატისტიკა); დრო მხოლოდ თუ days_per_exchange > 0 (Round 3: 0). */
  async function onExchange(id) {
    const { state: s, events } = applyExchange(game, gameCfg, id);
    game = { ...s, paintingFallen: game.paintingFallen };
    saveState(game);
    await playEvents(events);
  }

  /**
   * Round 3 §2: საუბარი დაიხურა (პანელი უკვე დაკეტილია, ჩარჩო კედელზეა) → +days_per_chat_close დღე, თუ გაცვლა შედგა.
   * tooltip-ის თარიღი მაშინვე ახლდება; სეზონის/ჩამონგრევის ეფექტები — მის მერე. true → შენობა ჩამოინგრა.
   */
  async function onClosed(id, exchanges) {
    const { state: s, events } = applyChatClose(game, gameCfg, id, exchanges);
    game = { ...s, paintingFallen: game.paintingFallen };
    saveState(game);
    $('season-tip-date').textContent = formatDateKa(dateFor(gameCfg, game.day));
    return playEvents(events);
  }

  chat = createChat({
    byId, api, wall, menu, buildFrame, onExchange, onOpened, onClosed,
    getConfig: () => cfg,
    getGameState: () => game,
    onTokens: renderTokens,
    limitModal: modal,
  });

  $('others-btn').addEventListener('click', (e) => menu.toggle(e.currentTarget, { variant: 'wall' }));

  // --- ავტორის სახელი (Round 3 §1): პირველ ვიზიტზე „საშვი“; ზოლში „ავტორი: ნინო ✎“ — დაჭერით იცვლება.
  //     Round 4 §1: სახელის გარეშე — „თქვენი სახელი ✎“ (არა „ავტორი: —“) ---
  function renderUser() {
    const n = getUserName();
    $('user-name').textContent = n || 'თქვენი სახელი';
    $('user-chip').classList.toggle('unnamed', !n);
    $('user-chip').setAttribute('aria-label', n ? `ავტორი: ${n}. სახელის შეცვლა` : 'სახელის მითითება');
    chat.refreshUser();
  }
  const nameCard = createNameCard({ onChange: renderUser });
  $('user-chip').addEventListener('click', () => (nameCard.isOpen() ? nameCard.close() : nameCard.open()));
  renderUser();

  // ფონტები ჩაიტვირთა → ზომები შეიძლება შეიცვალა
  wall.render();
  document.fonts?.ready.then(() => wall.render());

  // ლიმიტი/ბიუჯეტი — ფანჯარა მაშინვე, თუ ამოწურულია (ყველა ბრაუზერში, არა მხოლოდ წარუმატებელი გაგზავნის შემდეგ)
  applyLimitState(state);
  if (!getUserName() && !modal.isBlocked()) nameCard.open(); // სახელი ჯერ არ ვიცით

  // ტესტებისა და დებაგისთვის (მხოლოდ წასაკითხად)
  window.tianshani = {
    ...(window.tianshani || {}),
    get game() { return { ...game }; },
    get layout() { return wall.layout; },
    chat,
    modal,
    background,
    nameCard,
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
