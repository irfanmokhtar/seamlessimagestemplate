# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Browser-only Instagram seamless-carousel editor ("Seamless" — a Figma-style full editor).
**Vite + React 18 + TypeScript** SPA, no backend, no router, no SSR. Browser-only: canvas
export + `localStorage`, nothing server-side.

```
npm install
npm run dev        # vite dev server
npm run build      # tsc --noEmit && vite build → dist/
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
```

### Layout / files
- `index.html` — Vite entry: Google-Fonts link + `<div id="root">` + module script.
- `vite.config.ts` — React plugin; `base: "./"` so the static build is path-portable.
- `tsconfig.json` — `jsx: react-jsx`; pragmatic typing (`strict: false`, `noImplicitAny: false`).
  The data model is typed; component props are mostly loose `any` (ported from a JS prototype).
- `public/` — static assets served at the root (currently none; the editor starts with empty slots).
- `src/`:
  - `types.ts` — data model: `Box`, `Band`, `Decor`, `Template`, `Palette`, `Panzoom`, `Enabled`,
    `BgStyle`, `Texture`, `StripApi` (the interaction surface threaded into the renderer).
  - `core.ts` — **pure, framework-agnostic** generation engine + constants (`SLIDE_W`, `PALETTES`,
    `PATTERNS`, `DECOR_KEYS`, `PATTERN_INFO`, `RATIOS`, `rgba`/`shade`/`hexToRgb`, `generateTemplate`).
  - `icons.tsx` — `Ic` icon set + generic controls (`Seg`, `Stepper`, `IconBtn`, `PaletteSwatches`)
    + pattern-diagram SVGs (`pdRects`, `PatternDiagram`, `PatternTile`).
  - `strip.tsx` — the DOM renderer: `PhotoBox`, `StripContent`, `StripStage`, `TemplateThumb`,
    `clampPan`, and the shared `natCache`.
  - `panels.tsx` — chrome: `TopBar`, `LeftRail`, `LeftPanel` (+ sections), `Inspector`, `BottomStrip`.
  - `modal.tsx` — `ExportModal` (real PNG download) + `Toast`.
  - `export.ts` — **framework-agnostic** canvas exporter (see below).
  - `app.tsx` — `<App>`: all state (React hooks) + wiring. `main.tsx` mounts it.
  - `styles.css` — Figma editor theme, light + dark (`.editor[data-theme]` CSS vars; green
    `--accent`, Hanken Grotesk UI type).

UI: top bar (doc name, undo/redo, zoom, Strip↔Posts toggle, Shuffle, theme, Export) · left icon
**rail** + contextual **panel** (Layouts / Photos / Text / Adjust\* / Crop\* — \*=stubbed) ·
center **canvas** with selectable photo slots · contextual right **inspector** (carousel settings,
or per-photo controls when a slot is selected) · bottom **slide strip** of live per-post thumbnails.

> History: this was a vanilla-JS single-file app, then migrated to Vite/React/TS by reusing the
> original Claude-Design React bundle. `core.ts` and `export.ts` are deliberately framework-free
> so they survive any future renderer swap; only the chrome is React.

## Core architecture

The entire carousel is modeled as **one wide "strip"** of `n * 1080` px (`SLIDE_W = 1080`). All
layout and hit-testing happen in strip coordinates: cross-slide layouts (spread, panorama,
boundary, filmstrip) place photo boxes that span slide boundaries, so adjacent posts connect.

**Two renderers over the same template data:**

1. **DOM preview (React, `strip.tsx`)** — `StripContent` renders one full copy of the strip
   (pano blur → blur backdrops → decor → film bands → photo boxes → title → texture). `StripStage`
   renders `n` `.slideWin` clipped windows, each holding its own `StripContent` offset by
   `translateX(-i*slideW)`. CSS transitions **morph** slot geometry on regenerate (`--morph`) and
   pull the windows apart into post cards on the **Strip↔Posts** toggle (`--viewMs`). Scale `s`
   comes from a `ResizeObserver` in `StripStage`, multiplied by `zoom`. The bottom strip and export
   modal render `StripContent` with `interactive: false`.
2. **Canvas export (`export.ts`)** — `drawStrip(ctx, 1, opts)` renders the strip to an offscreen
   canvas; `exportSlides(opts)` slices it into individual 1080×H PNGs (real downloads). Because
   React stores photos as **src strings**, `loadImages(srcs)` resolves real `HTMLImageElement`s
   into a `Map` before drawing.

**Data flow:** `generateTemplate(n, H, enabled)` (in `core.ts`) is **pure** — picks a layout per
slide via weighted `PATTERNS` (span > 1 = cross-slide, gated ~30%, never slide 0, never repeated),
returns `{boxes, bands, decor, layoutAt, n, H}` (slots carry `x/y/w/h/rot/frame/blurBg` in strip
coords) and adds "overhang" bleeds where a full-bleed slide neighbors a margined one.

Scale convention: layout values are stored unscaled in strip coords; both renderers multiply by
`s` at use time. Vertical sizing is tuned for 4:5 (H=1350); `vs = H/1350` scales margins/gutters
for other ratios.

## State (all in `<App>`, `app.tsx`)

`history` + `cursor` hold generated templates; `tpl = history[cursor]`. `pushTemplate` trims the
forward branch (caps at 24); **Undo (⌘Z) / Redo (⌘⇧Z)** via `jumpTo`. Photos live **outside**
templates: `photos[i]` (src string | null) and `panzoom[i]` `{x,y,z}`, so regenerating keeps photos
assigned to slots in order. `clampPan` (reads `natCache`) keeps the box covered; rotated boxes
(polaroids) inverse-rotate drag deltas.

The `api` object (typed `StripApi`) is threaded down into `StripStage`/`StripContent`/`PhotoBox`:
`onSelect`, `onSlotClick` (double-click = open picker), `onDropFile`, `onRemove` (⌥-click),
`onPan` (drag), `onZoom` (scroll). Stage-level drop and "Add photos" bulk-fill empty slots via
`fillEmpty`. Selecting a slot swaps the inspector to per-photo controls; Escape / empty-canvas
click clears selection.

Persistence: `enabled`, `bgStyle`, `texture`, `title`, `paletteIdx` → `localStorage` key
`seamless_settings`; `theme` → `seamless_theme`. Slide count, ratio, zoom, doc name, photos do not
persist. `bgStyle` is `flat | gradient | blurpano` (a legacy `white` value loads as `flat`).
Accent/morph are hardcoded constants in `app.tsx` (`ACCENT`, `MORPH_MS`) — the design bundle's
dev-only Tweaks panel was dropped in the migration.

## Adding a new layout pattern

Touch four places: add an entry to `PATTERNS` (span + weight) and `PATTERN_INFO` (label + desc) in
`core.ts`; add the `else if (t === "...")` branch in `generateTemplate` that pushes boxes via
`makeBox`; add a diagram case to `pdRects` in `icons.tsx`. Tiles, DOM morphing, interaction,
canvas export, and persistence all derive from the template data automatically.

## Notes
- `?n/?h/?only/?demo` URL hooks from the vanilla app are **not** ported. Re-add in `app.tsx`
  startup if needed. The editor starts with empty slots (no bundled sample photos).
- No tests yet. Verify by `npm run dev` + the manual smoke checklist (shuffle/undo/select/pan-zoom/
  strip↔posts/inspector/bottom-strip/**real PNG export**).
