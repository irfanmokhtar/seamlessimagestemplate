/* export.ts — framework-agnostic canvas export, ported from the original
   vanilla app. Renders the whole strip to an offscreen canvas at scale 1,
   then slices it into individual 1080×H PNGs (real downloads).

   React stores photos as src strings; the canvas path needs real
   HTMLImageElements, so loadImages() resolves them before drawing. */

import { zipSync } from "fflate";
import { SLIDE_W, rgba, shade, rand, randInt, luminance, rotCover, fontStack, fontShorthand,
  VIGNETTE_INNER, GRADIENT_TOP, vignetteAlpha, gradientAlpha, effectAt } from "./core";
import type { Box, Template, Palette, Panzoom, BgStyle, Texture, Effects, TextBlock } from "./types";

export interface ExportOpts {
  tpl: Template;
  palette: Palette;
  bgStyle: BgStyle;
  texture: Texture;
  slideEffects?: Effects[]; // per-post effect intensities (index = slide)
  texts: TextBlock[];
  photos: (string | null)[];
  panzoom: Record<number, Panzoom>;
  images: Map<string, HTMLImageElement>;
  slideBg?: (string | null)[]; // per-slide bg color override
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* load every distinct src into an HTMLImageElement (cached by src) */
export function loadImages(srcs: (string | null)[]): Promise<Map<string, HTMLImageElement>> {
  const uniq = [...new Set(srcs.filter((s): s is string => !!s))];
  return Promise.all(uniq.map(src => new Promise<[string, HTMLImageElement | null]>((resolve) => {
    const img = new Image();
    img.onload = () => resolve([src, img]);
    img.onerror = () => resolve([src, null]);
    img.src = src;
  }))).then(pairs => {
    const map = new Map<string, HTMLImageElement>();
    for (const [src, img] of pairs) if (img) map.set(src, img);
    return map;
  });
}

const imgAt = (o: ExportOpts, i: number): HTMLImageElement | null => {
  const src = o.photos[i];
  return src ? o.images.get(src) || null : null;
};

function clampPanImg(box: Box, pz: Panzoom, img: HTMLImageElement): Panzoom {
  const base = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight)
    * pz.z * rotCover(box.w, box.h, pz.r || 0);
  const maxX = Math.max(0, (img.naturalWidth * base - box.w) / 2);
  const maxY = Math.max(0, (img.naturalHeight * base - box.h) / 2);
  return { ...pz, x: clamp(pz.x, -maxX, maxX), y: clamp(pz.y, -maxY, maxY) };
}

/* ---------- texture tiles ---------- */

let noiseTile: HTMLCanvasElement | null = null;
function getNoiseTile() {
  if (noiseTile) return noiseTile;
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const nctx = c.getContext("2d")!;
  const im = nctx.createImageData(160, 160);
  for (let p = 0; p < im.data.length; p += 4) {
    const v = Math.floor(Math.random() * 255);
    im.data[p] = im.data[p + 1] = im.data[p + 2] = v;
    im.data[p + 3] = 255;
  }
  nctx.putImageData(im, 0, 0);
  noiseTile = c;
  return c;
}

let paperTile: HTMLCanvasElement | null = null;
function getPaperTile() {
  if (paperTile) return paperTile;
  const c = document.createElement("canvas");
  c.width = c.height = 240;
  const p = c.getContext("2d")!;
  p.fillStyle = "rgb(128,128,128)";
  p.fillRect(0, 0, 240, 240);
  for (let k = 0; k < 320; k++) {
    const x = Math.random() * 240, y = Math.random() * 240;
    const len = rand(4, 18), a = Math.random() * Math.PI;
    const v = 128 + (Math.random() < 0.5 ? -1 : 1) * randInt(8, 26);
    p.strokeStyle = `rgba(${v},${v},${v},0.5)`;
    p.lineWidth = rand(0.5, 1.4);
    p.beginPath();
    p.moveTo(x, y);
    p.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    p.stroke();
  }
  paperTile = c;
  return c;
}

/* rotate-aware: run fn with origin at box center, box-local coords */
function boxTransform(c: CanvasRenderingContext2D, box: Box, s: number,
  fn: (bx: number, by: number, bw: number, bh: number) => void) {
  c.save();
  c.translate((box.x + box.w / 2) * s, (box.y + box.h / 2) * s);
  if (box.rot) c.rotate(box.rot);
  fn((-box.w / 2) * s, (-box.h / 2) * s, box.w * s, box.h * s);
  c.restore();
}

function drawCover(c: CanvasRenderingContext2D, o: ExportOpts, box: Box, i: number, s: number) {
  const img = imgAt(o, i)!;
  const pz = clampPanImg(box, o.panzoom[i] || { x: 0, y: 0, z: 1, r: 0 }, img);
  const base = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight)
    * pz.z * rotCover(box.w, box.h, pz.r || 0);
  const dw = img.naturalWidth * base;
  const dh = img.naturalHeight * base;
  boxTransform(c, box, s, (bx, by, bw, bh) => {
    c.beginPath();
    c.rect(bx, by, bw, bh);
    c.clip();
    c.translate(pz.x * s, pz.y * s);
    if (pz.r) c.rotate(pz.r * Math.PI / 180);
    c.drawImage(img, (-dw / 2) * s, (-dh / 2) * s, dw * s, dh * s);
  });
}

function drawPolaroidFrame(c: CanvasRenderingContext2D, o: ExportOpts, box: Box, s: number) {
  const b = 30, bot = 110;
  boxTransform(c, box, s, (bx, by, bw, bh) => {
    c.shadowColor = "rgba(0,0,0,0.28)";
    c.shadowBlur = 26 * s;
    c.shadowOffsetY = 10 * s;
    c.fillStyle = luminance(o.palette.bg) < 0.5 ? "#ECEAE4" : "#FFFFFF";
    c.fillRect(bx - b * s, by - b * s, bw + 2 * b * s, bh + (b + bot) * s);
    c.shadowColor = "transparent";
  });
}

function drawPlaceholder(c: CanvasRenderingContext2D, o: ExportOpts, box: Box, s: number, index: number) {
  const p = o.palette;
  boxTransform(c, box, s, (bx, by, bw, bh) => {
    c.fillStyle = p.ph;
    c.fillRect(bx, by, bw, bh);

    c.strokeStyle = rgba(p.ink, 0.5);
    c.lineWidth = Math.max(1, 2 * s);
    c.setLineDash([10 * s, 8 * s]);
    const inset = 14 * s;
    c.strokeRect(bx + inset, by + inset, bw - 2 * inset, bh - 2 * inset);
    c.setLineDash([]);

    c.fillStyle = rgba(p.ink, 0.85);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `600 ${Math.max(11, 64 * s)}px "Hanken Grotesk", -apple-system, sans-serif`;
    c.fillText(String(index), 0, -24 * s);
    if (box.w > 220 && box.h > 160) {
      c.font = `400 ${Math.max(8, 30 * s)}px "Hanken Grotesk", -apple-system, sans-serif`;
      c.fillText("click or drop photo", 0, 40 * s);
    }
  });
}

function drawBlurBg(c: CanvasRenderingContext2D, o: ExportOpts, box: Box, i: number, s: number) {
  const p = o.palette;
  const T = o.tpl;
  const sx = box.slide * SLIDE_W;
  const img = imgAt(o, i)!;

  c.save();
  c.beginPath();
  c.rect(sx * s, 0, SLIDE_W * s, T.H * s);
  c.clip();
  c.filter = `blur(${Math.max(2, 50 * s)}px)`;
  const cover = Math.max(SLIDE_W / img.naturalWidth, T.H / img.naturalHeight) * 1.25;
  const dw = img.naturalWidth * cover;
  const dh = img.naturalHeight * cover;
  c.globalAlpha = 0.55;
  c.drawImage(img,
    (sx + (SLIDE_W - dw) / 2) * s, ((T.H - dh) / 2) * s,
    dw * s, dh * s);
  c.restore();

  const fadeW = 110, fadeH = 90;
  const edges = [
    [sx, 0, fadeW, T.H, sx, 0, sx + fadeW, 0],
    [sx + SLIDE_W - fadeW, 0, fadeW, T.H, sx + SLIDE_W, 0, sx + SLIDE_W - fadeW, 0],
    [sx, 0, SLIDE_W, fadeH, 0, 0, 0, fadeH],
    [sx, T.H - fadeH, SLIDE_W, fadeH, 0, T.H, 0, T.H - fadeH],
  ];
  for (const [x, y, w, h, gx0, gy0, gx1, gy1] of edges) {
    const g = c.createLinearGradient(gx0 * s, gy0 * s, gx1 * s, gy1 * s);
    g.addColorStop(0, rgba(p.bg, 1));
    g.addColorStop(1, rgba(p.bg, 0));
    c.fillStyle = g;
    c.fillRect(x * s, y * s, w * s, h * s);
  }
}

/* Render the strip (or, with `slice`, a horizontal window of it — used to
   export one slide at a time so 2x exports never allocate a 40k-px canvas). */
export function drawStrip(
  c: CanvasRenderingContext2D, s: number, o: ExportOpts,
  slice?: { x: number; w: number },
) {
  const T = o.tpl;
  const p = o.palette;
  const stripW = T.n * SLIDE_W;
  c.canvas.width = Math.round((slice ? slice.w : stripW) * s);
  c.canvas.height = Math.round(T.H * s);
  c.save();
  if (slice) c.translate(-slice.x * s, 0);

  // background
  if (o.bgStyle === "gradient") {
    const g = c.createLinearGradient(0, 0, stripW * s, T.H * s);
    g.addColorStop(0, shade(p.bg, 0.04));
    g.addColorStop(1, shade(p.bg, -0.06));
    c.fillStyle = g;
  } else {
    c.fillStyle = p.bg;
  }
  c.fillRect(0, 0, stripW * s, T.H * s);

  // per-slide background color overrides
  if (o.slideBg) {
    for (let i = 0; i < T.n; i++) {
      const hex = o.slideBg[i];
      if (!hex) continue;
      const x = i * SLIDE_W;
      if (o.bgStyle === "gradient") {
        const g = c.createLinearGradient(x * s, 0, (x + SLIDE_W) * s, T.H * s);
        g.addColorStop(0, shade(hex, 0.04));
        g.addColorStop(1, shade(hex, -0.06));
        c.fillStyle = g;
      } else {
        c.fillStyle = hex;
      }
      c.fillRect(x * s, 0, SLIDE_W * s, T.H * s);
    }
  }

  if (o.bgStyle === "blurpano") {
    const firstSrc = o.photos.find(Boolean) as string | undefined;
    const img = firstSrc ? o.images.get(firstSrc) : null;
    if (img) {
      c.save();
      c.filter = `blur(${Math.max(3, 70 * s)}px)`;
      c.globalAlpha = 0.4;
      const cover = Math.max(stripW / img.naturalWidth, T.H / img.naturalHeight) * 1.1;
      const dw = img.naturalWidth * cover, dh = img.naturalHeight * cover;
      c.drawImage(img, ((stripW - dw) / 2) * s, ((T.H - dh) / 2) * s, dw * s, dh * s);
      c.restore();
    }
  }

  // blurred photo backgrounds behind framed slots (blur bg style only)
  if (o.bgStyle === "blurpano") {
    T.boxes.forEach((box, i) => {
      if (box.blurBg && imgAt(o, i)) drawBlurBg(c, o, box, i, s);
    });
  }

  // decor
  for (const d of T.decor) {
    if (d.kind === "ribbon") {
      c.fillStyle = rgba(p.ink, 0.45);
      c.fillRect(0, d.y * s, stripW * s, d.h * s);
    } else {
      c.beginPath();
      c.arc(d.cx * s, d.cy * s, d.r * s, 0, Math.PI * 2);
      if (d.stroke) {
        c.strokeStyle = rgba(p.ink, 0.4);
        c.lineWidth = Math.max(1, 4 * s);
        c.stroke();
      } else {
        c.fillStyle = rgba(p.ink, 0.16);
        c.fill();
      }
    }
  }

  // filmstrip bands
  const darkBg = luminance(p.bg) < 0.5;
  const bandColor = darkBg ? "#000000" : "#1B1B1B";
  for (const band of T.bands) {
    c.fillStyle = bandColor;
    c.fillRect(band.x * s, band.y * s, band.w * s, band.h * s);
    const holeW = 30, holeH = 18, step = 62;
    c.fillStyle = p.bg;
    for (const hy of [band.y + 14, band.y + band.h - 14 - holeH]) {
      for (let hx = band.x + 20; hx + holeW < band.x + band.w; hx += step) {
        c.beginPath();
        c.roundRect(hx * s, hy * s, holeW * s, holeH * s, 4 * s);
        c.fill();
      }
    }
  }

  // photo boxes
  T.boxes.forEach((box, i) => {
    if (box.frame === "polaroid") drawPolaroidFrame(c, o, box, s);
    if (imgAt(o, i)) drawCover(c, o, box, i, s);
    else drawPlaceholder(c, o, box, s, i + 1);
  });

  // effects — over photos, under text (mirrors strip.tsx). Per-slide: each post
  // carries its own gradient + vignette intensity (o.slideEffects[i]).
  const rad = Math.hypot(SLIDE_W / 2, T.H / 2);
  for (let i = 0; i < T.n; i++) {
    const fx = effectAt(o.slideEffects, i);
    const x = i * SLIDE_W;
    if (fx.gradient > 0) {
      const g = c.createLinearGradient(0, GRADIENT_TOP * T.H * s, 0, T.H * s);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${gradientAlpha(fx.gradient)})`);
      c.fillStyle = g;
      c.fillRect(x * s, 0, SLIDE_W * s, T.H * s);
    }
    if (fx.vignette > 0) {
      const cx = (i + 0.5) * SLIDE_W, cy = T.H / 2;
      const g = c.createRadialGradient(cx * s, cy * s, VIGNETTE_INNER * rad * s, cx * s, cy * s, rad * s);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${vignetteAlpha(fx.vignette)})`);
      c.fillStyle = g;
      c.fillRect(x * s, 0, SLIDE_W * s, T.H * s);
    }
  }

  // text blocks
  const vs = T.H / 1350;
  for (const t of o.texts || []) {
    if (!t.text.trim()) continue;
    const px = t.size * vs;
    const ls = t.letterSpacing * vs;
    c.save();
    c.font = fontShorthand(t, px * s);
    if ("letterSpacing" in c) (c as any).letterSpacing = `${ls * s}px`;
    c.textAlign = t.align as CanvasTextAlign;
    c.textBaseline = "middle";
    c.shadowColor = "rgba(0,0,0,0.22)";
    c.shadowBlur = 14 * s;
    c.fillStyle = t.color === "auto" ? p.text : t.color;
    const lines = (t.upper ? t.text.toUpperCase() : t.text).split("\n");
    const lh = px * 1.1;
    const y0 = t.y - (lines.length - 1) * lh / 2;
    lines.forEach((line, k) => c.fillText(line, t.x * s, (y0 + k * lh) * s));
    c.restore();
  }

  c.restore(); // undo slice translate before the canvas-aligned texture pass

  // texture overlay
  if (o.texture === "grain" || o.texture === "paper") {
    c.save();
    c.globalAlpha = o.texture === "grain"
      ? (darkBg ? 0.08 : 0.05)
      : (darkBg ? 0.12 : 0.09);
    c.globalCompositeOperation = "overlay";
    c.fillStyle = c.createPattern(
      o.texture === "grain" ? getNoiseTile() : getPaperTile(), "repeat")!;
    c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    c.restore();
  }
}

/* canvas can only draw a web font once the browser has actually loaded the
   exact family+weight+style. Force-load each used variant, then wait. */
async function ensureFonts(texts: TextBlock[]) {
  const fd = (document as any).fonts;
  if (!fd || !texts?.length) return;
  const seen = new Set<string>();
  for (const t of texts) {
    if (!t.text.trim()) continue;
    const spec = `${t.italic ? "italic " : ""}${t.weight} 64px ${fontStack(t.font)}`;
    if (seen.has(spec)) continue;
    seen.add(spec);
    try { await fd.load(spec); } catch { /* fall back to system */ }
  }
  try { await fd.ready; } catch { /* ignore */ }
}

/* ---------- downloads ---------- */

export interface ExportSettings {
  format: "png" | "jpeg";
  scale: 1 | 2;
  mode: "slides" | "pano";
  docName: string;
  separate?: boolean; // fallback: one download per slide instead of a zip
}

// browsers start failing around 16k–32k px per canvas dimension; stay safe
const MAX_CANVAS_DIM = 16000;

function triggerDownload(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const toBlob = (canvas: HTMLCanvasElement, format: "png" | "jpeg"): Promise<Blob | null> =>
  new Promise(res => canvas.toBlob(res, `image/${format}`, format === "jpeg" ? 0.9 : undefined));

const safeName = (name: string) =>
  (name || "carousel").trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_").slice(0, 60) || "carousel";

/* Render + download per the settings: a zip of per-slide images (default),
   loose per-slide files (`separate`), or one full-strip panorama image. */
export async function exportCarousel(
  opts: Omit<ExportOpts, "images">, settings: ExportSettings,
) {
  const images = await loadImages(opts.photos);
  const o: ExportOpts = { ...opts, images };
  const T = o.tpl;
  const ext = settings.format === "jpeg" ? "jpg" : "png";
  const name = safeName(settings.docName);

  // make sure web fonts used by text blocks are rasterizable before drawing
  await ensureFonts(o.texts);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  if (settings.mode === "pano") {
    // one wide image; clamp scale so the canvas stays within safe limits
    let s: number = settings.scale;
    while (s > 1 && T.n * SLIDE_W * s > MAX_CANVAS_DIM) s -= 1;
    drawStrip(ctx, s, o);
    const blob = await toBlob(canvas, settings.format);
    if (blob) triggerDownload(blob, `${name}_strip.${ext}`);
    return;
  }

  // slides: render one at a time (2x of a 10-slide strip would exceed canvas
  // limits if drawn whole), then zip — or fall back to loose downloads
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < T.n; i++) {
    drawStrip(ctx, settings.scale, o, { x: i * SLIDE_W, w: SLIDE_W });
    const blob = await toBlob(canvas, settings.format);
    if (!blob) continue;
    const fname = `${String(i + 1).padStart(2, "0")}.${ext}`;
    if (settings.separate) {
      triggerDownload(blob, `${name}_${fname}`);
      await new Promise(r => setTimeout(r, 350));
    } else {
      files[fname] = new Uint8Array(await blob.arrayBuffer());
    }
  }
  if (!settings.separate) {
    // level 0: PNG/JPEG payloads are already compressed
    const zipped = zipSync(files, { level: 0 });
    triggerDownload(new Blob([zipped], { type: "application/zip" }), `${name}.zip`);
  }
}
