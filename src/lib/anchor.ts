// The top layer for what a button opens (a menu, a panel, a calendar): the popover API puts the element above every
// ancestor's overflow and stacking, and CSS anchor positioning (anchor-name, position-anchor, position-try-fallbacks)
// places it at the button, flipping when the window has no room. Nothing a header or a scrolling box holds can clip it.
// Where the browser has no anchor positioning, the element keeps the absolute position its stylesheet gives it, under the
// button's own box, and is not made a popover. Plain functions and one Svelte action, no state of their own.

/** Whether the browser places a box by an anchor: the popover then goes to the top layer. */
export function anchored(
  css: { supports(p: string): boolean } | undefined =
    (globalThis as { CSS?: { supports(p: string): boolean } }).CSS,
): boolean {
  try {
    return !!css && css.supports("anchor-name: --a") &&
      "showPopover" in HTMLElement.prototype;
  } catch {
    return false;
  }
}

/** The action's options: the element the popover is anchored to, and how it lines up with it. */
export interface AnchorOptions {
  /** The button's box the popover is placed against (its container, which also holds the button). */
  to: HTMLElement | undefined;
  /** The edge of the anchor the popover lines up with. */
  align?: "start" | "end";
  /** Under the anchor, or above it. */
  side?: "below" | "above";
}

let counter = 0;

/** Put on the popover element: when anchoring is available it becomes a manual popover (the open state stays the caller's,
 *  its press outside and Escape the shared dismiss helper's), shown at once and placed by the anchor. */
export function anchor(node: HTMLElement, first: AnchorOptions) {
  if (!anchored()) return {};
  const name = `--anchor-${++counter}`;
  let to: HTMLElement | undefined;
  const place = (o: AnchorOptions) => {
    if (to && to !== o.to) to.style.removeProperty("anchor-name");
    to = o.to;
    to?.style.setProperty("anchor-name", name);
    node.style.setProperty("position-anchor", name);
    node.dataset["align"] = o.align ?? "start";
    node.dataset["side"] = o.side ?? "below";
  };
  node.setAttribute("popover", "manual");
  place(first);
  try {
    node.showPopover();
  } catch {
    // Already shown, or not in the document yet: the element then stays where its box puts it.
  }
  return {
    update: place,
    destroy() {
      to?.style.removeProperty("anchor-name");
      try {
        node.hidePopover();
      } catch {
        // Removed with its parent.
      }
    },
  };
}
