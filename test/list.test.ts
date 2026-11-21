// The one list's plain parts (src/lib/components/list/): search, filters with their counts, sort, groups and folds,
// the columns, the cursor as models/list/list.mcrl2 moves it (its properties checked again on random walks), and rows
// that are not all of one kind grouped under their headings.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  afterChange,
  afterClose,
  type Column,
  EMPTY_VIEW,
  facetChips,
  filterItems,
  listModel,
  type ListSpec,
  type ListView,
  move,
  placeId,
  readView,
  regroup,
  rowId,
  searchItems,
  sideways,
  sortBy,
  sortItems,
  toggleColumn,
  toggleFilter,
  toggleFold,
} from "../src/lib/components/list/list.ts";
import { listRows, rowSpec } from "../src/lib/components/list/rows.ts";

interface Bug {
  key: string;
  title: string;
  age: number | null;
  pri: string;
  tags: string[];
}
const bugs: Bug[] = [
  { key: "a", title: "Alpha crashes", age: 3, pri: "now", tags: ["ui"] },
  { key: "b", title: "Beta slow", age: 10, pri: "next", tags: ["cli"] },
  { key: "c", title: "Gamma crashes", age: null, pri: "now", tags: ["ui", "cli"] },
  { key: "d", title: "Delta wrong", age: 1, pri: "", tags: [] },
];
const cols: Column<Bug>[] = [
  { id: "title", label: "Title", value: (b) => b.title, width: "grow", column: true },
  { id: "age", label: "Age", value: (b) => b.age, descFirst: true, column: true },
  { id: "pri", label: "Priority", value: (b) => b.pri },
  { id: "tags", label: "Tags", value: (b) => b.tags.join(", "), optional: true },
];
const spec: ListSpec<Bug> = {
  key: (b) => b.key,
  columns: cols,
  facets: [
    { id: "pri", label: "Priority", values: (b) => [b.pri || "none"], order: ["now", "next", "none"] },
    { id: "tag", label: "Tag", values: (b) => b.tags },
  ],
  groupings: [{
    id: "pri",
    label: "Priority",
    group: (b) => ({ key: b.pri, title: b.pri || "Not triaged", rank: b.pri === "now" ? 0 : b.pri === "next" ? 1 : 2 }),
  }],
};
const keys = (xs: readonly Bug[]) => xs.map((b) => b.key);

test("search keeps the items holding every word, in any column or facet", () => {
  assert.deepEqual(keys(searchItems(bugs, spec, "crashes")), ["a", "c"]);
  assert.deepEqual(keys(searchItems(bugs, spec, "CRASHES gamma")), ["c"]);
  assert.deepEqual(keys(searchItems(bugs, spec, "cli")), ["b", "c"]);
  assert.deepEqual(keys(searchItems(bugs, spec, "  ")), ["a", "b", "c", "d"]);
});

test("filters: any value within a facet, every facet at once; counts leave the facet's own filter out", () => {
  assert.deepEqual(keys(filterItems(bugs, spec, { pri: ["now", "next"] })), ["a", "b", "c"]);
  assert.deepEqual(keys(filterItems(bugs, spec, { pri: ["now"], tag: ["cli"] })), ["c"]);
  const chips = facetChips(bugs, spec, { pri: ["now"] });
  // The priority's own counts ignore its filter; the tags are counted among the bugs to fix now.
  assert.deepEqual(chips[0]!.chips.map((c) => [c.value, c.count, c.on]), [["now", 2, true], ["next", 1, false], [
    "none",
    1,
    false,
  ]]);
  assert.deepEqual(chips[1]!.chips.map((c) => [c.value, c.count]), [["ui", 2], ["cli", 1]]);
  // A value chosen that no item has stays, at zero, to be taken off.
  assert.ok(facetChips([], spec, { tag: ["gone"] })[1]!.chips.some((c) => c.value === "gone" && c.count === 0 && c.on));
  const v = toggleFilter(toggleFilter(EMPTY_VIEW, "tag", "ui"), "tag", "ui");
  assert.deepEqual(v.filters, {});
});

test("sort by any column, stable, empty values last either way; a third press goes back to the order given", () => {
  assert.deepEqual(keys(sortItems(bugs, cols[1], false)), ["d", "a", "b", "c"]);
  assert.deepEqual(keys(sortItems(bugs, cols[1], true)), ["b", "a", "d", "c"]);
  assert.deepEqual(keys(sortItems(bugs, cols[2], false)), ["b", "a", "c", "d"]);
  let v = sortBy(EMPTY_VIEW, cols[1]!);
  assert.deepEqual([v.sort, v.desc], ["age", true]);
  v = sortBy(v, cols[1]!);
  assert.deepEqual([v.sort, v.desc], ["age", false]);
  v = sortBy(v, cols[1]!);
  assert.deepEqual([v.sort, v.desc], [null, false]);
});

test("groups by rank with their counts; a folded group draws its heading only; another grouping unfolds all", () => {
  let v: ListView = { ...EMPTY_VIEW, group: "pri" };
  let m = listModel(bugs, spec, v);
  assert.deepEqual(m.groups.map((g) => [g.key, g.count]), [["now", 2], ["next", 1], ["", 1]]);
  assert.deepEqual(m.places.map(placeId), ["h:now", "r:a", "r:c", "h:next", "r:b", "h:", "r:d"]);
  v = toggleFold(v, "now");
  m = listModel(bugs, spec, v);
  assert.deepEqual(m.places.map(placeId), ["h:now", "h:next", "r:b", "h:", "r:d"]);
  assert.equal(m.groups[0]!.count, 2);
  assert.deepEqual(regroup(v, "pri").folded, []);
});

test("columns: the optional hidden until shown, the title never hidden", () => {
  assert.deepEqual(listModel(bugs, spec, EMPTY_VIEW).columns.map((c) => c.id), ["title", "age", "pri"]);
  assert.deepEqual(
    listModel(bugs, spec, toggleColumn(toggleColumn(EMPTY_VIEW, "tags"), "age")).columns.map((c) => c.id),
    ["title", "pri", "tags"],
  );
  assert.deepEqual(listModel(bugs, spec, toggleColumn(EMPTY_VIEW, "title")).columns.map((c) => c.id), [
    "title",
    "age",
    "pri",
  ]);
});

test("the cursor: arrows over headings and rows, over rows only beside an item, staying at either end", () => {
  const m = listModel(bugs, spec, { ...EMPTY_VIEW, group: "pri" });
  assert.equal(move(m.places, null, "j", false), "h:now");
  assert.equal(move(m.places, "h:now", "ArrowDown", false), "r:a");
  assert.equal(move(m.places, "r:c", "ArrowDown", false), "h:next");
  assert.equal(move(m.places, "r:c", "ArrowDown", true), "r:b");
  assert.equal(move(m.places, "r:d", "j", false), "r:d");
  assert.equal(move(m.places, "r:a", "k", true), "r:a");
  assert.equal(move(m.places, null, "End", true), "r:d");
  assert.equal(move(m.places, "r:b", "Home", false), "h:now");
});

test("left goes up to the heading and folds it; right unfolds", () => {
  const v = { ...EMPTY_VIEW, group: "pri" };
  const m = listModel(bugs, spec, v);
  assert.deepEqual(sideways(m, "r:c", "ArrowLeft"), { cursor: "h:now" });
  assert.deepEqual(sideways(m, "h:now", "ArrowLeft"), { fold: "now" });
  assert.equal(sideways(m, "h:now", "ArrowRight"), null);
  const f = listModel(bugs, spec, toggleFold(v, "now"));
  assert.deepEqual(sideways(f, "h:now", "ArrowRight"), { fold: "now" });
  assert.equal(sideways(listModel(bugs, spec, EMPTY_VIEW), "r:a", "ArrowLeft"), null);
});

test("after a change the cursor stays on what it was on, or the item open; closing goes back to its row or heading", () => {
  const v = { ...EMPTY_VIEW, group: "pri" };
  const m = listModel(bugs, spec, { ...v, search: "crashes" });
  assert.equal(afterChange(m.places, "r:b", null), null);
  assert.equal(afterChange(m.places, "r:c", null), "r:c");
  assert.equal(afterChange(m.places, "r:a", "c"), "r:c");
  assert.equal(afterChange(m.places, "h:now", "c"), "h:now");
  assert.equal(afterChange(m.places, "r:a", "b"), null);
  assert.equal(afterClose(listModel(bugs, spec, toggleFold(v, "now")), "a"), "h:now");
  assert.equal(afterClose(listModel(bugs, spec, v), "a"), "r:a");
  assert.equal(afterClose(listModel(bugs, spec, { ...v, filters: { pri: ["next"] } }), "a"), null);
});

// The model's properties, again on the code: random walks of every gesture, checking after each that the cursor is on
// something drawn (cursor-never-hidden) and that beside an item it is on the item's row or a heading
// (column-cursor-is-the-open-item).
test("random walks keep the model's properties", () => {
  let seed = 7;
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed % n;
  };
  const gestures = [
    "j",
    "k",
    "Home",
    "End",
    "Enter",
    "ArrowLeft",
    "ArrowRight",
    "Escape",
    "search",
    "filter",
    "regroup",
    "click",
  ];
  for (let walk = 0; walk < 200; walk++) {
    let v: ListView = { ...EMPTY_VIEW, group: "pri" };
    let put: string | null = null;
    let open: string | null = null;
    for (let step = 0; step < 40; step++) {
      let m = listModel(bugs, spec, v);
      let cursor = afterChange(m.places, put, open);
      const g = gestures[rnd(gestures.length)]!;
      const column = open !== null;
      if (["j", "k", "Home", "End"].includes(g)) {
        put = move(m.places, cursor, g, column);
        if (column && put?.startsWith("r:")) open = put.slice(2);
      } else if (g === "Enter" && cursor) {
        put = cursor;
        if (cursor.startsWith("r:")) open = cursor.slice(2);
        else v = toggleFold(v, cursor.slice(2));
      } else if (g === "ArrowLeft" || g === "ArrowRight") {
        const did = sideways(m, cursor, g);
        if (did && "cursor" in did) put = did.cursor;
        else if (did) v = toggleFold(v, did.fold);
      } else if (g === "Escape" && open !== null) {
        put = afterClose(m, open);
        open = null;
      } else if (g === "search") v = { ...v, search: ["", "crashes", "beta", "zzz"][rnd(4)]! };
      else if (g === "filter") v = toggleFilter(v, "tag", ["ui", "cli"][rnd(2)]!);
      else if (g === "regroup") v = regroup(v, ["", "pri"][rnd(2)]!);
      else if (g === "click" && m.places.length) {
        const p = m.places[rnd(m.places.length)]!;
        put = placeId(p);
        if (p.kind === "row") open = p.key;
        else v = toggleFold(v, p.group);
      }
      m = listModel(bugs, spec, v);
      cursor = afterChange(m.places, put, open);
      assert.ok(cursor === null || m.places.some((p) => placeId(p) === cursor), `cursor ${cursor} drawn`);
      if (open !== null && cursor?.startsWith("r:")) assert.equal(cursor, rowId(open));
    }
  }
});

test("a view read back keeps what is a view and drops the rest", () => {
  assert.deepEqual(readView(null), EMPTY_VIEW);
  assert.deepEqual(
    readView({
      search: "x",
      sort: "age",
      desc: true,
      group: "pri",
      filters: { tag: ["ui", 3], pri: [] },
      folded: ["now"],
      toggled: 4,
    }),
    {
      search: "x",
      sort: "age",
      desc: true,
      group: "pri",
      filters: { tag: ["ui"] },
      folded: ["now"],
      toggled: [],
    },
  );
});

test("rows that are not all items (commits, what lies ahead) group under their headings, in order", () => {
  const rows = listRows([
    { key: "x", text: "One", aside: "9:00", mark: "commit", head: "Morning" },
    { key: "y", text: "Two", aside: "9:30", mark: "commit" },
    { key: "z", text: "Three", aside: "14:00", mark: "commit", head: "Afternoon", who: "ux" },
  ]);
  const m = listModel(rows, rowSpec(), { ...EMPTY_VIEW, group: "head" });
  assert.deepEqual(m.groups.map((g) => [g.title, g.items.map((r) => r.key)]), [["Morning", ["x", "y"]], ["Afternoon", [
    "z",
  ]]]);
  assert.deepEqual(
    listModel(rows, rowSpec(), { ...EMPTY_VIEW, sort: "aside", desc: true }).groups[0]!.items.map((r) => r.key),
    ["z", "y", "x"],
  );
});
