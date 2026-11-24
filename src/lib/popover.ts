// The one popover behaviour: every menu, panel and list the UI opens under a button closes the same ways, and only one is
// open at a time. `dismiss` is a Svelte action put on the element that holds both the button and what it opens: while
// `open`, a press outside it closes it, Escape closes it and gives the focus back to the button, and opening it closes any
// other popover that is open. A second click on the button is the caller's toggle (the button is inside the root, so the
// outside press does not meet it). The open state belongs to the caller.

export interface DismissOptions {
  /** Whether the popover is open now. */
  open: boolean
  /** Closes it; called with whether the focus goes back to the button. */
  close: (refocus: boolean) => void
  /** The button to give the focus back to. */
  trigger?: () => { focus(): void } | null | undefined
}

interface Emitter {
  addEventListener(type: string, fn: (e: never) => void, capture?: boolean): void
  removeEventListener(type: string, fn: (e: never) => void, capture?: boolean): void
}

const opened = new Map<symbol, { close: () => void; root: { contains(n: unknown): boolean } }>()

/** Closes every open popover except `keep` and the ones that hold `keep` (a list opened inside a panel keeps the panel open). */
export function closeOthers(keep?: symbol, within?: unknown): void {
  for (const [k, o] of [...opened]) if (k !== keep && !(within !== undefined && o.root.contains(within))) o.close()
}

/** How many popovers are open (for tests). */
export const openCount = (): number => opened.size

/** The action. `target` is where the window's events come from (the window itself). */
export function dismiss(root: { contains(n: unknown): boolean }, first: DismissOptions, target: Emitter = globalThis as unknown as Emitter) {
  let o = first
  const me = Symbol("popover")
  let on = false
  const press = (e: { target: unknown }) => {
    if (!root.contains(e.target)) o.close(false)
  }
  const key = (e: { key: string; defaultPrevented?: boolean; preventDefault(): void; stopPropagation(): void }) => {
    if (e.key !== "Escape") return
    // Only the innermost open popover answers: one with another open inside it leaves Escape to that one.
    for (const [k, other] of opened) if (k !== me && root.contains(other.root)) return
    e.preventDefault()
    e.stopPropagation()
    o.close(true)
    o.trigger?.()?.focus()
  }
  const start = () => {
    if (on) return
    on = true
    closeOthers(me, root)
    opened.set(me, { close: () => o.close(false), root })
    target.addEventListener("pointerdown", press as never, true)
    target.addEventListener("keydown", key as never, true)
  }
  const stop = () => {
    if (!on) return
    on = false
    opened.delete(me)
    target.removeEventListener("pointerdown", press as never, true)
    target.removeEventListener("keydown", key as never, true)
  }
  if (o.open) start()
  return {
    update(next: DismissOptions) {
      o = next
      if (o.open) start()
      else stop()
    },
    destroy: stop,
  }
}

/** The index of the next option whose label starts with what has been typed; `from` is the one the focus is on, so a
 * repeated letter steps through the options that begin with it. -1 when none does. */
export function typeahead(labels: readonly string[], typed: string, from: number): number {
  const t = typed.toLowerCase()
  if (!t) return -1
  const same = [...t].every((c) => c === t[0])
  const needle = same ? t[0]! : t
  const start = same ? from + 1 : Math.max(from, 0)
  for (let i = 0; i < labels.length; i++) {
    const at = (start + i) % labels.length
    if (labels[at]!.toLowerCase().startsWith(needle)) return at
  }
  return -1
}
