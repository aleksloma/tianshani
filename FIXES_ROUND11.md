# FIXES_ROUND11 — mobile keyboard covers the message box; HTTP is not redirected to HTTPS

Read `PROJECT_CONTEXT.md`, `CLAUDE.md`, `AGENT_PROMPT.md` and `FIXES_ROUND1–10.md` first (if Round 10 is not implemented yet, implement it first and commit it separately). Standing rules apply in full: implement only what is written here, log everything else as a proposal in `DECISIONS.md`, visual design frozen (desktop must stay pixel-identical), canon untouched, testing is your job, finish with `TEST_REPORT.md`, `DECISIONS.md`, commits and a push to `main` (the server deploys `main` nightly at 04:00 Tbilisi time; do not touch the server).

Both bugs were reported by the owner from his phone on https://tianshani.ge.

---

## 1. On phones the keyboard covers the message box

### 1.1 What happens

On a phone the chat opens as a full-screen sheet and the textarea is focused automatically; the on-screen keyboard slides up **over** the bottom of the sheet, so the textarea, the send button and the attachment slip are hidden — the visitor cannot see what he is typing.

### 1.2 Why (verify and record in `DECISIONS.md`)

- `public/css/chat.css`: `.chat.sheet { position: fixed; inset: 0; height: 100vh; height: 100dvh; }`. `dvh` follows the browser's address/tool bars, **not the keyboard**.
- `public/index.html`: `<meta name="viewport" content="width=device-width, initial-scale=1">`. Since Chrome 108 on Android (and always on iOS Safari) the keyboard shrinks only the *visual* viewport; the *layout* viewport — which `position: fixed; inset: 0` and `100dvh` are measured against — keeps its full height, so the bottom of the sheet ends up under the keyboard.
- `public/js/chat.js` focuses the textarea with `input.focus({ preventScroll: true })` after the open animation, so the browser is also told not to scroll the field into view.

### 1.3 Fix (phones/tablets in sheet mode only — desktop untouched)

1. **Viewport meta** — `<meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content">`. On Chrome/Firefox for Android this makes the keyboard shrink the layout viewport, so the existing fixed sheet fits above it with no other change. Browsers that don't know the key ignore it.
2. **Visual Viewport fallback (iOS Safari and anything else)** — in `chat.js`, while the chat is open in sheet mode (`.chat.sheet`), subscribe to `window.visualViewport` `resize` and `scroll` (if the API exists) and set two CSS variables on the sheet: `--vvh` = `visualViewport.height` px and `--vvt` = `visualViewport.offsetTop` px; unsubscribe and clear them when the chat closes or leaves sheet mode. CSS: `.chat.sheet { top: var(--vvt, 0px); height: var(--vvh, 100dvh); bottom: auto; }` (keep the existing `100vh`/`100dvh` lines as the fallback before it). Throttle with `requestAnimationFrame`.
3. **Things positioned against the sheet must follow it.** The portrait clone in sheet mode (`.portrait.in-sheet`, positioned by JS, fixed) and the attachment slip (`#chat-attach`) must stay inside the shrunken sheet: recompute the portrait position from the sheet's `getBoundingClientRect()` when `--vvh/--vvt` change (reuse the existing `resize` handler at the bottom of `chat.js`). The header and portrait may stay as they are; only the log area (`.chat-log`, already `flex: 1; min-height: 0`) gets shorter.
4. **Keep the latest message and the input visible.** When the sheet height changes while the textarea has focus, scroll `#chat-log` to the bottom (`scrollTop = scrollHeight`) and make sure the form is fully inside the visual viewport. Keep `preventScroll: true` on the automatic focus (it prevents the page behind from jumping); the sheet resizing replaces the browser's own scroll-into-view.
5. **Page behind must not move.** While the sheet is open, the document behind must not scroll or pan when the keyboard opens (iOS tends to scroll the whole page): if not already done, keep `overflow: hidden` on `html, body` for the time the sheet is open and restore it on close. Verify the wall's scroll position is the same after closing the chat as before opening it.
6. Do not change when the keyboard opens (the automatic focus stays as it is) — if you think focusing on open is bad UX on phones, write it as a proposal only.

### 1.4 Tests

- **Unit** (jsdom or plain functions): the variable calculation from a fake `visualViewport` (height 400, offsetTop 0 → `--vvh: 400px`), subscription only in sheet mode, cleanup on close.
- **E2E phone 375×812 (and tablet 700)**: (a) Chromium with the new meta: open a chat, focus the textarea, then shrink the viewport to 375×450 with `page.setViewportSize` (this is what `resizes-content` does when a keyboard opens) → the textarea, send button and an attached slip are fully visible (bounding boxes inside 0…450), the last message is visible above them; (b) iOS path: inject a fake `window.visualViewport` (EventTarget with `height`/`offsetTop`), set height to 450 and fire `resize` → the same assertions; set it back to 812 → the sheet returns to full height; (c) close the chat → wall scroll position unchanged; (d) desktop 1280×800: no variables set, sheet mode not used, 0 changed pixels.
- **Screenshots** at 375×812 and 375×450 (keyboard simulated) for the report; desktop before/after diff must be 0.
- In `TEST_REPORT.md` add a short checklist for the owner to confirm on his real phone (open a chat, type, attach a copy, send, close).

## 2. "Not secure connection" when opening the site on the phone

### 2.1 What happens and why (already verified on the live server)

- The certificate is fine: Let's Encrypt, valid until 2027-01-23, covers `tianshani.ge` and `www.tianshani.ge`.
- But **`http://tianshani.ge/` is served as plain HTTP with no redirect** (checked: the page loads with `location.protocol === 'http:'`). cPanel's "Force HTTPS Redirect" is off and the app itself never redirects.
- When the address is typed without `https://`, or opened from a link/QR/message that uses `http://`, mobile Chrome (HTTPS-First / "Always use secure connections") shows its full-page "Connection is not secure" warning and makes the visitor tap through. Other browsers show "Not secure" in the address bar.

### 2.2 Fix in the app (defence in depth; the owner's assistant will also switch on cPanel's redirect)

In `src/server.js`, as the **first** middleware, only when `cfg.site.public_url` starts with `https://` (so local development on `http://localhost:3000` is unaffected):

1. If the request explicitly arrived over plain HTTP — `req.headers['x-forwarded-proto']` (first value) is `http`, or the connection is not TLS and there is no proxy header at all **and** `req.hostname` is the public host — respond `301` to `https://<public host><req.originalUrl>`. Never redirect when the proxy says `https` (avoid loops). `GET`/`HEAD` → 301; other methods → 308.
2. On every HTTPS response add `Strict-Transport-Security: max-age=31536000` (no `includeSubDomains`, no `preload` — the owner did not ask for that).
3. `www.tianshani.ge` → 301 to `https://tianshani.ge` (same path), so there is one canonical host for cookies and `localStorage` (a visitor's game state is per-origin; with two hosts he would have two separate games).
4. Make sure `{{ORIGIN}}` in `index.html` (`originOf(req)`) and the Open Graph URLs use the public `https://tianshani.ge` origin even if the request came in another way.

Log in `DECISIONS.md` how you established what headers LiteSpeed passes to the Node process (`x-forwarded-proto`, `x-forwarded-host`, `req.secure` with `trust proxy` 1). Since you cannot test on the server, make the middleware safe when headers are missing (then it does nothing rather than loop), and add a small diagnostic: `GET /api/health` additionally returns `{ secure: req.secure, proto: <x-forwarded-proto or null> }` so the owner's assistant can check it on the live site after deploy.

### 2.3 Tests

- **API**: with `site.public_url = "https://tianshani.ge"` — `X-Forwarded-Proto: http` → 301 to `https://tianshani.ge/same/path?q=1`; `X-Forwarded-Proto: https` → 200 + HSTS header; `Host: www.tianshani.ge` → 301 to apex; POST over http → 308; no proxy header + `Host: localhost` → 200, no redirect, no HSTS. With `public_url` empty or `http://localhost:3000` → never a redirect or HSTS (all existing tests keep passing unchanged).
- `/api/health` contains the two new fields and nothing secret.

## 3. Regression proof (in `TEST_REPORT.md`)

1. `npm run test:all` from a clean `npm ci`, all earlier tests unchanged.
2. Desktop 1280×800: 0 changed pixels (wall and open chat). Phone 375×812 without keyboard: 0 changed pixels.
3. Chat flows on the phone (send, attach copy with/without text, retrieve, redirect button, close) pass as in Round 9.
4. Local `npm start` on `http://localhost:3000` still works without HTTPS.

## 4. Close-out

`TEST_REPORT.md` → "Round 11" (incl. the owner's phone checklist), `DECISIONS.md` → `R11.x` / `P11.x`, `PROJECT_CONTEXT.md` behaviour summary (mobile keyboard handling, HTTPS redirect/HSTS/canonical host), commit in logical chunks, push to `main`, report hashes; note that it goes live at 04:00 Tbilisi time.
