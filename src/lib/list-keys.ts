// j and k in any list (develop/design/ui-usefulness-2026-11-12.md, "Keyboard everywhere"): j moves the focus to the
// next row, k to the one before, Enter opens the row focused. A screen gives its list this action, and marks its rows
// (by default with data-list-row, or any selector it names); a row is focused, so it needs a tabindex or to be a link
// or a button. Keys typed in a field, or with a modifier, are left alone, and so is everything while an overlay (the
// command bar) is open, since the action only listens to keys pressed on the page itself.
//
//   <ul use:listKeys={{ onopen: (row) => open(row.dataset.ref) }}> <li data-list-row tabindex="-1" data-ref=...>
//
// nextRow is the rule alone, for a list that keeps its own choice (a store's machine) instead of the focus.

import { nextRow } from "./list-rows.ts";

export { nextRow };

export interface ListKeysOptions {
  /** The rows, inside the list. */
  readonly rows?: string;
  /** Enter on a row; by default the row, or the first link or button in it, is clicked. */
  readonly onopen?: (row: HTMLElement) => void;
  /** j or k moved to a row. */
  readonly onmove?: (row: HTMLElement, index: number) => void;
}

const typing = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || !!t.closest("input, textarea, select"));

/** The Svelte action: j, k and Enter on the rows of `node`, while the focus is in it or on the page's body. */
export function listKeys(node: HTMLElement, options: ListKeysOptions = {}) {
  let o = options;
  const rows = () => Array.from(node.querySelectorAll<HTMLElement>(o.rows ?? "[data-list-row]"));
  const keys = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    const inside = e.target instanceof Node && (node.contains(e.target) || e.target === document.body);
    if (!inside) return;
    const all = rows();
    const at = all.findIndex((r) => r === document.activeElement || r.contains(document.activeElement));
    if (e.key === "Enter" && at >= 0 && all[at] === document.activeElement) {
      e.preventDefault();
      const row = all[at]!;
      if (o.onopen) o.onopen(row);
      else (row.matches("a, button") ? row : row.querySelector<HTMLElement>("a, button") ?? row).click();
      return;
    }
    const next = nextRow(at, e.key, all.length);
    if (next === null) return;
    e.preventDefault();
    const row = all[next]!;
    row.focus();
    row.scrollIntoView({ block: "nearest" });
    o.onmove?.(row, next);
  };
  document.addEventListener("keydown", keys);
  return {
    update(next: ListKeysOptions) {
      o = next;
    },
    destroy() {
      document.removeEventListener("keydown", keys);
    },
  };
}
