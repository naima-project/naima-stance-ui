<!-- Drags by hand, outside the drag primitive, in every way the check knows. -->
<script lang="ts">
  let el: HTMLElement | undefined = $state();
  $effect(() => {
    el?.addEventListener("touchmove", () => {});
    if (el) el.ondragstart = () => {};
    el?.setPointerCapture(1);
  });
</script>

<div bind:this={el} role="presentation" onpointermove={() => {}}>a</div>
<div draggable="true">b</div>
<div on:mousemove={() => {}} role="presentation">c</div>
<ul ondrop={() => {}}><li>d</li></ul>
<div draggable="false" onpointerdown={() => {}} role="presentation">fine</div>
