# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Browser-only Instagram seamless-carousel template generator ("Seamless Studio" UI). Three files, no build step, no dependencies (Google-Fonts link only, degrades gracefully), no package.json, no tests. Open `index.html` directly in a browser (or `python3 -m http.server` to serve locally).

- `index.html` — static UI skeleton: top bar, collapsible pattern panel, stage, gesture footer, modal/toast roots, hidden file picker. Dynamic collections (segmented controls, pattern tiles, popovers, icons) are injected by `app.js`.
- `app.js` — all logic (vanilla JS, single file).
- `style.css` — studio theme, light + dark (`.app[data-theme]` CSS variables).
- `images/` — sample photos used by `?demo` mode only.

## Core architecture (app.js)

The entire carousel is modeled as **one wide "strip"** of `n * 1080` px (SLIDE_W = 1080). All layout and hit-testing happen in strip coordinates: cross-slide layouts (spread, panorama, boundary, filmstrip) place photo boxes that span slide boundaries, so adjacent Instagram posts connect when swiped.

There are **two renderers** over the same template data:

1. **DOM preview** — `createStrip()` builds a `.stripContent` DOM tree (layers: pano blur → blur backdrops → decor → film bands → photo boxes → title → texture). Every element is keyed by index and updated in place, so regenerating a template lets CSS transitions **morph** each slot to its new geometry (`--morph` duration). Each slide is a `.slideWin` clipped window holding its own full strip copy offset by `translateX(-i*slideW)`; the **Strip ↔ Posts** toggle animates the windows apart into rounded post cards (`--viewMs`). `syncStage()` lays out windows; `strip.sync(s)` restyles one copy at preview scale `s`.
2. **Canvas export** — `drawStrip(ctx, 1)` renders the strip at scale 1 to an offscreen canvas; `exportSlides()` slices it into individual 1080-wide PNGs (real downloads, triggered from the export modal).

Data flow:

1. `genSequence(n, enabled)` — picks a layout type per slide using `PATTERNS` weights (span > 1 = cross-slide layout). Multi-slide layouts are gated (~30% chance, never on slide 0, never repeated consecutively).
2. `generateTemplate(n, H, enabled)` — **pure**: returns `{boxes, bands, decor, layoutAt, n, H}` (photo slots `x/y/w/h/rot/frame/blurBg` in strip coords). Adds "overhang" bleeds where a full-bleed slide neighbors a margined one.
3. Templates go through `pushTemplate()` into `state.history` (capped at 16) with `state.cursor`; **Undo (⌘Z)** and the **History popover** (SVG mini-thumbnails via `tplThumbSVG`) jump the cursor and restore `n`/`H`.

Photos live **outside** templates: `state.photos[slotIndex] = {src, img}` and `state.panzoom[slotIndex] = {x, y, z}`, so regenerating keeps photos assigned to slots in order. Pan/zoom uses the fast path `applyPanzoomAll(i)` (img transform only, all window copies) — no full re-sync. `clampPan()` keeps the box covered. Rotated boxes (polaroids) inverse-rotate drag deltas.

Per-slot gestures (handlers attached in `makeBoxRec`, interactive strips only): click empty = add, drag = pan, scroll = zoom, double-click = replace, ⌥-click = remove, drag-drop file onto slot. Stage-level drop and the "Add photos" button bulk-fill empty slots in order (`fillEmpty`).

Scale convention: layout values are stored unscaled in strip coords; both renderers multiply by `s` at use time. Vertical sizing: margins/gutters are tuned for the 4:5 ratio (H=1350); `vs = H / 1350` scales them for other ratios.

## State and persistence

Single global `state` object; `tpl()` returns the current template (`history[cursor]`). `syncAll()` = `syncHeader()` (controls, badges, disabled states, theme) + `syncStage()` (windows + strips). A ResizeObserver on `#stageWrap` re-syncs on layout changes (window resize, panel collapse).

Settings (enabled patterns, bgStyle, texture, title) persist to localStorage under `seamless_settings`; theme under `seamless_theme`. Slide count and ratio do not persist.

Distinction enforced by the UI (and stated in the panel legend): layout/decor tile toggles call `regenerate()` (re-roll, photos stay); palette / background / texture / title / view mode only re-sync styles.

## URL params (testing hooks)

- `?n=6` — slide count
- `?h=566` — slide height (must match a ratio option: 1350/1440/1080/566)
- `?only=polaroid,filmstrip` — restrict the layout pool to specific patterns
- `?demo` — auto-load the sample photos from `images/`

`?only=X&demo` is the fastest way to visually test a single layout.

## Adding a new layout pattern

Touch four places in `app.js`: add an entry to `PATTERNS` (span + weight), add its copy to `PATTERN_INFO` (label + desc), add the `else if (t === "...")` branch in `generateTemplate` that pushes boxes via `makeBox`, and add a diagram case to `pdRects` for its panel tile. The tile itself is generated automatically (`buildPatternTiles`), and everything downstream (DOM morphing, interaction, export, persistence) works off the template data.
