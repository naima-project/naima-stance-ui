---
name: ui-machines-composed-and-modelled-first
title: "Machines are composed of simpler ones, and modelled first"
audience: everyone
strength: should
verifiedBy: agent
---

A machine is built from simpler ones as far as the formalism allows: machines side by side are their product; machines
that synchronise on shared actions are parallel processes. Each is modelled first in mCRL2 and its code generated with
naima-codegen, with its properties checked. Only where a model is clearly, justifiably useless overhead (a few states,
no concurrency, nothing worth proving) is the machine written directly as a .svelte.ts class in the same shape, with the
reason in a comment at its top.

## Why

behaviour with states fails in the orders of events nobody tested; a model checker explores every order, and small
machines composed are small models to check.
