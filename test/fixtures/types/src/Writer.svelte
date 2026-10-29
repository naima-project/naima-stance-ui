<script lang="ts">
  import { useStore } from "../../../../src/lib/store/store.svelte.ts";
  import type { Toggle } from "./machine.svelte.ts";
  const store = useStore<{ toggle: Toggle }>();
  // Both writes go around the transitions: the types refuse them.
  store.toggle.view.on = true;
  store.toggle = store.toggle;
</script>

<button onclick={() => store.toggle.flip()}>flip</button>
