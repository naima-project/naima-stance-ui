<!-- Asks for secrets outside the sign-in component. -->
<script lang="ts">
  import Draggable from "../lib/ui/components/Draggable.svelte";
  let shown = $state(false);
  let el: HTMLInputElement | undefined = $state();
  $effect(() => {
    if (el) el.type = "password";
  });
</script>

<input aria-label="Password" type="password" />
<input aria-label="New" type={shown ? "text" : "password"} />
<input aria-label="Code" autocomplete="one-time-code" />
<Draggable type="password" autocomplete="username new-password" />
<input bind:this={el} aria-label="Name" type="text" autocomplete="username" />
