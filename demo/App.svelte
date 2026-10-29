<!-- The demo's root, mounted with the store in its context (main.ts): it only lays the components out. -->
<script lang="ts">
  import TaskList from "./TaskList.svelte";
</script>

<main>
  <TaskList />
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
