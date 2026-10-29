---
name: ui-light-and-dark
title: "Every mood board has a light and a dark theme, and the user's choice is app state"
audience: everyone
strength: must
enforcedBy: ui-contrast
verifiedBy: ui-contrast
---

Each mood board has a light and a dark theme, declared by a DTCG resolver file, with the same token names. The app
follows prefers-color-scheme unless the user chose a theme; that choice is held by the theme machine in the store and
changes only through its transition, whose port sets data-theme on the page. Both themes reach 4.5:1 for text and 3:1
for controls and focus rings, for every pair in the contrast file.

## Why

a theme that is only light fails people who need a dark screen, and a dark theme added later is never checked; a choice
kept outside the store is app state no machine knows about.
