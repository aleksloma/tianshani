// API (FIXES_ROUND2 §3 → Round 7 §2): გლობალური თვიური ლიმიტი ტოკენებში — 429 global_budget, /api/state.global,
// ადმინის ბარათი და განულება, mock-იც ითვლება, რეზერვი, ძველი დოლარის გასაღები აღარ არსებობს.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, chat, cookieJar, userMsg, GS } from '../helpers.mjs';

const MSG = 'ბიუჯეტში გარღვევა გვაქვს, თვის ბოლომდე დავიცადოთ.';
const nextMonth = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString(); };
const monthKey = () => new Date().toISOString().slice(0, 7);
const usd = (i, o) => i / 1e6 * 0.75 + o / 1e6 * 3.75;

async function adminJar(base) {
  const jar = cookieJar();
  const res = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-admin-pass' }) });
  jar.store(res);
  assert.equal(res.status, 200);
  return jar;
}
const state = async (base, jar) => (await fetch(`${base}/api/state`, { headers: jar ? { cookie: jar.header() } : {} })).json();

/** ერთი mock მოთხოვნის ტოკენები (შემ. + გამ.) — ლიმიტს ამაზე ვაწყობთ (პრომპტის ზომა რაუნდიდან რაუნდამდე იცვლება). */
async function measureOne() {
  const S = await startTestServer();
  try {
    const r = await chat(S.base, { characterId: 'tina', messages: userMsg('გამარჯობა'), gameState: GS });
    return r.done.usage.input + r.done.usage.output;
  } finally { await S.close(); }
}

test('პატარა global_monthly_tokens: პირველი გადის, მეორე 429 global_budget ზუსტი ტექსტით; /api/state.global ყველასთვის ამოწურულია', async () => {
  const one = await measureOne();
  const limit = Math.round(one * 1.5);
  const S = await startTestServer({ budget: { global_monthly_tokens: limit } });
  try {
    const a = cookieJar();
    const b = cookieJar();
    const r1 = await chat(S.base, { characterId: 'tina', messages: userMsg('გამარჯობა'), gameState: GS }, { jar: a });
    assert.equal(r1.status, 200);
    const r2 = await chat(S.base, { characterId: 'tina', messages: userMsg('კიდევ'), gameState: GS }, { jar: a });
    assert.equal(r2.status, 429);
    assert.deepEqual(r2.json, { error: 'global_budget', message: MSG, resets_at: nextMonth() });
    // სხვა ბრაუზერიც (სხვა client_id) იბლოკება
    const r3 = await chat(S.base, { characterId: 'vaso', messages: userMsg('გამარჯობა'), gameState: GS }, { jar: b });
    assert.equal(r3.status, 429);
    assert.equal(r3.json.error, 'global_budget');
    // გამოყენებული + ერთი სრული პასუხი (max_output_tokens) ლიმიტს აჭარბებს? — მაშინ ფანჯარა ჩატვირთვისთანავე
    const used = r1.done.usage.input + r1.done.usage.output;
    for (const j of [a, b]) {
      const st = await state(S.base, j);
      assert.deepEqual(Object.keys(st.global).sort(), ['estimated_usd', 'exhausted', 'resets_at', 'tokens_limit', 'tokens_used']);
      assert.equal(st.global.tokens_limit, limit);
      assert.equal(st.global.tokens_used, used);
      assert.equal(st.global.exhausted, used + S.cfg.gemini.max_output_tokens > limit);
      assert.equal(st.global.resets_at, nextMonth());
      assert.equal(st.global.estimated_usd, Math.round(usd(r1.done.usage.input, r1.done.usage.output) * 10000) / 10000);
      assert.equal(st.exhausted, false, 'ბრაუზერის ლიმიტი ხელუხლებელია');
    }
  } finally { await S.close(); }
});

test('mock-იც ითვლება (შემ. + გამ.); ლიმიტი ამოიწურა → 429 და exhausted; ადმინის ბარათი ტოკენებში; განულება ხელახლა რთავს (ბრაუზერის მთვლელი უცვლელი)', async () => {
  const S = await startTestServer({ budget: { global_monthly_tokens: 1_000_000 } });
  try {
    const jar = cookieJar();
    const r1 = await chat(S.base, { characterId: 'director', messages: userMsg('გამარჯობა'), gameState: GS }, { jar });
    assert.equal(r1.status, 200);
    const g1 = S.store.getGlobal(monthKey());
    assert.equal(g1.input_tokens, r1.done.usage.input);
    assert.equal(g1.output_tokens, r1.done.usage.output);
    assert.equal(g1.requests, 1);
    let st = await state(S.base, jar);
    assert.equal(st.global.exhausted, false);
    assert.equal(st.global.tokens_used, r1.done.usage.input + r1.done.usage.output);

    // თვის ტოკენებმა ლიმიტს მიაღწია (სიმულაცია: input + output ≥ 1 000 000)
    S.store.addGlobal(monthKey(), 1_000_000 - g1.input_tokens - g1.output_tokens, 0, 0);
    const r2 = await chat(S.base, { characterId: 'director', messages: userMsg('კიდევ'), gameState: GS }, { jar });
    assert.equal(r2.status, 429);
    assert.deepEqual(r2.json, { error: 'global_budget', message: MSG, resets_at: nextMonth() });
    st = await state(S.base, jar);
    assert.equal(st.global.exhausted, true);
    assert.equal(st.global.tokens_used, 1_000_000);

    // ადმინი: ბიუჯეტის ბარათი — ტოკენები / ლიმიტი, %, პროგნოზი ტოკენებში, დოლარი — შეფასება
    const admin = await adminJar(S.base);
    const stats = await (await fetch(`${S.base}/api/admin/stats`, { headers: { cookie: admin.header() } })).json();
    const B = stats.budget;
    assert.equal(B.tokens_limit, 1_000_000);
    assert.equal(B.tokens_used, 1_000_000);
    assert.equal(B.percent, 100);
    assert.equal(B.exhausted, true);
    assert.equal(B.warn, true);
    assert.equal(B.output_tokens, r1.done.usage.output);
    assert.ok(B.projected_tokens >= B.tokens_used);
    assert.ok(B.projected_percent >= 100);
    assert.ok(Math.abs(B.estimated_usd - usd(B.input_tokens, B.output_tokens)) < 1e-9);
    assert.ok(B.projected_usd >= B.estimated_usd - 1e-4);
    assert.ok(!('budget_usd' in B) && !('spent_usd' in B), 'დოლარი აღარაფერს კეტავს');
    assert.deepEqual(B.prices, { input_per_1m: 0.75, output_per_1m: 3.75 });
    // კლიენტების სიაში — ხარჯის შეფასება USD (დღევანდელი ფასებით)
    const clients = await (await fetch(`${S.base}/api/admin/clients`, { headers: { cookie: admin.header() } })).json();
    const me = clients.clients.find((c) => c.client_id === jar.get('tianshani_cid'));
    assert.equal(me.cost_usd, Math.round(usd(me.input_tokens, me.output_tokens) * 10000) / 10000);

    // განულება მხოლოდ ადმინისთვის
    assert.equal((await fetch(`${S.base}/api/admin/budget/reset`, { method: 'POST' })).status, 401);
    const usedBefore = (await state(S.base, jar)).used;
    const reset = await fetch(`${S.base}/api/admin/budget/reset`, { method: 'POST', headers: { cookie: admin.header() } });
    assert.equal(reset.status, 200);
    st = await state(S.base, jar);
    assert.equal(st.global.exhausted, false);
    assert.equal(st.global.tokens_used, 0);
    assert.deepEqual(st.used, usedBefore, 'ბრაუზერის მთვლელი არ შეცვლილა');
    const r3 = await chat(S.base, { characterId: 'director', messages: userMsg('ისევ აქ ვარ'), gameState: GS }, { jar });
    assert.equal(r3.status, 200);
  } finally { await S.close(); }
});

test('რეზერვი: თუ ეს მოთხოვნა ლიმიტს გადააჭარბებს — უარი, მთვლელი არ იზრდება', async () => {
  const S = await startTestServer({ budget: { global_monthly_tokens: 1_000_000 } });
  try {
    // დარჩა 1 000 ტოკენი: ერთი სრული პასუხი (180) ეტევა → ჯერ ამოწურული არ არის, მაგრამ პრომპტი (~2 000+) აღარ ეტევა
    S.store.addGlobal(monthKey(), 999_000, 0, 0);
    assert.equal((await state(S.base)).global.exhausted, false, 'ჯერ ამოწურული არ არის');
    const r = await chat(S.base, { characterId: 'director', messages: userMsg('გამარჯობა'), gameState: GS });
    assert.equal(r.status, 429);
    assert.equal(r.json.error, 'global_budget');
    const g = S.store.getGlobal(monthKey());
    assert.equal(g.input_tokens + g.output_tokens, 999_000);
  } finally { await S.close(); }
});

test('ლიმიტი 0 → გამორთულია (ტოკენები მაინც ითვლება); env GLOBAL_MONTHLY_TOKENS გადაფარავს', async () => {
  const S = await startTestServer({ budget: { global_monthly_tokens: 0 } });
  try {
    S.store.addGlobal(monthKey(), 9e9, 0, 0);
    const r = await chat(S.base, { characterId: 'tina', messages: userMsg('გამარჯობა'), gameState: GS });
    assert.equal(r.status, 200);
    assert.equal((await state(S.base)).global.exhausted, false);
    assert.ok(S.cfg.warnings.some((w) => w.includes('global_monthly_tokens')), S.cfg.warnings.join('\n'));
  } finally { await S.close(); }
  process.env.GLOBAL_MONTHLY_TOKENS = '7500';
  try {
    const { loadConfig } = await import('../../src/config.js');
    assert.equal(loadConfig().budget.global_monthly_tokens, 7500);
  } finally { delete process.env.GLOBAL_MONTHLY_TOKENS; }
});
