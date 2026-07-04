/* strip.tsx — DOM renderer for the carousel strip.
   Photo slots are absolutely-positioned divs keyed by slot index, so
   regenerating a template lets CSS morph each slot to its new geometry.
   The strip is rendered once per slide "window" (clipped + offset copy),
   which lets the strip pull apart into individual posts with a pure CSS
   transition — the seamless concept, demonstrated by the UI itself. */

import React from "react";
import { SLIDE_W, PATTERN_INFO, rgba, shade, luminance, rotCover, fontStack } from "./core";
import type { Box, Palette, Panzoom, StripApi, TextBlock } from "./types";

const GRAIN_URI = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")";
const PAPER_URI = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04 0.09' numOctaves='3'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23p)'/%3E%3C/svg%3E\")";

/* natural-size cache for pan clamping (shared across all strip copies) */
export const natCache: Record<string, { w: number; h: number }> = {};

export function clampPan(box: Box, pz: Panzoom, src: string | null): Panzoom {
  const nat = src ? natCache[src] : null;
  if (!nat) return pz;
  const base = Math.max(box.w / nat.w, box.h / nat.h) * pz.z * rotCover(box.w, box.h, pz.r || 0);
  const maxX = Math.max(0, (nat.w * base - box.w) / 2);
  const maxY = Math.max(0, (nat.h * base - box.h) / 2);
  return {
    ...pz,
    x: Math.max(-maxX, Math.min(maxX, pz.x)),
    y: Math.max(-maxY, Math.min(maxY, pz.y)),
  };
}

/* ---------- single photo slot ---------- */

function PhotoBox({ box, index, s, palette, api, selected }: {
  box: Box; index: number; s: number; palette: Palette; api: StripApi; selected: boolean;
}) {
  const src = api.photos[index] || null;
  const pzRaw = api.panzoom[index] || { x: 0, y: 0, z: 1, r: 0 };
  const pz = src ? clampPan(box, pzRaw, src) : pzRaw;
  const ref = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<any>(null);
  const [over, setOver] = React.useState(false);
  const [, force] = React.useState(0);

  // non-passive wheel for zoom
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !api.interactive) return undefined;
    const onWheel = (e: WheelEvent) => {
      if (!api.photos[index]) return;
      e.preventDefault();
      api.onZoom?.(index, 1 - e.deltaY * 0.0015);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [index, api.interactive, api.photos[index]]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!api.interactive || e.button !== 0) return;
    if (e.altKey) return; // handled in click
    if (e.shiftKey && src) {
      // swap gesture — resolved on pointer-up over the target slot
      drag.current = { swap: true, moved: false, x: e.clientX, y: e.clientY };
    } else if (e.metaKey || e.ctrlKey || !src) {
      // move the box itself (empty slots always move; ⌘ forces it on filled)
      drag.current = { boxEdit: true, move: true, x: e.clientX, y: e.clientY, moved: false };
      api.onSelect?.(index);
    } else if (api.rotateMode) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      drag.current = { rot: true, cx, cy, ang: Math.atan2(e.clientY - cy, e.clientX - cx), moved: false };
    } else {
      drag.current = { x: e.clientX, y: e.clientY, moved: false };
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const startResize = (corner: string) => (e: React.PointerEvent) => {
    if (!api.interactive || e.button !== 0) return;
    e.stopPropagation();
    drag.current = { boxEdit: true, resize: corner, x: e.clientX, y: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    if (drag.current.rot) {
      const a = Math.atan2(e.clientY - drag.current.cy, e.clientX - drag.current.cx);
      let d = a - drag.current.ang;
      if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
      drag.current.ang = a;
      drag.current.moved = true;
      api.onRotate?.(index, d * 180 / Math.PI, box);
      return;
    }
    let dx = (e.clientX - drag.current.x) / s;
    let dy = (e.clientY - drag.current.y) / s;
    if (drag.current.swap) {
      if (Math.abs(dx) + Math.abs(dy) > 0) drag.current.moved = true;
      return;
    }
    if (drag.current.boxEdit) {
      if (Math.abs(dx) + Math.abs(dy) > 0) drag.current.moved = true;
      drag.current.x = e.clientX;
      drag.current.y = e.clientY;
      if (drag.current.resize) api.onBoxResize?.(index, drag.current.resize, dx, dy);
      else api.onBoxMove?.(index, dx, dy);
      return;
    }
    if (box.rot) {
      const co = Math.cos(-box.rot), si = Math.sin(-box.rot);
      [dx, dy] = [dx * co - dy * si, dx * si + dy * co];
    }
    if (Math.abs(dx) + Math.abs(dy) > 0) drag.current.moved = true;
    drag.current.x = e.clientX;
    drag.current.y = e.clientY;
    api.onPan?.(index, dx, dy, box);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d && d.moved) {
      if (d.swap) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const target = el?.closest?.(".photoBox[data-idx]") as HTMLElement | null;
        const j = target ? Number(target.dataset.idx) : NaN;
        if (Number.isInteger(j) && j !== index) api.onSwap?.(index, j);
      } else if (d.boxEdit) {
        api.onBoxEditEnd?.(index);
      }
    }
    setTimeout(() => { drag.current = null; }, 0);
  };

  const onClick = (e: React.MouseEvent) => {
    if (!api.interactive) return;
    if (drag.current && drag.current.moved) return;
    if (e.altKey) { if (src) api.onRemove?.(index); return; }
    api.onSelect?.(index);
  };
  const onDoubleClick = () => { if (api.interactive) api.onSlotClick?.(index); };

  const onDragOver = (e: React.DragEvent) => {
    if (!api.interactive) return;
    e.preventDefault(); e.stopPropagation(); setOver(true);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!api.interactive) return;
    e.preventDefault(); e.stopPropagation(); setOver(false);
    const file = [...e.dataTransfer.files].find(f => f.type.startsWith("image/"));
    if (file) api.onDropFile?.(index, file);
  };

  const style: React.CSSProperties = {
    left: box.x * s, top: box.y * s,
    width: box.w * s, height: box.h * s,
    transform: box.rot ? `rotate(${box.rot}rad)` : undefined,
    cursor: src ? "grab" : "pointer",
  };

  const small = box.w * s < 90 || box.h * s < 70;

  // Render image at its cover size (overflowing the box) so panning reveals
  // other parts of the photo rather than the background. clampPan uses the same
  // cover math. Before natural size is known, fall back to CSS object-fit cover.
  const nat = src ? natCache[src] : null;
  const rot = pz.r || 0;
  const tf = `translate(${pz.x * s}px, ${pz.y * s}px) scale(${pz.z}) rotate(${rot}deg)`;
  let imgStyle: React.CSSProperties;
  if (nat) {
    const cover = Math.max(box.w / nat.w, box.h / nat.h) * rotCover(box.w, box.h, rot);
    const iw = nat.w * cover * s, ih = nat.h * cover * s;
    imgStyle = {
      position: "absolute",
      width: iw, height: ih,
      left: (box.w * s - iw) / 2, top: (box.h * s - ih) / 2,
      transform: tf,
    };
  } else {
    imgStyle = { transform: tf };
  }

  return (
    <div ref={ref} data-idx={index}
      className={"photoBox" + (over ? " dropOver" : "") + (selected ? " selected" : "")} style={style}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp} onClick={onClick} onDoubleClick={onDoubleClick}
      onDragOver={onDragOver} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      {box.frame === "polaroid" && (
        <div className="polaroidFrame" style={{
          left: -30 * s, top: -30 * s, right: -30 * s, bottom: -110 * s,
          background: luminance(palette.bg) < 0.5 ? "#ECEAE4" : "#FFFFFF",
          boxShadow: `0 ${10 * s}px ${26 * s}px rgba(0,0,0,0.28)`,
        }}></div>
      )}
      <div className="photoClip">
        {src ? (
          <img src={src} alt="" draggable={false}
            onLoad={(e) => {
              const img = e.target as HTMLImageElement;
              const known = !!natCache[src];
              natCache[src] = { w: img.naturalWidth, h: img.naturalHeight };
              if (!known) force(v => v + 1);
            }}
            style={imgStyle} />
        ) : (
          <div className="placeholder" style={{
            background: palette.ph, color: rgba(palette.ink, 0.9),
          }}>
            <div className="phDash" style={{ borderColor: rgba(palette.ink, 0.5) }}></div>
            <span className="phNum" style={{ fontSize: Math.max(11, 64 * s) }}>{index + 1}</span>
            {!small && <span className="phHint" style={{ fontSize: Math.max(9, 30 * s) }}>click or drop photo</span>}
          </div>
        )}
      </div>
      {over && <div className="dropRing"></div>}
      {selected && api.interactive && (
        <div className="selRing">
          {(["tl", "tr", "bl", "br"] as const).map(c => (
            <i key={c} className={"selH " + c}
              onPointerDown={startResize(c)} onPointerMove={onPointerMove} onPointerUp={onPointerUp}></i>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- a free text block ---------- */

function TextItem({ t, s, vs, palette, api }: {
  t: TextBlock; s: number; vs: number; palette: Palette; api: StripApi;
}) {
  const drag = React.useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [editing, setEditing] = React.useState(false);
  const editRef = React.useRef<HTMLDivElement>(null);
  const selected = !!api.interactive && api.selText === t.id;

  React.useEffect(() => {
    if (!editing) return;
    const el = editRef.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing]);

  const commit = () => {
    const el = editRef.current;
    if (el) api.onTextEdit?.(t.id, el.innerText.replace(/\n$/, ""));
    setEditing(false);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!api.interactive || e.button !== 0 || editing) { if (editing) e.stopPropagation(); return; }
    e.stopPropagation();
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = (e.clientX - drag.current.x) / s;
    const dy = (e.clientY - drag.current.y) / s;
    if (Math.abs(dx) + Math.abs(dy) > 0) drag.current.moved = true;
    drag.current.x = e.clientX;
    drag.current.y = e.clientY;
    api.onTextMove?.(t.id, dx, dy);
  };
  const onPointerUp = () => { setTimeout(() => { drag.current = null; }, 0); };
  const onClick = (e: React.MouseEvent) => {
    if (!api.interactive) return;
    e.stopPropagation();
    if (drag.current && drag.current.moved) return;
    api.onTextSelect?.(t.id);
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    if (!api.interactive || editing) return;
    e.stopPropagation();
    api.onTextSelect?.(t.id);
    setEditing(true);
  };

  const anchorX = t.align === "center" ? "-50%" : t.align === "right" ? "-100%" : "0";
  const style: React.CSSProperties = {
    position: "absolute",
    left: t.x * s, top: t.y * s,
    transform: `translate(${anchorX}, -50%)`,
    fontFamily: fontStack(t.font),
    fontWeight: t.weight,
    fontStyle: t.italic ? "italic" : "normal",
    fontSize: t.size * vs * s,
    letterSpacing: t.letterSpacing * vs * s,
    textAlign: t.align,
    // while editing, show the raw text — innerText would otherwise return the
    // CSS-uppercased string on commit and destroy the original casing
    textTransform: t.upper && !editing ? "uppercase" : "none",
    color: t.color === "auto" ? palette.text : t.color,
    whiteSpace: "pre",
    lineHeight: 1.1,
    zIndex: 20,
    textShadow: "0 2px 14px rgba(0,0,0,0.22)",
    cursor: editing ? "text" : api.interactive ? "move" : "default",
    pointerEvents: api.interactive ? "auto" : "none",
    userSelect: editing ? "text" : "none",
  };

  return (
    <div ref={editRef}
      className={"textBlock" + (selected ? " selected" : "") + (editing ? " editing" : "")}
      style={style}
      contentEditable={editing} suppressContentEditableWarning
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp} onClick={onClick} onDoubleClick={onDoubleClick}
      onBlur={editing ? commit : undefined}
      onKeyDown={editing ? (e) => {
        e.stopPropagation();
        if (e.key === "Escape") { e.preventDefault(); commit(); }
      } : undefined}>
      {t.text}
    </div>
  );
}

/* ---------- full strip content (one copy per slide window) ---------- */

export function StripContent({ tpl, palette, bgStyle, texture, texts, s, api, selected }: any) {
  const stripW = tpl.n * SLIDE_W * s;
  const H = tpl.H * s;
  const p: Palette = palette;
  const firstSrc = api.photos.find(Boolean) || null;
  const vs = tpl.H / 1350;

  let bg = p.bg;
  if (bgStyle === "gradient") {
    bg = `linear-gradient(135deg, ${shade(p.bg, 0.04)}, ${shade(p.bg, -0.06)})`;
  }
  const darkBg = luminance(p.bg) < 0.5;
  const bandColor = darkBg ? "#000000" : "#1B1B1B";

  return (
    <div className="stripContent" style={{ width: stripW, height: H, background: bg }}>

      {bgStyle === "blurpano" && firstSrc && (
        <div className="panoBlur">
          <img src={firstSrc} alt="" draggable={false}
            style={{ filter: `blur(${Math.max(3, 70 * s)}px)` }} />
        </div>
      )}

      {/* blurred photo backdrops behind framed slots (blur bg style only) */}
      {bgStyle === "blurpano" && tpl.boxes.map((b: Box, i: number) => (b.blurBg && api.photos[i]) ? (
        <div key={"bb" + i} className="blurBgSlide" style={{
          left: b.slide * SLIDE_W * s, width: SLIDE_W * s, height: H,
        }}>
          <img src={api.photos[i]} alt="" draggable={false}
            style={{ filter: `blur(${Math.max(2, 50 * s)}px)` }} />
        </div>
      ) : null)}

      {/* decor */}
      {tpl.decor.map((d: any, i: number) => d.kind === "ribbon" ? (
        <div key={"d" + i} className="decorRibbon" style={{
          top: d.y * s, height: Math.max(1, d.h * s), background: rgba(p.ink, 0.45),
        }}></div>
      ) : (
        <div key={"d" + i} className="decorCircle" style={{
          left: (d.cx - d.r) * s, top: (d.cy - d.r) * s,
          width: d.r * 2 * s, height: d.r * 2 * s,
          border: d.stroke ? `${Math.max(1, 4 * s)}px solid ${rgba(p.ink, 0.4)}` : "none",
          background: d.stroke ? "transparent" : rgba(p.ink, 0.16),
        }}></div>
      ))}

      {/* filmstrip bands */}
      {tpl.bands.map((band: any, i: number) => {
        const holes: number[] = [];
        const step = 62, holeW = 30;
        for (let hx = band.x + 20; hx + holeW < band.x + band.w; hx += step) holes.push(hx);
        return (
          <div key={"band" + i} className="filmBand" style={{
            left: band.x * s, top: band.y * s,
            width: band.w * s, height: band.h * s, background: bandColor,
          }}>
            {[14, band.h - 14 - 18].map((hy, r) => (
              <div key={r}>
                {holes.map((hx, k) => (
                  <div key={k} className="sprocket" style={{
                    left: (hx - band.x) * s, top: hy * s,
                    width: holeW * s, height: 18 * s,
                    borderRadius: 4 * s, background: p.bg,
                  }}></div>
                ))}
              </div>
            ))}
          </div>
        );
      })}

      {/* photo slots */}
      {tpl.boxes.map((b: Box, i: number) => (
        <PhotoBox key={i} box={b} index={i} s={s} palette={p} api={api}
          selected={selected === i} />
      ))}

      {/* text blocks */}
      {(texts || []).map((t: TextBlock) => (
        <TextItem key={t.id} t={t} s={s} vs={vs} palette={p} api={api} />
      ))}

      {/* texture */}
      {texture !== "none" && (
        <div className="textureOverlay" style={{
          backgroundImage: texture === "grain" ? GRAIN_URI : PAPER_URI,
          opacity: texture === "grain"
            ? (darkBg ? 0.10 : 0.06)
            : (darkBg ? 0.14 : 0.10),
        }}></div>
      )}
    </div>
  );
}

/* ---------- strip stage: slide windows that pull apart ---------- */

export function StripStage({ tpl, palette, bgStyle, texture, texts, viewMode, showGuides, api, onStageDrop, zoom = 1, selected, onClearSelect }: any) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [avail, setAvail] = React.useState({ w: 1200, h: 600 });

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      setAvail({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const posts = viewMode === "posts";
  const captionH = 34;
  const fit = Math.min((avail.h - 24 - (posts ? captionH : 0)) / tpl.H, 0.55);
  const s = fit * zoom;
  const slideW = SLIDE_W * s;
  const gap = posts ? Math.max(20, slideW * 0.07) : 0;
  const totalW = tpl.n * slideW + (tpl.n - 1) * gap;

  const slides: number[] = [];
  for (let i = 0; i < tpl.n; i++) slides.push(i);

  return (
    <div ref={wrapRef} className="stageWrap"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onStageDrop(e); }}>
      <div className="stageScroll"
        onPointerDown={(e) => {
          const el = e.target as HTMLElement;
          if (onClearSelect && !el.closest(".photoBox") && !el.closest(".textBlock")) onClearSelect();
        }}>
        <div className={"stage" + (posts ? " postsMode" : "")}
          style={{ width: totalW, height: tpl.H * s + (posts ? captionH : 0) }}>
          {slides.map(i => (
            <div key={i} data-screen-label={"Post " + (i + 1)}
              className={"slideWin" + (posts ? " asPost" : "")}
              style={{ left: i * (slideW + gap), width: slideW, height: tpl.H * s }}>
              <div className="slideInner" style={{ transform: `translateX(${-i * slideW}px)` }}>
                <StripContent tpl={tpl} palette={palette} bgStyle={bgStyle}
                  texture={texture} texts={texts} s={s} api={api} selected={selected} />
              </div>
              {showGuides && !posts && i > 0 && <div className="boundaryGuide"></div>}
              <div className="slideChip">{i + 1}</div>
              <div className="postCaption" style={{ top: tpl.H * s + 8 }}>
                <b>Post {i + 1}</b><span> · {PATTERN_INFO[tpl.layoutAt[i]] ? PATTERN_INFO[tpl.layoutAt[i]].label.toLowerCase() : ""}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- mini diagram (export thumbnails) ---------- */

export function TemplateThumb({ tpl, palette, width }: any) {
  const w = tpl.n * SLIDE_W, h = tpl.H;
  const p: Palette = palette;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={width} height={width * h / w}
      style={{ display: "block", borderRadius: 3 }}>
      <rect width={w} height={h} fill={p.bg}></rect>
      {tpl.decor.map((d: any, i: number) => d.kind === "ribbon"
        ? <rect key={i} y={d.y} width={w} height={d.h} fill={rgba(p.ink, 0.4)}></rect>
        : <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={d.stroke ? "none" : rgba(p.ink, 0.16)}
            stroke={d.stroke ? rgba(p.ink, 0.4) : "none"} strokeWidth="6"></circle>)}
      {tpl.bands.map((b: any, i: number) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="#1B1B1B"></rect>
      ))}
      {tpl.boxes.map((b: Box, i: number) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={p.ph}
          stroke={rgba(p.ink, 0.55)} strokeWidth={Math.max(4, h / 130)}
          transform={b.rot ? `rotate(${b.rot * 57.3} ${b.x + b.w / 2} ${b.y + b.h / 2})` : undefined}></rect>
      ))}
      {Array.from({ length: tpl.n - 1 }, (_, i) => (
        <line key={i} x1={(i + 1) * SLIDE_W} y1="0" x2={(i + 1) * SLIDE_W} y2={h}
          stroke={rgba(p.ink, 0.7)} strokeWidth={h / 160} strokeDasharray="22 22"></line>
      ))}
    </svg>
  );
}
