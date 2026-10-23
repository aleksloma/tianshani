// ჩატის პანელი: ჩარჩო ცენტრში (FLIP), სტრიმინგი (SSE fetch-ით), უხილავთა „~~გივი~~ სოსო“, გადამისამართების ღილაკი.
import { getChat, saveChat, clearChat } from './storage.js';

const TYPING = ['…ფიქრობს', '…ტელეფონზეა', '…საუზმობს', '…რეზოლუციას წერს', '…ბზარს უყურებს', '…ყურმილს იღებს'];
const TYPING_ABSENT = ['…კარს აკაკუნებენ', '…ვიღაც მოდის დერეფანში', '…ხაზი დაკავებულია', '…დაელოდეთ'];
export const MSG_API_ERROR = 'ხაზი დაკავებულია. ცოტა ხანში სცადეთ.';
const ANIM_MS = 420;

/** „-სთან“: თინა → თინასთან, ოთარი → ოთართან. */
export function withName(c) {
  if (c.id === 'two_big_men') return 'ორ დიდ კაცთან';
  const n = c.short_name_ka;
  return n.endsWith('ი') ? `${n.slice(0, -1)}თან` : `${n}სთან`;
}

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createChat({ byId, api, getConfig, getGameState, onExchange, onTokens, wall, menu, buildFrame }) {
  const panel = document.getElementById('chat');
  const backdrop = document.getElementById('chat-backdrop');
  const log = document.getElementById('chat-log');
  const nameEl = document.getElementById('chat-name');
  const roleEl = document.getElementById('chat-role');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');

  let current = null;     // { id, portrait, source, sourceTransform }
  let session = 0;        // ღია ჩატის „ვერსია“ — სტრიმი ძველ ჩატს DOM-ში აღარ წერს
  const busy = new Set(); // პერსონაჟები, ვისთანაც პასუხი მიდის

  // ---------- სათაური და ბუშტები ----------

  /** სახელის ელემენტი: უხილავისთვის გადახაზული სახელი + რეალური ავტორი. */
  function whoNode(targetId, spokenBy) {
    const target = byId[targetId];
    const span = document.createElement('span');
    span.className = 'who';
    if (!target.reachable) {
      const s = document.createElement('s');
      s.className = 'struck';
      s.textContent = target.short_name_ka;
      span.append(s, ' ');
      const real = document.createElement('span');
      real.className = 'real';
      real.textContent = spokenBy && byId[spokenBy] ? byId[spokenBy].short_name_ka : '…';
      span.append(real);
    } else {
      span.textContent = target.short_name_ka;
    }
    return span;
  }

  function setHeader(id, spokenBy) {
    const c = byId[id];
    nameEl.replaceChildren(whoNode(id, spokenBy));
    roleEl.textContent = c.role_ka;
    panel.classList.toggle('absent', !c.reachable);
  }

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

  function messageNode(id, m) {
    const row = document.createElement('div');
    row.className = `msg ${m.role === 'user' ? 'user' : 'char'}`;
    if (m.role !== 'user') row.append(whoNode(id, m.spoken_by));
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = m.content;
    row.append(bubble);
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

  function renderLog(id) {
    const msgs = getChat(id);
    log.replaceChildren(...msgs.map((m) => messageNode(id, m)));
    if (!msgs.length) {
      const hint = document.createElement('div');
      hint.className = 'msg hint';
      hint.textContent = byId[id].reachable
        ? 'დაიწყეთ საუბარი. ხელნაწერზეც შეგიძლიათ ჰკითხოთ — ან ნებისმიერ სხვა რამეზე.'
        : 'კარზე დააკაკუნეთ. იქნებ ვინმემ გიპასუხოთ.';
      log.append(hint);
    }
    requestAnimationFrame(scrollDown);
  }

  // ---------- პორტრეტი ცენტრში (FLIP) ----------

  function targetRects() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (W >= 900) {
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
    const pw = Math.min(118, W * 0.3);
    const ph = pw * 1.42;
    const top = 10;
    return {
      mobile: true,
      portrait: { x: (W - pw) / 2, y: top, w: pw, h: ph },
      panel: { x: 8, y: top + ph + 10, w: W - 16, h: H - (top + ph + 10) - 8 },
    };
  }

  /** ჩარჩოს ხილული (მობრუნებამდელი) მართკუთხედი viewport-ში. */
  function sourceRect(node) {
    const wallRect = document.getElementById('wall').getBoundingClientRect();
    const f = wall.layout?.frames.find((x) => x.id === node.dataset.id);
    if (!f) return null;
    return { x: wallRect.left + f.x, y: wallRect.top + f.y, w: f.w, h: f.h, rot: f.rotation };
  }

  function flipTransform(from, to) {
    const dx = from.x + from.w / 2 - (to.x + to.w / 2);
    const dy = from.y + from.h / 2 - (to.y + to.h / 2);
    return `translate(${dx}px, ${dy}px) scale(${from.w / to.w}, ${from.h / to.h}) rotate(${from.rot || 0}deg)`;
  }

  function placePanel(rects) {
    const p = rects.panel;
    Object.assign(panel.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px` });
    panel.classList.toggle('mobile', rects.mobile);
  }

  function placePortrait(portrait, rects) {
    const t = rects.portrait;
    Object.assign(portrait.style, { left: `${t.x}px`, top: `${t.y}px`, width: `${t.w}px`, height: `${t.h}px` });
  }

  async function open(id, sourceNode = null) {
    const c = byId[id];
    if (!c) return;
    if (current) await close({ instant: true });
    menu.close();
    session += 1;
    const rects = targetRects();

    // პორტრეტი: კედლის ჩარჩოს ასლი, ან ახალი (კედელზე არმყოფთათვის; უხილავს — სილუეტი)
    const fromWall = sourceNode && sourceNode.classList.contains('frame') ? sourceNode : wall.frameNode(id);
    const portrait = fromWall ? fromWall.cloneNode(true) : buildFrame(c);
    portrait.classList.add('portrait');
    portrait.classList.remove('tilted');
    portrait.removeAttribute('aria-label');
    portrait.tabIndex = -1;
    portrait.dataset.id = id;
    if (!c.reachable) {
      const stamp = document.createElement('div');
      stamp.className = 'absent-stamp';
      stamp.textContent = 'ადგილზე არ არის';
      portrait.append(stamp);
    }
    placePortrait(portrait, rects);
    document.body.append(portrait);

    const src = fromWall ? sourceRect(fromWall) : null;
    const startTransform = src
      ? flipTransform(src, { ...rects.portrait })
      : 'translate(0, 40px) scale(0.6) rotate(-4deg)';
    portrait.style.transition = 'none';
    portrait.style.transform = startTransform;
    if (!src) portrait.style.opacity = '0';
    if (fromWall) fromWall.classList.add('lifted');
    current = { id, portrait, source: fromWall, startTransform };

    document.body.classList.add('chat-open');
    backdrop.hidden = false;
    setHeader(id, lastSpokenBy(id));
    renderLog(id);
    placePanel(rects);
    panel.hidden = false;

    // FLIP: შემდეგ კადრში საბოლოო მდგომარეობა
    void portrait.getBoundingClientRect();
    requestAnimationFrame(() => {
      portrait.style.transition = `transform ${ANIM_MS}ms cubic-bezier(.2,.8,.2,1), opacity ${ANIM_MS}ms`;
      portrait.style.transform = 'rotate(-1.5deg)';
      portrait.style.opacity = '1';
      panel.classList.add('shown');
    });
    input.value = '';
    updateBusy();
    setTimeout(() => input.focus({ preventScroll: true }), ANIM_MS);
  }

  async function close({ instant = false } = {}) {
    if (!current) return;
    const { portrait, source, startTransform } = current;
    current = null;
    session += 1;
    menu.close();
    panel.classList.remove('shown');
    document.body.classList.remove('chat-open');
    if (!instant) {
      portrait.style.transition = `transform ${ANIM_MS}ms cubic-bezier(.5,0,.3,1), opacity ${ANIM_MS}ms`;
      portrait.style.transform = startTransform;
      if (!source) portrait.style.opacity = '0';
      await sleep(ANIM_MS);
    }
    portrait.remove();
    source?.classList.remove('lifted');
    panel.hidden = true;
    backdrop.hidden = true;
  }

  async function switchTo(id) {
    await close();
    const node = wall.frameNode(id);
    if (node) node.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    await open(id, node);
  }

  function lastSpokenBy(id) {
    const msgs = getChat(id);
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].spoken_by) return msgs[i].spoken_by;
    return null;
  }

  function updateBusy() {
    const b = current && busy.has(current.id);
    sendBtn.disabled = Boolean(b);
    panel.classList.toggle('busy', Boolean(b));
  }

  // ---------- გაგზავნა + სტრიმინგი ----------

  async function send(text) {
    const id = current?.id;
    if (!id || busy.has(id)) return;
    const c = byId[id];
    const cfg = getConfig();
    const max = cfg.chat.max_message_chars;
    if (text.length > max) { systemNote(`შეტყობინება ძალიან გრძელია (მაქს. ${max} სიმბოლო).`); return; }

    const mySession = session;
    const live = () => current?.id === id && session === mySession;
    busy.add(id);
    updateBusy();

    const msgs = getChat(id);
    msgs.push({ role: 'user', content: text, ts: Date.now() });
    saveChat(id, msgs);
    log.querySelector('.msg.hint')?.remove();
    log.append(messageNode(id, msgs[msgs.length - 1]));

    // „წერს…“ ინდიკატორი
    const row = document.createElement('div');
    row.className = 'msg char streaming';
    const who = whoNode(id, null);
    const typing = document.createElement('div');
    typing.className = 'typing';
    typing.textContent = c.reachable ? `${c.short_name_ka} ${rand(TYPING)}` : rand(TYPING_ABSENT);
    row.append(who, typing);
    log.append(row);
    scrollDown();

    const gs = getGameState();
    const payload = {
      characterId: id,
      messages: msgs.slice(-cfg.chat.history_window).map(({ role, content }) => ({ role, content })),
      gameState: { season: gs.season, crackStage: gs.crackStage, lostCopies: gs.lostCopies, cycle: gs.cycle, paintingFallen: Boolean(gs.paintingFallen) },
      lastSpokenBy: lastSpokenBy(id),
    };

    let reply = '';
    let done = null;
    let error = null;
    let bubble = null;
    try {
      const res = await api('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || MSG_API_ERROR);
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
          const line = chunk.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          let ev;
          try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (ev.delta) {
            reply += ev.delta;
            if (!bubble) {
              bubble = document.createElement('div');
              bubble.className = 'bubble';
              typing.replaceWith(bubble);
            }
            bubble.textContent = reply;
            if (live()) scrollDown();
          }
          if (ev.error) error = ev.error;
          if (ev.done) done = ev;
        }
      }
      if (!done && !error) error = MSG_API_ERROR;
    } catch (e) {
      error = e.message || MSG_API_ERROR;
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
    if (live()) { setHeader(id, done.spoken_by); scrollDown(); }
    if (done.remaining) onTokens(done.remaining);
    busy.delete(id);
    updateBusy();
    await onExchange(id);
  }

  // ---------- მოვლენები ----------

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    send(text);
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
    setHeader(current.id, null);
  });
  document.getElementById('chat-others').addEventListener('click', (e) => {
    menu.toggle(e.currentTarget, { variant: 'chat', exclude: current?.id });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current && !menu.isOpen()) close();
  });
  window.addEventListener('resize', () => {
    if (!current) return;
    const r = targetRects();
    placePanel(r);
    placePortrait(current.portrait, r);
  });

  return { open, close, switchTo, isOpen: () => Boolean(current), currentId: () => current?.id || null };
}
