<!-- The project's drag primitive: the one component allowed to handle dragging. -->
<script lang="ts">
  let { onmove }: { onmove: (dy: number) => void } = $props();
  function onpointerdown(event: PointerEvent) {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
</script>

<button type="button" {onpointerdown} onpointermove={(e) => onmove(e.movementY)}>Move</button>
<button type="button" onclick={() => onmove(1)}>Down</button>
