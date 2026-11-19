---
name: ui-affordances
title: "Every action a person can take shows how it is taken: each transition declares its affordance, visible at rest or discoverable"
audience: everyone
strength: must
enforcedBy: ui-affordances
verifiedBy: ui-affordances
---

An action nobody can see is an action nobody takes. Every transition a person takes says, in its machine's comment, what
offers it: the element (a button, a row, a mark of a drawing), its cue at rest, on hover or keyboard focus, and on touch,
and, when it shows nothing at rest, how a person discovers it. The tag is `@affordance` on the method, or on the
machine's class for every method that says none of its own, and the registry of transitions carries it, so an agent
reads what a person sees.

    /** Adds a task. @affordance button: the Add button */
    /** Follows another line. @affordance the thread of a line on the river; rest: a faint thread, its name at its end;
     *  hover: the thread lifts and names its line; touch: tap the thread; discover: the menu of lines on the river */
    /** Moves to the next row. @affordance key: the key J; discover: the keys listed in the help */
    /** Applies what the server sent. @affordance none: the app calls it when the data arrives */

A kind of the widget set (`button`, `link`, `tab`, `field`, `choice`, `menu`, `row`, `key`, `drag`, `address`) gives its
cues by itself, so naming the element is enough; any cue said replaces the widget's. An element of the app's own (a
thread on a chart, a dot on a timeline) says each cue. `none: why` says that no person takes the transition: the app
calls it, or only an agent does. A machine generated from a model declares its affordances where the project's reader
of machines reads them (`check.transitions.reader`).

Do: a faint mark that can be clicked lifts on hover and focus, and says once, quietly, at rest that it is a choice (its
name at its end, a small menu beside it); a key has a visible control too, or a help that lists it. Don't: an element
that answers a click and looks like decoration, a hover as the only sign that something can be done, an action reachable
only by a key nobody is told about.

The check `affordances`, active when `check.transitions` is set, refuses a transition with no `@affordance`, an
affordance with no cue at rest, on hover or focus, or on touch, a cue invisible at rest (`none`, `nothing`, `hidden`)
with no `discover`, and a transition declared `none` that a component calls from an event handler in its markup.

## Why

the owner of an app built with the stance could not find how to change what the app followed, though the marks were
clickable: nothing said so. The transitions are already the one list of what can be done (agent parity); saying for
each how a person sees it turns "every element clickable" into something a check can hold, and the cue at rest, on
hover and on touch is where an action is lost: hidden behind a hover a finger never makes, or drawn so quietly it reads
as decoration (WCAG 2.2 SC 3.2.4, 1.4.13, 2.5.8 and the stance's rule on input modes).
