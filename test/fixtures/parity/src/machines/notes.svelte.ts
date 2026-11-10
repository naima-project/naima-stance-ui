// A second machine, in a file of its own.
export class Notes {
  readonly view = { notes: [] as string[] };

  allowed(_event: { type: "write"; text: string }): boolean {
    return true;
  }

  /** Writes a note at the end. */
  write(text: string): boolean {
    this.view.notes.push(text);
    return true;
  }
}
