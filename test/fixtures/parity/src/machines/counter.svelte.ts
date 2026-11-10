// A machine of the fixture: a view, `allowed`, and its transitions.
export class Counter {
  #count = 0;
  readonly view = { count: 0 };

  allowed(event: { type: "add" | "reset" }): boolean {
    return event.type === "add" ? this.#count < 3 : this.#count > 0;
  }

  /** Adds one, up to three. */
  add(): boolean {
    return this.#bump(1);
  }

  /** Starts over from zero. */
  reset(): boolean {
    return this.#bump(-this.#count);
  }

  /** Sets the count outright, as a test does: not a transition, so no component and no agent may call it. @internal */
  poke(count: number): void {
    this.#count = count;
  }

  #bump(by: number): boolean {
    this.#count += by;
    return true;
  }
}
