<!-- The display: the quieter expression line, and under it the number in large light numerals, which step down a
     size as the number grows so that twelve digits always fit. Each key entered into an operand lifts the number
     in for a moment, even when it shows what it showed before (the second 3 of 3 + 3); with reduced motion the
     durations are zero and the expression line alone says that a new operand began. Screen readers hear `spoken`,
     announced again at every entry, since the lines they see may not change. -->
<script lang="ts">
  import { useStore } from "../../src/lib/store/store.svelte.ts";
  import type { AppStore } from "./app.svelte.ts";

  const { calculator } = useStore<AppStore>();
  const view = calculator.view;
  const size = $derived(view.display.length > 13 ? "sm" : view.display.length > 9 ? "md" : "lg");
</script>

<output class="display" aria-live="polite" aria-atomic="true">
  <span class="expression" aria-hidden="true">{view.expression || " "}</span>
  <span class="value {size}" class:fault={view.fault !== null} aria-hidden="true">
    {#key view.entry}<span class="digits" class:cue={view.entry > 0}>{view.display}</span>{/key}
  </span>
  {#key view.entry}<span class="spoken">{view.spoken}</span>{/key}
</output>

<style>
  .display {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-xs);
    padding: var(--space-xl) var(--space-sm) var(--space-xs);
    overflow: hidden;
  }
  .expression {
    min-height: var(--font-size-md);
    color: var(--color-text-muted);
    font-size: var(--font-size-md);
    font-variant-numeric: tabular-nums;
    letter-spacing: var(--font-letter-spacing-label);
    line-height: var(--font-line-height-normal);
    white-space: nowrap;
  }
  .value {
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    height: calc(var(--font-size-display) * var(--font-line-height-tight));
    color: var(--color-text);
    font-weight: var(--font-weight-light);
    font-variant-numeric: tabular-nums;
    letter-spacing: var(--font-letter-spacing-display);
    line-height: var(--font-line-height-tight);
    white-space: nowrap;
    transition: font-size var(--motion-duration-normal) var(--motion-easing-standard);
  }
  .lg {
    font-size: var(--font-size-display);
  }
  .md {
    font-size: var(--font-size-display-md);
  }
  .sm {
    font-size: var(--font-size-display-sm);
  }
  .cue {
    animation: entry var(--motion-duration-normal) var(--motion-easing-standard);
  }
  @keyframes entry {
    from {
      opacity: 0.35;
      transform: translateY(12%);
    }
  }
  .spoken {
    position: absolute;
    width: var(--border-width-thin);
    height: var(--border-width-thin);
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .fault {
    color: var(--color-text-muted);
    font-size: var(--font-size-display-sm);
  }
</style>
