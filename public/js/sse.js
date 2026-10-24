// SSE-ის წაკითხვა (Round 5 §3): ერთი ნაწილი („data: {...}“) → ივენთი; done-იდან მხოლოდ ის ველები, რაც UI-ს სჭირდება.
// უცნობი ველები (spoken_by_name, proofread, cached_tokens, მომავალი ახალი ველები) უბრალოდ იგნორირდება — პარსინგს ვერ გატეხს.

/** SSE ნაწილი (\n\n-მდე) → ობიექტი ან null (data ხაზი არ არის, არასწორი JSON, ან ობიექტი არ არის). */
export function parseSseChunk(chunk) {
  const line = String(chunk ?? '').split('\n').find((l) => l.startsWith('data:'));
  if (!line) return null;
  try {
    const ev = JSON.parse(line.slice(5).trim());
    return ev && typeof ev === 'object' && !Array.isArray(ev) ? ev : null;
  } catch {
    return null;
  }
}

/** done ივენთიდან მთვლელის ველები (ზედა ზოლი, tooltip); სხვა არაფერი. remaining არ არის → null. */
export function tokensFromDone(ev) {
  if (!ev || typeof ev !== 'object' || !ev.remaining || typeof ev.remaining !== 'object') return null;
  return {
    remaining: ev.remaining,
    limits: ev.limits,
    period: ev.period,
    resets_at: ev.resets_at,
    avg_input_per_request: ev.avg_input_per_request,
  };
}
