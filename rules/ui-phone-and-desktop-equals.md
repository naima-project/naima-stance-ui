---
name: ui-phone-and-desktop-equals
title: "Phone and desktop are equals: each does everything, with its own gestures and a layout made for it"
audience: everyone
strength: must
enforcedBy: ui-action-parity
verifiedBy: ui-action-parity
---

A layout that only shrinks is not enough. The app is used on a phone with a thumb and on a desktop with a mouse and a
keyboard, and each of them gets everything the app does, in the way that suits it. The checks `action-parity`,
`hover-only`, `keyboard-viewport`, `phone-layout` and `desktop-keys` hold the seven points below. They open the app in the
profiles of the testing matrix (`checks/matrix.ts`): a desktop 1280 px wide with a mouse that hovers, two phones 375 and
390 px wide and a tablet 820 px wide, each with a finger and no hover.

## 1. Every action is reachable on a phone and on a desktop alike

Reason: an action that exists only at one width, or only behind a gesture, is lost to whoever holds the other device.

Do: show the same actions in every profile, laid out differently. A toolbar button on the desktop is a row of the
More menu or of a sheet on the phone, and both call the same transition. Don't: hide a button below a width with
nothing in its place, or make a keyboard shortcut, a right-click, a long-press or a swipe the only way to an action.

The check `action-parity` opens every screen in the four profiles, clicks or taps each visible control and each control
that a click opens (a menu, a sheet), and records the store's transitions that are called (the store's probe hook,
counted against the generated registry of agent parity). The sets must be equal: a finding names the transition, the
screen and the profile that cannot reach it. Gestures do not count, only what a click or a tap reaches.

## 2. Secondary actions open one menu, by More, right-click, the menu key or a long-press

Reason: a person looks for the actions of a row where their platform puts them, and every way must lead to the same menu.

Do: give each item, row and card that has secondary actions a visible More (…) button with an accessible name, and open
the same menu, at the item, on right-click, on the context-menu key and Shift+F10, and on a long-press of about 500 ms.
Elsewhere the browser's own menu stays. Don't: put actions only in a right-click menu, or build a long-press menu that
differs from the button's.

The action-parity check finds the menu through its More button, so an action that only the right-click reaches fails it.

## 3. Nothing is hover-only

Reason: a finger cannot hover, so whatever hover alone reveals does not exist on a phone.

Do: show what hover reveals at all times on a device that cannot hover (`@media (hover: none)`), or behind a visible
control a tap opens. On a desktop, hover only previews what a click also shows. Don't: hide a row's actions until
`:hover`, or put the only copy of something in a tooltip that `mouseenter` opens.

The check `hover-only` runs on a phone. It refuses a `:hover` rule that reveals an element hidden without hover, and an
element whose `mouseenter` or `pointerover` handler shows something a tap on the same element does not.

## 4. Text entry works with the on-screen keyboard

Reason: the keyboard covers about half of a phone's screen, and a field typed into blind is a field that cannot be used.

Do: keep the focused field above the keyboard, by scrolling it into view when `visualViewport` shrinks or by a sheet
anchored above it. Give it the right `inputmode` and an `enterkeyhint` (search, go, done, send). Enter confirms, and Escape
or the platform's Back cancels. Don't: pin a field to the bottom of the window with nothing that moves it when the keyboard
rises.

The check `keyboard-viewport` focuses each field on the two phones, shrinks the visual viewport to 60% as a keyboard does
(or the layout viewport, when the page's viewport meta asks for `interactive-widget=resizes-content`), and asserts that
the field lies inside what is left and is under nothing. It also refuses a field with no `enterkeyhint`.

## 5. Every drag has a touch and a keyboard equivalent

Reason: a drag needs a fine pointer and a steady hand, and a keyboard cannot drag at all (WCAG 2.2 SC 2.5.7).

Do: drag only through the `Draggable` widget (rule 10). On touch, a long-press then drag moves the item, the arrow keys
move it on the keyboard, and the item's menu has Move to… or a control that sets the value outright. Don't: a resize
handle, a timeline window or a card that only the mouse can move.

The check `no-raw-drag` refuses a drag written outside `Draggable`, and `action-parity` refuses a move that only the
desktop reaches.

## 6. The phone layout is designed for phones

Reason: a phone is held in one hand, and the thumb reaches the bottom of the screen, not the top.

Do: put the navigation in a bar at the bottom, at most five destinations plus a More that opens the rest in a sheet.
Open popovers and panels as bottom sheets, full width, with a grab handle, swipe-to-dismiss and a Close button. Show a
table's rows as cards, or a lane that scrolls with its labels fixed. Put the screen's primary action, marked
`data-primary-action`, in the bottom third. Keep fixed bars clear of the safe areas. Don't: a row of links at the top, a
menu anchored to a button the size of a fingertip, or a table that scrolls sideways.

The check `phone-layout` runs on both phones. It refuses navigation that is not a bar in the bottom quarter of the window,
a bar of more than five destinations besides More, a menu or dialog that opens as anything but a full-width sheet at the
bottom, a sheet with no Close button, a table wider than the window, and a primary action outside the bottom third. The
`nav` check lets the phone's bottom bar keep a More that opens a sheet, and nothing else.

## 7. The desktop layout is designed for desktops

Reason: a desktop has room, a precise pointer and a full keyboard, and a phone's layout stretched across it wastes all three.

Do: use the space, with the side panel docked and list and detail side by side where both matter. Make every action
reachable from the keyboard in a logical order with a visible focus ring. List the shortcuts in a Keyboard shortcuts sheet
that `?` opens, each row marked `data-keys` with the keys in the `aria-keyshortcuts` form, and give the controls that have
one their `aria-keyshortcuts`. In the desktop app, list the screens and actions in the native menu bar with their keys.
Don't: a control that takes a click and not the focus, a menu the keyboard cannot enter or Escape cannot close, or a
shortcut that nothing lists.

The check `desktop-keys` runs on the desktop. It refuses an element that takes a click and not the focus, a stop of the
Tab walk with no focus ring, a control whose menu or sheet the keyboard does not reach, does not close on Escape or does
not give the focus back, a page with shortcuts where `?` opens no Keyboard shortcuts sheet, and a declared shortcut the sheet does not
list. The native menu bar is checked by the project's own test of its listing.

## Why

the owner of a project reads it on a phone on the way and works on it at a desk, and neither is the lesser device. A
layout that only reflows hides on the phone what did not fit, leaves the thumb stretching for a bar at the top, and gives
the desktop a phone's sparse column with no keyboard. Holding both to the same set of actions, each with its own
gestures, keeps the app whole on both.
