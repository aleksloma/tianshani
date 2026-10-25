// კონსოლის ლოგი + საუბრების ჩაწერა SQLite-ში (თუ logging.store_conversations ჩართულია).
import { guessLang } from './lang.js';

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export const log = {
  info: (...a) => console.log(`[${ts()}]`, ...a),
  warn: (...a) => console.warn(`[${ts()}] ⚠`, ...a),
  error: (...a) => console.error(`[${ts()}] ✖`, ...a),
};

/** მომხმარებლის შეტყობინება + პასუხი ერთად. ჩატის ისტორია უხილავის id-ზე ინახება, spoken_by — ვინ უპასუხა. */
export function logExchange(store, cfg, {
  clientId, characterId, spokenBy, userText, reply, usage, gameState, userName = null, original = null, longReply = false, action = null, manuscript = null,
  metaLeak = null, discardedReply = null,
}) {
  if (!cfg.logging.store_conversations) return;
  // Round 8 §3.3 (5): action + ეგზემპლარების მდგომარეობა ორივე რიგზე
  const common = { client_id: clientId, character_id: characterId, season: gameState.season, cycle: gameState.cycle, user_name: userName || null, action, manuscript };
  store.logMessage({ ...common, role: 'user', content: userText, lang_guess: guessLang(userText), input_tokens: usage.input });
  if (reply) {
    // Round 3 §4: კორექტურით შეცვლილი პასუხი — ორივე ვერსია (ადმინში გვერდიგვერდ)
    const changed = Boolean(original && original !== reply);
    store.logMessage({
      ...common, role: 'assistant', spoken_by: spokenBy, content: reply, lang_guess: guessLang(reply), output_tokens: usage.output,
      proofread_original: changed ? original : null, proofread_changed: changed ? 1 : 0,
      long_reply: longReply ? 1 : 0, // Round 4 §9
      // Round 10 §3.2: შიდა ჩანაწერი დაიჭირა (1) / უარყოფილი ან მოჭრამდელი ტექსტი
      meta_leak: metaLeak ? 1 : null, discarded_reply: discardedReply ? String(discardedReply).slice(0, 2000) : null,
    });
  }
}
