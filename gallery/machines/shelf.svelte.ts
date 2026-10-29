// The order of the gallery's sample list, which the Draggable widget rearranges. Written directly as a .svelte.ts
// class: one input, moving an entry one place, and nothing a model would prove that a reader cannot see.

export interface ShelfView {
  readonly items: readonly string[];
}

export type Way = "up" | "down" | "left" | "right";

export class Shelf {
  #items: string[] = $state([]);
  readonly view: ShelfView;

  constructor(items: readonly string[]) {
    this.#items = [...items];
    const read = () => this.#items;
    this.view = {
      get items() {
        return read();
      },
    };
  }

  allowed(event: { type: "move"; item: string; way: Way }): boolean {
    const at = this.#items.indexOf(event.item);
    if (at < 0) return false;
    if (event.way === "up") return at > 0;
    if (event.way === "down") return at < this.#items.length - 1;
    return false;
  }

  move(item: string, way: Way): boolean {
    if (!this.allowed({ type: "move", item, way })) return false;
    const at = this.#items.indexOf(item);
    const to = way === "up" ? at - 1 : at + 1;
    const next = [...this.#items];
    [next[at], next[to]] = [next[to], next[at]];
    this.#items = next;
    return true;
  }
}
