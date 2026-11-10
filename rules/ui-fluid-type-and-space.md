---
name: ui-fluid-type-and-space
title: "Type and space scale fluidly from rem tokens, and no font size is fixed in pixels"
audience: everyone
strength: must
enforcedBy: ui-type-scale
verifiedBy: ui-type-scale
---

Every font size and space is a design token in `rem`, so that it follows the size the reader chose in the browser (SC
1.4.4). A size that grows with the window is a token made with `clamp()` whose bounds are `rem` and whose middle is
`rem` plus a viewport term, such as `clamp(1rem, 0.9rem + 0.5vw, 1.25rem)`, and its smallest value is still at least the
reader's default size. Nothing sets the root's font size in pixels, and nothing sets a font size in `px`, in `vw` alone
or in `vh`; line heights are unitless.

Do: `font-size: var(--font-size-body)` where the token is `clamp(1rem, 0.95rem + 0.3vw, 1.125rem)`. Don't:
`html { font-size:
14px }`, `font-size: 13px`, `font-size: 4vw`.

The check refuses a rule in the page's stylesheets that sets a font size in pixels or in viewport units with no `rem`
term (the root's size in pixels is named apart, as it overrides the reader's whole setting), and sets the root to 200%
in a phone window to refuse each piece of text that does not grow with it: a control that does not inherit its font is
the usual one.

## Why

a reader who sets a larger text size should get larger text everywhere; a size in pixels ignores them, and a size in
`vw` alone does not grow when they zoom the text. Fluid sizes between two bounds spare a layout a step at each
breakpoint.
