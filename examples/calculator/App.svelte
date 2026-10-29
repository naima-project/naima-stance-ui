<!-- The example's root: the page, the calculator in the middle of it, and under it where the app runs, as
     the platform port said. It only lays things out. -->
<script lang="ts">
  import { useStore } from "../../src/lib/store/store.svelte.ts";
  import type { AppStore } from "./app.svelte.ts";
  import Calculator from "./Calculator.svelte";

  const { host } = useStore<AppStore>();
</script>

<main>
  <Calculator />
  <p class="host">{host.view.label || " "}</p>
</main>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    background: var(--color-surface);
    color: var(--color-text);
    font-family: var(--font-family-body);
    -webkit-font-smoothing: antialiased;
  }
  main {
    display: grid;
    place-items: center;
    align-content: center;
    min-height: 100vh;
    min-height: 100dvh;
    padding: var(--space-lg);
    box-sizing: border-box;
  }
  .host {
    margin: var(--space-md) 0 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
    letter-spacing: var(--font-letter-spacing-label);
  }
</style>
