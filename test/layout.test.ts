import { assert, assertEquals } from "@std/assert";
import { checkLayout, layoutFile } from "../checks/layout.ts";

const problems = (file: string, source: string) =>
  checkLayout(file, source).filter((f) => f.level === "problem").map((f) => `${f.line}: ${f.message}`);
const notes = (file: string, source: string) => checkLayout(file, source).filter((f) => f.level === "note");

Deno.test("a script that writes a layout property of a style is refused, in a component and in a module", () => {
  const svelte = `<script lang="ts">
  let el: HTMLElement;
  function place(x: number) {
    el.style.left = x + "px";
    el.style.minHeight = "10px";
    el.style.setProperty("width", "3px");
    el.style.cssText = "top: 0";
    Object.assign(el.style, { top: "1px" });
    el.style.color = "red"; // not layout: the literals check's
  }
</script>
<div bind:this={el}></div>`;
  const found = problems("src/A.svelte", svelte);
  assertEquals(found.length, 5, found.join("\n"));
  assert(found[0]!.startsWith("4: writes style.left in script"));
  assert(found.some((f) => f.startsWith("6: sets width on a style")));
  const module = `export function size(el: HTMLElement, h: number) {\n  el.style.height = \`\${h}px\`\n}\n`;
  const m = problems("src/lib/size.ts", module);
  assertEquals(m, ["2: writes style.height in script: place and size it with CSS (flex, grid, inset), not a script"]);
});

Deno.test("a measured size that reaches a style directive, a style attribute or an svg's box is refused", () => {
  const src = `<script lang="ts">
  let box: HTMLElement;
  let h = $state(0);
  let w = $state(0);
  const top = $derived(Math.round(h / 2));
  function measure() {
    const r = box.getBoundingClientRect();
    h = r.height - 12;
  }
</script>
<div bind:this={box} bind:clientWidth={w} style:height="{h}px" style:--top={top}></div>
<p style="margin-left: {w / 3}px">x</p>
<svg width={w} viewBox="0 0 {w} 100"><circle cx={w / 2} cy="50" r="4" /></svg>`;
  const found = problems("src/B.svelte", src);
  assertEquals(found.length, 5, found.join("\n"));
  assert(found.some((f) => f.includes("style:height is set from a measured size (getBoundingClientRect())")));
  assert(found.some((f) => f.includes("style:--top is set from a measured size")));
  assert(found.some((f) => f.includes("a style attribute is computed from a measured size (bind:clientWidth)")));
  assert(found.some((f) => f.includes("the <svg>'s width is a measured size")));
  assert(found.some((f) => f.includes("the <svg>'s viewBox is a measured size")));
  // The circle's cx is the drawing's own coordinate: allowed.
  assert(!found.some((f) => f.includes("cx")));
});

Deno.test("a ResizeObserver whose callback feeds the layout is refused, through the state it sets", () => {
  const src = `<script lang="ts">
  let side = $state(0);
  let el: HTMLElement;
  $effect(() => {
    const ro = new ResizeObserver((entries) => {
      side = entries[0]!.contentRect.width;
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
</script>
<div bind:this={el}><aside style:width="{side}px"></aside></div>`;
  assertEquals(problems("src/C.svelte", src).length, 1);
  const named = src.replace(
    "(entries) => {\n      side = entries[0]!.contentRect.width;",
    "([e]) => {\n      side = e!.target.scrollTop;",
  );
  assertEquals(problems("src/C.svelte", named).length, 1, "an entry destructured is a measurement too");
});

Deno.test("a pointer's travel during a drag, scrolling, drawings and measurements kept out of the layout are allowed", () => {
  const src = `<script lang="ts">
  import Draggable from "./Draggable.svelte";
  let share = $state(0.5);
  let box: HTMLElement;
  let wide = $state(0);
  let start = 0;
  function down(e: PointerEvent) {
    start = e.clientX;
  }
  function move(e: PointerEvent) {
    const w = box.getBoundingClientRect().width;
    share = Math.min(1, Math.max(0, share + (e.clientX - start) / w));
  }
  const travel = (dx: number) => {
    share = share + dx / box.clientWidth;
  };
  const label = $derived(format(box?.clientWidth));
  function format(n: number) {
    return String(n);
  }
  $effect(() => box.scrollTo({ left: box.clientWidth / 2 }));
  $effect(() => box.querySelector(".now")?.scrollIntoView({ block: "nearest" }));
</script>
<div bind:this={box} bind:clientWidth={wide} onpointerdown={down} onpointermove={move}>
  <div class="side" style:flex-grow={share} style:--share={share}></div>
  <Draggable label="the edge" moves={["left", "right"]} onmove={() => {}} ontravel={travel} />
  <svg viewBox="0 0 100 10" preserveAspectRatio="none"><rect x={wide / 10} width="5" height="10" /></svg>
  <span>{label}</span>
</div>`;
  assertEquals(problems("src/D.svelte", src), []);
});

Deno.test("a style written while a pointer drags is a note, not a problem", () => {
  const src = `<script lang="ts">
  let ghost: HTMLElement;
  function follow(e: PointerEvent) {
    ghost.style.translate = \`\${e.clientX}px \${e.clientY}px\`;
  }
</script>
<div bind:this={ghost} onpointermove={follow}></div>`;
  assertEquals(problems("src/E.svelte", src), []);
  assertEquals(notes("src/E.svelte", src).length, 1);
});

Deno.test("a style written on an element of a drawing is the drawing's coordinate, and allowed", () => {
  const src = `<script lang="ts">
  let head: SVGGElement | undefined = $state();
  let svg: SVGSVGElement | undefined = $state();
  let mark: SVGLineElement | undefined = $state();
  function draw(x: number) {
    if (head) head.style.transform = \`translate(\${x}px, 0px)\`;
    if (mark) mark.style.translate = \`\${x}px 0\`;
    for (const g of svg!.querySelectorAll<SVGElement>(".stick")) g.style.transform = "translateY(4px)";
  }
</script>
<svg bind:this={svg} viewBox="0 0 100 10"><g bind:this={head}></g><line bind:this={mark} /></svg>`;
  assertEquals(problems("src/F.svelte", src), []);
  // The <svg> itself is a box of the page: its style is layout.
  const box = src.replace("if (head) head.style", "if (svg) svg.style");
  assertEquals(problems("src/F.svelte", box).length, 1);
});

Deno.test("the check reads components and script modules, not tests or declarations", () => {
  assert(layoutFile("src/App.svelte"));
  assert(layoutFile("src/app.svelte.ts"));
  assert(layoutFile("src/lib/zoom.js"));
  assert(!layoutFile("src/lib/zoom.test.ts"));
  assert(!layoutFile("src/types.d.ts"));
  assert(!layoutFile("src/app.css"));
  assertEquals(notes("src/Bad.svelte", "<script>let = ;</script>").length, 1);
});

Deno.test("a pannable's vertical zoom drag reports a travel too, and a style it drives is the drag's", () => {
  const src = `<script lang="ts">
  let river: HTMLElement | undefined = $state();
  let live = { a: 1 };
  const zoom = (dy: number, clientX: number) => {
    const w = river!.getBoundingClientRect().width;
    live = { a: live.a * Math.exp(-dy / w) + clientX * 0 };
    river!.style.setProperty("--za", String(live.a));
  };
</script>
<div bind:this={river}><Pannable onzoomdrag={zoom} /></div>`;
  assertEquals(problems("src/F.svelte", src), []);
});
