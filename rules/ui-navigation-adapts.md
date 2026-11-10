---
name: ui-navigation-adapts
title: "The top bar shows every destination on a wide window and stays usable on a phone, with no hidden catch-all"
audience: everyone
strength: must
enforcedBy: ui-nav
verifiedBy: ui-nav
---

The navigation lists every primary destination of the app. On a window from 840 CSS px up (Material 3's expanded class
and wider) every destination is in the top bar, in view, in the order of the app. On a narrower window the same bar
remains usable: a row of tabs that scrolls sideways and keeps the current destination in view, or a compact pattern that
shows every destination (a bar at the bottom of the screen, a drawer that lists them all). No primary destination is
ever behind a "More" or an ellipsis that holds the destinations that did not fit: a screen the user needs is as near as
the others. What is reached from a "More" is a menu of actions, not a place of the app.

Do: a `nav` of `a` elements with `overflow-inline: auto` and `scroll-snap-type: inline proximity`, in which the current
page has `aria-current`. Don't: a "More" button that gathers what did not fit, or a menu button on a window of 1280 px.

The check opens every width and refuses a navigation landmark or a row of tabs with a "More" (or an ellipsis, or
"Other") button, one with its destinations folded into a menu button from 840 px up, one with destinations that are not
displayed and no menu button for them, and a destination that lies outside the window in a bar that does not scroll.

## Why

a destination behind "More" is found only by a person who already knows it is there, and the others never meet it. A
wide window has room for every destination, and a narrow one has ways to reach all of them: a row that scrolls, a bar, a
drawer.
