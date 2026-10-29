---
name: ui-mood-board-chosen-at-design-time
title: "The mood board is chosen at design time"
audience: everyone
strength: must
enforcedBy: ui-tokens
verifiedBy: ui-tokens
---

A mood board is a complete set of token values, and every mood board defines the same tokens. The project chooses one
while it is designed and builds it into its CSS; the app does not switch between mood boards at run time. What does
switch at run time is the theme within the mood board, light or dark (see the rule on light and dark).

## Why

a mood board is a design choice, made once and reviewed; the same token names in every mood board are what lets a
project change its choice without touching a component.
