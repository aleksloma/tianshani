// suggested_redirect: ვინ ახსენა პერსონაჟმა პასუხში (redirects_to-დან), ან 50%-ით შემთხვევითი, თუ ლაპარაკი ხელნაწერზე იყო.
import { byId, nameStems } from './characters.js';
import { mentionsManuscript } from './lang.js';

/**
 * @param {object} speaker — ვინც უპასუხა
 * @param {string} reply — პასუხის ტექსტი
 * @param {string} userText — მომხმარებლის ბოლო შეტყობინება
 * @param {string} currentId — ვისთან არის ჩატი (მასზე არ გადავამისამართებთ)
 */
export function detectRedirect({ speaker, reply, userText, currentId, rnd = Math.random }) {
  const targets = (speaker.redirects_to || []).filter((id) => byId[id] && id !== currentId && id !== speaker.id);
  if (!targets.length) return null;
  for (const id of targets) {
    const stems = nameStems(byId[id]);
    if (stems.some((s) => reply.includes(s))) return id;
  }
  if (mentionsManuscript(userText) && rnd() < 0.5) {
    return targets[Math.floor(rnd() * targets.length)];
  }
  return null;
}
