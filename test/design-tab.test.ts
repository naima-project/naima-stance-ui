// The design tab the stance adds to Naima's new UI (plugin/design.mjs): one subtab per step of the design method, and
// for each step, from a fixture design folder, its rounds in order with their variants, the frames to show (the
// comparison page, in the round's preview/ or in the previews folder stance-ui.json names, and a screen's prototypes),
// the variant chosen and the decision recorded.

import { assert, assertEquals } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import stanceUi from "../plugin/index.mjs";
import { decisions, designPlace, servedRoot } from "../plugin/design.mjs";

// deno-lint-ignore no-explicit-any
type Any = any;

const APP = fromFileUrl(new URL("./fixtures/design-tab/", import.meta.url)).replace(/[\\/]$/, "");
const ctx: Any = { root: APP };

function tab(): Any {
  const m: Any = stanceUi({ app: "." }, { plugin: "stance-ui" });
  const [t] = m.contributes["ui-tabs"];
  return t;
}

Deno.test("the design tab lists the six steps of the method as its subtabs, and serves the folder that holds the record and its previews", () => {
  const t = tab();
  assertEquals(t.name, "design");
  assertEquals(t.subtabs.map((s: Any) => s.name), ["mood-board", "palette", "typography", "icons", "widget-shapes", "screens"]);
  assertEquals(t.subtabs.map((s: Any) => s.title), ["Mood board", "Palette", "Typography", "Icons", "Widget shapes", "Screens"]);
  assertEquals(t.files(ctx), join(APP, "record"));
  const place = designPlace(APP);
  assertEquals(place, { folder: join(APP, "record", "design", "app"), previews: join(APP, "record", "preview") });
  assertEquals(servedRoot({ folder: place.folder, previews: null }), place.folder);
  // a project with no design folder: no folder to serve, and every step says nothing is decided yet
  const empty: Any = { root: fromFileUrl(new URL("./fixtures/clean/", import.meta.url)) };
  assertEquals(t.files(empty), null);
  const c = t.render({ sub: "palette", query: {} }, empty);
  assertEquals(c.data.sections, []);
  assert(c.lead.startsWith("Not decided yet."));
});

Deno.test("each step shows its rounds with their frames, the variant chosen and the decision recorded", () => {
  const t = tab();
  const show = (sub: string) => t.render({ sub, query: {} }, ctx);

  const mood = show("mood-board");
  assertEquals(mood.component, "gallery");
  assertEquals(mood.data.sections.map((s: Any) => s.title), ["Round 1", "Round 2: variant b chosen"]);
  assertEquals(mood.data.sections.map((s: Any) => s.frames.map((f: Any) => f.src)), [
    ["preview/mood-boards/index.html"],
    ["preview/mood-boards-r2/index.html"],
  ]);
  assert(mood.data.sections[1].text.startsWith("Variants: a, **b** (chosen)."));
  assert(mood.data.sections[1].text.includes("- b: frost"), "the round's notes");
  assert(mood.lead.startsWith("**Decided: 2026-11-01 mood board: Frost (variant b of round 2)**"));

  const palette = show("palette");
  assertEquals(palette.data.sections[0].frames, [{
    title: "All variants, side by side",
    src: "design/app/palette/round-1/preview/index.html",
  }]);
  assertEquals(palette.data.sections[0].title, "Round 1: variant a chosen");

  const typography = show("typography");
  assertEquals(typography.data.sections[0].frames[0].src, "preview/typography-r1/index.html");

  const shapes = show("widget-shapes");
  assertEquals(shapes.data.sections.length, 1);
  assertEquals(shapes.data.sections[0].frames, [], "no comparison page for this round");
  assert(shapes.data.sections[0].text.includes("deno task variants"));
  assert(shapes.lead.includes("widget shapes: Soft"));

  const screens = show("screens");
  assertEquals(screens.data.sections.map((s: Any) => s.title), ["Home, round 1: variant b chosen", "Metrics, round 1"]);
  assertEquals(screens.data.sections[0].frames, [
    { title: "All variants, side by side", src: "preview/screens-home-r1/index.html" },
    { title: "a", src: "design/app/screens/home/round-1/a/index.html" },
    { title: "b", src: "design/app/screens/home/round-1/b/index.html", chosen: true },
  ]);
  assertEquals(screens.data.sections[1].frames.map((f: Any) => f.title), ["a"]);
  assert(screens.lead.includes("screen, home: Column"));
  assert(!screens.lead.includes("palette"));
  // no subtab asked: the first step
  assertEquals(t.render({ sub: null, query: {} }, ctx).lead, mood.lead);
});

Deno.test("decisions.md: each section's step, screen, round and variant", () => {
  const d = decisions(join(APP, "record", "design", "app"));
  assertEquals(d.map((x: Any) => [x.step, x.screen, x.round, x.variant]), [
    ["mood-board", null, 2, "b"],
    ["palette", null, 1, "a"],
    ["typography", null, 1, "b"],
    ["widget-shapes", null, 1, "a"],
    ["screens", "home", 1, "b"],
  ]);
});
