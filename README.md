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

[Install](#install) · [What it does](#what-it-does) · [Keycap styles](#keycap-styles) · [Everyday use](#everyday-use) · [Settings](#settings) · [Theming and portability](#theming-and-portability) · [Mouse support](#mouse-support) · [Troubleshooting](#troubleshooting) · [Credits](#credits) · [Contributing](#contributing) · [License](#license)

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

One keyviz feature is deliberately **not** implemented: the **ripple and indicator anchored to the cursor**. A Wayland client cannot read the absolute pointer position, and the raw device nodes only carry relative deltas that are not pixels. Implementing it truthfully needs compositor support that does not exist yet; the measurements behind that conclusion are in [CONTRIBUTING.md](CONTRIBUTING.md#cursor-position-why-the-ripple-is-missing).

## Troubleshooting

**Nothing appears when I type.**
Check in order: is the visualizer enabled? Is your user in the `input` group (`id -nG | tr ' ' '\n' | grep input`)? Is the libinput CLI installed? Is the **Event Filter** set to **Hotkeys** while you are testing with ordinary letters? `dms ipc keystrokes test` should always draw something — if it does, input plumbing is the problem, not rendering.

**It stopped appearing on my second monitor.**
The default **Display** setting follows the focused output. If it seems stuck, reselect **Follow focused output** in settings.

**I changed the overlay and my edit had no effect.**
You probably used `reload` instead of `restart`, which leaves the rendering running from the previous compile. See [CONTRIBUTING.md](CONTRIBUTING.md#the-hot-reload-trap) — this is the single most common source of false bug reports here.

**The keycaps look slightly different from keyviz's own screenshots.**
Qt and WebView rasterize fonts and blur shadows slightly differently. Geometry follows keyviz's em measurements, not its pixels.

## Credits

This plugin would not exist without two projects, and the split matters when reading the code:

- **[mulaRahul/keyviz](https://github.com/mulaRahul/keyviz)** (MIT) — the design and behaviour this port follows. The four skins are ports of its keycap components, and the event grouping and filter rules, press counts, colour and geometry defaults, and the native style JSON all come from the same `src/`. The baseline is the local commit `ee7fda1`, not upstream's moving `main`. Icon paths come from Lucide at the version keyviz pins.
- **[loccun/dms-screenkey](https://github.com/loccun/dms-screenkey)** (MIT) — the DMS plugin this repository grew out of: the manifest, the daemon/widget/settings split and the input plumbing began there.

Where the plugin deliberately departs from keyviz, the code says so — the mute keycap is the clearest example, drawing the sink's real mute state instead of always showing a crossed speaker.

One name keeps "keyviz" on purpose: the core modules (`keyvizStyle.js`, `keyvizEvents.js`, `keyvizMotion.js`), because they speak keyviz's own format and event model.

## Contributing

Developer documentation — setup, the reload/restart trap, project layout, testing and the reasoning behind the trickier design decisions — lives in **[CONTRIBUTING.md](CONTRIBUTING.md)**. The parity record for the keyviz port is in [docs/keycap-style-parity.md](docs/keycap-style-parity.md).

## License

MIT — see [LICENSE](LICENSE).

**Third-party notices.** Key icon path data in `core/KeyIcons.js` is copied verbatim from [`lucide-static@0.562.0`](https://github.com/lucide-icons/lucide) (ISC License). Key layout, icon mapping, keycap geometry and animation presets are ported from [keyviz](https://github.com/mulaRahul/keyviz) (MIT). Labels use the bundled [Inter](https://github.com/rsms/inter) Variable font (SIL Open Font License, see `fonts/Inter-LICENSE.txt`).
