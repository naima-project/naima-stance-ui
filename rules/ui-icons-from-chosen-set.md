---
name: ui-icons-from-chosen-set
title: "Every icon comes from the one icon set chosen at design time"
audience: everyone
strength: must
enforcedBy: ui-icons
verifiedBy: ui-icons
---

The stance offers a few predefined icon sets, each published under an open licence, maintained, and usable from Svelte
through a package: Lucide, Phosphor, Tabler Icons, Heroicons and Material Symbols (`checks/icons.ts` lists them). The
owner chooses one in the design method's icons step, and the choice is recorded in the design record and in
`stance-ui.json` as `check.icons`. Every icon of the app then comes from that set, through its package. No icon is drawn
by hand as inline SVG, imported as an SVG file, or taken from another icon library or icon font. A component that draws
something that is not an icon, such as a chart or a diagram, is listed under `check.icons.drawings` and may hold SVG.

## Why

icons from one set share a grid, a stroke and a style, so the interface reads as one design; a set that is published and
maintained has the icons the app will need later, under a licence the project can ship, and an icon drawn ad hoc or
taken from a second library is what a check can see and refuse.
