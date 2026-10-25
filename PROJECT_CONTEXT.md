# „დაბეჭდე ტიანშანი“ — project context (read this first)

**What it is.** A Georgian-language entertainment website where visitors chat with the characters of the 1983 Georgian film *ცისფერი მთები ანუ დაუჯერებელი ამბავი* ("Blue Mountains", dir. Eldar Shengelaia, screenplay Rezo Cheishvili). The visitor plays an author trying to get a manuscript published; nobody ever reads it, everybody has excuses, and the building slowly cracks and collapses. Characters are played by Gemini (model configurable, currently `gemini-3.8-flash`) with per-character prompts built from `characters.json`. Owner: Sandro (Aleksandre Lomadze). Repo: `https://github.com/aleksloma/tianshani`. Runs locally with `npm start` on `http://localhost:3000`; to be hosted globally later.

**Status (2026-10-25):** fully working, tested, 9 rounds done. Visual design is approved and frozen. Round 8 added the manuscript-copies mechanic (hand over / lose / get back); Round 9 refined it (actions with a message, distinct icons, known-vs-true count) and moved season intertitles onto the wall.

---

## How this project is developed

Work happens in **rounds**. Each round is a Markdown spec file in this folder that a Claude Code agent reads and implements end-to-end (code, tests, screenshots, commit, push). The owner tests the result in the browser, reports what he sees, and a new round file is written.

| File | Role |
|---|---|
| `AGENT_PROMPT.md` | The original full specification (architecture, UI, LLM, game mechanics, limits, admin, testing). Still authoritative where later rounds don't override it. |
| `FIXES_ROUND1.md` … `FIXES_ROUND9.md` | Incremental changes, in order. Later rounds override earlier ones. |
| `DECISIONS.md` | Agent's log of decisions, deviations, and **„Proposals (not implemented)“** — ideas the agent noticed but was not allowed to implement without the owner's approval. |
| `TEST_REPORT.md` | Per-round checklist: requirement → how verified → pass/fail, plus logged real-model replies for human review. |
| `SETUP.md`, `README.md` | How to run locally, deploy, reset a browser, env overrides. |
| `characters.json`, `cisperi_mtebi_personajebi.md`, `analysis/*.md` | **Canonical character data and research.** Do not modify except where a round explicitly says so. |
| `assets_in/` | Source images supplied by the owner (e.g. `shukri_source.png`). |

Starter prompt pattern used for every round:
> Read FIXES_ROUNDn.md in this folder and implement all items. AGENT_PROMPT.md and earlier rounds remain the spec — re-read them first. Work autonomously, log decisions in DECISIONS.md; visual design is approved — change only what the file asks; compare before/after screenshots at 1280×800 and 375×812. Testing is mandatory (unit, integration with mock LLM, Playwright e2e, real-API smoke if a key exists); run `npm run test:all` from a clean `npm ci`. Update TEST_REPORT.md and DECISIONS.md, commit in logical chunks, push to main, report commit hashes.

## Standing rules (apply to every future round and to any assistant helping the owner)

1. **Do not add anything the owner did not ask for** — no UI text, hints, onboarding copy, features, "improvements". If you notice something, write it as a *proposal* and wait for approval. (Two unrequested additions — a scripted opening line and an empty-chat hint — had to be reverted in rounds 5–6.)
2. **Visual design is frozen**: wall background photo (two-toned plaster — intentional), frame sizes, random tilted layout, the iceberg painting („გრენლანდია“, clickable Easter egg), header, fonts, colours, mobile layout (6 frames). Any CSS change must be verified with before/after screenshots.
3. **Character data is canon.** `characters.json` includes material from both the film and Cheishvili's later book; **book material is wanted** (e.g. „სესხბანკი/მშენბანკი“ are real Soviet bank names). Only genuine spelling/grammar errors are fixed. Humorous role descriptions („უცნობი სტუმარი“, „უხილავი „დამრეკი““…) are wanted; only truly opaque words are replaced (done: „მნე“ → „სამეურნეო ნაწილის გამგე“ on display).
4. **Georgian quality matters**: literary Georgian, no invented words, dialect only for the character whose `speech_style` lists it (Tamari's Imeretian), catchphrases stay in Georgian script even in foreign-language replies. A proofread pass (`gemini.proofread`) runs after each reply.
5. **Dialogue style (the heart of the product)**: two beats — (1) answer only what was asked, with one excuse/attitude; (2) one characteristic touch (what they're doing, the building, a counter-question, a stage direction) that *follows logically* from beat 1 with a visible bridge. 2 sentences default, 3 max. Never exhaustive, never dry. Catchphrases only when the context calls for them (~1 in 3 replies), each with a trigger note. No borrowed signature lines between characters. Steering away from the manuscript starts from ~3rd manuscript message; off-topic talk is always welcome.
6. **Invisible characters** (Givi, Kuparadze, Murmanidze, Gamkrelidze, Zina, Kopaleishvili, Tsverava, Khaburdzania, Shota) never speak. A visible "proxy" who mentions them in the film answers in third person; the header shows „~~გივი~~ სოსო“ (struck-through red + speaker).
7. **Testing is the agent's job**, not the owner's.

## Current behaviour summary

- **Wall**: 12 top characters by content score on desktop, 6 on mobile, random non-overlapping frames tilted 5–10°, nameplates; „ესაუბრე სხვას“ dropdown lists the rest (thumbnails, flat list, invisibles last).
- **Chat**: click frame → centers → chat panel; streaming SSE; stage directions `*…*` rendered in a distinct style; newlines per sentence; per-character history in `localStorage`; „→ მივიდე <name>-სთან“ button whenever a reply names another reachable character.
- **User name**: card „თქვენი სახელი“ (link „სოსო ვარ“); shown in header and chat („საუბრობს: …“); passed to the prompt; stored with every logged message.
- **Calendar/game**: in-world date from 1 September 1983; **+20 days each time a chat is closed after at least one message** (`days_per_chat_close`); 90-day seasons; tree SVG in header changes with season, tooltip shows date („10 ოქტომბერი“) + crack/copies; building collapses after 4 seasons → histories cleared, new building.
- **Manuscript copies (Round 8–9)**: the author owns 3 copies (`tianshani.copies`); the give/take icon button left of the chat input attaches a hand-over (best copy in hand) or a retrieve to the composer as a dashed slip („ეგზემპლარი №1 — გადაცემა“); the user may add words and sends with the normal send/Enter — one message = stage line + words (Round 9). The server decides the outcome (accepted / refused / returned / not_returned) from `src/data/manuscript_behaviour.json`, the model only voices it. Only handed-out copies are at risk: each chat close that moves time is one step, in which a holder may stall, lose a fragment, pass the copy on (a chain that may or may not arrive), misplace or damage it (seeded PRNG, `game.manuscript.*` knobs). The chat head shows „ეგზემპლარი №N ვასოსთანაა 40 დღეა“, a paper note shows each step's excuse, and the header count (`2/3`) opens a ledger of all copies (tree tooltip on mobile); collapse / reset give three fresh copies. The count (and the model's state line) is what the author *knows*: a copy lost in a chain still counts until the claim is verified (true loss kept for admin/tests). Holders of a whole copy are told not to claim missing pages.
- **Season intertitles (Round 9)**: the season word is written straight over the wall in its colour (winter white, spring light green, summer green, autumn yellow), no blackout; the collapse intertitle stays black. No SVG crack drawing (removed); `wall.background_by_stage` prepared for future cracked-wall photos.
- **Limits**: per browser (cookie + localStorage id) 500 000 input / 500 000 output tokens per month; UI shows a % ring with tooltip „კითხვების ლიმიტის X % გახარჯულია · დარჩა დაახლოებით N კითხვა“; on exhaustion a film-style modal „ბიუჯეტში გარღვევა გვაქვს, თვის ბოლომდე დავიცადოთ.“ **Global** monthly cap `budget.global_monthly_tokens: 45 000 000` (≈$45–50 at 2026 intro prices $0.75/$3.75 per 1M; prices double 2027-01-01). No per-IP limits (staff share an IP). „ყველაფრის განულება“ control resets local state.
- **Admin** `/admin` (password in `settings.json`): login-only until authenticated; browsers listed by **name + client id**, conversations per character, tokens, budget card (tokens + USD estimate), proofread diffs, export JSON, reset limits.
- **Config**: `settings.json` (gitignored) + `settings.example.json`; env overrides `PORT, HOST, GEMINI_API_KEY, GEMINI_MODEL, ADMIN_PASSWORD, DB_PATH, LLM_MOCK, GLOBAL_MONTHLY_TOKENS`. Mock LLM mode for tests. SQLite in `data/`.
- **Cost reality**: ≈6.5–7.5K input + ≈170 output tokens per message; all testing so far ≈ $0.24.

## Open proposals (not approved, not implemented)

- In a fresh chat the character sometimes refers to a prior conversation („ხომ გითხარი…“) that never happened; proposal: forbid references to earlier talk when history is empty.
- Proxy replies ignore it when the user mentions the proxy himself (e.g. telling Kuparadze "the director says…" and the director answers without reacting).
- Context caching did not take effect (`cached_tokens: 0`); left disabled.
- Boria, Kako, Kote still have silhouettes (no photos found).

## Next idea (to be specified with the owner)

None open. The "manuscript handing-out / disappearance" idea was specified and implemented in Round 8 (`FIXES_ROUND8.md`); the agent's follow-up ideas are in `DECISIONS.md` → „Proposals (not implemented)“ (P8.x).
