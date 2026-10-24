// characters.json ჩატვირთვა, კონტენტის ქულა, კედლის შერჩევა, წარმომადგენელთა (proxy) რუკა.
// characters.json არის კანონი — აქ მხოლოდ ვკითხულობთ და ვამდიდრებთ გამოთვლილი ველებით.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'characters.json'), 'utf8'));
const VOICE_EXTRAS = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'voice_extras.json'), 'utf8')).characters || {};
  } catch { return {}; }
})();
// Round 6 §3: როდის შეიძლება ცნობილი ფრაზის თქმა (ხმის ბიბლიიდან) — { id: { "<ფრაზა>": "<trigger_en>" } }
const CATCHPHRASE_TRIGGERS = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'catchphrase_triggers.json'), 'utf8')).characters || {};
  } catch { return {}; }
})();
export const DEFAULT_TRIGGER = 'rarely; only if it fits';

/** ფრაზის „როდის“ — ფაილიდან; თუ არ არის, „იშვიათად, მხოლოდ თუ ჯდება“. */
export function triggerFor(c, phrase) {
  return c?.catchphrase_triggers?.[phrase] || CATCHPHRASE_TRIGGERS[c?.id]?.[phrase] || DEFAULT_TRIGGER;
}

export const world = DATA.world;
export const meta = DATA.meta;
export const famousRollCall = DATA.famous_roll_call_ka;

/** ვისთვისაც ვერავინ მოიძებნა — დეფოლტი (სპეცი §3.2). */
const DEFAULT_PROXIES = ['tina', 'soso', 'director'];

/** სახელის მოკლე ფორმა: „ვაჟა ზაზაევიჩი (ბატონი ვაჟა) — დირექტორი“ → „ვაჟა ზაზაევიჩი“. */
export function shortName(nameKa) {
  return nameKa.split(/\s[—–-]\s|\s\(|\s\//)[0].trim();
}

/** როლის მოკლე ფორმა ფირფიტისთვის: პირველი ფრაზა მძიმემდე. */
export function shortRole(roleKa) {
  return (roleKa || '').split(/[,;(]/)[0].trim();
}

/**
 * კონტენტის ქულა: system_prompt_en-ის სიგრძე + სიების რაოდენობა წონებით + ბონუსები.
 * ერთეულები: ~100 სიმბოლო პრომპტი ≈ 1 ქულა; ფრაზა ≈ 1.5; საბაბი ≈ 2; ფორმულა ≈ 1; დიალოგი ≈ 3.
 */
export function contentScore(c) {
  const len = (c.system_prompt_en || '').length / 100;
  const s = len
    + 1.5 * (c.catchphrases_ka?.length || 0)
    + 2.0 * (c.excuse_repertoire_ka?.length || 0)
    + 1.0 * (c.recurring_formulae_ka?.length || 0)
    + 3.0 * (c.sample_dialogues?.length || 0)
    + (c.importance === 'main' ? 8 : c.importance === 'secondary' ? 3 : 0)
    + (c.appears === 'on_screen' ? 5 : 0);
  return Math.round(s * 10) / 10;
}

/** ყველა სახელის ვარიანტი, რომლითაც პერსონაჟი ტექსტში შეიძლება იყოს ნახსენები (ძირი — ბრუნვების გამო). */
export function nameStems(c) {
  const stems = new Set();
  const add = (s) => { if (s && s.length >= 3) stems.add(s); };
  const full = c.name_ka.replace(/[()—–/]/g, ' ');
  for (const tok of full.split(/\s+/)) {
    const t = tok.replace(/[„“"',.!?:;]/g, '');
    if (!t || ['ბატონი', 'ქალბატონი', 'ბატონო', 'ქალბატონო', 'ორი', 'დიდი', 'კაცი', 'მდივანი', 'დირექტორის', 'ყოფილი'].includes(t)) continue;
    // ქართული სახელების ძირი: ბოლო ხმოვნის მოჭრა (გივი→გივ, შოთა→შოთ, თინა→თინ, ვასო→ვას)
    add(t.length > 4 ? t.slice(0, -1) : t);
  }
  return [...stems];
}

/**
 * ფირფიტის სახელი: თუ მოკლე სახელი თანამდებობას ემთხვევა („ბუღალტერი (ბუღალტერი)“),
 * ვიღებთ პირად სახელს: „... — ქალბატონი თამარი“ ან „მღებავი (მიხო, ...)“ → „მიხო“.
 */
export function displayShortName(nameKa, roleShort) {
  const sn = shortName(nameKa);
  if (sn !== roleShort && !roleShort.startsWith(sn)) return sn;
  const parts = nameKa.split(/\s[—–]\s/);
  if (parts.length > 1 && parts[parts.length - 1].trim() !== sn) return parts[parts.length - 1].trim();
  const paren = nameKa.match(/\(([^,)]+)/);
  return paren ? paren[1].trim() : sn;
}

/** აგებს პერსონაჟების სიას გამოთვლილი ველებით. */
function build() {
  const list = DATA.characters.map((c) => ({
    ...c,
    short_name_ka: displayShortName(c.name_ka, shortRole(c.role_ka)),
    role_short_ka: shortRole(c.role_ka),
    content_score: contentScore(c),
    reachable: c.appears === 'on_screen',
    voice_extras: VOICE_EXTRAS[c.id] || null,
    catchphrase_triggers: CATCHPHRASE_TRIGGERS[c.id] || {},
    image: fs.existsSync(path.join(ROOT, 'public', 'assets', 'characters', `${c.id}.jpg`))
      ? `assets/characters/${c.id}.jpg` : null,
  }));
  // დალაგება კონტენტის კლებადობით (ხილული ჯერ, უხილავი ბოლოში)
  list.sort((a, b) => (b.reachable - a.reachable) || (b.content_score - a.content_score));
  list.forEach((c, i) => { c.order = i; });
  return list;
}

export const characters = build();
export const byId = Object.fromEntries(characters.map((c) => [c.id, c]));

/** კედელზე ჩამოკიდებული: ტოპ N ხილული პერსონაჟი კონტენტის ქულით. */
export function wallCharacters(n = 12) {
  return characters.filter((c) => c.reachable).slice(0, n);
}

/**
 * წარმომადგენელთა რუკა უხილავი პერსონაჟებისთვის:
 * ვინც redirects_to-ში ან excuse_repertoire_ka / sample_dialogues / system_prompt_en ტექსტში ახსენებს უხილავს.
 */
export function buildProxyMap() {
  const invisible = characters.filter((c) => !c.reachable);
  // ლერი თითქმის მუნჯია — წარმომადგენლად არ გამოდგება. ორი დიდი კაცი კი გივისთვის იდეალურია.
  const visible = characters.filter((c) => c.reachable && c.id !== 'leri');
  // famous_roll_call_ka სოსოს ნათქვამია (characters.json → famous_roll_call_ka.en)
  const extraText = { soso: (famousRollCall?.lines || []).join('\n') };
  // „(ოთარი)“, „(დირექტორი)“ — ატრიბუციები უხილავის what_others_say_ka-ში
  const attributionAliases = {
    director: ['დირექტორი'], tamari: ['ბუღალტერი', 'მოლარე', 'თამარი'], otari: ['ოთარი'], irodioni: ['იროდიონი'],
    marksheideri: ['მარკშეიდერი'], tina: ['თინა', 'მდივანი'], grisha: ['გრიშა'], vaso: ['ვასო'], soso: ['სოსო'],
  };
  // cisperi_mtebi_personajebi.md → ცხრილი „პერსონაჟები, რომლებიც არ ჩანან...“: ვინ ახსენებს ვის
  const bibleRows = readInvisibleTable();
  const bibleAliases = {
    two_big_men: ['ორი დიდი კაცი'], tina: ['მდივან', 'თინა'], soso: ['სოსო'], irodioni: ['იროდიონ'],
    director: ['დირექტორ'], marksheideri: ['მარკშეიდერ'], tamari: ['ბუღალტ', 'მოლარე'], otari: ['ოთარ'],
    bela: ['ბელას', 'ბელა '], grisha: ['გრიშა'], vaso: ['ვასო'],
  };
  const map = {};
  for (const inv of invisible) {
    const stems = nameStems(inv);
    const enName = (inv.name_en || '').split(/[\s(—,]/)[0];
    const said = (inv.what_others_say_ka || []).join('\n');
    const row = bibleRows.find((r) => stems.some((s) => r.name.includes(s))) || null;
    const found = [];
    for (const v of visible) {
      const redirects = (v.redirects_to || []).includes(inv.id);
      const text = [
        ...(v.excuse_repertoire_ka || []),
        ...(v.catchphrases_ka || []),
        ...(v.sample_dialogues || []).map((d) => d.assistant),
        v.system_prompt_en || '',
        extraText[v.id] || '',
      ].join('\n');
      const mentioned = stems.some((s) => text.includes(s)) || (enName.length >= 4 && text.includes(enName));
      const attributed = (attributionAliases[v.id] || []).some((a) => said.includes(`(${a}`))
        // what_others_say_ka-ს ხაზი სიტყვასიტყვით ამ პერსონაჟის ტექსტშია (მაგ. თინა: „მივლინებაშია, თვის ბოლოს ჩამოვა.“)
        || (inv.what_others_say_ka || []).some((l) => l.length > 12 && text.includes(l.replace(/\s*\(.*\)\s*$/, '')));
      const inBible = row ? (bibleAliases[v.id] || []).some((a) => row.text.includes(a)) : false;
      if (redirects || mentioned || attributed || inBible) found.push(v.id);
    }
    // ვარიაციისთვის მინიმუმ 2 წარმომადგენელი; აკლდება — დეფოლტით ვავსებთ (თინა, სოსო, დირექტორი)
    for (const d of DEFAULT_PROXIES) if (found.length < 2 && !found.includes(d)) found.push(d);
    map[inv.id] = found;
  }
  return map;
}

/** ბიბლიის ცხრილის მწკრივები: { name, text } (მხოლოდ კითხვა, ფაილი არ იცვლება). */
function readInvisibleTable() {
  try {
    const md = fs.readFileSync(path.join(ROOT, 'cisperi_mtebi_personajebi.md'), 'utf8');
    const start = md.indexOf('## პერსონაჟები, რომლებიც არ ჩანან');
    if (start < 0) return [];
    const section = md.slice(start, md.indexOf('\n## ', start + 5));
    return section.split(/\r?\n/)
      .filter((l) => l.startsWith('| ') && !l.startsWith('| ვინ') && !l.startsWith('|---'))
      .map((l) => {
        const cells = l.split('|').map((c) => c.trim());
        return { name: cells[1] || '', text: cells.slice(2).join(' ') };
      });
  } catch { return []; }
}

export const proxyMap = buildProxyMap();

/**
 * ირჩევს წარმომადგენელს უხილავისთვის. `preferred` — ვინც ამ ჩატში უკვე პასუხობდა (~70%-ით ის ჭარბობს).
 */
export function pickProxy(invisibleId, preferred = null, rnd = Math.random) {
  const list = proxyMap[invisibleId] || DEFAULT_PROXIES;
  if (preferred && list.includes(preferred) && rnd() < 0.7) return preferred;
  return list[Math.floor(rnd() * list.length)];
}

/**
 * Round 6 §2: ეკრანზე ნაჩვენები თანამდებობა, სადაც მონაცემების სიტყვა ჩვეულებრივი მკითხველისთვის გაუგებარია.
 * მხოლოდ UI-სთვის (ფირფიტა, „ესაუბრე სხვას“ რიგი, ჩატის სათაური) — characters.json და LLM-ის პრომპტი უცვლელია.
 * „მნე“ (არქაული) → უკვე მონაცემებშია: name_ka „გრიშა — მნე (სამეურნეო ნაწილის გამგე)“.
 */
export const ROLE_DISPLAY_KA = { grisha: 'სამეურნეო ნაწილის გამგე' };

/** სია UI-სთვის — სრულ პრომპტებს კლიენტს არ ვუგზავნით. */
export function publicList(wallCount = 12) {
  const wallIds = new Set(wallCharacters(wallCount).map((c) => c.id));
  return characters.map((c) => ({
    id: c.id,
    name_ka: c.name_ka,
    short_name_ka: c.short_name_ka,
    role_ka: ROLE_DISPLAY_KA[c.id] || c.role_ka,
    role_short_ka: ROLE_DISPLAY_KA[c.id] || c.role_short_ka,
    actor: c.actor,
    image: c.image,
    on_wall: wallIds.has(c.id),
    content_score: c.content_score,
    order: c.order,
    reachable: c.reachable,
    importance: c.importance,
    redirects_to: c.redirects_to || [],
    proxies: c.reachable ? undefined : proxyMap[c.id],
  }));
}
