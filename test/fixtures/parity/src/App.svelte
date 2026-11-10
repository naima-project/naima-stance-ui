<script lang="ts">
  import { useStore } from "./lib/ui/store/store.svelte.ts";
  import type { AppStore } from "./app.svelte.ts";

  const store = useStore<AppStore>();
  const { counter } = store;
  const notes = store.notes;
</script>

<button disabled={!counter.allowed({ type: "add" })} onclick={() => counter.add()}>Add</button>
<button onclick={counter.reset}>Start over</button>
<button onclick={() => notes.write("hello")}>{counter.view.count} {store.notes.view.notes.length}</button>
