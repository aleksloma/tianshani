# Fix round 2 — token display, limit messages, global monthly budget

`AGENT_PROMPT.md` is still the overall spec and `FIXES_ROUND1.md` still applies. This round adds budget safety. Implement all items, update tests, run the full suite, update `TEST_REPORT.md` and `DECISIONS.md`, commit and push to `github.com/aleksloma/tianshani`.

---

## 1. Verify the token counter is visible on screen

- The top bar must show this browser's **remaining input tokens** (and output, smaller) at all times, e.g. „ტოკენები: 1 987 420 / 2 000 000“ with a thin progress bar. If it is missing, not updating after each reply, or hidden on mobile — fix it.
- It must update from the `remaining` field of the final SSE `done` event after **every** reply, and on page load from `GET /api/state`.
- Hover tooltip shows input and output separately plus the period („ლიმიტი განახლდება 1 ნოემბერს“ for `monthly`, „ერთჯერადი ლიმიტი“ for `lifetime`).
- Numbers are formatted with a thin space as thousands separator.
- e2e test: counter is present at load; after sending a message in mock mode the displayed remaining-input number **decreases** by exactly the `usage.input` reported in the stream; counter visible at 390 px viewport.

## 2. Per-browser limit exhausted — the message

When a browser's input **or** output tokens reach the per-client limit:
- `POST /api/chat` returns `429` with `{ "error": "client_limit", "message": "ბიუჯეტში გარღვევა გვაქვს, თვის ბოლომდე დავიცადოთ.", "resets_at": "<ISO date>" }` (for `lifetime` period: `resets_at: null`).
- The UI shows a **modal window on top of everything** (dimmed wall behind, film-style: an official notice sheet pinned to the wall, typewriter font, a red stamp „შეჩერებულია“): title „ბიუჯეტში გარღვევა გვაქვს“, body „თვის ბოლომდე დავიცადოთ. ლიმიტი განახლდება 1 ნოემბერს.“ (date computed from `resets_at`; for lifetime: „ლიმიტი ამოწურულია.“). The chat input is disabled with placeholder „ბუღალტერია დაკეტილია“. The modal can be closed to look at the wall, but reopens on any attempt to send. State is re-checked on load via `/api/state` so a reload does not bypass it.
- Replace the old message („ბუღალტერია დაკეტილია, მომავალ თვეში მობრძანდით“) everywhere with the new wording above; keep the film tone.
- Tests: integration — tiny limit in test settings → 429 with the exact message and a valid `resets_at`; e2e — the modal appears with the title text, input disabled, survives reload.

## 3. Global monthly budget — $50 for everyone combined

- New `settings.json` block (and `settings.example.json`, env override `GLOBAL_MONTHLY_USD`):
  ```jsonc
  "budget": {
    "global_monthly_usd": 50,
    "price_input_per_1m_usd": 0.75,
    "price_output_per_1m_usd": 3.75,
    "warn_at_percent": 80
  }
  ```
  Prices are config because Gemini 3.8 Flash intro pricing doubles on 2027‑01‑01 (to 1.50 / 7.50); note this in `settings.example.json` comments and `README.md`.
- Server keeps a **global** counter per calendar month (SQLite table `global_usage(period_key, input_tokens, output_tokens, cost_usd)`), updated from every reply's real `usageMetadata`. `cost_usd = input/1e6 × price_input + output/1e6 × price_output`. Period key is `YYYY-MM` in UTC regardless of the per-client `limits.period`.
- **Before** each request: if `cost_usd ≥ global_monthly_usd` → `429` with `{ "error": "global_budget", "message": "ბიუჯეტში გარღვევა გვაქვს, თვის ბოლომდე დავიცადოთ.", "resets_at": "<first day of next month, ISO>" }`. Also guard against the last request overshooting: reserve an estimate (`max_output_tokens` × output price + prompt tokens × input price) before calling Gemini; if the reserve would cross the budget, refuse.
- **Client:** the same modal as in item 2 is shown **to every user** (same title/body; the body additionally says „გამომცემლობის თვიური ბიუჯეტი ამოიწურა.“). `GET /api/state` returns `global: { budget_usd, spent_usd, exhausted: bool, resets_at }` so the modal appears immediately on page load for everyone, not only after a failed send. Input disabled as in item 2.
- At `warn_at_percent` the admin page shows a yellow banner; the server logs a warning once per day.
- **Admin page:** add a "ბიუჯეტი" card at the top: spent this month in USD, % of budget, tokens in/out, projected month-end spend (linear from days elapsed), and a button „ბიუჯეტის განულება ამ თვისთვის“ (resets the global counter only — per-client counters untouched). Also show cost per client in the client list (same price formula).
- **Mock mode** must also account tokens into the global counter (with its fake usage) so tests work without a key.
- Tests: unit — cost formula, period key, reserve logic, overshoot refused; integration — set `global_monthly_usd: 0.0001` in test settings → first request may pass, second returns `429 global_budget` with the exact message; `/api/state` reports `exhausted: true`; admin reset re-enables; e2e — with exhausted global budget the modal is visible immediately on load in **two different browser contexts** (two client IDs), input disabled in both; after admin reset the modal disappears on reload.

## 4. Shukri's portrait

- Shukri (`id: shukri`) currently shows the silhouette. The owner supplied a photo: **`assets_in/shukri_source.png`** in this folder (a colour video still of the actor).
- Convert it to **black and white** (desaturate, slight contrast boost, mild grain/sepia-free — plain B&W to match the Soviet passport-photo feel), crop to the same aspect ratio as the other portraits, resize to the standard portrait size, optimise to ≤150 KB, save as `public/assets/characters/shukri.jpg`. Use `sharp` (add as dev dependency) or ImageMagick if present; do not hand-edit pixels.
- Set `image: "assets/characters/shukri.jpg"` in the character data, add the source line to `public/assets/characters/SOURCES.md` („provided by the owner, video still“).
- Verify visually (screenshot of the wall) that Shukri's frame now shows the photo with the nameplate, and that it is B&W. e2e: Shukri's frame `<img>` has a non-silhouette `src` that loads (naturalWidth > 0).

## 5. Tree tooltip shows the date; time advances 20 days after every exchange

Changes to the time model from `FIXES_ROUND1.md` §4:
- **Tooltip on the tree** shows the **date without the year** as the primary text — e.g. „10 სექტემბერი“ — in a larger font; the season name is **not** shown (the tree itself is the season). Keep the secondary line small: „ბზარი 1/5 · ეგზემპლარი 3/3“. Same on tap on mobile.
- **Time now advances by 20 days after every completed exchange** (user message + character reply), with any character. Set `game.days_per_exchange` default to **20** and `game.days_per_character_switch` default to **0**. Keep both configurable. With 90-day seasons the season changes every 4–5 exchanges and the building collapses after ~18 exchanges — that is intended.
- The date in the tooltip updates immediately when the reply finishes streaming (same moment the token counter updates). If a season boundary is crossed, the intertitle and tree transition fire right after the reply ends, not mid-stream.
- Start date stays 1 September (year only matters for the LLM prompt line, which keeps "1983").
- Update `settings.example.json`, README, unit tests (day advancement per exchange, boundary crossing) and e2e: after one exchange in mock mode the tooltip date moved from „1 სექტემბერი“ to „21 სექტემბერი“; after 5 exchanges the winter intertitle has appeared and `data-season="winter"` is set on the tree.

## 6. „ესაუბრე სხვას“ dropdown — thumbnails, no lock icons, no separate group

Current dropdown shows name + role as text only, and the invisible characters sit under a dashed divider with a heading „ვინც არასდროს ჩანს“ and a 🔒 icon. Change it:
- **Thumbnails:** every row gets a small portrait on the left (40×40 px, rounded-square, same B&W/sepia treatment as the wall frames, thin frame border). Characters with a found image show the image; the rest show the standard silhouette. Search for images for the remaining visible characters you have not found yet (Boria, Kako, Chachanidze, Kote, Lali, Tengizi, Bela's husband, the two big men, …) using the `actor` field — the more rows with real faces, the better. Update `SOURCES.md`.
- **Remove the separate group**: no divider, no heading „ვინც არასდროს ჩანს“, no 🔒 lock icon, no italic styling for invisible characters. One flat list, sorted by content score descending, which naturally puts the invisible characters at the bottom (if the score does not already do that, add a tie-break so `appears ≠ on_screen` sorts last). Keep the small „დანარჩენები“ heading at the top or drop it — your call.
- Row layout: thumbnail | **name** (bold) over role (small, muted). Hover/keyboard highlight stays. The dropdown remains scrollable with the same max height; make sure thumbnails are lazy-loaded (`loading="lazy"`) so opening the dropdown is instant.
- e2e: dropdown has no element containing „ვინც არასდროს ჩანს“ and no 🔒; every row has an `<img>` (real or silhouette); rows are in score-descending order with invisible characters last; Shukri's row (if he is not on the wall) and any other character with an image show a non-silhouette `src`.

## 7. Remove the artificial SVG crack layer

The procedurally drawn crack (the SVG `path` layer that grows each season) does not look like a crack — it reads as a plain line. Remove it from the visual layer entirely:
- Delete the SVG crack overlay from the wall (markup, CSS, the growth animation in `game.js`/`wall.js`), and the extra frame-tilt at crack stages 3–4 that depended on it.
- **Keep the `crackStage` value in `gameState`**, in the LLM prompt line, in the tree tooltip („ბზარი 2/5“), in logs and in the admin view — only the drawing goes away.
- Prepare for the owner's future approach instead: the wall background will become a **set of photos with progressively larger real cracks**, one per crack stage. Add config `wall.background_by_stage: ["assets/wall.jpg", null, null, null, null]` — an array indexed by `crackStage`; a `null` falls back to the nearest earlier non-null image. On a season change the background cross-fades (~1.5 s) to the image for the new stage. For now only stage 0 is set, so nothing changes visually; when the owner drops `wall_1.jpg … wall_4.jpg` into `public/assets/` and fills the array, it works without code changes. Document this in `README.md` and `settings.example.json`.
- Update/remove the e2e assertions that checked the crack SVG; add a unit test for the stage → background fallback resolution and an e2e test that with a test config `["a.jpg","b.jpg",null,null,null]` the body background switches to `b.jpg` after the first season change.

## 8. Georgian quality, dialogue pacing, line breaks

Observed problems in real replies:
- Vazha: „ხვალ დილით შემოიარე, თერთმეტისკენ, ან პირდაპირ ოთარ დავიდოვიჩს შეუხვიე კაბინეტში. ახლა სესხბანკში მივდივარ, თუ დამირეკეს — მშენბანკში ვარ.“ — to a simple „როდის შეიძლება შევხვდეთ?“ he fires off a time, a redirect and his exit excuse all at once.
- Bela: „ნელთბილად, ადამიანო, ოჯახში არც გვძულს, არც გვიყვარს ერთმანეთი. ყავას ხომ არ დალევდი, შუქრისთვის უნდა ავადუღო მაინც? ბატონ ვასოსთან ხომ არ შეგიხედავს?“ — to „როგორ ხარ?“. Three unrelated things in one breath, a redirect on the very first message, and „ნელთბილად“ is Tamari's signature line leaking to Bela via `world.shared_idiom_ka.greeting_ritual`.

**Keep the book material.** Phrases like „სესხბანკში მივდივარ, თუ დარეკეს — მშენბანკში ვარ“ and „არც გვძულს, არც გვიყვარს ერთმანეთი“ come from Cheishvili's printed text and are **wanted** — they add variety. Do **not** remove or filter book-sourced items. The problem is pacing, not content: the character spends his whole repertoire in the first reply.

**Required — data fixes (`characters.json`, record changes in `DECISIONS.md`):**
- `world.shared_idiom_ka.greeting_ritual`: „ნელთბილად“ belongs to **Tamari** only — remove it from the shared list (she already has it in her own data). Check the other shared lists for character-specific signature lines and leave only truly shared ones.
- Fix Georgian spelling/grammar/case endings in all Georgian data strings where they are actually wrong (typos, impossible forms). Do **not** "correct" deliberate dialect (Tamari's Imeretian „ბოშო“, „რავა“, „გაქვენ“), russianisms listed in `shared_idiom_ka.russianisms`, or book vocabulary (სესხბანკი, მშენბანკი are correct historical Soviet bank names — keep them). List every correction in `DECISIONS.md`.

**Required — prompt (`src/prompt.js`, general instruction), add/replace rules:**
- *"Write correct, natural Georgian. Re-read your reply for grammar, case endings and spelling. Dialect and loanwords only where the character's `speech_style` lists them. Do not borrow another character's signature lines."*
- *"**Pacing — this is the most important rule.** You have a large repertoire of catchphrases, excuses and activities. Spend it slowly: **one idea per reply.** React to what the user just said, in 1–2 sentences for small talk, at most 3 for a real question, and leave a hook so the conversation can continue (a counter-question, a half-finished thought, a small action). Never stack a time, an excuse, a redirect and an anecdote into one reply — save them for the next turns. Across a conversation, vary: a different excuse or activity each time, never repeat a catchphrase you already used in this chat."*
- *"**Redirects and 'no time' come later, not first.** On the first 1–2 messages about the manuscript, engage: ask what it is about, who else has it, make a small promise or a bureaucratic observation. Only from roughly the **3rd message about the manuscript** start steering away — you suddenly have to go, someone is calling, 'take it to <redirects_to>' — because nobody here has time for actual work. Then **you still do not end the conversation**: if the user changes the subject, talk about it gladly and at length — nobody avoids talk that is not work."*
- *"Off-topic talk (weather, family, chess, the user's life, anything): engage warmly and in character, no excuses needed, no redirect. The excuse-and-redirect machine switches on only when the conversation returns to the manuscript or to actual work."*
- *"Format: every new sentence or phrase on a **new line** (`\n`), like lines of dialogue in a script. Stage directions (`*…*`) on their own line."*
- Give the model the information it needs for pacing: inject into the prompt a short state line computed server-side from the history: `Messages in this chat so far: 4. Messages about the manuscript so far: 2. Catchphrases already used in this chat: [...]` (detect catchphrases by substring match against the character's `catchphrases_ka`; detect manuscript-related messages by a small Georgian keyword list: მოთხრობა, ხელნაწერი, წაიკითხ, დაბეჭდ, ეგზემპლარ, ტიან-შან, ცისფერი). Also make `suggested_redirect` in the SSE `done` event appear only when the manuscript-message count is ≥ 3 (and only if the reply actually names a `redirects_to` character), so the „→ მივიდე …“ button doesn't appear on the first exchange.
- Lower `gemini.temperature` default to **0.8** and `max_output_tokens` to **250** in `settings.example.json`.

**Required — client:** render `\n` in character bubbles as line breaks (`white-space: pre-line` or `<br>`) with a small gap; the streaming parser must not collapse newlines; stage directions already on their own line.

**Tests:** unit — `shared_idiom_ka` contains no „ნელთბილად“; the state line is computed correctly from a sample history (counts + used catchphrases); `suggested_redirect` is `null` when manuscript-message count < 3. Mock replies include `\n` → e2e asserts the bubble renders ≥2 lines and the redirect button is absent on the first exchange and present after the 3rd manuscript message. Real-API smoke (if key): a 5-message conversation with Bela starting with „როგორ ხარ?“, then two manuscript questions, then an off-topic question about the weather — assert each reply ≤3 sentences, no catchphrase repeated within the chat, the weather reply contains no redirect and no excuse keywords (მივდივარ, არ მცალია, მიმართეთ), and the redirect (if any) appears no earlier than reply 3. Log all replies in `TEST_REPORT.md` for human review.

## 9. Also

- Make sure the modal's wording is identical in both cases (per-client and global) except for the extra global sentence, and that it never shows raw error JSON.
- Screenshots: top bar with the counter (desktop + mobile), the limit modal (per-client), the limit modal (global), the admin budget card, the wall with Shukri's B&W portrait, the tree tooltip with a date, the opened dropdown with thumbnails. Look at them before reporting.
- `npm run test:all` from a clean `npm ci`, update `TEST_REPORT.md` ("Round 2 fixes" section) and `DECISIONS.md`, commit (`feat: token counter`, `feat: client limit modal`, `feat: global monthly budget`, `feat: shukri portrait`, `feat: date tooltip + days per exchange`, `feat: dropdown thumbnails`, `refactor: remove svg crack, background by stage`, `fix: dialogue pacing + georgian polish`), push to `main`, report commit hashes.
