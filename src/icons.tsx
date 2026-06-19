/* icons.tsx — icon set + generic editor controls + pattern diagrams.
   Figma-flavoured chrome: precise, neutral, tactile. */

import React from "react";
import { PATTERN_INFO, PALETTES } from "./core";

const S = (p: Record<string, unknown> = {}) => ({
  fill: "none", stroke: "currentColor", strokeWidth: 1.5,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, ...p,
});

export const Ic: Record<string, React.ReactElement> = {
  cursor: <svg viewBox="0 0 18 18" width="16" height="16"><path {...S()} d="M4 3l5.6 13 2-5.4 5.4-2L4 3z"></path></svg>,
  layouts: <svg viewBox="0 0 18 18" width="16" height="16"><rect {...S()} x="2.5" y="2.5" width="13" height="13" rx="1.5"></rect><path {...S()} d="M9 2.5v13M2.5 9h6"></path></svg>,
  image: <svg viewBox="0 0 18 18" width="16" height="16"><rect {...S()} x="2.5" y="3.5" width="13" height="11" rx="1.5"></rect><circle cx="6.4" cy="7.2" r="1.2" fill="currentColor"></circle><path {...S()} d="M3.5 13l3.7-3.4 2.3 2 2.3-2L15 12.3"></path></svg>,
  text: <svg viewBox="0 0 18 18" width="16" height="16"><path {...S()} d="M4 4.5h10M9 4.5v9M6.5 13.5h5"></path></svg>,
  swatch: <svg viewBox="0 0 18 18" width="16" height="16"><circle {...S()} cx="9" cy="9" r="6.5"></circle><circle cx="7" cy="6.6" r="1.1" fill="currentColor"></circle><circle cx="11.4" cy="7.4" r="1.1" fill="currentColor"></circle><circle cx="11" cy="11.4" r="1.1" fill="currentColor"></circle></svg>,
  adjust: <svg viewBox="0 0 18 18" width="16" height="16"><path {...S()} d="M3 5.5h7M14.5 5.5h.5M3 12.5h.5M8 12.5h7"></path><circle {...S()} cx="12" cy="5.5" r="2"></circle><circle {...S()} cx="6" cy="12.5" r="2"></circle></svg>,
  crop: <svg viewBox="0 0 18 18" width="16" height="16"><path {...S()} d="M5 1.5v11.5h11.5M1.5 5H13v11.5"></path></svg>,
  shuffle: <svg viewBox="0 0 18 18" width="15" height="15"><path {...S()} d="M2.5 5h2.2l2.1 2.7M2.5 13h2.2l8.3-10.6M15.5 2.4l1 1.1-1 1.1M2.5 13h2.2l2.1-2.7M15.5 12.4l1 1.1-1 1.1M11 13h2.3l1.6-2"></path></svg>,
  undo: <svg viewBox="0 0 18 18" width="15" height="15"><path {...S()} d="M7 4 3.5 7.5 7 11M3.5 7.5H11a4 4 0 0 1 0 8H8"></path></svg>,
  redo: <svg viewBox="0 0 18 18" width="15" height="15"><path {...S()} d="M11 4l3.5 3.5L11 11M14.5 7.5H7a4 4 0 0 0 0 8h3"></path></svg>,
  zoomIn: <svg viewBox="0 0 18 18" width="15" height="15"><path {...S()} d="M8 5v6M5 8h6"></path></svg>,
  zoomOut: <svg viewBox="0 0 18 18" width="15" height="15"><path {...S()} d="M5 8h6"></path></svg>,
  fit: <svg viewBox="0 0 18 18" width="15" height="15"><path {...S()} d="M3 6.5V3.5H6M12 3.5h3v3M15 11.5v3h-3M6 14.5H3v-3"></path></svg>,
  sun: <svg viewBox="0 0 18 18" width="16" height="16"><circle {...S()} cx="9" cy="9" r="3.2"></circle><path {...S()} d="M9 1.8v1.8M9 14.4v1.8M1.8 9h1.8M14.4 9h1.8M3.8 3.8l1.3 1.3M12.9 12.9l1.3 1.3M14.2 3.8l-1.3 1.3M5.1 12.9l-1.3 1.3"></path></svg>,
  moon: <svg viewBox="0 0 18 18" width="16" height="16"><path {...S()} d="M14.5 10.5A6 6 0 0 1 7.5 3.5 6 6 0 1 0 14.5 10.5Z"></path></svg>,
  chevron: <svg viewBox="0 0 16 16" width="13" height="13"><path {...S()} d="m4 6 4 4 4-4"></path></svg>,
  chevronR: <svg viewBox="0 0 16 16" width="13" height="13"><path {...S()} d="m6 4 4 4-4 4"></path></svg>,
  close: <svg viewBox="0 0 16 16" width="15" height="15"><path {...S()} d="m4 4 8 8m0-8-8 8"></path></svg>,
  plus: <svg viewBox="0 0 16 16" width="14" height="14"><path {...S()} d="M8 3v10M3 8h10"></path></svg>,
  minus: <svg viewBox="0 0 16 16" width="14" height="14"><path {...S()} d="M3 8h10"></path></svg>,
  strip: <svg viewBox="0 0 20 14" width="17" height="13"><rect {...S({ strokeWidth: 1.4 })} x="1.5" y="2.5" width="17" height="9" rx="1.5"></rect><path {...S({ strokeWidth: 1, strokeDasharray: "2 1.8" })} d="M7.3 2.5v9M12.7 2.5v9"></path></svg>,
  posts: <svg viewBox="0 0 20 14" width="17" height="13"><rect {...S({ strokeWidth: 1.4 })} x="1.5" y="2.5" width="4.6" height="9" rx="1"></rect><rect {...S({ strokeWidth: 1.4 })} x="7.7" y="2.5" width="4.6" height="9" rx="1"></rect><rect {...S({ strokeWidth: 1.4 })} x="13.9" y="2.5" width="4.6" height="9" rx="1"></rect></svg>,
  download: <svg viewBox="0 0 18 18" width="15" height="15"><path {...S()} d="M9 2.5v8m0 0 3.2-3.2M9 10.5 5.8 7.3M3.5 14.5h11"></path></svg>,
  trash: <svg viewBox="0 0 18 18" width="15" height="15"><path {...S()} d="M4 4.5h10M7 4.5V3h4v1.5M5.5 4.5l.6 9.5a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-9.5"></path></svg>,
  swap: <svg viewBox="0 0 18 18" width="15" height="15"><path {...S()} d="M3 6.5h9l-2-2M15 11.5H6l2 2"></path></svg>,
  photos: <svg viewBox="0 0 18 18" width="15" height="15"><rect {...S({ strokeWidth: 1.4 })} x="2.5" y="3.5" width="13" height="11" rx="1.5"></rect><circle cx="6.4" cy="7.2" r="1.2" fill="currentColor"></circle><path {...S({ strokeWidth: 1.3 })} d="M3.5 13l3.7-3.4 2.3 2 2.3-2L15 12.3"></path></svg>,
  fitFill: <svg viewBox="0 0 18 18" width="15" height="15"><rect {...S()} x="2.5" y="4" width="13" height="10" rx="1"></rect><rect {...S({ strokeWidth: 1 })} x="5.5" y="6.5" width="7" height="5" rx="0.5"></rect></svg>,
  link: <svg viewBox="0 0 18 14" width="15" height="12"><path {...S()} d="M7 7H4a2.5 2.5 0 0 1 0-5h3M11 7h3a2.5 2.5 0 0 1 0 5h-3M6 7h6"></path></svg>,
  check: <svg viewBox="0 0 16 16" width="13" height="13"><path {...S({ strokeWidth: 2 })} d="m3.5 8 3 3 6-6.5"></path></svg>,
  lock: <svg viewBox="0 0 18 18" width="13" height="13"><rect {...S({ strokeWidth: 1.3 })} x="4" y="8" width="10" height="7" rx="1.5"></rect><path {...S({ strokeWidth: 1.3 })} d="M6 8V6a3 3 0 0 1 6 0v2"></path></svg>,
  reset: <svg viewBox="0 0 18 18" width="14" height="14"><path {...S()} d="M14.5 9a5.5 5.5 0 1 1-1.6-3.9M14.5 3.2v2.8h-2.8"></path></svg>,
};

/* ---------- segmented control ---------- */
export function Seg({ options, value, onChange, compact, full }: any) {
  return (
    <div className={"seg" + (compact ? " compact" : "") + (full ? " full" : "")}>
      {options.map((o: any) => (
        <button key={o.value} type="button" title={o.title || undefined}
          className={"segBtn" + (o.value === value ? " on" : "")}
          onClick={() => onChange(o.value)}>
          {o.icon || null}{o.label ? <span>{o.label}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ---------- numeric stepper ---------- */
export function Stepper({ value, min, max, onChange }: any) {
  return (
    <div className="stepper">
      <button type="button" className="stepBtn" disabled={value <= min}
        onClick={() => onChange(value - 1)} aria-label="Decrease">{Ic.minus}</button>
      <span className="stepVal">{value}</span>
      <button type="button" className="stepBtn" disabled={value >= max}
        onClick={() => onChange(value + 1)} aria-label="Increase">{Ic.plus}</button>
    </div>
  );
}

/* ---------- icon button ---------- */
export function IconBtn({ icon, onClick, title, disabled, active, danger }: any) {
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick}
      className={"iconBtn" + (active ? " active" : "") + (danger ? " danger" : "")}>
      {icon}
    </button>
  );
}

/* ---------- popover ---------- */
export function Popover({ open, onClose, children, className }: any) {
  React.useEffect(() => {
    if (!open) return undefined;
    const h = (e: any) => {
      if (!e.target.closest(".popover") && !e.target.closest(".popTrigger")) onClose();
    };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, [open]);
  if (!open) return null;
  return <div className={"popover " + (className || "")}>{children}</div>;
}

/* ---------- palette swatches (inspector) ---------- */
export function PaletteSwatches({ paletteIdx, onChange }: any) {
  return (
    <div className="palSwatches">
      {PALETTES.map((pal, i) => (
        <button key={pal.name} type="button" title={pal.name}
          className={"palSw" + (i === paletteIdx ? " on" : "")}
          onClick={() => onChange(i)}>
          <span className="palSwInk">
            <i style={{ background: pal.ph }}></i>
            <i style={{ background: pal.ink }}></i>
            <i style={{ background: pal.text }}></i>
          </span>
          <small>{pal.name}</small>
        </button>
      ))}
    </div>
  );
}

/* ---------- pattern diagrams ---------- */
export function pdRects(type: string): any {
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

export function PatternDiagram({ type }: { type: string }) {
  const d = pdRects(type);
  return (
    <svg className="patDiag" viewBox={`0 0 ${d.w} 75`} style={{ aspectRatio: d.w + "/75" }}>
      <rect className="pdBg" width={d.w} height="75" rx="2"></rect>
      {d.band && <rect className="pdBand" x={d.band[0]} y={d.band[1]} width={d.band[2]} height={d.band[3]}></rect>}
      {d.ribbon !== undefined && <rect className="pdFill" x="0" y={d.ribbon} width={d.w} height="4"></rect>}
      {(d.circles || []).map((c: any, i: number) => (
        <circle key={i} className={i % 2 ? "pdFill" : "pdStrokeC"} cx={c[0]} cy={c[1]} r={c[2]}></circle>
      ))}
      {d.r.map((r: any, i: number) => (
        <g key={i} transform={r[4] ? `rotate(${r[4]} ${r[0] + r[2] / 2} ${r[1] + r[3] / 2})` : undefined}>
          {d.frame && <rect className="pdFrame" x={r[0] - 3} y={r[1] - 3} width={r[2] + 6} height={r[3] + 12}></rect>}
          <rect className="pdFill" x={r[0]} y={r[1]} width={r[2]} height={r[3]}></rect>
        </g>
      ))}
      {d.boundary && <line className="pdBoundary" x1="60" y1="0" x2="60" y2="75"></line>}
    </svg>
  );
}

export function PatternTile({ pat, on, onToggle }: any) {
  const info = PATTERN_INFO[pat];
  const wide = pdRects(pat).w > 60;
  return (
    <button type="button" title={info.desc}
      className={"patTile" + (on ? " on" : "") + (wide ? " wide" : "")}
      onClick={onToggle}>
      <span className="patThumb"><PatternDiagram type={pat} /></span>
      <span className="patLabel">{info.label}</span>
      <span className="patDot" aria-hidden="true">{on ? Ic.check : ""}</span>
    </button>
  );
}
