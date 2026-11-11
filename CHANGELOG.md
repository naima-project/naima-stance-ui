# Changelog

## Unreleased

### The budget check serves the pages compressed

The browser checks serve the app's pages as a real server does: text files (HTML, JavaScript, CSS, JSON, SVG) gzip-compressed
when the browser sends `Accept-Encoding: gzip` (`checks/serve.ts`). The largest-paint time of the mobile profile is measured
over the slow network, and it now counts the same compressed transfer as the size budget, instead of about three times the
bytes.

### Agent parity: the user and an agent do the same things

Rule 27 says every change of the UI is a transition of a machine, in its own `.svelte.ts` file, and agents call those
same transitions. `deno task transitions` generates the registry from the machines (machine, name, arguments, what it
does; `@sequence` marks a named sequence of transitions, `@person` one for a person alone). When a project says yes to
MCP, `adopt --mcp` scaffolds the registry, the agent endpoint (`platform/agent-endpoint.ts`, the channel over the
bridge's feed `agent` and command `agent-answer`), the page's `serveAgent` (`src/lib/agent/agent.ts`) and an entry
`server/mcp.ts` with three tools, `store`, `transitions` and `transition`, beside the bridge's own read tool; `--mcp`
now takes the web server along. The checks `transitions` and `agent-endpoint` (`ui-transitions` and `ui-agent-endpoint`
in Naima) refuse a stale registry, a transition without a comment, a component that calls anything but a registered
transition, and an MCP server file that imports app logic. The demo has a `focus` machine of such sequences.

### The project chooses its icon set

The design method has a new step, icons, between typography and widget shapes. The owner chooses one of five predefined,
published open icon sets (Lucide, Phosphor, Tabler Icons, Heroicons, Material Symbols, listed with their licences and
Svelte packages in `checks/icons.ts` and the method), compared as prototypes of the app's own icons. The choice is
recorded in the design record and as `check.icons` in `stance-ui.json`. The new `icons` check (`ui-icons` in Naima, also
run by the hook) refuses an icon from outside that set in a component: another icon library or icon font, an imported
SVG file, or inline SVG, except in the components listed under `check.icons.drawings`. The rule
`ui-icons-from-chosen-set` states it.

### The project's own Rust, installed without admin rights

The project pins its Rust in `rust-toolchain.toml`, and `deno task toolchain` (`naima stance-ui toolchain` in a project)
installs it, with its targets, into `.stance-ui/rust/`. rustup-init's SHA-256 is checked before it runs. What needs
admin rights is looked for, not installed, and the command that installs it is printed. On Windows, Smart App Control is
reported. The platforms check builds with this Rust first, and from a Windows session with no desktop it launches the
app through a scheduled task in the desktop session. `adopt --tauri` writes the stance's `rust-toolchain.toml` into a
new project.

### The design method asks which features the designs promise

Before a step of the design method closes, and before each screen is accepted, the agent lists the features the chosen
design shows that the app does not have yet, asks the owner which are to be built and confirms each answer. The
decision's entry lists them as promised or only illustrative, and in a Naima project each promised one is filed as a
feature item. `method/design.md`, the skill and the rule on proposing the method say so.

### The landing report records nothing

The landing report runs the checks with `--no-record`, so a landing leaves no `stance-ui.checked.json` in the checkout
it looked at. It is marked `heavy`, so a landing on a development line runs it only on the declared landing host.

### Paths on Windows

The checks, the hook, the scripts and the tests make paths with the operating system's own rules instead of POSIX ones:
a module's folder comes from its file URL, and a Windows path such as `C:\app` is absolute to them.

### The platforms check serves an app's backend on the web

`stance-ui.json`'s `check.platforms.web` names a module whose `handlers` and `feeds` the stance's server answers the
bridge with while the web platform's page runs, so that an app with a backend, or a stand-in for it, passes its
end-to-end script in the browsers too.

### The bridge carries feeds: events the backend pushes

`Bridge` has a second method, `listen(feed, on)`, which hears each event the backend pushes on a named feed until the
function it returns is called, so a machine can follow "the data changed" without polling and without reaching past the
bridge.

- `localBridge(handlers, feeds)` makes a feed in the page; `connect()` takes `feeds` too.
- `webBridge(url)` opens a feed as `GET <url>/<feed>`, a stream of server-sent events, one JSON event each.
- `tauriBridge()` hears a feed as the Tauri event of the same name, which the shell emits.
- The bridge's contract over HTTP moved into `platform/bridge-handler.ts`, a request handler on the web's own `Request`,
  `Response` and streams that imports nothing, so that a backend on Node or Bun mounts it too. It takes `feeds` and an
  `otherwise` handler for every other request; `platform/server.ts` keeps `bridgeHandler` with its `static` folder on
  top of it. `adopt --server` copies both, to `server/bridge-server.ts` and `server/bridge-handler.ts`.

### Responsive design: rules 17 to 25 and nine checks

The stance has a complete set of responsive rules, each with a check, run in one testing matrix (`checks/matrix.ts`: six
widths from 320 to 1920 CSS px, a mouse and a finger, light and dark, text at 100% and 200%). New checks: `reflow`,
`fluid`, `type-scale`, `input-modes`, `viewport`, `nav`, `media`, `budget` and `preferences`, each also a Naima check
(`ui-reflow` and so on). The browser checks now open every width of the matrix and not only a desktop and a phone, and
`check.budget` in `stance-ui.json` sets a project's own performance budget. A project adopted earlier meets the new
checks on its next run: see [Responsive design](README.md#responsive-design).

The widget set, the gallery, the demo and the calculator hold to the new rules. A control is 44 CSS px high (the token
`size.control` is 2.75rem) for every pointer, the keycaps, the drag handles and the buttons keep a transparent border
for forced colours, a menu, a dialog, a button and a drag row stay inside a 320 px window at 200% text, and each mood
board has a `light-more` and a `dark-more` theme (colour tokens at 7:1 for text) that the token build writes under
`prefers-contrast: more`. The contrast check holds those themes to 7:1 and 4.5:1. Fixes to three checks: the keyboard
probe skips a field behind a modal dialog, the text-over-text probe skips popups placed by their anchor, and the type
probe no longer reads a font size in the middle of a transition.

### The platform port is now the platform bridge

The interface through which the app's machines reach whatever lies outside the page was called a port, after the
ports-and-adapters pattern, and read as a network port. It is now called a bridge everywhere in the stance.

- `src/lib/platform/port.ts` is now `src/lib/platform/bridge.ts`: `Port` is `Bridge`, `PortError` is `BridgeError`,
  `localPort`, `webPort` and `tauriPort` are `localBridge`, `webBridge` and `tauriBridge`. `connect()` keeps its name.
- `platform/server.ts`: `portHandler` and `servePort` are `bridgeHandler` and `serveBridge`, `PortServerOptions` is
  `BridgeServerOptions`, and the commands' default prefix is `/bridge/` instead of `/port/`.
- The Tauri shell's commands moved from `src/port.rs` to `src/bridge.rs`; the commands keep their names. The shell's
  ready line is now `bridge: <command> -> ...`.
- `adopt` copies `bridge.ts` (with `port.ts`) to `<to>/platform/`, and the server, with `--server`, to
  `server/bridge-server.ts`. A project adopted earlier keeps its `src-tauri/src/port.rs` and `server/port-server.ts`,
  which adopt names as no longer in the stance.
- The network sense of port is unchanged: a listening port number is still `port`.

Deprecated, for one release, then removed: `port.ts` remains and re-exports `bridge.ts` together with the old names
`Port`, `PortError`, `localPort`, `webPort` and `tauriPort`; `platform/server.ts` still exports `portHandler`,
`servePort` and `PortServerOptions`, and, when no prefix is given, answers at `/port/` as well as at `/bridge/`. The
platforms check accepts a shell's old `port: <command>` ready line too.

### A machine's port is now its outputs

The object passed to a machine to carry out its output actions was called its port, a name the platform bridge also used
to have. It is now called the machine's outputs, matching the inputs and outputs of the models.

- `src/lib/theme/theme.svelte.ts`: `ThemePort` is `ThemeOutputs`; `documentTheme()` returns `ThemeOutputs`.
- `src/lib/auth/auth.svelte.ts`: `AuthPort` is `AuthOutputs`; `new Auth(outputs)`.
- A machine generated by naima-codegen exports `<Name>Outputs`: the calculator's `ControlPort` is `ControlOutputs`, and
  its generated module is regenerated with naima-codegen's outputs rename.
- The machines written by hand in the shape naima-codegen emits follow: the scaffold's `CounterOutputs`, the demo's
  `TasksOutputs`, the calculator's `HostOutputs`. A project scaffolded earlier keeps its own copy, which nothing
  renames.
- README and rules say outputs where they said a machine's port.

Deprecated, for one release, then removed: `ThemePort` and `AuthPort` remain as aliases of `ThemeOutputs` and
`AuthOutputs`, and a generated module still exports `<Name>Port` as an alias of `<Name>Outputs`.
