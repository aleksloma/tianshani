# Fix round 5 — remove scripted opening lines, history reset, small findings

`AGENT_PROMPT.md` and `FIXES_ROUND1–4.md` remain the spec; this file changes/extends them. Round 4 was verified live: name card, calendar on close (no advance when a chat is closed without a message), human-readable limit tooltip, two-beat replies (Grisha, Tina), proofread pass reporting `unchanged`, meta tags/favicon, mobile bottom edge fixed. **Visual design (desktop and mobile) is approved — do not change layout, sizes, background, fonts or colours.** Before/after screenshots at 1280×800 and 375×812.

Implement every item, update tests, run `npm run test:all` from a clean `npm ci`, update `TEST_REPORT.md` ("Round 5 fixes") and `DECISIONS.md`, commit in logical chunks, push to `github.com/aleksloma/tianshani` `main`, report commit hashes.

---

## 1. Remove the scripted opening line (revert round 4 §8 "Opening line without an LLM call")

The owner does not want the character to speak first. A fresh chat must open **empty**, exactly as before round 4: no bubble until the user sends something. Required:
- Remove the scripted-opener feature entirely: the per-character opening-line lists, the `scripted: true` message type, the deterministic pick by `cycle + characterId`, and the e2e test that expects a bubble before user input.
- Restore the previous empty-state hint in the message area (the short Georgian line that was there before, e.g. „დაიწყეთ საუბარი…“ — check `git log` for the exact previous wording and reuse it).
- **Migration:** existing histories in users' `localStorage` may contain `scripted: true` messages. On load, strip any message with `scripted: true` from `tianshani.chats` (and never send such a message to the server). Add a unit test for the migration.
- Make sure the "no advance without a message" rule (round 3 §2) still holds without the scripted message, and that the per-character „ისტორიის გასუფთავება“ leaves the chat truly empty.

## 2. Resetting history from the browser

Today the only way to drop everything is the per-character „ისტორიის გასუფთავება“ button or DevTools → Application → Local Storage → delete the `tianshani.*` keys. Add a proper control:
- In the header, behind the „✎“ name control (or in the same small popover that opens when clicking the name), add a link **„ყველაფრის განულება“** with a confirm step styled like the rest (a small paper note: „წავშალოთ ყველა საუბარი და დავიწყოთ თავიდან? — დიახ / არა“). On confirm: clear `tianshani.chats`, reset `tianshani.game` to a fresh building (cycle 1, day 0, autumn), keep `tianshani.client_id` and `tianshani.user_name`, re-lay the wall, close any open chat. It does **not** reset server-side token counters (those are the limit).
- Keep it discreet: small text, same font as the header stats, no new visual element on the wall.
- Also document in `README.md` → "Run & deploy" a short "Resetting a browser" note for the owner (the DevTools way and this control).
- e2e: after two chats, use the control → both histories empty, calendar back to „1 სექტემბერი“, name preserved.

## 3. Small findings from the live check

- `cached_tokens: 0` on every reply — context caching (round 3 §7) is not taking effect. Do not spend time making it work; just set `gemini.context_cache` default to `false` if it is not already, remove any dead code path that is clearly unused, and note the measured result in `DECISIONS.md`.
- The `done` SSE event now carries `spoken_by_name`, `avg_input_per_request`, `proofread`, `cached_tokens` — fine, but make sure the client ignores unknown fields gracefully (it does today; add a unit test so a future field can't break parsing).
- Tina's reply used a stage direction inside a sentence („*(ტელეფონში)* დიახ, გისმენთ…“) — correct behaviour; verify the client renders inline stage directions (mid-line `*…*`) in the stage style too, not only whole-line ones. Add an e2e with a mock reply containing an inline stage direction.
- Check that the limit tooltip's „დარჩა დაახლოებით N კითხვა“ uses the client's own average (`avg_input_per_request` was 6271→6458 across requests) and re-renders after every reply; verified once, add an e2e assertion that the number changes after a mock reply with a different `usage.input`.

## 4. Also

- Screenshots: a fresh empty chat (desktop and mobile), the reset confirm note, header after reset. Look at them.
- Commits: `revert: scripted opening lines`, `feat: reset everything control`, `chore: small fixes`; push; report hashes.
