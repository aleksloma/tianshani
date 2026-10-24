// Round 4 API: §3 საშუალო შემავალი ერთ კითხვაზე (/api/state და SSE done).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, chat, cookieJar, userMsg, GS } from '../helpers.mjs';

let S;
before(async () => { S = await startTestServer(); });
after(async () => { await S.close(); });

test('§8 /api/characters: ყველას აქვს openers (უხილავს — წარმომადგენლის ხაზი spoken_by-ით)', async () => {
  const j = await (await fetch(`${S.base}/api/characters`)).json();
  for (const c of j.characters) {
    assert.ok(Array.isArray(c.openers) && c.openers.length >= 3, c.id);
    if (!c.reachable) assert.ok(c.openers.every((o) => c.proxies.includes(o.spoken_by)), c.id);
  }
});

test('§3 avg_input_per_request: < 3 მოთხოვნაზე null, მერე ამ ბრაუზერის ნამდვილი საშუალო (/api/state და done)', async () => {
  const jar = cookieJar();
  const state = async () => (await fetch(`${S.base}/api/state`, { headers: { cookie: jar.header() } })).json();
  const inputs = [];
  for (let i = 0; i < 3; i++) {
    const r = await chat(S.base, { characterId: 'tina', messages: userMsg(`გამარჯობა ${i}`), gameState: GS }, { jar });
    assert.equal(r.status, 200);
    inputs.push(r.done.usage.input);
    assert.equal(r.done.requests, i + 1);
    if (i < 2) assert.equal(r.done.avg_input_per_request, null, `${i + 1} მოთხოვნა`);
    else assert.equal(r.done.avg_input_per_request, Math.round(inputs.reduce((a, b) => a + b, 0) / 3));
  }
  const st = await state();
  assert.equal(st.used.requests, 3);
  assert.equal(st.avg_input_per_request, Math.round(inputs.reduce((a, b) => a + b, 0) / 3));
  const fresh = await (await fetch(`${S.base}/api/state`)).json();
  assert.equal(fresh.avg_input_per_request, null);
});
