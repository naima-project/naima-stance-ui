---
name: ui-sign-in-only-through-auth
title: "A password or a one-time code is asked for only by the Auth widget"
audience: everyone
strength: must
enforcedBy: ui-auth-only
verifiedBy: ui-auth-only
---

Signing in goes through the widget set's Auth and the sign-in machine in the store. Auth sets the autocomplete a
password manager and the browser fill (`username`, `current-password`, `one-time-code`), never blocks pasting, lets the
password be shown, offers a passkey when the machine's port has one, says every error in text tied to its field, and
asks no puzzle and no CAPTCHA. No other component has a field of type password or an autocomplete of current-password,
new-password or one-time-code. A form that needs one more such field, a sign-up for instance, is added to the project's
own copy of Auth. This is how WCAG 2.2 SC 3.3.8 (accessible authentication) is met.

## Why

a sign-in that blocks pasting, hides the autocomplete or asks for a puzzle locks out people who cannot remember or
transcribe a secret; with one component allowed to ask for secrets, the right form is written once and a check can tell
whether any other escaped it.
