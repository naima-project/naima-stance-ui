export class Toggle {
  #on = $state(false);
  readonly view: { readonly on: boolean };
  constructor() {
    const self = this;
    this.view = {
      get on() {
        return self.#on;
      },
    };
  }
  flip(): void {
    this.#on = !this.#on;
  }
}
