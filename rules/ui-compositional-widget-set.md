---
name: ui-compositional-widget-set
title: "Larger components are built from smaller ones"
audience: everyone
strength: should
verifiedBy: agent
---

The widget set has primitives (Button, Text, Input, Checkbox, Icon, Stack, Cluster, Grid, Keycap) and components
composed from them (Field, Dropdown, Dialog, Card, Toolbar, ThemeSwitch, Draggable, Auth); a new component is built from
existing ones before it is written from scratch. The set is copied into the project with `naima stance-ui adopt`, as
source the project owns, and stance-ui.json records the stance's version so that later updates can be compared.

## Why

composition keeps the look and the behaviour (focus, keyboard, labels) consistent, since each is written once, in the
smallest component that needs it.
