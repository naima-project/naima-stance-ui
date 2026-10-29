<!-- The example's root: the page, the calculator in the middle of it, the theme switch under it, and where the
     app runs, as the platform port said. It only lays things out, and passes the theme machine's choice to the
     switch. -->
<script lang="ts">
  import ThemeSwitch from "../../src/lib/components/ThemeSwitch.svelte";
  import { useStore } from "../../src/lib/store/store.svelte.ts";
  import type { AppStore } from "./app.svelte.ts";
  import Calculator from "./Calculator.svelte";

  const { theme, host } = useStore<AppStore>();
</script>

<main>
  <Calculator />
  <ThemeSwitch value={theme.view.choice} onchange={(c) => theme.choose(c)} />
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
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-xl);
    min-height: 100vh;
    min-height: 100dvh;
    padding: var(--space-lg);
    box-sizing: border-box;
  }
  .host {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
    letter-spacing: var(--font-letter-spacing-label);
  }
</style>
