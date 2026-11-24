<!-- A button that opens a panel under it. The behaviour is the one shared popover helper's (lib/ui/popover.ts): it closes
     on a press outside, on Escape (the focus goes back to the button) and on a second click on the button, and opening
     it closes any other open popover. Whether it is open is this component's own state. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import Button from "./Button.svelte";
  import { dismiss } from "../popover.ts";
  import { anchor } from "../anchor.ts";
  import "../anchor.css";

  interface Props {
    label: string;
    children: Snippet;
    variant?: "primary" | "secondary" | "ghost";
    align?: "start" | "end";
    side?: "below" | "above";
    open?: boolean;
  }

  let { label, children, variant = "secondary", align = "start", side = "below", open = $bindable(false) }: Props = $props();
  const id = $props.id();
  let root: HTMLElement | undefined = $state();
  const button = () => root?.querySelector<HTMLElement>(":scope > button");
</script>

<div class="popover" bind:this={root} use:dismiss={{ open, close: () => (open = false), trigger: button }}>
  <Button {variant} aria-haspopup="true" aria-expanded={open} aria-controls="{id}-panel" onclick={() => (open = !open)}>
    {label}
    <span class="caret" aria-hidden="true">▾</span>
  </Button>
  {#if open}
    <div class="panel" class:end={align === "end"} class:above={side === "above"} id="{id}-panel" role="group" aria-label={label} use:anchor={{ to: root, align, side }}>
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .popover {
    position: relative;
    display: inline-block;
  }
  .caret {
    font-size: var(--font-size-sm);
  }
  .panel {
    position: absolute;
    z-index: 5;
    inset-inline-start: 0;
    margin: var(--space-xs) 0 0;
    padding: var(--space-sm);
    min-inline-size: var(--size-dropdown-width);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    border: var(--border-width-thin) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-raised);
    box-shadow: var(--shadow-overlay);
  }
  .above {
    bottom: 100%;
    margin: 0 0 var(--space-xs);
  }
  .end {
    inset-inline-start: auto;
    inset-inline-end: 0;
  }
</style>
