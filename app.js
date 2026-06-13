"use strict";

/* ============================================================
   Seamless Instagram carousel template generator — "Studio" UI.

   The whole carousel is modeled as one wide "strip" (n * 1080
   strip coords). Layouts place photo boxes in strip coordinates;
   some layouts deliberately cross slide boundaries so adjacent
   posts connect when swiped.

   The preview is DOM-based: each slide is a clipped "window"
   onto a full copy of the strip, and photo slots are absolutely
   positioned divs keyed by slot index — so regenerating a
   template lets CSS morph each slot to its new geometry, and the
   strip can pull apart into individual post cards (Strip ↔ Posts
   toggle). Export renders the strip to an offscreen canvas at
   scale 1 and slices it into individual 1080-wide PNGs.
   ============================================================ */

const SLIDE_W = 1080;

const PALETTES = [
  { name: "Warm White", bg: "#FAF7F1", ph: "#EAE3D6", ink: "#8A8175", text: "#3B362E" },
  { name: "Cream",      bg: "#F4EDE1", ph: "#E2D7C2", ink: "#94886F", text: "#42392B" },
  { name: "Soft Gray",  bg: "#F5F5F4", ph: "#E3E2DF", ink: "#8E8C88", text: "#3A3938" },
  { name: "Sage",       bg: "#EEF1EA", ph: "#DBE1D3", ink: "#83907B", text: "#37402F" },
  { name: "Blush",      bg: "#F7F0EC", ph: "#EADDD5", ink: "#9C8A80", text: "#46362E" },
  { name: "Charcoal",   bg: "#181818", ph: "#2B2B2B", ink: "#8F8F8F", text: "#EDEAE3" },
];

/* Pattern registry. span > 1 = layout consumes multiple slides. */
const PATTERNS = {
  full:      { span: 1, weight: 3.0 },
  framed:    { span: 1, weight: 3.0 },
  stack2:    { span: 1, weight: 2.0 },
  stack3:    { span: 1, weight: 1.2 },
  grid4:     { span: 1, weight: 1.2 },
  editorial: { span: 1, weight: 2.0 },
  hero:      { span: 1, weight: 1.6 },
  polaroid:  { span: 1, weight: 1.4 },
  spread:    { span: 2, weight: 1.5 },
  panorama:  { span: 2, weight: 1.2 },   // may stretch to 3
  boundary:  { span: 2, weight: 1.2 },
  filmstrip: { span: 2, weight: 1.0 },
};

const DECOR_KEYS = ["ribbon", "arcs", "overhang"];

/* Human copy for every toggle — the pattern panel leans on these
   so each functionality explains itself. */
const PATTERN_INFO = {
  full:      { label: "Full bleed",   desc: "Photo fills the post, edge to edge" },
  framed:    { label: "Framed",       desc: "One photo, generous margins" },
  stack2:    { label: "2-stack",      desc: "Two photos stacked vertically" },
  stack3:    { label: "3-stack",      desc: "Three full-width rows" },
  grid4:     { label: "2×2 grid",     desc: "Four photos in a grid" },
  editorial: { label: "Editorial",    desc: "Large photo + small offset companion" },
  hero:      { label: "Hero",         desc: "Photo flush to an edge, room for captions" },
  polaroid:  { label: "Polaroid",     desc: "Tilted instant-photo frames" },
  spread:    { label: "Spread",       desc: "One framed photo across 2 posts" },
  panorama:  { label: "Panorama",     desc: "Edge-to-edge across 2–3 posts" },
  boundary:  { label: "Boundary cut", desc: "A photo split by the post edge" },
  filmstrip: { label: "Film strip",   desc: "Negative band running across 2 posts" },
  ribbon:    { label: "Ribbon",       desc: "Thin accent line behind photos" },
  arcs:      { label: "Circles",      desc: "Big soft accent circles behind photos" },
  overhang:  { label: "Overhangs",    desc: "Full-bleed photos spill into the next post" },
};

const RATIOS = [
  { h: 1350, label: "4:5",    name: "Portrait" },
  { h: 1440, label: "3:4",    name: "Tall" },
  { h: 1080, label: "1:1",    name: "Square" },
  { h: 566,  label: "1.91:1", name: "Wide" },
];

const state = {
  n: 5,
  H: 1350,
  paletteIdx: 0,
  bgStyle: "white",     // white | flat | gradient | blurpano
  texture: "grain",     // none | grain | paper
  title: "",
  theme: "dark",
  viewMode: "strip",    // strip | posts
  panelOpen: true,
  enabled: Object.fromEntries(
    [...Object.keys(PATTERNS), ...DECOR_KEYS].map(k => [k, k !== "ribbon" && k !== "arcs"])),
  history: [],   // generated templates {boxes,bands,decor,layoutAt,n,H}
  cursor: -1,
  photos: [],    // per slot index: {src, img} | null
  panzoom: {},   // per slot index: {x, y, z}
};

const tpl = () => state.history[state.cursor];
const palette = () => PALETTES[state.paletteIdx];
const photoAt = (i) => state.photos[i] || null;
const firstPhoto = () => state.photos.find(Boolean) || null;

/* ---------- helpers ---------- */

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const $ = (id) => document.getElementById(id);

function div(cls) {
  const d = document.createElement("div");
  if (cls) d.className = cls;
  return d;
}

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function shade(hex, amt) {
  // amt > 0 lightens toward white, < 0 darkens toward black
  const [r, g, b] = hexToRgb(hex);
  const t = amt > 0 ? 255 : 0;
  const f = Math.abs(amt);
  const mix = (c) => Math.round(c + (t - c) * f);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function weightedPick(types) {
  const total = types.reduce((s, t) => s + PATTERNS[t].weight, 0);
  let r = Math.random() * total;
  for (const t of types) {
    r -= PATTERNS[t].weight;
    if (r <= 0) return t;
  }
  return types[types.length - 1];
}

/* ---------- template generation (pure: no DOM, no state writes) ---------- */

function genSequence(n, enabled) {
  const singles = Object.keys(PATTERNS)
    .filter(t => PATTERNS[t].span === 1 && enabled[t]);
  const multis = Object.keys(PATTERNS)
    .filter(t => PATTERNS[t].span > 1 && enabled[t]);
  if (!singles.length) singles.push("full"); // never an empty pool

  const seq = []; // { type, span, slide }
  let i = 0, prev = null;

  while (i < n) {
    const rem = n - i;

    // cross-slide layouts: gated so they stay occasional
    const multiPool = multis.filter(t => t !== prev && PATTERNS[t].span <= rem);
    if (multiPool.length && Math.random() < 0.3 && i !== 0) {
      const t = weightedPick(multiPool);
      let span = PATTERNS[t].span;
      if (t === "panorama" && rem >= 3 && Math.random() < 0.4) span = 3;
      seq.push({ type: t, span, slide: i });
      prev = t;
      i += span;
      continue;
    }

    let pool = singles.filter(t => t !== prev);
    if (!pool.length) pool = singles;

    // soft anchors: open strong, close with breathing room
    if (i === 0 && Math.random() < 0.55) {
      const openers = pool.filter(t => ["full", "hero"].includes(t));
      if (openers.length) pool = openers;
    } else if (i === n - 1 && Math.random() < 0.5) {
      const closers = pool.filter(t => ["framed", "hero"].includes(t));
      if (closers.length) pool = closers;
    }

    const t = weightedPick(pool);
    seq.push({ type: t, span: 1, slide: i });
    prev = t;
    i++;
  }
  return seq;
}

let boxId = 0;

function makeBox(slide, x, y, w, h, opts = {}) {
  return {
    id: ++boxId, slide,
    x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
    rot: opts.rot || 0,
    frame: opts.frame || null,   // "polaroid"
    blurBg: !!opts.blurBg,
  };
}

function generateTemplate(n, H, enabled) {
  boxId = 0;
  // vertical margins/gutters are tuned for 4:5; scale them for
  // squarer and landscape ratios so photos don't get crushed
  const vs = H / 1350;
  const boxes = [];
  const bands = [];
  const layoutAt = new Array(n);

  const seq = genSequence(n, enabled);

  for (const { type: t, span, slide: i } of seq) {
    const sx = i * SLIDE_W;
    for (let k = 0; k < span; k++) layoutAt[i + k] = t;

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
        for (let cidx = 0; cidx < 2; cidx++) {
          boxes.push(makeBox(i,
            sx + m + cidx * (cw + g), my + r * (ch + gy), cw, ch));
        }
      }

    } else if (t === "editorial") {
      // one large photo + one small offset photo, deliberate whitespace
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
      // photo flush to an edge, rest left empty for captions
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
      const frameB = 30, frameBot = 110; // white border + caption strip
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
      // one framed photo across two slides; center drifts off the
      // boundary sometimes for a more organic cut
      const ms = randInt(130, 200);
      const mv = Math.round(randInt(140, 220) * vs);
      const drift = Math.random() < 0.5
        ? 0 : Math.round(SLIDE_W * rand(-0.22, 0.22));
      const w = 2 * SLIDE_W - 2 * ms;
      let x = sx + ms + drift;
      x = Math.max(sx + 60, Math.min(sx + 2 * SLIDE_W - 60 - w, x));
      boxes.push(makeBox(i, x, mv, w, H - 2 * mv));

    } else if (t === "panorama") {
      boxes.push(makeBox(i, sx, 0, span * SLIDE_W, H));

    } else if (t === "boundary") {
      // full-height photo cut by the slide boundary, flanked by
      // framed companions on each side
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
      // dark film band with sprocket holes across two slides
      const bandH = Math.round(Math.min(H * rand(0.48, 0.58), H - 120));
      const bandY = Math.round((H - bandH) * rand(0.25, 0.75));
      bands.push({ x: sx, y: bandY, w: 2 * SLIDE_W, h: bandH });
      const sp = 56; // sprocket row height incl. padding
      const g = 30;
      const fw = (2 * SLIDE_W - 3 * g) / 4;
      const fy = bandY + sp;
      const fh = bandH - 2 * sp;
      for (let k = 0; k < 4; k++) {
        boxes.push(makeBox(i, sx + k * (fw + g), fy, fw, fh));
      }
    }
  }

  // seamless overhangs: a full-bleed photo bleeds into a
  // neighbouring margined slide as a continuing strip
  if (enabled.overhang) {
    const margined = ["framed", "stack2", "grid4", "editorial"];
    for (let i = 0; i < n; i++) {
      if (layoutAt[i] !== "full") continue;
      const box = boxes.find(b => b.slide === i && b.w === SLIDE_W);
      if (!box) continue;
      if (i + 1 < n && margined.includes(layoutAt[i + 1])) {
        box.w += randInt(50, 130);
      }
      if (i - 1 >= 0 && margined.includes(layoutAt[i - 1])) {
        const o = randInt(50, 130);
        box.x -= o;
        box.w += o;
      }
    }
  }

  // decor behind photos
  const decor = [];
  if (enabled.ribbon && Math.random() < 0.55) {
    decor.push({
      kind: "ribbon",
      y: Math.round(H * rand(0.12, 0.85)),
      h: randInt(8, 22),
    });
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

/* ---------- icons ---------- */

const Ic = {
  minus: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  undo: '<svg viewBox="0 0 16 16" width="15" height="15"><path d="M6.5 3.5 3 7l3.5 3.5M3 7h6a4 4 0 0 1 0 8H7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  history: '<svg viewBox="0 0 16 16" width="15" height="15"><path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M2.5 8a5.5 5.5 0 1 1 1.6 3.9M2.5 8H1m1.5 0 .9 1.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  refresh: '<svg viewBox="0 0 16 16" width="15" height="15"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  download: '<svg viewBox="0 0 16 16" width="15" height="15"><path d="M8 2.5V10m0 0 3-3m-3 3-3-3M3 13.5h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  photos: '<svg viewBox="0 0 16 16" width="15" height="15"><rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="6" cy="7" r="1.2" fill="currentColor"/><path d="m4 12 3.2-3 2.3 2 2-1.8 2.5 2.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  sun: '<svg viewBox="0 0 16 16" width="15" height="15"><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  moon: '<svg viewBox="0 0 16 16" width="15" height="15"><path d="M13 9.5A5.5 5.5 0 0 1 6.5 3 5.5 5.5 0 1 0 13 9.5Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  chevron: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  strip: '<svg viewBox="0 0 18 14" width="16" height="13"><rect x="1" y="2" width="16" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6.3 2v10M11.7 2v10" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1.6"/></svg>',
  posts: '<svg viewBox="0 0 18 14" width="16" height="13"><rect x="1" y="2" width="4.4" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="6.8" y="2" width="4.4" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="12.6" y="2" width="4.4" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  close: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="m4 4 8 8m0-8-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
};

/* ---------- texture tiles (DOM overlays) ---------- */

const GRAIN_URI = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")";
const PAPER_URI = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04 0.09' numOctaves='3'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23p)'/%3E%3C/svg%3E\")";

/* ---------- pan / zoom ---------- */

function clampPan(box, pz, photo) {
  if (!photo) return pz;
  const nw = photo.img.naturalWidth, nh = photo.img.naturalHeight;
  const base = Math.max(box.w / nw, box.h / nh) * pz.z;
  const maxX = Math.max(0, (nw * base - box.w) / 2);
  const maxY = Math.max(0, (nh * base - box.h) / 2);
  return {
    ...pz,
    x: Math.max(-maxX, Math.min(maxX, pz.x)),
    y: Math.max(-maxY, Math.min(maxY, pz.y)),
  };
}

function panBy(i, dx, dy, box) {
  const cur = state.panzoom[i] || { x: 0, y: 0, z: 1 };
  state.panzoom[i] = clampPan(box, { ...cur, x: cur.x + dx, y: cur.y + dy }, photoAt(i));
  applyPanzoomAll(i);
}

function zoomBy(i, f) {
  const cur = state.panzoom[i] || { x: 0, y: 0, z: 1 };
  state.panzoom[i] = { ...cur, z: Math.max(1, Math.min(4, cur.z * f)) };
  applyPanzoomAll(i);
}

function applyPanzoomAll(i) {
  for (const w of windows) w.strip.applyPZ(i);
}

/* ---------- DOM strip renderer ----------
   One full copy of the strip; each slide window holds its own
   copy, clipped and offset, so the strip can pull apart. All
   geometry is keyed by index so style updates morph via CSS. */

function createStrip(interactive) {
  const root = div("stripContent");
  const lyPano = div("stripLayer");
  const lyBlur = div("stripLayer");
  const lyDecor = div("stripLayer");
  const lyBands = div("stripLayer");
  const lyBoxes = div("stripLayer");
  const titleEl = div("stripTitle");
  const texEl = div("textureOverlay");
  titleEl.style.display = "none";
  texEl.style.display = "none";
  root.append(lyPano, lyBlur, lyDecor, lyBands, lyBoxes, titleEl, texEl);

  const boxRecs = new Map();   // slot index -> record
  const blurRecs = new Map();  // slot index -> {el, img}
  let decorRecs = [];          // [{kind, el}]
  let bandRecs = [];           // [{el}]
  let curS = 0.3;

  function makeBoxRec(i) {
    const el = div("photoBox");
    const clip = div("photoClip");
    el.appendChild(clip);
    const rec = { el, clip, frame: null, img: null, ph: null, ring: null };

    if (!interactive) return rec;

    let drag = null;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.altKey) return;
      if (photoAt(i)) {
        drag = { x: e.clientX, y: e.clientY, moved: false };
        el.setPointerCapture(e.pointerId);
      }
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const box = tpl().boxes[i];
      let dx = (e.clientX - drag.x) / curS;
      let dy = (e.clientY - drag.y) / curS;
      if (box.rot) {
        const co = Math.cos(-box.rot), si = Math.sin(-box.rot);
        [dx, dy] = [dx * co - dy * si, dx * si + dy * co];
      }
      if (Math.abs(dx) + Math.abs(dy) > 0) drag.moved = true;
      drag.x = e.clientX;
      drag.y = e.clientY;
      panBy(i, dx, dy, box);
    });
    el.addEventListener("pointerup", () => {
      setTimeout(() => { drag = null; }, 0);
    });
    el.addEventListener("click", (e) => {
      if (drag && drag.moved) return;
      if (e.altKey) { if (photoAt(i)) removePhoto(i); return; }
      if (!photoAt(i)) openPickerFor(i);
    });
    el.addEventListener("dblclick", () => openPickerFor(i));
    el.addEventListener("wheel", (e) => {
      if (!photoAt(i)) return;
      e.preventDefault();
      zoomBy(i, 1 - e.deltaY * 0.0015);
    }, { passive: false });
    el.addEventListener("dragover", (e) => {
      e.preventDefault(); e.stopPropagation();
      showRing(rec, true);
    });
    el.addEventListener("dragleave", () => showRing(rec, false));
    el.addEventListener("drop", (e) => {
      e.preventDefault(); e.stopPropagation();
      showRing(rec, false);
      const file = [...e.dataTransfer.files].find(f => f.type.startsWith("image/"));
      if (file) setPhotoFromFile(i, file);
    });
    return rec;
  }

  function showRing(rec, on) {
    if (on && !rec.ring) {
      rec.ring = div("dropRing");
      rec.el.appendChild(rec.ring);
    } else if (!on && rec.ring) {
      rec.ring.remove();
      rec.ring = null;
    }
  }

  function updateBoxRec(rec, b, i, s, p) {
    const st = rec.el.style;
    st.left = b.x * s + "px";
    st.top = b.y * s + "px";
    st.width = b.w * s + "px";
    st.height = b.h * s + "px";
    st.transform = b.rot ? `rotate(${b.rot}rad)` : "";
    st.cursor = interactive ? (photoAt(i) ? "grab" : "pointer") : "default";

    // polaroid frame behind the photo
    if (b.frame === "polaroid") {
      if (!rec.frame) {
        rec.frame = div("polaroidFrame");
        rec.el.insertBefore(rec.frame, rec.clip);
      }
      const f = rec.frame.style;
      f.left = -30 * s + "px";
      f.top = -30 * s + "px";
      f.right = -30 * s + "px";
      f.bottom = -110 * s + "px";
      f.background = p.name === "Charcoal" ? "#ECEAE4" : "#FFFFFF";
      f.boxShadow = `0 ${10 * s}px ${26 * s}px rgba(0,0,0,0.28)`;
    } else if (rec.frame) {
      rec.frame.remove();
      rec.frame = null;
    }

    // photo vs placeholder
    const photo = photoAt(i);
    if (photo) {
      if (rec.ph) { rec.ph.remove(); rec.ph = null; }
      if (!rec.img) {
        rec.img = document.createElement("img");
        rec.img.draggable = false;
        rec.img.alt = "";
        rec.clip.appendChild(rec.img);
      }
      if (rec.img.getAttribute("src") !== photo.src) rec.img.src = photo.src;
      const pz = clampPan(b, state.panzoom[i] || { x: 0, y: 0, z: 1 }, photo);
      rec.img.style.transform = `translate(${pz.x * s}px, ${pz.y * s}px) scale(${pz.z})`;
    } else {
      if (rec.img) { rec.img.remove(); rec.img = null; }
      if (!rec.ph) {
        rec.ph = div("placeholder");
        const dash = div("phDash");
        const num = document.createElement("span");
        num.className = "phNum";
        const hint = document.createElement("span");
        hint.className = "phHint";
        hint.textContent = "click or drop photo";
        rec.ph.append(dash, num, hint);
        rec.clip.appendChild(rec.ph);
      }
      rec.ph.style.background = p.ph;
      rec.ph.style.color = rgba(p.ink, 0.9);
      rec.ph.querySelector(".phDash").style.borderColor = rgba(p.ink, 0.5);
      const num = rec.ph.querySelector(".phNum");
      num.textContent = i + 1;
      num.style.fontSize = Math.max(11, 64 * s) + "px";
      const hint = rec.ph.querySelector(".phHint");
      hint.style.fontSize = Math.max(9, 30 * s) + "px";
      hint.style.display = (b.w * s < 90 || b.h * s < 70) ? "none" : "";
    }
  }

  function sync(s) {
    curS = s;
    const T = tpl();
    const p = palette();
    root.style.width = T.n * SLIDE_W * s + "px";
    root.style.height = T.H * s + "px";
    root.style.background = state.bgStyle === "gradient"
      ? `linear-gradient(135deg, ${shade(p.bg, 0.04)}, ${shade(p.bg, -0.06)})`
      : state.bgStyle === "white" ? "#FFFFFF" : p.bg;

    // panorama blur backdrop (1st photo behind everything)
    lyPano.innerHTML = "";
    const first = firstPhoto();
    if (state.bgStyle === "blurpano" && first) {
      const wrap = div("panoBlur");
      const im = document.createElement("img");
      im.src = first.src;
      im.draggable = false;
      im.alt = "";
      im.style.filter = `blur(${Math.max(3, 70 * s)}px)`;
      wrap.appendChild(im);
      lyPano.appendChild(wrap);
    }

    // blurred photo backdrops behind framed slots
    const wantBlur = new Set();
    T.boxes.forEach((b, i) => {
      if (!(b.blurBg && photoAt(i))) return;
      wantBlur.add(i);
      let r = blurRecs.get(i);
      if (!r) {
        r = { el: div("blurBgSlide"), img: document.createElement("img") };
        r.img.draggable = false;
        r.img.alt = "";
        r.el.appendChild(r.img);
        blurRecs.set(i, r);
        lyBlur.appendChild(r.el);
      }
      r.el.style.left = b.slide * SLIDE_W * s + "px";
      r.el.style.width = SLIDE_W * s + "px";
      r.el.style.height = T.H * s + "px";
      if (r.img.getAttribute("src") !== photoAt(i).src) r.img.src = photoAt(i).src;
      r.img.style.filter = `blur(${Math.max(2, 50 * s)}px)`;
    });
    for (const [i, r] of [...blurRecs]) {
      if (!wantBlur.has(i)) { r.el.remove(); blurRecs.delete(i); }
    }

    // decor
    T.decor.forEach((d, i) => {
      let rec = decorRecs[i];
      if (!rec || rec.kind !== d.kind) {
        if (rec) rec.el.remove();
        rec = { kind: d.kind, el: div(d.kind === "ribbon" ? "decorRibbon" : "decorCircle") };
        decorRecs[i] = rec;
        lyDecor.appendChild(rec.el);
      }
      if (d.kind === "ribbon") {
        rec.el.style.top = d.y * s + "px";
        rec.el.style.height = Math.max(1, d.h * s) + "px";
        rec.el.style.background = rgba(p.ink, 0.45);
      } else {
        rec.el.style.left = (d.cx - d.r) * s + "px";
        rec.el.style.top = (d.cy - d.r) * s + "px";
        rec.el.style.width = d.r * 2 * s + "px";
        rec.el.style.height = d.r * 2 * s + "px";
        rec.el.style.border = d.stroke
          ? `${Math.max(1, 4 * s)}px solid ${rgba(p.ink, 0.4)}` : "none";
        rec.el.style.background = d.stroke ? "transparent" : rgba(p.ink, 0.16);
      }
    });
    decorRecs.splice(T.decor.length).forEach(r => r && r.el.remove());

    // filmstrip bands + sprocket holes
    const bandColor = p.name === "Charcoal" ? "#000000" : "#1B1B1B";
    T.bands.forEach((band, i) => {
      let rec = bandRecs[i];
      if (!rec) {
        rec = { el: div("filmBand") };
        bandRecs[i] = rec;
        lyBands.appendChild(rec.el);
      }
      rec.el.style.left = band.x * s + "px";
      rec.el.style.top = band.y * s + "px";
      rec.el.style.width = band.w * s + "px";
      rec.el.style.height = band.h * s + "px";
      rec.el.style.background = bandColor;
      rec.el.innerHTML = "";
      const holeW = 30, holeH = 18, step = 62;
      for (const hy of [14, band.h - 14 - holeH]) {
        for (let hx = band.x + 20; hx + holeW < band.x + band.w; hx += step) {
          const hole = div("sprocket");
          hole.style.left = (hx - band.x) * s + "px";
          hole.style.top = hy * s + "px";
          hole.style.width = holeW * s + "px";
          hole.style.height = holeH * s + "px";
          hole.style.borderRadius = 4 * s + "px";
          hole.style.background = p.bg;
          rec.el.appendChild(hole);
        }
      }
    });
    bandRecs.splice(T.bands.length).forEach(r => r && r.el.remove());

    // photo slots
    T.boxes.forEach((b, i) => {
      let rec = boxRecs.get(i);
      if (!rec) {
        rec = makeBoxRec(i);
        boxRecs.set(i, rec);
        lyBoxes.appendChild(rec.el);
      }
      updateBoxRec(rec, b, i, s, p);
    });
    for (const [i, rec] of [...boxRecs]) {
      if (i >= T.boxes.length) { rec.el.remove(); boxRecs.delete(i); }
    }

    // title
    if (state.title.trim()) {
      titleEl.style.display = "";
      titleEl.textContent = state.title.toUpperCase();
      const sizeStrip = 120 * (T.H / 1350);
      titleEl.style.left = (T.n > 1 ? SLIDE_W : SLIDE_W / 2) * s + "px";
      titleEl.style.top = Math.max(sizeStrip, T.H * 0.14) * s + "px";
      titleEl.style.fontSize = sizeStrip * s + "px";
      titleEl.style.letterSpacing = 6 * s + "px";
      titleEl.style.color = p.text;
    } else {
      titleEl.style.display = "none";
    }

    // texture overlay
    if (state.texture !== "none") {
      texEl.style.display = "";
      texEl.style.backgroundImage = state.texture === "grain" ? GRAIN_URI : PAPER_URI;
      texEl.style.opacity = state.texture === "grain"
        ? (p.name === "Charcoal" ? 0.10 : 0.06)
        : (p.name === "Charcoal" ? 0.14 : 0.10);
    } else {
      texEl.style.display = "none";
    }
  }

  function applyPZ(i) {
    const rec = boxRecs.get(i);
    const box = tpl().boxes[i];
    const photo = photoAt(i);
    if (!rec || !rec.img || !box || !photo) return;
    const pz = clampPan(box, state.panzoom[i] || { x: 0, y: 0, z: 1 }, photo);
    rec.img.style.transform =
      `translate(${pz.x * curS}px, ${pz.y * curS}px) scale(${pz.z})`;
  }

  return { root, sync, applyPZ };
}

/* ---------- stage: slide windows that pull apart ---------- */

const stage = $("stage");
const windows = []; // {el, inner, strip, guide, chip, caption}
let previewScale = 0.3;

function makeWindow() {
  const w = {
    el: div("slideWin"),
    inner: div("slideInner"),
    strip: createStrip(true),
    guide: div("boundaryGuide"),
    chip: div("slideChip"),
    caption: div("postCaption"),
  };
  w.inner.appendChild(w.strip.root);
  w.el.append(w.inner, w.guide, w.chip, w.caption);
  stage.appendChild(w.el);
  return w;
}

function syncStage() {
  const T = tpl();
  const wrap = $("stageWrap");
  const posts = state.viewMode === "posts";
  const captionH = 34;
  previewScale = Math.min(
    (wrap.clientHeight - 24 - (posts ? captionH : 0)) / T.H, 0.55);
  const s = previewScale;
  const slideW = SLIDE_W * s;
  const gap = posts ? Math.max(20, slideW * 0.07) : 0;

  stage.style.width = T.n * slideW + (T.n - 1) * gap + "px";
  stage.style.height = T.H * s + (posts ? captionH : 0) + "px";
  stage.classList.toggle("postsMode", posts);

  while (windows.length < T.n) windows.push(makeWindow());
  while (windows.length > T.n) windows.pop().el.remove();

  windows.forEach((w, i) => {
    w.el.style.left = i * (slideW + gap) + "px";
    w.el.style.width = slideW + "px";
    w.el.style.height = T.H * s + "px";
    w.el.classList.toggle("asPost", posts);
    w.inner.style.transform = `translateX(${-i * slideW}px)`;
    w.guide.style.display = (!posts && i > 0) ? "" : "none";
    w.chip.textContent = i + 1;
    const info = PATTERN_INFO[T.layoutAt[i]];
    w.caption.innerHTML =
      `<b>Post ${i + 1}</b><span> · ${info ? info.label.toLowerCase() : ""}</span>`;
    w.caption.style.top = T.H * s + 8 + "px";
    w.strip.sync(s);
  });
}

/* ---------- header / panel sync ---------- */

const ALL_KEYS = [...Object.keys(PATTERNS), ...DECOR_KEYS];
const patTiles = {};

function syncHeader() {
  $("stepVal").textContent = state.n;
  $("stepMinus").disabled = state.n <= 2;
  $("stepPlus").disabled = state.n >= 10;

  for (const b of $("ratioSeg").children) {
    b.classList.toggle("on", +b.dataset.value === state.H);
  }
  for (const b of $("viewSeg").children) {
    b.classList.toggle("on", b.dataset.value === state.viewMode);
  }
  for (const b of $("bgSeg").children) {
    b.classList.toggle("on", b.dataset.value === state.bgStyle);
  }
  for (const b of $("texSeg").children) {
    b.classList.toggle("on", b.dataset.value === state.texture);
  }

  const p = palette();
  $("paletteBtn").innerHTML =
    `<span class="swDots">${[p.bg, p.ph, p.ink]
      .map(c => `<i style="background:${c}"></i>`).join("")}</span>` +
    `<span>${p.name}</span>` + Ic.chevron;

  const offCount = ALL_KEYS.filter(k => state.enabled[k] === false).length;
  const badge = $("patBadge");
  badge.hidden = offCount === 0;
  badge.textContent = offCount + " off";
  for (const k of ALL_KEYS) {
    patTiles[k].classList.toggle("on", state.enabled[k] !== false);
  }

  $("undoBtn").disabled = state.cursor <= 0;
  $("historyBtn").disabled = state.history.length < 2;
  const hb = $("histBadge");
  hb.hidden = state.history.length < 2;
  hb.textContent = state.history.length;

  $("themeBtn").innerHTML = state.theme === "dark" ? Ic.sun : Ic.moon;
  $("app").dataset.theme = state.theme;
}

function syncAll() {
  syncHeader();
  syncStage();
}

/* ---------- history ---------- */

function pushTemplate(t) {
  state.history.push(t);
  if (state.history.length > 16) state.history.shift();
  state.cursor = state.history.length - 1;
  state.panzoom = {};
  syncAll();
}

function regenerate() {
  const btn = $("regenBtn");
  btn.classList.add("spinning");
  setTimeout(() => btn.classList.remove("spinning"), 700);
  pushTemplate(generateTemplate(state.n, state.H, state.enabled));
}

function jumpTo(i) {
  const target = state.history[i];
  state.cursor = i;
  state.n = target.n;
  state.H = target.H;
  state.panzoom = {};
  syncAll();
}

function undo() {
  if (state.cursor > 0) jumpTo(state.cursor - 1);
}

/* mini SVG diagram of a template (history popover) */
function tplThumbSVG(t, width) {
  const w = t.n * SLIDE_W, h = t.H;
  const p = palette();
  const parts = [`<rect width="${w}" height="${h}" fill="${p.bg}"/>`];
  for (const d of t.decor) {
    if (d.kind === "ribbon") {
      parts.push(`<rect y="${d.y}" width="${w}" height="${d.h}" fill="${rgba(p.ink, 0.4)}"/>`);
    } else {
      parts.push(`<circle cx="${d.cx}" cy="${d.cy}" r="${d.r}" ` +
        `fill="${d.stroke ? "none" : rgba(p.ink, 0.16)}" ` +
        `stroke="${d.stroke ? rgba(p.ink, 0.4) : "none"}" stroke-width="6"/>`);
    }
  }
  for (const b of t.bands) {
    parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#1B1B1B"/>`);
  }
  for (const b of t.boxes) {
    const tf = b.rot
      ? ` transform="rotate(${b.rot * 57.3} ${b.x + b.w / 2} ${b.y + b.h / 2})"` : "";
    parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" ` +
      `fill="${p.ph}" stroke="${rgba(p.ink, 0.55)}" stroke-width="${Math.max(4, h / 130)}"${tf}/>`);
  }
  for (let i = 1; i < t.n; i++) {
    parts.push(`<line x1="${i * SLIDE_W}" y1="0" x2="${i * SLIDE_W}" y2="${h}" ` +
      `stroke="${rgba(p.ink, 0.7)}" stroke-width="${h / 160}" stroke-dasharray="22 22"/>`);
  }
  return `<svg viewBox="0 0 ${w} ${h}" width="${width}" height="${width * h / w}" ` +
    `style="display:block;border-radius:3px">${parts.join("")}</svg>`;
}

/* ---------- photos ---------- */

const picker = $("filePicker");
let pendingSlot = null;

function loadEntry(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ src, img });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function openPickerFor(i) {
  pendingSlot = i;
  picker.click();
}

function setPhoto(i, entry) {
  state.photos[i] = entry;
  delete state.panzoom[i];
  syncAll();
}

async function setPhotoFromFile(i, file) {
  const entry = await loadEntry(URL.createObjectURL(file));
  if (entry) setPhoto(i, entry);
}

function removePhoto(i) {
  state.photos[i] = null;
  delete state.panzoom[i];
  syncAll();
  showToast("Photo removed");
}

async function fillEmpty(files) {
  const entries = (await Promise.all(
    files.map(f => loadEntry(URL.createObjectURL(f))))).filter(Boolean);
  if (!entries.length) return;
  let cur = 0;
  for (let i = 0; i < tpl().boxes.length && cur < entries.length; i++) {
    if (!state.photos[i]) state.photos[i] = entries[cur++];
  }
  if (cur === 0) {
    showToast("All slots are full — ⌥ click a photo to free one");
  } else {
    showToast(`Added ${cur} photo${cur > 1 ? "s" : ""}`);
  }
  syncAll();
}

picker.addEventListener("change", async () => {
  const files = [...picker.files].filter(f => f.type.startsWith("image/"));
  picker.value = "";
  const slot = pendingSlot;
  pendingSlot = null;
  if (!files.length) return;
  if (slot !== null && files.length === 1) {
    await setPhotoFromFile(slot, files[0]);
  } else {
    await fillEmpty(files);
  }
});

/* ---------- toast ---------- */

let toastTimer = null;
function showToast(msg) {
  const root = $("toastRoot");
  root.innerHTML = "";
  const t = div("toast");
  t.textContent = msg;
  root.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3200);
}

/* ---------- popovers ---------- */

function attachPopover(trigger, className, buildContent) {
  let pop = null;
  const onDoc = (e) => {
    if (!e.target.closest(".popover") && !e.target.closest(".popTrigger")) close();
  };
  function close() {
    if (!pop) return;
    pop.remove();
    pop = null;
    document.removeEventListener("pointerdown", onDoc);
  }
  trigger.addEventListener("click", () => {
    if (pop) { close(); return; }
    pop = div("popover " + className);
    buildContent(pop, close);
    trigger.parentElement.appendChild(pop);
    document.addEventListener("pointerdown", onDoc);
  });
}

/* ---------- pattern diagrams ---------- */

function pdRects(type) {
  switch (type) {
    case "full": return { w: 60, r: [[0, 0, 60, 75]] };
    case "framed": return { w: 60, r: [[9, 11, 42, 53]] };
    case "stack2": return { w: 60, r: [[8, 7, 44, 28], [8, 40, 44, 28]] };
    case "stack3": return { w: 60, r: [[0, 2, 60, 21], [0, 27, 60, 21], [0, 52, 60, 21]] };
    case "grid4": return { w: 60, r: [[7, 9, 21, 26], [32, 9, 21, 26], [7, 40, 21, 26], [32, 40, 21, 26]] };
    case "editorial": return { w: 60, r: [[5, 9, 31, 57], [41, 24, 14, 19]] };
    case "hero": return { w: 60, r: [[0, 0, 35, 75]] };
    case "polaroid": return { w: 60, r: [[7, 9, 26, 30, -7], [26, 32, 26, 30, 6]], frame: true };
    case "spread": return { w: 120, r: [[14, 13, 92, 49]], boundary: true };
    case "panorama": return { w: 120, r: [[0, 0, 120, 75]], boundary: true };
    case "boundary": return { w: 120, r: [[38, 0, 44, 75], [6, 17, 25, 41], [89, 17, 25, 41]], boundary: true };
    case "filmstrip": return { w: 120, band: [0, 19, 120, 38], r: [[4, 27, 25, 22], [33, 27, 25, 22], [62, 27, 25, 22], [91, 27, 25, 22]], boundary: true };
    case "ribbon": return { w: 60, r: [], ribbon: 38 };
    case "arcs": return { w: 60, circles: [[20, 28, 14], [44, 52, 10]], r: [] };
    case "overhang": return { w: 120, r: [[0, 0, 72, 75], [82, 13, 30, 49]], boundary: true };
    default: return { w: 60, r: [[0, 0, 60, 75]] };
  }
}

function patternDiagramSVG(type) {
  const d = pdRects(type);
  const parts = [`<rect class="pdBg" width="${d.w}" height="75" rx="2"/>`];
  if (d.band) {
    parts.push(`<rect class="pdBand" x="${d.band[0]}" y="${d.band[1]}" width="${d.band[2]}" height="${d.band[3]}"/>`);
  }
  if (d.ribbon !== undefined) {
    parts.push(`<rect class="pdFill" x="0" y="${d.ribbon}" width="${d.w}" height="4"/>`);
  }
  (d.circles || []).forEach((c, i) => {
    parts.push(`<circle class="${i % 2 ? "pdFill" : "pdStrokeC"}" cx="${c[0]}" cy="${c[1]}" r="${c[2]}"/>`);
  });
  for (const r of d.r) {
    const tf = r[4]
      ? ` transform="rotate(${r[4]} ${r[0] + r[2] / 2} ${r[1] + r[3] / 2})"` : "";
    let g = `<g${tf}>`;
    if (d.frame) {
      g += `<rect class="pdFrame" x="${r[0] - 3}" y="${r[1] - 3}" width="${r[2] + 6}" height="${r[3] + 12}"/>`;
    }
    g += `<rect class="pdFill" x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}"/></g>`;
    parts.push(g);
  }
  if (d.boundary) {
    parts.push('<line class="pdBoundary" x1="60" y1="0" x2="60" y2="75"/>');
  }
  return `<svg class="patDiag" viewBox="0 0 ${d.w} 75" style="aspect-ratio:${d.w}/75">${parts.join("")}</svg>`;
}

/* ---------- canvas export (real PNGs) ---------- */

let noiseTile = null;
function getNoiseTile() {
  if (noiseTile) return noiseTile;
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const nctx = c.getContext("2d");
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

let paperTile = null;
function getPaperTile() {
  if (paperTile) return paperTile;
  const c = document.createElement("canvas");
  c.width = c.height = 240;
  const p = c.getContext("2d");
  p.fillStyle = "rgb(128,128,128)";
  p.fillRect(0, 0, 240, 240);
  // short random fibers
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
function boxTransform(c, box, s, fn) {
  c.save();
  c.translate((box.x + box.w / 2) * s, (box.y + box.h / 2) * s);
  if (box.rot) c.rotate(box.rot);
  fn((-box.w / 2) * s, (-box.h / 2) * s, box.w * s, box.h * s);
  c.restore();
}

function drawCover(c, box, i, s) {
  const photo = photoAt(i);
  const img = photo.img;
  const pz = clampPan(box, state.panzoom[i] || { x: 0, y: 0, z: 1 }, photo);
  const base = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight) * pz.z;
  const dw = img.naturalWidth * base;
  const dh = img.naturalHeight * base;

  boxTransform(c, box, s, (bx, by, bw, bh) => {
    c.beginPath();
    c.rect(bx, by, bw, bh);
    c.clip();
    c.drawImage(img,
      bx + ((box.w - dw) / 2 + pz.x) * s,
      by + ((box.h - dh) / 2 + pz.y) * s,
      dw * s, dh * s);
  });
}

function drawPolaroidFrame(c, box, s) {
  const b = 30, bot = 110;
  boxTransform(c, box, s, (bx, by, bw, bh) => {
    c.shadowColor = "rgba(0,0,0,0.28)";
    c.shadowBlur = 26 * s;
    c.shadowOffsetY = 10 * s;
    c.fillStyle = palette().name === "Charcoal" ? "#ECEAE4" : "#FFFFFF";
    c.fillRect(bx - b * s, by - b * s, bw + 2 * b * s, bh + (b + bot) * s);
    c.shadowColor = "transparent";
  });
}

function drawPlaceholder(c, box, s, index) {
  const p = palette();
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
    c.font = `600 ${Math.max(11, 64 * s)}px "Instrument Sans", -apple-system, sans-serif`;
    c.fillText(String(index), 0, -24 * s);
    if (box.w > 220 && box.h > 160) {
      c.font = `400 ${Math.max(8, 30 * s)}px "Instrument Sans", -apple-system, sans-serif`;
      c.fillText("click or drop photo", 0, 40 * s);
    }
  });
}

function drawBlurBg(c, box, i, s) {
  // blurred enlargement of the slot's own photo fills its slide,
  // fading into the shared background at the edges
  const p = palette();
  const T = tpl();
  const sx = box.slide * SLIDE_W;
  const img = photoAt(i).img;

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

  // edge fades keep the strip background continuous
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

function drawStrip(c, s) {
  const T = tpl();
  const p = palette();
  const stripW = T.n * SLIDE_W;
  c.canvas.width = Math.round(stripW * s);
  c.canvas.height = Math.round(T.H * s);

  // background
  if (state.bgStyle === "gradient") {
    const g = c.createLinearGradient(0, 0, stripW * s, T.H * s);
    g.addColorStop(0, shade(p.bg, 0.04));
    g.addColorStop(1, shade(p.bg, -0.06));
    c.fillStyle = g;
  } else if (state.bgStyle === "white") {
    c.fillStyle = "#FFFFFF";
  } else {
    c.fillStyle = p.bg;
  }
  c.fillRect(0, 0, stripW * s, T.H * s);

  if (state.bgStyle === "blurpano") {
    const first = firstPhoto();
    if (first) {
      const img = first.img;
      c.save();
      c.filter = `blur(${Math.max(3, 70 * s)}px)`;
      c.globalAlpha = 0.4;
      const cover = Math.max(stripW / img.naturalWidth, T.H / img.naturalHeight) * 1.1;
      const dw = img.naturalWidth * cover, dh = img.naturalHeight * cover;
      c.drawImage(img,
        ((stripW - dw) / 2) * s, ((T.H - dh) / 2) * s, dw * s, dh * s);
      c.restore();
    }
  }

  // blurred photo backgrounds behind framed slots
  T.boxes.forEach((box, i) => {
    if (box.blurBg && photoAt(i)) drawBlurBg(c, box, i, s);
  });

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
  const bandColor = p.name === "Charcoal" ? "#000000" : "#1B1B1B";
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
    if (box.frame === "polaroid") drawPolaroidFrame(c, box, s);
    if (photoAt(i)) drawCover(c, box, i, s);
    else drawPlaceholder(c, box, s, i + 1);
  });

  // title
  if (state.title.trim()) {
    const x = T.n > 1 ? SLIDE_W : SLIDE_W / 2;
    const size = 120 * (T.H / 1350);
    c.save();
    c.font = `600 ${size * s}px Georgia, "Times New Roman", serif`;
    if ("letterSpacing" in c) c.letterSpacing = `${6 * s}px`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.shadowColor = "rgba(0,0,0,0.25)";
    c.shadowBlur = 14 * s;
    c.fillStyle = p.text;
    c.fillText(state.title.toUpperCase(), x * s, Math.max(size, T.H * 0.14) * s);
    c.restore();
  }

  // texture overlay
  if (state.texture === "grain" || state.texture === "paper") {
    c.save();
    c.globalAlpha = state.texture === "grain"
      ? (p.name === "Charcoal" ? 0.08 : 0.05)
      : (p.name === "Charcoal" ? 0.12 : 0.09);
    c.globalCompositeOperation = "overlay";
    c.fillStyle = c.createPattern(
      state.texture === "grain" ? getNoiseTile() : getPaperTile(), "repeat");
    c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    c.restore();
  }
}

async function exportSlides() {
  const T = tpl();
  const full = document.createElement("canvas");
  drawStrip(full.getContext("2d"), 1);

  for (let i = 0; i < T.n; i++) {
    const slice = document.createElement("canvas");
    slice.width = SLIDE_W;
    slice.height = T.H;
    slice.getContext("2d").drawImage(
      full, i * SLIDE_W, 0, SLIDE_W, T.H, 0, 0, SLIDE_W, T.H);

    const blob = await new Promise(res => slice.toBlob(res, "image/png"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `slide_${String(i + 1).padStart(2, "0")}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
    await new Promise(r => setTimeout(r, 350));
  }
}

/* ---------- export modal ---------- */

function openExportModal() {
  const T = tpl();
  const s = Math.min(0.085, 380 / (T.H * 4));
  const slideW = SLIDE_W * s;

  const overlay = div("modalOverlay");
  const modal = div("modal");
  overlay.appendChild(modal);

  const head = document.createElement("header");
  head.className = "modalHead";
  head.innerHTML =
    `<div><h2>Export ${T.n} posts</h2>` +
    `<p>The strip is sliced at each boundary into ${T.n} PNGs, ` +
    `1080 × ${T.H} px — upload them in order as one carousel.</p></div>`;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "iconBtn";
  closeBtn.innerHTML = Ic.close;
  head.appendChild(closeBtn);

  const row = div("exportRow");
  for (let i = 0; i < T.n; i++) {
    const slide = div("exportSlide");
    const clip = div("exportClip");
    clip.style.width = slideW + "px";
    clip.style.height = T.H * s + "px";
    const inner = div("");
    inner.style.transform = `translateX(${-i * slideW}px)`;
    const strip = createStrip(false);
    strip.sync(s);
    inner.appendChild(strip.root);
    clip.appendChild(inner);
    const label = document.createElement("span");
    label.textContent = `slide_${String(i + 1).padStart(2, "0")}.png`;
    slide.append(clip, label);
    row.appendChild(slide);
  }

  const foot = document.createElement("footer");
  foot.className = "modalFoot";
  const note = document.createElement("span");
  note.className = "protoNote";
  note.textContent = "Each slide downloads as its own PNG — allow multiple downloads if your browser asks";
  const dlBtn = document.createElement("button");
  dlBtn.type = "button";
  dlBtn.className = "btn primary";
  dlBtn.innerHTML = Ic.download + `<span>Download ${T.n} PNGs</span>`;
  foot.append(note, dlBtn);

  modal.append(head, row, foot);
  $("modalRoot").appendChild(overlay);

  const close = () => overlay.remove();
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  dlBtn.addEventListener("click", async () => {
    dlBtn.disabled = true;
    dlBtn.innerHTML = Ic.download + "<span>Exporting…</span>";
    await exportSlides();
    close();
    showToast(`${T.n} PNGs downloaded — upload them in order as one carousel`);
  });
}

/* ---------- settings persistence ---------- */

const STORE_KEY = "seamless_settings";
const THEME_KEY = "seamless_theme";

function saveSettings() {
  localStorage.setItem(STORE_KEY, JSON.stringify({
    enabled: state.enabled,
    bgStyle: state.bgStyle,
    texture: state.texture,
    title: state.title,
  }));
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!saved) return;
    Object.assign(state.enabled, saved.enabled || {});
    if (saved.bgStyle) state.bgStyle = saved.bgStyle;
    if (saved.texture) state.texture = saved.texture;
    if (typeof saved.title === "string") state.title = saved.title;
  } catch { /* corrupted storage: keep defaults */ }
  const theme = localStorage.getItem(THEME_KEY);
  if (theme === "light" || theme === "dark") state.theme = theme;
}

/* ---------- UI construction ---------- */

function buildSeg(host, options, getValue, onPick) {
  for (const o of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "segBtn";
    b.dataset.value = o.value;
    if (o.title) b.title = o.title;
    b.innerHTML = (o.icon || "") + (o.label ? `<span>${o.label}</span>` : "");
    b.addEventListener("click", () => onPick(o.value));
    host.appendChild(b);
  }
}

function togglePattern(k) {
  state.enabled[k] = state.enabled[k] === false;
  saveSettings();
  regenerate();
}

function buildPatternTiles() {
  const hosts = {
    single: $("patSingles"),
    multi: $("patMultis"),
    decor: $("patDecor"),
  };
  for (const k of ALL_KEYS) {
    const host = DECOR_KEYS.includes(k) ? hosts.decor
      : PATTERNS[k].span > 1 ? hosts.multi : hosts.single;
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "patTile on" + (pdRects(k).w > 60 ? " wide" : "");
    tile.dataset.pat = k;
    tile.title = PATTERN_INFO[k].desc;
    tile.innerHTML = patternDiagramSVG(k) +
      `<span class="patLabel">${PATTERN_INFO[k].label}</span>`;
    tile.addEventListener("click", () => togglePattern(k));
    host.appendChild(tile);
    patTiles[k] = tile;
  }
}

function buildUI() {
  // header icons
  $("stepMinus").innerHTML = Ic.minus;
  $("stepPlus").innerHTML = Ic.plus;
  $("undoBtn").innerHTML = Ic.undo;
  $("historyBtn").innerHTML =
    Ic.history + '<span>History</span><em class="countBadge" id="histBadge" hidden></em>';
  $("addPhotosBtn").innerHTML = Ic.photos + "<span>Add photos</span>";
  $("regenBtn").innerHTML = Ic.refresh + "<span>Regenerate</span>";
  $("exportBtn").innerHTML = Ic.download + "<span>Export</span>";
  $("patternsBtn").insertAdjacentHTML("beforeend", Ic.chevron);

  buildSeg($("ratioSeg"),
    RATIOS.map(r => ({ value: r.h, label: r.label, title: `${r.name} — 1080×${r.h}` })),
    () => state.H,
    (v) => { state.H = +v; regenerate(); });

  buildSeg($("viewSeg"), [
    { value: "strip", label: "Strip", icon: Ic.strip, title: "One continuous canvas — edit here" },
    { value: "posts", label: "Posts", icon: Ic.posts, title: "Pulled apart — exactly how the carousel reads in the feed" },
  ], () => state.viewMode,
    (v) => { state.viewMode = v; syncAll(); });

  buildSeg($("bgSeg"), [
    { value: "white", label: "White", title: "Pure white background" },
    { value: "flat", label: "Palette", title: "Follow the selected palette background" },
    { value: "gradient", label: "Gradient" },
    { value: "blurpano", label: "Photo blur", title: "Blurred 1st photo behind everything" },
  ], () => state.bgStyle,
    (v) => { state.bgStyle = v; saveSettings(); syncAll(); });

  buildSeg($("texSeg"), [
    { value: "none", label: "None" },
    { value: "grain", label: "Grain" },
    { value: "paper", label: "Paper" },
  ], () => state.texture,
    (v) => { state.texture = v; saveSettings(); syncAll(); });

  buildPatternTiles();

  $("stepMinus").addEventListener("click", () => {
    if (state.n > 2) { state.n--; regenerate(); }
  });
  $("stepPlus").addEventListener("click", () => {
    if (state.n < 10) { state.n++; regenerate(); }
  });

  $("patternsBtn").addEventListener("click", () => {
    state.panelOpen = !state.panelOpen;
    $("patternPanel").classList.toggle("open", state.panelOpen);
    $("patternsBtn").classList.toggle("open", state.panelOpen);
  });

  $("regenBtn").addEventListener("click", () => regenerate());
  $("undoBtn").addEventListener("click", undo);
  $("exportBtn").addEventListener("click", openExportModal);
  $("addPhotosBtn").addEventListener("click", () => {
    pendingSlot = null;
    picker.click();
  });
  $("themeBtn").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, state.theme);
    syncHeader();
  });

  $("titleText").addEventListener("input", (e) => {
    state.title = e.target.value;
    saveSettings();
    syncStage();
  });
  $("titleText").value = state.title;

  attachPopover($("paletteBtn"), "palettePop", (pop, close) => {
    PALETTES.forEach((pal, i) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "palRow" + (i === state.paletteIdx ? " on" : "");
      row.innerHTML =
        `<span class="swDots big">${[pal.bg, pal.ph, pal.ink, pal.text]
          .map(c => `<i style="background:${c}"></i>`).join("")}</span>` +
        `<span>${pal.name}</span>`;
      row.addEventListener("click", () => {
        state.paletteIdx = i;
        close();
        syncAll();
      });
      pop.appendChild(row);
    });
  });

  attachPopover($("historyBtn"), "historyPop", (pop, close) => {
    pop.innerHTML =
      "<header>Generated templates <small>newest first — click to restore</small></header>";
    const grid = div("histGrid");
    state.history.map((t, i) => ({ t, i })).reverse().forEach(({ t, i }) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "histItem" + (i === state.cursor ? " on" : "");
      item.innerHTML = tplThumbSVG(t, 132) +
        `<span>${i === state.cursor ? "Current" : "#" + (i + 1)}</span>`;
      item.addEventListener("click", () => {
        jumpTo(i);
        close();
      });
      grid.appendChild(item);
    });
    pop.appendChild(grid);
  });

  // gesture cheat-sheet
  const gestures = [
    { k: "Click", v: "add photo to an empty slot" },
    { k: "Drag", v: "reposition inside the frame" },
    { k: "Scroll", v: "zoom in / out" },
    { k: "Double-click", v: "replace photo" },
    { k: "⌥ Click", v: "remove photo" },
  ];
  $("gestures").innerHTML = gestures.map(g =>
    `<span class="gesture"><kbd>${g.k}</kbd><span>${g.v}</span></span>`).join("");
  $("dropHint").innerHTML =
    Ic.photos + "<span>Drop images anywhere to fill empty slots in order</span>";

  // stage-level drag & drop bulk fill
  const wrap = $("stageWrap");
  wrap.addEventListener("dragover", (e) => e.preventDefault());
  wrap.addEventListener("drop", (e) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith("image/"));
    if (files.length) fillEmpty(files);
  });

  // undo: ⌘Z / Ctrl+Z
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
    }
  });

  new ResizeObserver(() => {
    if (tpl()) syncStage();
  }).observe(wrap);
}

/* ---------- startup ---------- */

loadSettings();

// URL params: ?n=6&h=566 (h = slide height per the ratio options)
// ?only=polaroid,filmstrip restricts the layout pool (testing/sharing)
const params = new URLSearchParams(location.search);
if (params.has("n")) {
  state.n = Math.max(2, Math.min(10, +params.get("n") || 5));
}
if (params.has("h")) {
  const h = +params.get("h");
  if (RATIOS.some(r => r.h === h)) state.H = h;
}
if (params.has("only")) {
  const only = params.get("only").split(",");
  for (const k of Object.keys(PATTERNS)) state.enabled[k] = only.includes(k);
}

buildUI();
state.history = [generateTemplate(state.n, state.H, state.enabled)];
state.cursor = 0;
syncAll();

// optional: open index.html?demo to preview with the reference photos
if (params.has("demo")) {
  [1, 2, 3, 4, 5, 6].forEach((k, idx) => {
    loadEntry(`images/Untitled-1_0${k}.jpg`).then(entry => {
      if (entry && !state.photos[idx]) {
        state.photos[idx] = entry;
        syncAll();
      }
    });
  });
}

// entrance animation arms only after first paint
requestAnimationFrame(() => requestAnimationFrame(() => {
  $("app").classList.add("ready");
}));
