---
name: ui-agent-parity
title: "Agents and the user do the same things: every change of the UI is a transition, and an agent calls those"
audience: everyone
strength: must
enforcedBy: ui-transitions
verifiedBy: ui-transitions
---

What a person can do in the app, an agent can do, and by the same means. Every change of the UI's state is a transition,
a method of a machine in its own `.svelte.ts` file, one machine to a file, and the machines are what the one central
store holds. A generated registry lists every transition (its machine, name, arguments, what it does, and whether the
machine allows it now). An agent that the project lets in (`platforms.mcp` in `stance-ui.json`) has three MCP tools,
`store` (read the store's snapshot, filtered and compact), `transitions` (the registry) and `transition` (call one by
name). They run on the page, over the bridge the page already has to its server, so that the MCP server holds no UI
logic of its own: it reads the store and calls those same transitions. A convenience such as "show the open tasks" is a
named sequence of transitions in a machine, tagged `@sequence`, and the components call it like an agent does. The one
exception is what only a person may do, typing a secret or using a passkey: that transition is tagged `@person`, the
components call it, and an agent's call is refused.

Do: a button's handler is `filter.choose("OPEN")`, and the agent calls `transition` with the machine `filter`, the name
`choose` and the argument `show`; "show the open tasks" is `focus.showOpen()`, in the machine `focus`, which calls
`filter.choose`. Don't: a component that sets a field of its own and changes the screen with it, an MCP tool that
clicks, types or runs code in the page, a second API for agents beside the bridge, or a tool that holds logic (what
counts as open, what to do next) that the store does not.

The check `transitions` regenerates the registry and refuses one that differs from the machines, a transition with no
comment saying what it does, a file with two machines, and a component that calls on a machine anything but a transition
of the registry (or reads its `view`, or asks `allowed`). A machine may be made by a factory function and may hold other
machines. The check finds a machine made by `new Machine()`, by a call of a function that returns one (in the store file
or another file of the app), or by a call that is given a function making it (`lazily(group, () => new Machine())`); the
store may make the same machine class many times, since the class is what is declared once, in one file. It finds the
machines a machine holds (a field `zoom = new Zoom()`, a constructor's `this.zoom = makeZoom()`, or a method that makes
one by an argument, `historyOf(ref)`, which is then no transition) and checks each through its parent: each class in a
file of its own, each transition commented. A nested machine is named in the registry by its path (`features.gantt`,
`bugs.historyOf(ref)`), and an agent calls it by that name. A class is a nested machine when it has a `view`; a machine
that holds itself is refused. A public method tagged `@internal` is plumbing (loading a screen's parts, wiring the page's
address): it is no transition, an agent cannot call it, and a component may. A component may also use a machine a machine
holds (`item.answering`), checked through the path of its own. A project whose store makes machines the sources do not
show by name (one made when a screen is first looked at, one handed to its parent) names a reader of its own in
`check.transitions.reader`, a module exporting `read(root, storeFile)` that answers the machines, their transitions and
their plumbing; the check keeps its rendering, its comments and its calls. The registry says, for each transition,
the values of an argument that is a union of strings, and its `kind` (`model` with the model's `name`, for a machine
generated from a model in a folder `generated/<model>/`, else `code`). The check `agent-endpoint` refuses an MCP server file that imports anything of the app:
only the registry, the agent channel and the standard library.

## Why

an app that an agent can only touch through a screen it must read and click is slow, fragile and unlike what the user
does; an app with a second API for agents has two behaviours to keep equal, and they drift. With one store written only
by transitions, and an agent that calls the same ones, what an agent can do is by construction what the user can do,
every step of either is a step of a machine that can be tested and replayed, and a new transition reaches the agent
without anyone writing a tool.
