// Round 7 §1: „→ მივიდე <სახელი>-სთან“ — სახელი თანდებულით „-თან“; Round 8: მიცემითი „-ს“ (DOM-ის გარეშე: ტესტები და mock-იც იყენებს).

const CONSONANT = /[ბგდვზთკლმნპჟრსტფქღყშჩცძწჭხჯჰ]/;

/**
 * ი-ზე დამთავრებული სახელი: ფუძე თანხმოვანზე (ოთარ-ი → ოთართან) თუ ხმოვანზე (გივი → გივისთან)?
 * ერთსიტყვიანი მოკლე სახელი (≤ 4 ასო: გივი, ლალი) და ორ თანხმოვანზე დამთავრებული ფუძე (შუქრ-ი) — ხმოვანფუძიანია;
 * მრავალსიტყვიანში ბოლო სიტყვა ჩვეულებრივი არსებითია (ორი დიდი კაც-ი, ბელას ქმარ-ი).
 */
function vowelStemI(word, single) {
  const stem = word.slice(0, -1);
  return (single && word.length <= 4) || (CONSONANT.test(stem.at(-1)) && CONSONANT.test(stem.at(-2)));
}

/**
 * short_name_ka → „-თან“ ფორმა: გრიშა → გრიშასთან, კოტე → კოტესთან, სოსო → სოსოსთან, ოთარი → ოთართან,
 * გივი → გივისთან, ქალბატონი თამარი → ქალბატონ თამართან, ორი დიდი კაცი → ორ დიდ კაცთან.
 * წინა სიტყვები (წოდება, რიცხვითი, ზედსართავი) ბოლო „ი“-ს კარგავს; ბოლო სიტყვა — „-თან“ / „-სთან“.
 */
export function toward(shortName) {
  return inflect(shortName, 'სთან', 'თან');
}

/**
 * Round 8 §3.2: მიცემითი „-ს“ — იგივე ფუძე, რაც toward()-ში, „თან“-ის გარეშე: ვასო → ვასოს, ოთარი → ოთარს,
 * გივი → გივის, ქალბატონი თამარი → ქალბატონ თამარს, ბელას ქმარი → ბელას ქმარს.
 */
export function dative(shortName) {
  return inflect(shortName, 'ს', 'ს');
}

/**
 * ნათესაობითი „-ის“ / „-ს“ („… თქმით“): ოთარი → ოთარის, ვაჟა ზაზაევიჩი → ვაჟა ზაზაევიჩის, ვასო → ვასოს, გივი → გივის.
 * „-ძე“ გვარი ე-ს კარგავს (ჩაჩანიძე → ჩაჩანიძის). კუმშვადი ფუძე (ქმარი → ქმრის) არ მუშავდება —
 * მხოლოდ ეგზემპლარის გადამცემებისთვის გამოიყენება, მათ შორის ასეთი არავინაა.
 */
export function genitive(shortName) {
  const s = String(shortName || '').trim();
  if (s.endsWith('ძე')) return `${s.slice(0, -1)}ის`;
  return inflect(s, 'ს', 'ის');
}

/** ბოლო სიტყვა: ხმოვანფუძიანს ემატება afterVowel, თანხმოვანფუძიანს (ბოლო „ი“-ს გარეშე) — afterConsonant. */
function inflect(shortName, afterVowel, afterConsonant) {
  const words = String(shortName || '').trim().split(/\s+/);
  const last = words.pop() || '';
  const head = words.map((w) => (w.endsWith('ი') && w.length > 2 ? w.slice(0, -1) : w));
  let tail;
  if (last.endsWith('ი')) tail = vowelStemI(last, head.length === 0) ? `${last}${afterVowel}` : `${last.slice(0, -1)}${afterConsonant}`;
  else if (CONSONANT.test(last.at(-1) || '')) tail = `${last}${afterConsonant}`;
  else tail = `${last}${afterVowel}`;
  return [...head, tail].join(' ');
}
