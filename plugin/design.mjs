// The design tab: a tab of Naima's new UI (its `ui-tabs` point) that shows a project's design record, as the design
// method (method/design.md) leaves it: one subtab per step (mood board, palette, typography, icons, widget shapes,
// screens), and in each its rounds as framed pages, the variant chosen and the decision recorded.
//
// Plain JavaScript with no import outside the runtime's own modules, like the rest of the plugin. It runs in Naima's
// process and only reads files: the pages it frames are the project's own, served by Naima in a sandbox, and no code
// of the stance runs in the UI.
//
// Where the record is, from the app's folder (the one that holds stance-ui.json):
//
//   "design": "design"                                 the default: the folder of the steps and decisions.md
//   "design": { "folder": "<dir>", "previews": "<dir>" }  previews: where `deno task variants --out` wrote the
//                                                      comparison pages, when not in each round's preview/ folder
//
// In the design folder, a step's rounds are <step>/round-<n>/ (the screens step: screens/<screen>/round-<n>/), one
// folder per variant in each; a round's comparison page is round-<n>/preview/index.html, or in the previews folder
// <step>-r<n>/index.html (round 1 also <step>/index.html; the screens step screens-<screen>-r<n>/index.html); a
// variant with its own index.html (a screen's prototype or build) is framed itself. A step's folder may have the
// step's name or its short one (mood, shapes; mood-boards too). decisions.md holds one `## <date> <step>: ...`
// section per closed step, and per closed screen (`## <date> screen, <screen>: ...`), naming the chosen variant as
// "variant <v> of round <n>".

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/** The steps' folders, as the method names them, and the other names a design folder may use. */
const FOLDERS = {
  "mood-board": ["mood", "mood-board", "mood-boards"],
  "palette": ["palette"],
  "typography": ["typography"],
  "icons": ["icons", "icon-set"],
  "widget-shapes": ["shapes", "widget-shapes"],
  "screens": ["screens"],
};

const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const isFile = (p) => existsSync(p) && statSync(p).isFile();
const posix = (p) => p.split(sep).join("/");
const read = (p) => (isFile(p) ? readFileSync(p, "utf8") : "");

/** Where the design record is for an app folder: its folder of steps, and the folder of comparison pages, if any. */
export function designPlace(app) {
  let conf = {};
  try {
    conf = JSON.parse(read(join(app, "stance-ui.json")) || "{}");
  } catch {
    conf = {};
  }
  const d = conf.design;
  const folder = typeof d === "string" ? d : typeof d?.folder === "string" ? d.folder : "design";
  const previews = typeof d?.previews === "string" ? resolve(app, d.previews) : null;
  return { folder: resolve(app, folder), previews };
}

/** The folder the tab's pages are served from: the design folder, or the one that holds it and the previews. */
export function servedRoot(place) {
  if (!place.previews) return place.folder;
  let root = place.folder;
  while (relative(root, place.previews).startsWith("..")) {
    const up = dirname(root);
    if (up === root) break;
    root = up;
  }
  return root;
}

/** The rounds in a folder, by number: round-1, round-2, ... */
function rounds(dir) {
  if (!isDir(dir)) return [];
  return readdirSync(dir)
    .map((n) => ({ n, m: /^round-(\d+)$/.exec(n) }))
    .filter((r) => r.m && isDir(join(dir, r.n)))
    .map((r) => ({ number: Number(r.m[1]), dir: join(dir, r.n) }))
    .sort((a, b) => a.number - b.number);
}

/** The variants of a round: its folders but preview/ and shared/, by name. */
function variants(dir) {
  return readdirSync(dir)
    .filter((n) => !["preview", "shared"].includes(n) && !n.startsWith(".") && isDir(join(dir, n)))
    .sort();
}

/** A round's notes, without their title line: markdown, as the method writes them. */
function notes(dir) {
  const text = read(join(dir, "notes.md"));
  const lines = text.split("\n");
  return (lines[0]?.startsWith("# ") ? lines.slice(1) : lines).join("\n").trim();
}

/** The decisions recorded: each `## ` section of decisions.md, its heading and its body. */
export function decisions(folder) {
  const out = [];
  let cur = null;
  for (const line of read(join(folder, "decisions.md")).split("\n")) {
    if (line.startsWith("## ")) {
      cur = { heading: line.slice(3).trim(), body: [] };
      out.push(cur);
    } else if (cur) cur.body.push(line);
  }
  return out.map((d) => {
    // "<date> <step>: ..." or "<date> screen, <screen>: ..."
    const head = /^(\d{4}-\d{2}-\d{2})\s+([^:]+):\s*(.*)$/.exec(d.heading);
    const what = (head?.[2] ?? "").trim().toLowerCase();
    const screen = /^screens?,\s*(.+)$/.exec(what)?.[1]?.trim() ?? null;
    const step = screen !== null ? "screens" : what.replace(/\s+/g, "-");
    const chosen = /variant\s+([\w.-]+)\s+of\s+round\s+(\d+)/i.exec(d.heading);
    return {
      heading: d.heading,
      text: d.body.join("\n").trim(),
      date: head?.[1] ?? null,
      step,
      screen,
      variant: chosen?.[1] ?? null,
      round: chosen ? Number(chosen[2]) : null,
    };
  });
}

const stepOf = (name, d) =>
  d.step === name || (FOLDERS[name] ?? []).includes(d.step) || d.step.replace(/s$/, "") === name.replace(/s$/, "");

/** A round's comparison page, relative to the served root, or null: its preview/, or the previews folder's. */
function comparison(place, root, round, names) {
  const own = join(round.dir, "preview", "index.html");
  if (isFile(own)) return posix(relative(root, own));
  if (!place.previews) return null;
  for (const n of names) {
    const candidates = [`${n}-r${round.number}`, ...(round.number === 1 ? [n] : [])];
    for (const c of candidates) {
      const p = join(place.previews, c, "index.html");
      if (isFile(p)) return posix(relative(root, p));
    }
  }
  return null;
}

/**
 * One step of the record: its rounds (for the screens step, each screen's), each with its variants, notes, the frames
 * to show and the variant chosen in it; and the decisions recorded for it.
 */
export function readStep(place, step) {
  const root = servedRoot(place);
  const names = FOLDERS[step] ?? [step];
  const dir = names.map((n) => join(place.folder, n)).find(isDir) ?? null;
  const recorded = decisions(place.folder).filter((d) => stepOf(step, d));
  const groups = !dir
    ? []
    : step === "screens"
    ? readdirSync(dir).filter((s) => isDir(join(dir, s))).sort().map((s) => ({
      screen: s,
      dir: join(dir, s),
      names: [`screens-${s}`],
    }))
    : [{ screen: null, dir, names }];
  const out = [];
  for (const g of groups) {
    for (const r of rounds(g.dir)) {
      const decision = recorded.find((d) => d.round === r.number && (g.screen === null || d.screen === g.screen)) ??
        null;
      const vs = variants(r.dir);
      const frames = [];
      const page = comparison(place, root, r, g.names);
      if (page) frames.push({ title: "All variants, side by side", src: page });
      for (const v of vs) {
        const own = join(r.dir, v, "index.html");
        if (isFile(own)) {
          frames.push({
            title: v,
            src: posix(relative(root, own)),
            ...(decision?.variant === v ? { chosen: true } : {}),
          });
        }
      }
      out.push({
        screen: g.screen,
        round: r.number,
        variants: vs,
        notes: notes(r.dir),
        chosen: decision?.variant ?? null,
        frames,
      });
    }
  }
  return { step, rounds: out, decisions: recorded };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** The tab's content for a step: a gallery of its rounds, the decision recorded as its lead. */
export function stepContent(place, step, title) {
  const s = readStep(place, step);
  const lead = s.decisions.length
    ? s.decisions.map((d) => `**Decided: ${d.heading}**\n\n${d.text}`).join("\n\n")
    : `Not decided yet. ${s.rounds.length ? "" : `No round of ${title.toLowerCase()} in the design folder yet.`}`
      .trim();
  return {
    component: "gallery",
    lead,
    data: {
      sections: s.rounds.map((r) => ({
        title: `${r.screen ? `${cap(r.screen)}, round` : "Round"} ${r.round}${
          r.chosen ? `: variant ${r.chosen} chosen` : ""
        }`,
        text: [
          `Variants: ${
            r.variants.length ? r.variants.map((v) => (v === r.chosen ? `**${v}** (chosen)` : v)).join(", ") : "none"
          }.`,
          r.notes,
          r.frames.length
            ? ""
            : "No comparison page in the round: `deno task variants --from <round>` writes one in its preview/ folder.",
        ].filter(Boolean).join("\n\n"),
        frames: r.frames,
      })),
    },
  };
}

/** The design tab, for the steps of the method (`methods[0].steps` of naima-plugin.json) and the app's folder. */
export function designTab({ steps, app }) {
  return {
    name: "design",
    title: "Design",
    says:
      "the app's design record, as the UI stance's design method leaves it: for each step (mood board, palette, typography, icons, widget shapes, screens) its rounds as framed pages, the variant chosen and the decision recorded",
    order: 30,
    subtabs: steps.map((s) => ({ name: s.name, title: s.title, says: s.exit })),
    files: (ctx) => {
      const place = designPlace(app(ctx));
      return isDir(place.folder) ? servedRoot(place) : null;
    },
    render: ({ sub }, ctx) => {
      const step = steps.find((s) => s.name === sub) ?? steps[0];
      return stepContent(designPlace(app(ctx)), step.name, step.title);
    },
  };
}
