---
name: ui-overlay-scrollbars
title: "Scrollbars show only while scrolling: thin overlay scrollbars that fade"
audience: everyone
strength: must
verifiedBy: agent
---

Every scrolling box of an app, the page included, has an overlay scrollbar: thin, drawn over the content without taking
room from it, invisible at rest, shown while the box scrolls and faded out a moment after. Its colour is a design token
(the strong border colour, on a transparent track), so it follows light and dark. The shell sets it once for the whole
app (`scrollbar-width: thin` and a transparent `scrollbar-color` on every element, the visible colour on a box marked
while it scrolls, and the same for WebKit's scrollbar pseudo-elements); no screen styles its own scrollbars. A box that
scrolls sideways to show a row of controls (a tab strip) may hide its scrollbar altogether, provided a fade at its edge
says that more waits there.

An agent verifies it: on each screen, in light and dark, no scrollbar is visible at rest, and one shows while a box
scrolls.

## Why

a permanent scrollbar is a band of chrome that says nothing until the person scrolls, and a different one in every box
makes a calm page look busy; the platforms people know (macOS, iOS, Android) draw overlay scrollbars, so the app looks
at home on each; a scrollbar set once in the shell cannot drift from screen to screen.
