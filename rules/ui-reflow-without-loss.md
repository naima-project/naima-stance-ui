---
name: ui-reflow-without-loss
title: "A page reflows at 320 CSS px and at 400% zoom, and loses nothing at 200% text or with a reader's text spacing"
audience: everyone
strength: must
enforcedBy: ui-reflow
verifiedBy: ui-reflow
---

A page never scrolls sideways, and never cuts text off or lays text over text, in any window of the testing matrix (rule
25), at 400% zoom (a window of 320 by 256 CSS px, SC 1.4.10), with the text set to 200% (SC 1.4.4), and with the text
spacing a reader may set: a line height of 1.5, paragraphs 2 times the font size apart, letters 0.12 and words 0.16 of
the font size apart (SC 1.4.12). A box that holds text grows with it: its size is a minimum, or none, and a long word or
a long line wraps. Only a table, a map or a chart may scroll sideways, inside its own box.

Do: give a box `min-block-size` and let it grow, and let a flex or grid child shrink (`min-inline-size: 0`), so that the
content decides its height. Don't: fix a height in pixels, use `overflow: hidden` around text, truncate with an ellipsis
what a reader needs, or set `white-space: nowrap` on a label.

The check opens each page in the 24 cells of the matrix that vary the width, the pointer and the text size, and in a
window at 400% zoom and one held sideways, and refuses a page that scrolls sideways, a box that hides some of its text,
and text that lies over other text, and then once more with the text spacing set (text that is only moved by the spacing
is reported as its cause).

## Why

people with low vision enlarge text and zoom the page, and read it in one column; a box of a fixed height cuts the text
off as soon as it grows, and a line that does not wrap forces a reader to scroll sideways on each line.
