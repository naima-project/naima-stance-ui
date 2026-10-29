---
name: ui-design-tokens-only
title: "Every colour, size and duration is a design token"
audience: everyone
strength: must
enforcedBy: ui-no-raw-literals
verifiedBy: ui-no-raw-literals
---

The design's values are design tokens in the W3C Design Tokens (DTCG) format, built to CSS custom properties, and a
component uses them only as var(--token): no hex, rgb() or named colour, no px, rem or ms, not in a <style>, a style
attribute, a style: directive or an SVG paint attribute. Percentages, fr, viewport units and unitless numbers describe
layout and stay allowed.

## Why

a value written in a component is a design decision nobody can find or change in one place, and it breaks the next mood
board.
