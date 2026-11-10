---
name: ui-fluid-intrinsic-layout
title: "Layout is intrinsic: a component adapts to the space it is given, and only the page frame answers the window"
audience: everyone
strength: must
enforcedBy: ui-fluid
verifiedBy: ui-fluid
---

Layout is made of boxes that take the space they are given: grid and flex with `minmax()`, `auto-fit` and `auto-fill`,
`min()`, `max()` and `fr`, so that the same component fills a narrow panel, a wide column or a phone without being told.
When a component must change its arrangement, it asks its container (`@container`, with `container-type: inline-size` on
the box that holds it) and never the window, since the same component sits in a panel, a dialog and a page. A viewport
media query (`@media (width >= 840px)`) is for the page frame only: the shell, the top bar, the main column, the slot
for a left panel. Every direction is written logically (`margin-inline`, `padding-block`, `inset-inline-start`,
`text-align: start`), so that a right-to-left language mirrors the layout without a second one.

Do: `grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr))`, and `@container (inline-size > 30rem)` in
a card. Don't: `@media (max-width: 600px) { .card { ... } }`, a `width: 600px`, or `margin-left`.

The check reads the page's stylesheets as the browser holds them, so it reads a built bundle as well as a source. It
refuses a rule in a viewport media query whose subject is not the page frame (`html`, `body`, `main`, `header`, `nav`,
`footer`, `aside`, `#app` or an element marked `data-frame` or `data-slot`), and each physical property (`margin-left`,
`padding-right`, `left`, `right`, `border-left`, `text-align: left`, `float: left`).

## Why

a breakpoint is a guess about a window, and a component is not always in the window's width: put in a side panel, it
breaks at the breakpoint of the page. A component that answers its container is right wherever it is put, and an
intrinsic layout has no breakpoints to keep in step.
