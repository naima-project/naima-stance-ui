<!-- The task list. It reads the store and calls transitions; the only state it keeps is the text being typed. -->
<script lang="ts">
  import { Button, Card, Checkbox, Cluster, Dialog, Dropdown, Field, Stack, Text, Toolbar } from "../src/lib/components/index.ts";
  import { useStore } from "../src/lib/store/store.svelte.ts";
  import type { AppStore } from "./app.svelte.ts";
  import type { Show } from "./machines/filter.svelte.ts";

  const store = useStore<AppStore>();
  const { tasks, filter } = store;

  let draft = $state("");

  const shown = $derived(
    tasks.view.tasks.filter((t) => filter.view.show === "ALL" || (filter.view.show === "DONE") === t.done),
  );
  const pendingTitle = $derived(tasks.view.tasks.find((t) => t.id === tasks.view.pending)?.title ?? "");
  const full = $derived(tasks.view.tasks.length >= tasks.view.limit);

  function add(event: SubmitEvent) {
    event.preventDefault();
    if (tasks.add(draft)) draft = "";
  }

  const shows = [
    { value: "ALL", label: "All tasks" },
    { value: "OPEN", label: "Open" },
    { value: "DONE", label: "Done" },
  ];
</script>

<Card title="Tasks">
  <form onsubmit={add}>
    <Stack gap="sm">
      <Field
        label="New task"
        bind:value={draft}
        message={full ? `The list holds at most ${tasks.view.limit} tasks.` : undefined}
        invalid={full}
      />
      <Toolbar label="Task actions" justify="between">
        <Button variant="primary" type="submit" disabled={!tasks.allowed({ type: "add", title: draft })}>Add</Button>
        <Dropdown
          label={shows.find((s) => s.value === filter.view.show)?.label ?? ""}
          choices={shows.map((s) => ({ ...s, disabled: s.value === filter.view.show }))}
          onselect={(v) => filter.choose(v as Show)}
        />
      </Toolbar>
    </Stack>
  </form>

  {#if shown.length === 0}
    <Text tone="muted">Nothing here yet.</Text>
  {:else}
    <Stack gap="xs">
      {#each shown as task (task.id)}
        <Cluster justify="between">
          <Checkbox checked={task.done} onchange={() => tasks.toggle(task.id)}>{task.title}</Checkbox>
          <Button variant="ghost" aria-label="Remove {task.title}" onclick={() => tasks.askRemove(task.id)}>Remove</Button>
        </Cluster>
      {/each}
    </Stack>
  {/if}
</Card>

<Dialog open={tasks.view.phase === "CONFIRMING"} title="Remove this task?" onclose={() => tasks.cancel()}>
  <Text>“{pendingTitle}” will be removed from the list.</Text>
  {#snippet actions()}
    <Button onclick={() => tasks.cancel()}>Keep it</Button>
    <Button variant="danger" onclick={() => tasks.confirm()}>Remove</Button>
  {/snippet}
</Dialog>
