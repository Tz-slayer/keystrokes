# Keyviz

An always-on-top keystroke and mouse click visualizer for DankMaterialShell (DMS), suitable for screencasts, tutorials, and presentations. Based on [dms-screenkey](https://github.com/loccun/dms-screenkey), with animations ported from [mulaRahul/keyviz](https://github.com/mulaRahul/keyviz).

<img src="screenshot.png" width="400" alt="Screenshot">

## Install

Manually:
```bash
git clone <this-repo> ~/.config/DankMaterialShell/plugins/keyviz
```

> [!NOTE]
> This plugin is renamed from `screenkey` to `keyviz` and can be installed alongside the original.

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
- Keyviz JSON style import/export, the 14 upstream palettes and randomization.

The non-mouse port follows the local Keyviz baseline `ee7fda1`. See
[the parity and verification record](docs/keycap-style-parity.md) for scope and
renderer limitations. Mouse behavior remains a separate, existing extension.

The default **Focused Display (Auto)** output follows DMS's compositor-aware
focused screen. Selecting a named display pins the overlay to that output.

## Keycap Styles

Choose **Minimal**, **Laptop**, **Low Profile** or **PBT** in plugin settings.
Selecting Minimal also selects icon text mode, enables icons and disables
modifier highlighting, matching Keyviz's settings interaction. Saved legacy
`elevated` and `mechanical` names remain aliases.

### Custom Styles

Drop a JSON file into `~/.config/DankMaterialShell/keyviz_styles/` (filename without `.json` becomes the style id), then reopen the settings page. A ready-to-edit [`styles/TEMPLATE.json.example`](styles/TEMPLATE.json.example) ships with the plugin.

```json
{
    "name": "My Style",           // display name in the dropdown
    "type": "lowprofile",         // renderer shape: minimal | laptop | lowprofile | pbt
    "baseColor": "#2a2e33",       // cap face colour
    "secondaryColor": "#16181b",  // base wall / shell colour
    "textColor": "#e6e6e6",       // label colour
    "borderColor": "#3a3f46",     // outline colour
    "borderWidth": 1,             // outline width in px
    "cornerRadius": 0.35,         // 0..1, multiplied by font size
    "gradient": true              // face gradient (laptop vertical, pbt horizontal)
}
```

Any omitted field falls back to the built-in colours of the chosen `type`. See
[`styles/example-nord.json`](styles/example-nord.json) for a complete custom theme.

The four built-in `type`s are ports of keyviz's own keycap skins
(`src/components/keycaps/*.tsx`), so a custom style only needs to change colours
and radii -- the geometry comes from the skin:

| `type` | keyviz source | what it draws |
|---|---|---|
| `minimal` | `minimal.tsx` | no body at all; only the label/icon |
| `laptop` | `laptop.tsx` | one face, inset highlight + drop shadow; never moves on press |
| `lowprofile` | `lowprofile.tsx` | face sliding 0.25em into a base wall |
| `pbt` | `pbt.tsx` | shell with a 2.2em face inset by 0.3em, sliding 0.15em |

Older custom styles (and settings) that still say `type: "elevated"` or
`type: "mechanical"` keep working: they are mapped onto `lowprofile` and `pbt`
respectively.

## Usage

### Control Center Widget
Toggle the visualizer from the DMS Control Center:
- **Click widget** - Toggle the visualizer overlay on/off.
- **Click settings icon** - Open the Keyviz settings page.

### IPC Commands
Control the visualizer daemon via terminal:
```bash
# Toggle the visualizer
dms ipc keyviz toggle

# Enable the visualizer
dms ipc keyviz enable

# Disable the visualizer
dms ipc keyviz disable

# List loaded custom keycap styles (JSON array of ids)
dms ipc keyviz styles

# Rescan ~/.config/DankMaterialShell/keyviz_styles/ for new style files
dms ipc keyviz rescan

# Show a Ctrl + Shift + A sample through the keyboard state machine
dms ipc keyviz test
```

## Keyboard behavior and settings

Every accepted keyboard event is a keycap, including ordinary letters; no typing
stream is assembled. `Off` shows all keys. `Hotkeys` accepts sequences whose first
pressed key is Ctrl, Shift, Alt, Super or Fn. `Custom` tests that first key against
`Allowed Keys` (comma-separated labels; `Comma` represents the comma key).
Physical names such as `KEY_RIGHTCTRL` can restrict a custom filter to one side.

A held key remains visible. Released keys expire individually after `Fade Timeout`
(default 5000 ms), and repeated presses update that key's count. History retains
separate groups; replacement mode reuses a single group. Left/right modifier keys
retain independent physical state. Shift+F10 toggles visibility; the input listener
stays active while hidden so the shortcut can enable it again.

The settings page accepts native Keyviz style JSON in **Style Import / Export**.
Mouse data is preserved for roundtrip export but is not applied. You can also use
`dms ipc call keyviz exportStyle` and `dms ipc call keyviz importStyle '<json>'`.
Colors are CSS `#RRGGBB` or `#RRGGBBAA` (alpha last).

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

## Development

The plugin is loaded from `~/.config/DankMaterialShell/plugins/<id>/`, so the usual
setup is a symlink from there to your checkout.

**`dms ipc plugins reload keyviz` recompiles `KeyvizDaemon.qml` only.** The overlay
(`KeyvizOverlay.qml`) and the `.js` modules it imports (`KeyIcons.js`, `keycapColors.js`)
are *siblings* of the daemon, not children, so a reload leaves them running from the
previous compile. Editing the overlay and reloading therefore produces a **half-updated
plugin**: the daemon is new, the rendering is old, and the change appears to have had no
effect at all. This has already caused two false bug reports — the `+` separator "coming
back" and "Show Symbols is not implemented".

| you changed | what to run |
|---|---|
| `KeyvizDaemon.qml` | `dms ipc plugins reload keyviz` |
| `KeyvizOverlay.qml`, `*.js`, `fonts/` | `dms restart` |
| `plugin.json` | `dms restart` |

To check whether what is running matches what is on disk, compare the file mtimes with the
start time of the shell process:

```bash
ls -l --time-style=+'%m-%d %H:%M' ~/.config/DankMaterialShell/plugins/keyviz/*.qml
ps -eo lstart,cmd | grep '[d]ms run'
```

If a source file is newer than the shell process, the running plugin is stale.

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

Run `node --test tests/*.test.cjs` with Qt 6's `qmltestrunner`
installed (or set `QML_TEST_RUNNER` to its path). The tests instantiate the actual
keycap component offscreen and check skin heights, padding, modifier alignment,
long PBT labels, surface painting, and perceptual color conversion.

Keycap labels use the bundled Inter Variable font, matching Keyviz's font family.
The font comes from [Inter](https://github.com/rsms/inter) and is distributed under
the SIL Open Font License in `fonts/Inter-LICENSE.txt`. Qt and WebView font
rasterization and shadow blur can differ slightly; geometry follows Keyviz's em
measurements.
