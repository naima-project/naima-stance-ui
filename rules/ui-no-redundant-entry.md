---
name: ui-no-redundant-entry
title: "Nothing entered is asked for again in the same process"
audience: agents
strength: must
verifiedBy: agent
---

An agent-verified convention: no check holds it, and the agent verifies it by review. Before landing a change that adds
or changes a form or a process of several steps, the agent reads the process from its first step to its last and checks
that information the user already gave in it is never asked for again: a later step fills it in, or offers it to be
chosen, unless asking again is needed for security (signing in again, for instance; a password typed twice to confirm it
is not) or what was given is no longer valid. The values are carried through the process by its machine, in memory only:
never written to storage, never sent anywhere the step does not need them, and dropped when the process ends. The agent
records the review on the item the change lands with, as a note: `naima note <item> "ui-no-redundant-entry: reviewed,
<what it found>"`. This is WCAG 2.2 SC 3.3.7 (redundant entry).

## Why

asking twice for what was already given tires everyone and stops people who find typing or remembering hard; no check
can tell two fields that ask for the same thing, and remembering values beyond the process would trade the problem for
one of privacy and security.
