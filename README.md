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
   not switch between mood boards while it runs. It does switch between the mood board's light and dark themes (rule 8).

7. **Larger components are built from smaller ones.** The widget set has primitives and components composed from them,
   and a new component is built from existing ones before anything is written from scratch. Focus, keyboard handling and
   labels are then written once, in the smallest component that needs them.

8. **Every mood board has a light and a dark theme, and the user's choice is app state.** Both themes define the same
   tokens. The app follows the system's `prefers-color-scheme` unless the user chose a theme. That choice is held by the
   theme machine in the store and changes only through its transition, whose port sets `data-theme` on the page. Both
   themes reach 4.5:1 for text and 3:1 for controls and focus rings.

9. **The interface meets EN 301 549 and WCAG 2.2 at level AA.** See [accessibility](#accessibility) for what that asks
   of every widget and page.

10. **Dragging is done only through the `Draggable` widget**, which always offers every move as a button and an arrow
    key too (SC 2.5.7).

11. **A password or a one-time code is asked for only by the `Auth` widget**, the sign-in form that meets accessible
    authentication (SC 3.3.8).

12. **Nothing entered is asked for again in the same process** (SC 3.3.7), unless security needs it or the value is no
    longer valid; the values are carried in memory for the process only, never stored.

13. **Help, where there is any, is in the same place on every page** (SC 3.2.6).

14. **The app runs on six platforms from one code base, and only the platform port differs**: a web page, and the Tauri
    2 app on Windows, Linux, macOS, Android and iOS (see [Platforms](#platforms)).

Rules 1, 2, 4, 5, 6, 8, 9, 10 and 11 are checked by machine (see [the checks](#the-checks)). Rules 3, 7, 12, 13 and 14
are conventions that agents verify: no check can see them, so each rule says what the agent reviews and when, and the
agent records the review as a note on the item the change lands with.

Each rule is a Markdown file in `rules/`, one per rule, which the Naima plugin reads and ships to `naima rules`. Its
front matter holds `name`, `title`, `audience` (agents, people or everyone), `strength` (must or should), optionally
`ack` and `enforcedBy` (the Naima check that holds it), and `verifiedBy`: that check, or `agent` for a convention an
agent verifies. The text of the rule follows, then a section `## Why` with its reason. The front matter is a strict
subset of YAML (one `name: value` per line, or a list of `- value` lines), so it is read without a YAML library and
means the same to one.

## What is here

```
tokens/moods/<name>/                the mood boards, in the DTCG format: mood.resolver.json, the shared files,
                                    and themes/light and themes/dark
tokens/contrast.json                the colour pairs every theme must make legible
rules/                              the stance's rules, one Markdown file each
scripts/tokens.ts                   builds one mood board, both themes, into CSS custom properties
src/lib/components/                 the widget set
src/lib/store/store.svelte.ts       createStore, storeContext, useStore, snapshot
src/lib/theme/                      the theme machine and its port for the page
src/lib/auth/                       the sign-in machine and its passkey helper for the browser
gallery/                            every widget on one page, built once per mood board
src/lib/platform/port.ts            the platform port: local, web and Tauri
platform/server.ts                  the Deno server for an app with a backend
platform/tauri/                     the Tauri 2 shell (src-tauri) that adopt adds to a project
naima-stance.json                   what makes the repository a stance to naima stances
demo/                               a small app wired to the store
checks/                             the stance's checks (deno task check, deno task platforms)
scripts/adopt.ts                    copies the stance into a project (deno task adopt)
scaffold/                           the starting app adopt writes into a new project
scripts/hook.ts                     reruns the fast checks after an agent's edit
plugin/index.mjs                    the stance as a Naima plugin
test/                               tests of the checks, the copy, the plugin and the demo
stance-ui.json                      this repository's own configuration of the checks
```

Everything runs with Deno 2. The npm packages (Svelte, Vite, svelte-check, Style Dictionary, postcss-value-parser,
Playwright, axe-core) are listed in `package.json` at exact versions, and Deno installs them on first use. The browser
checks need Playwright's Chromium once per machine: `deno run -A npm:playwright@1.60.0 install chromium`.

## Tokens and mood boards

There are three mood boards. `white` is white and minimal, like Naima's own interface: black text on white, thin grey
rules, one dark accent and almost no shadow. `dusk` is dark and warm: light text on a deep blue-grey, an amber accent, a
serif face, softer corners and deeper shadows. `calm` is minimal without being bare: warm paper under soft graphite
text, one clay accent, light numerals, generous round shapes and quiet shadows. Each mood board comes in a light and a
dark theme: `white` turns to near-white on near-black, `dusk` (dark by nature) gets a light theme of blue-grey text on
warm stone with a burnt-amber accent, and `calm` turns to warm charcoal with a lighter clay.

A mood board is a folder. Typography, spacing (with sizes and border widths), radius and motion are shared by both
themes and sit at its top; colour and shadow change with the theme and sit in `themes/light/` and `themes/dark/`.
`mood.resolver.json` ties them together in the [DTCG Resolver Module](https://www.designtokens.org/TR/drafts/resolver/)
format, version 2025.10: one set of shared files, then one modifier, `theme`, whose contexts are `light` and `dark`.
Every theme of every mood board defines exactly the same token names.

The tokens use the stable DTCG format, in which a colour is an object with a colour space and components, and a
dimension or a duration is an object with a value and a unit. The build uses Style Dictionary 5, the usual tool for DTCG
tokens, which reads the files and resolves aliases. Its built-in CSS transforms do not write all of these object values,
so `scripts/tokens.ts` registers one value transform that writes each DTCG type as CSS. A token's CSS name is its path
joined with dashes, so `color.surface-raised` becomes `--color-surface-raised`.

The build writes both themes into one CSS file. The default theme (light) is on `:root`, with
`color-scheme: light
dark`. The dark theme's values replace it when the system prefers dark and the page does not say
`data-theme="light"`, and whenever the page says `data-theme="dark"`. When the system asks for reduced motion, every
duration token is `0s`, so nothing the widgets animate moves.

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

`Grid` lays its children on equal columns, and `Keycap` is the large key of a keypad (a calculator, a PIN pad): its tone
says what kind of key it is, `active` marks a key that stays selected, and `echo` shows it pressed for a moment when the
keyboard pressed it. `ThemeSwitch` is a segmented control of three choices (follow the system, light, dark) on native
radio buttons; it takes the current choice and reports a new one, and the app passes that to the theme machine.

```ts
const store = createStore({ theme: new Theme({ initial: savedTheme() }, documentTheme()), ... });
```

```svelte
<ThemeSwitch value={theme.view.choice} onchange={(c) => theme.choose(c)} />
```

`documentTheme()` is the theme machine's port in a browser: it sets or removes `data-theme` on the root element and
remembers the choice in `localStorage`, which `savedTheme()` reads back at the next visit.

`Draggable` is the only widget that handles dragging. It wraps the thing that moves, and its `moves` prop is required
and never empty: each direction it lists is also a button beside the thing and an arrow key on its handle, so dragging
is only ever a shortcut. A drag reports one move each time the pointer has travelled the thing's own height (or width),
so dragging a row of a list by one row moves it by one place. What a move does is the caller's, through `onmove`, and
`canMove` says whether one can happen now.

```svelte
<Draggable label={item} moves={["up", "down"]} canMove={(way) => list.allowed({ type: "move", item, way })}
  onmove={(way) => list.move(item, way)}>{item}</Draggable>
```

`Auth` is the sign-in form, and the only place a password or a one-time code is asked for. It is built from `Field`,
`Checkbox`, `Button` and `Text`: a username field (`autocomplete="username"`, with `webauthn` when a passkey is
offered), a password field (`autocomplete="current-password"`) whose text can be shown, a button for a passkey, and a
step for a one-time code (`autocomplete="one-time-code"`). It never blocks pasting, asks no puzzle, and says every error
in text tied to its field. Its logic is the sign-in machine, `Auth` in `src/lib/auth/auth.svelte.ts`, kept in the store
like any other: it holds the step and the username, never the password, and its port checks what was entered. The port's
`passkey` is optional; `webauthnPasskey(options, verify)` in `src/lib/auth/webauthn.ts` makes one from the service's two
calls and the browser's Web Authentication API. A project that needs a sign-up form adds it to its own copy of `Auth`.

```svelte
<Auth view={auth.view} onpassword={(u, p) => auth.password(u, p)} onpasskey={() => auth.passkey()}
  oncode={(c) => auth.code(c)} onback={() => auth.back()} />
```

`gallery/` shows every widget, in its states, on one page. `deno task gallery:build` builds it once per mood board into
`gallery/dist/<mood>/`, so that the browser checks see every widget in every mood board and both themes.

## Accessibility

The default of the stance is to meet the European accessibility rules. The European Accessibility Act (Directive (EU)
2019/882) has applied since 28 June 2025, and its harmonised standard for ICT is EN 301 549. The version that gives
presumption of conformity today is V3.2.1 (2021), which takes over WCAG 2.1 level AA. EN 301 549 V4.1.1 was published on
2 September 2026 and moves the baseline to WCAG 2.2 level AA; it carries presumption of conformity once the Commission
cites it in the Official Journal of the EU, expected for December 2026
([Ireland's National Disability Authority](https://nda.ie/news/en301549-published),
[Deque on V4.1.1](https://www.deque.com/blog/en-301-549-v4-1-1-is-final-what-changed-what-it-means-and-what-you-should-do/),
[the standard at ETSI](https://www.etsi.org/deliver/etsi_en/301500_301599/301549/04.01.01_60/en_301549v040101p.pdf)).
The stance follows WCAG 2.2 level AA, which meets V3.2.1's web clauses and is what V4.1.1 asks for.

Every widget and page of the stance:

- gives assistive technology a name, a role and a state for each control (SC 4.1.2), with the visible label inside the
  name (SC 2.5.3), and states the page's language (SC 3.1.1);
- works from the keyboard alone (SC 2.1.1), with a focus ring at least two pixels wide in the focus colour, 3:1 against
  the surfaces (SC 2.4.7, 1.4.11), and never hidden under other content (SC 2.4.11);
- gives every pointer target at least 24 by 24 CSS px (SC 2.5.8);
- stops every transition and animation when the system asks for reduced motion;
- resizes text to 200% (SC 1.4.4) and reflows at 320 CSS px wide without scrolling sideways (SC 1.4.10), since every
  size is in `rem`;
- tells nothing by colour alone (SC 1.4.1): an error is said in text, a chosen option also changes weight;
- reaches 4.5:1 for text and 3:1 for controls in both themes (SC 1.4.3, 1.4.11);
- identifies an input's error in text tied to it (`aria-invalid`, `aria-describedby`, SC 3.3.1).

Four criteria new in WCAG 2.2 are about what an app does rather than how a widget is built. Two of them are made
checkable by giving them one widget each: anything done by dragging goes through `Draggable`, which always has a
single-pointer alternative (SC 2.5.7), and signing in goes through `Auth`, which asks nothing to solve, remember or
transcribe (SC 3.3.8); the checks `no-raw-drag` and `auth-only` refuse a drag or a secret anywhere else. The other two
are rules that agents verify, since no check can see them: help, where there is any, is in the same place on every page
(SC 3.2.6), and nothing already entered is asked for again in the same process (SC 3.3.7). The stance has no form
machine that remembers entered values across a process: carrying them is each process's machine's job, in memory only.
The checks below cover what a machine can decide; they do not replace a test with assistive technology.

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

### From a machine's port to the page

A machine never touches the page. What it decides reaches the DOM in one of two ways, and nothing else in the app writes
to the page.

- **What is shown, and announced, is read from its view.** A component renders a field of the view; text a screen reader
  should hear when it changes goes in a live region (`<Text live="polite">`, or `aria-live` on an `<output>`).
- **What is done, a focus moved, something stored or sent, is an output carried out by the port** that `app.svelte.ts`
  passes the machine when it makes it. The port is where `document`, `localStorage` and `fetch` (or the platform port's
  `call`) appear; an answer comes back as one of the machine's inputs.

```ts
// app.svelte.ts: the counter's port moves the focus once the page shows the new state
counter: new Counter({ limit: 3 }, {
  reached: () => tick().then(() => document.getElementById("reset")?.focus()),
}),
```

```svelte
<!-- App.svelte: the view, announced; the transitions, called -->
<Text live="polite">{counter.view.said}</Text>
<Button id="reset" disabled={!counter.allowed({ type: "reset" })} onclick={() => counter.reset()}>Start over</Button>
```

The theme machine works the same way: `documentTheme()` is its port, setting `data-theme` on the root element.

## Examples

A stance ships examples that follow it to the letter, for agents and people to start from.

`examples/calculator/` is a four-operation calculator on the `calm` mood board, in its light and dark theme, with the
theme switch under it. Its logic is in `logic/` and holds no UI. The control (which keys act, when an operand starts and
ends, what follows a result or an error) is an mCRL2 model, `logic/model/core.mcrl2`, with seven properties in
`logic/model/properties/` (no deadlock, clearing always reachable, operands within the digit limit, an error only starts
over, a calculation answered once, equals asking nothing without a second operand). naima-codegen generates the
control's Svelte machine from it and checks that the generated code stays inside the model. The numbers are the
registers' business, `logic/registers.ts`: exact rationals, so one third times three is one, rounded only when shown.
The two run in parallel in `logic/calculator.svelte.ts`, the control's outputs telling the registers what to do and the
registers' verdict on a calculation coming back as the control's input. The one store holds the calculator; the
components (`Display`, `Keypad`, `Calculator`) read it and press keys, built from `Grid` and `Keycap`. Every key is
always taken, as on a pocket calculator, and the keyboard presses the same keys. What the display shows is read in
`logic/view.ts`: a quieter expression line ("3 +") above the number, a count of the keys entered into an operand that
lifts the number in for a moment at each entry, even when it shows what it showed before (the second 3 of 3 + 3), and
the text a screen reader announces at each entry ("3 + 3"). With reduced motion the lift has no duration and the
expression line alone marks the new operand.

```sh
deno task example:calculator          # run it
deno task example:calculator:build    # build it to examples/calculator/dist/, which opens from disk
sh examples/calculator/logic/model/check/check.sh                                  # the model's properties
naima-codegen check-refinement --project examples/calculator/logic                 # the generated code against the model
```

## Platforms

An app built with the stance runs on six platforms from one code base: as a web page, and as a Tauri 2 app on Windows,
Linux, macOS, Android and iOS, where the same page runs in the system's webview. The machines, the store and the
components are the same everywhere. The one part that differs by platform is the port that carries the machines' outputs
out of the page.

### The port

`src/lib/platform/port.ts` has one interface, `Port`, with a single method, `call(command, args)`, which returns a
promise of the answer. Arguments and answers are JSON. There are three implementations:

- `localPort(handlers)` answers each command in the page. It is the whole backend of a pure client app, such as the
  calculator, which then needs no server at all: its build is static files.
- `webPort(url)` sends each command to a server as `POST <url>/<command>` with the arguments as a JSON body, and reads
  `{"ok": answer}` or `{"error": "..."}` back.
- `tauriPort()` calls the Tauri shell's Rust command of the same name with `invoke`.

`connect({ handlers, server })` picks one: Tauri inside a Tauri webview, else the server when one is named, else the
local handlers. A machine's port calls `call` for an output and turns the answer into one of the machine's inputs, so
the machine never knows which platform it is on.

### The web server

For an app that needs a backend, the stance's choice is a Deno server, `platform/server.ts`. It serves the built page as
static files and answers the port's contract at `/port/<command>`, with handlers of the same shape as the ones
`localPort` runs, so a command can move between the page and the server without the machines noticing. Deno is the
runtime Naima and the stance's own tooling already need, so a project gains no second runtime for its server; it runs
TypeScript as it is, and its permissions limit what the server may touch. A pure client app needs none of this.

### The Tauri shell

`platform/tauri/` is the `src-tauri` folder of a Tauri 2 app: the Cargo crate, `tauri.conf.json`, the capabilities,
placeholder icons and `src/port.rs`, where the port's Rust commands live. Every shell answers `describe`, which says
which operating system it runs on. A project gets it with `deno task adopt --project <app> --tauri`, then sets its own
`productName`, `identifier`, `build.beforeBuildCommand` and `build.frontendDist` in `tauri.conf.json`, and makes its own
icons with `deno task tauri icon <a square png or svg>`. `--server` copies the Deno server too. The port module is
always copied, to `src/lib/ui/platform/port.ts`, and needs `@tauri-apps/api` among the project's dependencies.

### Building and running on each platform

The Tauri command line is `deno task tauri`, run from the app's folder (for the calculator, `examples/calculator`). Rust
is needed for every platform but the web.

| Platform | Build on    | Needs                                                                                                                                                                                                                                                                       | Build and run                                                                                                                                                                                                           |
| -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web      | any         | Deno                                                                                                                                                                                                                                                                        | `deno task example:calculator:build`, then open `dist/index.html` from disk or serve `dist/` (with `servePort` from `platform/server.ts` when there is a backend)                                                       |
| macOS    | macOS       | Xcode's command line tools                                                                                                                                                                                                                                                  | `deno task tauri build --bundles app`; the app is in `src-tauri/target/release/bundle/macos/`                                                                                                                           |
| iOS      | macOS       | Xcode, the Rust target `aarch64-apple-ios-sim` (and `aarch64-apple-ios` for a device)                                                                                                                                                                                       | `deno task tauri ios init` once, then `deno task tauri ios build --target aarch64-sim --debug`; install the `.app` from `src-tauri/gen/apple/build/` with `xcrun simctl install booted <app>` and `xcrun simctl launch` |
| Linux    | Linux       | `libwebkit2gtk-4.1-dev`, `build-essential`, `libxdo-dev`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev` (Debian and Ubuntu names)                                                                                                                            | `deno task tauri build --no-bundle` (or with bundles: `.deb`, `.rpm`, AppImage); the binary is `src-tauri/target/release/app`                                                                                           |
| Windows  | Windows     | the Visual Studio C++ build tools, and WebView2 (part of Windows 11)                                                                                                                                                                                                        | `deno task tauri build --no-bundle` (or with the NSIS or MSI installer); the binary is `src-tauri\target\release\app.exe`                                                                                               |
| Android  | any desktop | the Android SDK with its platform tools, build tools, a platform, the NDK, the emulator and an arm64 (or x86_64) system image; a JDK 17; the Rust targets `aarch64-linux-android`, `armv7-linux-androideabi`, `i686-linux-android`, `x86_64-linux-android`; `JAVA_HOME` set | `deno task tauri android init` once, then `deno task tauri android build --apk --debug`; `adb install` the `.apk` from `src-tauri/gen/android/app/build/outputs/apk/`, with `ANDROID_HOME` and `NDK_HOME` set           |

`src-tauri/gen/` holds the Xcode and Android Studio projects that the two `init` commands generate; the calculator
leaves them out of git and makes them again when they are missing.

### The platforms check

`deno task platforms` (or `deno task check --only platforms`, or `naima stance-ui platforms`) builds the app for every
platform the current machine can reach, launches it, waits until it is ready, runs the app's end-to-end script in it,
and takes a screenshot. `--platforms web,macos` limits it to some, and `--out <dir>` says where the logs, the
screenshots and `report.json` go (`.stance-ui/platforms/` by default). It is never part of a plain `deno task check`,
since it builds for minutes.

`stance-ui.json` names the app and its script:

```json
{ "check": { "platforms": { "app": "examples/calculator", "e2e": "examples/calculator/e2e.js" } } }
```

The end-to-end script is one JavaScript expression whose value is a promise of `{ ok, says }`, evaluated inside the
page. The calculator's presses 1, +, 2 and = and reads 3 on the display. The same script runs on every platform; only
what puts it in the page differs:

| Platform       | Built by                      | Launched and made ready                                                                         | End-to-end through                                                                       | Screenshot                    |
| -------------- | ----------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------- |
| web            | the app's frontend build      | the stance's Deno server, in Chromium, Firefox and WebKit                                       | Playwright                                                                               | Playwright                    |
| macOS          | `tauri build`                 | the app's binary                                                                                | the shell itself                                                                         | `screencapture` of its window |
| iOS            | `tauri ios build` (simulator) | `xcrun simctl install` and `launch` on the booted iPhone                                        | the shell itself                                                                         | `xcrun simctl io screenshot`  |
| Linux, Windows | `tauri build`                 | tauri-driver, when it and the system's WebDriver are there                                      | WebDriver (`WebKitWebDriver` on Linux, `msedgedriver` on Windows); else the shell itself | WebDriver                     |
| Android        | `tauri android build`         | `adb install` and `am start` on a running emulator or device, or on an emulator the check boots | the WebView's DevTools socket (Chrome DevTools Protocol)                                 | `adb exec-out screencap`      |

The shell itself runs the script when the environment variable `STANCE_UI_E2E` holds it: once the page has loaded it
evaluates the script and prints `e2e: <report>`. Without the variable the shell does nothing of the kind. tauri-driver
does not support macOS's WKWebView, and iOS has no WebDriver for an app's webview, which is why those two go through the
shell; WebKit in Playwright covers the same engine from outside. An app is ready when its page first calls the port: the
shell prints `port: <command> -> ...` then. On iOS an app's standard output goes to the system log, so the check reads
these lines with `xcrun simctl spawn <device> log stream` while it launches the app.

On Android the app cannot be handed an environment variable, so the script goes in from outside, through the WebView's
own debugging socket: a debug build's WebView opens `webview_devtools_remote_<pid>`, `adb forward` makes it a local
port, and the check evaluates the script in the app's page with the Chrome DevTools Protocol's `Runtime.evaluate`. This
is the same route Chrome's remote debugging takes, it needs no chromedriver matched to the WebView's version, and it
runs the very script the other platforms run, where UIAutomator would have to press the keys by their position on the
screen. The app is ready when its page shows where it runs, which it learns from the port's first answer. The check
finds the SDK in `ANDROID_HOME` (or `ANDROID_SDK_ROOT`, or where Android Studio puts it) and the NDK in `NDK_HOME` (or
the newest in the SDK's `ndk/` folder), and needs `JAVA_HOME` for Gradle. When no emulator or device is running it boots
the AVD named in `STANCE_UI_AVD`, else the first whose name starts with `stance_`, else the first one the emulator
lists, with no window, waits until Android has finished booting, and shuts it down at the end. An AVD is made once:

```sh
sdkmanager "platform-tools" "build-tools;35.0.0" "platforms;android-36" "ndk;28.2.13676358" "emulator" \
  "system-images;android-35;google_apis;arm64-v8a" "cmdline-tools;latest"
avdmanager create avd -n stance_api35_arm64 -k "system-images;android-35;google_apis;arm64-v8a" -d pixel_7
```

A screenshot of a macOS window needs the Screen Recording permission (System Settings, Privacy & Security) for the
program that runs the check, such as the terminal; without it the macOS line says so, and the rest of the check is
unaffected. On Linux, Playwright has builds only for the distributions it lists, so on another one the three browsers
are reported skipped. On Windows, WebView2 opens a window only in an interactive desktop session: run over ssh, the
check builds the app and reports its launch skipped.

Each platform is reported at the furthest level it reached, and each level proves something more:

- **built**: the code base compiles for that platform, with the platform's own toolchain and webview library.
- **launched**: the app starts there, the webview loads the built page, the page runs and its first port call reaches
  the platform's side of the port and comes back.
- **end-to-end passed**: the app works there: real keys pressed in the real page, the machines stepping, the display
  showing the right result.
- **skipped**, with the reason: the machine cannot reach that platform (another operating system, no booted simulator,
  no Android SDK, JDK or AVD, no display). A skipped platform is a note, never a pass.
- **failed**: something that should have worked did not; this is the check's only problem, and it fails the check.

## The checks

```sh
deno task check                          # this repository
deno task check --project <app folder>   # any project with a stance-ui.json
deno task check --only tokens,no-raw-literals --json
```

| Check               | What it holds                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens`            | The token files follow the DTCG format: structure, names, `$type` (own or inherited), aliases that resolve without cycles, and each type's value. Every mood board defines the same tokens with the same types.                 |
| `no-raw-literals`   | No raw colour, size or duration in a component, and every `var(--x)` names a token of the mood board or a custom property the component declares itself.                                                                        |
| `component-imports` | A component imports only Svelte, other components, the widget set's index and the store module, and anything else only as a type. A widget of the set does not import the store.                                                |
| `svelte-check`      | The project type-checks, which includes refusing a write to the store, an entry or a view.                                                                                                                                      |
| `contrast`          | Every pair in the contrast file reaches 4.5:1 (text) or 3:1 (controls, focus rings), computed with WCAG's formula from the tokens of every theme of every mood board.                                                           |
| `no-raw-drag`       | Only the widget set's `Draggable` handles dragging: elsewhere, a pointer, mouse or touch move handler, an HTML5 drag event, a `draggable` attribute, `setPointerCapture` or such a listener added in a script is refused.       |
| `auth-only`         | Only the widget set's `Auth` asks for a secret: elsewhere, `type="password"` (as text or as a string in an expression) or an `autocomplete` of current-password, new-password or one-time-code is refused, in markup or script. |
| `a11y`              | Each page passes axe-core at WCAG 2.2 AA with no violation; Tab reaches every control, which shows a focus ring and is not covered; the page fits at 320 CSS px wide and with text at 200%.                                     |
| `target-size`       | Every pointer target is at least 24 by 24 CSS px, or its 24 px circle meets no other target (SC 2.5.8). A control inside its label counts with the label.                                                                       |
| `reduced-motion`    | With reduced motion asked for, no element or pseudo-element has a transition or an animation that lasts any time.                                                                                                               |

The components are parsed with Svelte's own compiler and each CSS value with postcss-value-parser, and the token files
are read as JSON and walked as data. The browser checks open the app's built pages in headless Chromium (Playwright),
served over HTTP on the loopback address for the run. Each page is opened in the light and the dark theme (through
`prefers-color-scheme`) and on a desktop (1280 by 800) and a phone (390 by 844), and in each state its configuration
reaches by clicking. A problem names the page, the state and every variant it was seen in. A project that lists no page
fails them rather than passing unseen. Two things are outside what a static check can see. A style value computed by an
expression (`style:width={w}`) is not checked. And whether a component's own `$state` is really UI state, rather than
app state kept in the wrong place, is a judgment left to review.

Every run of `deno task check` records, in `stance-ui.checked.json` beside `stance-ui.json`, whether each check passed,
how many problems it found, when, and a fingerprint of the files the checks read. `stance-ui status` compares it with
the files as they are now. The record describes one checkout, so it belongs in the project's `.gitignore`. With
`--changed '<json list of files>'`, the checks run only when one of those files is one they read; `--no-record` skips
the record.

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
    "tsconfig": "tsconfig.json",
    "contrast": "tokens/contrast.json",
    "pages": [
      {
        "name": "home",
        "path": "dist/index.html",
        "build": ["deno", "task", "build"],
        "states": [{ "name": "menu open", "click": ["[aria-haspopup=menu]"] }]
      }
    ]
  }
}
```

`moods` is optional, and `tsconfig` set to `null` skips the type check. A page's `path` is its built HTML file; `build`
is run from the root before the pages are opened, once for each distinct command; `click` takes Playwright selectors.

## Adopting the stance in a project

The widget set is not a package the project depends on. Its source is copied into the project, where it belongs to the
project and can be edited like any other file. The copy records which version of the stance it came from, so a later
update can be compared with what the project changed.

1. Copy the stance in, choosing the mood board:

   ```sh
   deno task adopt --project <app folder> --mood white
   ```

   This copies the widget set to `src/lib/ui/components/`, the store module to `src/lib/ui/store/`, the theme machine
   and its port to `src/lib/ui/theme/`, the sign-in machine to `src/lib/ui/auth/`, the platform port to
   `src/lib/ui/platform/`, the mood board with both themes and the contrast pairs to `tokens/`, and the token build to
   `scripts/stance-ui-tokens.ts` (use `--to` for another place than `src/lib/ui`). It writes `stance-ui.json`, which
   records the stance's version and commit, the mood board, and the sha256 of every file as it was copied, and which
   configures the checks.

   It then writes what a new project needs to build and run, from `scaffold/`: `deno.json` with its tasks,
   `package.json` with the npm packages at the stance's exact versions, `tsconfig.json`, `vite.config.ts`, `index.html`,
   `.gitignore`, and a minimal app wired to the store (`src/main.ts`, `src/App.svelte`, `src/app.svelte.ts`, a counter
   machine in `src/machines/` and its test in `test/`). These files are the project's from the start: a file the project
   already has is never overwritten, and adopt prints `skipped <file>` for it. `--no-scaffold` writes none of them.
   Last, it builds the mood board, both themes, into `src/lib/ui/tokens.css`, which `src/main.ts` imports.

2. Build and run it. In an empty folder, these work straight after adopt, with no edit:

   ```sh
   deno task dev     # the tokens, then Vite's dev server
   deno task build   # the tokens, then the app into dist/
   deno task test    # the tests in test/
   deno task check   # the type check (svelte-check)
   ```

   **Tests go in `test/`, outside `tsconfig.json`'s `include`.** The type check reads `src/` only (and skips any
   `*.test.ts`); `deno test` type-checks and runs the tests itself. A test imports the plain logic of a machine (its
   `initial`, `step` and `allowed`, as `src/machines/counter.ts` has them), which runs without Svelte and without a
   browser.

3. Replace the counter with the app's machines, in the store made in `src/app.svelte.ts`, and its page with the app's
   components. The theme machine stays.

4. `stance-ui.json` lists the scaffold's page, `dist/index.html`, built by `deno task build`, under `check.pages`; add
   the app's other pages and states there, so the browser checks open them.

5. Run the stance's checks, from this repository (`deno task check --project <app folder>`) or through Naima (below).

Later, `deno task adopt --project <app folder> --status` lists the files the project customized since the copy (their
sha256 is no longer the one recorded), the files that are newer in the stance, and, for each check, whether it passed
after the last change to the files it reads, failed, or has not run since. Running `adopt` again updates the files the
project has not changed. It refuses to overwrite a file the project did change, or one that was there before and never
came from the stance, and names each of them so they can be merged by hand. `--force` overwrites them anyway.

## As a Naima plugin

`plugin/index.mjs` is written to Naima's plugin contract 4. It reads the rules in `rules/` (`plugin/rules.mjs`) and
ships them to the rules point, so `naima rules` lists them for every agent of the project. It contributes one Naima
check per stance check (`ui-tokens`, `ui-contrast`, `ui-no-raw-literals`, `ui-component-imports`, `ui-svelte-check`,
`ui-no-raw-drag`, `ui-auth-only`, `ui-a11y`, `ui-target-size`, `ui-reduced-motion`), so `naima check` runs them. And it
adds `naima stance-ui adopt | status | check | hook`. The plugin file is plain JavaScript and imports only the runtime's
own modules, so it loads under Deno, Node and Bun alike. The checks themselves run in a child process under Deno, from
the plugin's checkout, so Deno must be on the PATH.

`naima-stance.json`, at the root, says as data that this repository is a stance: its name, the kind `stance`, where its
plugin's module is, its examples and who made it. `naima stances` reads that file to list the stance; when the stance is
adopted, Naima loads the plugin and checks its kind again. A test keeps the file equal to what the plugin declares.

When a project customizes its mood board, its tokens or its widgets, the checks run again at two moments.

- **Before the change lands.** The plugin contributes a landing report, `ui-stance-checks`, to the coordination plugin's
  `landing-reports` point. `naima land` asks it before the trunk moves, on the branch's files: when the landing changes
  a file the checks read (a token file, a mood board, the contrast pairs, a widget, a component or `stance-ui.json`),
  every check runs, browser checks included, and each problem refuses the landing. The report is a `refuses` one, so
  Naima says the branch fails a check, and `--stale-proofs` does not let it through. A checker that cannot run refuses
  it too, since the change was not checked. A landing that changes none of those files runs nothing.
- **Right after an agent's edit.** The plugin contributes an agent hook, `ui-edit-hook`: a `PostToolUse` hook on
  `Edit|Write|MultiEdit` that runs `naima stance-ui hook`. Naima installs it in the agent tool's settings
  (`.claude/settings.json` for Claude Code) at `naima stance adopt`, `naima init` and `naima update`, beside the
  project's own hooks and Naima's, and removes it if the stance is removed. The plugin itself writes none of the
  project's settings. The hook reads the edited file from the hook's input and, when the checks read it, runs the fast
  ones (all but `svelte-check` and the browser checks). It is silent when they pass; otherwise it prints the problems
  and exits 2, which Claude Code shows the agent.

`naima stance-ui status` then says which files the project customized since it adopted the stance and whether the checks
passed after the last change.

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

Naima's contract already supports a plugin like this one, and this would make it better.

- **A plugin cannot ship scaffolding as such.** Copying the widget set is a command of this plugin. A contribution point
  for scaffolds (files a plugin offers to copy into a project, with the version recorded) would let Naima list and
  update them for every stance in the same way.

## Developing

```sh
deno task platforms      # build, launch and drive the calculator on every platform this machine reaches
deno task test           # the checks against their fixtures, the copy, the plugin, the token build and the demo build
deno task check          # this repository against its own stance, the browser checks on the gallery,
                         # the calculator and the demo included
deno task gallery        # the widget gallery with Vite's dev server
deno fmt && deno lint
```

`test/fixtures/clean` is a small project that passes every check. `test/fixtures/violating` breaks each rule in each way
the checks know. `test/fixtures/inaccessible` has a dark theme below the contrast minimums and a page that fails axe,
the keyboard walk, reflow, the target size and reduced motion. `test/fixtures/types` writes to the store around its
transitions and must fail the type check.

## Licence

MIT, by makebecome: [LICENSE](LICENSE).
