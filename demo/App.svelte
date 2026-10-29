<!-- The demo's root, mounted with the store in its context (main.ts): it only lays the components out. -->
<script lang="ts">
  import ThemeSwitch from "../src/lib/components/ThemeSwitch.svelte";
  import { useStore } from "../src/lib/store/store.svelte.ts";
  import type { AppStore } from "./app.svelte.ts";
  import TaskList from "./TaskList.svelte";

  const { theme } = useStore<AppStore>();
</script>

<main>
  <TaskList />
  <div class="theme"><ThemeSwitch value={theme.view.choice} onchange={(c) => theme.choose(c)} /></div>
</main>

<style>
  :global(body) {
    margin: 0;
    background: var(--color-surface-sunken);
    color: var(--color-text);
    font-family: var(--font-family-body);
  }
  .theme {
    display: flex;
    justify-content: center;
    margin-top: var(--space-xl);
  }
  main {
    max-width: var(--size-dialog-width);
    margin: 0 auto;
    padding: var(--space-2xl) var(--space-lg);
  }
</style>
