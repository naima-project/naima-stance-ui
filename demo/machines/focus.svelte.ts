// What the list is looking at: named sequences of transitions of the other machines, the "show" conveniences. It holds
// no state of its own (its view is empty) and decides nothing: each method calls transitions of the tasks and filter
// machines it is given, in order. A component calls them, and so does an agent through the registry, with the same
// result: "show the open tasks" is one name for dropping a removal in progress and then filtering.
import type { Filter, Show } from "./filter.svelte.ts";
import type { Tasks } from "./tasks.svelte.ts";

export type FocusEvent = { type: "showAll" } | { type: "showOpen" } | { type: "showDone" };

const SHOWS: { [type in FocusEvent["type"]]: Show } = { showAll: "ALL", showOpen: "OPEN", showDone: "DONE" };

export class Focus {
  readonly view: Record<string, never> = {};
  readonly #tasks: Tasks;
  readonly #filter: Filter;

  constructor(tasks: Tasks, filter: Filter) {
    this.#tasks = tasks;
    this.#filter = filter;
  }

  allowed(event: FocusEvent): boolean {
    return this.#filter.allowed({ type: "choose", show: SHOWS[event.type] });
  }

  /** Shows every task, and drops a removal that was being asked about. @sequence */
  showAll(): boolean {
    return this.#show("showAll");
  }

  /** Shows the tasks still to do, and drops a removal that was being asked about. @sequence */
  showOpen(): boolean {
    return this.#show("showOpen");
  }

  /** Shows the tasks that are done, and drops a removal that was being asked about. @sequence */
  showDone(): boolean {
    return this.#show("showDone");
  }

  #show(type: FocusEvent["type"]): boolean {
    if (!this.allowed({ type })) return false;
    this.#tasks.cancel();
    return this.#filter.choose(SHOWS[type]);
  }
}
