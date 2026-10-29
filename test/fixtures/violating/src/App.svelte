<script lang="ts">
  import { Counter } from "./machines/counter.svelte.ts";
  import { format } from "date-fns";
  const lazy = import("./machines/counter.svelte.ts");
  const c = new Counter();
  void c; void format; void lazy;
</script>
