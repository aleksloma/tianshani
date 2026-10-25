// ადმინ-გვერდი: ბრაუზერების სია, საუბრები პერსონაჟებად, ლიმიტის განულება, ექსპორტი (შესვლა — src/views/admin-login.html).
import { diffWords } from './diff.js';

const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('ka-GE');
const SEASON_KA = { autumn: 'შემოდგომა', winter: 'ზამთარი', spring: 'გაზაფხული', summer: 'ზაფხული' };
let selected = null;
let searchTimer = null;

async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  // სესია ამოიწურა → გვერდის თავიდან ჩატვირთვა: სერვერი მხოლოდ შესვლის ფორმას აჩვენებს (Round 7 §3)
  if (res.status === 401) { location.reload(); throw new Error('unauthorized'); }
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

async function showApp() {
  await Promise.all([loadStats(), loadClients(), loadProofread()]);
}

// ---------- Round 3 §4: შესწორებული პასუხები ----------

function diffNode(parts) {
  const d = el('div', { class: 'text' });
  for (const p of parts) d.append(p.changed && p.w.trim() ? el('mark', { text: p.w }) : document.createTextNode(p.w));
  return d;
}

async function loadProofread() {
  const data = await api('/api/admin/proofread?limit=200');
  $('proofread-count').textContent = data.total ? `(${data.total})` : '';
  const list = $('proofread-list');
  if (!data.rows.length) { list.replaceChildren(el('p', { class: 'muted', text: 'ჯერ არცერთი პასუხი არ შესწორებულა.' })); return; }
  list.replaceChildren(...data.rows.map((m) => {
    const { left, right } = diffWords(m.proofread_original, m.content);
    const who = m.spoken_by && m.spoken_by !== m.character_id ? `${m.character_name} → ${m.spoken_by_name}` : m.character_name;
    return el('article', { class: 'pr-row', 'data-id': String(m.id) },
      el('div', { class: 'meta' }, el('strong', { text: who }), el('span', { text: when(m.created_at) }),
        el('span', { class: 'badge', text: m.user_name ? `${m.user_name} · ${m.client_id.slice(0, 8)}` : m.client_id.slice(0, 8) })),
      el('div', { class: 'pr-cols' },
        el('div', { class: 'pr-col orig' }, el('div', { class: 'pr-h', text: 'ორიგინალი' }), diffNode(left)),
        el('div', { class: 'pr-col fixed' }, el('div', { class: 'pr-h', text: 'შესწორებული' }), diffNode(right))));
  }));
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
    // Round 4 §9: > 3 წინადადებიანი პასუხები პერსონაჟების მიხედვით
    el('div', { class: 'stat-card top long-replies', id: 'long-replies' },
      el('div', { class: 'k', text: 'ზედმეტად გრძელი პასუხები (> 3 წინადადება)' }),
      (s.long_replies || []).length
        ? el('ol', {}, ...s.long_replies.map((c) => el('li', { 'data-id': c.character_id, text: `${c.name} — ${c.n}` })))
        : el('p', { class: 'muted', text: 'ჯერ არცერთი.' })),
  );
  renderBudget(s.budget);
}

const usd = (v) => `$${Number(v || 0).toFixed(Number(v) < 1 ? 4 : 2)}`;
/** Round 7 §2: დოლარის შეფასება ქართული მძიმით — „≈ $12,40 დღევანდელი ფასებით“ (ცენტზე ნაკლები — 4 ციფრი). */
const usdKa = (v) => { const n = Number(v) || 0; return `$${n.toFixed(n > 0 && n < 0.01 ? 4 : 2).replace('.', ',')}`; };

/** „ბიუჯეტი“ ბარათი (ტოკენებში) + ყვითელი ბანერი warn_at_percent-ზე. */
function renderBudget(b) {
  if (!b) return;
  $('b-spent').textContent = `${fmt.format(b.tokens_used)} / ${fmt.format(b.tokens_limit)}`;
  $('b-pct').textContent = `${b.percent}%`;
  $('b-tokens').textContent = `${fmt.format(b.input_tokens)} / ${fmt.format(b.output_tokens)}`;
  $('b-proj').textContent = `${fmt.format(b.projected_tokens)} (${b.projected_percent}%)`;
  $('b-usd').textContent = `≈ ${usdKa(b.estimated_usd)} დღევანდელი ფასებით`;
  const bar = $('b-bar');
  bar.style.width = `${Math.min(100, b.percent)}%`;
  bar.className = b.exhausted ? 'hot' : b.warn ? 'warn' : '';
  $('b-meta').textContent = `${b.period_key} · ${b.days_elapsed} / ${b.days_in_month} დღე · ფასი: $${b.prices.input_per_1m} შემ. / $${b.prices.output_per_1m} გამ. 1M ტოკენზე · მოთხოვნები: ${b.requests}${b.enabled ? '' : ' · ბიუჯეტი გამორთულია'}`;
  const warn = $('budget-warn');
  warn.hidden = !(b.warn || b.exhausted);
  warn.textContent = b.exhausted
    ? `თვიური ბიუჯეტი ამოიწურა (${b.percent}%) — ყველა მომხმარებელს „ბიუჯეტში გარღვევა გვაქვს“ ფანჯარა ეჩვენება.`
    : `ყურადღება: თვიური ბიუჯეტის ${b.percent}% დახარჯულია (გაფრთხილების ზღვარი ${b.warn_at_percent}%).`;
  warn.classList.toggle('hot', Boolean(b.exhausted));
}

async function loadClients() {
  const q = $('search').value.trim();
  const data = await api(`/api/admin/clients?q=${encodeURIComponent(q)}`);
  const list = $('client-list');
  if (!data.clients.length) { list.replaceChildren(el('li', { class: 'muted', text: 'ჯერ ცარიელია.' })); return; }
  list.replaceChildren(...data.clients.map((c) => {
    const pct = c.limit_pct;
    const b = el('button', { type: 'button', 'data-id': c.client_id, 'aria-current': String(c.client_id === selected) },
      el('span', { class: 'cid' }, c.user_name ? el('b', { class: 'uname', text: `${c.user_name} · ` }) : null, c.client_id),
      el('span', { class: 'cmeta', text: `ბოლოს: ${when(c.last_seen)} · შეტყობინება: ${c.messages} · პერსონაჟი: ${c.characters}` }),
      el('span', { class: 'cmeta', text: `ტოკენი (${data.period_key}): ${fmt.format(c.input_tokens)} შემ. / ${fmt.format(c.output_tokens)} გამ. · ლიმიტის ${pct}%` }),
      el('span', { class: 'cmeta cost', text: `ხარჯი: ${usd(c.cost_usd)} (სულ ${usd(c.total_cost_usd)})` }),
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
  const c = data.client || {};
  $('detail-title').textContent = c.user_name ? `${c.user_name} — ${id}` : id;
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
      ? el('strong', { text: m.user_name ? `მომხმარებელი (${m.user_name})` : 'მომხმარებელი' })
      : (g.reachable ? el('strong', { text: g.name }) : el('strong', {}, el('s', { class: 'struck', text: g.name }), ` ${m.spoken_by_name || ''}`));
    return el('div', { class: `cmsg ${m.role}` },
      el('div', { class: 'meta' }, who,
        el('span', { text: when(m.created_at) }),
        el('span', { class: 'badge', text: `${SEASON_KA[m.season] || m.season || '—'} · შენობა №${m.cycle ?? '—'}` }),
        m.lang_guess ? el('span', { class: 'badge', text: m.lang_guess }) : null,
        m.proofread_changed ? el('span', { class: 'badge pr', text: 'შესწორებული' }) : null,
        m.role === 'user' ? el('span', { text: `in: ${m.input_tokens}` }) : el('span', { text: `out: ${m.output_tokens}` })),
      el('div', { class: 'text', text: m.content }),
      // Round 3 §4: კორექტურამდე რა დაწერა მოდელმა
      m.proofread_changed ? el('details', { class: 'pr-orig' }, el('summary', { text: 'ორიგინალი (კორექტურამდე)' }), el('div', { class: 'text', text: m.proofread_original })) : null);
  }));
}

$('proofread-toggle').addEventListener('click', async () => {
  const panel = $('proofread-panel');
  panel.hidden = !panel.hidden;
  $('proofread-toggle').setAttribute('aria-expanded', String(!panel.hidden));
  if (!panel.hidden) { await loadProofread(); panel.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
});
$('logout').addEventListener('click', async () => { await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }); location.reload(); });
$('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadClients, 250); });
$('budget-reset').addEventListener('click', async () => {
  await api('/api/admin/budget/reset', { method: 'POST' });
  await loadStats();
  $('budget-reset').textContent = 'განულებულია ✓';
  setTimeout(() => { $('budget-reset').textContent = 'ბიუჯეტის განულება ამ თვისთვის'; }, 2000);
});
$('reset-limit').addEventListener('click', async () => {
  if (!selected) return;
  await api(`/api/admin/clients/${encodeURIComponent(selected)}/reset-limit`, { method: 'POST' });
  await Promise.all([loadClients(), loadStats()]);
  $('reset-limit').textContent = 'განულებულია ✓';
  setTimeout(() => { $('reset-limit').textContent = 'ლიმიტის განულება ამ კლიენტისთვის'; }, 2000);
});

// ეს სკრიპტი მხოლოდ ავტორიზებულ არქივის გვერდზე იტვირთება (Round 7 §3) — პირდაპირ მონაცემები
showApp();
