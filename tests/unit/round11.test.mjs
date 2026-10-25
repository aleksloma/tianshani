// Round 11 §1: ჩატის sheet ხილულ viewport-ს მიჰყვება (კლავიატურა ტელეფონზე) — ცვლადების გამოთვლა, გამოწერა მხოლოდ
// sheet-ის რეჟიმში, მოხსნა დახურვისას. ყალბი visualViewport (EventTarget) და ყალბი style.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { viewportVars, createViewportSync } from '../../public/js/viewport.js';
import { canonicalHttps, forwardedProto, HSTS } from '../../src/https.js';

/** ყალბი visualViewport: height/offsetTop იცვლება, listener-ები ითვლება. */
function fakeVV(height = 812, offsetTop = 0) {
  const vv = new EventTarget();
  Object.assign(vv, { height, offsetTop, listeners: 0 });
  const add = vv.addEventListener.bind(vv);
  const remove = vv.removeEventListener.bind(vv);
  vv.addEventListener = (...a) => { vv.listeners += 1; add(...a); };
  vv.removeEventListener = (...a) => { vv.listeners -= 1; remove(...a); };
  return vv;
}
function fakeTarget() {
  const props = new Map();
  return { props, style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) } };
}
/** rAF-ის რიგი — კადრი ხელით „ტრიალდება“. */
function fakeRaf() {
  const q = [];
  const raf = (fn) => q.push(fn);
  raf.frame = () => { const fns = q.splice(0); for (const f of fns) f(); return fns.length; };
  return raf;
}

test('§1.3 viewportVars: height 400, offsetTop 0 → --vvh: 400px, --vvt: 0px', () => {
  assert.deepEqual(viewportVars({ height: 400, offsetTop: 0 }), { '--vvh': '400px', '--vvt': '0px' });
  assert.deepEqual(viewportVars({ height: 451.5, offsetTop: 120 }), { '--vvh': '451.5px', '--vvt': '120px' });
});

test('§1.3 გამოწერა მხოლოდ sheet-ის რეჟიმში; ცვლადები მაშინვე; განახლება ერთხელ კადრში; დახურვა — მოხსნა და წაშლა', () => {
  const vv = fakeVV(812, 0);
  const t = fakeTarget();
  const raf = fakeRaf();
  const seen = [];
  const sync = createViewportSync({ target: t, vv, raf, onChange: (v) => seen.push(v['--vvh']) });

  sync.toggle(false); // დესკტოპი / არა sheet
  assert.equal(vv.listeners, 0);
  assert.equal(t.props.size, 0);
  assert.equal(sync.active(), false);

  sync.toggle(true); // sheet გაიხსნა
  assert.equal(vv.listeners, 2, 'resize + scroll');
  assert.deepEqual([...t.props], [['--vvh', '812px'], ['--vvt', '0px']]);
  sync.toggle(true); // მეორედ — არაფერი ორმაგდება
  assert.equal(vv.listeners, 2);

  // კლავიატურა: რამდენიმე ივენთი ერთ კადრში → ერთი განახლება
  vv.height = 450;
  vv.dispatchEvent(new Event('resize'));
  vv.dispatchEvent(new Event('resize'));
  vv.offsetTop = 120;
  vv.dispatchEvent(new Event('scroll'));
  assert.equal(t.props.get('--vvh'), '812px', 'კადრამდე — ძველი');
  assert.equal(raf.frame(), 1);
  assert.deepEqual([...t.props], [['--vvh', '450px'], ['--vvt', '120px']]);
  assert.deepEqual(seen, ['812px', '450px']);

  // დახურვა
  sync.stop();
  assert.equal(vv.listeners, 0);
  assert.equal(t.props.size, 0);
  vv.height = 300;
  vv.dispatchEvent(new Event('resize'));
  assert.equal(raf.frame(), 0, 'დახურვის შემდეგ ივენთი აღარაფერს აკეთებს');
  assert.equal(t.props.size, 0);

  // დაგეგმილი განახლება დახურვის შემდეგ — არ იწერება
  sync.toggle(true);
  vv.dispatchEvent(new Event('resize'));
  sync.toggle(false); // sheet-ის რეჟიმიდან გამოსვლა (მაგ. ეკრანის მობრუნება)
  raf.frame();
  assert.equal(t.props.size, 0);
  assert.equal(vv.listeners, 0);
});

test('§1.3 visualViewport API-ს გარეშე — არაფერი (sheet CSS-ის 100dvh-ზე რჩება)', () => {
  const t = fakeTarget();
  const sync = createViewportSync({ target: t, vv: undefined, raf: fakeRaf() });
  sync.toggle(true);
  assert.equal(sync.active(), false);
  assert.equal(t.props.size, 0);
  sync.stop();
});

test('§1.3 CSS და meta: sheet ცვლადებს მიჰყვება (100vh/100dvh — სათადარიგოდ), viewport-ის meta — resizes-content', () => {
  const css = fs.readFileSync(new URL('../../public/css/chat.css', import.meta.url), 'utf8');
  const sheet = css.slice(css.indexOf('.chat.sheet {'), css.indexOf('}', css.indexOf('.chat.sheet {')));
  const order = ['height: 100vh;', 'height: 100dvh;', 'top: var(--vvt, 0px);', 'height: var(--vvh, 100dvh);', 'bottom: auto;'].map((s) => sheet.indexOf(s));
  assert.ok(order.every((i) => i >= 0), JSON.stringify(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  const html = fs.readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content">'));
});

// ---------- §2: http → https, HSTS, www → apex (ყალბი req/res) ----------

function run(mw, { method = 'GET', hostname = 'tianshani.ge', url = '/a/b?q=1', headers = {}, tls = false } = {}) {
  const out = { status: null, location: null, headers: {}, next: false };
  const req = { method, hostname, originalUrl: url, headers, socket: { encrypted: tls } };
  const res = {
    redirect: (status, location) => { out.status = status; out.location = location; },
    setHeader: (k, v) => { out.headers[k.toLowerCase()] = v; },
  };
  mw(req, res, () => { out.next = true; });
  return out;
}

test('§2 canonicalHttps: public_url https:// — http → 301/308, https → HSTS, www → apex, ჰედერის გარეშე ლოკალური ჰოსტი — არაფერი', () => {
  const mw = canonicalHttps({ site: { public_url: 'https://tianshani.ge' } });
  assert.deepEqual(run(mw, { headers: { 'x-forwarded-proto': 'http' } }), { status: 301, location: 'https://tianshani.ge/a/b?q=1', headers: {}, next: false });
  assert.equal(run(mw, { method: 'HEAD', headers: { 'x-forwarded-proto': 'http' } }).status, 301);
  assert.equal(run(mw, { method: 'POST', headers: { 'x-forwarded-proto': 'http' } }).status, 308);
  assert.equal(run(mw, { headers: { 'x-forwarded-proto': 'HTTP, https' } }).status, 301, 'პირველი მნიშვნელობა, რეგისტრის გარეშე');
  assert.deepEqual(run(mw, { headers: { 'x-forwarded-proto': 'https' } }), { status: null, location: null, headers: { 'strict-transport-security': HSTS }, next: true });
  assert.equal(HSTS, 'max-age=31536000');
  assert.deepEqual(run(mw, { tls: true }).headers, { 'strict-transport-security': HSTS }, 'პირდაპირი TLS');
  // www → apex — ნებისმიერი პროტოკოლით, ერთი ნაბიჯით
  for (const headers of [{ 'x-forwarded-proto': 'https' }, { 'x-forwarded-proto': 'http' }, {}]) {
    assert.deepEqual([run(mw, { hostname: 'www.tianshani.ge', headers }).status, run(mw, { hostname: 'www.tianshani.ge', headers }).location], [301, 'https://tianshani.ge/a/b?q=1']);
  }
  assert.equal(run(mw, { method: 'POST', hostname: 'www.tianshani.ge' }).status, 308);
  // ჰედერის გარეშე: საჯარო ჰოსტი და TLS არ არის → http; ლოკალური ჰოსტი → არაფერი (არც HSTS)
  assert.equal(run(mw, {}).status, 301);
  assert.deepEqual(run(mw, { hostname: 'localhost' }), { status: null, location: null, headers: {}, next: true });
  assert.deepEqual(run(mw, { hostname: '127.0.0.1' }), { status: null, location: null, headers: {}, next: true });
  assert.equal(forwardedProto({ headers: {} }), null);
});

test('§2 canonicalHttps: public_url ცარიელი ან http:// — ყოველთვის გამჭვირვალე (ლოკალური http://localhost:3000)', () => {
  for (const public_url of ['', 'http://localhost:3000', 'not a url', undefined]) {
    const mw = canonicalHttps({ site: { public_url } });
    for (const opts of [{ headers: { 'x-forwarded-proto': 'http' } }, { headers: { 'x-forwarded-proto': 'https' } }, { hostname: 'www.tianshani.ge' }, { hostname: 'localhost' }]) {
      assert.deepEqual(run(mw, opts), { status: null, location: null, headers: {}, next: true }, `${public_url} ${JSON.stringify(opts)}`);
    }
  }
  assert.deepEqual(run(canonicalHttps({}), {}), { status: null, location: null, headers: {}, next: true });
});
