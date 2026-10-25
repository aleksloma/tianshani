# FIXES_ROUND9 — manuscript actions with a message, distinct icons, season titles without blackout, two Round 8 corrections

Read `PROJECT_CONTEXT.md`, `CLAUDE.md`, `AGENT_PROMPT.md` and `FIXES_ROUND1–8.md` first; everything there still applies unless this file overrides it. Standing rules apply in full: implement only what is written here, log everything else as a proposal in `DECISIONS.md`, visual design is frozen except the elements this round explicitly changes, canon untouched, testing is your job, finish with `TEST_REPORT.md`, `DECISIONS.md`, commits and a push. All five items were requested by the owner after testing Round 8 live.

---

## 1. Hand-over / retrieve can carry a message

Today clicking `#chat-copy` sends the action immediately. New behaviour: the click **attaches** the action to the composer; the user may add text or not, and sends with the normal send button (or Enter). One request, one user message, one reply.

### 1.1 Composer attachment

- Add a slip row between `#chat-log` and `#chat-form`:
  ```html
  <div id="chat-attach" class="chat-attach" hidden>
    <span class="chat-attach-ico" aria-hidden="true"><!-- same SVG as the button's current mode, §2 --></span>
    <span id="chat-attach-text" class="chat-attach-text"></span>
    <button type="button" id="chat-attach-remove" class="chat-attach-remove" aria-label="მოხსნა">✕</button>
  </div>
  ```
  Text: hand over → `ეგზემპლარი №N — გადაცემა` (with integrity < full: `ეგზემპლარის ნახევარი №N — გადაცემა` / `მეოთხედი` / `ერთი ფურცელი`); retrieve → `ეგზემპლარი №N — გამორთმევა`.
- Style: the same "slip of paper" as the action rows in the log (Round 8 §8.1): transparent background, `1px dashed rgba(42,38,34,0.35)`, radius 2px, padding `4px 8px`, font-size 12.5px, the `.stage` italic condensed title font and colour `#7a6a58`; margin `0 14px 0 46px` (aligned with the form's left padding), in `.sheet` mode `0 14px`. The ✕ button is text-only, `color: var(--ink-soft)`, no border/background, 20×20, right-aligned. No new colours.
- Clicking `#chat-copy` while nothing is attached → attach (the button gets `aria-pressed="true"` and class `armed`; visual: the existing focus outline colour `var(--sky)` as a 2px inset outline). Clicking it again, or ✕, or `Escape` while the textarea is empty → detach. Only one attachment at a time. Opening/switching/closing a chat clears it. The attachment mode is fixed at the moment of attaching (if the store changes meanwhile — it cannot, the chat is the only writer — still re-validate on send and drop the attachment with no message if it is no longer valid).
- The textarea placeholder changes **only while an attachment is present** to `მიაყოლეთ სიტყვა, თუ გსურთ…` and restores to `დაწერეთ…` afterwards. The send button is enabled when an attachment is present even if the textarea is empty (today it requires text).
- Sending: the user message content is the stage line from Round 8 §3.3 (`*ალექსანდრე ვასოს ხელნაწერის ეგზემპლარს აწვდის.*` / `*… ეგზემპლარს უკან სთხოვს.*`) and, if the user typed something, a newline and the typed text. Stored in `tianshani.chats` with the same `action: { type, copyId }` meta as before. Request: `action` + `manuscript` exactly as Round 8; the server already takes the last user turn as the text, so the model sees both the act and the words. Rendering in the log: `div.msg.user.action` as today; `renderSegments` already shows the `*…*` part in `.stage` style and the typed text as `.speech` lines — verify that the user bubble for action rows goes through `renderSegments` (plain user bubbles stay `textContent`).
- Server: no contract change. Prompt `# ACTION` block (Round 8 §7.3): append one sentence: `The author's own words, if any, follow the stage direction in his last message — answer them too, inside the same two beats.` Pacing/limits/proofread unchanged. Mock LLM: when an action turn has extra text, append the mock's normal reply to that text after the seed phrase (so tests can assert both parts).
- Remove the old "click = send" path entirely; there must be only one way to send an action.

### 1.2 Keyboard and edge cases

- Enter in the textarea sends (existing behaviour) — with an attachment and empty textarea it also sends.
- While the chat is busy the attach button and ✕ are disabled like the rest of the form.
- A failed request (error/429/network) keeps the message in the log as today and leaves the store unchanged; the attachment is cleared (the user re-attaches if he wants to retry).

---

## 2. Distinct icons for hand-over and retrieve

Replace the 📄 glyph in `#chat-copy` (both modes) and use the same icons in the attachment slip (§1.1). Action rows in the log stay text-only. Inline SVG, 22×22, `stroke: currentColor`, `fill: none`, `stroke-width: 1.6`, `stroke-linecap/linejoin: round`, colour `var(--ink)` (the textarea text colour), so they no longer depend on the emoji font (which renders monochrome on the owner's Windows).

- **Hand-over** (`mode="give"`): a sheet of paper with a folded top-right corner and an arrow leaving it to the right:
  ```html
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M5 3h8l4 4v6"/><path d="M13 3v4h4"/><path d="M5 3v18h7"/>
    <path d="M14 17h7"/><path d="M18 14l3 3-3 3"/>
  </svg>
  ```
- **Retrieve** (`mode="take"`): the same sheet with a hand-shaped "return" arrow coming back into it from the right (↩):
  ```html
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M5 3h8l4 4v6"/><path d="M13 3v4h4"/><path d="M5 3v18h7"/>
    <path d="M21 17h-7"/><path d="M17 14l-3 3 3 3"/>
  </svg>
  ```
  (identical sheet; the arrow points **into** the sheet instead of out of it.) If you judge the two still too similar at 22 px, add a small open-hand palm under the retrieve arrow — but keep both monochrome line icons, same stroke, same size.
- The header stat `#stat-copies` keeps its 📄 glyph (unchanged). Remove the Round 8 `.retrieve { text-decoration: underline }` rule; the mode is now carried by the icon and by `data-mode="give|take"` on the button (tests use it). `aria-label`/`title` texts unchanged (`ეგზემპლარის გადაცემა` / `ეგზემპლარის გამორთმევა`).

---

## 3. Season intertitles without the blackout

Today `#intertitle` fades in a full-screen black layer with the season name. Owner's request: for **season changes** no blackout — the word is simply written over the wall, in the season's colour. The **collapse** intertitle („შენობა ჩამოინგრა…“) keeps the black layer exactly as it is.

- `showIntertitle(text, ms, { season })`: when `season` is given, add class `season-<name>` and class `overlay` to `#intertitle` for the duration (remove both afterwards); `app.js playEvents` passes `{ season: ev.season }` for season events only.
- CSS (`wall.css`, next to the existing `#intertitle` rules):
  ```css
  #intertitle.overlay { background: transparent; pointer-events: none; }
  #intertitle.overlay p {
    text-shadow: 0 2px 6px rgba(0,0,0,0.55), 0 0 2px rgba(0,0,0,0.6);
  }
  #intertitle.season-winter p { color: #f6f3ea; }   /* თეთრი */
  #intertitle.season-spring p { color: #9ccc65; }   /* ღია მწვანე */
  #intertitle.season-summer p { color: #2e7d32; }   /* მწვანე */
  #intertitle.season-autumn p { color: #e3b22b; }   /* ყვითელი */
  ```
  Same font, size, letter-spacing, flicker and 1500 ms timing as now; only the background and the colour change. The wall, frames and open chat remain visible underneath (pointer-events none so nothing is blocked). Keep `z-index` as is so the word sits above the copy note.
- No change to `COLLAPSE_TEXT` handling (`collapseScene` → black layer, 2600 ms).
- Update the e2e tests that assert the intertitle background or the `in`/`out` classes accordingly; add a check that a season intertitle has `background-color: rgba(0, 0, 0, 0)` and the right `color` per season, and that the collapse intertitle is still `#050505`.

---

## 4. Round 8 corrections (both observed live by the owner's assistant)

### 4.1 A holder with a whole copy must not claim pages are missing

Vaso, holding a `full` copy, said „მეშვიდე გვერდიდან პირდაპირ მეთერთმეტეზე გადადის“ — his canon excuse for an incomplete copy. Add to the holder line of `# MANUSCRIPT COPIES AND YOU` (Round 8 §7.2), chosen by integrity:
- `full`: `The copy you hold is complete: every page is there. Do not claim pages are missing, torn out or skipped — use any other excuse for not having read it.`
- `half` / `quarter` / `page`: `You hold only ${part} of it; it is natural to complain that the rest is missing.`
Also add the `full` sentence to the `hand_over/accepted` `# ACTION` block when the handed copy is `full`. Mock LLM unchanged. Add a prompt unit test for both branches and a real-API soft check (log the reply; flag „გვერდ“ + „აკლია/არ ჩანს/გადადის“ in a holder's reply for a full copy as a soft failure).

### 4.2 The header count must not reveal an unverified loss

After a failed chain (Bela → Leri, not arrived) the header dropped to `2/3` at once while the ledger still read „ბელას თქმით, ბელას ქმარს გადასცა“. The count is what the author knows: a `lost` copy whose `claim` is **not verified** still counts as existing. Change `existingCount` (`manuscript.js`) accordingly: `existing = copies.filter(c => c.status !== 'lost' || (c.claim && !c.claim.verified)).length`. Apply the same rule to the `# CURRENT STATE` sentence sent to the model (`… ${lost} lost` uses the same count, so a character does not blurt out the truth either), to `#season-tip-meta`, `#copies-val` and the `aria-label`. `lostCount` (used by tests/admin) keeps counting the truth; add `knownLostCount`. Unit test: failed chain unverified → 3/3; after `verifyClaimsFor(T)` → 2/3; `misplaced`/`damaged` (no claim) → 2/3 immediately as before.

---

## 5. Tests and close-out

- Unit: §1 message composition (stage line + text, with/without text, integrity words), `data-mode`, attachment validity re-check, §4.1 prompt branches, §4.2 counts.
- API (mock): action turn with extra text → reply contains the seed and the text-based part; action turn without text unchanged from Round 8.
- E2E desktop + phone: attach → slip visible with the right text and icon → ✕ detaches → attach again → type a sentence → send → one `.msg.user.action` with both the stage line and the sentence → reply → store updated; attach + empty textarea + Enter sends; `Escape` with empty textarea detaches; switching chats clears the slip; icons differ between modes (compare the two SVG path sets); season change shows the coloured word with transparent background over a visible wall; collapse still black; header count stays 3/3 after a forced failed chain until T's chat is opened (`event_override: "passed_on"`, `chain_override: "lose"`).
- Screenshots before/after at 1280×800 and 375×812: chat with the button in both modes, the slip attached, a season intertitle (winter and autumn at least), the collapse intertitle. Outside the changed elements the diff must be 0.
- `TEST_REPORT.md` → "Round 9"; `DECISIONS.md` → `R9.x` / `P9.x`; `PROJECT_CONTEXT.md` behaviour summary updated (actions with a message, intertitle colours, known-vs-true count); commit in logical chunks, push to `main`, report hashes.
