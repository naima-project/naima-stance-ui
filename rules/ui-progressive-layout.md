---
name: ui-progressive-layout
title: "One layout adapts from a phone to a wide window, in a centred column of a readable width"
audience: everyone
strength: must
enforcedBy: ui-column
verifiedBy: ui-column
---

An app's screens are progressive: one layout that adapts from a phone's width (320 CSS px) to a wide window, never a
layout for each. The content of every screen sits in one centred column of a readable width, never the window's full
width: a column of about 750 CSS px for a screen of text and lists, a wider one (up to about 1200 CSS px) for a screen of
charts, tables or cards, its widths design tokens. The column is as wide as the window up to its maximum, with a side
gutter that grows with the window, and it centres in the window; nothing is a breakpoint that swaps one layout for
another. The shell leaves a slot for a left panel (a map, a list of places): when a panel is open the column centres in
the space that remains, and no screen reckons with the panel. One page wrapper, made once in the shell, does all of it:
a screen sets no page width of its own.

The check opens each page in a 1920 CSS px window and refuses a `main` landmark whose content is wider than 1400 CSS px,
or that is not centred in the window (or in the space right of an element marked `data-slot="panel"`). That the page
reflows at 320 CSS px without scrolling sideways is the accessibility check's (SC 1.4.10).

## Why

a line of text longer than about 80 characters is hard to follow, and a page that stretches over a wide window leaves
the eye to find its way across it; a layout built for the phone and another for the desktop doubles the work and drifts
apart; a panel that every screen must reckon with is a change in every screen each time one is added.
