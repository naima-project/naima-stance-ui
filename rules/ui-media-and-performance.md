---
name: ui-media-and-performance
title: "Media is responsive and keeps its box, long lists skip off-screen work, and each screen keeps a budget on a mid-range phone"
audience: everyone
strength: must
enforcedBy: ui-media
verifiedBy: ui-media
---

Every image, video and frame reserves its box before it loads: `width` and `height` attributes, or `aspect-ratio`, so
that the page does not shift as it loads (cumulative layout shift, CLS, below 0.1). An image larger than about 1.5 times
the pixels it is shown in offers its sizes: `srcset` and `sizes` (or `picture`), so that a phone does not receive a
desktop's image. A list of 50 items or more sets `content-visibility: auto` on its items, with `contain-intrinsic-size`,
so that the browser skips what is off screen. Each screen has a budget, measured by the check `budget` on the profile of
a mid-range phone (a 4 times slower processor and a slow 4G network: 150 ms of latency, 1.6 Mbit/s, the profile
Lighthouse uses): the largest content painted within 2.5 s, a layout shift below 0.1, a total blocking time below 300
ms, at most 170 kB of JavaScript and 1 MB in all, both compressed with gzip. A project may set a tighter budget in
`stance-ui.json` (`check.budget`).

Do:
`<img src="a-800.webp" srcset="a-400.webp 400w, a-800.webp 800w" sizes="(width >= 40rem) 40rem, 100vw" width="800" height="450">`.
Don't: an `img` with no dimensions that is a 4000 px photograph shown at 100 px, or a list of 5 000 rows in the DOM.

The check `media` refuses an image, video or frame that reserves no box, an image far larger than it is shown with no
`srcset`, and a list of 50 or more items that does not skip its off-screen items; the check `budget` loads each page on
the mobile profile and refuses a screen that is over a figure above. The layout shift is named by `media` and the rest
by `budget`.

## Why

a phone on a mobile network is the slowest computer a page meets; a page that shifts as images arrive moves what the
reader is about to touch, and the time to the first useful screen is what decides whether it is used at all.
