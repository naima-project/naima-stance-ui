// Prints the lines written to the given files as they come, until it is stopped, starting over on a file that is
// truncated or written anew. The platforms check reads, through it, the output of an app it could not start itself:
// one launched in the Windows desktop session by a scheduled task.
//
//   deno run -A checks/follow.ts <file>...

const files = Deno.args.map((path) => ({ path, at: 0, rest: "" }));
const decoder = new TextDecoder();

async function step(f: { path: string; at: number; rest: string }): Promise<void> {
  let size: number;
  try {
    size = (await Deno.stat(f.path)).size;
  } catch {
    return; // not written yet
  }
  if (size < f.at) [f.at, f.rest] = [0, ""];
  if (size === f.at) return;
  const file = await Deno.open(f.path, { read: true });
  try {
    await file.seek(f.at, Deno.SeekMode.Start);
    const buf = new Uint8Array(size - f.at);
    let read = 0;
    while (read < buf.length) {
      const n = await file.read(buf.subarray(read));
      if (n === null) break;
      read += n;
    }
    f.at += read;
    const text = f.rest + decoder.decode(buf.subarray(0, read), { stream: true });
    const lines = text.split(/\r?\n/);
    f.rest = lines.pop() ?? "";
    for (const line of lines) console.log(line);
  } finally {
    file.close();
  }
}

if (import.meta.main) {
  for (;;) {
    for (const f of files) await step(f);
    await new Promise((r) => setTimeout(r, 200));
  }
}
