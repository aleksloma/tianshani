// კონსოლის ლოგი + საუბრების ჩაწერა SQLite-ში (თუ logging.store_conversations ჩართულია).
import { guessLang } from './lang.js';

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export const log = {
  info: (...a) => console.log(`[${ts()}]`, ...a),
  warn: (...a) => console.warn(`[${ts()}] ⚠`, ...a),
  error: (...a) => console.error(`[${ts()}] ✖`, ...a),
};

/** მომხმარებლის შეტყობინება + პასუხი ერთად. ჩატის ისტორია უხილავის id-ზე ინახება, spoken_by — ვინ უპასუხა. */
export function logExchange(store, cfg, { clientId, characterId, spokenBy, userText, reply, usage, gameState }) {
  if (!cfg.logging.store_conversations) return;
  const common = { client_id: clientId, character_id: characterId, season: gameState.season, cycle: gameState.cycle };
  store.logMessage({ ...common, role: 'user', content: userText, lang_guess: guessLang(userText), input_tokens: usage.input });
  if (reply) {
    store.logMessage({ ...common, role: 'assistant', spoken_by: spokenBy, content: reply, lang_guess: guessLang(reply), output_tokens: usage.output });
  }
}
