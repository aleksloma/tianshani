// API (FIXES_ROUND2 §3): გლობალური თვიური ბიუჯეტი — 429 global_budget, /api/state.global, ადმინის ბარათი და განულება, mock-იც ითვლება.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, chat, cookieJar, userMsg, GS } from '../helpers.mjs';

const MSG = 'ბიუჯეტში გარღვევა გვაქვს, თვის ბოლომდე დავიცადოთ.';
const nextMonth = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString(); };
const monthKey = () => new Date().toISOString().slice(0, 7);

async function adminJar(base) {
  const jar = cookieJar();
  const res = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-admin-pass' }) });
  jar.store(res);
  assert.equal(res.status, 200);
  return jar;
}
const state = async (base, jar) => (await fetch(`${base}/api/state`, { headers: jar ? { cookie: jar.header() } : {} })).json();

test('global_monthly_usd 0.0001: მოთხოვნა 429 global_budget ზუსტი ტექსტით; /api/state.global.exhausted ყველასთვის', async () => {
  const S = await startTestServer({ budget: { global_monthly_usd: 0.0001 } });
  try {
    const a = cookieJar();
    const b = cookieJar();
    // პირველი შეიძლება გავიდეს (აქ რეზერვი უკვე ბიუჯეტზე დიდია → უარი), მეორე — აუცილებლად 429
    const r1 = await chat(S.base, { characterId: 'tina', messages: userMsg('გამარჯობა'), gameState: GS }, { jar: a });
    assert.ok([200, 429].includes(r1.status));
    const r2 = await chat(S.base, { characterId: 'tina', messages: userMsg('კიდევ'), gameState: GS }, { jar: a });
    assert.equal(r2.status, 429);
    assert.deepEqual(r2.json, { error: 'global_budget', message: MSG, resets_at: nextMonth() });
    // სხვა ბრაუზერიც (სხვა client_id) იბლოკება
    const r3 = await chat(S.base, { characterId: 'vaso', messages: userMsg('გამარჯობა'), gameState: GS }, { jar: b });
    assert.equal(r3.status, 429);
    assert.equal(r3.json.error, 'global_budget');
    for (const j of [a, b]) {
      const st = await state(S.base, j);
      assert.equal(st.global.exhausted, true);
      assert.equal(st.global.budget_usd, 0.0001);
      assert.equal(st.global.resets_at, nextMonth());
      assert.equal(st.exhausted, false, 'ბრაუზერის ლიმიტი ხელუხლებელია');
    }
  } finally { await S.close(); }
});

test('mock-იც ითვლება გლობალურ მთვლელში; ამოწურვა → 429; ადმინის განულება ხელახლა რთავს (ბრაუზერის მთვლელი უცვლელი)', async () => {
  const S = await startTestServer({ budget: { global_monthly_usd: 1 } });
  try {
    const jar = cookieJar();
    const r1 = await chat(S.base, { characterId: 'director', messages: userMsg('გამარჯობა'), gameState: GS }, { jar });
    assert.equal(r1.status, 200);
    const g1 = S.store.getGlobal(monthKey());
    assert.equal(g1.input_tokens, r1.done.usage.input);
    assert.equal(g1.output_tokens, r1.done.usage.output);
    assert.equal(g1.requests, 1);
    assert.ok(Math.abs(g1.cost_usd - (r1.done.usage.input / 1e6 * 0.75 + r1.done.usage.output / 1e6 * 3.75)) < 1e-12);
    let st = await state(S.base, jar);
    assert.equal(st.global.exhausted, false);
    assert.ok(st.global.spent_usd > 0);

    // თვის ხარჯი ბიუჯეტს მიაღწია (სიმულაცია)
    S.store.addGlobal(monthKey(), 0, 0, 1);
    const r2 = await chat(S.base, { characterId: 'director', messages: userMsg('კიდევ'), gameState: GS }, { jar });
    assert.equal(r2.status, 429);
    assert.deepEqual(r2.json, { error: 'global_budget', message: MSG, resets_at: nextMonth() });
    st = await state(S.base, jar);
    assert.equal(st.global.exhausted, true);

    // ადმინი: ბიუჯეტის ბარათი
    const admin = await adminJar(S.base);
    const stats = await (await fetch(`${S.base}/api/admin/stats`, { headers: { cookie: admin.header() } })).json();
    assert.equal(stats.budget.budget_usd, 1);
    assert.ok(stats.budget.spent_usd >= 1);
    assert.ok(stats.budget.percent >= 100);
    assert.equal(stats.budget.exhausted, true);
    assert.equal(stats.budget.warn, true);
    assert.equal(stats.budget.input_tokens, r1.done.usage.input);
    assert.ok(stats.budget.projected_usd >= stats.budget.spent_usd);
    assert.deepEqual(stats.budget.prices, { input_per_1m: 0.75, output_per_1m: 3.75 });
    // კლიენტების სიაში — ხარჯი USD
    const clients = await (await fetch(`${S.base}/api/admin/clients`, { headers: { cookie: admin.header() } })).json();
    const me = clients.clients.find((c) => c.client_id === jar.get('tianshani_cid'));
    assert.ok(me.cost_usd > 0);
    assert.equal(me.cost_usd, Math.round((me.input_tokens / 1e6 * 0.75 + me.output_tokens / 1e6 * 3.75) * 10000) / 10000);

    // განულება მხოლოდ ადმინისთვის
    assert.equal((await fetch(`${S.base}/api/admin/budget/reset`, { method: 'POST' })).status, 401);
    const usedBefore = (await state(S.base, jar)).used;
    const reset = await fetch(`${S.base}/api/admin/budget/reset`, { method: 'POST', headers: { cookie: admin.header() } });
    assert.equal(reset.status, 200);
    st = await state(S.base, jar);
    assert.equal(st.global.exhausted, false);
    assert.equal(st.global.spent_usd, 0);
    assert.deepEqual(st.used, usedBefore, 'ბრაუზერის მთვლელი არ შეცვლილა');
    const r3 = await chat(S.base, { characterId: 'director', messages: userMsg('ისევ აქ ვარ'), gameState: GS }, { jar });
    assert.equal(r3.status, 200);
  } finally { await S.close(); }
});

test('რეზერვი: თუ ბოლო მოთხოვნა ბიუჯეტს გადააჭარბებს — უარი, ხარჯი არ იზრდება', async () => {
  const S = await startTestServer({ budget: { global_monthly_usd: 1 } });
  try {
    // დარჩენილია მხოლოდ max_output_tokens-ის (250 × 3.75 / 1e6 ≈ $0.00094) ოდნავ მეტი — პრომპტი (~$0.002) აღარ ეტევა
    S.store.addGlobal(monthKey(), 0, 0, 1 - 0.0012);
    const st = await state(S.base);
    assert.equal(st.global.exhausted, false, 'ჯერ ამოწურული არ არის');
    const r = await chat(S.base, { characterId: 'director', messages: userMsg('გამარჯობა'), gameState: GS });
    assert.equal(r.status, 429);
    assert.equal(r.json.error, 'global_budget');
    assert.ok(Math.abs(S.store.getGlobal(monthKey()).cost_usd - (1 - 0.0012)) < 1e-12);
  } finally { await S.close(); }
});

test('ბიუჯეტი 0 → გამორთულია; env GLOBAL_MONTHLY_USD გადაფარავს', async () => {
  const S = await startTestServer({ budget: { global_monthly_usd: 0 } });
  try {
    S.store.addGlobal(monthKey(), 0, 0, 999);
    const r = await chat(S.base, { characterId: 'tina', messages: userMsg('გამარჯობა'), gameState: GS });
    assert.equal(r.status, 200);
    assert.equal((await state(S.base)).global.exhausted, false);
    assert.ok(S.cfg.warnings.some((w) => w.includes('budget')), S.cfg.warnings.join('\n'));
  } finally { await S.close(); }
  process.env.GLOBAL_MONTHLY_USD = '7.5';
  try {
    const { loadConfig } = await import('../../src/config.js');
    assert.equal(loadConfig().budget.global_monthly_usd, 7.5);
  } finally { delete process.env.GLOBAL_MONTHLY_USD; }
});
