<!-- What a screen draws while its data is read for the first time: the outline of what is coming (a title and a few
     rows, softly pulsing, still where motion is reduced), with what is being read in words, never a bare "Reading".
     Screens use it in place of their own reading line. -->
<script lang="ts">
  interface Props {
    /** What is being read, in words: "Reading 1 of 3 views…", "Opening the bugs…". */
    label: string;
    /** How many rows to outline. */
    rows?: number;
  }
  let { label, rows = 6 }: Props = $props();
</script>

<div class="skeleton" role="status" aria-live="polite">
  <p class="label">{label}</p>
  <div class="bar title" aria-hidden="true"></div>
  {#each { length: rows } as _, i (i)}
    <div class="bar" style:width={`${92 - ((i * 17) % 35)}%`} aria-hidden="true"></div>
  {/each}
</div>

<style>
  .skeleton {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding-block: var(--space-md);
  }
  .label {
    margin: 0 0 var(--space-xs);
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }
  .bar {
    height: var(--space-md);
    border-radius: var(--radius-sm);
    background: var(--color-surface-sunken);
    animation: breathe var(--motion-duration-breathe) ease-in-out infinite;
  }
  .title {
    width: 40%;
    height: var(--space-lg);
    margin-bottom: var(--space-sm);
  }
  @keyframes breathe {
    50% {
      opacity: 0.5;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bar {
      animation: none;
    }
  }
</style>
