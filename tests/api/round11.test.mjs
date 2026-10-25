// Round 11 §2 (API): http → https (301/308), HSTS, www → apex, ლოკალური http ხელუხლებელი; /api/health-ის დიაგნოსტიკა.
// node:http-ით (fetch Host ჰედერს ვერ ცვლის), გადამისამართებას არ მივყვებით.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startTestServer } from '../helpers.mjs';

function raw(base, path, { method = 'GET', headers = {}, body = null } = {}) {
  const u = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path, method, headers }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const S = {};
before(async () => {
  S.pub = await startTestServer({ site: { public_url: 'https://tianshani.ge' } });
  S.none = await startTestServer({ site: { public_url: '' } });
  S.local = await startTestServer({ site: { public_url: 'http://localhost:3000' } });
});
after(async () => { for (const s of Object.values(S)) await s.close(); });

test('public_url https://tianshani.ge: X-Forwarded-Proto http → 301 იმავე მისამართზე https-ით; POST → 308', async () => {
  const r = await raw(S.pub.base, '/same/path?q=1', { headers: { Host: 'tianshani.ge', 'X-Forwarded-Proto': 'http' } });
  assert.equal(r.status, 301);
  assert.equal(r.headers.location, 'https://tianshani.ge/same/path?q=1');
  assert.equal(r.headers['strict-transport-security'], undefined);
  const api = await raw(S.pub.base, '/api/state', { headers: { Host: 'tianshani.ge', 'X-Forwarded-Proto': 'http' } });
  assert.deepEqual([api.status, api.headers.location], [301, 'https://tianshani.ge/api/state']);
  const post = await raw(S.pub.base, '/api/chat', { method: 'POST', headers: { Host: 'tianshani.ge', 'X-Forwarded-Proto': 'http', 'Content-Type': 'application/json' }, body: '{}' });
  assert.deepEqual([post.status, post.headers.location], [308, 'https://tianshani.ge/api/chat']);
  // ჰედერის გარეშე, საჯარო ჰოსტი (TLS არ არის) — იგივე
  const bare = await raw(S.pub.base, '/x', { headers: { Host: 'tianshani.ge' } });
  assert.deepEqual([bare.status, bare.headers.location], [301, 'https://tianshani.ge/x']);
});

test('X-Forwarded-Proto https → 200 + Strict-Transport-Security (includeSubDomains/preload-ის გარეშე); og:url — საჯარო https', async () => {
  const r = await raw(S.pub.base, '/', { headers: { Host: 'tianshani.ge', 'X-Forwarded-Proto': 'https' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers['strict-transport-security'], 'max-age=31536000');
  assert.ok(r.body.includes('<meta property="og:url" content="https://tianshani.ge/">'));
  const h = await raw(S.pub.base, '/api/health', { headers: { Host: 'tianshani.ge', 'X-Forwarded-Proto': 'https' } });
  assert.deepEqual(JSON.parse(h.body), { ok: true, provider: 'mock', model: 'mock', secure: true, proto: 'https' });
  assert.equal(h.headers['strict-transport-security'], 'max-age=31536000');
});

test('Host www.tianshani.ge → 301 apex-ზე (იგივე გზა), ორივე პროტოკოლით', async () => {
  for (const proto of ['https', 'http']) {
    const r = await raw(S.pub.base, '/a?b=1', { headers: { Host: 'www.tianshani.ge', 'X-Forwarded-Proto': proto } });
    assert.deepEqual([r.status, r.headers.location], [301, 'https://tianshani.ge/a?b=1'], proto);
  }
});

test('პროქსის ჰედერის გარეშე + Host localhost → 200, გადამისამართება და HSTS არ არის; og:url მაინც საჯარო https', async () => {
  const r = await raw(S.pub.base, '/', { headers: { Host: 'localhost:3000' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.location, undefined);
  assert.equal(r.headers['strict-transport-security'], undefined);
  assert.ok(r.body.includes('<meta property="og:url" content="https://tianshani.ge/">'));
  const h = JSON.parse((await raw(S.pub.base, '/api/health', { headers: { Host: 'localhost' } })).body);
  assert.deepEqual(h, { ok: true, provider: 'mock', model: 'mock', secure: false, proto: null });
});

test('public_url ცარიელი ან http://localhost:3000 — არასდროს გადამისამართება ან HSTS; /api/health-ში საიდუმლო არ არის', async () => {
  for (const s of [S.none, S.local]) {
    for (const headers of [{ Host: 'tianshani.ge', 'X-Forwarded-Proto': 'http' }, { Host: 'tianshani.ge', 'X-Forwarded-Proto': 'https' }, { Host: 'www.tianshani.ge' }, { Host: 'localhost' }]) {
      const r = await raw(s.base, '/', { headers });
      assert.equal(r.status, 200, JSON.stringify(headers));
      assert.equal(r.headers['strict-transport-security'], undefined);
    }
    const h = await raw(s.base, '/api/health', { headers: { Host: 'localhost', 'X-Forwarded-Proto': 'https' } });
    const body = JSON.parse(h.body);
    assert.deepEqual(Object.keys(body).sort(), ['model', 'ok', 'proto', 'provider', 'secure']);
    assert.equal(body.proto, 'https');
    assert.equal(body.secure, true);
    for (const secret of [s.cfg.admin.password, s.cfg.gemini.api_key].filter(Boolean)) assert.ok(!h.body.includes(secret));
  }
});
