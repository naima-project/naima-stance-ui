---
name: ui-one-store-written-by-transitions
title: "One central store holds every state machine and is written only through their transitions"
audience: everyone
strength: must
enforcedBy: ui-svelte-check
verifiedBy: ui-svelte-check
---

The app's state is one deep-reactive Svelte 5 store ($state, made once with createStore), which holds every state
machine of the app. A machine has the shape naima-codegen emits: a read-only view of its state, allowed(event), and one
method per input, its transitions. Nothing changes the state except those methods; side effects are the machine's
outputs, carried out by a port passed to it.

## Why

one store read by everyone and written by transitions alone makes every change of state a step of a machine that can be
checked, replayed and tested, instead of an assignment anywhere in the UI.
