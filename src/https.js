// Round 11 §2: http://tianshani.ge → https (301/308), Strict-Transport-Security, ერთი კანონიკური ჰოსტი (www → apex).
// ჩართულია მხოლოდ მაშინ, როცა site.public_url https://-ით იწყება — ლოკალურად (http://localhost:3000) არაფერს აკეთებს.
// LiteSpeed პროქსია (trust proxy 1): X-Forwarded-Proto სიმართლის წყაროა; თუ ჰედერი საერთოდ არ არის, გადამისამართება მხოლოდ
// მაშინ, როცა კავშირი TLS არ არის და ჰოსტი საჯაროა — სხვა შემთხვევაში არაფერი (ციკლის საფრთხე არ არის).

export const HSTS = 'max-age=31536000';

/** X-Forwarded-Proto-ს პირველი მნიშვნელობა (პატარა ასოებით) ან null. */
export function forwardedProto(req) {
  const v = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return v || null;
}

/** Express middleware; site.public_url არ არის https:// → გამჭვირვალე. */
export function canonicalHttps(cfg) {
  const configured = String(cfg?.site?.public_url || '').trim();
  let pub = null;
  if (/^https:\/\//i.test(configured)) {
    try { pub = new URL(configured); } catch { pub = null; }
  }
  if (!pub) return (req, res, next) => next();
  const apex = pub.hostname.toLowerCase();

  return (req, res, next) => {
    const host = String(req.hostname || '').toLowerCase();
    const proto = forwardedProto(req);
    const tls = Boolean(req.socket?.encrypted);
    const to = () => res.redirect(['GET', 'HEAD'].includes(req.method) ? 301 : 308, `https://${pub.host}${req.originalUrl}`);
    // www → ერთი ჰოსტი (cookie და localStorage ერთ ადგილას — თამაში ორად არ იყოფა)
    if (host === `www.${apex}`) return to();
    // აშკარად http: პროქსი ამბობს http, ან პროქსის ჰედერი არ არის, კავშირი TLS არ არის და ჰოსტი საჯაროა
    if (proto === 'http' || (!proto && !tls && host === apex)) return to();
    if (proto === 'https' || tls) res.setHeader('Strict-Transport-Security', HSTS);
    return next();
  };
}
