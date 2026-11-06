<!-- A box that scrolls sideways, and that the mouse also pans by dragging its body, as a map or a timeline is panned.
     It is the second place in a project where pointer dragging is handled (the no-raw-drag check refuses it
     anywhere but here and in Draggable), and its dragging is only ever a shortcut: the box is always a scrolling
     box, so the wheel, the trackpad, the scrollbar and the keys move it as far as a drag can (WCAG 2.2 SC 2.5.7).

     Only the mouse pans: a touch or a pen scrolls the box natively. A press that travels less than 4 CSS px before
     it is released is a click and reaches what is under it; one that travels further pans, and the click that
     follows its release is swallowed, so a drag never picks anything. A press on an element that matches `ignore`
     (a control with a drag of its own) never pans. The box shows a grab cursor, grabbing while it pans, and selects
     no text. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** What the box shows, as people call it: the box is a region named after it. */
    label: string;
    /** A selector: a press on an element inside it never pans. */
    ignore?: string;
    /** The scrolling box, for its owner to scroll or measure. */
    box?: HTMLDivElement;
    /** The box's width in CSS px, as it measures it. */
    width?: number;
    children: Snippet;
  }

  let { label, ignore, box = $bindable(), width = $bindable(0), children, class: cls = "", ...rest }: Props = $props();

  /** How far a press may travel, in CSS px, and still be a click. */
  const SLOP = 4;
  /** Where the press started and the box's scroll then, while a press lasts: this component's own UI state. */
  let from: { x: number; y: number; left: number; id: number } | null = null;
  let panning = $state(false);
  let swallow = false;

  function onpointerdown(event: PointerEvent) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    if (ignore && (event.target as Element).closest?.(ignore)) return;
    from = { x: event.clientX, y: event.clientY, left: box?.scrollLeft ?? 0, id: event.pointerId };
  }

  function onpointermove(event: PointerEvent) {
    if (!from || event.pointerId !== from.id || !box) return;
    const dx = event.clientX - from.x;
    if (!panning && Math.hypot(dx, event.clientY - from.y) < SLOP) return;
    if (!panning) {
      panning = true;
      box.setPointerCapture(event.pointerId);
    }
    box.scrollLeft = from.left - dx;
  }

  function onpointerup(event: PointerEvent) {
    if (!from || event.pointerId !== from.id) return;
    swallow = panning;
    from = null;
    panning = false;
  }

  function onclickcapture(event: MouseEvent) {
    if (!swallow) return;
    swallow = false;
    event.stopPropagation();
    event.preventDefault();
  }
</script>

<div
  {...rest}
  class="pannable {cls}"
  class:panning
  role="region"
  aria-label={label}
  bind:this={box}
  bind:clientWidth={width}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}
  {onclickcapture}
>
  {@render children()}
</div>

<style>
  .pannable {
    overflow-x: auto;
    min-width: 0;
    max-width: 100%;
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
  }
  .pannable.panning {
    cursor: grabbing;
  }
</style>
