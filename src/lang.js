// ენის მარტივი გამოცნობა დამწერლობით (ლოგებისთვის და mock რეჟიმისთვის).

/** აბრუნებს 'ka' | 'ru' | 'en' | 'other' | 'unknown'. */
export function guessLang(text = '') {
  let ka = 0, cy = 0, la = 0, other = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0x10a0 && cp <= 0x10ff) || (cp >= 0x1c90 && cp <= 0x1cbf)) ka++;
    else if (cp >= 0x0400 && cp <= 0x04ff) cy++;
    else if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || (cp >= 0xc0 && cp <= 0x24f)) la++;
    else if (/\p{L}/u.test(ch)) other++;
  }
  const max = Math.max(ka, cy, la, other);
  if (max === 0) return 'unknown';
  if (max === ka) return 'ka';
  if (max === cy) return 'ru';
  if (max === la) return 'en';
  return 'other';
}

/** ეკითხება თუ არა მომხმარებელი ხელნაწერზე. */
export function mentionsManuscript(text = '') {
  return /მოთხრობ|ხელნაწერ|წაიკითხ|წაკითხ|ეგზემპლარ|ტიან|მთებ|ხიდებ|manuscript|novel|story|read|рукопис|прочита|повест|рассказ/i.test(text);
}
