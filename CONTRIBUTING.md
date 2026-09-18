# Contributing

This document is for anyone reading, patching or testing the code. If you just want to *use* the plugin, the [README](README.md) is the place to be.

Contents: [Getting set up](#getting-set-up) · [The hot-reload trap](#the-hot-reload-trap) ·
[Project layout](#project-layout) · [Two load-bearing decisions](#two-load-bearing-decisions) ·
[Cursor position](#cursor-position-why-the-ripple-is-missing) · [Testing](#testing) ·
[Settings UI style](#settings-ui-style) · [Parity with keyviz](#parity-with-keyviz)

## Getting set up

The plugin loads from `~/.config/DankMaterialShell/plugins/<id>/`, so the usual setup is a symlink from there to your checkout:

```bash
ln -s "$(pwd)" ~/.config/DankMaterialShell/plugins/keystrokes
```

## The hot-reload trap

**`dms ipc plugins reload keystrokes` recompiles `KeyvizDaemon.qml` only.** The overlay and the `.js` modules it pulls in live in `ui/` and `core/`, so a reload leaves them running from the previous compile. You get a *half-updated* plugin where the daemon is new and the rendering is old, and your change appears to have had no effect at all.

This has already produced two false bug reports — the `+` separator "coming back", and "Show Symbols is not implemented". Neither was real; both were stale rendering.

| You changed | Run |
|---|---|
| `KeyvizDaemon.qml` | `dms ipc plugins reload keystrokes` |
| `ui/**`, `core/**`, `fonts/` | `dms restart` |
| `settings/**`, `dms/widgets/**`, `plugin.json` | `dms restart` |

If a change to `settings/` does not appear in the running settings page, that is a third case of the same problem: DMS caches compiled QML, and only a full restart clears it.

To check whether what is running matches what is on disk, compare file mtimes with the shell's start time — if a source file is newer than the process, the running plugin is stale:

```bash
ls -l --time-style=+'%m-%d %H:%M' ~/.config/DankMaterialShell/plugins/keystrokes/**/*.qml
ps -eo lstart,cmd | grep '[d]ms run'
```

## Project layout

The runtime is split by **dependency, not by feature**, so the DMS coupling stays in one place: everything under `core/` and `ui/` is plain Qt Quick plus Quickshell, and only the three entry points at the repository root may import `qs.*`. This is what keeps the rendering testable offscreen and the plugin portable to a non-DMS shell.

| Path | What lives there | DMS-free? |
|---|---|---|
| `KeyvizDaemon.qml`, `KeyvizWidget.qml`, `KeyvizSettings.qml` | The entry points named by `plugin.json`. | no — DMS glue |
| `core/` | Event state machine, settings schema and migration, key labels, icon paths, colour maths, layout maths, input parsing, animation vocabulary, ListModel reconciliation. | **yes** |
| `ui/` | Overlay window, group and keycap renderers. | **yes** |
| `settings/` | Settings sections and their shared row chrome. | no — DMS widgets |
| `dms/widgets/` | Vendored copies of the DMS widgets the settings pages build on. | no — vendored |
| `tests/`, `docs/`, `fonts/` | Node/Qt tests, parity records, bundled Inter. | — |

Per-module detail:

- `core/keyvizStyle.js` — defaults, validation, migration, native-JSON conversion, palettes.
- `core/keyvizEvents.js` — immutable key state, filtering, grouping, counts and expiry.
- `core/keyvizMotion.js` — the single description of every easing curve and animation variant (fade/zoom/float/slide).
- `core/listModelSync.js` — the ListModel reconciliation the history rows and keycaps share (update in place, `dying`, delayed removal).
- `core/inputParse.js` — libinput/evtest line parsing (keys, keycodes, wheel direction, pointer deltas).
- `core/overlayLayout.js` — absolute group placement and output resolution.
- `core/groupFrame.js` — the arithmetic behind the group panel (see below).
- `core/keycapColors.js` — both directions of the CSS colour conversion.
- `KeyvizDaemon.qml` — the DMS entry point: input process, device scan, physical-key identity, global shortcut, plugin persistence; injects the focused output name into the overlay.
- `ui/KeyvizOverlay.qml` — the transparent click-through window, output selection and group arrangement.
- `ui/KeyvizGroup.qml` — identity-keyed keycap retention, per-cap enter/exit animation, the group background.
- `ui/Keycap.qml` / `ui/KeycapSurface.qml` — font, geometry, press feedback, border and gradient shadows.

Porting to a non-DMS Quickshell shell means replacing `PluginComponent`/`PluginService`, `Theme.*` and `StyledText`/`StyledRect` — **not** the windowing or key capture, which come from Quickshell and layer-shell.

## Two load-bearing decisions

### The group panel is a background, never a clip

keyviz draws a rounded panel behind each group. `ui/KeyvizGroup.qml` therefore sets no `clip` and masks nothing: a decoration that legitimately reaches past the row (the press-count badge, the laptop skin's drop shadow) is drawn in full, and the panel grows to cover it instead.

`core/groupFrame.js` owns that arithmetic — how far the badge sticks out of the top-right corner (a quarter of its own diameter), how far `KeycapSurface` paints past its box (spread ring, laptop drop shadow), and how much padding a corner of radius `r` needs before it stops biting into the content (`r − r/√2`). The keycap and the group read the same numbers, so the drawing and the box cannot drift apart.

Enter/exit offsets may still carry a *fading* keycap past the panel for a moment, as they do in keyviz. That is a translation, not a clip, and reserving a whole font size for it would visibly unbalance the padding.

### The screen state machine holds still on purpose

Moving the overlay's output re-creates the surface, which replays every keycap's entrance animation and reads as a refresh. So the output only changes when the compositor can actually *name* the focused output and that name survives a 250 ms settle window.

`CompositorService.getFocusedScreen()` cannot express "I don't know" — it answers `screens[0]`, which is indistinguishable from a real move to the first monitor, and a workspace switch can leave that gap. The overlay therefore reads the raw output name itself and holds its current output while the name is unknown. If the window is re-created anyway (a genuine move to another display), the groups are restored at rest instead of replaying their entrance animation.

The value that decides all this is an **output** name (from `NiriService.currentOutput`), not a workspace, so switching workspaces inside one output does not move the overlay — only focus landing on another output does. `@primary` pins it to the first output with no motion at all, which is what keyviz does by pinning `appearance.monitor` to `monitors[0]` (`appearance.tsx:28-29`).

> [!IMPORTANT]
> **Automatic mode is stored as a truthy sentinel** (`@focused`), not an empty string. DMS's `SelectionSettingPlus` resolves a chosen dropdown label with `labelToValue[label] || label`, and an empty-string option value is falsy — so `""` silently persists the option's own *label*, leaving the overlay pinned to one display with the setting unable to recover. That was a real bug.
>
> The rule lives in exactly one place (`core/overlayLayout.followsFocus`), which both the overlay and the settings page call; the legacy `""` spelling is still read as automatic so existing installs keep working. **Any new dropdown option whose value could be `""`, `0` or `false` has the same hazard.**

Group positions use absolute targets within the screen, so removing a history item at the bottom or right cannot produce a doubled movement from a resized parent plus a child position animation.

## Cursor position (why the ripple is missing)

Three keyviz features anchor to the **absolute pointer position**: the click ring, the always-on highlight, and the button indicator next to the cursor. None of them are implemented here, and this is why.

A Wayland client cannot read that position on its own, and reading the raw device nodes does not help: `/dev/input/event*` carries only *relative* deltas (`REL_X` / `REL_Y`) plus button and wheel state. The cursor position lives in the compositor, not in the kernel.

Measured on this machine with a `uinput` virtual pointer, 20 identical writes of `REL_X = 10`:

| | raw evdev | libinput `POINTER_MOTION` |
|---|---|---|
| slow (50 ms apart) | `10` every time | 3.50, 9.00, then 10.00 → **92.5 px** total |
| fast (1 ms apart) | `10` every time | 9.20, 17.54, then 20.00 → **186.7 px** total |

So raw deltas are not pixels: the same 200 device units became 92.5 px or 186.7 px purely because of speed. libinput's own motion values already include acceleration, so integrating *those* tracks the cursor far better — but it still needs a starting seed, the per-output scale factor, screen-edge clamping, and a way to survive compositor warps, none of which a client can obtain. Checked against the target environment:

- **niri** (26.04) — `niri msg` exposes `outputs`, `workspaces`, `windows`, `layers`, `focused-output`, `focused-window`, `pick-window`, `pick-color`, `event-stream`, … but **no cursor-position query**, and no cursor-related `action` either.
- **Quickshell** ships no global cursor API (`Quickshell/Wayland` only touches the cursor through screencopy, i.e. a captured image, not coordinates).
- A click-through layer-shell surface cannot receive pointer motion, and a non-click-through one would swallow clicks from every application below it.
- **Xwayland** is running here (`-rootless`) and `xdotool getmouselocation` does return absolute coordinates that round-trip with `xdotool mousemove`. It is **not confirmed** whether that value tracks the compositor cursor or only updates while the pointer sits over an X client, so nothing depends on it.

Everything keyviz does at the *event* level (button keycaps, `Drag`, `ScrollUp`/`ScrollDown`) is reachable from `/dev/input` without any of this. A ripple anchored to the real cursor needs compositor cooperation (an IPC query or a `wl_pointer`-style global) that niri does not currently provide.

## Testing

```bash
npm test        # node --test tests/*.test.cjs
```

The explicit glob matters — a bare `tests/` argument is interpreted differently across Node versions. The Qt rendering tests spawn `qmltestrunner` (Qt 6's, found at `/usr/lib/qt6/bin/` or via `QML_TEST_RUNNER`) and **fail** rather than skip when it is missing, so install the Qt 6 tools before trusting a red run after touching `ui/`.

There is also a lint gate (the `Expected token ';'` lines are a known false positive on files starting with `pragma ComponentBehavior: Bound`):

```bash
qmllint KeyvizDaemon.qml KeyvizSettings.qml ui/*.qml settings/*.qml
```

Each guard exists because its failure once looked like nothing more than a rendering bug:

| Test | What it holds |
|---|---|
| `layering.test.cjs` | `core/` and `ui/` must not reference `qs.*`, `Theme`, `I18n`, `PluginService`, `StyledText` or the `Dank*` widgets. |
| `module-imports.test.cjs` | A `.js` module used through a qualifier must be imported in the same file, and every imported path must exist. Nothing else catches a missing one: qmllint cannot resolve `qs.*`, the Node tests call the module directly, and the first symptom is a `ReferenceError` inside a signal handler at runtime. |
| `settings-style.test.cjs` | Settings pages are built from the DMS-styled rows; no stock `ComboBox`/`CheckBox`/`TextArea`, no dividers. Every component a page may declare is listed in that test's `ALLOWED` set. |
| `list-model-sync.test.cjs` | Rows are updated in place, never re-created. |
| `keycap-regression.test.cjs` | Renders `Keycap`/`KeyvizGroup` with real Qt offscreen and asserts geometry against keyviz's em measurements (must stay free of QWARNs). |
| `group-frame.test.cjs` | The group panel encloses everything it paints. |
| `follow-focus.test.cjs` | Drives the screen state machine through the pin-and-return round trip. |

Plus the pure-logic suites (`keyvizEvents`, `keyvizStyle`, `KeyIcons`, `overlayLayout`, `inputParse`, `keyvizMotion`), which cover the state machine, settings migration, icon mapping, layout maths, parse rules and animation variants.

`tests/keycap-regression.test.cjs` copies `ui/`, `core/` and `fonts/` into a temp directory, shims `StyledText` away, and lets Qt render the real components offscreen — checking skin heights, padding, modifier alignment, long PBT labels, surface painting and perceptual colour conversion. Core-module statement coverage is 95–100%, with the remaining gaps in `keyMapper.js` (89%) and `keycapColors.js` (74%); QML is covered by runtime assertions and screenshot checks.

When you change a *rendering* component, the assertions should be able to fail: the group-panel invariants were verified by deliberately breaking them (`CORNER_INSET = 0`, and dropping the badge's reserved outset) and confirming the tests went red before restoring.

## Settings UI style

Every option is a row with the same chrome: label, an info icon whose tooltip carries the description, a reset affordance that appears once the value differs from its default, and a full-width control underneath. That is the shape of the vendored `*SettingPlus` widgets, and `settings/KeyvizRow.qml` reproduces it for the cases they cannot express — the palette dropdown that drives *buttons* rather than binding to a setting, and the local-only margins toggle whose value is derived instead of stored.

**When adding a setting, extend a row rather than dropping a control into a `SettingsCard`.** A stock `ComboBox` next to a themed row is exactly the mismatch `settings-style.test.cjs` rejects, so adding one means deciding in that test whether it belongs.

`dms/widgets/*` are vendored copies of DMS's own widgets and are kept close to upstream, which is why the row shell is written a second time in `settings/KeyvizRow.qml` instead of being shared.

Colours are circular swatches, not fields: the circle *is* the value, so related colours share one row — cap / base / label sit side by side under a single label, as do the modifier colours and the border colours. Clicking a swatch opens DMS's colour picker, which carries an **opacity** slider; keyviz writes `#RRGGBBAA` and its default group panel is `#ffffff99`, so alpha has to survive the round trip. That is also why the circle sits on a checkerboard. Swatches that differ from their default get a dot, and the row's reset resets all of them.

`core/keycapColors.js` owns both directions of the CSS conversion (`cssToRgba`, `toCss`, `cssColor`), because Qt's own parser reads an 8-digit hex as `#AARRGGBB` rather than `#RRGGBBAA`.

## Parity with keyviz

The non-mouse port is written against the local keyviz baseline commit `ee7fda1`. [docs/keycap-style-parity.md](docs/keycap-style-parity.md) records what is 1:1 and what is not, why, and which checks back each claim.

Where this plugin deliberately departs from keyviz, the code says so. The clearest example is the mute keycap: keyviz always draws a crossed speaker, whereas here the icon follows the sink's real mute state. Sending a mouse event into its own history row is another — keyviz mints a fresh uid for it, which destroyed and rebuilt every keycap on screen, so `Mod`+wheel workspace switching in niri flickered; both now share the keyboard state machine, exactly as upstream feeds them into `onKeyPress`/`onKeyRelease`.

Known divergences to keep in mind:

- Qt and WebView font anti-aliasing, shadow convolution and wide-gamut mapping can still differ by a few pixels. There is no claim of pixel equality and the generated preview is not passed off as a screenshot diff.
- Software rendering cannot do Qt's shader mask: it falls back to rectangular content clipping, while the background itself stays rounded. Hardware rendering uses the rounded mask. Both paths were verified to keep the keycaps visible.
- One upstream index bug is fixed: keyviz failed to refresh the timestamp when the first key of a group was released, so a long press could vanish the moment you let go.

## License

By contributing you agree your changes are licensed under the project's MIT license — see [LICENSE](LICENSE).
