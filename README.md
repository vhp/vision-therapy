# Vergence Trainer Prototype

Browser-based vergence training prototype using red/cyan anaglyph random-dot stereograms.


## Quick Start

- Open `index.html` directly (`file://...`) or host as a static site.
- Files used at runtime: `index.html`, `styles.css`, `config.js`, `app.js`.

## Core Behavior

- Target is disparity-encoded in one of four directions (`up`, `right`, `down`, `left`).
- `Arrow keys` = choose target side.
- `Space` = cannot see target (`-1`, new round).
- `P` = pause/resume.
- `Esc` exits fullscreen and pauses.
- Scoring: correct = `+1`; wrong / timeout / space = `-1`.
- Session summary is shown at the end.

## Session Setup

- `Core Settings`: `Vergence Mode`, `Visual Preset`, `Session Target PD`, `Session Minutes`.
- `Advanced Settings`: `Monitor Width`, `View Distance`, `Round Seconds`, a read-only `L/R Split` (marked `RO`), and debug-only `Start PD`.
- `Monitor Width` is a hard requirement before first start.
- Once set, monitor width is cached in browser `localStorage` and reused.

## Pause UX

When paused (for example after `Esc`):
- A pause box is shown with `Exercise`, `Vergence`, and `L/R Split`.
- Status text is simplified to: `Press Resume or P to continue.`

## Modes and Presets

- Vergence modes: `Convergence`, `Divergence`, `Alternate`.
- Visual presets (from `config.js`):
  - `Balanced (Default)`
  - `More Obvious`
  - `Fine Dots (Harder)`

## URL Flags

- `?debug=1`
  - Shows debug status line and `+/-` debug difficulty controls.
  - Shows debug-only `Start PD` input.
- `?clearSettings=1` or `?reset=1`
  - Clears saved local settings on load.
  - One-shot behavior: flag is removed from the URL after it runs.

## Configuration

- Main user-facing knobs live in `config.js`.
- Low-level rendering defaults live in `app.js` to keep `config.js` smaller.
- You can still override those low-level defaults by adding matching keys to `window.APP_CONFIG` in `config.js`.

## Notes

- PD displayed here is an estimate based on monitor width, viewing distance, and pixel disparity.
- `L/R split` is a rendering metric shown as read-only in `Advanced Settings` and in the pause box.
- This project is a prototype, not a medical device.
