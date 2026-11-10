---
name: ui-testing-matrix
title: "Every check runs in the same matrix of windows, pointers, themes and text sizes, written in one place"
audience: everyone
strength: must
enforcedBy: ui-reflow
verifiedBy: ui-reflow
---

The browser checks take the windows they open from one file, `checks/matrix.ts`, and never write a width of their own.
The matrix is six widths, Material 3's window size classes and the devices behind them: 320 (the narrowest phone, and
the reflow width), 375 (a phone), 768 (a tablet in portrait), 1024 (a tablet in landscape, or a small laptop), 1280 (a
laptop) and 1920 (a wide desktop). Each is opened with a mouse (a fine pointer that hovers) and with a finger (touch
events, a coarse pointer, no hover), in the light and the dark theme, and with the text at the browser's default and at
200%: 48 cells. Beside them, a window at 400% zoom (320 by 256), a phone held sideways (812 by 375), and the settings of
rule 24. A check that does not depend on the theme or the text uses the cells that do (each width with each pointer),
and one that is slow uses the two anchors: a phone with a finger and a laptop with a mouse. Adding a size or a mode is a
change in the matrix alone, and every check meets it.

Do: `import { cells, frames, anchors } from "./matrix.ts"`. Don't: `viewport: { width: 390, height: 844 }` in a check.

## Why

a check that has its own idea of a phone checks a phone nobody has; and a window added to one check and not the others
is a window that is checked in some ways only. One matrix is a list a person can read, argue with and extend.
