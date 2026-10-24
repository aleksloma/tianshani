# Fix round 4 — wording, copies pacing, human-readable token %, language rule, dialogue style, small findings

`AGENT_PROMPT.md` and `FIXES_ROUND1–3.md` remain the spec; this file changes/extends them. Round 3 was verified live (desktop 1280×800 and mobile 375×812): name card, calendar-on-close, proxy chat (Gamkrelidze → Soso, struck-through header, stage direction in its own style), dropdown with thumbnails, mobile wall with 6 frames and the full-screen mobile chat all work. **Visual design (desktop and mobile) is approved — do not change layout, sizes, background, fonts or colours** except where an item below says so. Take before/after screenshots at 1280×800 and 375×812 and compare.

Implement every item, update tests, run `npm run test:all` from a clean `npm ci`, update `TEST_REPORT.md` ("Round 4 fixes") and `DECISIONS.md`, commit in logical chunks, push to `github.com/aleksloma/tianshani` `main`, report commit hashes.

---

## 1. Name card wording

- The card title „როგორ გქვიათ?“ is not natural Georgian here. Change the card heading to **„თქვენი სახელი“**, keep the input placeholder „სახელი“, button „შესვლა“, link „სოსო ვარ“.
- Header: when no name is set it currently shows „ავტორი: — ✎“. Show **„თქვენი სახელი ✎“** instead (clicking opens the card); once set, show „ავტორი: ალექსანდრე ✎“ as now.
- Update the e2e assertions that look for the old heading.

## 2. Copies („ეგზემპლარი“) must not disappear faster than one per season — and the user should see why

Current code: `lostCopies = min(copies, seasonIndex)`, i.e. one copy is lost at every season change. That is already ≤ 1 per season, but with 20 days per chat close and 90-day seasons it feels fast. Required:

- Add `game.seasons_per_lost_copy` (default **1**; the owner may set 2 to slow it down). `lostCopies = min(copies, floor(seasonIndex / seasons_per_lost_copy))`. Never more than one copy lost per season change, never mid-season, never while a chat is open (it is derived from the season, so it already follows the §2 rule from round 3 — keep it that way).
- When a copy is lost (detected on the wall, right after the season intertitle), show a **small paper note** sliding in under the header for ~4 s with the film's excuse for that copy, in order: „ერთი ეგზემპლარი თინას უჯრაში დარჩა — სამი თვეა იქ დევს.“ → „ერთი ეგზემპლარი ბანკში (ან ცირკში) დარჩა.“ → „ერთი ეგზემპლარი ოთხად გაიყო — თითო ნაწილი თითო კოლეგასთან.“ Same texts as the existing copies tooltip. Not a modal; dismissible by tap.
- Unit tests for the formula with `seasons_per_lost_copy` 1 and 2; e2e: after the first season change the note appears once and the counter shows 2/3; no note on the second change when the setting is 2.

## 3. Token indicator — say it in human terms

The header shows „3,9 %“ and the tooltip „გახარჯულია შემომავალი ტოკენების 3,9 %“. Nobody knows what an input token is. Change the **text**, not the look (same ring/gauge, same place, same size):

- Header text stays a percentage, but the tooltip becomes: **„კითხვების ლიმიტის 3,9 % გახარჯულია · დარჩა დაახლოებით 80 კითხვა · განახლდება 1 ნოემბერს“**.
- The remaining-questions estimate = `remaining_input / avg_input_per_request`, where `avg_input_per_request` is this client's actual average from `usage` (server returns it in `/api/state` and in the SSE `done` event) and falls back to **6000** tokens when the client has fewer than 3 requests. Round to tens; if < 10, show exact; if 0, the limit modal from round 2 takes over.
- Limit modal body (round 2) gets the same vocabulary: „კითხვების თვიური ლიმიტი ამოიწურა…“ instead of token wording. Keep the film sentence „ბიუჯეტში გარღვევა გვაქვს, თვის ბოლომდე დავიცადოთ.“
- Admin keeps the raw token numbers (that's for the owner).
- e2e: tooltip contains „კითხვ“ and „დარჩა“, no „ტოკენ“ in the public UI anywhere (header, tooltip, modal); after a mock reply the estimate decreases.

## 4. Foreign-language replies: catchphrases must stay in Georgian script

Observed with a Russian question to Tamari: the reply was in Russian (correct) but her Georgian signature lines were **transliterated into Cyrillic** — „Ой, нел-тбилад, бошо…“ — which breaks the rule in `meta.language_policy`.

- Prompt rule (general instruction): *"When you answer in a language other than Georgian, your catchphrases, signature words and dialect forms stay in **Georgian script**, untranslated and untransliterated, embedded in the foreign-language sentence: „Ой, ვარ ნელთბილად, ბოშო, еле дышу сегодня.“ Everything else is in the user's language. Stage directions follow the language of the reply."*
- Add to the real-API smoke test: a Russian and an English message to Tamari; assert the reply contains at least one Georgian-script word and no Cyrillic/Latin transliteration of the words in her `catchphrases_ka` (check for `тбилад`, `бошо`, `tbilad`, `bosho`). Log replies in `TEST_REPORT.md`.

## 5. The iceberg painting Easter egg

The painting is clickable (`aria-label` „სურათი „გრენლანდია“ — ყანყალებს. დააჭირეთ და ჩამოვარდება“). Nice — keep it. Verify only: after it falls, it is back on its hook after a reload and after any chat close (same rule as frames, round 1 §1); falling never overlaps or hides a frame or the „ესაუბრე სხვას“ button; the hover/tap tooltip wording is correct Georgian. e2e for the reload case.

## 6. Mobile: grey strip below the wall

At 375×812 the document is ~1025 px tall and the last ~30–40 px below the „ესაუბრე სხვას“ button are plain grey — the wall background ends before the page does. Make the wall element extend to the full document height (or give `body` the same plaster colour as the wall's bottom edge) so there is never a bare strip. Verify at 375×812, 390×844 and 768×1024. Do not change anything else in the mobile layout.

## 7. Missing portraits

Boria, Kako and Kote still show silhouettes. Try once more with the actors' names from `characters.json → actor` and the cast list in `cisperi_mtebi_personajebi.md` (Georgian and Russian spellings, georgian-cinema.ge, kino-teatr.ru, Georgian Wikipedia). B&W, same crop/size as the others, update `SOURCES.md`. If a face still can't be found, leave the silhouette — don't use a wrong person.

## 8. Recommendations (implement; they are cheap and safe)

- **Opening line without an LLM call.** A fresh, empty chat currently shows the hint „დაიწყეთ საუბარი…“. Instead, show the character's own first line immediately, picked from a small scripted list per character (3–5 lines derived from `greeting_ritual` + their `catchphrases_ka`/`real_activity`, e.g. director: „*(ყურმილს არ უშვებს)* დიახ, დიახ… აბა, ჩემო კარგო, რა გაქვს?“; Tamari: „ვარ ნელთბილად. სიგარეტი არ გაქვენ?“; for an invisible character the proxy's „not here“ line, e.g. „გივი ოთახში არ არის. დაელოდეთ.“). Shown as a normal character bubble, stored in history as `scripted: true`, **not** sent to the server and **not** counted. Pick deterministically by `cycle + characterId` so it varies between buildings. Zero cost, the wall feels alive. Mock mode and tests unaffected except a new e2e: opening a fresh chat shows one bubble before any user input.
- **Enter / Shift+Enter.** Verify Enter sends and Shift+Enter inserts a newline (desktop); on mobile the send button is the primary action. Fix if not so.
- **Page metadata for sharing.** Add `<meta name="description">` (Georgian, one sentence), Open Graph title/description/image (`og:image` = a 1200×630 crop of the wall with a few frames — generate once with Playwright and save to `public/assets/og.jpg`), a favicon (small frame/typewriter icon, SVG + PNG fallback) and `<html lang="ka">`. Needed before hosting; no visual change on the page itself.
- **Empty-state copy check.** Grep all Georgian UI strings (`public/**/*.html`, `public/js/*.js`) and fix grammar/typos; list changes in `DECISIONS.md`. Known: „როგორ გქვიათ?“ (§1). Do not touch character data in this pass.

## 9. Dialogue style: answer what was asked + one characteristic touch — never exhaustive, never dry

Observed in real chats: replies are too long and too "complete". Asked about one thing, the character answers it, then pre-empts the next two questions the user hasn't asked yet, and sometimes contradicts itself inside the same reply (refuses twice, then agrees). It reads like a summary of the character, not a line from the film. The data in `characters.json` is fine — the problem is how much of it gets spent per turn, and in what shape.

**The target shape of a reply is two beats:**
1. **The direct answer to exactly what was asked** — one sentence, usually with the character's excuse or attitude about *that* thing only. Do not answer questions that were not asked (if asked about tomorrow, say nothing about the day after; if the user asks later, a new excuse appears then).
2. **One characteristic touch** — a short second beat that is typical for this character and the film's world, but *not* more information about the user's request: a signature attitude line (the character's own shrug, formula or catchphrase), a remark about what they are actually busy with (`real_activity`), a comment on the eternal background topics of the building (motoball outside the window, the crack, the lift, the weather, lunch, who's on vacation, the phone), a small action in a stage direction, or a counter-question. This is what keeps the reply warm and alive instead of a dry refusal.

That is exactly how the film and the book talk: nobody gives complete information, everybody says one thing about the matter and one thing about something else. **The source dialogues are the model for every reply** — `sample_dialogues`, the signature lines in `03_metyvelebis_stili_voice_bible.md`, and the scenes in `02_siuzheti_da_absurdis_mekanika.md`. Point the model at them explicitly.

Rewrite the pacing block of the general instruction (round 2 §8) around these rules — generic wording, no character-specific examples in the rules themselves:

- *"Reply in two beats: (1) one sentence answering only what was asked — with your excuse or attitude about that one thing; (2) one short characteristic touch that is NOT more information about the request: your typical shrug or formula, what you are busy with right now, the motoball match, the crack, the lift, lunch, a colleague, a counter-question, or a small action in `*…*`. Then stop."*
- *"Never pre-empt the user's next questions. If they ask about one day, one person, one paper — speak about that one only. Their follow-up gets a fresh, different excuse next turn."*
- *"One excuse or one piece of information per reply. The repertoire is revealed slowly over a long conversation, never listed."*
- *"Stay consistent within a reply: do not refuse and then agree, or promise and then withdraw, in the same breath. Your attitude line (beat 2) must not contradict your answer (beat 1); contradictions live between turns, not inside one."*
- *"Length: 2 sentences by default (one per beat), 3 at most. Never a dry one-word refusal, never a monologue."*
- *"Model every reply on the dialogues of the film and the book you were given (the sample dialogues and signature lines): same rhythm, same deadpan, same habit of answering a concrete question with half an answer and a remark about something else."*
- Keep the existing rules on Georgian quality, stage directions, newlines, no borrowed dialect, redirects only from the 3rd manuscript message.

Technical changes that make the model actually obey:
- `gemini.max_output_tokens` default **180** (configurable).
- Rewrite the **few-shot examples in the general block** (not the per-character `sample_dialogues`) so each example shows the two-beat shape: direct answer + one characteristic touch, 2 lines, one excuse. Add one two-turn example demonstrating "asked about X → answers X + a touch; asked about Y next turn → new excuse + a different touch". Keep the examples neutral (an office, a phone, a form, the match outside), not tied to a specific scene.
- Per character, pass the model an explicit short list **`touch_pool`** built server-side from the data: `catchphrases_ka` not yet used in this chat, `real_activity`, 2–3 world topics (`world.setting_ka` motifs: motoball, crack, lift, seasons), so beat 2 is drawn from canon rather than invented. Include in the state line: `Catchphrases/excuses already used in this chat: [...]` so both beats vary.
- Config `chat.trim_long_replies: true` (default on): a reply with more than 3 sentences (terminal punctuation outside stage directions) still streams fully, but is logged at WARN with the character id, and the admin page shows a „ზედმეტად გრძელი პასუხები“ counter per character.

Tests: unit — each general few-shot example has exactly 2 non-stage lines; `touch_pool` excludes already-used catchphrases; state line includes used excuses. Real-API smoke (if key): a 6-turn conversation with two characters where each user turn asks one narrow question; assert every reply is 2–3 sentences, contains at most one sentence with an excuse keyword (ვერ, არ მცალია, უნდა, მერე, ხვალ, შემდეგ), is never a single sentence, never repeats an excuse from an earlier reply, and never combines a refusal keyword and an agreement keyword („კი ბატონო“, „როგორც გინდათ“, „სულერთია“) about the same thing — log all replies in `TEST_REPORT.md` for human review.

## 10. Also

- Keep all round-3 behaviour (calendar on close, proofread pass, mobile layout, limits 500k).
- Screenshots: name card, header tooltip with the questions estimate, lost-copy note, mobile bottom edge, a fresh chat with the scripted opening line. Look at them.
- Commits: `fix: name card wording`, `feat: copies pacing + lost-copy note`, `feat: human-readable limit text`, `fix: georgian script in foreign replies`, `fix: mobile wall bottom`, `feat: scripted opening lines`, `chore: meta tags + favicon`, `fix: dialogue pacing v2`, (`assets: portraits` if found); push; report hashes.
