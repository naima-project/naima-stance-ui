<!-- The example's root: the page, the calculator in the middle of it, and the theme switch under it. It only
     lays things out, and passes the theme machine's choice to the switch. -->
<script lang="ts">
  import ThemeSwitch from "../../src/lib/components/ThemeSwitch.svelte";
  import { useStore } from "../../src/lib/store/store.svelte.ts";
  import type { AppStore } from "./app.svelte.ts";
  import Calculator from "./Calculator.svelte";

  const { theme } = useStore<AppStore>();
</script>

<main>
  <Calculator />
  <ThemeSwitch value={theme.view.choice} onchange={(c) => theme.choose(c)} />
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
</style>
