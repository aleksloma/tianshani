# Fix round 6 — no empty-state hint, job titles, logical flow inside a reply, context check

`AGENT_PROMPT.md` and `FIXES_ROUND1–5.md` remain the spec; this file changes/extends them. Round 5 was verified live: fresh chats no longer open with a character line, the reset control exists, conversation context works (Vaso remembered the title „ქვიშის საათი“ two turns later). **Visual design is approved — do not change layout, sizes, background, fonts or colours.** Before/after screenshots at 1280×800 and 375×812.

Implement every item, update tests, run `npm run test:all` from a clean `npm ci`, update `TEST_REPORT.md` ("Round 6 fixes") and `DECISIONS.md`, commit in logical chunks, push to `github.com/aleksloma/tianshani` `main`, report commit hashes.

---

## 1. Remove the empty-state hint entirely

Every fresh chat now shows „დაიწყეთ საუბარი. ხელნაწერზეც შეგიძლიათ ჰკითხოთ — ან ნებისმიერ სხვა რამეზე.“ The owner does not want any text there — the message area of a fresh chat is simply **empty** (the header with name/role and the input are enough). Remove the hint element, its CSS and any test that expects it; add an e2e assertion that a fresh chat's message list has zero children and no placeholder text. **Standing rules from now on:** (a) do not add UI text, hints, tips, onboarding or helper copy that the owner did not ask for; (b) do not change wording, titles, descriptions, data or behaviour on your own initiative — if you notice something that looks wrong but is not listed in a fixes file, write it as a *proposal* in `DECISIONS.md` under „Proposals (not implemented)“ and leave the code as it is; the owner decides.

## 2. Job titles: replace only words that are not understandable

Grisha's nameplate, dropdown row and chat header show „მნე“. The word is real but archaic Georgian (steward) — a reader does not understand what job it is. Display **„სამეურნეო ნაწილის გამგე“** instead (the data already has it in `name_ka`: „გრიშა — მნე (სამეურნეო ნაწილის გამგე)“). Change the displayed field only; keep the data and the LLM prompt as they are.

Then go through every displayed title/description (`role_short_ka` on nameplates, the dropdown rows, the chat header role line) with **one single criterion: would an ordinary Georgian reader understand what this word means?** Descriptive or humorous titles are **wanted** and must stay exactly as they are — „უცნობი სტუმარი“, „უხილავი „დამრეკი““, „ფინანსების უხილავი კარიბჭე“, „ვისაც ოთარმა ხელნაწერი „გადასცა““ and the like are all fine. Replace only a word that is archaic, technical jargon or otherwise opaque *as a word* (like „მნე“), and replace it with the plain equivalent already present in the data where possible. If you find no other such word — change nothing else. List every change (expected: only Grisha) in `DECISIONS.md`; if you are unsure about a word, do not change it — put it under „Proposals (not implemented)“.

## 3. Logical flow inside a reply — the second beat must follow from the first

Observed (Vazha): „პირდაპირ აქ, ჩემს მაგიდაზე დადე… თვალწინ მედოს. / მიდექი, მოდექი, შეაწუხე ვინმე, აბა მე აქ რისთვისა ვარ?“ — the second line is his real signature phrase, but dropped there it contradicts the first (he just invited the manuscript onto his desk) and sounds random. Also (Vaso, asked whether he remembers a title): „„ქვიშის საათი“ ერქვა… / არაფრის არ მეშინია! ტანკისტი ვიყავი, ომამდე!“ — a famous line with no bridge to the question. The two-beat shape (round 4 §9) is right; what is missing is the **link**.

Add to the general instruction, replacing/strengthening the beat-2 rule:
- *"The two beats must form one thought. Beat 2 is a continuation of beat 1 — triggered by it, commenting on it, or by what you are physically doing while saying it — never a separate statement dropped in. Make the connection visible with a bridge: a conjunction or particle (აბა, ისე, თორემ, ოღონდ, მერე, თუმცა, ხომ იცი), a shared subject, or a stage direction that motivates the line. Read the two lines together before answering: if a listener would ask 'why did he suddenly say that?', rewrite beat 2."*
- *"A signature catchphrase is used **only when the conversation gives it a natural reason** — the topic, the mood or the thing you are holding must call for it. If nothing in the exchange calls for a catchphrase, do not use one; take beat 2 from what you are doing right now, from the building (the match outside, the crack, the lift, lunch, the phone) or from a question back to the user. Catchphrases should appear in roughly one reply out of three, not in every reply."*
- *"Never contradict beat 1 in beat 2 (if you just invited something, do not send the person away in the next line). If the character's attitude is ambivalent, show it between turns, not inside one."*
- *"Keep one form of address per conversation: if you call the user „ბატონო ალექსანდრე“ / „თქვენ“, do not switch to „ჩემო კარგო“ / „შენ“ in the next reply unless the character's `address_forms` says they mix them — and then mix consistently within a reply, not across one."*
- Technical: for the `touch_pool` (round 4 §9) attach to each catchphrase a short **trigger note** taken from the voice bible (`03_metyvelebis_stili_voice_bible.md` lists where/when each signature line is said — e.g. courage/danger, being asked for help, being praised). Build `data/catchphrase_triggers.json` (id → phrase → trigger_en) once from the bible, by hand or by parsing, for every catchphrase in `characters.json`; the prompt shows catchphrases as `"phrase" — use only when: <trigger>`. Where the bible gives no context, write a sensible one from the film scene or mark `"trigger": "rarely; only if it fits"`.
- Rewrite the two-turn few-shot example in the general block so it demonstrates a visible bridge between beats (neutral content, no character names).

Tests: unit — every catchphrase has a trigger note; the prompt renders them with „use only when“. Real-API smoke (if key): 8 replies across three characters with narrow questions; for each reply log beat 1 / beat 2 and have the test assert (heuristically) that beat 2 either shares a noun with beat 1 or the user's question, starts with a bridge word, or follows a stage direction; count catchphrase occurrences ≤ 3 of 8; assert address form („თქვენ“/„შენ“ verb endings for the user) does not flip within one chat. Log everything in `TEST_REPORT.md` for human review.

## 4. Conversation context — verify and lock it in

Verified live: the client sends the last `chat.history_window` (20) messages, and Vaso recalled the manuscript's title two turns later. Add the guarantees:
- Unit test: the request body contains exactly the last N messages (N from config), oldest first, `scripted` filtered out (if any remain in old storage), roles alternating correctly.
- Integration test (mock): the mock echoes a token from message #1 when asked in message #3, proving the history reached the server.
- Real-API smoke (if key): the title-recall scenario above (3 turns) — log the replies in `TEST_REPORT.md`.
- Make sure `history_window` of 20 is also applied server-side as a hard cap (ignore anything older) so a tampered client cannot send 500 messages; oversize → trim silently, do not error.

## 5. Also

- Screenshots: a fresh empty chat (desktop + mobile), Grisha's nameplate and dropdown row with the new title. Look at them.
- Commits: `fix: remove empty-state hint`, `fix: opaque job-title words`, `feat: beat-2 bridge + catchphrase triggers`, `test: conversation context guarantees`; push; report hashes.
