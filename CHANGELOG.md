# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-20

The baseline for this plugin's version line. The numbering restarts here: everything
below describes the feature set as it stands at this commit, not a delta from an
earlier release.

### Added

**Rendering**
- Four keycap skins ported 1:1 from keyviz with exact vector geometries — Minimal,
  Laptop, Low Profile (default) and PBT. Switching skins preserves custom colors.
- Five entrance and exit animations — `none`, `fade`, `zoom`, `float`, `slide` — each
  with its own duration and easing curve.
- Real-time press-count badges, so a held or hammered key reads `Ctrl×5 + C×1`.
- 14 upstream color presets, gradient fills, fractional border widths and corner radii.

**Input and grouping**
- Combination detection: `Ctrl + Shift + S` collapses into one row, while consecutive
  single keys flow as separate rows. A row lists only the keys currently held.
- Three filter modes: all keys, hotkeys only (requiring a leading modifier), or a
  custom whitelist.
- History mode with a configurable maximum row count.
- Mouse clicks, drags and wheel events render as keycaps; mute state stays in sync.

**Placement**
- Nine screen anchors on any output, with automatic follow-focus across monitors.

**Operations**
- Typed IPC surface: `toggle`, `test`, `setStyle`, `importStyle`, and `trace <seconds>`
  for recording the parsed event stream.
- Style export and import as JSON.

### Changed
- The event state machine lives in pure, immutable functions in `core/events.js`.
- `core/` and `ui/` are decoupled from DankMaterialShell; host configuration and
  compositor state are injected explicitly by the daemon.
- Documentation restructured into `docs/ARCHITECTURE.md`, `docs/FLOWS.md` and
  `docs/DEVELOPMENT.md`, with `AGENTS.md` stating the layering rules and the test and
  documentation gates.
- Two automated gates guard the repository: the unit suite via
  `node --test tests/*.test.cjs`, and the documentation link and anchor guard via
  `node tests/docs-links.cjs`.
