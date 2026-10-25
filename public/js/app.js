// აპლიკაციის ჩატვირთვა: მონაცემები, კედელი, ჩატი, კალენდარი და ხე, ტოკენების მთვლელი, ლიმიტის ფანჯარა.
import { clientId, storageAvailable, clearAllChats, setJSON, KEYS, getUserName, migrateChats } from './storage.js';
import { createNameCard } from './userName.js';
import { createWall, createOthersMenu, renderRollCall } from './wall.js';
import { createChat } from './chat.js';
import {
  loadState, saveState, applyCharacterOpen, applyExchange, applyChatClose, nextCycle, freshState, showIntertitle, collapseScene,
} from './game.js';
import {
  loadCopies, saveCopies, initialCopies, existingCount, ledgerLines, applyStep, rngFactory, applyHandOver, applyReturn, applyNotReturned,
  verifyClaimsFor, markStraySeen,
} from './manuscript.js';
import { createResetControl } from './reset.js';
import { withDefaults, dateFor, formatDateKa, SEASON_KA } from './calendar.js';
import { createCopyNote } from './copyNote.js';
import { treeMarkup, updateTree } from './tree.js';
import { usedPercent, formatPercentKa, percentLevel, tokensTipLine, questionsLeft } from './format.js';
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
  migrateChats(); // Round 5 §1: ძველი `scripted: true` შეტყობინებები tianshani.chats-იდან იშლება
  const [data, state] = await Promise.all([
    api('/api/characters').then((r) => r.json()),
    api('/api/state').then((r) => r.json()).catch(() => null),
  ]);
  const cfg = data.config;
  const gameCfg = withDefaults(cfg.game);
  const byId = Object.fromEntries(data.characters.map((c) => [c.id, c]));
  let game = loadState(gameCfg);
  // Round 8: ხელნაწერის ეგზემპლარები (tianshani.copies) + ვინ როგორ კარგავს (სერვერის ცხრილი)
  const behaviour = data.manuscript_behaviour || {};
  let copies = loadCopies(gameCfg, game.cycle);
  const modal = createLimitModal();
  const copyNote = createCopyNote();

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
    // Round 8 §2: არსებული ეგზემპლარები / სულ (იკარგება მხოლოდ გადაცემული)
    const count = `${existingCount(copies)}/${gameCfg.copies}`;
    // Round 2 §5: სეზონის სახელი აღარ ჩანს (ხე თავად არის სეზონი) — მთავარი ხაზი თარიღია
    $('season-tip-date').textContent = date;
    $('season-tip-meta').textContent = `ბზარი ${crack} · ეგზემპლარი ${count}`;
    treeBtn.setAttribute('aria-label', `${date} (${SEASON_KA[game.season]})`);
    $('crack-val').textContent = crack;
    $('copies-val').textContent = count;
    // Round 8 §8.2–8.3: სია — tooltip-ში ერთ ხაზად, ფურცელზე და (ვიწრო ეკრანზე) ხის tooltip-ში ხაზ-ხაზ
    const lines = ledgerLines(copies, byId, gameCfg);
    $('copies-tip').textContent = lines.join(' · ');
    $('stat-copies').setAttribute('aria-label', `ეგზემპლარი ${count}. ${lines.join(' · ')}`);
    const items = () => lines.map((l) => { const li = document.createElement('li'); li.textContent = l; return li; });
    $('copy-ledger-list').replaceChildren(...items());
    $('season-tip-ledger').replaceChildren(...items());
    $('cycle-val').textContent = String(game.cycle);
    // Round 3 §6: ვიწრო ეკრანზე ბზარი/ეგზემპლარი/შენობა მხოლოდ ხის tooltip-შია (ეს ხაზი დესკტოპზე დამალულია)
    $('season-tip-cycle').textContent = `შენობა №${game.cycle}`;
  }

  /** Round 8: ეგზემპლარების ყოველი ცვლილება — შენახვა, ზოლი, სია, ჩატის ღილაკი. */
  function setCopies(next) {
    copies = next;
    saveCopies(copies);
    renderStatus();
    chat?.refreshCopies();
  }

  // --- Round 8 §8.3: ეგზემპლარების სია — #stat-copies-ზე დაჭერა / Enter / Space; Esc და გარეთ დაჭერა ხურავს ---
  const ledger = $('copy-ledger');
  const statCopies = $('stat-copies');
  ledger.querySelector('.ledger-title').textContent = `„ტიანშანი“ — ${gameCfg.copies} ეგზემპლარი`;
  function closeLedger() {
    if (ledger.hidden) return;
    ledger.classList.remove('show');
    ledger.hidden = true;
    statCopies.setAttribute('aria-expanded', 'false');
  }
  function openLedger() {
    const top = Math.ceil($('topbar').getBoundingClientRect().bottom);
    ledger.style.top = `${Math.max(0, top) + 10}px`;
    ledger.hidden = false;
    // #stat-copies-ის ქვეშ, ეკრანის ფარგლებში
    const s = statCopies.getBoundingClientRect();
    const w = ledger.offsetWidth;
    ledger.style.left = `${Math.round(Math.min(window.innerWidth - w - 16, Math.max(16, s.left + s.width / 2 - w / 2)))}px`;
    void ledger.offsetWidth;
    ledger.classList.add('show');
    statCopies.setAttribute('aria-expanded', 'true');
  }
  const toggleLedger = () => (ledger.hidden ? openLedger() : closeLedger());
  statCopies.addEventListener('click', toggleLedger);
  statCopies.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleLedger(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLedger(); });
  document.addEventListener('pointerdown', (e) => { if (!ledger.contains(e.target) && !statCopies.contains(e.target)) closeLedger(); });

  // --- ლიმიტი (Round 3 §3): რგოლი + „0,3 %“ — დახარჯული შემავალი ტოკენების წილი ამ პერიოდში.
  //     Round 4 §3: tooltip ადამიანის ენით — „კითხვების ლიმიტის … · დარჩა დაახლოებით N კითხვა“
  //     (N = დარჩენილი / ამ ბრაუზერის საშუალო ერთ კითხვაზე). /api/state ჩატვირთვისას, done ყოველი პასუხის შემდეგ ---
  let tokenInfo = { limits: state?.limits, period: state?.period, resets_at: state?.resets_at, avg_input_per_request: state?.avg_input_per_request ?? null };
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
    const left = questionsLeft(remaining.input, tokenInfo.avg_input_per_request);
    $('stat-tokens').dataset.left = String(left.n);
    $('tokens-tip').textContent = tokensTipLine(pct, tokenInfo.period, tokenInfo.resets_at, left);
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

  /**
   * სეზონის ცვლილება(ები) და/ან ჩამონგრევა — რაც კალენდარმა დააბრუნა. ჩატის დახურვის შემდეგ ეშვება.
   * notes — Round 8 §8.4: ამ ნაბიჯის ეგზემპლარების მოვლენები (მფლობელის სიტყვები) — ინტერტიტრის შემდეგ, რიგით (მაქს. 3).
   */
  async function playEvents(events, notes = []) {
    for (const ev of events) {
      if (ev.type === 'season') {
        const p = showIntertitle(`${SEASON_KA[ev.season]}.`, 1500, { season: ev.season }); // Round 9 §3: კედელზე, სეზონის ფერით
        setTimeout(() => { renderStatus(); background.set(game.crackStage); }, 300); // ფონი და ხე შავი ეკრანის მიღმა იცვლება
        await p;
      } else if (ev.type === 'collapse') {
        await chat.close({ instant: true, silent: true });
        await collapseScene();
        game = nextCycle(game, gameCfg);
        saveState(game);
        clearAllChats();
        // Round 8 §9: ახალი შენობა — სამი ახალი ეგზემპლარი ხელში, ფურცლების გარეშე
        copies = initialCopies(gameCfg, game.cycle);
        saveCopies(copies);
        wall.setPaintingFallen(false); // ახალ შენობაში სურათი ისევ ეკიდება
        wall.setSeed(cfg.wall.layout_seed + game.cycle); // ახალი შენობა — სხვა არეულობა
        background.set(0, { instant: true });
        renderStatus();
        return true;
      }
    }
    renderStatus();
    const lines = notes.slice(0, 3).map((n) => `${byId[n.character]?.short_name_ka || n.character}: ${n.text_ka}`);
    if (lines.length) copyNote.queue(lines);
    return false;
  }

  /** ჩატი გაიხსნა — დრო მიდის, თუ days_per_character_switch > 0 (Round 2-ის დეფოლტი 0). */
  async function onOpened(id) {
    closeLedger();
    // Round 8 §5.3 / §4.6: T-სთან საუბარი — მასზე ნათქვამი გადამოწმდა; მისი ფურცლები სიაში ჩანს
    const next = markStraySeen(verifyClaimsFor(copies, id, byId), id);
    if (next !== copies) setCopies(next);
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

  /** Round 8 §3.3: სერვერის გადაწყვეტილება (done.action_result) → ეგზემპლარების მდგომარეობა. */
  function onAction(id, r) {
    if (r.outcome === 'accepted') setCopies(applyHandOver(copies, r.copyId, id, game.day));
    else if (r.outcome === 'returned') setCopies(applyReturn(copies, r.copyId));
    else if (r.outcome === 'not_returned') setCopies(applyNotReturned(copies, r.copyId));
  }

  /**
   * Round 3 §2: საუბარი დაიხურა (პანელი უკვე დაკეტილია, ჩარჩო კედელზეა) → +days_per_chat_close დღე, თუ გაცვლა შედგა.
   * tooltip-ის თარიღი მაშინვე ახლდება; სეზონის/ჩამონგრევის ეფექტები — მის მერე. true → შენობა ჩამოინგრა.
   */
  async function onClosed(id, exchanges) {
    const prevDay = game.day;
    const { state: s, events } = applyChatClose(game, gameCfg, id, exchanges);
    // Round 4 §5: ჩამოვარდნილი „გრენლანდია“ ჩატის დახურვისას ისევ თავის ლურსმანზეა (როგორც ჩარჩოები — Round 1 §1)
    if (game.paintingFallen) wall.setPaintingFallen(false);
    game = { ...s, paintingFallen: false };
    saveState(game);
    $('season-tip-date').textContent = formatDateKa(dateFor(gameCfg, game.day));
    // Round 8 §4.1: დრო წავიდა (და შენობა არ ჩამონგრეულა) → ერთი ნაბიჯი ეგზემპლარებისთვის
    let notes = [];
    if (game.day !== prevDay && !events.some((e) => e.type === 'collapse')) {
      const r = applyStep(copies, gameCfg, behaviour, game.day, rngFactory(cid, game.cycle, game.day), byId);
      notes = r.notes;
      copies = r.store;
      saveCopies(copies);
    }
    return playEvents(events, notes);
  }

  chat = createChat({
    byId, api, wall, menu, buildFrame, onExchange, onOpened, onClosed,
    getConfig: () => cfg,
    getGameState: () => game,
    onTokens: renderTokens,
    limitModal: modal,
    getCopies: () => copies,
    onAction,
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

  // --- Round 5 §2: „ყველაფრის განულება“ — საუბრები და შენობა თავიდან; სახელი, client_id და სერვერის მთვლელები რჩება ---
  async function resetAll() {
    await chat.forgetAll();
    copyNote.hide();
    clearAllChats();
    game = freshState(gameCfg);
    saveState(game);
    copies = initialCopies(gameCfg, game.cycle); // Round 8 §9
    saveCopies(copies);
    closeLedger();
    wall.setPaintingFallen(false);
    wall.setSeed(cfg.wall.layout_seed + game.cycle);
    background.set(game.crackStage, { instant: true });
    renderStatus();
  }
  const resetControl = createResetControl({ onConfirm: resetAll, beforeOpen: () => nameCard.close() });

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
    resetControl,
    resetAll,
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
