# Fix round 3 — user name, calendar on chat close, token %, Georgian quality, mobile chat bug + mobile layout

`AGENT_PROMPT.md`, `FIXES_ROUND1.md` and `FIXES_ROUND2.md` remain the spec; this file changes/extends them. Implement every item, update tests, run the full suite from a clean `npm ci`, update `TEST_REPORT.md` ("Round 3 fixes") and `DECISIONS.md`, commit in logical chunks, push to `github.com/aleksloma/tianshani` `main`, report commit hashes.

Findings below come from a live check of `http://localhost:3000` in a desktop viewport (1280×800), a narrow pane (648 px) and the mobile preset (375×812).

---

## 1. The user has a name — stop calling everyone „სოსო“

**Observed:** characters address the user as Soso („ჩემო სოსო“) although the user never said who they are.

- On first visit show a small, film-styled prompt on the wall (a visitor's pass / „გამომცემლობის საშვი“ card pinned to the wall, not a modal that blocks the page, and an overlay that does not shift the wall layout or the frames): „როგორ გქვიათ?“ with a text input (max 40 chars), a button „შესვლა“ and a link „სოსო ვარ“ (fills in „სოსო“). Store the name in `localStorage` as `tianshani.user_name`. Allow changing it later: the name appears in the header (small, next to the token indicator, e.g. „ავტორი: ნინო ✎“); clicking it reopens the card.
- Send the name with every `POST /api/chat` (`userName`), log it in `messages`/`clients` (admin list shows it next to the client id).
- **Prompt rule:** *"The user's name is <NAME>. Address them by this name (with ბატონო/ქალბატონო where the character's `address_forms` says so). Do not call them Soso unless their name is Soso. If no name is given, address them as „ავტორო“ / „ჩემო კარგო“ / „ახალგაზრდავ“ according to the character, and never invent a name."* Also change the world instruction: the player is "a new author bringing their own manuscript" — Soso remains a separate character who may be mentioned („სოსოც დადიოდა ასე სამი წელი“).
- If the name is Soso, keep the current behaviour (the characters treat the user as Soso and his manuscript is „ცისფერი მთები ანუ ტიან-შანი“); otherwise the manuscript is "the user's novella" — the character may ask its title and remember it within the chat (just via history; nothing to persist).
- Tests: unit — prompt contains the name and the rule; e2e — card appears on first load, name entered → header shows it → reload keeps it → mock reply contains the name (make the mock echo `userName`); „სოსო ვარ“ link works.

## 2. Calendar advances only when a chat is **closed**, never mid-conversation

**Observed:** a season intertitle appeared in the middle of a conversation. Currently `game.days_per_exchange = 20` advances the day after every reply.

- Change to: **+20 days when a conversation is closed**: ✕, Esc, clicking the dimmed wall, or switching to another character via „ესაუბრე სხვას“ / the „→ მივიდე …“ button (closing the current one counts as a close). Opening and closing without sending any message does **not** advance time. Config: `game.days_per_chat_close: 20`, `game.days_per_exchange: 0`, `game.days_per_character_switch: 0` (keep the latter two configurable but zero).
- Season/collapse effects (intertitle, tree transition, copies counter, background stage change) fire **after** the chat panel has closed and the frame is back on the wall — never while a chat is open. If a switch to another character crosses a season boundary, show the intertitle first, then open the new chat.
- The tree tooltip date still updates immediately on close.
- Tests: unit — `advanceOnClose` logic, no advance without messages; e2e — send 1 message, verify tooltip date unchanged while chat is open and no intertitle; close → date +20; test config `days_per_chat_close: 45` → second close shows „ზამთარი.“ on the wall with no chat open; switching characters across a boundary shows the intertitle before the new chat opens.

## 3. Token indicator — one number, one visual

**Observed:** the header shows „ტოკენები: 1 994 382 / 2 000 000“, a bar, „გამ.: 1 999 926“ and a long tooltip — too much.

- Replace with a single compact indicator: a small ring/gauge (SVG, ~28 px) or a short bar, and the text **„0,3 %“** (percentage of *input* tokens used this period, one decimal, Georgian comma). No absolute numbers, no output tokens in the header.
- Tooltip (hover/tap): „გახარჯულია შემომავალი ტოკენების 0,3 % · განახლდება 1 ნოემბერს“ — one line.
- Colour: neutral up to 70 %, amber 70–90 %, red above. At 100 % the limit modal from round 2 takes over.
- e2e: percentage text present, updates after a mock reply, no „/ 2 000 000“ string anywhere in the header; visible at 375 px.

## 4. Georgian quality — enforce it, don't just ask

**Observed:** „ვჭედავარ“ (not a Georgian word) from Vaso; Vaso also said „რავა ვიქნები“ — Imeretian dialect that belongs to **Tamari's** `speech_style`, not Vaso's.

- **Prompt:** strengthen the rule: *"Write standard literary Georgian with correct verb forms, case endings and spelling. Never invent or distort words. Use dialect forms (რავა, ბოშო, ქე, გაქვენ…) and loanwords only if they are explicitly listed in YOUR OWN `speech_style` / `recurring_formulae_ka` — never borrow another character's dialect or signature lines. Film/book terminology (სესხბანკი, მშენბანკი, მარკშეიდერი, კაპრემონტი, ზავხოზი…) is fine. Before finishing, re-read every word and fix anything that is not correct Georgian."*
- **Proofread pass (configurable, default on):** `gemini.proofread: true`. After the main reply finishes streaming, the server makes a second, cheap non-streaming call: *"Proofread this Georgian text. Fix only spelling, grammar, case endings and non-existent words. Keep all names, dialect words from this list [character's listed dialect/loanwords + a global allowlist from `shared_idiom_ka.russianisms` + bureaucratic lexicon], stage directions in asterisks, line breaks and meaning exactly as they are. Return only the corrected text."* If the corrected text differs, send a final SSE event `{"replace": "<corrected text>"}` and the client swaps the bubble content (store the corrected version in history and logs; log both versions in the DB with a `proofread_changed` flag so the owner can review in admin). Use `max_output_tokens` = 1.5× the reply length, temperature 0. Account its tokens into the limits/budget. Skip the pass in mock mode and when the reply is < 3 words. The pass adds ~1–2 s after the reply has finished streaming and roughly doubles output-token cost; the bubble must already be fully readable before the swap, and the swap must be a quiet in-place replacement (no flicker, no re-stream).
- Keep a small blocklist of known non-words seen so far (`ვჭედავარ`) in a unit test that fails if any mock/sample string or data string contains them, and log any real reply containing them at WARN level.
- Admin: filter „შესწორებული პასუხები“ showing original vs proofread side by side.
- Tests: unit — proofread allowlist built per character; integration (mock) — the `replace` event path works end-to-end with a stubbed proofreader; real-API smoke (if key) — 5 replies from Vaso and Tamari, log original/proofread pairs in `TEST_REPORT.md`.

## 5. Mobile / narrow viewport: the chat never appears (critical bug)

**Observed at 648 px and 375 px:** clicking a frame centers the photo, but the `.chat` panel keeps `opacity: 0` (class `chat mobile`, sometimes `chat mobile shown`, both invisible) and the active `.wall-photo` is stretched to the full page (375×1532 px, `top: -720px`). Below 900 px the site is unusable. On desktop (1280×800) the chat works.

- Fix the mobile branch of `chat.js`/`chat.css`: the chat must become visible (`opacity: 1`, `pointer-events: auto`) with the same `shown` state as desktop; the active photo must not take the page's full size — on narrow screens render the centered portrait small (≈120 px wide) at the top of the chat panel, with the chat filling the rest of the viewport as a fixed full-screen sheet (header with name/role/✕, scrollable messages, sticky input above the keyboard; use `100dvh`).
- Check `position: fixed` + `transform` interactions (a transformed ancestor breaks `fixed` children) — likely the root cause of the stretched photo.
- Closing on mobile returns the frame to its wall spot (same as desktop).
- e2e (Playwright, viewport 375×812 and 700×900): click a frame → `.chat` has opacity 1 and is inside the viewport → send a mock message → bubble visible → close → frame back. Add both viewports to the regular e2e matrix so this can't regress.

## 6. Mobile layout — make the phone version look good (desktop stays exactly as it is)

**Desktop (≥ 900 px) is approved and must not change:** wall background photo, frame sizes, the iceberg painting and its size, layout algorithm, header, fonts, colours. Take a 1280×800 screenshot before you start and compare at the end — it must be identical except for the header indicator (§3) and the name card (§1).

**Narrow screens (< 900 px) need their own layout.** Observed at 375×812: the header takes ~300 px (title, subtitle, stats row, token row); nameplates are truncated („ახალგაზ…“, „(ოთარ“); the wall is ~1500 px tall with 12 frames scattered vertically in a lot of empty plaster. Required:

- **Header:** one compact row — title (smaller), tree, token % (§3), user name (§1). Hide the subtitle; crack/copies/building stats live in the tree tooltip only.
- **Fewer frames on the first screen:** on phones hang only the top **6** characters by content score (`wall.characters_on_wall_mobile: 6`, config); everyone else goes to the „ესაუბრე სხვას“ list, which on mobile opens as a full-width bottom sheet with the thumbnails from round 2. The wall should fit in **about one screen** (≤ ~1.3× viewport height), so the user sees the whole wall at a glance without a long scroll.
- **Frames:** ~38–42 % of viewport width each, same random tilt (5–10°) and non-overlap rules, same frame style. The iceberg painting stays, scaled to ~55 % of viewport width. The notice board („განცხადებების დაფა“) becomes a small pinned note icon that expands on tap, so it doesn't eat half the wall.
- **Nameplates:** name only (role shown in the chat header), font sized to fit the frame width — never ellipsize a name. Long names („ქალბატონი თამარი“, „ვაჟა ზაზაევიჩი“) may wrap to two lines.
- **Chat on mobile** (together with the §5 fix): full-screen sheet with the small portrait (~96–120 px) in its header beside name/role/✕, scrollable messages, input sticky at the bottom above the keyboard (`100dvh`, `env(safe-area-inset-bottom)`), font ≥ 16 px in the input so iOS does not zoom.
- Tablet (700–899 px): same mobile rules but `characters_on_wall_tablet: 9` and frames ~28 % of viewport width.
- Breakpoints as media queries; the layout algorithm takes the frame count and size class from the breakpoint. Orientation change / resize recomputes.
- Screenshots to take and look at: 375×812 wall, 375×812 dropdown sheet, 375×812 chat with a mock reply, 390×844, 768×1024, and 1280×800 before/after comparison. e2e at 375×812: exactly 6 frames on the wall, none overlapping, none ellipsized, wall height ≤ 1.3× viewport, dropdown lists the remaining characters with thumbnails, chat opens/sends/closes (§5).

## 7. Context caching — optional, only if risk-free

One exchange costs ≈5 600 input tokens because the full system prompt and few-shot are resent every time. If the `@google/genai` SDK supports explicit context caching for the configured model with a one-line change (`cachedContent` per character, TTL ~1 h, lazy refresh), enable it behind `gemini.context_cache: true` (default **false**) and measure the prompt-token reduction in `DECISIONS.md`. If it needs anything more than that, or the model rejects it, skip it entirely and just note it. Nothing in the chat flow may depend on it.

## 8. Per-browser token limits: 2 000 000 → 500 000

- Change `limits.per_client_input_tokens` and `limits.per_client_output_tokens` to **500000** in `settings.json`, `settings.example.json`, README/SETUP and anywhere the number is hard-coded or mentioned in tests/docs. The percentage indicator (§3) must compute against the new limit; already-stored usage counters are kept (so a browser that has used 600 000 this month is immediately over the limit — that is fine).
- Unit/integration tests that relied on 2 000 000 must use the config value, not a literal.

## 9. Also

- Make sure the user name (§1) is visible in the chat header in small type („საუბრობს: ნინო“) so it is obvious whom the character addresses.
- `npm run test:all` from a clean `npm ci`; update `TEST_REPORT.md` ("Round 3 fixes": requirement → verification → pass/fail, with the Georgian original/proofread pairs) and `DECISIONS.md`; commits: `feat: user name`, `fix: calendar advances on chat close`, `feat: token percent indicator`, `feat: georgian proofread pass`, `fix: mobile chat visibility`, `feat: mobile layout`, `chore: limits 500k`, (`perf: context caching` only if done); push; report hashes.
