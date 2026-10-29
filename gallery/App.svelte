<!-- The widget gallery: every widget of the set, in its states, on one page, so that the browser checks see
     each of them in both themes. It reads the store and calls transitions like any app. -->
<script lang="ts">
  import {
    Button,
    Card,
    Checkbox,
    Cluster,
    Dialog,
    Dropdown,
    Field,
    Grid,
    Icon,
    Input,
    Keycap,
    Stack,
    Text,
    ThemeSwitch,
    Toolbar,
  } from "../src/lib/components/index.ts";
  import { useStore } from "../src/lib/store/store.svelte.ts";
  import type { AppStore } from "./app.svelte.ts";

  const { theme, sheet } = useStore<AppStore>();
  let name = $state("");
  let code = $state("12");
  let agreed = $state(false);
  let search = $state("");
  let picked = $state("none yet");
</script>

<main>
  <Stack gap="xl">
    <Cluster justify="between" align="center">
      <Text as="h1" size="xl" strong>Widgets</Text>
      <ThemeSwitch value={theme.view.choice} onchange={(c) => theme.choose(c)} />
    </Cluster>

    <Card title="Buttons">
      <Toolbar label="Sample actions">
        <Button variant="primary">Save</Button>
        <Button>Cancel</Button>
        <Button variant="ghost">Skip</Button>
        <Button variant="danger">Delete</Button>
        <Button disabled>Unavailable</Button>
      </Toolbar>
      <Cluster gap="md">
        <Dropdown
          label="Pick a fruit"
          choices={[
            { value: "apple", label: "Apple" },
            { value: "pear", label: "Pear" },
            { value: "quince", label: "Quince", disabled: true },
          ]}
          onselect={(v) => (picked = v)}
        />
        <Text tone="muted">Picked: {picked}</Text>
      </Cluster>
      <Cluster>
        <Button onclick={() => sheet.open()}>Open the dialog</Button>
      </Cluster>
    </Card>

    <Card title="Fields">
      <Field label="Name" bind:value={name} message="As it should appear on the receipt." autocomplete="name" />
      <Field
        label="Postcode"
        bind:value={code}
        invalid
        message="A postcode has five digits: 12 has two."
        inputmode="numeric"
      />
      <Input bind:value={search} aria-label="Search" type="search" placeholder="Search" />
      <Checkbox bind:checked={agreed}>Send me the receipt by email</Checkbox>
    </Card>

    <Card title="Text">
      <Text>Body text, in the default tone.</Text>
      <Text tone="muted">Secondary text, in the muted tone.</Text>
      <Text tone="danger">An error, in the danger tone.</Text>
      <Text tone="success">A success, in the success tone.</Text>
      <Text mono size="sm">monospaced, small</Text>
      <Cluster>
        <Icon label="Star">★</Icon>
        <Text as="span">An icon with a name, and one that is only decoration</Text>
        <Icon>★</Icon>
      </Cluster>
    </Card>

    <Card title="Keycaps">
      <Grid columns={4} gap="md">
        <Keycap tone="quiet" aria-label="AC, all clear">AC</Keycap>
        <Keycap>7</Keycap>
        <Keycap tone="soft" active={true} aria-label="Add">+</Keycap>
        <Keycap tone="accent" aria-label="Equals">=</Keycap>
      </Grid>
    </Card>
  </Stack>
</main>

<Dialog open={sheet.view.open} title="A dialog" onclose={() => sheet.close()}>
  <Text>Escape, or either button, closes it.</Text>
  {#snippet actions()}
    <Button onclick={() => sheet.close()}>Close</Button>
    <Button variant="primary" onclick={() => sheet.close()}>Done</Button>
  {/snippet}
</Dialog>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    background: var(--color-surface);
    color: var(--color-text);
    font-family: var(--font-family-body);
  }
  main {
    max-width: var(--size-dialog-width);
    margin: 0 auto;
    padding: var(--space-2xl) var(--space-lg);
  }
</style>
