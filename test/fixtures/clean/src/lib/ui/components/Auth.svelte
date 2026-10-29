<!-- The project's sign-in form: the one component allowed to ask for a password or a one-time code. -->
<script lang="ts">
  let shown = $state(false);
</script>

<input aria-label="Password" type={shown ? "text" : "password"} autocomplete="current-password" />
<input aria-label="Code" autocomplete="one-time-code" />
