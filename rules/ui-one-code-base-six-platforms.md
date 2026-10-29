---
name: ui-one-code-base-six-platforms
title: "The app runs on six platforms from one code base, and only the platform port differs"
audience: everyone
strength: must
verifiedBy: agent
---

The app is one code base that runs as a web page and, in the Tauri 2 shell, as an app on Windows, Linux, macOS, Android
and iOS. The machines, the store and the components are the same on every platform; the one part that differs is the
platform port (src/lib/platform/port.ts): local handlers or a Deno server on the web, the shell's Rust commands in the
app. A machine reaches the outside only through the port, never through a platform's API directly. An agent-verified
convention, because building for every platform takes minutes: before landing a change to the port, the shell
(src-tauri) or the end-to-end script, the agent runs `naima stance-ui platforms` (or `deno task platforms`) and records
on the item, per platform, whether it was built, launched, passed end to end, or was skipped and why. A skipped platform
is never recorded as passed.

## Why

an app that calls a platform's API from a machine or a component works on that platform only, and the others break
without anyone seeing it until a user does; keeping every difference in one small port means a new platform is one new
implementation of it, and the platforms check shows which platforms were really exercised.
