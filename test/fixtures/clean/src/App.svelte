<script lang="ts">
  import { mount } from "svelte";
  import Box from "./lib/ui/components/Box.svelte";
  import { useStore } from "./lib/ui/store/store.svelte.ts";
  import type { Counter } from "./machines/counter.svelte.ts";
  import { type Counter as C2 } from "./machines/counter.svelte.ts";
  const store = useStore();
  let c: Counter | C2 | undefined;
  void mount; void store; void c;
</script>

<Box>hi</Box>
