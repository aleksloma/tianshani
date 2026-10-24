// Round 4 API: §3 საშუალო შემავალი ერთ კითხვაზე (/api/state და SSE done).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, chat, cookieJar, userMsg, GS } from '../helpers.mjs';

let S;
before(async () => { S = await startTestServer(); });
after(async () => { await S.close(); });

test('§8 მეტატეგები: description, og:* სრული მისამართით, twitter:card, favicon SVG+PNG, apple-touch-icon, lang="ka"', async () => {
  const sharp = (await import('sharp')).default;
  const html = await (await fetch(`${S.base}/`)).text();
  assert.match(html, /<html lang="ka">/);
  assert.match(html, /<meta name="description" content="[^"]*ხელნაწერს[^"]*">/);
  assert.ok(!html.includes('{{ORIGIN}}'), 'ჩანაცვლებულია');
  assert.ok(html.includes(`<meta property="og:image" content="${S.base}/assets/og.jpg">`), 'og:image — სრული მისამართი');
  assert.ok(html.includes(`<meta property="og:url" content="${S.base}/">`));
  for (const p of ['og:title', 'og:description', 'og:type', 'og:image:width', 'og:image:height']) assert.ok(html.includes(`property="${p}"`), p);
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
  assert.ok(html.includes('href="assets/favicon.svg"') && html.includes('href="assets/favicon.png"') && html.includes('href="assets/apple-touch-icon.png"'));
  assert.equal((await fetch(`${S.base}/index.html`)).status, 200);
  for (const [p, w, h] of [['/assets/og.jpg', 1200, 630], ['/assets/favicon.png', 64, 64], ['/assets/apple-touch-icon.png', 180, 180]]) {
    const res = await fetch(`${S.base}${p}`);
    assert.equal(res.status, 200, p);
    const m = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    assert.deepEqual([m.width, m.height], [w, h], p);
  }
  const og = await (await fetch(`${S.base}/assets/og.jpg`)).arrayBuffer();
  assert.ok(og.byteLength <= 200 * 1024, `${og.byteLength}`);
});

test('§8 Host ჰედერი გვერდში ვერ „ჩაიდება“ (მხოლოდ უსაფრთხო სიმბოლოები)', async () => {
  const http = await import('node:http');
  const { port } = new URL(S.base);
  const body = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/', headers: { Host: 'evil.example"><script>x</script>' } }, (res) => {
      let d = ''; res.setEncoding('utf8'); res.on('data', (c) => { d += c; }); res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.end();
  });
  assert.ok(!body.includes('<script>x</script>'));
  assert.ok(body.includes('<meta property="og:image" content="/assets/og.jpg">'), 'host არ გამოდგა → შედარებითი მისამართი');
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
