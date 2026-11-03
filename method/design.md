# Designing the interface: the stance's method

This is how an agent designs the look of an app that adopts the UI stance, together with the owner. It goes in five
steps, closed one at a time and in this order: mood board, palette, typography, widget shapes, screens. Each step works
the same way. The agent builds about five variants of the real app, live, in light and dark. The owner looks at them
side by side, picks one or a combination, and says what to change. The agent builds the next round from that answer, and
keeps going until the owner accepts one. The choice is then written into the project's tokens and recorded as a
decision, and the step is closed. A later step never reopens an earlier one without the owner asking.

A step can take several rounds. Rounds are counted within a step, starting at 1, and in the screens step each screen
counts its own: the home screen's round 2 and the settings screen's round 2 are different rounds. Always name a round
with its step, and with its screen in the screens step, so the owner knows which one is meant.

The steps are also declared as data in `naima-plugin.json`, under `contributes.methods`, as the method `design`. In a
Naima that supports methods, a gate can follow it (`naima gate set <gate> --method stance-ui/design`), and each step
becomes a sub-goal of the gate that closes when its decision is recorded.

## Proposing the method

When the owner asks for a UI, or for a new look for one, the agent proposes this method before it builds anything. In a
few plain sentences it says that the work goes in five steps, each closed by the owner's choice among live variants, and
offers to explain the method and each step in more detail. It says why the steps come in this order:

- The mood board settles the character of the app (light or dark, warm or cool, quiet or lively) before any detail is
  discussed, so that later choices are made against one direction rather than argued one by one.
- The palette, the typography and the widget shapes become design tokens. Every screen reuses them, so a choice made
  once holds everywhere, and changing it later means changing one value rather than every screen.
- The screens come last, so that each one is built from parts that are already settled, and a round of screens is about
  layout alone.

If the owner prefers to skip a step or to start from an existing design, the agent records that choice and starts from
the step that is still open.

## Why this method

Agents now build the real app as fast as a mockup used to be drawn; the method keeps the design practice that still
holds.

- Several designs shown together beat one design improved in turn. In Dow et al.'s study, people who made several
  prototypes before feedback produced better and more varied work than those who iterated on one
  ([Parallel prototyping, ACM TOCHI 2010](https://cs303.stanford.edu/papers/ParallelPrototyping2010-final.pdf)). Users
  shown several alternatives also criticise more freely than users shown one (Tohidi et al., "Getting the right design
  and the design right", CHI 2006). Hence about five variants per round.
- Each round first widens, then narrows: the divergent and convergent halves of the Design Council's
  [Double Diamond](https://www.designcouncil.org.uk/our-resources/the-double-diamond/history-of-the-double-diamond/).
  Round one spans a wide range; later rounds stay close to what the owner chose.
- Picking from a gallery is easier than describing a wish. Choosing among rendered variants and asking for more like one
  goes back to Marks et al.'s Design Galleries (SIGGRAPH 1997); the owner's "this one, but warmer" is that loop.
- A mood board settles the visual language before any screen exists. Samantha Warren's
  [style tiles](https://adactio.com/links/5295) show colour, type and interface elements on one page without a full
  mockup; here the style tile is the widget gallery itself, rendered with the variant's tokens.
- Small parts first, then larger ones: Brad Frost's [Atomic Design](https://atomicdesign.bradfrost.com/) builds pages
  from components and components from primitives. The steps follow that order, ending with screens.
- Design tokens are the single source of truth for the design's values; the W3C community group's format reached its
  first stable version, 2025.10, with theming built in
  ([announcement](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/)).
  A variant is a token folder, so the chosen one is already the deliverable.
- Tools that generate interfaces now offer several working variants from one prompt, and their reviewers point out that
  code shows states, sizes and dark mode that static mockups hide
  ([Runway](https://runway.com/resources/ai-prototyping), [Banani](https://banani.co/blog/best-ai-prototyping-tools)).
  Generic output is their common weakness, which the stance's own widget set and tokens avoid.
- Contrast (WCAG 2.2 SC 1.4.3 and 1.4.11) is checked on every variant before the owner sees it.

## How every step works

1. **Prepare.** Read the step's inputs below, the earlier decisions in `design/decisions.md`, and the project's current
   tokens (`tokens/`, the folder `stance-ui.json` names under `check.tokens`).
2. **Make the round.** Create `design/<step>/round-<n>/`, and in it one folder per variant, named `a` to `e`. Each
   variant is a full copy of the current tokens with only this step's tokens changed:
   `cp -R tokens design/palette/round-1/a`, then edit the copy. Write `design/<step>/round-<n>/notes.md` with one line
   per variant saying what it tries ("a: cool grey surfaces, blue accent").

   The variants must look different at first glance. If what a variant changes is only visible inside a popover, a menu
   or a hover state, the comparison page shows a crop of that region at real size above each frame, so the owner sees
   the difference without opening anything. A round whose variants look alike to the owner gives nothing to choose from:
   make the differences larger, or show the region where they are, before calling the round ready.
3. **Check and show.** From the project's root run the stance's preview, with `<stance>` the path of the stance
   repository:

   ```sh
   deno run -A <stance>/scripts/variants.ts --from design/palette/round-1 --serve 4310
   ```

   (In the stance repository itself: `deno task variants --from <dir> --serve 4310`.) It checks every variant, builds
   the gallery once and writes `design/palette/round-1/preview/index.html`: a column per variant, light above dark, each
   a frame of the real widget gallery with that variant's tokens. Open `http://127.0.0.1:4310/` in the owner's browser
   (`open http://127.0.0.1:4310/` on macOS). The page can show light only, dark only or both, and the columns at phone,
   tablet or desktop width.
4. **Fix before showing.** A variant whose column says "problems: fix before choosing" has a missing token or a contrast
   pair below 4.5:1 for text or 3:1 for controls and focus rings, in light or dark. Fix it or drop it before telling the
   owner the round is ready. Never ask the owner to choose a variant that fails.
5. **Ask.** Tell the owner the URL and the one-line notes, and ask one question: which one, or which parts of which, and
   what to change. The owner may pick ("c"), combine ("c, with the accent of a") or refine ("c, but warmer").
6. **Next round.** Make `round-<n+1>` from the answer: the owner's pick, or the combination, unchanged as `a`, so the
   owner can compare against it, then two to four variants that each change one thing the owner asked about, in
   different amounts. Later rounds are smaller than the first. If after three rounds the owner is still undecided, ask
   what is missing instead of making more variants.
7. **Close.** When the owner accepts a variant, copy its folder over `tokens/` (only this step's files and groups
   change; check with `git diff tokens/`), build the CSS (`deno task tokens` or the project's build), run
   `deno task check` or `naima stance-ui check`, and record the decision (below). The step is closed when all of that is
   done.

Keep the `design/` folder in the repository: the rounds are the record of how the design was reached, and a step can be
reopened from them.

### Recording the decision

Add an entry to `design/decisions.md`:

```md
## 2026-11-02 palette: variant c of round 2

Chosen by the owner: "c, with the accent of a, a little less saturated". Rounds: 2 (design/palette/round-1, round-2).
Changed: tokens/themes/*/color.tokens.json. Checks: tokens and contrast pass in light and dark.
```

Every closed step gets its entry, and in the screens step every closed screen gets one.

In a project tracked by Naima, also record it there: file the step as a discussion and close it with
`naima decide <discussion> "<the decision>"`, so that `naima decisions palette` finds it later. When a gate follows the
method, the decided discussion also closes the step: `naima gate step <gate> palette --by <discussion>`.

### The design record

The rounds, their comparison pages and a record page that links them in order (one line per step and per screen, naming
the round and the variant chosen) together make the design record. It is kept in the project as the reference the built
interface has to match or improve on. After a screen is implemented in the real app, the agent shows the built screen
side by side with the prototype that was chosen for it, in light and dark, and the owner judges whether it matches. A
difference the owner does not accept is fixed in the app, not in the record.

### What the designs promise

Mockups, screenshots, prototypes and variants show more than the app will have: a button with nothing behind it yet, a
chart drawn from sample data, a panel added to fill the layout. An owner who sees a feature in a design can easily take
it as promised. So nothing a design shows counts as promised until the owner has confirmed it.

Before a step closes, and in the screens step before each screen is accepted, the agent goes through what the chosen
design shows and lists every feature the app does not have yet, one line each, naming where it appears ("home screen,
round 3, variant b: the export button in the toolbar"). It does the same for a mockup, a screenshot or a design the
owner brings as a reference. Then it asks the owner, feature by feature, whether it is to be built, and repeats each
answer back for the owner to confirm. A feature counts as promised only once the owner has confirmed it.

The answers go into the decision's entry in `design/decisions.md`, in two lists:

```md
Promised: the export button in the toolbar; the weekly summary card. Only illustrative: the chart on the right (sample
data); the share menu.
```

In a project tracked by Naima, each promised feature is also filed as a feature item, so that it is planned and tracked
like any other. A feature the owner did not confirm stays only illustrative: the prototype marks it so where it appears,
and the built app is not expected to have it. If the owner later wants it, it is asked for and confirmed then, like any
other feature.

### Keeping later steps consistent

- A step changes only its own tokens (the table below). Every other token stays as the earlier steps left it. Before
  showing a round, compare each variant with `tokens/` (`git diff --no-index tokens design/<step>/round-<n>/b`); a
  change outside the step's tokens is a mistake to undo, not a variant.
- If a later step seems to need an earlier one changed (a font that needs a darker text colour), stop and ask the owner
  whether to reopen that step. If yes, reopen it as a new round of that step, record it, then come back.
- Every variant is built from the current `tokens/`, so each round already shows the earlier choices.

## The steps

| Step             | Changes only                                                      | Fixed from earlier steps   |
| ---------------- | ----------------------------------------------------------------- | -------------------------- |
| 1. Mood board    | all tokens (whole mood board)                                     | nothing                    |
| 2. Palette       | `themes/light` and `themes/dark` colours                          | the mood board's character |
| 3. Typography    | `typography.tokens.json`                                          | palette                    |
| 4. Widget shapes | `radius`, `spacing` (sizes, borders), `motion`, `themes/*/shadow` | palette, typography        |
| 5. Screens       | the app's screen components, no tokens                            | every token                |

### 1. Mood board

- **Inputs:** the owner's brief: who uses the app, where and on what devices, three to five words for how it should
  feel, and any references they like (apps, sites, pictures). The stance's mood boards (`white`, `dusk`, `calm`) as
  starting points.
- **Variants differ on:** the whole character: light or dark by nature, warm or cool, quiet or lively, dense or airy,
  sharp or round, flat or deep, sans or serif. Round one spans these widely; at least one variant starts from each of
  the stance's mood boards that fits the brief.
- **Shown:** `--from design/mood/round-<n>`, the full gallery, light and dark.
- **Accessibility:** both themes pass every contrast pair; dark is designed, not inverted.
- **Exit:** the owner names one variant (or a combination) as the app's direction.
- **Written:** the chosen folder becomes `tokens/`; `stance-ui.json` keeps `check.tokens` pointing at it; decision
  recorded.

### 2. Palette

- **Inputs:** the chosen mood board; any brand colours the owner must keep; the contrast pairs in
  `tokens/contrast.json`.
- **Variants differ on:** surface colours and their steps (raised, sunken), text and muted text, the accent and its
  hover, the soft accent, focus, danger and success, borders, overlay. Each variant in light and dark.
- **Shown:** `--from design/palette/round-<n>`. Look especially at buttons, the dropdown open, the dialog, the sign-in
  error and the keypad.
- **Accessibility:** text 4.5:1, controls and focus rings 3:1 against every background they sit on, in both themes (the
  preview checks this). Danger and success are told apart by more than colour (the widgets add text or an icon).
- **Exit:** the owner accepts one palette in both themes.
- **Written:** `tokens/themes/light/color.tokens.json` and `tokens/themes/dark/color.tokens.json`; decision recorded.

### 3. Typography

- **Inputs:** the palette; the languages and scripts the app shows; whether it shows many numbers (tabular figures).
- **Variants differ on:** font families (body, display, mono), the size scale and its ratio, weights, line heights,
  letter spacing of display sizes, numerals. Prefer system fonts or fonts the project may ship.
- **Shown:** `--from design/typography/round-<n>`, at phone and desktop widths.
- **Accessibility:** body text no smaller than the stance's `font.size.md`, body line height at least 1.5, nothing
  clipped at 200% zoom (SC 1.4.4) and at 320 px width (SC 1.4.10); open the gallery directly and zoom to check.
- **Exit:** the owner accepts one type system.
- **Written:** `tokens/typography.tokens.json`; decision recorded.

### 4. Widget shapes

- **Inputs:** palette and typography; the devices from the brief (touch or pointer).
- **Variants differ on:** corner radius, border widths, spacing and density, control and key sizes, shadow depth, the
  focus ring's width and offset, motion durations and easing.
- **Shown:** `--from design/shapes/round-<n>`; try the widgets with the keyboard in the frames (Tab, arrows, Escape).
- **Accessibility:** targets at least 24 by 24 CSS px (SC 2.5.8), a visible focus ring at 3:1, nothing that only moves
  (motion tokens go to zero under reduced motion, which the build does).
- **Exit:** the owner accepts one set of shapes.
- **Written:** `tokens/radius.tokens.json`, `spacing.tokens.json`, `motion.tokens.json`,
  `tokens/themes/*/shadow.tokens.json`; decision recorded. After this step the tokens are final.

### 5. Screens

- **Inputs:** every earlier decision; the app's machines and their views (what each screen must show and allow); the
  list of screens, most used first. Screens are designed one at a time, and each screen has its own rounds, numbered
  from 1 (`design/screens/<screen>/round-<n>/`).
- **Prototypes before the app:** if the app does not exist yet, each variant is a static layout prototype, a plain HTML
  page in its own folder (`design/screens/home/round-1/a/index.html`) that loads the final token CSS. It shows the
  project's real data, read once and never written, with private details removed, and marks plainly anything that is
  only a placeholder. The real app is built once the screens are chosen, and is then compared with the prototypes (see
  the design record above). If the app exists, a variant is a build of it instead.
- **Real data and moments:** a prototype filled with the project's real data shows problems that invented data hides,
  such as long names, empty lists and uneven counts. As an example of a layout choice that real data can lead to: an app
  that shows a timeline or a history may show the whole screen at one moment at a time, the live state or a point the
  user selected, rather than opening side panels for the past.
- **Variants differ on:** layout and composition only: what is where, grouping, order, what is on the first view and
  what one tap away, using the widget set and the final tokens. No new colours or sizes: a need for one goes back to its
  step.
- **Shown:** build each variant of the app into its own folder and frame them together:

  ```sh
  deno run -A npm:vite@8.3.5 build . --outDir design/screens/<screen>/round-1/a   # once per variant
  deno run -A <stance>/scripts/variants.ts --builds design/screens/<screen>/round-1 --serve 4310
  ```

  Each variant is a prototype folder, or a build of a branch or worktree of the app, or of a set of alternative
  components switched by the build. Each frame's address ends in `#theme=light` or `#theme=dark`, and the variant shows
  that theme: an app reads it with `themeFromHash(location.hash)` from `src/lib/theme/variant.ts`, and a prototype sets
  `data-theme` on its root element from it with one line of script. Over http the page also sets the theme from outside;
  opened from `file://`, Safari allows no script to reach into a frame, so the hash is what works.
- **Accessibility:** `deno task check` on the chosen variant (axe, target size, reduced motion, contrast) passes; the
  screen works by keyboard alone; headings and landmarks make sense read aloud.
- **Exit:** the owner accepts the screen and has confirmed, feature by feature, which of the features it shows are to be
  built (see what the designs promise, above); repeat for the next screen, starting again from round 1, until the list
  is done.
- **Written:** the screen's components in the app; its page in `stance-ui.json` under `check.pages` so the browser
  checks cover it; decision recorded.
