---
name: ui-layout-in-css
title: "Layout is the browser's: boxes and CSS place and size everything, and no script computes a position or a size"
audience: everyone
strength: must
enforcedBy: ui-layout-in-css
verifiedBy: ui-layout-in-css
---

Where things go on the page and how big they are is declared with elements and CSS: flex and grid boxes, their
`flex-grow` shares and `gap`s, `fr` tracks, percentages, `min`/`max` sizes, `aspect-ratio`, container queries,
`position: sticky` and `inset` against a box that has its size from the layout. A script never reads the size of the
window or of an element to compute where something else goes or how big it is, and never writes pixel positions or
sizes for layout (no `style.left = …px`, no `height: calc(100vh - <measured>px)`, no layout loops in
`requestAnimationFrame`). A layout that must fill the window is a box the window's size (`position: fixed; inset: 0`,
or a column of `100dvh`) whose children divide it with flex or grid; a split that the person resizes is a flex box whose
sides' `flex-grow` shares are the state.

What stays in script: a drawing's own coordinates inside an SVG (a graph's nodes, a timeline's ticks), which the browser
then scales with `viewBox`; the reading of a pointer's travel during a drag, turned into a share or a choice; and
`scrollIntoView` to bring something into view. Fitting a drawing to its box is `preserveAspectRatio`, not a computed
zoom.

## Why

a layout computed in script measures at one moment and is wrong the next: a font loads, a header wraps, a browser
reports its window differently, and the content runs past the window's edge or leaves a gap, as it did when the Models
tab's mosaic measured its own top and height and ran off the bottom in one browser. The browser re-lays out boxes on
every change, for free and correctly; a script that does it again only adds a second, staler answer.
