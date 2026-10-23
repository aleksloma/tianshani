# Fix round 1 — „დაბეჭდე ტიანშანი“

The first version works and looks good. This file lists the fixes for round 1. Read `AGENT_PROMPT.md` again for the overall spec (it still applies); this file only changes/extends it. Implement all five items, update tests, run the full test suite, update `TEST_REPORT.md` and `DECISIONS.md`, commit and push to `github.com/aleksloma/tianshani`.

---

## 1. Frames must return to the wall (bug)

**Observed:** clicking a frame makes it "fall"/animate to the center beautifully, but afterwards it stays in the fallen/moved state forever — after closing the chat, after switching to another character, and even after a page refresh the frame no longer hangs in its wall spot.

**Required:**
- The "fallen/centered" state is **transient UI state only**, never persisted. On page load every frame hangs in its laid-out wall position, regardless of anything in `localStorage`. Audit `storage.js`/`wall.js` for any saved per-frame transform/position/"active" flag and remove it (keep only the layout seed).
- On chat close (✕, Esc, clicking the dimmed wall) the frame animates **back to its exact original spot** (reverse FLIP: same duration ~400 ms, same easing) and all inline transforms/classes added for centering are removed, leaving only the layout's own `translate/rotate`.
- Switching characters via „ესაუბრე სხვას“ or the „→ მივიდე …-სთან“ redirect button: the current frame returns to the wall **first** (or simultaneously), then the new one comes to the center. Never two frames in the center; never a frame left behind.
- Re-layout on resize / season change / collapse must not break a frame that is currently centered (if a chat is open during resize, keep it centered and recompute its home position for when it closes).
- Add e2e tests: (a) open → close → the frame's bounding box equals its original box (±2 px) and its rotation equals the original; (b) open A → switch to B → A is back at its spot, B is centered; (c) open → reload → all frames are at wall positions, none centered, no chat panel open.

---

## 2. Stage directions — show what the character is *doing* (phone calls, asides)

**Observed:** Vazha Zazaevich's reply contains „დიახ, დიახ, კი, კი, გისმენთ…“ — he is clearly answering a phone call mid-sentence — but nothing marks it, so it reads like he is saying it to the user. In Otari's reply the stage direction „(შაბიამნის ტომრებს გვერდით გადადებს, ხელებს ერთმანეთზე დაიბერტყავს)“ is there, which is exactly what we want — but it is rendered in the same font as speech.

**Required — prompt side (`src/prompt.js`, general instruction):**
- Add a rule: *"Whenever the character does something physical, is interrupted, or speaks to someone other than the user (telephone, a colleague walking in, shouting down the corridor), write it as a stage direction wrapped in asterisks: `*…*`. Speech addressed to a third party goes inside the stage direction too, e.g. `*(ყურმილს იღებს) დიახ, დიახ, გისმენთ… კი ბატონო, გავატარებ.* ხო, სოსო, რას ამბობდი?` Stage directions are in Georgian, present tense, third person, 3–15 words, at most two per reply. Everything outside asterisks is speech to the user."*
- Add 1–2 few-shot examples with stage directions to the general block, and make sure existing `sample_dialogues` that already contain parentheses still work (parentheses at the start of a reply or around a whole sentence are also treated as stage directions — see parsing below).
- The film is full of such interruptions (phone, breakfast, the chess game, the painter with the bucket). Encourage ~30–50 % of replies to contain one short stage direction tied to the character's `real_activity`, but never in every single reply.

**Required — client side (`chat.js`, `chat.css`):**
- Parse each assistant message: segments wrapped in `*…*` → stage direction; additionally a segment wrapped in `(…)` that is either the whole first sentence or a standalone sentence → stage direction. Everything else → speech.
- Render stage directions as `<span class="stage">` in a **visibly different style**: italic, a different typeface (a lighter/condensed Georgian face or the typewriter heading font if it supports Georgian), muted grey-brown color, slightly smaller, on its own line when it is a whole sentence — like a screenplay. Speech keeps the current font. No asterisks or brackets visible in the output.
- Parsing must work on the **streaming** text too: while a `*` is open, render the partial segment as stage style; don't flash raw asterisks. Handle unmatched `*` gracefully at end of stream (treat as stage to the end).
- Mock LLM: make mock replies include a stage direction so e2e tests can assert `.stage` elements exist, are italic, and that no literal `*` characters appear in bubbles.

---

## 3. Proxy replies for invisible characters — speak *about* them, in the third person

**Observed (Gamkrelidze chat):** Soso answers, but (a) it is not obvious that it is Soso speaking, and (b) Soso replies as if the user had asked *him* („თქვენ ხომ არ წაგიკითხავთ?“) instead of reacting to what the user wanted from Gamkrelidze.

**Required — prompt side (proxy block in `prompt.js`):** rewrite the proxy block so the model clearly understands the scene. Use this wording (adapt names dynamically):

> *The user is standing at <INVISIBLE name_ka>'s door / desk and is addressing <INVISIBLE>, not you. <INVISIBLE> is not here and never appears. You, <PROXY name_ka>, happen to be nearby and overheard. You answer the user **on <INVISIBLE>'s behalf, speaking about <INVISIBLE> in the third person**: where they are, why they are not here, what they would say, what the user should do instead (wait, come back next week, leave the manuscript with Tina, go to <redirects_to>). Stay fully in your own character and voice, and you may add your own typical remarks and excuses, but never pretend the user's request was aimed at you, never answer the request as if it were yours, and never speak as <INVISIBLE> or quote them in the first person. Start your first reply with a short stage direction that establishes the scene, e.g. `*(დერეფანში გამოდის, კარს უყურებს)*`. Later replies: keep reminding, in passing, that <INVISIBLE> still isn't here.*

- Include in the block the known facts about the invisible character from `world.game_mechanics_en.mentioned_only_characters`, `famous_roll_call_ka` and the invisible character's own `persona_ka`/`system_prompt_en` (as facts only, e.g. Gamkrelidze — "his conclusion" is always quoted, he never appears; Shota — on a business trip; Khaburdzania — doesn't come in; Tsverava — in the army; Kuparadze — line is busy; Murmanidze — office locked; Givi — two big men are looking for him).
- Add a unit test: for every invisible character the assembled prompt contains "on <name>'s behalf", "third person", and the invisible character's facts; and does not contain the invisible character's `sample_dialogues`.
- Add a real-API smoke assertion (when a key is present): ask Gamkrelidze „წაიკითხეთ ჩემი მოთხრობა?“ → the reply must mention გამყრელიძე by name (any case form) and must not contain first-person reading phrases like „წავიკითხავ“ / „წავიკითხე“ attributed to the proxy unless clearly about themselves — log the reply in `TEST_REPORT.md` for human judgment.

**Required — UI side:** make the proxy situation unmistakable.
- Chat header: „~~გამყრელიძე~~ **სოსო**“ (struck-through red as now, but the proxy name bigger/bolder), plus a one-line subtitle under it: „გამყრელიძე ადგილზე არ არის — სოსო პასუხობს მის ნაცვლად“. When the proxy changes between messages, update the header to the current speaker.
- Each bubble label: the same struck-through + speaker pattern but with the speaker name in **bold** and in the proxy's accent color, and a small proxy portrait thumbnail (24 px, the proxy's wall image or silhouette) to the left of the label. Visible characters' bubbles keep their normal label.
- Centered frame: keep the invisible character's silhouette frame in the center, but overlay a small proxy portrait in the bottom-right corner of the frame with a caption „პასუხობს: სოსო“.
- e2e test: open Gamkrelidze → header contains struck-through „გამყრელიძე“ and a proxy name, subtitle contains „მის ნაცვლად“; reply bubble label contains the proxy name in bold and a thumbnail.

---

## 4. Season indicator → a tree that changes with the seasons; time advances per character switch

**Observed:** the header shows a leaf icon with „შემოდგომა“. Replace it.

**Required — visual:**
- Replace the icon+text with a **tree SVG** (inline, ~40×48 px in the header, larger on hover tooltip). Four states that **morph/transition smoothly** (CSS transitions on fill colors, opacity of leaf/snow/blossom groups, ~1.5 s):
  - ზაფხული — full green crown;
  - შემოდგომა — yellow/orange crown, a few falling leaves (subtle CSS animation), some bare branches;
  - ზამთარი — bare branches with snow on them, snowflakes gently falling;
  - გაზაფხული — bare branches gaining small pink/white blossoms and light green buds.
- Intermediate progress inside a season is reflected too: e.g. autumn crown turns from yellow-green to orange as the days pass (interpolate by `dayInSeason / daysPerSeason`); winter snow accumulates; spring blossoms increase. Keep it cheap (a few `fill` interpolations), no canvas.
- **Hover tooltip** (also on tap on mobile) shows: season name, in-world date, days until the next season, crack stage and copies — e.g. „შემოდგომა · 15 ოქტომბერი · ბზარი 1/5 · ეგზემპლარი 3/3“. No season text is permanently visible in the header anymore — only the tree.
- Season intertitles (black screen „ზამთარი.“) stay as they are.

**Required — time model (replace the "exchanges per season" rule):**
- Introduce an in-world calendar in `gameState`: `{ day: 0, ... }` with a start date of **1 September 1983** (`game.start_date`, config). Season boundaries by day count: `game.days_per_season` (default **90**): autumn = days 0–89, winter 90–179, spring 180–269, summer 270–359, then collapse at day 360 → cycle++, day resets to 0.
- **Time advances by `game.days_per_character_switch` (default 20) every time the user opens a chat with a character different from the previously opened one** (opening the same character again does not add days). With 90-day seasons this gives a season change roughly every 4–5 character switches, as the owner wants.
- Optionally also `game.days_per_exchange` (default **0**; set to e.g. 2 to let long chats move time slowly). Keep `exchanges` counting for stats but it no longer drives seasons unless this is > 0.
- The crack stage, lost copies, background tint and the collapse are all derived from the season index exactly as before — only the trigger changed. Make sure crossing *multiple* season boundaries in one jump can't happen (20 < 90), but handle it anyway (loop).
- The date shown in the tooltip is `start_date + day` formatted in Georgian: „15 ოქტომბერი“ (month names: იანვარი, თებერვალი, მარტი, აპრილი, მაისი, ივნისი, ივლისი, აგვისტო, სექტემბერი, ოქტომბერი, ნოემბერი, დეკემბერი).
- Inject the date into the LLM prompt line as well: `In-world date: 15 October 1983, autumn, day 45 of the season.`
- Update `settings.example.json`, `README.md`/`SETUP.md`, and tests: unit tests for the day → season/crack/copies mapping and boundary handling; e2e test with `days_per_character_switch: 45` (test settings) → switching between 2 characters triggers „ზამთარი.“, the tree SVG switches to the winter group (assert a class or `data-season="winter"` on the SVG), tooltip shows the new date; 8 switches → collapse.

---

## 5. Also

- Re-check the stage-direction parsing against the proxy header/bubble labels so that `*` inside names can't break them.
- Visual check: take screenshots of (a) a Vazha reply with a phone stage direction, (b) the Gamkrelidze proxy chat, (c) the tree in all four seasons, (d) the wall after open → close. Look at them and fix anything that looks off before reporting.
- Run `npm run test:all` from a clean `npm ci`. Update `TEST_REPORT.md` with a "Round 1 fixes" section (requirement → verification → pass/fail) and `DECISIONS.md`. Commit in logical chunks (`fix: frames return to wall`, `feat: stage directions`, `feat: proxy third-person`, `feat: season tree + day-based time`), push to `main`, and report the commit hashes.
