<!-- The calculator: the display over the keypad, on one raised panel. The keyboard presses the same keys:
     the machine says which key a keyboard key is, and the panel echoes it on screen for a moment. -->
<script lang="ts">
  import { useStore } from "../../src/lib/store/store.svelte.ts";
  import type { AppStore } from "./app.svelte.ts";
  import Display from "./Display.svelte";
  import Keypad from "./Keypad.svelte";

  const { calculator } = useStore<AppStore>();
  let echo: string | null = $state(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function onkeydown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const id = calculator.keyboard(e.key);
    if (id === null) return;
    e.preventDefault();
    echo = id;
    clearTimeout(timer);
    timer = setTimeout(() => (echo = null), 120);
  }
</script>

<svelte:window {onkeydown} />

<section class="panel" aria-label="Calculator">
  <Display />
  <Keypad {echo} />
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
    width: 100%;
    max-width: var(--size-panel-width);
    padding: var(--space-xl);
    box-sizing: border-box;
    border-radius: var(--radius-xl);
    background: var(--color-surface-raised);
    box-shadow: var(--shadow-panel);
  }
</style>
