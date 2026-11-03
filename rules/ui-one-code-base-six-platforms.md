---
name: ui-one-code-base-six-platforms
title: "The app runs on six platforms from one code base, and only the platform bridge differs"
audience: everyone
strength: must
verifiedBy: agent
---

The app is one code base that runs as a web page and, in the Tauri 2 shell, as an app on Windows, Linux, macOS, Android
and iOS. The machines, the store and the components are the same on every platform; the one part that differs is the
platform bridge (src/lib/platform/bridge.ts): local handlers or a Deno server on the web, the shell's Rust commands in
the app. A machine reaches the outside only through the bridge, never through a platform's API directly. An
agent-verified convention, because building for every platform takes minutes: before landing a change to the bridge, the
shell (src-tauri) or the end-to-end script, the agent runs `naima stance-ui platforms` (or `deno task platforms`) and
records on the item, per platform, whether it was built, launched, passed end to end, or was skipped and why. A skipped
platform is never recorded as passed. The project pins its Rust in rust-toolchain.toml, and `deno task toolchain` (in a
project, `naima stance-ui toolchain`) installs that Rust and its targets into the gitignored .stance-ui/rust/, without
admin rights: it detects what needs them (the Xcode command line tools, Visual Studio Build Tools with WebView2,
webkit2gtk, the Android SDK, NDK and JDK) and prints the command that installs each one missing, and on Windows it
detects Smart App Control. The platforms check builds with that Rust first, and on Windows, from a session with no
desktop, launches the app through a scheduled task in the desktop session.

## Why

an app that calls a platform's API from a machine or a component works on that platform only, and the others break
without anyone seeing it until a user does; keeping every difference in one small bridge means a new platform is one new
implementation of it, and the platforms check shows which platforms were really exercised.
