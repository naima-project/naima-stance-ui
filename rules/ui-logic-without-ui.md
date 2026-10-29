---
name: ui-logic-without-ui
title: "The app's logic is code with no UI"
audience: everyone
strength: must
enforcedBy: ui-component-imports
verifiedBy: ui-component-imports
---

Everything the app decides (what may happen now, what happens next, what is sent where) lives in plain TypeScript
modules that import nothing of the UI, and the components only show it. The two are fully decoupled: the logic runs and
is tested without a browser, and the UI can be replaced without touching it.

## Why

logic inside components can only be tested through the screen, is copied between components that need it, and changes
whenever the look does.
