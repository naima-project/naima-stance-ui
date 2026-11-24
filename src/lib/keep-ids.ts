// A screen kept mounted but hidden (App.svelte keeps Home and the Diary between visits) must not hold the page's one
// heading id: the screen shown has it, and two elements with one id break the label that points to it and every
// lookup by it. While the screen is hidden its heading's id is set aside in a data attribute, and given back when it
// is shown again; a heading drawn again while hidden is set aside too. Plain DOM, no Svelte state.

const ID = "screen-h";
const ASIDE = "data-kept-id";

/** Set the heading id of everything under `node` aside (hidden) or back (shown). */
function apply(node: HTMLElement, hidden: boolean): void {
  if (hidden) {
    for (const el of node.querySelectorAll<HTMLElement>(`#${ID}`)) {
      el.setAttribute(ASIDE, ID);
      el.removeAttribute("id");
    }
  } else {
    for (const el of node.querySelectorAll<HTMLElement>(`[${ASIDE}="${ID}"]`)) {
      el.id = ID;
      el.removeAttribute(ASIDE);
    }
  }
}

/** The action for the wrapper of a kept screen: `hidden` true while another screen is shown. */
export function keepIds(node: HTMLElement, hidden: boolean) {
  let now = hidden;
  const watch = new MutationObserver(() => {
    if (now) apply(node, true);
  });
  watch.observe(node, { childList: true, subtree: true });
  apply(node, now);
  return {
    update(next: boolean) {
      now = next;
      apply(node, next);
    },
    destroy() {
      watch.disconnect();
    },
  };
}
