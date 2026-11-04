<!-- A chart: it draws, so stance-ui.json lists it under check.icons.drawings and it may hold SVG. -->
<script lang="ts">
  let { points }: { points: number[] } = $props();
</script>

<svg viewBox="0 0 100 100" role="img" aria-label="A line chart">
  <polyline points={points.map((p, i) => `${i * 10},${100 - p}`).join(" ")} />
</svg>
