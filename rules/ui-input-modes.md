---
name: ui-input-modes
title: "The interface works with a mouse, a finger, a pen and a keyboard: nothing only on hover, targets for a finger"
audience: everyone
strength: must
enforcedBy: ui-input-modes
verifiedBy: ui-input-modes
---

The page asks the browser what the user points with (`@media (pointer: coarse)`, `(hover: hover)`,
`(any-pointer: fine)`) and never guesses it from the window's width, since a tablet has a finger at 1024 px and a laptop
may have a touch screen. Nothing is available only by hovering: what a hover shows (a menu, the actions of a row, a
tooltip with the only copy of a label) is on screen at all times on a device that cannot hover, and also by focus. Every
target is at least 24 by 24 CSS px (SC 2.5.8), and at least 44 by 44 CSS px on a coarse pointer (the size of Apple's and
Material's own touch targets), with its whole box active. Nothing needs a gesture (a pinch, a swipe, a long press, a
drag, two fingers) that a single tap or click cannot do as well (SC 2.5.1), and nothing is done only by dragging (SC
2.5.7, rule 10).

Do: `.row:hover .actions` inside `@media (hover: hover)`, with the actions shown by default; `min-block-size: 2.75rem`
on a control under `@media (pointer: coarse)`. Don't: `.row:hover .actions { opacity: 1 }` with the actions hidden
otherwise, or a swipe as the only way to delete.

The check opens every width with a finger (touch events, a coarse pointer and no hover) and refuses a target below 44 by
44 CSS px, wherever it is, a link inside a sentence excepted; it refuses a rule that reveals something on `:hover`
outside `@media (hover: hover)`. The target size of 24 CSS px is the check `target-size`'s, and a drag or a touch
handler written outside the widget set is `no-raw-drag`'s.

## Why

a finger is about 10 mm wide and covers what it touches; a target of the mouse's size is hit by chance and its neighbour
by mistake. A hover does not exist on a phone, so whatever it shows is lost there. And the window's width says nothing
of how the device is held and touched.
