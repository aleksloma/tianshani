// დიალოგის ტემპი (FIXES_ROUND2 §8): ისტორიიდან სერვერზე ითვლება, რამდენი შეტყობინება იყო, რამდენი — ხელნაწერზე,
// და რომელი ცნობილი ფრაზები უკვე გამოიყენა პერსონაჟმა. ეს ხაზი პრომპტში ჯდება, რომ მოდელმა რეპერტუარი ნელა დახარჯოს.
import { hash32, mulberry32 } from '../public/js/manuscript.js';

/** ხელნაწერზე საუბრის ქართული საკვანძო ძირები (+ ინგლისური/რუსული, რომ სხვა ენაზეც ითვლებოდეს). */
export const MANUSCRIPT_KEYWORDS = [
  'მოთხრობ', 'ხელნაწერ', 'წაიკითხ', 'დაბეჭდ', 'ეგზემპლარ', 'ტიან-შან', 'ტიანშან', 'ცისფერ',
  'manuscript', 'novel', 'story', 'рукопис', 'рассказ', 'повест',
];

export function isManuscriptMessage(text) {
  const t = String(text || '').toLowerCase();
  return MANUSCRIPT_KEYWORDS.some((k) => t.includes(k));
}

/** ფრაზის „ბირთვი“ შესადარებლად: ფრჩხილები, ბოლო პუნქტუაცია, ბრჭყალები და „— პასუხი“ ნაწილი ქრება. */
export function phraseCore(phrase) {
  let p = String(phrase || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[„“"«»]/g, '')
    .split(/\s[—–]\s/)[0]
    .replace(/[.!?…,:;\s]+$/u, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // გრძელი ფრაზა — პირველი 4 სიტყვა საკმარისია ამოსაცნობად
  const words = p.split(' ');
  if (words.length > 6) p = words.slice(0, 4).join(' ');
  return p;
}

/**
 * ტემპის მდგომარეობა ამ პასუხის წინ.
 * @param {Array<{role, content}>} history — საუბარი, ბოლო = მომხმარებლის მიმდინარე შეტყობინება
 * @param {object} speaker — ვინც პასუხობს (მისი catchphrases_ka)
 */
export function pacingState(history, speaker) {
  const users = history.filter((m) => m.role === 'user');
  const replies = history.filter((m) => m.role === 'assistant').map((m) => m.content).join('\n');
  const usedOf = (list) => (list || []).filter((c) => {
    const core = phraseCore(c);
    return core.length >= 3 && replies.includes(core);
  });
  // Round 6 §3: რამდენი პასუხის წინ თქვა ცნობილი ფრაზა (არასდროს — Infinity) — „~3-დან 1“ სერვერზე კონტროლდება
  const cores = (speaker?.catchphrases_ka || []).map(phraseCore).filter((c) => c.length >= 3);
  const own = history.filter((m) => m.role === 'assistant');
  let since = Infinity;
  for (let i = own.length - 1, k = 0; i >= 0; i--, k++) {
    if (cores.some((c) => own[i].content.includes(c))) { since = k; break; }
  }
  // Round 10 §5: რამდენი პასუხის წინ ახსენა საკუთარი თემა (შენობა) და რომელი ვარიანტით. ვარიანტების ძირებიც ითვლება —
  // თორემ კარზე/ჩარჩოზე ნათქვამი (ზედა სიაში არ არის) მთვლელს არ ანულებდა და თემა მომდევნო პასუხშივე მეორდებოდა (რეალური smoke)
  const pre = speaker?.preoccupation;
  const topicKeys = [...new Set([...(pre?.keywords_ka || []), ...(pre?.variants || []).flatMap((v) => v.keywords_ka || [])])];
  let topicSince = Infinity;
  let lastTopicVariant = null;
  for (let i = own.length - 1, k = 0; topicKeys.length && i >= 0; i--, k++) {
    if (topicKeys.some((w) => own[i].content.includes(w))) {
      topicSince = k;
      lastTopicVariant = topicVariantOf(own[i].content, pre);
      break;
    }
  }
  return {
    messageCount: users.length,
    manuscriptCount: users.filter((m) => isManuscriptMessage(m.content)).length,
    usedCatchphrases: usedOf(speaker?.catchphrases_ka),
    usedExcuses: usedOf(speaker?.excuse_repertoire_ka), // Round 4 §9: საბაბიც არ მეორდება
    repliesSinceCatchphrase: since,
    repliesSinceTopic: topicSince,
    lastTopicVariant,
  };
}

/** Round 10 §5: რომელ ვარიანტს ეხებოდა ნახსენები — ყველაზე მეტი ძირის დამთხვევით; თანაბარზე პირველი (ბზარი). */
function topicVariantOf(text, pre) {
  let best = null;
  let bestHits = 0;
  (pre?.variants || []).forEach((v, i) => {
    const hits = (v.keywords_ka || []).filter((w) => text.includes(w)).length;
    if (hits > bestHits) { best = i; bestHits = hits; }
  });
  return best;
}

/**
 * Round 10 §5: საკუთარი თემა ამ პასუხში — მხოლოდ ყოველ ~N-ე პასუხში (2–3 ათიდან); ვარიანტი წონით, დეტერმინისტული
 * თესლით, წინა ნახსენების ვარიანტის გარდა. სხვა პასუხებში — null (pool-ში არ ემატება).
 */
export function preoccupationLine(speaker, pacing) {
  const pre = speaker?.preoccupation;
  if (!pre?.variants?.length || !pacing) return null;
  if (!((pacing.repliesSinceTopic ?? Infinity) >= (pre.every_n_replies || 4) - 1)) return null;
  const all = pre.variants.map((v, i) => ({ v, i }));
  const rest = all.filter(({ i }) => i !== pacing.lastTopicVariant);
  const candidates = rest.length ? rest : all;
  const total = candidates.reduce((s, { v }) => s + (v.weight || 1), 0);
  let r = mulberry32(hash32(`${speaker.id}|${pacing.messageCount}`))() * total;
  let pick = candidates[candidates.length - 1].v;
  for (const { v } of candidates) {
    r -= v.weight || 1;
    if (r < 0) { pick = v; break; }
  }
  return `YOUR OWN SUBJECT for beat 2 in THIS reply (your own words; not a catchphrase, not limited by the catchphrase rule): ${pre.intro_en} This time: ${pick.en}.`;
}

/** Round 6 §3: ამ პასუხში ცნობილი ფრაზა დასაშვებია? — მხოლოდ თუ ბოლო ორ პასუხში არ ყოფილა (≈ ყოველ მესამეში მაქსიმუმ ერთი). */
export function catchphraseAllowed(p) {
  return !p || !(p.repliesSinceCatchphrase < 2);
}

export function catchphraseGateLine(p) {
  return catchphraseAllowed(p)
    ? 'CATCHPHRASE FOR THIS REPLY: allowed — at most one, and only if its "use only when" note fits this exchange; otherwise none.'
    : 'CATCHPHRASE FOR THIS REPLY: none — you used one in one of your last two replies. Take beat 2 from what you are doing right now, from the building or from a question back to the user.';
}

/**
 * სიგრძის ზღვარი ამ პასუხისთვის (Round 4 §9: ორი „ტაქტი“ — პასუხი + ერთი დამახასიათებელი შტრიხი).
 * რემარკა (*…*) არ ითვლება.
 */
/**
 * Round 6 §3 — ზოგადი წესი საკმარისი არ აღმოჩნდა (რეალური smoke: დირექტორმა ბზარზე პასუხს მოტობურთი მიაყოლა),
 * ამიტომ ყოველ პასუხზე, PACING-ში (სადაც მოდელი წესებს უკეთ იცავს — Round 2 R2.17), კონკრეტულად ვეუბნებით, როგორ დააკავშიროს.
 */
export const BEAT2_LINE = 'BEAT 2 FOR THIS REPLY: it must continue beat 1, visibly. Either start it with a bridge word in the language of your reply (in Georgian: აბა, ისე, თორემ, ოღონდ, მერე, თუმცა, თან, ხომ იცი; in another language, its own equivalent — the reply stays in the user\'s language), or keep the same subject as beat 1 (the same object, person, place or problem), or put a stage direction before it that motivates it. A remark about the motoball, the weather, the lift or lunch is allowed only if beat 1 or the user\'s question led there — never as a jump.';

export const LENGTH_CAP_LINE ='LENGTH FOR THIS REPLY: two beats — 2 sentences by default (one per beat), 3 at most, never just 1. Each line is exactly ONE sentence. The stage direction does not count. Answer only what was asked; do not answer questions that were not asked.';

/** Round 4 §9: შენობის „მარადიული“ ფონური თემები (world.setting_ka-ს მოტივები) — მეორე ტაქტისთვის. */
export const WORLD_TOUCHES_KA = [
  'ფანჯრის მიღმა მოტობურთის მატჩი და მტვერი',
  'ბზარი კედელში — თითქოს გაიზარდა',
  'ლიფტი, რომელიც ისევ გაიჭედა',
  'ამინდი და სეზონი',
  'სადილი / ბუფეტი',
  'ტელეფონი, რომელიც არ ჩერდება',
  'ვინ არის შვებულებაში ან მივლინებაში',
];

/**
 * Round 4 §9: მეორე ტაქტის მასალა კანონიდან — ჯერ გამოუყენებელი ცნობილი ფრაზები (≤ 4), რეალური საქმიანობა
 * და 3 ფონური თემა (შეტყობინებების რაოდენობით ბრუნავს, რომ ტაქტები იცვლებოდეს).
 */
export function touchPool(speaker, pacing) {
  const used = new Set((pacing?.usedCatchphrases || []).map(phraseCore));
  // Round 6 §3: ფრაზა — მხოლოდ თავისი „როდის“-ით (catchphrase_triggers.json; არ არის — „იშვიათად“)
  const phrases = !catchphraseAllowed(pacing) ? [] : (speaker?.catchphrases_ka || [])
    .filter((p) => { const c = phraseCore(p); return c.length >= 3 && !used.has(c); })
    .slice(0, 4);
  const trigger = (p) => speaker?.catchphrase_triggers?.[p] || 'rarely; only if it fits';
  const activity = String(speaker?.persona_ka?.real_activity || '').trim();
  const n = WORLD_TOUCHES_KA.length;
  const start = (pacing?.messageCount || 0) % n;
  const world = [0, 1, 2].map((i) => WORLD_TOUCHES_KA[(start + i) % n]);
  const own = preoccupationLine(speaker, pacing);
  return [
    ...(own ? [own] : []),
    ...phrases.map((p) => `„${phraseCore(p)}“ — use only when: ${trigger(p)}`),
    ...(activity ? [`what you are busy with: ${activity}`] : []),
    ...world,
  ];
}

export function touchPoolLine(speaker, pacing) {
  return `TOUCH POOL for beat 2 (pick ONE that follows from your beat 1, or ask a counter-question; it is never more information about the request; a catchphrase only if its "use only when" fits this exchange): [${touchPool(speaker, pacing).join('; ')}]`;
}

/**
 * წინადადებების რაოდენობა (რემარკების *…* გარეშე): ახალი ხაზი ან . ! ? ყოფს; „…“ არ ყოფს; მოკლე ნამსხვრევები არ ითვლება.
 * Round 4 §9 — „ზედმეტად გრძელი პასუხები“ (> 3) და რეალური smoke.
 */
export function countSentences(text) {
  const speech = String(text || '').replace(/\*[^*]*\*?/g, '\n').replace(/^\s*\([^)]*\)/gm, '\n');
  return speech.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => (s.match(/[ა-ჰA-Za-zА-яЁё]/g) || []).length >= 3).length;
}

// ---------- Round 6 §3: ორი ტაქტის კავშირი (ევრისტიკა ტესტებისთვის — unit და რეალური smoke) ----------

/** „ხიდი“ მეორე ტაქტის დასაწყისში: სპეცის სია (აბა, ისე, თორემ, ოღონდ, მერე, თუმცა, ხომ იცი) + მსგავსი კავშირები. */
export const BRIDGE_START = /^(აბა|ისე|თორემ|ოღონდ|მერე|თუმცა|ხომ|მაგრამ|და|კი|ჰოდა|ასე რომ|ამიტომ|იმიტომ|რადგან|თანაც|თან|თუ|მაშინ|ჰო|ხო|ანუ|მით უმეტეს)(?=[\s,!.?…—-]|$)/;
/** პირველი სიტყვის ნაწილაკი „-ც“ („გრიშასთანაც ჩავედი“ — „ისიც“) — წინა ტაქტის გაგრძელება. */
const ALSO_ENCLITIC = /^[ა-ჰ]{3,}(ც|აც)(?=[\s,!.?…—-]|$)/;
/** უკან მიმთითებელი ნაცვალსახელი („ეს ამბავი“, „მაგაზე“, „ამას“) — იგივე საგანი სხვა სიტყვით (სპეცის „shared subject“). */
const ANAPHORA = /(^|[^ა-ჰ])(ეს ამბავი|ეს საქმე|ეს ყველაფერი|ამ ამბავს|ამ საქმეს|ამას|ამაზე|ამით|ამისთვის|მაგას|მაგაზე|მაგით|მაგისთვის|იმას|იმაზე)([^ა-ჰ]|$)/;
const STOP = new Set(['ბატონო', 'ქალბატონო', 'პატივცემულო', 'ჩემო', 'კარგო', 'ახლა', 'მაინც', 'კიდევ', 'ძალიან', 'არის', 'იყო', 'ვარ', 'ხართ', 'ამას', 'იმას', 'ესეც', 'რომელიც']);

/** სიტყვის ძირი შესადარებლად: სიტყვები ≥ 4 ასო, პირველი 4 ასო (ბრუნვის დაბოლოება არ ერევა: ბანკშია / ბანკიდან → „ბანკ“). */
function stems(text, skip = []) {
  const out = new Set();
  for (const w of String(text || '').match(/[ა-ჰ]{4,}/g) || []) {
    if (STOP.has(w) || skip.some((s) => w.startsWith(s))) continue;
    out.add(w.slice(0, 4));
  }
  return out;
}

/**
 * პასუხი → ორი ტაქტი: beat1/beat2 — პირველი ორი სასაუბრო წინადადება (რემარკის გარეშე), stageBefore — რემარკა მეორე ტაქტამდე.
 * bridge: 'word' (ხიდის სიტყვით იწყება) | 'shared' (საერთო ძირი პირველ ტაქტთან ან კითხვასთან) | 'stage' | null.
 */
export function beatLink(reply, question = '', skip = []) {
  const marked = String(reply || '').replace(/\*[^*]*\*?/g, '\n§STAGE§\n').replace(/^\s*\([^)]*\)/gm, '\n§STAGE§\n');
  const parts = marked.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const isSentence = (s) => s !== '§STAGE§' && (s.match(/[ა-ჰA-Za-zА-яЁё]/g) || []).length >= 3;
  const i1 = parts.findIndex(isSentence);
  const i2 = i1 < 0 ? -1 : parts.findIndex((s, i) => i > i1 && isSentence(s));
  const beat1 = i1 >= 0 ? parts[i1] : '';
  const beat2 = i2 >= 0 ? parts[i2] : '';
  const stageBefore = i2 >= 0 && parts.slice(0, i2).includes('§STAGE§');
  let bridge = null;
  if (beat2) {
    const before = new Set([...stems(beat1, skip), ...stems(question, skip)]);
    const start = beat2.replace(/^[„“"«(—–-]+\s*/, '');
    if (BRIDGE_START.test(start) || ALSO_ENCLITIC.test(start)) bridge = 'word';
    else if ([...stems(beat2, skip)].some((s) => before.has(s))) bridge = 'shared';
    else if (ANAPHORA.test(beat2)) bridge = 'anaphora';
    else if (stageBefore) bridge = 'stage';
  }
  return { beat1, beat2, stageBefore, bridge };
}

const YOU_FORMAL = /(^|[^ა-ჰ])(თქვენ|თქვენი|თქვენს|თქვენთვის|ბრძანდებით|გნებავთ|მობრძანდით|დაბრძანდით|გეკადრებათ|იცით|გაქვთ|ხართ|გინდათ|მოიტანეთ|დატოვეთ|დაელოდეთ|შემოიარეთ|მიმართეთ)([^ა-ჰ]|$)/;
const YOU_FAMILIAR = /(^|[^ა-ჰ])(შენ|შენი|შენს|შენთვის|ხარ|გაქვს|იცი|გინდა|მოიტანე|დატოვე|დაელოდე|შემოიარე|მიმართე|მოდი)([^ა-ჰ]|$)/;

/** მომხმარებლისადმი მიმართვის ფორმა ერთ პასუხში: 'თქვენ' | 'შენ' | 'mixed' | null. „ხომ იცი“ (ნაწილაკი) არ ითვლება. */
export function addressForm(reply) {
  const speech = String(reply || '').replace(/\*[^*]*\*?/g, ' ').replace(/ხომ იცი/g, ' ');
  const f = YOU_FORMAL.test(speech);
  const s = YOU_FAMILIAR.test(speech);
  return f && s ? 'mixed' : f ? 'თქვენ' : s ? 'შენ' : null;
}

/** address_forms ორივე რეგისტრს ურევს? (ბატონო/ქალბატონო/პატივცემულო + შენ/ბიჭო/კაცო) — მაშინ ფორმა პასუხებს შორის შეიძლება იცვლებოდეს. */
export function mixesAddress(c) {
  const a = Object.entries(c?.address_forms || {}).filter(([k]) => /calls_others|to_/.test(k)).map(([, v]) => v).join(' ');
  return /ბატონო|ქალბატონო|პატივცემულო/.test(a) && /(^|[^ა-ჰ])(შენ|ბიჭო|კაცო|გოგო|ბოშო|ძმაო)([^ა-ჰ]|$)/.test(a);
}

/**
 * გადამისამართების „ჩამკეტი“ ამ პასუხისთვის: ზოგადი წესი საკმარისი არ აღმოჩნდა (რეალური smoke: ბელამ ხელნაწერის
 * პირველსავე შეტყობინებაზე „ვასოსთან გადადი“ თქვა). მთვლელი სერვერზეა, ამიტომ პირდაპირ ვეუბნებით, რა შეიძლება ახლა.
 */
export function redirectGateLine(p, { allow = false } = {}) {
  // Round 8 §7.3: ეგზემპლარი ვერ დააბრუნა და მისი ამბავი ხილულ პერსონაჟს ასახელებს — გადამისამართება ამ პასუხში ნებადართულია
  if (allow) return 'REDIRECT GATE: open for this reply — you may send the user to the ONE person your story about the copy names. If the user then changes the subject, talk gladly.';
  if (p.manuscriptCount < 3) {
    return `REDIRECT GATE: the manuscript has come up ${p.manuscriptCount} time(s) — fewer than 3. In THIS reply do NOT send the user to anyone else (no "go to X", "take it to X", "X has it"), do NOT say you are leaving or busy. Engage: react, ask, promise something small.`;
  }
  return 'REDIRECT GATE: the manuscript has come up 3+ times — now you may suddenly have to go, or send the user to ONE of your redirects. If the user then changes the subject, talk gladly.';
}

/** პრომპტის ხაზი (სპეცის ფორმატით). */
export function pacingLine(p) {
  const list = (arr) => (arr?.length ? arr.map((c) => `„${phraseCore(c)}“`).join(', ') : 'none');
  return `Messages in this chat so far: ${p.messageCount}. Messages about the manuscript so far: ${p.manuscriptCount}. Catchphrases already used in this chat: [${list(p.usedCatchphrases)}]. Excuses already used in this chat: [${list(p.usedExcuses)}]`;
}
