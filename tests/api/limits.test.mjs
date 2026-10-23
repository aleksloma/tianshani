// API: ტოკენების ლიმიტი (429 ქართული შეტყობინებით), lifetime პერიოდი, rate limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, chat, cookieJar, userMsg, GS } from '../helpers.mjs';

test('ტოკენების ლიმიტი: ამოწურვის შემდეგ 429 „ლიმიტი ამოიწურა…“, ბალანსი 0', async () => {
  // mock ~3000 შემავალ ტოკენს ხარჯავს თითო მოთხოვნაზე → 2 მოთხოვნა ამოწურავს 5000-ს
  const S = await startTestServer({ limits: { per_client_input_tokens: 5000, per_client_output_tokens: 1_000_000 } });
  try {
    const jar = cookieJar();
    const r1 = await chat(S.base, { characterId: 'tina', messages: userMsg('გამარჯობა'), gameState: GS }, { jar });
    assert.equal(r1.status, 200);
    const r2 = await chat(S.base, { characterId: 'tina', messages: userMsg('კიდევ'), gameState: GS }, { jar });
    assert.equal(r2.status, 200);
    assert.equal(r2.done.remaining.input, 0);
    const r3 = await chat(S.base, { characterId: 'tina', messages: userMsg('და კიდევ'), gameState: GS }, { jar });
    assert.equal(r3.status, 429);
    assert.equal(r3.json.error, 'ლიმიტი ამოიწურა. ბუღალტერია დაკეტილია, მომავალ თვეში მობრძანდით.');
    assert.equal(r3.json.code, 'limit');
    const st = await (await fetch(`${S.base}/api/state`, { headers: { cookie: jar.header() } })).json();
    assert.equal(st.exhausted, true);
    assert.equal(st.used.requests, 2);
    // სხვა ბრაუზერი — თავისი ლიმიტი
    const other = await chat(S.base, { characterId: 'tina', messages: userMsg('გამარჯობა'), gameState: GS });
    assert.equal(other.status, 200);
  } finally { await S.close(); }
});

test('გამომავალი ტოკენების ლიმიტიც მოქმედებს; lifetime → period_key "all"', async () => {
  const S = await startTestServer({ limits: { per_client_input_tokens: 1_000_000, per_client_output_tokens: 1, period: 'lifetime' } });
  try {
    const jar = cookieJar();
    const r1 = await chat(S.base, { characterId: 'vaso', messages: userMsg('გამარჯობა'), gameState: GS }, { jar });
    assert.equal(r1.status, 200);
    const r2 = await chat(S.base, { characterId: 'vaso', messages: userMsg('კიდევ'), gameState: GS }, { jar });
    assert.equal(r2.status, 429);
    assert.ok(r2.json.error.startsWith('ლიმიტი ამოიწურა.'));
    const st = await (await fetch(`${S.base}/api/state`, { headers: { cookie: jar.header() } })).json();
    assert.equal(st.period_key, 'all');
    assert.equal(st.period, 'lifetime');
  } finally { await S.close(); }
});

test('rate limit: max_requests_per_minute-ის შემდეგ 429 code=rate', async () => {
  const S = await startTestServer({ limits: { max_requests_per_minute: 3 } });
  try {
    const jar = cookieJar();
    for (let i = 0; i < 3; i++) {
      const r = await chat(S.base, { characterId: 'bela', messages: userMsg(`${i}`), gameState: GS }, { jar });
      assert.equal(r.status, 200);
    }
    const r = await chat(S.base, { characterId: 'bela', messages: userMsg('ბოლო'), gameState: GS }, { jar });
    assert.equal(r.status, 429);
    assert.equal(r.json.code, 'rate');
  } finally { await S.close(); }
});
