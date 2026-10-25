// ჩატის პანელი: ჩარჩო ცენტრში და უკან (FLIP), სტრიმინგი (SSE fetch-ით), სცენური რემარკები,
// უხილავთა წარმომადგენლები („~~გივი~~ სოსო“ + თამბნეილი + „პასუხობს: სოსო“), გადამისამართების ღილაკი.
import { getChat, saveChat, clearChat, getUserName } from './storage.js';
import { renderSegments } from './stage.js';
import { sizeClass } from './layout.js';
import { fitText } from './wall.js';
import { parseSseChunk, tokensFromDone } from './sse.js';
import { historyForServer } from './history.js';
import { toward } from './names.js';
import {
  buttonMode, statusLines, bestCopyInHand, retrievableFrom, actionText, summaryForServer,
  MODE_ATTR, ACTION_ICONS, attachText, actionMessage, attachmentValid,
} from './manuscript.js';

const TYPING = ['…ფიქრობს', '…ტელეფონზეა', '…საუზმობს', '…რეზოლუციას წერს', '…ბზარს უყურებს', '…ყურმილს იღებს'];
const TYPING_ABSENT = ['…კარს აკაკუნებენ', '…ვიღაც მოდის დერეფანში', '…ხაზი დაკავებულია', '…დაელოდეთ'];
export const MSG_API_ERROR = 'ხაზი დაკავებულია. ცოტა ხანში სცადეთ.';
const ANIM_MS = 420;
const EASE_IN = 'cubic-bezier(.2,.8,.2,1)';
const EASE_OUT = 'cubic-bezier(.5,0,.3,1)';
const SILHOUETTE = 'assets/silhouette.svg';

/** „-სთან“: თინა → თინასთან, ოთარი → ოთართან, გივი → გივისთან (Round 7 §1: public/js/names.js). */
export function withName(c) {
  return toward(c.short_name_ka);
}

/** წარმომადგენლის აქცენტის ფერი (id-დან, სტაბილური). */
export function accentFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 42% 34%)`;
}

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Round 8 §3.1: ღილაკის წარწერა რეჟიმის მიხედვით. */
const COPY_LABELS = { hand_over: 'ეგზემპლარის გადაცემა', retrieve: 'ეგზემპლარის გამორთმევა' };
/** Round 9 §1: ველის placeholder, სანამ მოქმედება მიმაგრებულია. */
export const ATTACH_PLACEHOLDER = 'მიაყოლეთ სიტყვა, თუ გსურთ…';
const NORMAL_PLACEHOLDER = 'დაწერეთ…';

export function createChat({
  byId, api, getConfig, getGameState, onExchange, onOpened, onClosed = null, onTokens, wall, menu, buildFrame, limitModal = null,
  getCopies = null, onAction = null,
}) {
  const panel = document.getElementById('chat');
  const backdrop = document.getElementById('chat-backdrop');
  const log = document.getElementById('chat-log');
  const nameEl = document.getElementById('chat-name');
  const roleEl = document.getElementById('chat-role');
  const subEl = document.getElementById('chat-sub');
  const userEl = document.getElementById('chat-user');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const copyBtn = document.getElementById('chat-copy');
  const copyStatus = document.getElementById('chat-copy-status');
  const attachRow = document.getElementById('chat-attach');
  const attachIco = attachRow.querySelector('.chat-attach-ico');
  const attachTextEl = document.getElementById('chat-attach-text');
  const attachRemove = document.getElementById('chat-attach-remove');
  let attached = null;    // Round 9 §1: { type, copyId, integrity } — ველზე მიმაგრებული მოქმედება (ერთდროულად ერთი)

  let current = null;     // { id, portrait, source, exchanges } — მხოლოდ მეხსიერებაში, არასდროს ინახება
  let session = 0;        // ღია ჩატის „ვერსია“ — სტრიმი ძველ ჩატს DOM-ში აღარ წერს
  let epoch = 0;          // Round 5 §2: „ყველაფრის განულების“ შემდეგ ძველი სტრიმი ისტორიაში/კალენდარში აღარ წერს
  const busy = new Set(); // პერსონაჟები, ვისთანაც პასუხი მიდის

  // ---------- წარმომადგენელი ----------

  /** ვინ პასუხობს ახლა უხილავის ნაცვლად: ბოლო მოპასუხე, ან სიის პირველი (სანამ პირველი პასუხი მოვა). */
  function currentProxy(id) {
    const c = byId[id];
    if (!c || c.reachable) return null;
    return lastSpokenBy(id) || c.proxies?.[0] || null;
  }

  function lastSpokenBy(id) {
    const msgs = getChat(id);
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].spoken_by) return msgs[i].spoken_by;
    return null;
  }

  function thumb(proxyId, size = 24) {
    const p = byId[proxyId];
    const img = document.createElement('img');
    img.className = 'thumb';
    img.alt = '';
    img.width = size;
    img.height = size;
    img.src = p?.image || SILHOUETTE;
    return img;
  }

  /** სახელის ელემენტი: ხილულისთვის სახელი; უხილავისთვის [თამბნეილი] ~~უხილავი~~ **წარმომადგენელი**. */
  function whoNode(targetId, spokenBy, { header = false } = {}) {
    const target = byId[targetId];
    const span = document.createElement('span');
    span.className = 'who';
    if (target.reachable) {
      span.textContent = target.short_name_ka;
      return span;
    }
    const proxyId = spokenBy && byId[spokenBy] ? spokenBy : null;
    span.classList.add('proxied');
    if (!header && proxyId) span.append(thumb(proxyId));
    const s = document.createElement('s');
    s.className = 'struck';
    s.textContent = target.short_name_ka;
    span.append(s, ' ');
    const real = document.createElement('b');
    real.className = 'real';
    real.textContent = proxyId ? byId[proxyId].short_name_ka : '…';
    if (proxyId) real.style.setProperty('--accent', accentFor(proxyId));
    span.append(real);
    return span;
  }

  /** სათაური + ქვესათაური + პორტრეტის „პასუხობს: X“ ბეჯი. */
  function setSpeaker(id, spokenBy) {
    const c = byId[id];
    nameEl.replaceChildren(whoNode(id, spokenBy, { header: true }));
    roleEl.textContent = c.role_ka;
    panel.classList.toggle('absent', !c.reachable);
    const proxy = !c.reachable && spokenBy && byId[spokenBy] ? byId[spokenBy] : null;
    subEl.hidden = !proxy;
    subEl.textContent = proxy ? `${c.short_name_ka} ადგილზე არ არის — ${proxy.short_name_ka} პასუხობს მის ნაცვლად` : '';
    if (current?.id === id) setBadge(current.portrait, proxy);
  }

  /** Round 3 §9: სათაურში პატარად — ვის მიმართავს პერსონაჟი. */
  function refreshUser() {
    const n = getUserName();
    userEl.hidden = !n;
    userEl.textContent = n ? `საუბრობს: ${n}` : '';
  }

  /**
   * Round 8 §3.1–3.2: ეგზემპლარის ღილაკი (გადაცემა / გამორთმევა / დამალული) და სათაურის ხაზი.
   * იძახება ჩატის გახსნისას, პასუხის შემდეგ და ეგზემპლარების ყოველი ცვლილებისას.
   */
  function refreshCopies() {
    const store = getCopies?.();
    const c = current ? byId[current.id] : null;
    // მიმაგრებისას რეჟიმი ფიქსირდება (ღილაკი მისი მოხსნისთვისაა)
    const mode = attached ? attached.type : (store && c ? buttonMode(store, c.id, c.reachable) : null);
    copyBtn.hidden = !mode;
    // Round 9 §2: რეჟიმს ხატულა და data-mode ატარებს
    if (mode && copyBtn.dataset.mode !== MODE_ATTR[mode]) copyBtn.querySelector('.ico').innerHTML = ACTION_ICONS[MODE_ATTR[mode]];
    if (mode) copyBtn.dataset.mode = MODE_ATTR[mode]; else delete copyBtn.dataset.mode;
    copyBtn.setAttribute('aria-label', mode ? COPY_LABELS[mode] : '');
    copyBtn.title = mode ? COPY_LABELS[mode] : '';
    copyBtn.disabled = Boolean(current && busy.has(current.id));
    const line = store && c ? statusLines(store, c.id, getGameState().day, byId) : '';
    copyStatus.hidden = !line;
    copyStatus.textContent = line;
  }

  // ---------- Round 9 §1: მიმაგრება ----------

  /** placeholder: მიმაგრებისას — „მიაყოლეთ სიტყვა…“ (თუ ლიმიტის ფანჯარა ველს არ კეტავს); სხვა დროს — ჩვეულებრივი. */
  function applyPlaceholder() {
    if (limitModal?.isBlocked()) return; // limitModal.applyInput უკვე დააყენა
    input.setAttribute('placeholder', attached ? ATTACH_PLACEHOLDER : NORMAL_PLACEHOLDER);
  }

  /** ღილაკის მიმდინარე რეჟიმის მოქმედება → ფურცელი ველის თავზე. */
  function attach() {
    const c = current ? byId[current.id] : null;
    const store = getCopies?.();
    const mode = c && store ? buttonMode(store, c.id, c.reachable) : null;
    const copy = mode === 'retrieve' ? retrievableFrom(store, c.id) : mode === 'hand_over' ? bestCopyInHand(store) : null;
    if (!copy) return;
    attached = { type: mode, copyId: copy.id, integrity: copy.integrity };
    attachIco.innerHTML = ACTION_ICONS[MODE_ATTR[mode]];
    attachTextEl.textContent = attachText(mode, copy.id, copy.integrity);
    attachRow.hidden = false;
    copyBtn.classList.add('armed');
    copyBtn.setAttribute('aria-pressed', 'true');
    applyPlaceholder();
    refreshCopies();
  }

  function detach() {
    if (!attached) return;
    attached = null;
    attachRow.hidden = true;
    attachTextEl.textContent = '';
    attachIco.replaceChildren();
    copyBtn.classList.remove('armed');
    copyBtn.setAttribute('aria-pressed', 'false');
    applyPlaceholder();
    refreshCopies();
  }

  function setBadge(portrait, proxy) {
    portrait.querySelector('.proxy-badge')?.remove();
    if (!proxy) return;
    const b = document.createElement('div');
    b.className = 'proxy-badge';
    b.style.setProperty('--accent', accentFor(proxy.id));
    const cap = document.createElement('span');
    cap.className = 'cap';
    cap.textContent = `პასუხობს: ${proxy.short_name_ka}`;
    b.append(thumb(proxy.id, 56), cap);
    portrait.append(b);
  }

  // ---------- ბუშტები ----------

  function redirectButton(targetId) {
    const t = byId[targetId];
    if (!t) return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'redirect';
    b.dataset.target = targetId;
    b.textContent = `→ მივიდე ${withName(t)}`;
    b.addEventListener('click', () => switchTo(targetId));
    return b;
  }

  function bubbleNode(text) {
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    renderSegments(bubble, text);
    return bubble;
  }

  function messageNode(id, m) {
    const row = document.createElement('div');
    row.className = `msg ${m.role === 'user' ? 'user' : 'char'}`;
    if (m.role !== 'user') row.append(whoNode(id, m.spoken_by));
    if (m.role === 'user' && m.action) {
      // Round 8 §8.1: გადაცემა/გამორთმევა — რემარკა (*…*), ჩვენი ტექსტი, არა მომხმარებლის
      row.classList.add('action');
      row.append(bubbleNode(m.content));
    } else if (m.role === 'user') {
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = m.content; // მომხმარებლის ტექსტი არ იპარსება
      row.append(bubble);
    } else {
      row.append(bubbleNode(m.content));
    }
    if (m.redirect) { const b = redirectButton(m.redirect); if (b) row.append(b); }
    return row;
  }

  function systemNote(text) {
    const n = document.createElement('div');
    n.className = 'msg system';
    n.setAttribute('role', 'alert');
    n.textContent = text;
    log.append(n);
    scrollDown();
  }

  function scrollDown() { log.scrollTop = log.scrollHeight; }

  /** ისტორია. ცარიელ ჩატში შეტყობინებების ზონა ცარიელია — არანაირი ტექსტი (Round 6 §1). */
  function renderLog(id) {
    const msgs = getChat(id);
    log.replaceChildren(...msgs.map((m) => messageNode(id, m)));
    requestAnimationFrame(scrollDown);
  }

  // ---------- პორტრეტი ცენტრში (FLIP) ----------

  /** iOS-ის „ჭრილი“ (safe-area) ზემოთ — CSS-ის env()-დან (--sat :root-ზე). */
  function safeTop() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
  }

  function targetRects() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (sizeClass(W) === 'desktop') {
      const pw = Math.min(300, W * 0.24);
      const ph = pw * 1.42;
      const cw = Math.min(540, W * 0.44);
      const ch = Math.min(H - 48, 740);
      const total = pw + 40 + cw;
      const x0 = (W - total) / 2;
      return {
        mobile: false,
        portrait: { x: x0, y: (H - ph) / 2, w: pw, h: ph },
        panel: { x: x0 + pw + 40, y: (H - ch) / 2, w: cw, h: ch },
      };
    }
    // Round 3 §5: ვიწრო ეკრანზე ჩატი მთელ ეკრანზეა (fixed sheet), პატარა პორტრეტი — სათაურის მარცხენა უჯრაში
    const pw = Math.round(Math.min(120, Math.max(96, W * 0.28)));
    const ph = Math.round(pw * 1.42);
    return {
      mobile: true,
      portrait: { x: 12, y: 10 + safeTop(), w: pw, h: ph },
      panel: null,
    };
  }

  /** ჩარჩოს „სახლი“: განლაგების მართკუთხედი viewport-ში (მობრუნებამდე) + კუთხე. ყოველ ჯერზე თავიდან ითვლება. */
  function homeRect(node) {
    const wallRect = document.getElementById('wall').getBoundingClientRect();
    const f = wall.layout?.frames.find((x) => x.id === node.dataset.id);
    if (!f) return null;
    return { x: wallRect.left + f.x, y: wallRect.top + f.y, w: f.w, h: f.h, rot: f.rotation };
  }

  /** transform, რომელიც ცენტრალურ პორტრეტს (to) კედლის ჩარჩოს ადგილას (from) აყენებს. */
  function flipTransform(from, to) {
    const dx = from.x + from.w / 2 - (to.x + to.w / 2);
    const dy = from.y + from.h / 2 - (to.y + to.h / 2);
    return `translate(${dx}px, ${dy}px) scale(${from.w / to.w}, ${from.h / to.h}) rotate(${from.rot || 0}deg)`;
  }

  function placePanel(rects) {
    panel.classList.toggle('sheet', rects.mobile);
    if (rects.mobile) {
      // sheet-ის ზომა CSS-შია (inset: 0; 100dvh) — inline ზომები არ უნდა გადაფარავდეს
      for (const k of ['left', 'top', 'width', 'height']) panel.style[k] = '';
      panel.style.setProperty('--pw', `${rects.portrait.w}px`);
      panel.style.setProperty('--ph', `${rects.portrait.h}px`);
      return;
    }
    const p = rects.panel;
    Object.assign(panel.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px` });
  }

  function placePortrait(portrait, rects) {
    const t = rects.portrait;
    Object.assign(portrait.style, { left: `${t.x}px`, top: `${t.y}px`, width: `${t.w}px`, height: `${t.h}px` });
    portrait.classList.toggle('in-sheet', rects.mobile);
    if (rects.mobile) {
      // კედლის ჩარჩოს ასლს ფირფიტის inline შრიფტი მოჰყვება — პატარა პორტრეტზე თავიდან ვარგებთ
      const name = portrait.querySelector('.plate-name');
      if (name) { name.style.fontSize = ''; fitText(name, 8, { height: true }); }
    }
  }

  /** ვიწრო ეკრანზე გვერდი არ სქროლავს, სანამ sheet ღიაა (სქროლის პოზიცია რჩება). */
  function lockScroll(on) { document.documentElement.classList.toggle('sheet-lock', on); }

  /** სად „მიფრინდეს“ პორტრეტი: კედლის ჩარჩოსთან (თუ არის), თორემ ქვემოთ, პატარავდება. */
  function awayTransform(source, portraitRect) {
    const home = source ? homeRect(source) : null;
    return home ? flipTransform(home, portraitRect) : 'translate(0, 40px) scale(0.6) rotate(-4deg)';
  }

  async function open(id, sourceNode = null) {
    const c = byId[id];
    if (!c) return;
    if (current && await close({ instant: true })) return; // დახურვამ შენობა ჩამოანგრია — ახალი ჩატი არ იხსნება
    menu.close();
    session += 1;
    const rects = targetRects();

    // პორტრეტი: კედლის ჩარჩოს ასლი, ან ახალი (კედელზე არმყოფთათვის; უხილავს — სილუეტი)
    const fromWall = sourceNode && sourceNode.classList.contains('frame') ? sourceNode : wall.frameNode(id);
    const portrait = fromWall ? fromWall.cloneNode(true) : buildFrame(c);
    portrait.classList.add('portrait');
    portrait.classList.remove('tilted', 'lifted');
    portrait.removeAttribute('aria-label');
    portrait.tabIndex = -1;
    portrait.dataset.id = id;
    if (!c.reachable) {
      const stamp = document.createElement('div');
      stamp.className = 'absent-stamp';
      stamp.textContent = 'ადგილზე არ არის';
      portrait.append(stamp);
    }
    document.body.append(portrait);
    placePortrait(portrait, rects);

    const startTransform = awayTransform(fromWall, rects.portrait);
    portrait.style.transition = 'none';
    portrait.style.transform = startTransform;
    if (!fromWall) portrait.style.opacity = '0';
    if (fromWall) fromWall.classList.add('lifted'); // ერთადერთი, რაც კედლის ჩარჩოს ემატება — დახურვისას იხსნება
    current = { id, portrait, source: fromWall, exchanges: 0 };

    document.body.classList.add('chat-open');
    lockScroll(rects.mobile);
    backdrop.hidden = false;
    setSpeaker(id, currentProxy(id));
    refreshUser();
    detach();
    refreshCopies();
    renderLog(id);
    placePanel(rects);
    panel.classList.remove('closing');
    panel.hidden = false;

    // FLIP: საწყისი მდგომარეობა სტილში „ჩაიწერა“ (reflow) → საბოლოო მაშინვე, requestAnimationFrame-ის გარეშე.
    // Round 3 §5: ადრე `shown` მხოლოდ rAF-ში ემატებოდა — ფონურ/დამალულ ფანჯარაში rAF არ ეშვება და პანელი opacity 0-ზე რჩებოდა.
    void portrait.getBoundingClientRect();
    portrait.style.transition = `transform ${ANIM_MS}ms ${EASE_IN}, opacity ${ANIM_MS}ms`;
    portrait.style.transform = 'rotate(-1.5deg)';
    portrait.style.opacity = '1';
    panel.classList.add('shown');
    input.value = '';
    updateBusy();
    setTimeout(() => { if (current?.id === id) input.focus({ preventScroll: true }); }, ANIM_MS);

    // დრო მიდის: სხვა პერსონაჟთან გადასვლა = დღეები; შეიძლება სეზონი შეიცვალოს ან შენობა ჩამოინგრეს
    if (onOpened) await onOpened(id);
  }

  /**
   * დახურვა: პორტრეტი უკან, ზუსტად კედლის ჩარჩოს ადგილას (იგივე ხანგრძლივობა), მერე ჩარჩო ისევ ჩანს.
   * Round 3 §2: პანელი უკვე დაკეტილია, როცა onClosed დროს წაწევს — ინტერტიტრი/ხე/ფონი ჩატის შუაში არასდროს ჩნდება.
   * silent — დრო არ მიდის (ჩამონგრევის სცენა). აბრუნებს true-ს, თუ დახურვამ შენობა ჩამოანგრია.
   */
  async function close({ instant = false, silent = false } = {}) {
    if (!current) return false;
    const { portrait, source, id, exchanges } = current;
    detach(); // Round 9 §1: დახურვა/გადასვლა მიმაგრებას ხსნის
    current = null;
    session += 1;
    menu.close();
    panel.classList.remove('shown');
    if (panel.classList.contains('sheet')) panel.classList.add('closing'); // sheet ქრება, კედელი ჩანს, პორტრეტი სახლში ბრუნდება
    document.body.classList.remove('chat-open');
    lockScroll(false);
    if (!instant) {
      const rect = portrait.getBoundingClientRect();
      // სახლი დახურვისას თავიდან ითვლება — თუ ფანჯარა შეიცვალა, პორტრეტი ახალ ადგილას ბრუნდება
      const base = { x: parseFloat(portrait.style.left), y: parseFloat(portrait.style.top), w: parseFloat(portrait.style.width) || rect.width, h: parseFloat(portrait.style.height) || rect.height };
      portrait.style.transition = `transform ${ANIM_MS}ms ${EASE_OUT}, opacity ${ANIM_MS}ms`;
      portrait.style.transform = awayTransform(source, base);
      if (!source) portrait.style.opacity = '0';
      await sleep(ANIM_MS);
    }
    portrait.remove();
    source?.classList.remove('lifted');
    panel.hidden = true;
    panel.classList.remove('closing');
    backdrop.hidden = true;
    subEl.hidden = true;
    if (silent || !onClosed) return false;
    return Boolean(await onClosed(id, exchanges));
  }

  /** სხვა პერსონაჟი: ჯერ მიმდინარე ბრუნდება კედელზე (და, თუ სეზონი შეიცვალა, ინტერტიტრი), მერე ახალი მოდის ცენტრში. */
  async function switchTo(id) {
    if (await close()) return; // ჩამონგრევა — ახალ შენობაში თავიდან
    const node = wall.frameNode(id);
    if (node) node.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    await open(id, node);
  }

  function updateBusy() {
    const b = current && busy.has(current.id);
    sendBtn.disabled = Boolean(b); // ლიმიტის დაბლოკვა — aria-disabled (limitModal.applyInput), რომ დაჭერამ ფანჯარა გახსნას
    panel.classList.toggle('busy', Boolean(b));
    copyBtn.disabled = Boolean(b);
    attachRemove.disabled = Boolean(b);
    limitModal?.applyInput();
    applyPlaceholder(); // applyInput ჩვეულებრივ placeholder-ს აბრუნებს — მიმაგრებისას ჩვენი რჩება
  }

  // ---------- გაგზავნა + სტრიმინგი ----------

  /** action — Round 8 §3.3: { type, copyId, integrity } (ეგზემპლარის ღილაკი); შედეგი მხოლოდ done-ზე ცვლის მდგომარეობას. */
  async function send(text, { action = null } = {}) {
    const id = current?.id;
    if (!id || busy.has(id)) return;
    // ლიმიტი/ბიუჯეტი ამოწურულია → ფანჯარა ისევ იხსნება, გაგზავნა არ ხდება
    if (limitModal?.isBlocked()) { limitModal.open(); return; }
    const c = byId[id];
    const cfg = getConfig();
    const max = cfg.chat.max_message_chars;
    if (text.length > max) { systemNote(`შეტყობინება ძალიან გრძელია (მაქს. ${max} სიმბოლო).`); return; }

    const mySession = session;
    const myEpoch = epoch;
    const live = () => current?.id === id && session === mySession;
    busy.add(id);
    updateBusy();

    const msgs = getChat(id);
    msgs.push({ role: 'user', content: text, ts: Date.now(), ...(action ? { action: { type: action.type, copyId: action.copyId } } : {}) });
    saveChat(id, msgs);
    log.append(messageNode(id, msgs[msgs.length - 1]));

    // „წერს…“ ინდიკატორი
    const row = document.createElement('div');
    row.className = 'msg char streaming';
    const who = whoNode(id, currentProxy(id));
    const typing = document.createElement('div');
    typing.className = 'typing';
    typing.textContent = c.reachable ? `${c.short_name_ka} ${rand(TYPING)}` : rand(TYPING_ABSENT);
    row.append(who, typing);
    log.append(row);
    scrollDown();

    const gs = getGameState();
    const payload = {
      characterId: id,
      // ბოლო chat.history_window შეტყობინება; `scripted: true` (Round 5 §1) — არასდროს (Round 6 §4: public/js/history.js)
      messages: historyForServer(msgs, cfg.chat.history_window),
      gameState: {
        day: gs.day, season: gs.season, crackStage: gs.crackStage, cycle: gs.cycle,
        paintingFallen: Boolean(gs.paintingFallen),
      },
      lastSpokenBy: currentProxy(id),
      userName: getUserName(), // Round 3 §1
      // Round 8 §3.3: ეგზემპლარების მდგომარეობა ყოველ მოთხოვნაზე; action — მხოლოდ ღილაკიდან
      ...(getCopies ? { manuscript: summaryForServer(getCopies()) } : {}),
      ...(action ? { action } : {}),
    };

    let reply = '';
    let done = null;
    let error = null;
    let bubble = null;
    try {
      const res = await api('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        // ბრაუზერის ლიმიტი ან გლობალური ბიუჯეტი → ოფიციალური ფანჯარა (არა ნედლი შეცდომა ჩატში)
        if (res.status === 429 && (j.error === 'client_limit' || j.error === 'global_budget') && limitModal) {
          const err = new Error('__limit__');
          err.limit = j;
          throw err;
        }
        throw new Error(typeof j.error === 'string' && !/^[a-z_]+$/.test(j.error) ? j.error : (j.message || MSG_API_ERROR));
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = parseSseChunk(chunk); // უცნობი ველები იგნორირდება (Round 5 §3)
          if (!ev) continue;
          if (ev.delta) {
            reply += ev.delta;
            if (!bubble) {
              bubble = document.createElement('div');
              bubble.className = 'bubble';
              typing.replaceWith(bubble);
            }
            renderSegments(bubble, reply); // სტრიმინგზეც: გაუხსნელი * → რემარკა ბოლომდე, ვარსკვლავი არ ციმციმებს
            if (live()) scrollDown();
          }
          // Round 3 §4: კორექტურის შედეგი — იგივე ბუშტი, ჩუმად (ხელახალი სტრიმის/ციმციმის გარეშე, ერთი replaceChildren)
          if (typeof ev.replace === 'string' && ev.replace) {
            reply = ev.replace;
            if (bubble) renderSegments(bubble, reply);
          }
          if (ev.error) error = ev.error;
          if (ev.done) done = ev;
        }
      }
      if (!done && !error) error = MSG_API_ERROR;
    } catch (e) {
      if (e.limit) {
        // მომხმარებლის შეტყობინება არ იკარგება — ისტორიაში რჩება, პასუხი არ მოვიდა
        row.remove();
        busy.delete(id);
        updateBusy();
        limitModal.block(e.limit.error, e.limit.resets_at ?? null);
        return;
      }
      error = e.message || MSG_API_ERROR;
    }

    if (epoch !== myEpoch) { // ყველაფერი განულდა, სანამ პასუხი მოდიოდა — ის აღარსად ინახება
      row.remove();
      busy.delete(id);
      updateBusy();
      return;
    }
    if (error || !done) {
      row.remove();
      if (live()) systemNote(error || MSG_API_ERROR);
      busy.delete(id);
      updateBusy();
      return;
    }

    const m = { role: 'assistant', content: reply, ts: Date.now(), spoken_by: done.spoken_by };
    if (done.suggested_redirect) m.redirect = done.suggested_redirect;
    const all = getChat(id);
    all.push(m);
    saveChat(id, all);
    row.classList.remove('streaming');
    row.querySelector('.who').replaceWith(whoNode(id, done.spoken_by));
    if (m.redirect) { const b = redirectButton(m.redirect); if (b) row.append(b); }
    if (live()) { setSpeaker(id, done.spoken_by); scrollDown(); }
    // მთვლელი, თარიღი და (საჭიროებისას) ინტერტიტრი — ერთად, პასუხის დასრულებისთანავე (Round 2 §1, §5)
    const tokens = tokensFromDone(done);
    if (tokens) onTokens(tokens);
    // Round 8 §3.3: ეგზემპლარები იცვლება მხოლოდ სერვერის გადაწყვეტილებით (done), არასდროს წინასწარ
    if (done.action_result && onAction) onAction(id, done.action_result);
    busy.delete(id);
    updateBusy();
    if (live()) refreshCopies();
    if (live()) current.exchanges += 1; // დახურვისას დრო მიდის მხოლოდ თუ ამ საუბარში გაცვლა შედგა (Round 3 §2)
    if (done.exhausted && limitModal) limitModal.block('client_limit', done.resets_at ?? null);
    await onExchange(id);
  }

  // ---------- მოვლენები ----------

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (limitModal?.isBlocked()) { limitModal.open(); return; } // გაგზავნის მცდელობა → ფანჯარა ისევ
    const text = input.value.trim();
    // Round 9 §1: მიმაგრებული მოქმედება — რემარკა + (თუ დაწერა) მომხმარებლის სიტყვები, ერთ შეტყობინებად. ერთადერთი გზა.
    if (attached && current) {
      if (busy.has(current.id)) return; // პასუხი ჯერ მიდის — მიმაგრება და ტექსტი რჩება
      const att = attached;
      const c = byId[current.id];
      const valid = attachmentValid(getCopies?.(), att, c.id, c.reachable);
      detach();
      if (valid) {
        input.value = '';
        const stage = actionText(att.type, getUserName(), c.short_name_ka, att.integrity);
        send(actionMessage(stage, text), { action: { type: att.type, copyId: att.copyId, integrity: att.integrity } });
        return;
      }
      // აღარ მოქმედებს — ჩუმად მოიხსნა; დაწერილი ტექსტი ჩვეულებრივ იგზავნება
    }
    if (!text) return;
    input.value = '';
    send(text);
  });
  // Round 9 §1: ღილაკი მოქმედებას ველზე ამაგრებს (ეგზემპლარი — ავტომატურად საუკეთესო); ხელახლა დაჭერა — მოხსნის
  copyBtn.addEventListener('click', () => {
    if (!current || busy.has(current.id)) return;
    if (limitModal?.isBlocked()) { limitModal.open(); return; }
    if (attached) detach(); else attach();
    input.focus({ preventScroll: true });
  });
  attachRemove.addEventListener('click', () => {
    if (!current || busy.has(current.id)) return;
    detach();
    input.focus({ preventScroll: true });
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  document.getElementById('chat-close').addEventListener('click', () => close());
  backdrop.addEventListener('click', () => close());
  document.getElementById('chat-clear').addEventListener('click', () => {
    if (!current) return;
    clearChat(current.id);
    renderLog(current.id);
    setSpeaker(current.id, currentProxy(current.id));
  });
  document.getElementById('chat-others').addEventListener('click', (e) => {
    menu.toggle(e.currentTarget, { variant: 'chat', exclude: current?.id });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !current || menu.isOpen()) return;
    // Round 9 §1: მიმაგრება და ცარიელი ველი → ჯერ მიმაგრება იხსნება, ჩატი ღია რჩება
    if (attached && !input.value.trim()) { detach(); return; }
    close();
  });
  // ფანჯრის ზომის ცვლილებაზე პორტრეტი ცენტრში რჩება; სახლი დახურვისას თავიდან ითვლება
  window.addEventListener('resize', () => {
    if (!current) return;
    const r = targetRects();
    placePanel(r);
    placePortrait(current.portrait, r);
    lockScroll(r.mobile);
  });

  /** Round 5 §2: „ყველაფრის განულება“ — ღია ჩატი იხურება (დროის გარეშე), მიმდინარე სტრიმები აღარაფერს ინახავს. */
  async function forgetAll() {
    epoch += 1;
    await close({ instant: true, silent: true });
  }

  return { open, close, switchTo, refreshUser, refreshCopies, forgetAll, isOpen: () => Boolean(current), currentId: () => current?.id || null };
}
