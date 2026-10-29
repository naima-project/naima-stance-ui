<!-- The app's root, mounted with the store in its context (main.ts): it reads the machines' views and calls
     their transitions, and keeps no state of its own. -->
<script lang="ts">
  import Button from "./lib/ui/components/Button.svelte";
  import Cluster from "./lib/ui/components/Cluster.svelte";
  import Stack from "./lib/ui/components/Stack.svelte";
  import Text from "./lib/ui/components/Text.svelte";
  import ThemeSwitch from "./lib/ui/components/ThemeSwitch.svelte";
  import { useStore } from "./lib/ui/store/store.svelte.ts";
  import type { AppStore } from "./app.svelte.ts";

  const { counter, theme } = useStore<AppStore>();
</script>

<main>
  <Stack gap="lg">
    <Text as="h1" size="xl" strong>App</Text>
    <Text live="polite">{counter.view.said}</Text>
    <Cluster>
      <Button variant="primary" disabled={!counter.allowed({ type: "add" })} onclick={() => counter.add()}>
        Add one
      </Button>
      <Button id="reset" disabled={!counter.allowed({ type: "reset" })} onclick={() => counter.reset()}>
        Start over
      </Button>
    </Cluster>
    <ThemeSwitch value={theme.view.choice} onchange={(c) => theme.choose(c)} />
  </Stack>
</main>

<style>
  :global(body) {
    margin: 0;
    background: var(--color-surface-sunken);
    color: var(--color-text);
    font-family: var(--font-family-body);
  }
  main {
    max-width: var(--size-dialog-width);
    margin: 0 auto;
    padding: var(--space-2xl) var(--space-lg);
  }
</style>
