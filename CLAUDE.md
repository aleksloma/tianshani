# CLAUDE.md — instructions for Claude Code in this repo

Read `PROJECT_CONTEXT.md` first: it explains what this project is, how work is organised in rounds, the standing rules and the current behaviour. Then read the round file you were asked to implement, and `AGENT_PROMPT.md` + earlier `FIXES_ROUND*.md` for the full spec.

Non-negotiable rules (details in `PROJECT_CONTEXT.md` → "Standing rules"):

1. Implement only what the current round file asks. Anything else you notice goes to `DECISIONS.md` → „Proposals (not implemented)“ — never into the code.
2. Visual design is frozen. Any CSS/layout change must be checked against before/after screenshots at 1280×800 and 375×812.
3. `characters.json`, `cisperi_mtebi_personajebi.md` and `analysis/` are canon; touch them only when a round says so.
4. Never commit `settings.json`, `data/`, or any key/password. `settings.example.json` is the documented template.
5. Testing is your job: unit (`node:test`), integration against the mock LLM, Playwright e2e (desktop + mobile), real-API smoke only when a key is present. `npm run test:all` must pass from a clean `npm ci` before you push.
6. Finish every round by updating `TEST_REPORT.md` and `DECISIONS.md`, committing in logical chunks, pushing to `main` on `github.com/aleksloma/tianshani`, and reporting commit hashes.
7. UI language is Georgian; use correct literary Georgian for any string a round asks you to add. Do not add strings a round did not ask for.
