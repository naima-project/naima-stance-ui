<!-- The keypad: twenty keys on a four-column grid, built from the widget set's Grid and Keycap. The layout
     and the labels are here; what each key does is the calculator machine's. -->
<script lang="ts">
  import Grid from "../../src/lib/components/Grid.svelte";
  import Keycap from "../../src/lib/components/Keycap.svelte";
  import { useStore } from "../../src/lib/store/store.svelte.ts";
  import type { AppStore } from "./app.svelte.ts";
  import type { Key } from "./logic/keys.ts";

  interface Props {
    /** The id of a key just pressed on the keyboard, to show it pressed. */
    echo: string | null;
  }

  let { echo }: Props = $props();
  const { calculator } = useStore<AppStore>();
  const view = calculator.view;

  type Cap = { id: string; key: Key; label: string; name: string; tone: "plain" | "quiet" | "soft" | "accent"; wide?: boolean };
  const op = (o: "ADD" | "SUB" | "MUL" | "DIV", label: string, name: string): Cap => ({
    id: o,
    key: { type: "operator", op: o },
    label,
    name,
    tone: "soft",
  });
  const digit = (d: number): Cap => ({ id: `d${d}`, key: { type: "digit", digit: d }, label: String(d), name: String(d), tone: "plain" });
  const caps: Cap[] = [
    { id: "clear", key: { type: "clear" }, label: "AC", name: "AC, all clear", tone: "quiet" },
    { id: "negate", key: { type: "negate" }, label: "±", name: "Change sign", tone: "quiet" },
    { id: "back", key: { type: "back" }, label: "⌫", name: "Delete last digit", tone: "quiet" },
    op("DIV", "÷", "Divide"),
    digit(7),
    digit(8),
    digit(9),
    op("MUL", "×", "Multiply"),
    digit(4),
    digit(5),
    digit(6),
    op("SUB", "−", "Subtract"),
    digit(1),
    digit(2),
    digit(3),
    op("ADD", "+", "Add"),
    { ...digit(0), wide: true },
    { id: "point", key: { type: "point" }, label: ".", name: "Decimal point", tone: "plain" },
    { id: "equals", key: { type: "equals" }, label: "=", name: "Equals", tone: "accent" },
  ];
</script>

<Grid columns={4} gap="md">
  {#each caps as cap (cap.id)}
    <Keycap
      tone={cap.tone}
      wide={cap.wide}
      echo={echo === cap.id}
      active={cap.tone === "soft" ? view.pending === cap.id : undefined}
      aria-label={cap.name}
      onclick={() => calculator.press(cap.key)}
    >
      {cap.label}
    </Keycap>
  {/each}
</Grid>
