# keystrokes

An always-on-top keystroke and mouse-click visualizer for DankMaterialShell (DMS), suitable
for screencasts, tutorials, and presentations.

It started as [dms-screenkey](https://github.com/loccun/dms-screenkey) and its keycap look,
layout and animation presets are a port of [mulaRahul/keyviz](https://github.com/mulaRahul/keyviz) —
see [Upstream](#upstream) for exactly what is taken from where.

<img src="screenshot.png" width="400" alt="Screenshot">

| | |
|---|---|
| Repository | <https://github.com/Tz-slayer/keystrokes> |
| Plugin id (settings key, IPC target, install directory) | `keystrokes` |
| Version | 1.2.0 (`plugin.json`) |
| Requires | Quickshell ≥ 0.3.1, DMS ≥ 1.5.0, `libinput` CLI, `input` group |
| License | MIT |

Contents: [Install](#install) · [Requirements](#requirements) · [Features](#features) ·
[Keycap Styles](#keycap-styles) · [Usage](#usage) · [IPC Commands](#ipc-commands) ·
[Keyboard behavior and settings](#keyboard-behavior-and-settings) ·
[Cursor position](#cursor-position) · [Project layout](#project-layout) ·
[Development](#development) · [Upstream](#upstream) · [License](#license)

## Install

Manually:
```bash
git clone https://github.com/Tz-slayer/keystrokes.git \
  ~/.config/DankMaterialShell/plugins/keystrokes
```

> [!NOTE]
> Renamed: the plugin id changed from `keyviz` to `keystrokes` (the old name was the
> upstream project's). The id is what DMS keys settings on, so after upgrading move
> `~/.config/DankMaterialShell/plugin_settings.json`'s `keyviz` object to `keystrokes`, and
> rename the install directory to `plugins/keystrokes`. IPC commands are now
> `dms ipc keystrokes …`.

## Requirements

- **Quickshell** - Required, and the plugin's only *hard* dependency. DMS itself runs on Quickshell, so installing DMS pulls it in; this is listed for clarity because the overlay is plain Quickshell code (`PanelWindow` + `WlrLayershell`) with no DMS-specific windowing. Verified against `0.3.1`.
- **DankMaterialShell** `>= 1.5.0`
- `libinput` **CLI** - Required. Drives **"All Keyboards"** mode, and single-device mode via `--device`.
- `evtest` - *Optional*. Only used as a fallback for single-device mode when the libinput CLI is absent.
- **Input group** - User must be in the `input` group: `sudo usermod -aG input $USER`.

> [!NOTE]
> On many distros, the libinput CLI is in a separate package: `libinput-tools` (Arch/Debian/Ubuntu) or `libinput-utils` (Fedora). Logout and back in after adding your user to the input group.

> [!NOTE]
> What DMS actually provides is the plugin lifecycle, settings, and theming (`PanelWindow` and layer-shell always-on-top come from Quickshell). Porting to a non-DMS Quickshell shell means replacing `PluginComponent`/`PluginService`, `Theme.*`, and `StyledText`/`StyledRect` - not the windowing or key capture.

## Features

- Four Keyviz skins: **Minimal**, **Laptop**, **Low Profile** (default), **PBT**.
- Inter Variable text, vector icons, secondary symbols, numpad labels, case and nine-way alignment.
- Independent normal/modifier face, base, text and border colors, gradients, fractional border widths and radius.
- Per-key repeat counts, physical press feedback, individual expiry and stable keyed animations.
- None/fade/zoom/float/slide animations; horizontal/vertical history with a configurable limit.
- Monitor selection, nine screen positions, independent or linked X/Y margins and per-group backgrounds.
- All-key, modifier-first or custom-first-key filters; configurable global toggle shortcut (default Shift+F10).
- The 14 upstream color palettes and randomization.

The non-mouse port is written against the local Keyviz baseline `ee7fda1` (see
[Upstream](#upstream)) and [the parity and verification
record](docs/keycap-style-parity.md) lists what is 1:1 and what is not. Mouse behavior
remains a separate, existing extension.

The default **Focused Display (Auto)** output follows DMS's compositor-aware
focused screen. Selecting a named display pins the overlay to that output.

Switching workspaces must not disturb the overlay, so the output is only
changed when the compositor can actually name the focused output and that name
survives a 250 ms settle window. `CompositorService.getFocusedScreen()` cannot
express "unknown": it answers `screens[0]` whenever the compositor has no
focused output to report, which is indistinguishable from a real move to the
first display, and a workspace switch can leave that gap. The overlay therefore
reads the raw name itself and keeps its current output while it is unknown. If
the window is re-created anyway (a genuine move to another display), the groups
are restored at rest instead of replaying their entrance animation.

## Keycap Styles

Choose **Minimal**, **Laptop**, **Low Profile** or **PBT** in plugin settings.
Selecting Minimal also selects icon text mode, enables icons and disables
modifier highlighting, matching Keyviz's settings interaction. Saved legacy
`elevated` and `mechanical` names remain aliases.

The four skins are ports of keyviz's own keycaps (`src/components/keycaps/*.tsx`):

| skin | keyviz source | what it draws |
|---|---|---|
| `minimal` | `minimal.tsx` | no body at all; only the label/icon |
| `laptop` | `laptop.tsx` | one face, inset highlight + drop shadow; never moves on press |
| `lowprofile` | `lowprofile.tsx` | face sliding 0.25em into a base wall |
| `pbt` | `pbt.tsx` | shell with a 2.2em face inset by 0.3em, sliding 0.15em |

The geometry comes from the skin, the colours from the settings (cap, secondary,
label and border), so one set of values renders every skin. A stored value that
names nothing that exists -- including one left behind by the retired custom
styles -- resolves to PBT.

> [!NOTE]
> Two earlier ways of loading a JSON skin are gone: the
> `~/.config/DankMaterialShell/keyviz_styles/` folder (with `styles`/`rescan` IPC) and the
> settings-page *Import / Export* card. The skins plus colour settings cover the same ground,
> and a whole theme still moves between machines through the `exportStyle` / `importStyle`
> IPC commands — see [IPC commands](#ipc-commands).

## Usage

### Control Center Widget
Toggle the visualizer from the DMS Control Center:
- **Click widget** - Toggle the visualizer overlay on/off.
- **Click settings icon** - Open the Keyviz settings page.

### IPC Commands
Every handler lives in the daemon's `IpcHandler` (`target: "keystrokes"`), so the target is
the plugin id, not the skin name:

```bash
# Toggle the visualizer
dms ipc keystrokes toggle

# Enable / disable the visualizer
dms ipc keystrokes enable
dms ipc keystrokes disable

# Switch the keycap skin: minimal | laptop | lowprofile | pbt
dms ipc keystrokes setStyle pbt

# Show a Ctrl + Shift + A sample through the keyboard state machine
dms ipc keystrokes test

# Dump the whole theme as native keyviz style JSON (stdout)
dms ipc keystrokes exportStyle

# Apply a native keyviz style JSON
dms ipc keystrokes importStyle "$(dms ipc keystrokes exportStyle)"
```

`setStyle` takes any of the four skin ids; the retired legacy names `elevated` and
`mechanical` are still accepted and mapped to `lowprofile` / `pbt`.

## Keyboard behavior and settings

Every accepted keyboard event is a keycap, including ordinary letters; no typing
stream is assembled. `Off` shows all keys. `Hotkeys` accepts sequences whose first
pressed key is Ctrl, Shift, Alt, Super or Fn. `Custom` tests that first key against
`Allowed Keys` (comma-separated labels; `Comma` represents the comma key).
Physical names such as `KEY_RIGHTCTRL` can restrict a custom filter to one side.
Under `Hotkeys` a lone media key — mute included — is dropped, exactly as upstream
keyviz drops it; switch to `Off` to see every key.

The mute keycap is state-aware, a deliberate step beyond upstream: while the audio
sink is muted it draws the crossed speaker, and after a press that unmutes it
switches to sound waves. DMS's audio service supplies the state (the shell's mute
keybind is `dms ipc call audio mute`), so the icon tracks reality for as long as
the cap is on screen; a host that offers no audio state keeps upstream's static
crossed speaker.

A held key remains visible. Released keys expire individually after `Fade Timeout`
(default 5000 ms), and repeated presses update that key's count. History retains
separate groups; replacement mode reuses a single group. Left/right modifier keys
retain independent physical state. Shift+F10 toggles visibility; the input listener
stays active while hidden so the shortcut can enable it again.

`dms ipc keystrokes exportStyle` emits the whole theme as native Keyviz style JSON and
`dms ipc keystrokes importStyle '<json>'` applies one. Upstream keyviz has the same
capability built into its own UI (see [Upstream](#upstream)), and the file format is
identical, so a theme can be exported here and loaded there — mouse settings ride along but
are never applied by this plugin. Imports are validated field by field (enums, ranges, colour
format) and rejected whole; upstream only checks that the eight sections exist. Colors are
CSS `#RRGGBB` or `#RRGGBBAA` (alpha last).

Old `showNormalKeys`, `historyLimit`, and `marginSize` values migrate to the new
filter/history/margin settings when no explicit new value exists. Obsolete outer
card, typing-stream, separator and theme-text controls were removed from the UI.

## Cursor position

Three keyviz features anchor to the **absolute pointer position** (click ring, always-on
highlight, button indicator next to the cursor). A Wayland client cannot read that on its
own, and reading the raw device nodes does not help either: `/dev/input/event*` carries only
*relative* deltas (`REL_X` / `REL_Y`) plus button and wheel state. The cursor position lives
in the compositor, not in the kernel.

Measured on this machine with a `uinput` virtual pointer, 20 identical writes of
`REL_X = 10`:

| | raw evdev | `libinput` `POINTER_MOTION` |
|---|---|---|
| slow (50 ms apart) | `10` every time | 3.50, 9.00, then 10.00 → **92.5 px** total |
| fast (1 ms apart) | `10` every time | 9.20, 17.54, then 20.00 → **186.7 px** total |

So raw deltas are not pixels — the same 200 device units became 92.5 px or 186.7 px purely
because of speed. `libinput`'s own motion values already include acceleration, so
integrating *those* tracks the cursor far better than integrating raw evdev. It still needs
a starting seed, the per-output scale factor, screen-edge clamping, and a way to survive
compositor warps — none of which a client can obtain. Checked against the target
environment:

- **niri** (26.04) — `niri msg` exposes `outputs`, `workspaces`, `windows`, `layers`,
  `focused-output`, `focused-window`, `pick-window`, `pick-color`, `event-stream`, …
  but **no cursor-position query**, and no cursor-related `action` either.
- **Quickshell** ships no global cursor API (`Quickshell/Wayland` only touches the cursor
  through screencopy, i.e. a captured image, not coordinates).
- A click-through layer-shell surface cannot receive pointer motion, and a
  non-click-through one would swallow clicks from every application below it.
- **Xwayland** is running here (`-rootless`) and `xdotool getmouselocation` does return
  absolute coordinates that round-trip with `xdotool mousemove`. It is **not yet confirmed**
  whether that value tracks the compositor cursor or only updates while the pointer sits
  over an X client, so nothing depends on it.

Everything keyviz does at the *event* level (button keycaps, `Drag`, `ScrollUp`/`ScrollDown`)
is reachable from `/dev/input` without any of this. A ripple anchored to the real cursor
needs compositor cooperation (e.g. an IPC query or a `wl_pointer`-style global) that niri
does not currently provide.

Mouse buttons, `Drag` and the wheel go through the same key state machine as the keyboard,
mirroring upstream: keyviz feeds them into `onKeyPress`/`onKeyRelease`, and the SCROLL_LINGER
release is a normal key release. They therefore join the group a held modifier started —
`Ctrl` + wheel is one `Ctrl + ScrollDown` row, not a second one. That matters beyond looks:
a mouse event that opened its own row minted a fresh history uid, which destroyed and
rebuilt every keycap in the overlay. `Mod`+wheel workspace switching in niri flickered for
exactly that reason, and the row could visibly jump while the old copy faded out.

## Project layout

The runtime is split by dependency, not by feature, so the DMS coupling stays in one
place: everything under `core/` and `ui/` is plain Qt Quick plus Quickshell, and only the
three DMS entry points at the repository root may import `qs.*`.

| path | what lives there | DMS-free? |
|---|---|---|
| `KeyvizDaemon.qml`, `KeyvizWidget.qml`, `KeyvizSettings.qml` | the plugin entry points named by `plugin.json` | no — DMS glue |
| `core/` | event state machine, settings schema and migration, key labels, icon paths, colour maths, layout maths, input line parsing, the animation vocabulary (`keyvizMotion.js`) and the ListModel reconciliation both renderers share (`listModelSync.js`) | yes |
| `ui/` | overlay window, group and keycap renderers | yes |
| `settings/` | settings sections and the shared row shell (`KeyvizRow`), the value fields (`KeyvizValueSetting`), the colour row and its swatch | no — DMS widgets |
| `dms/widgets/` | vendored copies of the DMS widgets the pages build on | no — vendored |
| `tests/helpers/` | the vm loader that runs `core/*.js` the way QML does | — |
| `tests/`, `docs/`, `fonts/` | Node/Qt tests, parity records, bundled Inter | — |

Five tests hold the structure together; each one exists because its failure once looked like
nothing more than a rendering bug:

- `tests/layering.test.cjs` — `core/` and `ui/` must not reference `qs.*`, `Theme`,
  `I18n`, `PluginService`, `StyledText` or the `Dank*` widgets.
- `tests/module-imports.test.cjs` — a `.js` module used through a qualifier must be imported
  in the same file, and every imported path must exist. Nothing else catches a missing one:
  qmllint stays quiet (it cannot resolve `qs.*`), the Node tests call the module directly, and
  the first symptom is a `ReferenceError` inside a signal handler at runtime.
- `tests/settings-style.test.cjs` — the settings pages are built from the DMS-styled
  rows (no stock `ComboBox`/`CheckBox`/`TextArea`, no dividers), and every row is labelled.
- `tests/list-model-sync.test.cjs` — rows are updated in place, never re-created.
- `tests/keycap-regression.test.cjs` — renders `Keycap`/`KeyvizGroup` with real Qt offscreen
  and asserts the geometry against keyviz's em measurements (must stay free of QWARNs).
- `tests/group-frame.test.cjs` — the group panel encloses everything it paints (below).

### The group panel is a background, never a clip

keyviz draws a rounded panel behind every group. `ui/KeyvizGroup.qml` therefore sets no
`clip` and masks nothing: a decoration that reaches past the row is drawn in full, and the
panel is grown to cover it instead. `core/groupFrame.js` owns that arithmetic — how far the
press-count badge sticks out of the top-right corner (a quarter of its own diameter), how far
`KeycapSurface` paints past its box (spread ring, laptop drop shadow), and how much padding a
corner of radius `r` needs before it stops biting into the content (`r − r/√2`). The keycap
and the group read the same numbers, so the drawing and the box cannot drift apart.

Enter/exit offsets may still carry a *fading* keycap past the panel for a moment, as they do
in keyviz; that is a translation, not a clip, and reserving a whole font size for it would
visibly unbalance the padding.

### Settings UI style

Every option is a row with the same chrome: label, an info icon whose tooltip carries the
description, a reset affordance that appears once the value differs from its default, and
a full-width control underneath. That is the shape of the vendored `*SettingPlus` widgets,
and `settings/KeyvizRow.qml` reproduces it for the two things those widgets cannot express:
the palette dropdown that drives *buttons* rather than binding to a setting, and a local-only
toggle (`DankToggle`) whose value is derived instead of stored. `KeyvizValueSetting` wraps a
numeric field, and `KeyvizColorRow` holds swatches. When adding
a setting, extend a row rather than dropping a control into a `SettingsCard`: a stock
`ComboBox` next to a themed row is exactly the mismatch `tests/settings-style.test.cjs`
rejects. Every component a page is allowed to declare is listed in that test's `ALLOWED`
set, so adding one means deciding there whether it belongs.

Colour settings are circular swatches, not fields: the circle *is* the value, so a
swatch costs very little width and related colours share one row — cap / base / label
sit side by side under a single label ("Keycap Colors"), as do the modifier colours and
the border colours. Clicking a swatch opens DMS's own colour picker, which carries an
**opacity** slider — keyviz writes `#RRGGBBAA` and its default group panel is
`#ffffff99`, so alpha has to survive the round trip; it is also why the circle sits on a
checkerboard. The hex literal no longer takes space on the page: it is in the swatch's
tooltip. Swatches that differ from their default get a dot, and the row's reset resets all of
them. `core/keycapColors.js` owns both directions of the CSS conversion (`cssToRgba`, `toCss`
and `cssColor`): Qt's own parser cannot do it, because it reads an 8-digit hex as
`#AARRGGBB`.

## Development

The plugin is loaded from `~/.config/DankMaterialShell/plugins/<id>/`, so the usual
setup is a symlink from there to your checkout.

**`dms ipc plugins reload keystrokes` recompiles `KeyvizDaemon.qml` only.** The overlay and the
`.js` modules it pulls in live in `ui/` and `core/`, so a reload leaves them running from
the previous compile. Editing the overlay and reloading therefore produces a **half-updated
plugin**: the daemon is new, the rendering is old, and the change appears to have had no
effect at all. This has already caused two false bug reports — the `+` separator "coming
back" and "Show Symbols is not implemented".

| you changed | what to run |
|---|---|
| `KeyvizDaemon.qml` | `dms ipc plugins reload keystrokes` |
| `ui/**`, `core/**`, `fonts/` | `dms restart` |
| `settings/**`, `dms/widgets/**` | `dms restart` |
| `plugin.json` | `dms restart` |

To check whether what is running matches what is on disk, compare the file mtimes with the
start time of the shell process:

```bash
ls -l --time-style=+'%m-%d %H:%M' ~/.config/DankMaterialShell/plugins/keystrokes/**/*.qml
ps -eo lstart,cmd | grep '[d]ms run'
```

If a source file is newer than the shell process, the running plugin is stale.

`npm test` runs the whole suite (`node --test tests/*.test.cjs`); the explicit glob matters,
because a bare `tests/` argument is interpreted differently across Node versions. The Qt
rendering test spawns `qmltestrunner` (Qt 6's, found at `/usr/lib/qt6/bin/` or through
`QML_TEST_RUNNER`) and **fails** rather than skips when it is missing, so install Qt 6 tools
before trusting a red run after touching `ui/`.

## Upstream

This plugin would not exist without two projects, and the split matters when reading the
code:

- **[mulaRahul/keyviz](https://github.com/mulaRahul/keyviz)** (MIT) — the *design and
  behaviour* this port follows. The four skins are ports of its keycap components
  (`src/components/keycaps/{minimal,laptop,lowprofile,pbt}.tsx`), and the event grouping and
  filter rules, press counts, colour/geometry defaults and the native style JSON come from
  the same `src/` — including `src/stores/key_style.ts`, whose `import`/`export` actions are
  what `dms ipc keystrokes exportStyle` / `importStyle` mirror (the JSON can be exchanged
  with keyviz itself). See `docs/keycap-style-parity.md` for what is 1:1 and what is not, and
  note that baseline is the local commit `ee7fda1`, not upstream's moving `main`.
  Icon paths come from Lucide at the version keyviz pins.
- **[loccun/dms-screenkey](https://github.com/loccun/dms-screenkey)** (MIT) — the *DMS
  plugin* this repository grew out of: the manifest, the daemon/widget/settings split and
  the input plumbing began there.

Where the plugin deliberately departs from keyviz, the code says so (for example the
mute keycap, whose icon follows the sink's mute state instead of always drawing the
crossed speaker).

One name keeps "keyviz" on purpose: the core modules (`keyvizStyle.js`,
`keyvizEvents.js`, `keyvizMotion.js`), because they speak keyviz's own format
and event model.

## License

MIT (see `LICENSE`).

### Third-party notices

- **Lucide** — the key icon path data in `KeyIcons.js` is copied verbatim from
  [`lucide-static@0.562.0`](https://github.com/lucide-icons/lucide), the version
  [keyviz](https://github.com/mulaRahul/keyviz) pins through `lucide-react`. Lucide is
  licensed under the **ISC License**:

  ```
  ISC License

  Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of
  Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors
  2022.

  Permission to use, copy, modify, and/or distribute this software for any purpose
  with or without fee is hereby granted, provided that the above copyright notice and
  this permission notice appear in all copies.

  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD
  TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS.
  IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR
  CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR
  PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
  ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
  ```

- **keyviz** — key layout, icon mapping, keycap geometry and animation presets are ported
  from `mulaRahul/keyviz` (MIT).

### Keycap rendering verification

`tests/keycap-regression.test.cjs` copies `ui/`, `core/` and `fonts/` into a temp directory,
shims `StyledText` away, and lets Qt render the real `Keycap` / `KeyvizGroup` offscreen — it
checks skin heights, padding, modifier alignment, long PBT labels, surface painting and
perceptual colour conversion. See [Development](#development) for how to run it.

Keycap labels use the bundled Inter Variable font, matching Keyviz's font family.
The font comes from [Inter](https://github.com/rsms/inter) and is distributed under
the SIL Open Font License in `fonts/Inter-LICENSE.txt`. Qt and WebView font
rasterization and shadow blur can differ slightly; geometry follows Keyviz's em
measurements.
