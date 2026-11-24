<!-- The UI's own select: a button showing the choice, and under it a list of options, built on the shared popover helper
     (lib/ui/popover.ts), so it closes on a press outside, on Escape (the focus goes back to the button) and on a second
     click, and only one popover is open at a time. A listbox with options; ArrowUp and ArrowDown move, Home and End jump,
     Enter or Space choose, typing letters finds the option starting with them. What a choice does is the caller's. -->
<script lang="ts">
  import { dismiss, typeahead } from "../popover.ts";

  interface Option {
    value: string;
    label: string;
    disabled?: boolean;
  }

  interface Props {
    value: string;
    options: readonly Option[];
    onchange: (value: string) => void;
    /** The name the control has for a screen reader, and the label shown before the choice when `caption` is set. */
    label: string;
    /** Show the label in front of the choice. */
    caption?: boolean;
    disabled?: boolean;
    align?: "start" | "end";
  }

  let { value, options, onchange, label, caption = false, disabled = false, align = "start" }: Props = $props();
  const id = $props.id();
  let open = $state(false);
  let at = $state(0);
  let typed = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let root: HTMLElement | undefined = $state();
  let list: HTMLElement | undefined = $state();

  const chosen = $derived(options.find((o) => o.value === value));
  const button = () => root?.querySelector<HTMLElement>(":scope > button");

  function show() {
    at = Math.max(0, options.findIndex((o) => o.value === value));
    open = true;
    queueMicrotask(() => list?.focus());
  }
  function close(refocus: boolean) {
    open = false;
    if (refocus) button()?.focus();
  }
  function choose(i: number) {
    const o = options[i];
    if (!o || o.disabled) return;
    close(true);
    if (o.value !== value) onchange(o.value);
  }
  function step(d: number) {
    for (let k = 1; k <= options.length; k++) {
      const i = (at + d * k + options.length * k) % options.length;
      if (!options[i]!.disabled) return (at = i);
    }
  }
  function onlist(e: KeyboardEvent) {
    if (e.key === "ArrowDown") step(1);
    else if (e.key === "ArrowUp") step(-1);
    else if (e.key === "Home") at = 0;
    else if (e.key === "End") at = options.length - 1;
    else if (e.key === "Enter" || e.key === " ") choose(at);
    else if (e.key === "Tab") return close(false);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      typed += e.key;
      clearTimeout(timer);
      timer = setTimeout(() => (typed = ""), 700);
      const i = typeahead(options.map((o) => o.label), typed, at);
      if (i >= 0) at = i;
    } else return;
    e.preventDefault();
  }
  function onbutton(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) show();
    }
  }
</script>

<div class="select" bind:this={root} use:dismiss={{ open, close, trigger: button }}>
  <button
    type="button"
    class="trigger"
    role="combobox"
    aria-label={label}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls="{id}-list"
    {disabled}
    onclick={() => (open ? close(false) : show())}
    onkeydown={onbutton}
  >
    {#if caption}<span class="cap">{label}</span>{/if}
    <span class="value">{chosen?.label ?? ""}</span>
    <span class="caret" aria-hidden="true">▾</span>
  </button>
  {#if open}
    <ul
      class="list"
      class:end={align === "end"}
      id="{id}-list"
      role="listbox"
      tabindex="-1"
      aria-label={label}
      aria-activedescendant="{id}-o{at}"
      bind:this={list}
      onkeydown={onlist}
    >
      {#each options as o, i (o.value)}
        <!-- The options are not focusable: the listbox takes the keys (aria-activedescendant), a click is the pointer's way. -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li
          id="{id}-o{i}"
          role="option"
          aria-selected={o.value === value}
          aria-disabled={o.disabled || undefined}
          class:active={i === at}
          onpointerenter={() => (at = i)}
          onclick={() => choose(i)}
        >
          {o.label}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .select {
    position: relative;
    display: inline-block;
  }
  .trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    min-block-size: max(var(--size-control), var(--size-touch));
    padding-inline: var(--space-sm);
    border: var(--border-width-thin) solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--font-size-sm);
    cursor: pointer;
  }
  .trigger:disabled {
    color: var(--color-text-muted);
    cursor: not-allowed;
  }
  .trigger:focus-visible,
  .list:focus-visible {
    outline: var(--border-width-focus) solid var(--color-focus);
    outline-offset: var(--border-width-focus);
  }
  .cap {
    color: var(--color-text-muted);
  }
  .list {
    position: absolute;
    z-index: 6;
    inset-inline-start: 0;
    margin: var(--space-xs) 0 0;
    padding: var(--space-xs);
    min-inline-size: 100%;
    max-block-size: 50dvh;
    overflow-y: auto;
    list-style: none;
    border: var(--border-width-thin) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-raised);
    box-shadow: var(--shadow-overlay);
    white-space: nowrap;
  }
  .end {
    inset-inline-start: auto;
    inset-inline-end: 0;
  }
  [role="option"] {
    padding: var(--space-sm) var(--space-md);
    min-block-size: var(--size-touch);
    display: flex;
    align-items: center;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-md);
    cursor: pointer;
  }
  [role="option"].active {
    background: var(--color-surface-sunken);
  }
  [role="option"][aria-selected="true"] {
    font-weight: var(--font-weight-strong);
  }
  [aria-disabled="true"] {
    color: var(--color-text-muted);
    cursor: not-allowed;
  }
  @media (forced-colors: active) {
    [role="option"].active {
      outline: var(--border-width-focus) solid Highlight;
    }
  }
</style>
