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

- **DankMaterialShell** `>= 1.5.0`
- `libinput` **CLI** - Required. Drives **"All Keyboards"** mode, and single-device mode via `--device`.
- `evtest` - *Optional*. Only used as a fallback for single-device mode when the libinput CLI is absent.
- **Input group** - User must be in the `input` group: `sudo usermod -aG input $USER`.

> [!NOTE]
> On many distros, the libinput CLI is in a separate package: `libinput-tools` (Arch/Debian/Ubuntu) or `libinput-utils` (Fedora). Logout and back in after adding your user to the input group.

## Features

- **Floating Overlay** - Elegant, always-on-top keystroke and mouse click visualizer.
- **Visual Keycaps** - Renders key combinations (e.g., `Ctrl + Shift + A`) as styled keycaps.
- **Lucide Icons & Keyviz Layouts** - Keycap icons are ported 1:1 from [keyviz](https://github.com/mulaRahul/keyviz) (Lucide stroke icons + custom mouse SVGs, rendered as vectors via QtQuick.Shapes). Layouts mirror keyviz `base.tsx`: icon on top + label below (modifier icons right-aligned), secondary symbols stacked over labels, icon-only for arrow keys.
- **Keycap Style Skins** - Three keyviz-style skins: **Minimal** (plain text), **Elevated** (raised cap with highlight gradient + drop shadow) and **Mechanical** (two-layer physical cap with base wall). Custom skins via JSON files are supported (see below).
- **Keyviz-Style Animations** - Preset enter/exit animations for each keycap (`Fade`, `Zoom`, `Float`, `Slide` or `None`) with quintic easing, staggered key entries, and animated history shifting, configurable duration.
- **Mouse Click Indicators** - Shows mouse clicks (left/right/middle) inside a vector-drawn mouse shape.
- **Privacy Mode** - Default option to only show keyboard shortcuts and hide standard letter typing.

## Keycap Styles

Pick a skin under *Settings → Keyviz → Keycap Style*:

| Skin | Look |
|------|------|
| **Minimal** | Plain text, no keycap body |
| **Elevated** | White raised cap with soft drop shadow |
| **Mechanical** (default) | White cap face on a dark base wall - the classic keyviz look |

### Custom Styles

Drop a JSON file into `~/.config/DankMaterialShell/keyviz_styles/` (filename without `.json` becomes the style id), then reopen the settings page. A ready-to-edit [`styles/TEMPLATE.json.example`](styles/TEMPLATE.json.example) ships with the plugin.

```json
{
    "name": "My Style",           // display name in the dropdown
    "type": "elevated",           // renderer shape: minimal | elevated | mechanical
    "baseColor": "#2a2e33",       // cap face color
    "secondaryColor": "#16181b",  // base wall color (mechanical)
    "textColor": "#e6e6e6",       // label color
    "borderColor": "#3a3f46",     // outline color
    "borderWidth": 1,             // outline width in px
    "cornerRadius": 0.35,         // 0..1, multiplied by font size
    "gradient": true,             // vertical highlight gradient on the cap face
    "shadowOpacity": 0.35         // drop shadow strength (elevated)
}
```

Any omitted field falls back to the built-in theme colors of the chosen `type`. See [`styles/example-nord.json`](styles/example-nord.json) for a complete custom theme.

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

# Show a sample keystroke (style preview, cycles combo -> click -> typing)
dms ipc keyviz test
```

## TODO / Roadmap

- [x] **Always-on-top Overlay** - Wayland layer-shell floating overlay.
- [x] **Dynamic Device Scanner** - Scans active keyboards automatically via helper script.
- [x] **Vector Mouse Indicators** - Custom QML-drawn mouse with highlighted left, middle, and right buttons.
- [x] **Multi-line History** - Display a history of the last few shortcuts on screen.
- [x] **Custom Styling** - Custom colors, border radius, custom connector separator, and macOS symbols.
- [x] **Held Modifiers Status Bar** - Displays held modifier keys in real-time.
- [x] **Keyviz-Style Animations** - Per-keycap enter/exit animation presets with animated history.
- [ ] **Click Ripple Animation** - Render a visual wave/ripple effect at the cursor coordinates. Blocked: see *Cursor position* below.

## Cursor position

Keyviz's ripple effect is anchored to the **pointer position**, which a Wayland client
cannot read on its own. Checked against this project's target environment:

- **niri** (26.04) — `niri msg` exposes `outputs`, `workspaces`, `windows`, `layers`,
  `focused-output`, `focused-window`, `pick-window`, `pick-color`, `event-stream`, …
  but **no cursor-position query**.
- **Quickshell** ships no global cursor API (`Quickshell/Wayland` only touches the cursor
  through screencopy, i.e. a captured image, not coordinates).
- A click-through layer-shell surface cannot receive pointer motion, and a
  non-click-through one would swallow clicks from every application below it.
- Integrating `POINTER_MOTION` deltas from `libinput` is not viable either: they are
  relative and acceleration-dependent, so the position drifts.

A ripple anchored to the click's keycap in the overlay is possible without any of this;
a ripple anchored to the real cursor needs compositor cooperation (e.g. an IPC query or a
`wl_pointer`-style global) that niri does not currently provide.

## License

MIT
