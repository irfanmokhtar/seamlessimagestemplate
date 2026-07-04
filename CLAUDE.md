# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Browser-only Instagram seamless-carousel editor ("Seamless" — a Figma-style full editor).
**Vite + React 18 + TypeScript** SPA, no backend, no router, no SSR. Browser-only: canvas
export + IndexedDB projects (docs + photo blobs) + `localStorage` defaults, nothing server-side.
Only runtime dependency beyond React: `fflate` (zip export).

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
  - `panels.tsx` — chrome: `TopBar`, `LeftRail`, `LeftPanel` (+ sections), `Inspector`,
    `BottomStrip` (per-post lock toggle + layout-picker popover).
  - `modal.tsx` — `ExportModal` (zip / loose files / panorama, PNG/JPEG, 1×/2×) + `Toast`.
  - `export.ts` — **framework-agnostic** canvas exporter (see below).
  - `store.ts` — **framework-agnostic** IndexedDB layer: `docs` store (one `DocRecord` per
    project: template history, settings, texts, panzoom, photo *ids*, locks) + `photos` store
    (`{id, blob}` originals, `gcPhotos()` deletes blobs no doc references).
  - `gallery.tsx` — projects home screen (cards via `TemplateThumb`, open/duplicate/delete).
  - `app.tsx` — `<App>`: all state (React hooks) + wiring + gallery⇄editor screens. `main.tsx` mounts it.
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
2. **Canvas export (`export.ts`)** — `drawStrip(ctx, s, opts, slice?)` renders the strip (or one
   slide window via `slice: {x, w}` — used so 2× exports never allocate a 40k-px canvas) to an
   offscreen canvas; `exportCarousel(opts, settings)` renders per-slide and downloads one zip
   (`fflate`), loose files, or a single panorama, as PNG or JPEG at 1×/2×. Because React stores
   photos as **src strings**, `loadImages(srcs)` resolves real `HTMLImageElement`s into a `Map`
   before drawing.

**Data flow:** `generateTemplate(n, H, enabled, seed?)` (in `core.ts`) is **pure and seeded** —
all generation randomness flows through a mulberry32 PRNG (`Template.seed` reproduces the exact
layout; `rand`/`randInt` fall back to `Math.random` outside generation). Picks a layout per
slide via weighted `PATTERNS` (span > 1 = cross-slide, gated ~30%, never slide 0, never repeated),
returns `{boxes, bands, decor, layoutAt, n, H, seed}` (slots carry `x/y/w/h/rot/frame/blurBg`,
plus `manual` for user-placed/edited boxes the generator must not touch) and adds "overhang"
bleeds where a full-bleed slide neighbors a margined one.

**Locked shuffle & direct edits (`core.ts`):** `shuffleTemplate(prev, enabled, locks, seed?)`
re-rolls only unlocked slides (a lock on any slide of a multi-span layout locks the whole span)
and `setSlideLayout(tpl, slide, type)` swaps one slide's layout in place. Both return a box-index
`map` (`map[newIdx] = oldIdx | -1`) that `<App>.applyMap` uses to keep photos/panzoom glued to
surviving boxes (`remapArr`). `addSlot`/`removeSlot` handle manual slots. Share links:
`encodeLook`/`decodeLook` round-trip `{seed, n, H, enabled, paletteIdx, bgStyle, texture, texts}`
through URL-safe base64 in `location.hash` (`#look=…`), parsed at boot.

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
`onPan` (drag), `onZoom` (scroll), plus direct slot editing — `onBoxMove` (⌘-drag, or plain drag
on an empty slot), `onBoxResize` (corner `selH` handles), `onBoxEditEnd` (commits one undo step
per gesture via a `draft` template that overrides `tpl` mid-gesture), `onSwap` (⇧-drag a filled
slot onto another; tray items also HTML5-drag-swap). Box edits snap to slide edges / other box
edges (`SNAP_TOL`, min size `MIN_BOX`) and set `manual: true`. Stage-level drop and "Add photos"
bulk-fill empty slots via `fillEmpty`. Selecting a slot swaps the inspector to per-photo controls;
Escape / empty-canvas click clears selection; Delete removes the selected slot (or text block);
arrows nudge the selected text block. Text blocks edit inline via double-click (contentEditable;
`textTransform` is suspended while editing so `innerText` preserves raw casing).

Persistence: **projects live in IndexedDB** (`store.ts`, DB `seamless`): autosave debounced 800 ms
writes the full `DocRecord` (template history + cursor, texts, panzoom, photoIds, locks, settings,
doc name); photos are stored as blobs and resolved to fresh object URLs on open (`loadPhotoUrls`).
`localStorage` only holds new-doc defaults (`seamless_settings`: `enabled`, `bgStyle`, `texture`,
`paletteIdx`) and `seamless_theme`. `bgStyle` is `flat | gradient | blurpano` (a legacy `white`
value loads as `flat`). Accent/morph are hardcoded constants in `app.tsx` (`ACCENT`, `MORPH_MS`).

## Adding a new layout pattern

Touch four places: add an entry to `PATTERNS` (span + weight) and `PATTERN_INFO` (label + desc) in
`core.ts`; add the `else if (t === "...")` branch in `generateTemplate` that pushes boxes via
`makeBox`; add a diagram case to `pdRects` in `icons.tsx`. Tiles, DOM morphing, interaction,
canvas export, and persistence all derive from the template data automatically.

## Notes
- `?n/?h/?only/?demo` URL hooks from the vanilla app are **not** ported (`#look=` share links
  are the supported URL entry point). The editor starts with empty slots (no bundled photos).
- The Adjust tab (brightness/filters) is still a stub — planned, not implemented.
- No tests yet. Verify by `npm run dev` + the manual smoke checklist:
  gallery (new/open/duplicate/delete, autosave survives reload) · shuffle/undo/select/pan-zoom ·
  lock a post → shuffle keeps its boxes & photos · per-post layout picker (bottom-strip hover) ·
  ⌘-drag move / corner-resize / Delete slot (one undo step per gesture) · ⇧-drag photo swap ·
  text presets + double-click inline edit · Copy share link → open in fresh window ·
  strip↔posts · inspector · bottom-strip · **export: zip / loose / panorama, PNG/JPEG, 1×/2×**.
