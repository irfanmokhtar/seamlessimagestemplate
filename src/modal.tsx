/* modal.tsx — export dialog (zip / loose files / panorama) + toast. */

import React from "react";
import { SLIDE_W } from "./core";
import { Ic, Seg } from "./icons";
import { StripContent } from "./strip";
import { exportCarousel } from "./export";
import { InspGroup } from "./panels";

export function ExportModal({ open, onClose, tpl, palette, bgStyle, texture, texts, api,
  docName, onConfirm, slideBg }: any) {
  const [busy, setBusy] = React.useState(false);
  const [format, setFormat] = React.useState<"png" | "jpeg">("png");
  const [scale, setScale] = React.useState<1 | 2>(1);
  const [mode, setMode] = React.useState<"slides" | "pano">("slides");
  if (!open) return null;
  const s = Math.min(0.085, 380 / (tpl.H * 4));
  const slideW = SLIDE_W * s;
  const ext = format === "jpeg" ? "jpg" : "png";

  const run = async (separate: boolean) => {
    setBusy(true);
    try {
      await exportCarousel(
        { tpl, palette, bgStyle, texture, texts, photos: api.photos, panzoom: api.panzoom, slideBg },
        { format, scale, mode, docName, separate },
      );
      onConfirm(mode === "pano"
        ? "Panorama downloaded"
        : separate
          ? `${tpl.n} files downloaded — upload them in order as one carousel`
          : `${docName || "carousel"}.zip downloaded — upload the slides in order`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modalOverlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <header className="modalHead">
          <div>
            <h2>Export carousel</h2>
            <p>The strip is sliced at each boundary into {tpl.n} slides at {1080 * scale} × {tpl.H * scale} px.
              Upload them in order as one Instagram carousel and the seams line up.</p>
          </div>
          <button type="button" className="iconBtn" onClick={onClose} aria-label="Close">{Ic.close}</button>
        </header>

        <div className="exportRow">
          {Array.from({ length: tpl.n }, (_, i) => (
            <div key={i} className="exportSlide">
              <div className="exportClip" style={{ width: slideW, height: tpl.H * s }}>
                <div style={{ transform: `translateX(${-i * slideW}px)` }}>
                  <StripContent tpl={tpl} palette={palette} bgStyle={bgStyle}
                    texture={texture} texts={texts} s={s} slideBg={slideBg}
                    api={{ ...api, interactive: false }} />
                </div>
              </div>
              <span>{String(i + 1).padStart(2, "0")}.{ext}</span>
            </div>
          ))}
        </div>

        <div className="exportOpts">
          <InspGroup label="Format">
            <Seg compact value={format} onChange={setFormat} options={[
              { value: "png", label: "PNG", title: "Lossless" },
              { value: "jpeg", label: "JPEG", title: "Smaller files, quality 90" },
            ]} />
          </InspGroup>
          <InspGroup label="Size">
            <Seg compact value={scale} onChange={setScale} options={[
              { value: 1, label: "1×", title: `1080 × ${tpl.H}` },
              { value: 2, label: "2×", title: `2160 × ${tpl.H * 2}` },
            ]} />
          </InspGroup>
          <InspGroup label="Output">
            <Seg compact value={mode} onChange={setMode} options={[
              { value: "slides", label: `${tpl.n} slides (.zip)`, title: "One image per post, zipped" },
              { value: "pano", label: "Full strip", title: "Single wide panorama image" },
            ]} />
          </InspGroup>
        </div>

        <footer className="modalFoot">
          {mode === "slides" ? (
            <button type="button" className="linkBtn" disabled={busy} onClick={() => run(true)}>
              …or download {tpl.n} loose files
            </button>
          ) : (
            <span className="protoNote">One {tpl.n * 1080}px-wide image — great for previews & mockups</span>
          )}
          <button type="button" className="primaryBtn lg" onClick={() => run(false)} disabled={busy}>
            {Ic.download}<span>{busy ? "Exporting…" : mode === "pano" ? "Download panorama" : "Download .zip"}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}

export function Toast({ toast }: any) {
  if (!toast) return null;
  return <div className="toast" key={toast.id}>{toast.msg}</div>;
}
