---
name: ui-components-keep-only-local-ui-state
title: "Components keep only their own UI state, read the store and call transitions"
audience: everyone
strength: must
enforcedBy: ui-component-imports
verifiedBy: ui-component-imports
---

A component may keep state that is purely its own and means nothing to the app: whether a dropdown is open, the caps
lock, the text being typed before it is sent. Everything else it reads from the store's views and changes by calling a
machine's transition. A component imports Svelte, other components and the store module; anything else only as a type. A
widget of the set is generic and does not even read the store: it takes props and reports through callbacks.

## Why

state kept in a component is invisible to the machines, so the app's behaviour would depend on what is mounted; generic
widgets are what makes them reusable across projects.
