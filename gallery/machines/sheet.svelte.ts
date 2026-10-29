// Whether the gallery's sample dialog is open: two states and two inputs, written directly as a .svelte.ts
// class because a model of it would prove nothing a reader cannot see.

export interface SheetView {
  readonly open: boolean;
}

export class Sheet {
  #open = $state(false);
  readonly view: SheetView;

  constructor() {
    const open = () => this.#open;
    this.view = {
      get open() {
        return open();
      },
    };
  }

  allowed(event: { type: "open" | "close" }): boolean {
    return event.type === "open" ? !this.#open : this.#open;
  }

  open(): boolean {
    if (!this.allowed({ type: "open" })) return false;
    this.#open = true;
    return true;
  }

  close(): boolean {
    if (!this.allowed({ type: "close" })) return false;
    this.#open = false;
    return true;
  }
}
