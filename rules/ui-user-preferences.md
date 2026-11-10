---
name: ui-user-preferences
title: "The interface follows the user's settings: motion, contrast, colour scheme, forced colours and transparency"
audience: everyone
strength: must
enforcedBy: ui-preferences
verifiedBy: ui-preferences
---

The page answers what the system tells it about the person. With `prefers-reduced-motion: reduce` nothing moves (rule 9,
the check `reduced-motion`). With `prefers-color-scheme` it takes the light or the dark mood board's theme (rule 8).
With `prefers-contrast: more` (every mood board has a `light-more` and a `dark-more` theme for it) its text reaches 7:1
against its background (4.5:1 for large text, SC 1.4.6) and its borders are drawn. With `forced-colors: active` (Windows
high contrast) the system's colours replace the page's: every control keeps a border, even a transparent one, since a
border is what shows then, and nothing sets `forced-color-adjust: none` around text. With
`prefers-reduced-transparency: reduce` a frosted or translucent surface is opaque (`backdrop-filter` is dropped).

Do: `button { border: 1px solid transparent; }`, and `@media (prefers-contrast: more) { :root { --text: ... } }`, in the
tokens. Don't: a button that is only a background colour, or a grey that is 4.5:1 and no better when more is asked for.

The check opens the page on a phone and on a laptop, in both themes, in forced colours and with more contrast, and
refuses a control with no border or outline in forced colours, text under 7:1 (4.5:1 for large text) with more contrast,
and a page that uses `backdrop-filter` and has no `prefers-reduced-transparency` rule.

## Why

these settings are how a person tells a machine what they can see and bear, and few people ask twice; a page that
ignores them leaves the people who set them with a page they cannot use, and the settings cost one rule each when they
are in the tokens.
