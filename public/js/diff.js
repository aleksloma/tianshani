// სიტყვების დიფი (Round 3 §4, ადმინის „შესწორებული პასუხები“) — სუფთა ფუნქცია, unit ტესტებისთვისაც.

/** სიტყვების LCS-დიფი: [{ w, changed }] ორივე მხარისთვის (შეცვლილი სიტყვა მონიშნულია). */
export function diffWords(a, b) {
  const A = a.split(/(\s+)/);
  const B = b.split(/(\s+)/);
  const n = A.length;
  const m = B.length;
  if (n * m > 250_000) return { left: [{ w: a, changed: true }], right: [{ w: b, changed: true }] };
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const left = [];
  const right = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { left.push({ w: A[i], changed: false }); right.push({ w: B[j], changed: false }); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) left.push({ w: A[i++], changed: true });
    else right.push({ w: B[j++], changed: true });
  }
  while (i < n) left.push({ w: A[i++], changed: true });
  while (j < m) right.push({ w: B[j++], changed: true });
  return { left, right };
}
