---
name: ui-drag-only-through-draggable
title: "Dragging is done only through the Draggable widget, which always offers every move without dragging"
audience: everyone
strength: must
enforcedBy: ui-no-raw-drag
verifiedBy: ui-no-raw-drag
---

Anything that can be moved by dragging is wrapped in the widget set's Draggable, whose `moves` prop is required and
never empty: every direction it lists is also a button next to the thing and an arrow key on its handle. No other
component handles a pointer, mouse or touch move, an HTML5 drag event or a `draggable` attribute, in its markup or its
scripts. This is how WCAG 2.2 SC 2.5.7 (dragging movements) is met: dragging is only ever a shortcut for a single click
or a key.

## Why

people who cannot hold a pointer down and move it (with a tremor, a head pointer, a voice control or a switch) are shut
out of anything that only drags; with one widget allowed to drag, the alternative is built once and a check can tell
whether any drag escaped it.
