---
name: ui-design
description: Design the look of an app that uses the UI stance with its owner, step by step (mood board, palette, typography, icon set, widget shapes, screens), showing about five live variants of the real app in light and dark at each step and refining until the owner accepts. Use when the owner asks for a UI, or to design, restyle or choose the look of the app, its colours, fonts, shapes or screens.
---

Follow `method/design.md` in the UI stance's repository (naima-stance-ui). In short:

- Before building anything, propose the method. Say in a few plain sentences that the work goes in six steps (mood
  board, palette, typography, icons, widget shapes, screens), each closed when the owner chooses among live variants,
  and offer to explain the method and each step. Say why the order matters: the mood board settles the app's character
  before any detail; the palette, the type and the shapes become tokens that every screen reuses; the screens come last,
  so they are built from settled parts.
- Close the steps one at a time, in order. Say which step you are on. A step changes only its own tokens; never reopen
  an earlier step without the owner's yes.
- Rounds are counted within a step, and in the screens step within each screen: design one screen at a time, each from
  round 1. Always name a round with its step and screen ("home screen, round 2").
- Each round: copy `tokens/` into `design/<step>/round-<n>/a` to `e`, change only the step's tokens, write one line per
  variant in `notes.md`, then run `deno run -A <stance>/scripts/variants.ts --from design/<step>/round-<n> --serve 4310`
  and open the page for the owner. For screens, use `--builds` on `design/screens/<screen>/round-<n>` instead.
- Variants must differ visibly at first glance. If the difference is inside a popover or a hover state, put a real-size
  crop of that region above each frame. Variants that look alike to the owner waste the round.
- Before the app exists, screens are static layout prototypes: plain HTML on the final tokens, showing the project's
  real data read-only with private details removed, placeholders marked as such. Build the real app only once the
  screens are chosen.
- The icons step offers only the stance's predefined sets (Lucide, Phosphor, Tabler Icons, Heroicons, Material Symbols;
  `checks/icons.ts`), one per variant in round one, as static prototypes showing the app's icons from each set. The
  chosen set is written as `check.icons` in `stance-ui.json`, its Svelte package added, and recorded as a decision.
  Never draw an icon or take one from another library: the icons check refuses it.
- Fix or drop every variant the page marks with problems before the owner sees it.
- Ask one question: which variant, or which combination, and what to change. Next round: the pick unchanged as `a`, plus
  two to four variants that each change one thing the owner asked about.
- When the owner accepts: copy the variant over `tokens/`, build, run the stance's checks, add the entry to
  `design/decisions.md`, and in a Naima project record it as a decided discussion with `naima decide`. Then the step is
  closed.
- Nothing a design shows is promised until the owner confirms it. Before a step closes, and before each screen is
  accepted, list every feature the chosen design (or a mockup or screenshot the owner brought) shows that the app does
  not have yet, ask the owner for each one whether it is to be built, and repeat each answer back to confirm it. Write
  the promised and the only illustrative features into the decision's entry; in a Naima project file each promised one
  as a feature item.
- Keep the rounds, their comparison pages and a record page linking them as the design record. After each screen is
  built, show it side by side with its chosen prototype and let the owner judge whether it matches.
