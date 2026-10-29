<!-- The example's root: the page, and the calculator in the middle of it. It only lays things out. -->
<script lang="ts">
  import Calculator from "./Calculator.svelte";
</script>

<main>
  <Calculator />
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
    min-height: 100vh;
    min-height: 100dvh;
    padding: var(--space-lg);
    box-sizing: border-box;
  }
</style>
