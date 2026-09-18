# Keystrokes

**A keystroke and mouse-action overlay for [DankMaterialShell](https://github.com/AvengeMedia/DankMaterialShell)** — draws your keypresses on screen while you record a screencast.

Press `Ctrl + Shift + S` and three keycaps appear over your desktop, animate in, and fade out when you let go. Combinations group into one row; ordinary typing shows single keys. It is a port of [mulaRahul/keyviz](https://github.com/mulaRahul/keyviz) to Quickshell/QML, so it looks and behaves like the original rather than merely resembling it.

<img src="screenshot.png" width="500" alt="The overlay showing Shift + Super + S">

|  |  |
|---|---|
| Plugin id | `keystrokes` (settings key, IPC target, install directory) |
| Version | 1.2.0 |
| Requires | DMS ≥ 1.5.0 · Quickshell ≥ 0.3.1 · `libinput` CLI · membership of the `input` group |
| License | MIT |

## Install

```bash
git clone https://github.com/Tz-slayer/keystrokes.git \
  ~/.config/DankMaterialShell/plugins/keystrokes
```

Then enable it in DMS. Because it reads input devices directly, your user must be in the `input` group and the libinput CLI has to be installed:

```bash
sudo usermod -aG input $USER     # then log out and back in
sudo pacman -S libinput          # Arch
```

`evtest` is optional — a fallback for single-device mode when the libinput CLI is unavailable.

<details>
<summary>Upgrading from an older install (the plugin was called <code>keyviz</code>)</summary>

The id is what DMS keys settings on, so an upgrade has to move three things:

1. Rename the install directory to `plugins/keystrokes`.
2. Move the `keyviz` object to `keystrokes` inside `~/.config/DankMaterialShell/plugin_settings.json`.
3. Use `dms ipc keystrokes …` instead of `dms ipc keyviz …`.

</details>

## What it does

- **Combinations and single keys.** `Ctrl + Shift + S` is one row; typed letters appear individually.
- **Four keycap skins** ported 1:1 from keyviz — minimal, laptop, low profile and PBT. See [Keycap styles](#keycap-styles).
- **Real press feedback**, with a badge counting repeats while you hold or hammer a key.
- **Five animations** (none / fade / zoom / float / slide), any position on any display, independent X/Y margins.
- **Full colour control** — separate normal and modifier colours, gradients, fractional border widths and radii.
- **Filtering** — every key, hotkeys only, or your own list of first keys.
- Mouse clicks, drags and wheel as keycaps (off by default), and a mute keycap that knows the real sink state.

## Keycap styles

<img src="docs/keycap-preview.png" width="620" alt="The four skins rendered by this plugin's QML: minimal, laptop, lowprofile, pbt">

All four are straight ports of keyviz's keycap components, so the geometry is keyviz's rather than an approximation. Pick one in settings — **Low Profile** is the default. Choosing **Minimal** also switches to icon labels and turns off modifier highlighting, matching what keyviz does there.

The skin supplies the *geometry*, your colour settings supply every *colour*, so one set of colours renders all four consistently.

## Everyday use

Click the DMS widget to toggle the overlay, or press `Shift + F10` — the input listener keeps running while the overlay is hidden, so the shortcut can bring it back. The same commands are on hand from a shell:

```bash
dms ipc keystrokes toggle                 # or enable / disable to force it
dms ipc keystrokes setStyle pbt           # minimal | laptop | lowprofile | pbt
dms ipc keystrokes test                   # show a sample Ctrl + Shift + A, no typing needed
dms ipc keystrokes exportStyle            # dump the theme as keyviz style JSON
dms ipc keystrokes importStyle '<json>'   # apply one
```

`setStyle` still accepts the retired names `elevated` and `mechanical`, mapped to `lowprofile` and `pbt`. The settings page lists the first four with copy buttons.

## Settings

Everything is on one page, reached from the plugin's settings icon in the DMS Control Center.

- **Filtering & History** — show every key, only hotkeys, or your own comma-separated list of first keys; history size and direction; the toggle shortcut.
- **Display & Margins** — which output to draw on, and the margins. Following the focused output is the default.
- **Colors & Border** — colours, gradients, border width and corner radius.
- **Color Presets** — 14 upstream palettes, plus style randomization.
- **Layout & Animations** — position, skin, animation and duration.
- **Keycap Content** — label variant, text case, alignment, icons, symbols.
- **Group Background**, **Visibility Options**, **Input Device**, **General Settings**.

Under **Hotkeys** a sequence shows only when its *first* pressed key is Ctrl, Shift, Alt, Super or Fn — so `Ctrl` then `A` shows, but `A` then `Ctrl` does not. Physical names like `KEY_RIGHTCTRL` are accepted, and media keys are dropped the way keyviz drops them; use **Off** to see everything.

Held keys stay visible until released. Released keys expire individually after the **Fade Timeout** (5000 ms by default), and pressing a key again updates its count rather than adding a new cap.

## Theming and portability

`exportStyle` / `importStyle` move a whole theme between machines as **native keyviz style JSON**. The format is keyviz's, keys included, so a file exported here loads into keyviz and back. Imports are validated field by field and rejected as a whole rather than partially applied.

> [!NOTE]
> Two earlier ways of loading a JSON skin have been removed: a `keyviz_styles/` folder scan and a settings-page import card. Whole themes still move through the IPC commands.

## Mouse support

Mouse buttons, `Drag` and the wheel are off by default; enable **Show Mouse Events**. They run through the *same* state machine as the keyboard, so they join the row a held modifier started rather than opening a second one.

The cursor-anchored ripple is deliberately not implemented — a Wayland client cannot read the absolute pointer position. Details and measurements: [the parity notes](docs/keycap-style-parity.md#指针定位为什么没有光标涟漪).

## Troubleshooting

**Nothing appears when I type.**
Check in order: is the visualizer enabled? Is your user in the `input` group (`id -nG | tr ' ' '\n' | grep input`)? Is the libinput CLI installed? `dms ipc keystrokes test` should always draw something — if it does, input plumbing is the problem, not rendering.

**It stopped appearing on my second monitor.**
Reselect **Follow focused output** in the Display setting.

**I changed the overlay and my edit had no effect.**
Use `dms restart`, not `dms ipc plugins reload`. Reload recompiles only the daemon, leaving the overlay and the `.js` modules running from the previous compile.

**The keycaps look slightly different from keyviz's own screenshots.**
Qt and WebView rasterize fonts and blur shadows slightly differently. The geometry follows keyviz's em measurements, not its pixels.

## Credits

- **[mulaRahul/keyviz](https://github.com/mulaRahul/keyviz)** (MIT) — the design and behaviour this port follows, at the local commit `ee7fda1`. The skins, event grouping and filter rules, press counts, colour and geometry defaults and the style JSON all come from its `src/`.
- **[loccun/dms-screenkey](https://github.com/loccun/dms-screenkey)** (MIT) — the DMS plugin this repository grew out of: the manifest, the daemon/widget/settings split and the input plumbing began there.

Where the plugin departs from keyviz on purpose, the code says so — the mute keycap draws the sink's real mute state instead of always showing a crossed speaker.

## License

MIT — see [LICENSE](LICENSE).

**Third-party notices.** Key icon path data in `core/KeyIcons.js` is copied verbatim from [`lucide-static@0.562.0`](https://github.com/lucide-icons/lucide) (ISC License). Labels use the bundled [Inter](https://github.com/rsms/inter) Variable font (SIL Open Font License, see `fonts/Inter-LICENSE.txt`).
