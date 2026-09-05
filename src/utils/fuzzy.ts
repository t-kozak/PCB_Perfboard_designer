/**
 * Lightweight fuzzy match for search-as-you-type filters: true if every
 * character of `query` appears in `target`, in order (case-insensitive),
 * with any characters in between. So "esp32" matches "XIAO ESP32-C6" and
 * "adc" matches "Analog-to-Digital Converter".
 */
export function fuzzyMatch(query: string, target: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}
