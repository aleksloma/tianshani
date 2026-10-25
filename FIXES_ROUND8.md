# FIXES_ROUND8 — manuscript copies: handing out, losing, getting back

Read `PROJECT_CONTEXT.md`, `CLAUDE.md`, `AGENT_PROMPT.md` and `FIXES_ROUND1–7.md` first. Everything there still applies unless this file overrides it. The standing rules apply in full: implement only what is written here, visual design is frozen except for the elements this round explicitly adds, canon files are touched only where §10 says so, testing is your job, finish with `TEST_REPORT.md`, `DECISIONS.md`, commits and a push.

This round replaces the automatic "one copy lost per season" mechanic with a real game: the author (the visitor) owns three copies of the manuscript, hands them to characters inside the chat, the characters lose them slowly and with good excuses, pass them to each other, damage them, and the author can get a copy back only while the character still has it. The design below was agreed with the owner item by item; do not add, remove or "improve" mechanics beyond it. If something is ambiguous, pick the simplest reading, log it in `DECISIONS.md`, and continue.

---

## 0. Vocabulary used in this file

- **copy** — one of the `game.copies` (3) physical copies of the manuscript, numbered №1, №2, №3.
- **in hand** — the copy is with the user (the author).
- **holder** — the character who currently has the copy.
- **integrity** — how much of the copy still exists, one of `full → half → quarter → page → none` (Georgian display words: `მთელი`, `ნახევარი`, `მეოთხედი`, `ერთი ფურცელი`; `none` means lost).
- **event** — something that happens to a held copy at a time step (see §4). Kinds: `stalled`, `fragment`, `passed_on`, `misplaced`, `damaged`.
- **claim** — what the holder *says* happened. The claim and the truth can differ (see §5 chain rule).
- **step** — one advance of in-world time. Time still passes only on chat close, `+days_per_chat_close` (20) days, exactly as before (Round 3). One chat close = one step.
- **behaviour table** — new data file `src/data/manuscript_behaviour.json` (§6), one entry per character that can ever hold a copy.

---

## 1. What is removed

1. The automatic seasonal loss. `seasons_per_lost_copy` is deleted from `settings.example.json`, `calendar.js DEFAULTS/withDefaults` and `derive()`. `derive()` no longer returns `lostCopies`; everything that reads it (`game.js withDerived`, `app.js renderStatus/playEvents`, `chat.js` gameState payload, `prompt.js sanitizeGameState/stateBlock`, tests) is rewritten per this file. If `settings.json` still contains the key, ignore it silently (log once at startup: `seasons_per_lost_copy is no longer used`).
2. `LOST_COPY_NOTES` in `public/js/game.js` (the three fixed texts) — deleted. The copy note element itself stays and is reused (§8.4).
3. The sentence `Copies of the manuscript lost so far: N of 3.` in `prompt.js stateBlock` — replaced by the manuscript block (§7).
4. Nothing else is removed. Calendar, seasons, crack stages, collapse, reset-all, limits, admin, proxies, redirect button, proofread — untouched except where this file says.

A copy that stays in the author's hand is never lost. Only copies handed to characters are at risk.

---

## 2. State model (client, `localStorage`)

New key `tianshani.copies` (add to `storage.js KEYS` as `copies`). Shape:

```json
{
  "cycle": 1,
  "copies": [
    {
      "id": 1,
      "status": "in_hand",            // "in_hand" | "held" | "lost"
      "holder": null,                 // character id while status === "held"; last holder once "lost"
      "givenDay": null,               // game day when the current holder received it
      "integrity": "full",            // "full" | "half" | "quarter" | "page" | "none"
      "claim": null,                  // only passed_on events create one: { "to": "kote", "day": 120, "verified": false, "arrived": false }
      "lossVerified": false,          // true once the last holder has told the user (not_returned) that a claim-less lost copy is gone
      "events": [                     // append-only, newest last
        { "day": 100, "actor": "vaso", "kind": "fragment", "text_ka": "პირველი მეოთხედი კოტეს გავატანე.", "to": "kote" }
      ]
    }
  ],
  "strayPages": [                     // flavour only, see §4.6
    { "character": "lali", "copyId": 2, "day": 140, "seen": false }
  ]
}
```

Rules:
- Created lazily with `game.copies` entries, all `in_hand`/`full`, when missing or when `cycle` differs from `tianshani.game.cycle` (collapse → new building → three fresh copies). Reset-all (`resetAll`) also recreates it.
- Pure helpers live in a new module `public/js/manuscript.js` (no DOM): `initialCopies(cfg, cycle)`, `loadCopies(cfg, cycle)`, `saveCopies(store)`, `copiesInHand(store)`, `lostCount(store)`, `copyHeldBy(store, characterId)`, `bestCopyInHand(store)` (highest integrity, lowest id), `applyHandOver(store, copyId, characterId, day)`, `applyReturn(store, copyId, day)`, `applyStep(store, cfg, behaviour, day, rng)` (§4), `verifyClaimsFor(store, characterId)` (§5.3), `ledgerLines(store, byId, cfg)` (§8.3), `summaryForServer(store)` (§3.2). Export them for `node:test`.
- `tianshani.copies` is written only through `saveCopies`. Every mutation returns a new object (same style as `game.js`).

The count shown in the header (`#copies-val`, `#season-tip-meta`) becomes **existing copies / total**, i.e. `copies.length − lostCount` over `game.copies`. Same place, same format `2/3`.

---

## 3. Actions in the chat (hand over / get back)

### 3.1 The button

Add one button to the chat form, **left of the textarea**:

```html
<form id="chat-form" class="chat-form">
  <button type="button" id="chat-copy" class="copy-btn" hidden aria-label="" title=""><span class="ico" aria-hidden="true">📄</span></button>
  <textarea id="chat-input" …>
  <button id="chat-send" …>
```

- Size 44×44 (the textarea's min-height), same border and background as the textarea (`1px solid rgba(42,38,34,0.35)`, `#fffdf6`), radius 2px, the 📄 glyph already used in the header (`#stat-copies .ico`), `font-size: 20px`. Write the rule as `.chat-form .copy-btn { … }` and reset `padding: 0; border: 1px solid …; background: #fffdf6; color: inherit; width: 44px; height: 44px; flex: none; }` explicitly, because the existing `.chat-form button` rule (navy background, `padding: 0 16px`, `border: 0`) otherwise wins. Hover/focus: `outline: 2px solid var(--sky)` like the textarea. Disabled while the chat is busy (`.chat.busy`), opacity 0.5. In `.sheet` mode the same button, same size. No new colours, no new fonts.
- Two modes, decided by `copyHeldBy(store, currentId)` and `copiesInHand(store)` every time the chat opens, a message finishes, or the store changes:
  - **hand-over mode** — shown when the current character is reachable (`reachable === true`, i.e. not an invisible/proxy chat), does not hold a copy, and the user has at least one copy in hand. `aria-label`/`title`: `ეგზემპლარის გადაცემა`.
  - **retrieve mode** — shown when the current character holds a copy (`status === "held"`, `holder === currentId`), **or** when a `lost` copy has this character as last holder and the user has not yet been told (`claim === null && !copy.lossVerified`, or `claim && !claim.verified`). Add class `retrieve` to the button (visual difference: the glyph gets a thin underline via `text-decoration: underline` — nothing else). `aria-label`/`title`: `ეგზემპლარის გამორთმევა`.
  - otherwise `hidden`.
- The button never appears in proxy chats (invisible characters cannot receive anything; the proxy does not take copies for them — do not add that).
- Handing over picks the copy automatically with `bestCopyInHand` — no picker, no confirmation dialog.

### 3.2 Status line in the chat head

Add `<p id="chat-copy-status" class="chat-copy-status" hidden></p>` right after `#chat-user` in `.chat-title`, same font-size/colour as `#chat-user` (reuse its CSS rule by adding the selector). Content, set by the same refresh as the button:

- holder of copy №N for d days: `ეგზემპლარი №N {name}-სთანაა {d} დღეა` → e.g. `ეგზემპლარი №2 ვასოსთანაა 40 დღეა` (use `names.js toward()` for the „-სთან“ form; day count = `game.day − givenDay`, `0 დღეა` on the day of handing over; `1 დღეა`, `20 დღეა` — Georgian needs no plural change).
- if integrity is below `full`, append in brackets: `ეგზემპლარი №2 ვასოსთანაა 40 დღეა (ნახევარი)`.
- a copy whose last holder is this character and which has an unverified `claim` (whether it really arrived at `to` or not — the user cannot tell yet): `{name}-ს თქმით, ეგზემპლარი №N {to}-ს გადასცა` → `ვასოს თქმით, ეგზემპლარი №2 კოტეს გადასცა`. Precedence everywhere (status line and ledger): an unverified claim wins over the `held`/`lost` forms. (dative „-ს“: add `dative(shortName)` to `names.js` next to `toward()`, same stem rules minus „თან“; unit-test it on every `short_name_ka`). Note that Leri's `short_name_ka` is „ბელას ქმარი“ — the forms are then „ბელას ქმართანაა“ / „ბელას ქმარს“; that is acceptable, do not add a display override.
- a copy lost here and verified: `ეგზემპლარი №N დაკარგულია: {claim text}` (the `text_ka` of the last event).
- otherwise hidden.

### 3.3 Request/response contract

Both actions go through the existing `POST /api/chat` so that history, limits, proofread, logging and streaming stay identical. Add an optional field:

```json
"action": { "type": "hand_over" | "retrieve", "copyId": 2, "integrity": "half" }
```

and a new mandatory-when-present field `manuscript` = `summaryForServer(store)`:

```json
"manuscript": {
  "inHand": 1, "lost": 1, "total": 3,
  "copies": [ { "id": 1, "status": "held", "holder": "vaso", "givenDay": 60, "integrity": "half",
                "claim": null, "lossVerified": false,
                "events": [ { "actor": "vaso", "kind": "fragment", "text_ka": "…", "to": "kote", "day": 100 } ] }, … ],
  "strayPages": [ { "character": "lali", "copyId": 2 } ]
}
```

The client, before sending an action, pushes a **user message** into the history and renders it (§8.1) so the model sees the act in context:

- hand over: `*{author} {name}-ს ხელნაწერის ეგზემპლარს აწვდის.*` → `*ალექსანდრე ვასოს ხელნაწერის ეგზემპლარს აწვდის.*`; when integrity < full: `*… ეგზემპლარის ნახევარს აწვდის.*` / `მეოთხედს` / `ერთ ფურცელს`. `{author}` = the user name, or `ავტორი` when no name is set.
- retrieve: `*{author} {name}-ს ეგზემპლარს უკან სთხოვს.*`

That message is stored in `tianshani.chats` with `action: { type, copyId }` and is sent as the last user turn (so the existing "last message must be a non-blank user message" validation passes unchanged).

Server (`server.js`):
1. Validate `action` (type in the two values, `copyId` integer 1…`game.copies`; `action` present while the target character is not `reachable` → 400 `{ error: "not_reachable" }`) and `manuscript` (`sanitizeManuscript()`: ids unique and in range, statuses/integrities in the enums, `holder` must be a key of the behaviour table, days clamped like `sanitizeGameState`, `events` capped at the last 6 per copy with `text_ka` ≤ 200 chars, `actor`/`to` must be known ids). Invalid → 400 with the existing error style. A missing `manuscript` on a request without `action` is allowed (older clients) and treated as "all in hand".
2. Decide the **outcome deterministically on the server**, never by the model:
   - `hand_over`: `accepted` if the speaker's behaviour entry has `accepts: true` and no copy is currently `held` by the speaker; `refused` if `accepts: false` (or missing entry); 409 `{ error: "already_holds" }` if the speaker already holds one (the client never sends this; it's a guard).
   - `retrieve`: find the copy with `holder === speaker.id`. `status === "held"` → `returned` (integrity as stored). `status === "lost"` and last holder is the speaker → `not_returned` with the copy's last event text as the reason. No such copy → 409 `{ error: "nothing_to_retrieve" }`.
3. Inject the outcome into the prompt as the `# ACTION` block (§7.3) so the reply is consistent with it.
4. Emit the result in the final SSE `done` event: `"action_result": { "type", "copyId", "outcome", "integrity", "reason_ka" }` (`reason_ka` only for `not_returned`/`refused`: the event text or the `refuse_ka` seed).
5. Log it: add nullable columns `action` (TEXT, e.g. `hand_over:accepted`) and `manuscript` (TEXT, JSON of the summary) to `messages` via `addColumn`; fill them for the two rows of that exchange. The admin page shows nothing new (the stage-direction text is already in the content column).

Client: the store is mutated **only on `done`** (`applyHandOver` / `applyReturn` with `game.day`), never optimistically. On `error` or network failure the user message stays in the log (as any failed message does today) and the store is unchanged. After `done`: refresh the button, the status line, the header count and the ledger.

`accepted` → copy `status: "held"`, `holder: speaker`, `givenDay: day`, integrity unchanged. `refused` → nothing changes. `returned` → `status: "in_hand"`, `holder: null`, `givenDay: null`, `claim: null`, integrity unchanged (a fragment comes back as a fragment and can be handed to someone else — that is intended). `not_returned` → status stays `lost`; if `claim` exists set `claim.verified = true`, else set `lossVerified = true`. After that the button is hidden in this chat.

Rate limits, token accounting, proofread: unchanged. An action turn counts as a normal exchange (`exchanges` increments, so closing the chat afterwards moves time).

---

## 4. Time steps and loss events

### 4.1 When

In `app.js onClosed` (where `applyChatClose` runs) — **after** the day advance and **before** `playEvents` — call `applyStep(store, cfg, behaviour, newDay, rng)` once per step that actually advanced time (i.e. only when `exchangesInChat > 0`; if `advanceDays` reports `collapse`, skip the step: the building is gone and the copies are reset anyway). One close = one step, even though 20 days pass.

### 4.2 Roll

For every copy with `status === "held"`:

1. Let `B = behaviour[holder]`, `age = day − givenDay`.
2. If `age < B.min_days` → nothing.
3. Else with probability `min(1, B.p_event × cfg.game.manuscript.probability_scale)` an event fires; otherwise nothing.
4. Pick the event by weighted choice from `B.events` (`weight`). Apply per kind (§4.3). Append `{ day, actor: holder, kind, text_ka, to }` to `events`.

At most one event per copy per step. Holder = the character the chat was just closed with is **not** excluded (he may lose it the moment you leave the room — intended).

### 4.3 Event kinds

- `stalled` — nothing changes; only an excuse is recorded (e.g. Boria „ალიონზე მოგიტანთ“). The copy stays retrievable.
- `fragment` — integrity drops one level (`full→half→quarter→page→none`). If the result is `none` → `status: "lost"`. If the event has `to`: the part that went away is gone for the game (it is **not** tracked as a second piece); if `to` is a **visible** character, record a stray page for `to` with probability `cfg.game.manuscript.stray_page_probability` (§4.6) — that is how "Kote has a few pages and doesn't know what they are" happens. The holder keeps the remaining part and it stays retrievable.
- `passed_on` — the holder gives the whole copy (whatever integrity) to `to`. Chain rule §5 decides whether it really arrives. The holder **always** claims it did.
- `misplaced` — the copy is lost: `status: "lost"`, `integrity: "none"`, holder stays recorded as last holder. (Bank, drawer-and-gone, office, home — see texts.)
- `damaged` — same as `misplaced` but the excuse is physical damage (copper sulphate in the cellar, mould in the yard, a burst pipe, spilled paint).

### 4.4 Deterministic randomness

Use a small seeded PRNG (mulberry32 or equivalent, in `manuscript.js`) seeded from a 32-bit hash of `` `${clientId}|${cycle}|${copyId}|${day}` `` (client id from `storage.js`). Same state → same outcome, which makes the mock/e2e runs reproducible. `applyStep` takes the `rng` factory as a parameter so unit tests can pass a fixed sequence.

### 4.5 Config

New block in `settings.example.json` → `game.manuscript` (with `_comment`), sent to the client inside `config.game` as everything in `game` already is:

```json
"manuscript": {
  "probability_scale": 1,
  "stray_page_probability": 0.4,
  "chain_floor": 0.15,
  "chain_ceiling": 0.9,
  "chain_override": null,
  "event_override": null
}
```

`event_override`: `null` | an event kind string (`"passed_on"` …) — when set, `applyStep` picks the first event of that kind from the holder's list instead of rolling the weighted choice (tests only; if the holder has no such event, fall back to the weighted choice).

`probability_scale` multiplies every `p_event` (tests set `0` = nothing ever happens, `1000` = an event every step). `chain_override`: `null` | `"arrive"` | `"lose"` — forces §5 for tests. With these three knobs every e2e scenario is deterministic without depending on the client id. Document all of them in `README.md`/`SETUP.md` env table only if there is such a table (there is: add nothing new to env, config keys only).

### 4.6 Stray pages (flavour)

A stray page is a note that character R has one or a few pages of a copy and does not know where they came from. It is recorded (a) by `fragment` events with a visible `to` (§4.3), and (b) when a copy becomes `lost` by any event, with the same probability, to a **random visible character** that is not the actor and not `to`, chosen with the same PRNG. One stray page per character at most. Stray pages are never retrievable, change no counts, and exist only to be mentioned by that character (§7.2) and in the ledger once the user has opened that character's chat (`seen: true` is set when the chat with R opens).

---

## 5. Chain rule (character → character)

### 5.1 Decision

When a `passed_on` event with target `T` fires:

- `T` invisible (`reachable === false`, e.g. Kopaleishvili, Tsverava, Khaburdzania) → the copy is `lost`. The holder's claim is „გადავეცი“; nobody can be asked.
- `T` visible → compute `p_arrive = (1 − p_event[H]) × (1 − p_event[T])` clamped to `[chain_floor, chain_ceiling]` (`p_event` from the behaviour table; characters with `accepts: false` are not valid `to` targets except the chain-only entries marked `chain_only: true`, e.g. Leri). Roll once:
  - **arrives** → `holder: T`, `givenDay: day`, `status: "held"`, integrity unchanged, `claim: { to: T, kind: "passed_on", day, verified: false, arrived: true }`. T's own `min_days`/`p_event` now apply from `givenDay`. Chains can continue indefinitely.
  - **does not arrive** → `status: "lost"`, `integrity: "none"`, holder stays H, `claim: { to: T, …, arrived: false, verified: false }`.
- `chain_override` forces one branch (tests).

### 5.2 What each side says

- H (in H's chat, from the `# MANUSCRIPT` facts): „T-ს გადავეცი“ — always, true or not. If the user asks for it back → outcome `not_returned` with that claim.
- T, when the copy really arrived: T is simply the holder (button in retrieve mode in T's chat, T's own excuses from now on). T may mention that H gave it to him.
- T, when it did not arrive: the prompt tells T the truth: nobody gave him anything. T says so in character („ჩემთვის არავის არაფერი მოუცია“ as the seed). The user has now learned the copy is gone.

### 5.3 Verification (what the ledger shows)

The ledger and the status line show the **claim** until the user has actually opened the chat with T after the claim: `verifyClaimsFor(store, T)` runs in `onOpened(T)` and sets `claim.verified = true` on every copy whose `claim.to === T`. Before verification the ledger line reads „ვასოს თქმით, კოტეს გადასცა“; after it, either „კოტესთან …“ (arrived) or „დაკარგულია: კოტე ამბობს, არაფერი მიუღია.“ (did not).

---

## 6. Behaviour table — `src/data/manuscript_behaviour.json`

New data file (not canon; shipped and loaded by `src/characters.js` next to `voice_extras.json`, exposed to the client through `/api/characters` as `manuscript_behaviour` keyed by id, and used by the server for action outcomes and prompt facts). Schema per entry:

```json
"vaso": {
  "accepts": true,
  "chain_only": false,
  "min_days": 20,
  "p_event": 0.40,
  "accept_ka": "კარგი, დამიტოვე, ამაღამვე დავიწყებ.",
  "return_ka": "აი, აიღე. ბოლომდე ვერ მოვასწარი, ჯერ ეს სურათი გაიტანონ.",
  "refuse_ka": null,
  "events": [ { "kind": "fragment", "to": "kote", "weight": 3, "text_ka": "პირველი მეოთხედი კოტეს გავატანე." } ]
}
```

`accept_ka` / `return_ka` / `refuse_ka` and every `text_ka` are **seeds**: the model is told the fact and the seed phrase and answers in its own two-beat style (it may quote the seed, paraphrase it, or build around it); the mock LLM uses the seed verbatim. All seeds are literary Georgian; keep them exactly as written here unless a genuine spelling error is found (then log it). Two of them are verbatim film/book quotes that are already in canon and must stay: Bela's „დავიწყე და გავწყვიტე“ (`excuse_repertoire_ka`) and Tina's „ჩამარაზვინე“ (the book line „შენი ბრალია, ჩამარაზვინე უჯრაში“). If `findNonWords` flags them, add them to its allow-list rather than changing the text.

Characters **not** in the table or with `accepts: false` refuse. Per the owner: anyone who has no contact with the manuscript in the plot refuses with a reason of their own, like Shukri. Invisible characters are never in the table except as chain targets (handled by `reachable`).

### 6.1 Accepting characters

| id | min_days | p_event | accept_ka | return_ka | events (kind → to, weight, text_ka) |
|---|---|---|---|---|---|
| `soso` | 20 | 0.10 | „რა თქმა უნდა, დღესვე დავიწყებ. ჩემსაც წაიკითხავ?“ | „აი, შენი. ჩემი ხომ არ გინდა, ერთ ეგზემპლარს დაგიტოვებ.“ | `stalled` (3) „ვმუშაობდი, ვერ მოვასწარი — ხვალ აუცილებლად.“; `passed_on`→`irodioni` (1) „იროდიონს მივეცი, საბჭოს წევრია, ჯერ მან უნდა წაიკითხოს.“ |
| `director` | 20 | 0.45 | „დატოვე, დატოვე. თინა, ჩაიწერე — ავტორმა ეგზემპლარი დატოვა.“ | „აი, აიღე. ალაგ-ალაგ წავიკითხე ძირითადი მომენტები.“ | `misplaced` (3) „ბანკში დამრჩა. სესხბანკში თუ მშენბანკში — ვერ გეტყვი.“; `passed_on`→`tina` (2) „თინას მივეცი, უჯრაში ჩადო, როგორც წესია.“; `stalled` (1) „ჯერ დანარჩენებმა წაიკითხონ, მერე მე.“ |
| `tina` | 60 | 0.40 | „დატოვე, შევუტან, როგორც მოვა.“ | „აიღე, აიღე. სამი თვეა აქა დევს, დირექტორი ვერ მოიცალა.“ | `passed_on`→`director` (3) „დირექტორს შევუტანე ბოლოს და ბოლოს.“; `misplaced` (1) „უჯრაში ჩავდე და აღარ არის. შენი ბრალია, ჩამარაზვინე.“; `stalled` (2) „უჯრაში დევს, დირექტორი მივლინებაშია.“ |
| `vaso` | 20 | 0.40 | „კარგი, დამიტოვე, ამაღამვე დავიწყებ.“ | „აი, აიღე. ბოლომდე ვერ მოვასწარი, ჯერ ეს სურათი გაიტანონ.“ | `fragment`→`kote` (3) „პირველი მეოთხედი კოტეს გავატანე.“; `fragment`→`bela` (2) „ნახევარი ბელას მივეცი, ახალგაზრდაა, სწრაფად კითხულობს.“; `fragment` (2) „ბოლო მერვედიც არ ჩანს — ვის შეაქვს და ვის გამოაქვს ჩემი ოთახიდან!“; `passed_on`→`boria` (1) „ბორიამ წაიღო სახლში, ალიონზე მოიტანსო.“; `damaged` (1) „ბზარის გვერდით მილი გასკდა და ქაღალდი დასველდა — აღარ იკითხება.“ |
| `bela` | 20 | 0.40 | „რა კარგია! დღესვე დავიწყებ, მხოლოდ ერთი უნდა დავრეკო.“ | „აი, აიღე. დავიწყე და გავწყვიტე — ტელეფონი.“ | `fragment`→`khaburdzania` (2) „ნახევრის ნახევარი აღმოჩნდა ჩემთან, დანარჩენი ხაბურძანიას წაუღია.“; `passed_on`→`leri` (2) „ლერიმ წაიღო სახლში!“; `misplaced` (1) „მაგიდაზე მედო, შესვენებიდან რომ დავბრუნდი, აღარ იყო.“ |
| `otari` | 20 | 0.40 | „დატოვე. წონით რამდენია? კარგი, წავიკითხავ.“ | „აიღე. მთებზეა, ფიზკულტურის ინსტიტუტში უნდა წაგეღო.“ | `passed_on`→`kopaleishvili` (3) „წავიკითხე, მომეწონა, კოპალეიშვილს გადავეცი — სად არის, არ ვიცი.“; `damaged` (2) „მარანში დამრჩა, შაბიამანი დაეღვარა და გალურჯდა — ვეღარაფერს გაარჩევ.“; `damaged` (1) „ეზოში დარჩა, დაობდა. მზეში დატოვე, გაშრება.“ |
| `irodioni` | 40 | 0.12 | „დატოვე, სეიფში ჩავდებ. შვებულებაში ვარ ფაქტიურად, მაგრამ მოვასწრებ.“ | „აი, სეიფიდან. ჩემთან არაფერი არ იკარგება.“ | `stalled` (3) „დავიწყებ და დავამთავრებ, ჯერ შვებულება გავიარო.“; `passed_on`→`tsverava` (1) „წავიკითხე და წვერავას გადავეცი — ჯარშია ჯერ.“ |
| `kako` | 20 | 0.45 | „ვთქვათ, ავიღე… მერე? კარგი, დატოვე.“ | „აი. ვთქვათ, წავიკითხე… მერე?“ | `fragment` (3) „ნახევარი ციხისძირში დამრჩა, დღეისსწორს ჩამოვიტან.“; `passed_on`→`boria` (1) „ბორიას მივეცი, პოეტია, უკეთ გაიგებს.“ |
| `boria` | 20 | 0.45 | „კარგი, წავიღებ სახლში, ალიონზე მოგიტანთ.“ | „აი, რამდენჯერაც წავიღე, იმდენჯერ დაგიბრუნეთ.“ | `stalled` (2) „სახლში დამრჩა, ალიონზე მოგიტანთ.“; `fragment`→`kako` (2) „ნახევარი კაკოს წაუღია.“; `passed_on`→`vaso` (1) „ვასოს დავუბრუნე, მისი ოთახიდან იყო.“ |
| `kote` | 20 | 0.40 | „კარგი, ჯერ ფორმალურად განვიხილოთ.“ | „აი. ოფისში ვერ გავატარე, ნუ იჩქარებ დიდი კრუგის დანიშვნას.“ | `misplaced` (3) „ერთი ცალი ოფისში გავატარე, საჭიროა — იქ დარჩა.“; `fragment`→`kako` (1) „ნახევარი კაკოს გავუცვალე, გაცვლითი წესით.“ |
| `mikho` | 20 | 0.15 | „მომეცი, დილამდე წავიკითხავ!“ | „აი, დავიწყე! კარგი რამეა. როცა გინდათ, გავიტან სურათს.“ | `stalled` (2) „სახლში წავიღე, დილამდე.“; `damaged` (1) „საღებავი დაეღვარა, ბოდიში.“ |

### 6.2 Chain-only holder

| id | chain_only | min_days | p_event | return_ka | events |
|---|---|---|---|---|---|
| `leri` | true | 0 | 0.70 | „აიღეთ და თავი დაანებეთ ჩემს ცოლს!“ | `misplaced` (1) „სახლში დევს სადღაც — არ ვიცი და არც მაინტერესებს.“ |

`accepts: false` (the user cannot hand him anything directly), but he can receive Bela's copy through the chain and then holds it like anyone else.

### 6.3 Refusing characters (`accepts: false`, `refuse_ka` seed)

| id | refuse_ka |
|---|---|
| `shukri` | „მე არ წავიკითხავ! პრინციპულად.“ |
| `grisha` | „განცხადება დაწერეთ დირექტორის სახელზე. მე სამეურნეო ნაწილი ვარ, ლიტერატურა არ მეხება.“ |
| `tamari` | „სად მცალია ნეტავ მაგისთვის — ხელფასები ვერ დამირიგებია. ვინმე სხვას მიეცი.“ |
| `marksheideri` | „უკაცრავად, მე მხოლოდ დირექტორს ველოდები. ჯერ ეს ბიძგი გავარკვიოთ.“ |
| `lali` | „ახლა გაკვეთილი მაქვს, ჯერ ზმნები უნდა გავიმეორო. გაკვეთილის მერე.“ |
| `tengizi` | „ახლა ვერ, ხედავ, საქმე მაქვს. ამის მერე.“ |
| `chachanidze` | „ჯერ ჩემი მოუსმინეთ, ლირიკაა. დღეში ორჯერ ვვარჯიშობთ, დრო არ მრჩება.“ |
| `leri` | „დაანებეთ ჩემს ცოლს თავი!“ |
| `two_big_men` | „გივის გადაეცით, ჩვენ ვიყავით.“ |

After a refusal the button stays in hand-over mode (a second attempt gets another refusal; that is fine).

---

## 7. Prompt changes (`src/prompt.js`)

### 7.1 Replace the copies sentence in `stateBlock`

Remove `Copies of the manuscript lost so far: N of 3.` Add, still inside `# CURRENT STATE OF THE BUILDING`, one line: `The author owns ${total} copies of the manuscript: ${inHand} in his hands, ${held} handed to colleagues, ${lost} lost.` (counts from the sanitized `manuscript` summary; `held = total − inHand − lost`).

### 7.2 New block `# MANUSCRIPT COPIES AND YOU` (after the state block, before `# THE USER`)

Built from the summary and the behaviour table for the **speaker** (for proxy chats: for the proxy, not the invisible). Include only the lines that apply:

- Holder: `You currently have copy №N (${integrity word: whole / half / a quarter / a single page}). The author handed it to you on ${formatDateEn(givenDay)}, ${age} days ago.` — or, when the copy arrived through a chain (`claim.to === speaker.id && claim.arrived`), `${H name} handed it to you on …, ${age} days ago (the author gave it to ${H name} first).` + `You have NOT read it (two pages at most) and you never will; if asked how it is going, use your usual excuses.` + if there are events by this speaker on this copy: `What you tell the author about it, in order (these are facts of this conversation, state them as your own words when relevant): "…", "…"`.
- Last holder of a lost copy: `You had copy №N and it is gone. What you say happened: "${last event text}". Stick to this story; you will not admit it is lost.` For `passed_on` claims add `You say you gave it to ${T name}. (Truth: ${it arrived / it never arrived} — the author cannot know this from you.)`
- `T` of a failed chain (a copy with `claim.to === speaker.id && !arrived`): `${H name} claims he gave you copy №N. He did not: nobody gave you anything. If asked, say so plainly (seed: „ჩემთვის არავის არაფერი მოუცია.“).`
- Stray page for the speaker: `A few loose pages of a typescript titled „ტიანშანი“ turned up on your desk; you do not know who left them or why. Mention it once in this chat, in your beat 2, if it fits naturally — do not offer to return them.`
- Refuser (`accepts: false`, no `# ACTION` this turn): `If the author tries to leave a copy with you, you do not take it. Your reason: "${refuse_ka}".`
- Nothing applies → the block is omitted entirely (saves tokens).

### 7.3 `# ACTION` block (only on action turns, last in the system prompt, after `# PACING`)

- `hand_over/accepted`: `THIS TURN: the author just handed you copy №N (${integrity}). You take it. Reply in character with your attitude to the manuscript; seed phrase: "${accept_ka}". Do not promise a date you will keep; do not start reading on the spot.`
- `hand_over/refused`: `THIS TURN: the author just tried to hand you copy №N. You do NOT take it; it stays with him. Reason, seed phrase: "${refuse_ka}". Say it in character, with one excuse only.`
- `retrieve/returned`: `THIS TURN: the author asks for copy №N back. You give it back (what is left of it: ${integrity}). Seed phrase: "${return_ka}". Never claim you finished it.`
- `retrieve/not_returned`: `THIS TURN: the author asks for copy №N back. You cannot give it: "${reason text}". Say this in character; do not invent a different fate for it.`

Rules already in `GENERAL_RULES_EN` (two beats, 2–3 sentences, catchphrase gate, redirect gate) keep applying. The redirect gate: on a `not_returned` turn whose reason names a visible character (`to`), allow the redirect regardless of `manuscriptCount` (so „→ მივიდე კოტესთან“ appears when Vaso says he passed it to Kote). Extend `redirectGateLine(p, { allow: true })` accordingly.

### 7.4 `sanitizeManuscript` and `pacing`

`sanitizeManuscript(body.manuscript, cfg, byId, behaviour)` in `prompt.js` next to `sanitizeGameState`. Action turns count as manuscript messages for `pacingState` (the stage text contains „ეგზემპლარ“, so `MANUSCRIPT_KEYWORDS` already matches — verify in a unit test).

### 7.5 Mock LLM (`src/mock.js`)

Honour the action: reply with the seed phrase plus one of the character's existing beat-2 touches (deterministic). For `not_returned`, reply with the reason text and, if `to` is a visible character, append the existing redirect hook („<Name>-სთან ჩაიარეთ.“) so `suggested_redirect` is deterministic. For a holder without an action, when the user's text matches `MANUSCRIPT_KEYWORDS`, reply with the last event text (or `stalled` seed). For a failed-chain T, reply with „ჩემთვის არავის არაფერი მოუცია.“ when asked. For a stray page, include „რაღაც ფურცლები მიდევს მაგიდაზე, არ ვიცი ვისია.“ in the first reply of the chat.

---

## 8. UI (the only visual additions of this round — everything else stays pixel-identical)

### 8.1 Action rows in the chat log

The hand-over/retrieve user message is rendered as `div.msg.user.action` → `div.bubble` through `renderSegments`, so the `*…*` text takes the existing `.stage` style (italic condensed title font, `#7a6a58`). Add only: `.msg.user.action .bubble { background: transparent; border: 1px dashed rgba(42,38,34,0.35); }` — a "slip of paper" look using existing colours. Nothing else changes in the log.

### 8.2 Header

`#stat-copies` keeps its place, glyph and format. It becomes a button-like element (`role="button"`, keyboard `Enter`/`Space`) that toggles the ledger (§8.3). Its hover tooltip `#copies-tip` now shows the ledger lines joined by ` · `; the `aria-label` likewise.

### 8.3 Ledger — `#copy-ledger`

A paper sheet in the exact style of `.copy-note` (same gradient, shadow, `rotate(-1.5deg)`, width `min(340px, calc(100vw − 32px))`, 14px/1.45), positioned `top: 10px below #topbar`, horizontally under `#stat-copies` on desktop (clamped to the viewport), `z-index` 31. Content:

```
<div id="copy-ledger" class="copy-note ledger" role="dialog" aria-label="ხელნაწერის ეგზემპლარები" hidden>
  <div class="pin" aria-hidden="true"></div>
  <p class="ledger-title">„ტიანშანი“ — 3 ეგზემპლარი</p>
  <ol id="copy-ledger-list"></ol>
</div>
```

`ledgerLines(store, byId, cfg)` returns one string per copy, in id order, exactly these forms:

- in hand: `№1 — თქვენთან` ; with integrity < full: `№1 — თქვენთან (ნახევარი)`
- held: `№2 — ვასოსთან 15 ოქტომბრიდან` ; with integrity < full: `№2 — ვასოსთან 15 ოქტომბრიდან (მეოთხედი)` (date = `` `${d.getUTCDate()} ${MONTHS_KA_FROM[d.getUTCMonth()]}` `` with `d = dateFor(cfg, givenDay)`; the „-დან“ forms: `ოქტომბრიდან`, `ნოემბრიდან`, `დეკემბრიდან`, `იანვრიდან`, `თებერვლიდან`, `მარტიდან`, `აპრილიდან`, `მაისიდან`, `ივნისიდან`, `ივლისიდან`, `აგვისტოდან`, `სექტემბრიდან` — add `MONTHS_KA_FROM` to `calendar.js`)
- claimed, unverified (takes precedence over the held/lost forms): `№2 — ვასოს თქმით, კოტეს გადასცა`
- lost, verified or with no claim: `№3 — დაკარგულია: ბანკში დამრჩა. (ვაჟა ზაზაევიჩი)` (last event text, then the last holder's `short_name_ka` in brackets)
- lost after a verified failed chain: `№2 — დაკარგულია: კოტე ამბობს, არაფერი მიუღია.`
- stray page seen (`seen: true`) → append ` · ერთი ფურცელი ლალისთან` to that copy's line.

Opening/closing: click on `#stat-copies` toggles; `Escape` and a click outside close it; it is hidden automatically when a chat opens. On `< 900px` (`#stat-copies` is hidden there, Round 3 §6) the same three lines are appended to the tree tooltip under `#season-tip-cycle` as `<ol id="season-tip-ledger">` with the tooltip's existing font size — no separate ledger sheet on mobile.

### 8.4 Copy note after a step

Reuse `#copy-note` exactly as Round 4 made it (paper slip under the header, ~4 s, tap to hide), now showing the new events of that step, one note per event, queued one after another (max 3 per close): text = `` `${short_name_ka}: ${text_ka}` `` → `ვასო: პირველი მეოთხედი კოტეს გავატანე.` Shown after the season intertitle if there is one, like today. `stalled` events are shown too (they are the "good reason" the owner asked for). Chain arrivals show the **holder's claim only** (the user learns the truth from T).

---

## 9. Collapse, reset, cycles

- Collapse (`nextCycle`): `tianshani.copies` is recreated for the new cycle — three fresh copies in hand, no stray pages. `clearAllChats()` already clears histories.
- Reset-all: same.
- `cycle` mismatch on load → recreate (guards old state).
- Nothing about the collapse scene, intertitle or wall re-seed changes.

---

## 10. Canon edits (explicitly allowed by the owner for this round only)

The owner says the circus is not in the film; only the bank is. Edit `characters.json` in exactly these four places and nowhere else:

1. `world.the_manuscript.en`: `one is left in a bank (or a circus)` → `one is left in a bank`.
2. `world.evasion_taxonomy_en` → `geographic_loss.ka_example`: `ბანკში დამრჩა, ან ცირკში.` → `ბანკში დამრჩა.`
3. `characters[director].persona_ka.real_activity`: `ხელნაწერი ხან ბანკში რჩება, ხან ცირკში, ხან უჯრაში.` → `ხელნაწერი ხან ბანკში რჩება, ხან უჯრაში.`
4. `characters[director].excuse_repertoire_ka`: `ბანკში დამრჩა, შეიძლება ცირკში.` → `ბანკში დამრჩა.`

Also update `FIXES_ROUND4.md`'s note texts? No — earlier rounds are history; do not edit them. Mention the removal in `DECISIONS.md`.

---

## 11. Tests (mandatory, all must pass from a clean `npm ci` via `npm run test:all`)

Unit (`tests/unit/round8.test.mjs`):
- integrity ladder, `applyHandOver`/`applyReturn`, `bestCopyInHand`, `lostCount`, cycle reset.
- `applyStep` with a fixed rng: `min_days` gate; `probability_scale` 0 and 1000; every event kind; one event per copy per step; chain arrive/lose with `chain_override`; `p_arrive` clamping; stray page recording (both paths, max one per character).
- `ledgerLines` for every line form in §8.3 (Georgian strings compared exactly); `MONTHS_KA_FROM` for all 12 months; `dative()` for every `short_name_ka`.
- `sanitizeManuscript` rejects bad ids/holders/integrities; `calendar.derive` no longer has `lostCopies`; `seasons_per_lost_copy` is ignored.
- prompt: `# MANUSCRIPT COPIES AND YOU` lines for holder / lost / failed-chain T / stray page / refuser / omitted; `# ACTION` block for all four outcomes; pacing counts an action turn as a manuscript message; redirect gate opened on `not_returned` with visible `to`.

API (`tests/api/round8.test.mjs`, mock LLM):
- `hand_over` to Vaso → `done.action_result.outcome === "accepted"`, columns logged; to Shukri and to Tamari → `refused` with their `refuse_ka`; to a holder → 409; to an invisible character → 400.
- `retrieve` from a holder → `returned` with integrity; from last holder of a lost copy → `not_returned` with reason and, when `to` is visible, `suggested_redirect === to`; nothing to retrieve → 409.
- a request without `action`/`manuscript` still works (backward compatibility).

E2E (`tests/e2e/round8.spec.js`, desktop 1280×800 **and** phone 375×812, mock LLM, `settings.e2e.json` with `probability_scale: 1000`, `chain_override` as needed):
- button hidden in a proxy chat; hand-over mode with Vaso; click → action row rendered with `.stage` styling → reply → status line `ეგზემპლარი №1 ვასოსთანაა 0 დღეა` → button in retrieve mode → header `3/3`.
- close chat → copy note `ვასო: …` appears and hides; ledger (desktop click on `#stat-copies`, mobile via the tree tooltip) shows the right line; `Escape` closes the ledger.
- `probability_scale: 0` run: nothing ever changes across three closes.
- chain: Bela → Leri with `event_override: "passed_on"` and `chain_override: "arrive"` → Leri's chat shows retrieve mode; with `"lose"` → Leri's chat (after opening) flips the ledger to `დაკარგულია: ბელას ქმარი ამბობს, არაფერი მიუღია.`
- collapse (seed `tianshani.game` near day 359, close a chat) → ledger back to three `თქვენთან` lines; reset-all → same.
- refusal flow with Tamari leaves the count and the button unchanged.

Real-API smoke (`tests/real/`, only when a key exists): hand a copy to Vaso, ask „როგორაა საქმე?“, retrieve it; hand to Tamari (refusal); log the replies in `TEST_REPORT.md` for human review, check that the holder never claims to have finished reading and that refusals keep the copy in hand.

Screenshots: before/after at both viewports for the wall (header unchanged except the count), the chat with the new button in both modes, the ledger open, the copy note. Report pixel diffs; outside the new elements the diff must be 0.

---

## 12. Close-out

- `TEST_REPORT.md` → section "Round 8" with the requirement → verification → pass/fail table and the logged real-model replies.
- `DECISIONS.md` → `R8.x` entries (incl. the `seasons_per_lost_copy` removal, the circus edit, the PRNG choice, any ambiguity you resolved) and `P8.x` proposals you did **not** implement.
- `PROJECT_CONTEXT.md` → update the "Current behaviour summary" calendar/game bullet to describe the new copies mechanic in 3–4 sentences and remove the old "one copy lost per season" sentence; update the "Next idea" paragraph (it is done).
- `README.md`/`SETUP.md` → document `game.manuscript.*` keys.
- Commit in logical chunks (state model + step logic; server/prompt/mock; UI; tests; docs), push to `main`, report hashes.
