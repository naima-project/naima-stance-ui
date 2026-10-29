# naima-stance-ui

The UI stance, by makebecome, for projects that build their user interface with Svelte 5.

A stance is a set of choices and rules that someone has authored and that a project adopts as a whole. It is opinionated
on purpose: it settles questions that would otherwise be argued again in every project, such as where the logic of an
app lives, how a component gets its data, and where a colour is allowed to be written. A project that adopts a stance
gets its rules, the checks that hold them, and the code that makes them easy to follow. This repository is the first
stance of the [naima-project](https://github.com/naima-project), kept as its own repository like naima-codegen, and it
can be loaded into Naima as a plugin.

## The rules

1. **The app's logic is code with no UI.** Everything the app decides, such as what may happen now, what happens next
   and what is sent where, lives in plain TypeScript modules that import nothing of the UI. The components only show it.
   The two are fully decoupled, so the logic runs and is tested without a browser, and the UI can be replaced without
   touching it.

2. **One central store holds every state machine, and it is written only through their transitions.** The app's state is
   one deep-reactive Svelte 5 store, a `$state` object made once with `createStore`, which holds every state machine of
   the app. A machine has the shape naima-codegen emits: a read-only `view` of its state, `allowed(event)`, and one
   method per input, which are its transitions. Nothing changes the state except those methods. Side effects are the
   machine's outputs, carried out by a port that is passed to the machine when it is made.

3. **Machines are composed of simpler ones, and modelled first.** A machine is built from simpler ones as far as the
   formalism allows. Two machines side by side in the store are their product, and machines that synchronise on shared
   actions are parallel processes, held by a machine whose transitions call theirs. Each machine is modelled first in
   mCRL2, its code is generated with naima-codegen, and its properties are checked. Only when a model is clearly and
   justifiably useless overhead (a few states, no concurrency, nothing worth proving) is a machine written directly as a
   `.svelte.ts` class in the same shape, with the reason written in a comment at its top.

4. **Components keep only their own UI state; otherwise they read the store and call transitions.** A component may keep
   state that is purely its own and means nothing to the app, for example whether a dropdown is open, the caps lock, or
   the text being typed before it is sent. Everything else it reads from the machines' views and changes by calling
   their transitions. A component imports Svelte, other components and the store module, and anything else only as a
   type. A widget of the set is generic and does not even read the store: it takes props and reports through callbacks.

5. **Every colour, size and duration is a design token.** The design's values are design tokens in the
   [W3C Design Tokens format](https://www.designtokens.org/tr/drafts/format/) (DTCG), built into CSS custom properties.
   A component uses them only as `var(--token)`. No hex, `rgb()` or named colour, and no `px`, `rem` or `ms` value,
   appears in a `<style>` block, a `style` attribute, a `style:` directive or an SVG paint attribute. Percentages, `fr`,
   viewport units and unitless numbers describe layout rather than the design, and stay allowed.

6. **The mood board is chosen at design time.** A mood board is a complete set of token values, and every mood board
   defines the same tokens. A project chooses one while it is being designed and builds it into its CSS. The app does
   not switch between mood boards while it runs.

7. **Larger components are built from smaller ones.** The widget set has primitives and components composed from them,
   and a new component is built from existing ones before anything is written from scratch. Focus, keyboard handling and
   labels are then written once, in the smallest component that needs them.

Rules 1, 2, 4, 5 and 6 are checked by machine (see [the checks](#the-checks)). Rules 3 and 7 are conventions, followed
in review.

## What is here

```
tokens/moods/<name>/*.tokens.json   the mood boards, in the DTCG format
scripts/tokens.ts                   builds one mood board into CSS custom properties
src/lib/components/                 the widget set
src/lib/store/store.svelte.ts       createStore, storeContext, useStore, snapshot
demo/                               a small app wired to the store
checks/                             the stance's checks (deno task check)
scripts/adopt.ts                    copies the stance into a project (deno task adopt)
plugin/index.mjs                    the stance as a Naima plugin
test/                               tests of the checks, the copy, the plugin and the demo
stance-ui.json                      this repository's own configuration of the checks
```

Everything runs with Deno 2. The npm packages (Svelte, Vite, svelte-check, Style Dictionary, postcss-value-parser) are
listed in `package.json` at exact versions, and Deno installs them on first use.

## Tokens and mood boards

There are two mood boards. `white` is white and minimal, like Naima's own interface: black text on white, thin grey
rules, one dark accent and almost no shadow. `dusk` is dark and warm: light text on a deep blue-grey, an amber accent, a
serif face, softer corners and deeper shadows. Each one has six files, for colour, typography, spacing (with sizes and
border widths), radius, shadow and motion, and both define exactly the same token names.

The tokens use the stable DTCG format, in which a colour is an object with a colour space and components, and a
dimension or a duration is an object with a value and a unit. The build uses Style Dictionary 5, the usual tool for DTCG
tokens, which reads the files and resolves aliases. Its built-in CSS transforms do not write all of these object values,
so `scripts/tokens.ts` registers one value transform that writes each DTCG type as CSS. A token's CSS name is its path
joined with dashes, so `color.surface-raised` becomes `--color-surface-raised`.

```sh
deno task tokens --mood dusk --out dist/tokens.css
```

## The widget set

The primitives are `Button`, `Text`, `Input`, `Checkbox`, `Icon` (a slot for an inline SVG or a glyph), and the layouts
`Stack` and `Cluster`. The composed components are `Field` (a label, an input and a message, tied together for screen
readers), `Dropdown` (a menu button), `Dialog` (on the native `<dialog>` element), `Card` and `Toolbar`. Each one uses
only tokens, shows a visible focus ring, and sets the ARIA attributes its role needs. The dropdown handles Escape, the
arrow keys and a click outside, and the toolbar moves the focus between its controls with the arrow keys. A dropdown
keeps whether it is open as its own state. A dialog does not: the caller passes `open`, usually read from a machine, and
hears `onclose`.

## The store and the machines

```ts
// the app's store, made once outside any component
const store = createStore({ tasks: new Tasks({ limit: 12 }, port), filter: new Filter() });
mount(App, { target, context: storeContext(store) });
```

```svelte
<script lang="ts">
  const { tasks } = useStore<AppStore>();
</script>

<Button disabled={!tasks.allowed({ type: "confirm" })} onclick={() => tasks.confirm()}>Remove</Button>
```

The store, each of its entries and each view are read-only types, so a component that assigns to the state instead of
calling a transition fails the type check. `snapshot(store)` copies every view as plain data, for logging, tests and
persistence.

The demo (`demo/`) is a task list with two machines. `tasks` is written by hand in the two-file shape naima-codegen
emits: `tasks.ts` holds the plain logic (`initial`, `step`, `allowed`) and `tasks.svelte.ts` the Svelte class with its
view, its transitions and its port. The comment at its top says why it has no model. `filter` is a one-input machine
written directly as a class. A generated machine can replace either of them without any component changing.

```sh
deno task demo         # the demo with Vite's dev server
deno task demo:build   # builds the white mood board and the demo into demo/dist
```

## The checks

```sh
deno task check                          # this repository
deno task check --project <app folder>   # any project with a stance-ui.json
deno task check --only tokens,no-raw-literals --json
```

| Check               | What it holds                                                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens`            | The token files follow the DTCG format: structure, names, `$type` (own or inherited), aliases that resolve without cycles, and each type's value. Every mood board defines the same tokens with the same types. |
| `no-raw-literals`   | No raw colour, size or duration in a component, and every `var(--x)` names a token of the mood board or a custom property the component declares itself.                                                        |
| `component-imports` | A component imports only Svelte, other components, the widget set's index and the store module, and anything else only as a type. A widget of the set does not import the store.                                |
| `svelte-check`      | The project type-checks, which includes refusing a write to the store, an entry or a view.                                                                                                                      |

The components are parsed with Svelte's own compiler and each CSS value with postcss-value-parser, and the token files
are read as JSON and walked as data. Two things are outside what a static check can see. A style value computed by an
expression (`style:width={w}`) is not checked. And whether a component's own `$state` is really UI state, rather than
app state kept in the wrong place, is a judgment left to review.

`stance-ui.json` at the app's root says where things are. Paths are relative to that root.

```json
{
  "check": {
    "tokens": "tokens",
    "moods": "tokens/moods",
    "widgets": ["src/lib/ui/components"],
    "components": ["src"],
    "store": ["src/lib/ui/store/store.svelte.ts"],
    "allowImports": [],
    "tsconfig": "tsconfig.json"
  }
}
```

`moods` is optional, and `tsconfig` set to `null` skips the type check.

## Adopting the stance in a project

The widget set is not a package the project depends on. Its source is copied into the project, where it belongs to the
project and can be edited like any other file. The copy records which version of the stance it came from, so a later
update can be compared with what the project changed.

1. Copy the stance in, choosing the mood board:

   ```sh
   deno task adopt --project <app folder> --mood white
   ```

   This copies the widget set to `src/lib/ui/components/`, the store module to `src/lib/ui/store/`, the mood board to
   `tokens/`, and the token build to `scripts/stance-ui-tokens.ts` (use `--to` for another place than `src/lib/ui`). It
   writes `stance-ui.json`, which records the stance's version and commit, the mood board, and the sha256 of every file
   as it was copied, and which configures the checks.

2. Add `svelte`, `svelte-check`, `style-dictionary` and `postcss-value-parser` to the project's development dependencies
   if it does not have them, and build the tokens into the app's CSS:

   ```sh
   deno run -A scripts/stance-ui-tokens.ts --tokens tokens --out src/lib/ui/tokens.css
   ```

3. Make the app's store with `createStore`, mount the root component with `storeContext(store)`, and read it in
   components with `useStore`.

4. Run the checks, from this repository or through Naima (below).

Later, `deno task adopt --project <app folder> --status` lists the files the project changed since the copy and the
files that are newer in the stance. Running `adopt` again updates the files the project has not changed. It refuses to
overwrite a file the project did change, or one that was there before and never came from the stance, and names each of
them so they can be merged by hand. `--force` overwrites them anyway.

## As a Naima plugin

`plugin/index.mjs` is written to Naima's plugin contract 2. It ships the seven rules above to the rules point, so
`naima rules` lists them for every agent of the project. It contributes one Naima check per stance check (`ui-tokens`,
`ui-no-raw-literals`, `ui-component-imports`, `ui-svelte-check`), so `naima check` runs them. And it adds
`naima stance-ui adopt | status | check`. The plugin file is plain JavaScript and imports only the runtime's own
modules, so it loads under Deno, Node and Bun alike. The checks themselves run in a child process under Deno, from the
plugin's checkout, so Deno must be on the PATH.

The plugin is added from git, pinned by commit, so that the whole repository is fetched with it:

```json
{
  "plugins": {
    "stance-ui": {
      "source": { "git": "<this repository's git URL>", "commit": "<full commit>", "path": "plugin/index.mjs" },
      "options": { "app": "." }
    }
  }
}
```

`app` is the folder of the Svelte app, from the project's root, which is where `stance-ui.json` lives. `deno` names the
Deno executable if it is not the one on the PATH.

### What Naima would need

Naima's contract already supports a plugin like this one, and three things would make it better.

- **A check cannot declare the programs it runs.** A command declares them with `runs`, and the launcher grants them,
  but a check has no such field, so the plugin's checks rely on the launcher already allowing `deno`. A `runs` field on
  checks, like the one on commands, would close that gap.
- **A plugin pinned to the tip of its default branch is fetched empty.** Naima clones a git plugin with `--no-checkout`
  and checks the pinned commit out only when `HEAD` differs from it. When the pin is the tip of the default branch,
  `HEAD` already equals it, the checkout is skipped, the working tree stays empty, and the next load refuses the plugin
  for having local changes.
- **A plugin cannot ship scaffolding as such.** Copying the widget set is a command of this plugin. A contribution point
  for scaffolds (files a plugin offers to copy into a project, with the version recorded) would let Naima list and
  update them for every stance in the same way.

## Developing

```sh
deno task test         # the checks against their fixtures, the copy, the plugin, the token build and the demo build
deno task check        # this repository against its own stance
deno fmt && deno lint
```

`test/fixtures/clean` is a small project that passes every check. `test/fixtures/violating` breaks each rule in each way
the checks know. `test/fixtures/types` writes to the store around its transitions and must fail the type check.

## Licence

MIT, by makebecome: [LICENSE](LICENSE).
