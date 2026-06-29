/* core.ts — template generation engine.
   Pure data: no canvas, no DOM, no React. Produces boxes/bands/decor
   in strip coordinates. Framework-agnostic — also consumed by export.ts. */

import type { Box, Template, Palette, Enabled, TextBlock } from "./types";

export const SLIDE_W = 1080;

/* ---------- typography ----------
   Curated for photography / editorial Instagram carousels. Three families of
   look photographers reach for: high-contrast display serifs (the wedding /
   portfolio standard), clean geometric sans (set in spaced caps for captions
   & branding), and signature scripts. All are Google Fonts (loaded in
   index.html). */
export interface FontDef {
  id: string;
  label: string;
  stack: string;
  cat: "Serif" | "Sans" | "Script";
}

export const FONTS: FontDef[] = [
  // Display / editorial serifs — the classic photographer headline
  { id: "playfair",  label: "Playfair Display", stack: "'Playfair Display', Georgia, serif", cat: "Serif" },
  { id: "cormorant", label: "Cormorant Garamond", stack: "'Cormorant Garamond', Georgia, serif", cat: "Serif" },
  { id: "ebgaramond",label: "EB Garamond", stack: "'EB Garamond', Georgia, serif", cat: "Serif" },
  { id: "baskerville",label: "Libre Baskerville", stack: "'Libre Baskerville', Georgia, serif", cat: "Serif" },
  { id: "dmserif",   label: "DM Serif Display", stack: "'DM Serif Display', Georgia, serif", cat: "Serif" },
  { id: "italiana",  label: "Italiana", stack: "'Italiana', Georgia, serif", cat: "Serif" },
  // Clean sans — captions, branding, spaced caps
  { id: "montserrat",label: "Montserrat", stack: "'Montserrat', sans-serif", cat: "Sans" },
  { id: "poppins",   label: "Poppins", stack: "'Poppins', sans-serif", cat: "Sans" },
  { id: "jost",      label: "Jost", stack: "'Jost', sans-serif", cat: "Sans" },
  { id: "josefin",   label: "Josefin Sans", stack: "'Josefin Sans', sans-serif", cat: "Sans" },
  { id: "archivo",   label: "Archivo", stack: "'Archivo', sans-serif", cat: "Sans" },
  { id: "inter",     label: "Inter", stack: "'Inter', sans-serif", cat: "Sans" },
  // Signature scripts
  { id: "dancing",   label: "Dancing Script", stack: "'Dancing Script', cursive", cat: "Script" },
  { id: "sacramento",label: "Sacramento", stack: "'Sacramento', cursive", cat: "Script" },
  { id: "greatvibes",label: "Great Vibes", stack: "'Great Vibes', cursive", cat: "Script" },
];

const FONT_BY_ID: Record<string, FontDef> = Object.fromEntries(FONTS.map(f => [f.id, f]));
export const fontDef = (id: string): FontDef => FONT_BY_ID[id] || FONTS[0];
export const fontStack = (id: string): string => fontDef(id).stack;
/* a CSS font shorthand for canvas (no letter-spacing — caller applies it) */
export const fontShorthand = (t: TextBlock, px: number): string =>
  `${t.italic ? "italic " : ""}${t.weight} ${px}px ${fontStack(t.font)}`;

let textId = Date.now();
export function newTextBlock(partial: Partial<TextBlock> = {}): TextBlock {
  return {
    id: ++textId,
    text: "Your text",
    font: "playfair",
    color: "auto",
    size: 110,
    weight: 600,
    italic: false,
    letterSpacing: 2,
    align: "center",
    upper: true,
    x: SLIDE_W / 2,
    y: 220,
    ...partial,
  };
}

/* Background colors the user picks from. ph/ink/text (placeholder fill,
   decor/line ink, title color) are derived from the bg via paletteFromBg
   so every background stays readable — only the bg matters to the user. */
export const BG_COLORS: { name: string; bg: string }[] = [
  { name: "White",      bg: "#FFFFFF" },
  { name: "Warm White", bg: "#FAF7F1" },
  { name: "Cream",      bg: "#F4EDE1" },
  { name: "Soft Gray",  bg: "#F1F1F0" },
  { name: "Sand",       bg: "#EFE7DA" },
  { name: "Sage",       bg: "#E6ECE2" },
  { name: "Blush",      bg: "#F6E9E4" },
  { name: "Sky",        bg: "#E6EEF4" },
  { name: "Clay",       bg: "#E9D9CC" },
  { name: "Olive",      bg: "#E4E6D6" },
  { name: "Charcoal",   bg: "#1C1C1C" },
  { name: "Midnight",   bg: "#15171C" },
  { name: "Black",      bg: "#000000" },
  { name: "Forest",     bg: "#1B2A22" },
];

export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function shadeHex(hex: string, amt: number) {
  const [r, g, b] = hexToRgb(hex);
  const t = amt > 0 ? 255 : 0;
  const f = Math.abs(amt);
  const h = (c: number) => Math.round(c + (t - c) * f).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
/* Build a full Palette from a single background color. Light bg → dark
   ink/text; dark bg → light ink/text. Amounts mirror the old hand-tuned set. */
export function paletteFromBg(bg: string, name: string): Palette {
  const dark = luminance(bg) < 0.5;
  const d = dark ? 1 : -1;
  return {
    name, bg,
    ph:   shadeHex(bg, d * 0.10),
    ink:  shadeHex(bg, d * 0.45),
    text: shadeHex(bg, d * 0.88),
  };
}

export const PALETTES: Palette[] = BG_COLORS.map(c => paletteFromBg(c.bg, c.name));

export const PATTERNS: Record<string, { span: number; weight: number }> = {
  full:      { span: 1, weight: 3.0 },
  framed:    { span: 1, weight: 3.0 },
  stack2:    { span: 1, weight: 2.0 },
  stack3:    { span: 1, weight: 1.2 },
  grid4:     { span: 1, weight: 1.2 },
  editorial: { span: 1, weight: 2.0 },
  hero:      { span: 1, weight: 1.6 },
  polaroid:  { span: 1, weight: 1.4 },
  spread:    { span: 2, weight: 1.5 },
  panorama:  { span: 2, weight: 1.2 },
  boundary:  { span: 2, weight: 1.2 },
  filmstrip: { span: 2, weight: 1.0 },
};

export const DECOR_KEYS = ["ribbon", "arcs", "overhang"];

/* Human copy for every toggle — the UI leans on these so each
   functionality explains itself. */
export const PATTERN_INFO: Record<string, { label: string; desc: string }> = {
  full:      { label: "Full bleed",     desc: "Photo fills the post, edge to edge" },
  framed:    { label: "Framed",         desc: "One photo, generous margins" },
  stack2:    { label: "2-stack",        desc: "Two photos stacked vertically" },
  stack3:    { label: "3-stack",        desc: "Three full-width rows" },
  grid4:     { label: "2×2 grid",       desc: "Four photos in a grid" },
  editorial: { label: "Editorial",      desc: "Large photo + small offset companion" },
  hero:      { label: "Hero",           desc: "Photo flush to an edge, room for captions" },
  polaroid:  { label: "Polaroid",       desc: "Tilted instant-photo frames" },
  spread:    { label: "Spread",         desc: "One framed photo across 2 posts" },
  panorama:  { label: "Panorama",       desc: "Edge-to-edge across 2–3 posts" },
  boundary:  { label: "Boundary cut",   desc: "A photo split by the post edge" },
  filmstrip: { label: "Film strip",     desc: "Negative band running across 2 posts" },
  ribbon:    { label: "Ribbon",         desc: "Thin accent line behind photos" },
  arcs:      { label: "Circles",        desc: "Big soft accent circles behind photos" },
  overhang:  { label: "Overhangs",      desc: "Full-bleed photos spill into the next post" },
};

export const RATIOS = [
  { h: 1350, label: "4:5",    name: "Portrait" },
  { h: 1440, label: "3:4",    name: "Tall" },
  { h: 1080, label: "1:1",    name: "Square" },
  { h: 566,  label: "1.91:1", name: "Wide" },
];

/* ---------- helpers ---------- */

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));

/* Minimum uniform up-scale so a w×h image still fully covers a w×h box once
   the image content is rotated by `deg`. Used to keep slots covered while
   straightening. */
export function rotCover(w: number, h: number, deg: number) {
  if (!deg) return 1;
  const a = Math.abs(deg) * Math.PI / 180;
  const c = Math.cos(a), sn = Math.sin(a);
  return Math.max((w * c + h * sn) / w, (w * sn + h * c) / h);
}

export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
export function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export function shade(hex: string, amt: number) {
  const [r, g, b] = hexToRgb(hex);
  const t = amt > 0 ? 255 : 0;
  const f = Math.abs(amt);
  const mix = (c: number) => Math.round(c + (t - c) * f);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function weightedPick(types: string[]) {
  const total = types.reduce((s, t) => s + PATTERNS[t].weight, 0);
  let r = Math.random() * total;
  for (const t of types) {
    r -= PATTERNS[t].weight;
    if (r <= 0) return t;
  }
  return types[types.length - 1];
}

/* ---------- sequence ---------- */

function genSequence(n: number, enabled: Enabled, start = 0, prevInit: string | null = null) {
  const singles = Object.keys(PATTERNS)
    .filter(t => PATTERNS[t].span === 1 && enabled[t]);
  const multis = Object.keys(PATTERNS)
    .filter(t => PATTERNS[t].span > 1 && enabled[t]);
  if (!singles.length) singles.push("full");

  const seq: { type: string; span: number; slide: number }[] = [];
  let i = start;
  let prev: string | null = prevInit;
  while (i < n) {
    const rem = n - i;
    const multiPool = multis.filter(t => t !== prev && PATTERNS[t].span <= rem);
    if (multiPool.length && Math.random() < 0.3 && i !== 0) {
      const t = weightedPick(multiPool);
      let span = PATTERNS[t].span;
      if (t === "panorama" && rem >= 3 && Math.random() < 0.4) span = 3;
      seq.push({ type: t, span, slide: i });
      prev = t; i += span;
      continue;
    }
    let pool = singles.filter(t => t !== prev);
    if (!pool.length) pool = singles;
    if (i === 0 && Math.random() < 0.55) {
      const openers = pool.filter(t => ["full", "hero"].includes(t));
      if (openers.length) pool = openers;
    } else if (i === n - 1 && Math.random() < 0.5) {
      const closers = pool.filter(t => ["framed", "hero"].includes(t));
      if (closers.length) pool = closers;
    }
    const t = weightedPick(pool);
    seq.push({ type: t, span: 1, slide: i });
    prev = t; i++;
  }
  return seq;
}

/* ---------- template ---------- */

let coreBoxId = 0;
function makeBox(
  slide: number, x: number, y: number, w: number, h: number,
  opts: { rot?: number; frame?: "polaroid" | null; blurBg?: boolean } = {},
): Box {
  return {
    id: ++coreBoxId, slide,
    x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
    rot: opts.rot || 0,
    frame: opts.frame || null,
    blurBg: !!opts.blurBg,
  };
}

/* one layout's boxes/bands, pushed into the given arrays (strip coords) */
function emitLayout(
  t: string, span: number, i: number, H: number,
  boxes: Box[], bands: Template["bands"],
) {
  const vs = H / 1350;
  const sx = i * SLIDE_W;

    if (t === "full") {
      boxes.push(makeBox(i, sx, 0, SLIDE_W, H));

    } else if (t === "framed") {
      const mx = randInt(80, 130);
      const mt = Math.round(randInt(100, 170) * vs);
      const mb = Math.round(randInt(100, 170) * vs);
      boxes.push(makeBox(i, sx + mx, mt, SLIDE_W - 2 * mx, H - mt - mb,
        { blurBg: Math.random() < 0.5 }));

    } else if (t === "stack2") {
      const mx = randInt(70, 110);
      const my = Math.round(randInt(50, 90) * vs);
      const g = Math.round(randInt(36, 60) * vs);
      const inner = H - 2 * my - g;
      const topH = Math.round(inner * rand(0.42, 0.58));
      boxes.push(makeBox(i, sx + mx, my, SLIDE_W - 2 * mx, topH));
      boxes.push(makeBox(i, sx + mx, my + topH + g, SLIDE_W - 2 * mx, inner - topH));

    } else if (t === "stack3") {
      const g = Math.round(randInt(18, 30) * vs);
      const rowH = (H - 2 * g) / 3;
      for (let r = 0; r < 3; r++) {
        boxes.push(makeBox(i, sx, r * (rowH + g), SLIDE_W, rowH));
      }

    } else if (t === "grid4") {
      const m = randInt(60, 100);
      const g = randInt(28, 48);
      const cw = (SLIDE_W - 2 * m - g) / 2;
      const my = Math.round(m * vs);
      const gy = Math.round(g * vs);
      const ch = (H - 2 * my - gy) / 2;
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          boxes.push(makeBox(i, sx + m + c * (cw + g), my + r * (ch + gy), cw, ch));
        }
      }

    } else if (t === "editorial") {
      const left = Math.random() < 0.5;
      const m = randInt(60, 90);
      const mt = Math.round(randInt(80, 140) * vs);
      const mb = Math.round(randInt(80, 140) * vs);
      const bigW = Math.round(SLIDE_W * rand(0.56, 0.64));
      const bigX = left ? sx + m : sx + SLIDE_W - m - bigW;
      boxes.push(makeBox(i, bigX, mt, bigW, H - mt - mb));
      const smallW = SLIDE_W - bigW - 3 * m;
      const smallH = Math.round((H - mt - mb) * rand(0.3, 0.42));
      const smallX = left ? sx + 2 * m + bigW : sx + m;
      const smallY = mt + Math.round((H - mt - mb - smallH) * rand(0.15, 0.7));
      boxes.push(makeBox(i, smallX, smallY, smallW, smallH));

    } else if (t === "hero") {
      if (H >= 900 && Math.random() < 0.4) {
        const ph = Math.round(H * rand(0.58, 0.68));
        const top = Math.random() < 0.5;
        boxes.push(makeBox(i, sx, top ? 0 : H - ph, SLIDE_W, ph));
      } else {
        const pw = Math.round(SLIDE_W * rand(0.56, 0.66));
        const left = Math.random() < 0.5;
        boxes.push(makeBox(i, left ? sx : sx + SLIDE_W - pw, 0, pw, H));
      }

    } else if (t === "polaroid") {
      const count = H < 900 ? 2 : randInt(2, 3);
      const pw = Math.round(Math.min(SLIDE_W * rand(0.46, 0.54), H * 0.55));
      const ph = Math.round(pw * rand(0.85, 1.05));
      const frameB = 30, frameBot = 110;
      const usableH = H - ph - frameB - frameBot - 40;
      let px = sx + randInt(50, 120);
      let py = Math.max(40, Math.round(usableH * rand(0.05, 0.2)));
      const stepX = (SLIDE_W - pw - (px - sx) - 30) / Math.max(1, count - 1);
      const stepY = Math.max(0, usableH - py) / Math.max(1, count - 1);
      for (let k = 0; k < count; k++) {
        const rot = (Math.random() < 0.5 ? -1 : 1) * rand(0.04, 0.12);
        boxes.push(makeBox(i, px, py + frameB, pw, ph, { rot, frame: "polaroid" }));
        px += stepX * rand(0.8, 1.1);
        py += stepY * rand(0.7, 1.1);
      }

    } else if (t === "spread") {
      const ms = randInt(130, 200);
      const mv = Math.round(randInt(140, 220) * vs);
      const drift = Math.random() < 0.5 ? 0 : Math.round(SLIDE_W * rand(-0.22, 0.22));
      const w = 2 * SLIDE_W - 2 * ms;
      let x = sx + ms + drift;
      x = Math.max(sx + 60, Math.min(sx + 2 * SLIDE_W - 60 - w, x));
      boxes.push(makeBox(i, x, mv, w, H - 2 * mv));

    } else if (t === "panorama") {
      boxes.push(makeBox(i, sx, 0, span * SLIDE_W, H));

    } else if (t === "boundary") {
      const cw = Math.round(SLIDE_W * rand(0.85, 1.05));
      const cx = sx + SLIDE_W - Math.round(cw / 2);
      boxes.push(makeBox(i, cx, 0, cw, H));
      const my = Math.round(randInt(90, 150) * vs);
      const zones = [
        [sx, cx - sx],
        [cx + cw, sx + 2 * SLIDE_W - (cx + cw)],
      ];
      for (const [zx, zw] of zones) {
        if (zw < 320) continue;
        const m = randInt(60, 90);
        boxes.push(makeBox(i, zx + m, my, zw - 2 * m, H - 2 * my));
      }

    } else if (t === "filmstrip") {
      const bandH = Math.round(Math.min(H * rand(0.48, 0.58), H - 120));
      const bandY = Math.round((H - bandH) * rand(0.25, 0.75));
      bands.push({ x: sx, y: bandY, w: 2 * SLIDE_W, h: bandH });
      const sp = 56, g = 30;
      const fw = (2 * SLIDE_W - 3 * g) / 4;
      const fy = bandY + sp;
      const fh = bandH - 2 * sp;
      for (let k = 0; k < 4; k++) {
        boxes.push(makeBox(i, sx + k * (fw + g), fy, fw, fh));
      }
    }
}

/* widen full-bleed boxes that neighbor a margined layout, slides [start, n) */
function applyOverhangs(
  boxes: Box[], layoutAt: string[], n: number, start = 0,
) {
  const margined = ["framed", "stack2", "grid4", "editorial"];
  for (let i = start; i < n; i++) {
    if (layoutAt[i] !== "full") continue;
    const box = boxes.find(b => b.slide === i && b.x + b.w === (i + 1) * SLIDE_W);
    if (!box) continue;
    if (i + 1 < n && margined.includes(layoutAt[i + 1])) {
      box.w += randInt(50, 130);
    }
    if (i - 1 >= start && margined.includes(layoutAt[i - 1])) {
      const o = randInt(50, 130);
      box.x -= o; box.w += o;
    }
  }
}

export function generateTemplate(n: number, H: number, enabled: Enabled): Template {
  coreBoxId = 0;
  const vs = H / 1350;
  const boxes: Box[] = [];
  const bands: Template["bands"] = [];
  const layoutAt: string[] = new Array(n);
  const seq = genSequence(n, enabled);

  for (const { type: t, span, slide: i } of seq) {
    for (let k = 0; k < span; k++) layoutAt[i + k] = t;
    emitLayout(t, span, i, H, boxes, bands);
  }

  if (enabled.overhang) applyOverhangs(boxes, layoutAt, n);

  // decor
  const decor: Template["decor"] = [];
  if (enabled.ribbon && Math.random() < 0.55) {
    decor.push({ kind: "ribbon", y: Math.round(H * rand(0.12, 0.85)), h: randInt(8, 22) });
  }
  if (enabled.arcs) {
    const count = randInt(1, 2);
    for (let k = 0; k < count && n > 1; k++) {
      decor.push({
        kind: "circle",
        cx: randInt(1, n - 1) * SLIDE_W + randInt(-200, 200),
        cy: Math.round(H * rand(0.15, 0.85)),
        r: randInt(Math.round(180 * vs) + 60, Math.round(380 * vs) + 80),
        stroke: Math.random() < 0.5,
      });
    }
  }

  return { boxes, bands, decor, layoutAt, n, H };
}

/* Resize an existing template to `newN` posts WITHOUT reshuffling kept slides.
   Growing appends fresh layouts; shrinking trims slides (and any cross-slide
   layout / decor that would overflow the new strip width). */
export function resizeTemplate(
  tpl: Template, newN: number, H: number, enabled: Enabled,
): Template {
  const oldN = tpl.n;
  if (newN === oldN || H !== tpl.H) return generateTemplate(newN, H, enabled);

  coreBoxId = tpl.boxes.reduce((m, b) => Math.max(m, b.id), 0);

  if (newN > oldN) {
    const boxes = tpl.boxes.slice();
    const bands = tpl.bands.slice();
    const layoutAt = tpl.layoutAt.slice();
    const seq = genSequence(newN, enabled, oldN, tpl.layoutAt[oldN - 1] ?? null);
    for (const { type: t, span, slide: i } of seq) {
      for (let k = 0; k < span && i + k < newN; k++) layoutAt[i + k] = t;
      emitLayout(t, span, i, H, boxes, bands);
    }
    // overhangs only across the new join + within the appended region — existing
    // boxes keep their original geometry.
    if (enabled.overhang) applyOverhangs(boxes, layoutAt, newN, oldN - 1);
    return { boxes, bands, decor: tpl.decor, layoutAt, n: newN, H };
  }

  // shrink: keep boxes/bands fully inside the new strip
  const limit = newN * SLIDE_W;
  const boxes = tpl.boxes.filter(b => b.slide < newN && b.x >= 0 && b.x + b.w <= limit + 4);
  const bands = tpl.bands.filter(b => b.x >= 0 && b.x + b.w <= limit + 4);
  const layoutAt = tpl.layoutAt.slice(0, newN);

  // backfill any slide left empty by a dropped cross-slide layout
  for (let i = 0; i < newN; i++) {
    const lo = i * SLIDE_W, hi = (i + 1) * SLIDE_W;
    const covered = boxes.some(b => b.x < hi && b.x + b.w > lo)
      || bands.some(b => b.x < hi && b.x + b.w > lo);
    if (!covered) {
      emitLayout("full", 1, i, H, boxes, bands);
      layoutAt[i] = "full";
    }
  }

  const decor = tpl.decor.filter(d => d.kind !== "circle" || d.cx <= limit);
  return { boxes, bands, decor, layoutAt, n: newN, H };
}
