# FIXES_ROUND10 — leaked "rules check" replies (root cause + safe guard), truncated replies, Marksheider's building talk

Read `PROJECT_CONTEXT.md`, `CLAUDE.md`, `AGENT_PROMPT.md` and `FIXES_ROUND1–9.md` first; everything there still applies unless this file overrides it. Standing rules apply in full: implement only what is written here, log everything else as a proposal in `DECISIONS.md`, visual design frozen, canon (`characters.json`, `cisperi_mtebi_personajebi.md`, `analysis/`) untouched, testing is your job, finish with `TEST_REPORT.md`, `DECISIONS.md`, commits and a push to `main`.

The site is live on https://tianshani.ge (rehost.ge, cPanel/LiteSpeed). A server cron job pulls `main` every night at 04:00 Tbilisi time and restarts the app only when there is a new commit — **pushing to `main` deploys**. Do not touch the server; keep `main` green.

**The owner's main requirement for this round: the fix must be thorough, but it must not change the behaviour of anything else.** Every new check must be narrow (no false positives on normal replies in any language), every new code path must leave manuscript actions, redirects, proofread, limits, logging and the client UI working exactly as today. §7 lists the regression checks that prove this.

---

## 1. The bug (production, Marksheider, owner's Georgian message saying he has no copies left)

The visitor saw this instead of a Georgian reply:

```
Context: User says they have no copies left of their manuscript, but will keep it in mind for the future.
Speaker: მარკშეიდერი (ბატონი ევგენი).
Rules check:
- Language: Georgian.
- User: სანდრო (use „ბატონო სანდრო“ / „თქვენ“).
- Manuscript message count: this is turn 2 about manuscript. Gate: engage, no redirects yet (REDIRECT GATE: < 3).
- FOR THIS REPLY: no stage direction at all — plain speech only, no asterisks! Speak ONLY to the user.
- Shape: Two beats. Exactly 2 sentences (or 3 at most). Each sentence on a NEW LINE (\n).
- Beat 1: Answer only what was asked / said with persona attitude + excuse/pol
```

This is the model's private planning — a checklist it makes for itself before answering — printed as if it were the answer. Each line paraphrases our own system prompt: `REDIRECT GATE` (`pacing.js redirectGateLine`), `FOR THIS REPLY: no stage direction at all — plain speech only… Speak ONLY to the user` (`prompt.js STAGE_MODE_LINES.none`), the two-beat `LENGTH FOR THIS REPLY` / `BEAT 2 FOR THIS REPLY` lines, `Messages about the manuscript so far` (`pacingLine`).

## 2. Step 1 — reproduce and measure before changing anything (mandatory, report the numbers)

Write `scripts/probe-leak.mjs` (real API, only when a key exists; not part of `test:all`). It rebuilds the production situation through the real `buildPrompt` + `geminiStream` path: speaker Marksheider, user name „სანდრო“, history = one earlier user message about the manuscript and his reply, stage mode `none`, last user message „სამწუხაროდ ეგზემპლარები აღარ დამრჩა, მაგრამ გავითვალისწინებ.“. Run it 30 times and, for every run, record from the **raw** stream (not `chunk.text`): every part with its `thought` flag, the final `finishReason`, `usageMetadata.thoughtsTokenCount`, and whether the visible text is a leak (§3.1). Then repeat 30 runs each with `thinking_budget` 64, 128 and 256 (temporary override in the script only) and record leak rate, average latency and average output tokens.

Write the results table into `DECISIONS.md` (R10.1) and answer these questions there:

1. Does the leaked text arrive as ordinary text parts, or as parts marked `thought: true` that our code prints because `chunk.text` includes them? (If the latter, §4.1 alone fixes the cause.)
2. How often does it happen with `thinking_budget: 0` (the current setting)?
3. Does a small thinking budget remove it, and what does it cost in latency (time to first visible delta) and tokens?
4. Are these leaks always cut by `MAX_TOKENS`?

### 2.1 Thinking mode — measure, then choose (owner-approved)

The owner wants thinking at the **minimum level, and only if it does not make replies noticeably slower** — these short in-character replies should not need real reasoning; the point is only to give the model's planning a hidden place to go. Hard rule for the choice: the median time to the first visible delta may grow by **at most 0.5 s** compared with `thinking_budget: 0`. Prefer the smallest budget that removes (or nearly removes) the leaks — also measure **64** in addition to 128 and 256. If no budget meets the latency rule, keep `0` (the guard in §3 still protects the visitor) and say so. Besides the fixed budgets (0 / 64 / 128 / 256), measure an **adaptive policy** and pick the best of all options by: visible leaks (must be 0 with the guard, but fewer caught leaks = fewer regenerations), reply quality (two beats, Georgian, in character — judge on the logged replies), time to first visible delta, and cost. Adaptive candidates to evaluate (one or a combination):

- thinking on when the conversation is long (e.g. from the 4th–5th user message in the chat, or when the history sent exceeds a threshold of tokens);
- thinking on for "heavy" turns: manuscript actions (`action` present), proxy chats, the first reply after a redirect, messages longer than N characters;
- thinking off for short small-talk turns early in a chat.

Implement the chosen policy as config, not hard-coded numbers: `gemini.thinking_budget` stays the default for normal turns, plus a new block `gemini.thinking_policy` (with `_comment` in `settings.example.json`), e.g. `{ "mode": "fixed" | "adaptive", "budget": 256, "from_user_message": 4, "history_tokens_over": 9000, "on_actions": true, "on_proxy": true }` — only the fields your chosen policy needs. Put the chosen values as defaults in `settings.example.json`, explain the choice with the measured numbers in `DECISIONS.md` (R10.2). The proofread call keeps `thinking_budget: 0`.

**Output cap with thinking.** In Gemini, thought tokens count against `maxOutputTokens`. Whenever thinking is on for a turn, send `maxOutputTokens = visible cap + thinking budget`, so the visible reply keeps its full room. The visible cap rises from 180 to **256** (owner: 180 is too tight; most `MAX_TOKENS` cuts come from Georgian's high token count). Reply *length* is still governed by the prompt (2–3 sentences); the cap is only a safety net, and only used tokens are billed. Update `max_output_tokens` in `settings.example.json`, the token reserve calculation (`reserveTokens`) and the proofread cap formula (it is based on the reply's real token count, so it needs no change — verify).

**Temperature stays 0.8** for replies (owner decision); proofread stays 0.

**Must take effect on the live server without manual edits.** The production `settings.json` was auto-created from the old `settings.example.json`, so it contains the old literal values `gemini.max_output_tokens: 180` and `gemini.thinking_budget: 0`, and `loadConfig` lets `settings.json` override the example. Therefore do not rely on changing those two keys' defaults. Instead introduce new keys that the old file does not contain: `gemini.visible_output_tokens` (default 256 — the visible cap used everywhere `max_output_tokens` is used today) and the `gemini.thinking_policy` block (which, when present, decides the thinking budget per turn). Keep reading `max_output_tokens` / `thinking_budget` only as a fallback when the new keys are absent, and log once at startup which values are in effect. Add a unit test that loads a copy of an "old" settings.json (with 180 / 0) and asserts the new cap and policy are the ones applied.

Known contributing facts (verify, don't assume): (a) `thinking_budget: 0` is set for speed, but `scripts/probe-thinking.mjs` already showed this model still wants to "think" (~380 thought tokens on proofread calls); (b) the end of our system prompt is a long list of capitalised per-turn directives, which invites a "let me check the rules" answer; (c) `server.js` streams every delta straight to the browser with no check; (d) `shouldProofread()` skips non-Georgian text, so nothing downstream caught it; (e) the reply was cut at `max_output_tokens` (180) — „excuse/pol“ — and `geminiStream` ignores `finishReason`; (f) the broken reply now sits in the visitor's `localStorage` history and is sent back on every later turn, inviting the same format again.

## 3. The guard — narrow detection

### 3.1 Detector

New module `src/leak.js` (pure, browser-safe — no Node imports, so the client can import the same file via a tiny re-export in `public/js/leak.js` or a build-free copy guarded by a unit test that both are byte-identical):

```js
export const LEAK_LABELS = [...];   // see below
export function isMetaLeak(text, { expectLang } = {}) → { leak: boolean, reason: string|null }
```

A reply is a leak only if at least one of these holds:

1. **Our prompt's own labels appear anywhere** (case-sensitive, exact): `REDIRECT GATE`, `FOR THIS REPLY`, `TOUCH POOL`, `CATCHPHRASE FOR THIS REPLY`, `LENGTH FOR THIS REPLY`, `BEAT 2 FOR THIS REPLY`, `YOUR OWN SUBJECT`, `Messages about the manuscript so far`, `Manuscript message count`, `Rules check`. No character ever says these.
2. **Two or more planning labels start lines** (line starts, case-insensitive, followed by a colon): `Context:`, `Speaker:`, `Language:`, `User:`, `Shape:`, `Gate:`, `Beat 1:`, `Beat 2:`, `Plan:`, `Draft:`, `Persona:`, `Tone:`. One such label alone is not enough (an English-speaking visitor's chat could contain "Note: …" legitimately) — two are.
3. **Wrong script for a Georgian conversation**: `expectLang === 'ka'` (from `guessLang(lastUserMessage)`, existing `src/lang.js`) **and** the reply, with `*…*` stage directions removed, contains no Georgian letter at all. (Do not use a percentage rule — Georgian replies legitimately contain Russian words in Cyrillic and occasional Latin names.)

Nothing else counts. Do **not** add natural-language phrases ("Let me", "I need to", "The user") — they would block legitimate English replies. When the visitor writes in Russian or English, only rules 1–2 apply.

### 3.2 Where it runs (`/api/chat`) — and what must not change

1. **Hold back only the first line.** Buffer deltas until the text contains its first `\n`, or reaches 120 characters, or the stream ends; run `isMetaLeak` on that prefix. Clean → flush it and stream the rest exactly as today. The typing indicator covers the hold (the client already shows it until the first delta). Added latency must be under ~0.5 s on normal replies — measure and report it.
2. **Early leak → one regeneration.** Abort the stream (existing `AbortController`) and call `geminiGenerate` once (non-streaming) with the **same** `systemInstruction` and contents plus one extra final line: `YOUR PREVIOUS ATTEMPT WAS REJECTED because it contained notes or rule checks instead of speech. Output ONLY the words your character says (plus at most one stage direction in *…* if allowed), in the user's language.` Before regenerating, run the same token-reserve check used today (`reserveTokens`/`wouldOvershoot`); if the budget would be exceeded, skip regeneration and fail the turn (step 4).
3. **Late leak → replace.** After the stream ends, check the full text. If it is a leak (labels can appear after line 1), regenerate as in step 2 and send the clean text with the existing `{ replace }` SSE event — the client already applies `replace` (proofread uses it).
4. **Regeneration also leaks (or errors)** → send the existing `{ error }` event with the existing `MSG_API_ERROR` text („ხაზი დაკავებულია. ცოტა ხანში სცადეთ.“), exactly like an API error today: the client keeps the user's message, no assistant message is saved, the exchange does not count for the calendar. No new UI text anywhere.
5. **Everything downstream uses only the final clean text**: proofread runs on it (unchanged rules), `countSentences`/`longReply`, `findNonWords`, `detectRedirect` (so the „→ მივიდე …“ button is computed from what the visitor sees), `logExchange`, pacing on later turns. The manuscript action outcome (`action_result`) is decided before generation and is identical whether or not a regeneration happened — the regenerated text gets the same `# ACTION` block because it uses the same system instruction.
6. **Billing**: usage of the discarded attempt is added to the per-client and global counters (it was billed by Google).
7. **Logging**: nullable columns on `messages` via `addColumn`: `meta_leak` INTEGER (1 when caught on this turn) and `discarded_reply` TEXT (first 2000 chars of the rejected text). `log.warn('meta-leak caught (<id>): <reason>')`. Admin page unchanged.
8. Mock mode: the guard runs too (so tests cover it); normal mock replies never trigger it.

### 3.3 History hygiene (protects visitors whose browser already stores such a reply)

- Server: in the `clean` history filter, drop assistant messages where `isMetaLeak(content).leak` (rules 1–2 only; rule 3 needs the user's language and is not applied to history). Two user messages may then be adjacent — `toGeminiContents` already merges same-role messages; keep it that way and test it.
- Client `historyForServer`: same filter via the shared detector. The message stays visible in the visitor's log; nothing is deleted from `localStorage`.

## 4. Root-cause hardening (small, safe)

### 4.1 Never print thought parts

In `geminiStream` and `geminiGenerate`, build the text from `candidates[0].content.parts`, skipping every part with `thought === true`, instead of relying on `chunk.text` / `res.text`. Keep everything else identical (usage, cached tokens, retry without thinking config). If any thought part is ever seen, `log.warn` once per request.

### 4.2 Truncation at `MAX_TOKENS`

`geminiStream` yields the final `finishReason`. **Only when it is `MAX_TOKENS`**: trim the reply to the end of its last complete sentence (sentence end = `.`, `!`, `?`, `…`, optionally followed by a closing `»`, `“`, `"`; keep a complete trailing `*…*` stage direction; never cut inside `*…*`), send the trimmed text with `{ replace }`, and save/log the trimmed version (untrimmed → `discarded_reply`). If nothing complete is left → fail the turn as in §3.2 step 4. Replies that finish normally are never touched, whatever their last character. (With the visible cap at 256 — §2.1 — this should be rare; report how often it fires in the real-API runs.)

### 4.3 One output line at the very end of the system prompt

Append as the last line of the system instruction (after `# PACING`, the stage-mode line and any `# ACTION` block):

`OUTPUT: everything you write is shown to the visitor verbatim as ${short_name_ka}'s words. Write only the spoken reply (plus at most one stage direction in *…* when allowed), in the user's language. Never write notes, plans, rule checks, a summary of the situation, or labels such as "Context:", "Speaker:", "Beat 1:".`

Do not rewrite or reorder any existing directive in this round. Check with the existing prompt unit tests that all previous sections are still present and in the same order.

## 5. Marksheider's building talk — light, varied, around the crack

Owner's observation: in a long conversation Marksheider never mentioned the crack, although his canon profile is built around it (`system_prompt_en`: "you notice every crack ('ეს ბზარი იყო აქ?')… steer to the crack in the wall"; `persona_ka.real_activity`: „ბზარებს აკვირდება…“; catchphrases „ეს ბზარი იყო აქ?“, „აი, კიდევ შემაქანა.“, „საიდან შეგაქანათ? მარცხნიდან თუ მარჯვნიდან? — ქვემოდან.“, „პანიკის საფუძველი არ არსებობს, ჯერჯერობით.“; excuse „ჯერ ეს ბიძგი გავარკვიოთ…“; `voice_extras.json` → „იკითხე ბზარზე ყოველ ახალ ოთახში.“). It gets lost because the crack only exists as gated catchphrases (Round 6 gate: ~1 in 3 replies, trigger must fit) and as one of seven rotating `WORLD_TOUCHES_KA`.

**Target (owner): the building theme comes up in about 2–3 of every 10 replies — not more. The crack is the main vector, but around it there must be variety**: is this wall leaning, is the floor a little tilted, did it just shake, where did the tremor come from, has the plaster on the ceiling come down, does the door still close, is the window frame warped. Not every mention is the crack.

New non-canon data file `src/data/preoccupations.json`:

```json
{
  "marksheideri": {
    "every_n_replies": 4,
    "intro_en": "Your own subject is the state of the building. Bring it in naturally, in your own words, calmly and politely, as a quick observation or a question to the user — never a lecture.",
    "variants": [
      { "weight": 3, "en": "the crack in the wall — was it there before, has it grown" },
      { "weight": 1, "en": "whether this wall is leaning slightly" },
      { "weight": 1, "en": "whether the floor is a little tilted" },
      { "weight": 1, "en": "a small tremor just now — from the left, the right, or from below" },
      { "weight": 1, "en": "plaster dust coming down from the ceiling" },
      { "weight": 1, "en": "a door or window frame that no longer closes properly" }
    ],
    "keywords_ka": ["ბზარ", "ბიძგ", "შემაქან", "შეგაქან", "დახრ", "იატაკ", "კედელ", "ჭერ", "ბათქაშ", "ქვემოდან", "შენობ"]
  }
}
```

- Load in `src/characters.js` like `voice_extras.json`; attach as `speaker.preoccupation`.
- `pacing.js`: `repliesSinceTopic` = number of the speaker's replies in this chat since the last one containing any `keywords_ka` (whole history window; a fresh chat counts as "long ago").
- When `repliesSinceTopic >= every_n_replies − 1` (i.e. roughly every 4th reply, giving 2–3 per 10): pick one variant by weight with a deterministic seed (`messageCount`), never the same variant as his last building mention if that is detectable by keywords, and put this first in the touch pool: `YOUR OWN SUBJECT for beat 2 in THIS reply (your own words; not a catchphrase, not limited by the catchphrase rule): ${intro_en} This time: ${variant}.` On all other replies the subject is **not** added to the pool (so it doesn't come up more often than wanted; his canon system prompt still lets him mention it when the talk leads there).
- Catchphrase gate unchanged; the literal „ეს ბზარი იყო აქ?“ remains gated.
- Proxy turns where Marksheider answers for an invisible character: same rule (he is still himself).
- Only Marksheider gets an entry. Log in `DECISIONS.md` as proposal (not implemented) which other characters could use the mechanism.

## 6. Tests

- **Unit**: `isMetaLeak` → leak for the production text above; clean for ≥ 20 real replies (Georgian from `TEST_REPORT.md`/sample dialogues, incl. ones with `*stage directions*`, Cyrillic Russianisms and Latin names; Russian and English replies to Russian/English questions; an English reply that contains one "Note:" line); trimming cases (production „excuse/pol“ ending, trailing stage direction, nothing complete left, normal `STOP` reply never trimmed); thought-part filtering in both Gemini functions (fake chunks with `thought: true`); history filter on client and server, shared detector identical; preoccupation: counter, frequency over a simulated 40-reply chat is 8–12 forced mentions, variant weights respected and no immediate repeat, not counted as a catchphrase; prompt sections still present and ordered, `OUTPUT:` is last.
- **API (mock)**: hooks in `src/mock.js` — `gemini.mock_leak: "first" | "late" | "always"`, `gemini.mock_truncate: true`. Assert: `"first"` → client gets only the clean regenerated reply, `meta_leak = 1`, `discarded_reply` stored, usage counted twice; `"late"` → `replace` with clean text; `"always"` → `error`, nothing stored, calendar unaffected; truncate → `replace` with trimmed text; a history containing a leaked assistant turn is accepted and not passed to the model; a manuscript `hand_over` turn with `mock_leak: "first"` still returns the same `action_result` and the store update happens once.
- **E2E** (desktop + phone, mock): `mock_leak: "first"` → no "Context:" ever visible; `"always"` → the existing error row, then a normal message works; the Round 8/9 manuscript flows and redirect button tests still pass unchanged.
- **Real-API smoke** (with key): the §2 reproduction 15× → 0 leaks visible to the client (report how many were caught and regenerated); two 10-reply mixed conversations with Marksheider (small talk + manuscript) → building theme in **2 to 4** replies in each run, and at least one non-crack variant across the two runs; log all replies in `TEST_REPORT.md`.

## 7. Regression proof (must all hold — list each in `TEST_REPORT.md`)

1. `npm run test:all` from a clean `npm ci`: every Round 1–9 test passes unchanged (no edits to old tests except where a test asserted the absence of the new columns/fields).
2. Before/after screenshots at 1280×800 and 375×812 for the wall and a chat: 0 changed pixels outside streaming text.
3. Measured first-delta latency on normal replies: the hold-back guard adds ≤ 0.5 s (mock and real, thinking off); report separately the extra latency of thinking-on turns under the chosen policy.
4. Russian and English conversations (real API, 3 replies each): no false leak, no regeneration.
5. Manuscript hand-over / retrieve / refusal, redirect button, proxy chat, limits modal, proofread `replace`: behave exactly as in Round 9.

## 8. Close-out

`TEST_REPORT.md` → "Round 10"; `DECISIONS.md` → `R10.x` (incl. the §2 measurements, answers and the chosen thinking policy with its numbers) and `P10.x` proposals (e.g. other characters' preoccupations); `PROJECT_CONTEXT.md` behaviour summary updated (leak guard, MAX_TOKENS trim, thought-part filter, preoccupations); commit in logical chunks, push to `main`, report hashes; note that the nightly server job deploys at 04:00 Tbilisi time.
