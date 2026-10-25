// suggested_redirect — „→ მივიდე …-სთან“ ღილაკი (Round 7 §1, ცვლის Round 2 §8-ის ჩამკეტს):
// ჩნდება, როცა პასუხი სახელით ახსენებს ნებისმიერ სხვა პერსონაჟს (უხილავსაც — ღილაკი მაშინ წარმომადგენლის ჩატს ხსნის),
// პირველივე შეტყობინებიდან. რამდენიმე სახელიდან — ბოლოს ნახსენები (ჩვეულებრივ, იქ აგზავნის).
// „მე-3 შეტყობინებამდე არ გადაამისამართო“ რჩება მხოლოდ პრომპტში (src/pacing.js REDIRECT GATE).
import { characters } from './characters.js';
import { findMentions, mentions } from './names.js';

/**
 * @param {object} speaker — ვინც უპასუხა (უხილავის ჩატში — წარმომადგენელი)
 * @param {string} reply — პასუხის ტექსტი
 * @param {string} currentId — ვისთან არის ჩატი (უხილავი, თუ წარმომადგენელი პასუხობს) — მასზე არ გადავამისამართებთ
 * @param {string} [userName] — მომხმარებლის სახელი: მომხმარებელს „სოსოს“ რომ ეძახის, ეს სოსო-პერსონაჟის ხსენება არ არის
 * @returns {string|null} პერსონაჟის id
 */
export function detectRedirect({ speaker, reply, currentId, userName = '' }) {
  const ids = characters
    .filter((c) => c.id !== speaker.id && c.id !== currentId && !(userName && mentions(userName, c.id)))
    .map((c) => c.id);
  const found = findMentions(reply, ids, speaker.id);
  return found.length ? found[found.length - 1].id : null;
}
