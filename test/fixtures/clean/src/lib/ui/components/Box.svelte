<script lang="ts">
  import type { Snippet } from "svelte";
  import Inner from "./Inner.svelte";
  let { children, wide = false }: { children: Snippet; wide?: boolean } = $props();
</script>

<div class="box" style="padding: var(--space-md)" style:width={wide ? "100%" : "auto"}><Inner />{@render children()}</div>
<svg viewBox="0 0 10 10" fill="currentColor"><rect width="10" height="10" /></svg>

<style>
  .box {
    --local-gap: var(--space-md);
    margin: 0;
    gap: var(--local-gap);
    width: 100%;
    color: var(--color-text);
    border-color: transparent;
    transition: background-color var(--motion-fast) ease;
  }
  @media (min-width: 40em) {
    .box { color: var(--color-accent); }
  }
</style>
