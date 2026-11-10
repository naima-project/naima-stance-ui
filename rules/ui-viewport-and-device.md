---
name: ui-viewport-and-device
title: "The page fits the device's real window: dynamic viewport units, safe areas, both orientations, the keyboard"
audience: everyone
strength: must
enforcedBy: ui-viewport
verifiedBy: ui-viewport
---

A page is as tall as the window the user sees. A height that follows the window is written in `dvh` (it follows the
browser's bars as they come and go) or `svh` (the smallest window, for a layout that must not move), never `100vh`,
which on a phone is taller than the screen. A width is `100%` and never `100vw`, which counts the scrollbar. The
viewport meta says `width=device-width, initial-scale=1`, adds `viewport-fit=cover` when a bar is fixed to an edge of
the window, and never `user-scalable=no` or a `maximum-scale` (SC 1.4.4). A bar fixed to an edge pads itself with
`env(safe-area-inset-top)`, `-bottom`, `-left` and `-right`, so that a notch, a rounded corner or a home indicator never
covers it. The page works in both orientations and never asks to be rotated (SC 1.3.4): a phone held sideways is a
window of 812 by 375 CSS px. When the virtual keyboard is up, the window is about half as tall, and a focused field
stays in view and uncovered by a fixed bar (the visual viewport is what the user sees:
`interactive-widget=resizes-content` in the viewport meta makes the layout follow it).

Do: `min-block-size: 100dvh;` and `padding-block-end: max(1rem, env(safe-area-inset-bottom))`. Don't: `height: 100vh`, a
fixed bottom bar with no inset, `maximum-scale=1`, or a "rotate your phone" screen.

The check refuses a `vh` in a height, a `100vw` width, a viewport meta that is missing or locks the zoom, a fixed or
sticky bar at an edge of the window with no `viewport-fit=cover` or no `env(safe-area-inset-*)` in the stylesheets, and
a field that is out of view or under another element when it is focused in a window 45% as tall as a phone's. The window
held sideways is a cell of the reflow check (rule 17).

## Why

phones show and hide their address bars, so `100vh` hides the bottom of the page behind them; a notch or a home
indicator covers a bar with no inset; and a form whose field is under the keyboard cannot be filled in.
