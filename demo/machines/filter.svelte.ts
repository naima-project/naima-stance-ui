// Which tasks the list shows: a machine of one input and three states, written directly as a .svelte.ts
// class because a model of it would be longer than the class and prove nothing a reader cannot see. It sits
// beside the tasks machine in the store; the two move independently, which is their product.

export type Show = "ALL" | "OPEN" | "DONE";

export interface FilterView {
  readonly show: Show;
}

export class Filter {
  #show: Show = $state("ALL");
  readonly view: FilterView;

  constructor() {
    const show = () => this.#show;
    this.view = {
      get show() {
        return show();
      },
    };
  }

  allowed(event: { type: "choose"; show: Show }): boolean {
    return event.show !== this.#show;
  }

  choose(show: Show): boolean {
    if (!this.allowed({ type: "choose", show })) return false;
    this.#show = show;
    return true;
  }
}
