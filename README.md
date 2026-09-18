# Keystrokes

**A keystroke and mouse-action overlay for [DankMaterialShell](https://github.com/AvengeMedia/DankMaterialShell) — the thing that draws your keypresses on screen while you record a screencast.**

Press `Ctrl + Shift + S` and three keycaps appear over your desktop, animate in, and fade out when you let go. Combinations are grouped into a single row; ordinary typing shows individual keys. It is a port of [mulaRahul/keyviz](https://github.com/mulaRahul/keyviz) to Quickshell/QML, which means it looks and behaves like keyviz rather than merely resembling it.

<img src="screenshot.png" width="500" alt="The overlay showing Shift + Super + S">

|  |  |
|---|---|
| Repository | <https://github.com/Tz-slayer/keystrokes> |
| Plugin id | `keystrokes` (settings key, IPC target, install directory) |
| Version | 1.2.0 |
| Requires | DMS ≥ 1.5.0 · Quickshell ≥ 0.3.1 · `libinput` CLI · membership of the `input` group |
| License | MIT |

## Contents

[Install](#install) · [What it does](#what-it-does) · [Keycap styles](#keycap-styles) · [Everyday use](#everyday-use) · [Settings](#settings) · [Theming and portability](#theming-and-portability) · [Mouse support](#mouse-support) · [Troubleshooting](#troubleshooting) · [Under the hood](#under-the-hood) · [Development](#development) · [Credits](#credits) · [License](#license)

## Install

```bash
git clone https://github.com/Tz-slayer/keystrokes.git \
  ~/.config/DankMaterialShell/plugins/keystrokes
```

Then enable it in DMS. Because it reads input devices directly, your user needs to be in the `input` group, and you need the libinput command-line tool:

```bash
sudo usermod -aG input $USER                      # then log out and back in
sudo pacman -S libinput                           # Arch
sudo apt install libinput-tools                   # Debian / Ubuntu
sudo dnf install libinput-utils                   # Fedora
```

`evtest` is optional — only used as a fallback if you run in single-device mode without the libinput CLI.

<details>
<summary>Upgrading from an older install (the plugin was called <code>keyviz</code>)</summary>

The id is what DMS keys settings on, so an upgrade has to move three things:

1. Rename the install directory to `plugins/keystrokes`.
2. Move the `keyviz` object to `keystrokes` inside `~/.config/DankMaterialShell/plugin_settings.json`.
3. Use `dms ipc keystrokes …` instead of `dms ipc keyviz …`.

</details>

## What it does

- **Combinations and single keys.** `Ctrl + Shift + S` is one row; typed letters appear individually.
- **Four keyviz keycap skins**, ported 1:1 from keyviz's own components — see [Keycap styles](#keycap-styles).
- **Real press feedback.** A keycap sinks while the key is physically held and rises on release.
- **Per-key repeat counts.** Hold or hammer a key and a badge counts the repeats.
- **Five animations** (none / fade / zoom / float / slide) with a configurable duration.
- **History and replacement modes**, horizontal or vertical, with a configurable limit.
- **Nine-way positioning** on any display, with independent or linked X/Y margins.
- **Full colour control** — separate normal and modifier colours for cap face, base wall, label and border; gradients; fractional border widths and radii.
- **Filtering** — show every key, only hotkeys, or your own list of first keys.
- **14 upstream colour palettes** plus style randomization.
- **Mouse clicks, drags and wheel** as keycaps (off by default).
- **A mute keycap that knows the state** — crossed speaker while muted, sound waves while not.
- **A global toggle shortcut** (default `Shift + F10`).
- **Themes move between machines** as native keyviz style JSON.

## Keycap styles

Pick one in settings. All four are straight ports of keyviz's keycap components, so the geometry is keyviz's, not an approximation:

<img src="docs/keycap-preview.png" width="620" alt="The four skins rendered by this plugin's QML: minimal, laptop, lowprofile, pbt">

| Skin | Look |
|---|---|
| **Minimal** | No keycap body at all — just the label and icon. |
| **Laptop** | A single flat face with an inset highlight and drop shadow. Doesn't move on press. |
| **Low Profile** *(default)* | A face that sinks 0.25 em into a base wall. |
| **PBT** | A tall shell around an inset face that sinks into it. |

Choosing **Minimal** also switches to icon labels, enables icons and turns off modifier highlighting, matching what keyviz does when you pick it there.

The skin supplies the *geometry*, your colour settings supply every *colour* — so one set of colours renders all four consistently. A stored skin name that no longer exists falls back to PBT.

## Everyday use

**From the DMS Control Center:** click the widget to toggle the overlay, click its settings icon to open this plugin's settings page.

**From the keyboard:** `Shift + F10` toggles visibility. The input listener keeps running while the overlay is hidden, so the shortcut can bring it back.

**From the command line:**

```bash
dms ipc keystrokes toggle              # toggle the overlay
dms ipc keystrokes enable              # or force it on / off
dms ipc keystrokes disable

dms ipc keystrokes setStyle pbt        # minimal | laptop | lowprofile | pbt
dms ipc keystrokes test                # show a sample Ctrl + Shift + A, no typing needed

dms ipc keystrokes exportStyle         # dump the theme as keyviz style JSON
dms ipc keystrokes importStyle '<json>'  # apply one
```

`setStyle` still accepts the retired names `elevated` and `mechanical`, mapped to `lowprofile` and `pbt`.

## Settings

The settings page is grouped as follows.

| Group | What you control |
|---|---|
| **Keyviz Color Presets** | The 14 upstream palettes and style randomization. |
| **Keyviz Filtering & History** | Event filter, the custom allowed-key list, history on/off, direction, limit, and the toggle shortcut. |
| **Keyviz Display & Margins** | Which output to draw on, linked or independent X/Y margins. |
| **Keyviz Colors & Border** | Normal and modifier colours, gradient, border width and corner radius. |
| **General Settings** | Enable, fade timeout, font size. |
| **Layout & Animations** | Screen position, keycap style, animation type and duration. |
| **Keycap Content** | Label variant (icon / full text / short text), text case, alignment, icons, symbols, modifier alignment. |
| **Group Background** | The rounded panel behind each group, and its colour. |
| **Visibility Options** | Mouse events, drag threshold, press-count badge. |
| **Input Device** | Follow all keyboards, or listen to one device. |

### Filtering, in detail

Every accepted event becomes a keycap — there is no typing-stream mode.

- **Off** — show all keys.
- **Hotkeys** — show a sequence only when its *first* pressed key is Ctrl, Shift, Alt, Super or Fn. So `Ctrl` then `A` shows, but `A` then `Ctrl` does not.
- **Custom** — test that first key against your own comma-separated list.

Physical names like `KEY_RIGHTCTRL` are accepted, letting you restrict a filter to one side. Under **Hotkeys** a lone media key — mute included — is dropped, exactly as keyviz drops it; use **Off** to see everything. Old `showNormalKeys`, `historyLimit` and `marginSize` values migrate automatically when no newer value is set.

### Behaviour worth knowing

A **held key stays visible** until you release it. Released keys expire individually after the **Fade Timeout** (default 5000 ms), and pressing a key again updates its count rather than adding a new cap. History mode keeps separate groups; replacement mode reuses one group. Left and right modifiers keep independent physical state.

## Theming and portability

`exportStyle` emits the entire theme as **native keyviz style JSON**, and `importStyle` applies one. The format is identical to keyviz's own, so a theme exported here loads into keyviz and vice versa — mouse settings ride along in the file but are never applied by this plugin.

Imports are validated field by field (enums, ranges, colour format) and rejected as a whole rather than partially applied. Colours are CSS `#RRGGBB` or `#RRGGBBAA` — **alpha last**, as keyviz writes them.

> [!NOTE]
> Two earlier ways of loading a JSON skin have been removed: a `keyviz_styles/` folder scan and a settings-page import/export card. The four skins plus the colour settings cover the same ground, and whole themes still move through the IPC commands above.

## Mouse support

Mouse buttons, `Drag` and the wheel are off by default; enable **Show Mouse Events**. They then run through the *same* state machine as the keyboard, mirroring keyviz — so they join the row a held modifier started, and `Ctrl` + wheel is one `Ctrl + ScrollDown` row rather than a second one.

One keyviz feature is deliberately not implemented: the **ripple and indicator anchored to the cursor**. A Wayland client cannot read the absolute pointer position, and `/dev/input/event*` carries only *relative* deltas that are not pixels — the same 20 device units measured 92.5 px or 186.7 px depending purely on how fast the mouse moved, because acceleration is applied downstream. `niri` exposes no cursor-position query and Quickshell has no global cursor API, so a truthful implementation needs compositor support that does not exist yet. The measurements and the full reasoning are in [docs/keycap-style-parity.md](docs/keycap-style-parity.md) and the *Cursor position* section below.

## Troubleshooting

**Nothing appears when I type.**
Check in order: is the visualizer enabled? Is your user in the `input` group (`id -nG | tr ' ' '\n' | grep input`)? Is the libinput CLI installed? Is the **Event Filter** set to **Hotkeys** while you are testing with ordinary letters? `dms ipc keystrokes test` should always draw something — if it does, input plumbing is the problem, not rendering.

**It stopped appearing on my second monitor.**
The default **Display** setting follows the focused output. If it seems stuck, reselect **Follow focused output** in settings — see the note in *Under the hood* about why that setting needs a truthy sentinel.

**I changed the overlay and my edit had no effect.**
You probably used `reload` instead of `restart`. See [Development](#development) — this is the single most common source of false bug reports here.

**The keycaps look slightly different from keyviz's own screenshots.**
Qt and WebView rasterize fonts and blur shadows slightly differently. Geometry follows keyviz's em measurements, not its pixels.

## Under the hood

This section is for anyone reading or patching the code. If you just want to use the plugin, you can stop here.

### Layout, split by dependency

Everything under `core/` and `ui/` is plain Qt Quick plus Quickshell. Only the three entry points at the repository root may import `qs.*` (the DMS API). This is enforced by a test, and it is what keeps the rendering testable offscreen and the plugin portable to a non-DMS Quickshell shell.

| Path | What lives there | DMS-free? |
|---|---|---|
| `KeyvizDaemon.qml`, `KeyvizWidget.qml`, `KeyvizSettings.qml` | The entry points named by `plugin.json`. | no — DMS glue |
| `core/` | Event state machine, settings schema and migration, key labels, icon paths, colour maths, layout maths, input parsing, animation vocabulary, ListModel reconciliation. | **yes** |
| `ui/` | Overlay window, group and keycap renderers. | **yes** |
| `settings/` | Settings sections and their shared row chrome. | no — DMS widgets |
| `dms/widgets/` | Vendored copies of the DMS widgets the settings pages build on. | no — vendored |
| `tests/`, `docs/`, `fonts/` | Node/Qt tests, parity records, bundled Inter. | — |

Porting to a non-DMS Quickshell shell means replacing `PluginComponent`/`PluginService`, `Theme.*` and `StyledText`/`StyledRect` — not the windowing or key capture, which come from Quickshell and layer-shell.

### Two design decisions that are load-bearing

**The group panel is a background, never a clip.** keyviz draws a rounded panel behind each group. `ui/KeyvizGroup.qml` sets no `clip` and masks nothing: a decoration that legitimately reaches past the row (the press-count badge, the laptop skin's drop shadow) is drawn in full, and the panel grows to cover it. `core/groupFrame.js` owns that arithmetic, so the keycap and the group read the same numbers and the drawing cannot drift from the box.

**The screen state machine holds still on purpose.** Moving the overlay's output re-creates the surface, which replays every keycap's entrance animation and reads as a refresh. So the output only changes when the compositor can actually *name* the focused output and that name survives a 250 ms settle window. `CompositorService.getFocusedScreen()` cannot express "I don't know" — it answers `screens[0]`, indistinguishable from a real move to the first monitor — so the overlay reads the raw output name and holds its current output while unknown.

> [!IMPORTANT]
> **Automatic mode is stored as a truthy sentinel** (`@focused`), not an empty string. DMS's `SelectionSettingPlus` resolves a chosen dropdown label with `labelToValue[label] || label`, and an empty-string option value is falsy — so `""` would silently persist the option's own *label*, leaving the overlay pinned to one display with the setting unable to recover. The rule lives in exactly one place (`core/overlayLayout.followsFocus`), which both the overlay and the settings page call; the legacy `""` spelling is still read as automatic so existing installs keep working. Any new dropdown option whose value could be `""`, `0` or `false` has the same hazard.

### Cursor position (why the ripple is missing)

Measured on this machine with a `uinput` virtual pointer, 20 identical writes of `REL_X = 10`:

| | raw evdev | libinput `POINTER_MOTION` |
|---|---|---|
| slow (50 ms apart) | `10` every time | 3.50, 9.00, then 10.00 → **92.5 px** total |
| fast (1 ms apart) | `10` every time | 9.20, 17.54, then 20.00 → **186.7 px** total |

Raw deltas are not pixels. libinput's values already include acceleration, so integrating *those* tracks the cursor far better — but it still needs a starting seed, the per-output scale factor, screen-edge clamping, and a way to survive compositor warps, none of which a client can obtain. Checked and ruled out:

- **niri** exposes `outputs`, `workspaces`, `windows`, `layers`, `focused-output`, `focused-window`, `pick-window`, `pick-color`, `event-stream` — but no cursor-position query and no cursor action.
- **Quickshell** ships no global cursor API.
- A click-through layer-shell surface receives no pointer motion; a non-click-through one would swallow clicks from everything below it.
- **Xwayland** is running here and `xdotool getmouselocation` does return coordinates that round-trip — but it is unconfirmed whether that tracks the compositor cursor or only updates over X clients, so nothing depends on it.

Everything keyviz does at the *event* level is reachable without any of this.

### Testing

```bash
npm test        # node --test tests/*.test.cjs
```

The explicit glob matters — a bare `tests/` argument behaves differently across Node versions. The Qt rendering tests spawn `qmltestrunner` (Qt 6's, found at `/usr/lib/qt6/bin/` or via `QML_TEST_RUNNER`) and **fail** rather than skip when it is missing, so install the Qt 6 tools before trusting a red run after touching `ui/`.

Each guard exists because its failure once looked like nothing more than a rendering bug:

| Test | What it holds |
|---|---|
| `layering.test.cjs` | `core/` and `ui/` must not reference DMS types. |
| `module-imports.test.cjs` | A `.js` module used through a qualifier must be imported in the same file. Nothing else catches this — qmllint cannot resolve `qs.*`, and the first symptom is a `ReferenceError` in a signal handler at runtime. |
| `settings-style.test.cjs` | Settings pages are built from the DMS-styled rows; no stock `ComboBox`/`CheckBox`/`TextArea`. |
| `list-model-sync.test.cjs` | Rows are updated in place, never re-created. |
| `keycap-regression.test.cjs` | Renders `Keycap`/`KeyvizGroup` with real Qt offscreen and asserts geometry against keyviz's em measurements. |
| `group-frame.test.cjs` | The group panel encloses everything it paints. |
| `follow-focus.test.cjs` | Drives the screen state machine through the pin-and-return round trip. |

`tests/keycap-regression.test.cjs` copies `ui/`, `core/` and `fonts/` into a temp directory, shims `StyledText`, and lets Qt render the real components — checking skin heights, padding, modifier alignment, long PBT labels, surface painting and perceptual colour conversion.

### Settings UI style

Every option is a row with the same chrome: label, an info icon whose tooltip carries the description, a reset affordance that appears once the value differs from its default, and a full-width control underneath. That is the shape of the vendored `*SettingPlus` widgets, and `settings/KeyvizRow.qml` reproduces it for the cases they cannot express.

When adding a setting, extend a row rather than dropping a control into a `SettingsCard` — a stock `ComboBox` next to a themed row is exactly the mismatch `settings-style.test.cjs` rejects, and every component a page may declare is listed in that test's `ALLOWED` set.

Colours are circular swatches, not fields: the circle *is* the value, so related colours share a row. Clicking one opens DMS's colour picker, which carries an **opacity** slider — keyviz writes `#RRGGBBAA` and its default group panel is `#ffffff99`, so alpha has to survive the round trip. That is also why the circle sits on a checkerboard. `core/keycapColors.js` owns both directions of the CSS conversion, because Qt's own parser reads an 8-digit hex as `#AARRGGBB`.

## Development

The plugin loads from `~/.config/DankMaterialShell/plugins/<id>/`, so the usual setup is a symlink from there to your checkout.

**`dms ipc plugins reload keystrokes` recompiles `KeyvizDaemon.qml` only.** The overlay and the `.js` modules it pulls in live in `ui/` and `core/`, so a reload leaves them running from the previous compile — you get a *half-updated* plugin where the daemon is new and the rendering is old, and your change appears to have had no effect at all. This has already produced two false bug reports.

| You changed | Run |
|---|---|
| `KeyvizDaemon.qml` | `dms ipc plugins reload keystrokes` |
| `ui/**`, `core/**`, `fonts/` | `dms restart` |
| `settings/**`, `dms/widgets/**`, `plugin.json` | `dms restart` |

To check whether what is running matches what is on disk, compare file mtimes with the shell's start time — if a source file is newer than the process, the running plugin is stale:

```bash
ls -l --time-style=+'%m-%d %H:%M' ~/.config/DankMaterialShell/plugins/keystrokes/**/*.qml
ps -eo lstart,cmd | grep '[d]ms run'
```

## Credits

This plugin would not exist without two projects, and the split matters when reading the code:

- **[mulaRahul/keyviz](https://github.com/mulaRahul/keyviz)** (MIT) — the design and behaviour this port follows. The four skins are ports of its keycap components, and the event grouping and filter rules, press counts, colour and geometry defaults, and the native style JSON all come from the same `src/`. The baseline is the local commit `ee7fda1`, not upstream's moving `main`. Icon paths come from Lucide at the version keyviz pins.
- **[loccun/dms-screenkey](https://github.com/loccun/dms-screenkey)** (MIT) — the DMS plugin this repository grew out of: the manifest, the daemon/widget/settings split and the input plumbing began there.

Where the plugin deliberately departs from keyviz, the code says so — the mute keycap is the clearest example, drawing the sink's real mute state instead of always showing a crossed speaker.

One name keeps "keyviz" on purpose: the core modules (`keyvizStyle.js`, `keyvizEvents.js`, `keyvizMotion.js`), because they speak keyviz's own format and event model.

## License

MIT — see [LICENSE](LICENSE).

**Third-party notices.** Key icon path data in `core/KeyIcons.js` is copied verbatim from [`lucide-static@0.562.0`](https://github.com/lucide-icons/lucide) (ISC License). Key layout, icon mapping, keycap geometry and animation presets are ported from [keyviz](https://github.com/mulaRahul/keyviz) (MIT). Labels use the bundled [Inter](https://github.com/rsms/inter) Variable font (SIL Open Font License, see `fonts/Inter-LICENSE.txt`).
