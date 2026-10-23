// ადმინ-გვერდი: შესვლა, ბრაუზერების სია, საუბრები პერსონაჟებად, ლიმიტის განულება, ექსპორტი.
const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('ka-GE');
const SEASON_KA = { autumn: 'შემოდგომა', winter: 'ზამთარი', spring: 'გაზაფხული', summer: 'ზაფხული' };
let selected = null;
let searchTimer = null;

async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (res.status === 401) { showLogin(); throw new Error('unauthorized'); }
  return res.json();
}

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v);
  }
  n.append(...children.filter((c) => c != null));
  return n;
}
const when = (iso) => (iso ? new Date(iso).toLocaleString('ka-GE', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function showLogin() { $('app').hidden = true; $('login').hidden = false; $('pw').focus(); }

async function showApp() {
  $('login').hidden = true;
  $('app').hidden = false;
  await Promise.all([loadStats(), loadClients()]);
}

async function loadStats() {
  const s = await api('/api/admin/stats');
  const t = s.totals;
  $('mode-line').textContent = `ლიმიტის პერიოდი: ${s.period === 'monthly' ? 'თვიური' : 'მთელი დრო'} (${s.period_key}) · LLM: ${s.mock ? 'MOCK რეჟიმი' : 'Gemini'}`;
  const card = (k, v) => el('div', { class: 'stat-card' }, el('div', { class: 'v', text: fmt.format(v) }), el('div', { class: 'k', text: k }));
  const top = el('div', { class: 'stat-card top' }, el('div', { class: 'k', text: 'ტოპ პერსონაჟები (მომხმარებლის შეტყობინებები)' }),
    el('ol', {}, ...s.top_characters.map((c) => el('li', { text: `${c.name} — ${c.n}` }))));
  $('stats').replaceChildren(
    card('ბრაუზერი სულ', t.clients),
    card('შეტყობინება სულ', t.messages),
    card('შემავალი ტოკენი სულ', t.input_tokens),
    card('გამომავალი ტოკენი სულ', t.output_tokens),
    top,
  );
}

async function loadClients() {
  const q = $('search').value.trim();
  const data = await api(`/api/admin/clients?q=${encodeURIComponent(q)}`);
  const list = $('client-list');
  if (!data.clients.length) { list.replaceChildren(el('li', { class: 'muted', text: 'ჯერ ცარიელია.' })); return; }
  list.replaceChildren(...data.clients.map((c) => {
    const pct = c.limit_pct;
    const b = el('button', { type: 'button', 'data-id': c.client_id, 'aria-current': String(c.client_id === selected) },
      el('span', { class: 'cid', text: c.client_id }),
      el('span', { class: 'cmeta', text: `ბოლოს: ${when(c.last_seen)} · შეტყობინება: ${c.messages} · პერსონაჟი: ${c.characters}` }),
      el('span', { class: 'cmeta', text: `ტოკენი (${data.period_key}): ${fmt.format(c.input_tokens)} შემ. / ${fmt.format(c.output_tokens)} გამ. · ლიმიტის ${pct}%` }),
      el('span', { class: 'bar' }, el('i', { class: pct >= 80 ? 'hot' : '', style: `width:${pct}%` })));
    b.addEventListener('click', () => openClient(c.client_id));
    return el('li', {}, b);
  }));
}

async function openClient(id) {
  selected = id;
  for (const b of $('client-list').querySelectorAll('button')) b.setAttribute('aria-current', String(b.dataset.id === id));
  const data = await api(`/api/admin/clients/${encodeURIComponent(id)}/messages`);
  $('detail-empty').hidden = true;
  $('detail-body').hidden = false;
  $('detail-tab').textContent = `საქმე ${id.slice(0, 8)}`;
  $('detail-title').textContent = id;
  const c = data.client || {};
  $('detail-meta').textContent = `პირველად: ${when(c.first_seen)} · ბოლოს: ${when(c.last_seen)} · ${c.user_agent || ''}`;
  $('export-one').href = `/api/admin/export?client=${encodeURIComponent(id)}`;

  const tabs = $('char-tabs');
  if (!data.characters.length) {
    tabs.replaceChildren();
    $('conversation').replaceChildren(el('p', { class: 'muted', text: 'საუბრები არ არის.' }));
    return;
  }
  tabs.replaceChildren(...data.characters.map((g, i) => {
    const b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(i === 0), 'data-char': g.character_id }, `${g.name} (${g.messages.length})`);
    b.addEventListener('click', () => {
      for (const t of tabs.children) t.setAttribute('aria-selected', String(t === b));
      renderConversation(g);
    });
    return b;
  }));
  renderConversation(data.characters[0]);
}

function renderConversation(g) {
  $('conversation').replaceChildren(...g.messages.map((m) => {
    const who = m.role === 'user'
      ? el('strong', { text: 'მომხმარებელი' })
      : (g.reachable ? el('strong', { text: g.name }) : el('strong', {}, el('s', { class: 'struck', text: g.name }), ` ${m.spoken_by_name || ''}`));
    return el('div', { class: `cmsg ${m.role}` },
      el('div', { class: 'meta' }, who,
        el('span', { text: when(m.created_at) }),
        el('span', { class: 'badge', text: `${SEASON_KA[m.season] || m.season || '—'} · შენობა №${m.cycle ?? '—'}` }),
        m.lang_guess ? el('span', { class: 'badge', text: m.lang_guess }) : null,
        m.role === 'user' ? el('span', { text: `in: ${m.input_tokens}` }) : el('span', { text: `out: ${m.output_tokens}` })),
      el('div', { class: 'text', text: m.content }));
  }));
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-error').textContent = '';
  const res = await fetch('/api/admin/login', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: $('pw').value }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { $('login-error').textContent = j.error || 'შეცდომა.'; return; }
  $('pw').value = '';
  showApp();
});
$('logout').addEventListener('click', async () => { await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }); showLogin(); });
$('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadClients, 250); });
$('reset-limit').addEventListener('click', async () => {
  if (!selected) return;
  await api(`/api/admin/clients/${encodeURIComponent(selected)}/reset-limit`, { method: 'POST' });
  await Promise.all([loadClients(), loadStats()]);
  $('reset-limit').textContent = 'განულებულია ✓';
  setTimeout(() => { $('reset-limit').textContent = 'ლიმიტის განულება ამ კლიენტისთვის'; }, 2000);
});

// გვერდის გახსნა: თუ cookie უკვე გვაქვს — პირდაპირ არქივი
fetch('/api/admin/me', { credentials: 'same-origin' }).then((r) => (r.ok ? showApp() : showLogin())).catch(showLogin);
