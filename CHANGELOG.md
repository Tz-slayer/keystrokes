# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Restructured project documentation architecture according to personal open-source standards into `docs/ARCHITECTURE.md`, `docs/FLOWS.md`, and `docs/DEVELOPMENT.md`.
- Added `AGENTS.md` to guide AI Coding Agents on architectural rules, testing requirements, and invariants.
- Updated `README.md` to provide clearer project navigation and links to core technical docs.

## [1.3.1] - 2026-09-20

### Added
- Feat: Added keycap icon support for the `Menu` key matching other functional keys.
- Feat: Added typed parameter annotations to Quickshell IPC handlers (`trace`, `setStyle`, `importStyle`).

### Changed
- Keycaps: Function keys (F1-F12) share uniform width and adjusted font scaling (0.9em).
- Settings: Unified filter controls and defensive degradation when daemon is registering.
- Events: A group row lists only currently held keys; released members are excluded from ongoing chords.

### Fixed
- Fixed QML component shadowing where `Row.qml` conflicted with QtQuick built-in `Row` type (renamed to `SettingRow.qml`).
- Fixed modifier count reset when chords form; monotonic count accumulation preserved across combos.
- Fixed single-key event history overwrite issue in history mode.
- Fixed press-count badge clipping on group backgrounds by introducing geometric expansion calculations without QML clipping.

## [1.3.0] - 2026-09-18

### Added
- Added multi-monitor follow-focus positioning (`@focused` output tracking via CompositorService).
- Added comprehensive unit test suite with headless Node.js VM testing and offscreen QtQuick regression tests.
- Added 14 upstream color presets and style export/import capabilities.
- Added IPC trace diagnostic mode (`dms ipc keystrokes trace`) for stream telemetry.

### Changed
- Refactored state machine to be pure functional and immutable (`core/events.js`).
- Decoupled `core/` and `ui/` layers from DankMaterialShell specific dependencies.
