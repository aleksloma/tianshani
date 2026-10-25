# Fix round 7 — redirect button, global cap in tokens, admin page gating, logs per user profile

`AGENT_PROMPT.md` and `FIXES_ROUND1–6.md` remain the spec; this file changes/extends them. Round 6 was verified live and is good. **Visual design is approved — do not change layout, sizes, background, fonts or colours.** Standing rules from round 6 §1 apply: no unrequested UI text, no changes on your own initiative — proposals go to `DECISIONS.md` → „Proposals (not implemented)“.

Implement every item, update tests, run `npm run test:all` from a clean `npm ci`, update `TEST_REPORT.md` ("Round 7 fixes") and `DECISIONS.md`, commit in logical chunks, push to `github.com/aleksloma/tianshani` `main`, report commit hashes.

---

## 1. The „→ მივიდე …-სთან“ redirect button never appears

Observed: in 8 real replies across 3 characters `suggested_redirect` was always `null`, although Otari explicitly sent the user to Grisha („გრიშასთან ჩაიარე ქვევით“) and mentioned Kopaleishvili. The current gate (round 2 §8: only from the 3rd manuscript message *and* only if the reply names a `redirects_to` character) effectively kills the button.

- **New rule for the button:** `suggested_redirect` is set whenever the reply text mentions, by name, any **reachable** character other than the one speaking (not only those in `redirects_to`), from the very first message. Match on `name_ka`, `short_name_ka` and the common inflected forms (Georgian case endings: -ს, -სთან, -მა, -ის, -თან, -ო vocative; e.g. გრიშა → გრიშას/გრიშასთან/გრიშამ; ოთარი → ოთართან/ოთარს/ოთარ დავიდოვიჩს). Build the matcher from the data, not by hand; include the invisible characters too (the button then opens the proxy chat, which is the correct experience: „→ მივიდე გივისთან“).
- If several characters are named, pick the one that appears **last** in the reply (that is usually where the character sends the user). Never suggest the speaking character or the current proxy.
- The 3-message pacing rule stays **in the prompt only** (when the character starts steering away); it no longer gates the button.
- Button label stays „→ მივიდე <სახელი>-სთან“ with correct case for the name (use `short_name_ka` + „-სთან“; for names ending in a vowel handle „ა“/„ე“/„ო“ correctly: გრიშა → გრიშასთან, კოტე → კოტესთან, სოსო → სოსოსთან; for consonant endings: ოთარი → ოთართან, ვასო → ვასოსთან). Add a tiny helper with unit tests for these forms.
- Tests: unit — matcher finds names in inflected forms and ignores the speaker; integration (mock) — a mock reply naming „გრიშასთან“ yields `suggested_redirect: "grisha"`; e2e — the button appears after such a reply and opens Grisha's chat (closing the current one, calendar +20 as per round 3 §2). Real-API smoke (if key): the Otari scenario („ხელნაწერი წაიკითხეთ?“ → „ოთხი თვეა ველოდები“) — log whether the button would appear.

## 2. Global monthly cap: expressed in tokens, not dollars

Decision: **no per-IP tracking** (the company's staff share one IP and would all be throttled together) — the per-browser limit stays as is, and the global monthly cap remains the backstop. Change the cap from USD to a **total token count**:

- Replace `budget.global_monthly_usd` with **`budget.global_monthly_tokens`** = **45 000 000** (input + output combined, per calendar month, UTC). At today's intro prices that is roughly $45–50 depending on the input/output mix (≈6 500 input + ≈170 output per message → ≈6 700 messages ≈ $33 input + $4 output; the ceiling if all tokens were output would be far higher, which is why the combined number is set at 45M, not 60M). Keep `price_input_per_1m_usd` / `price_output_per_1m_usd` in config **only** for the admin page's cost estimate; they no longer gate anything.
- Server check before each request: `global_input + global_output ≥ global_monthly_tokens` → 429 `global_budget` with the same Georgian modal text as before (round 2 §3), plus the reserve logic (estimate of this request's tokens must fit). `GET /api/state → global` returns `{ tokens_limit, tokens_used, exhausted, resets_at, estimated_usd }`.
- Admin „ბიუჯეტი“ card: show tokens used / limit with a bar and %, projected month-end tokens, and the USD estimate as a secondary line („≈ $12,40 დღევანდელი ფასებით“). Reset button unchanged. `warn_at_percent` unchanged (now on tokens).
- Env override `GLOBAL_MONTHLY_TOKENS` replaces `GLOBAL_MONTHLY_USD`; update `settings.example.json`, README/SETUP, and remove the old key (fail fast with a clear startup message if `global_monthly_usd` is still present in a settings file, telling the owner the new key name).
- Tests: unit — cap formula, reserve, period key; integration — tiny `global_monthly_tokens` in test settings → second request 429, `/api/state` exhausted, admin reset re-enables; e2e — modal on load for two client contexts, gone after reset.

## 3. Admin page: nothing but the login form before authentication

Observed: `GET /admin` returns the full admin shell (budget card, „შესწორებული პასუხები“, client list, export/reset buttons) even when not logged in; only the data calls return 401. Serve the **login form alone** until the session cookie is valid: either server-side (two templates: `admin-login.html` and `admin.html`, the latter only after auth) or by redirecting unauthenticated `/admin` to `/admin/login`. No admin markup, script or endpoint names in the unauthenticated response. Keep the existing login flow and styling. Tests: integration — unauthenticated `/admin` body contains the password field and none of „ბიუჯეტი“, „ექსპორტი“, „ბრაუზერები“; authenticated `/admin` contains them.

## 4. Logs are stored under the user profile (name + browser id) — verify and make it explicit

Requirement: every conversation in the server logs must be attributable to a **user profile = browser `client_id` + the name the user entered**, and the admin page must present conversations under that profile.

- Verify the DB: `clients` has `user_name` (latest value) and `messages` rows carry `client_id` **and** the `user_name` as it was at the time of the message (a user can rename themselves; keep history honest). If any of this is missing, add it with a migration that back-fills `user_name` from the latest known name or `null`.
- Every `POST /api/chat` must update `clients.user_name` and `last_seen` and write `user_name` on both the user and the assistant rows. Scripted/stripped messages (round 5) never reach the DB.
- Admin „ბრაუზერები“ list: each row shows **name first** („ალექსანდრე“ or „— უსახელო“), then the short client id, last seen, message count, tokens; the search box matches on name as well as id. The per-client „საქმე“ view header shows the profile (name + full client id + first/last seen) and, if the name changed over time, lists the previous names with dates. Export JSON includes `user_name` on every message.
- Tests: integration — two requests from the same client with different `userName` values → `clients.user_name` is the latest, each message row keeps the name used at that time; admin list shows the name; export includes it. Unit — migration on a DB without the column.

## 5. Also

- Screenshots: a reply with the redirect button visible, the admin budget card in tokens, the unauthenticated `/admin` (login only), the admin client list with names. Look at them.
- Commits: `fix: redirect button from named characters`, `feat: global cap in tokens`, `fix: admin login gating`, `feat: logs under user profile`; push; report hashes.
