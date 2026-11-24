// The rule of j and k in a list, alone, without the page (lib/ui/list-keys.ts is the action that uses it).

/** The row after `at` (j) or before it (k) among `n`, stopping at both ends; -1 before any is chosen moves to the
 *  first (j) or the last (k). Null for a key that is not j or k, or an empty list. */
export function nextRow(at: number, key: string, n: number): number | null {
  if (n <= 0 || (key !== "j" && key !== "k")) return null;
  if (at < 0 || at >= n) return key === "j" ? 0 : n - 1;
  return key === "j" ? Math.min(n - 1, at + 1) : Math.max(0, at - 1);
}
