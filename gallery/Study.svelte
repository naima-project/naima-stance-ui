<!-- The gallery's entries for the parts of the widget set (src/lib/components/study/ and list/): an action, a segmented
     choice, a graph, a timeline, a sequence diagram, a table of state, the editor, the mosaic of cards and the one list,
     each on sample data. What each shows (the step picked, the list's item open) is this component's own state. -->
<script lang="ts">
  import Play from "@lucide/svelte/icons/play";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import Card from "../src/lib/components/Card.svelte";
  import Stack from "../src/lib/components/Stack.svelte";
  import Text from "../src/lib/components/Text.svelte";
  import Action from "../src/lib/components/study/Action.svelte";
  import Segmented from "../src/lib/components/study/Segmented.svelte";
  import Graph from "../src/lib/components/study/Graph.svelte";
  import Timeline from "../src/lib/components/study/Timeline.svelte";
  import Sequence from "../src/lib/components/study/Sequence.svelte";
  import StateTable from "../src/lib/components/study/StateTable.svelte";
  import Editor from "../src/lib/components/study/Editor.svelte";
  import Mosaic from "../src/lib/components/study/Mosaic.svelte";
  import List from "../src/lib/components/list/List.svelte";
  import type { GraphEdge, GraphNode } from "../src/lib/components/study/graph.ts";
  import type { Mosaic as Arrangement } from "../src/lib/components/study/mosaic.ts";
  import type { ListSpec } from "../src/lib/components/list/list.ts";

  // A lock two clients share: the states, the steps between them, and a run of it.
  const nodes: GraphNode[] = [
    { id: "free", label: "free", cls: "current" },
    { id: "held1", label: "held by c1" },
    { id: "held2", label: "held by c2" },
  ];
  const edges: GraphEdge[] = [
    { id: "g1", from: "free", to: "held1", label: "grant(c1)" },
    { id: "r1", from: "held1", to: "free", label: "release(c1)" },
    { id: "g2", from: "free", to: "held2", label: "grant(c2)" },
    { id: "r2", from: "held2", to: "free", label: "release(c2)" },
  ];
  const past = [
    { name: "free", title: "The lock is free" },
    { name: "held by c1", title: "Client 1 holds the lock" },
    { name: "free", title: "The lock is free again" },
  ];
  const ahead = [
    { name: "grant(c1)", title: "Give the lock to client 1", key: "g1" },
    { name: "grant(c2)", title: "Give the lock to client 2", key: "g2" },
  ];
  let position = $state(2);
  let fired = $state("nothing yet");
  let speed = $state("normal");
  let ran = $state(0);

  const source = `% A lock two clients share.
sort Client = struct c1 | c2;
act grant, release: Client;
proc Lock(free: Bool) = sum c: Client . (free -> grant(c) . Lock(false) + !free -> release(c) . Lock(true));
init Lock(true);
`;
  let text = $state(source);

  const cards = [
    { id: "graph", title: "The machine" },
    { id: "state", title: "Its state" },
    { id: "notes", title: "Notes" },
  ];
  const initial: Arrangement = {
    root: { dir: "row", ratio: 0.6, a: { card: "graph" }, b: { dir: "col", ratio: 0.5, a: { card: "state" }, b: { card: "notes" } } },
    closed: [],
    maximised: null,
  };

  interface Task {
    key: string;
    title: string;
    who: string;
    age: number;
  }
  const tasks: Task[] = [
    { key: "t1", title: "Draw the lock", who: "Ada", age: 3 },
    { key: "t2", title: "Check mutual exclusion", who: "Ada", age: 1 },
    { key: "t3", title: "Generate the code", who: "Grace", age: 7 },
    { key: "t4", title: "Replay the counterexample", who: "Grace", age: 2 },
  ];
  const spec: ListSpec<Task> = {
    key: (t) => t.key,
    columns: [
      { id: "title", label: "Task", value: (t) => t.title, width: "grow", column: true },
      { id: "age", label: "Age", value: (t) => t.age, text: (t) => `${t.age} d`, width: "narrow", descFirst: true },
      { id: "who", label: "Who", value: (t) => t.who, width: "fit" },
    ],
    facets: [{ id: "who", label: "Person", values: (t) => [t.who] }],
    groupings: [{ id: "who", label: "Person", group: (t) => ({ key: t.who, title: t.who }) }],
  };
  let open: string | null = $state(null);
</script>

<Card title="Actions and choices">
  <Stack gap="sm">
    <Action label="Run" hint="Run the model one step" icon={Play} variant="primary" onclick={() => ran++} />
    <Action label="Start again" icon={RotateCcw} onclick={() => (ran = 0)} />
    <Action label="Save" disabled why="Nothing has changed since the last save" />
    <Text tone="muted" live="polite">Runs: {ran}</Text>
    <Segmented
      label="Speed"
      options={[
        { value: "slow", label: "Slow" },
        { value: "normal", label: "Normal" },
        { value: "fast", label: "Fast" },
      ]}
      value={speed}
      onchange={(v) => (speed = v)}
    />
  </Stack>
</Card>

<Card title="A graph">
  <div class="drawing">
    <Graph label="The lock's states" {nodes} {edges} notation="uml-state-machine" />
  </div>
</Card>

<Card title="A timeline">
  <Timeline
    label="The run so far and the steps possible now"
    {past}
    {position}
    {ahead}
    onpick={(k) => (position = k)}
    onfire={(key) => (fired = key)}
  />
  <Text tone="muted" live="polite">Fired: {fired}</Text>
</Card>

<Card title="A sequence diagram">
  <Sequence
    label="Two clients ask for the lock"
    lifelines={["c1", "lock", "c2"]}
    messages={[
      { from: "c1", to: "lock", label: "ask" },
      { from: "lock", to: "c1", label: "grant" },
      { from: "c2", to: "lock", label: "ask" },
      { from: "c1", to: "lock", label: "release" },
      { from: "lock", to: "c2", label: "grant" },
    ]}
  />
</Card>

<Card title="A table of state">
  <StateTable
    label="The lock's state"
    rows={[
      { name: "free", sort: "Bool", value: false, prev: true },
      { name: "holder", sort: "Client", value: "c1" },
      { name: "queue", sort: "List(Client)", value: ["c2"], note: "who waits, oldest first" },
    ]}
  />
</Card>

<Card title="The editor">
  <div class="editor">
    <Editor label="lock.mcrl2" file="lock.mcrl2" {text} onchange={(t) => (text = t)} />
  </div>
</Card>

<Card title="A mosaic of cards">
  <div class="mosaic">
    <Mosaic key="gallery" {cards} {initial}>
      {#snippet card(id)}
        {#if id === "graph"}
          <Graph label="The lock's states, in the mosaic" {nodes} {edges} />
        {:else if id === "state"}
          <StateTable label="The lock's state, in the mosaic" rows={[{ name: "free", value: true }]} />
        {:else}
          <Text>Drag a gutter, or press its arrow keys, to resize the cards on its two sides.</Text>
        {/if}
      {/snippet}
    </Mosaic>
  </div>
</Card>

<Card title="The one list">
  <List
    label="The tasks of the lock"
    items={tasks}
    {spec}
    {open}
    onopen={(k) => (open = k)}
    onclose={() => (open = null)}
    nothing="No task matches"
  />
</Card>

<style>
  .drawing,
  .editor {
    display: flex;
    flex-direction: column;
    aspect-ratio: 4 / 3;
    min-block-size: 0;
  }
  .mosaic {
    display: flex;
    flex-direction: column;
    aspect-ratio: 1;
  }
</style>
