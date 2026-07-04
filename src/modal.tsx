/* modal.tsx — export dialog (real PNG download) + toast. */

import React from "react";
import { SLIDE_W } from "./core";
import { Ic } from "./icons";
import { StripContent } from "./strip";
import { exportSlides } from "./export";

export function ExportModal({ open, onClose, tpl, palette, bgStyle, texture, texts, api, onConfirm }: any) {
  const [busy, setBusy] = React.useState(false);
  if (!open) return null;
  const s = Math.min(0.085, 380 / (tpl.H * 4));
  const slideW = SLIDE_W * s;

  const download = async () => {
    setBusy(true);
    await exportSlides({
      tpl, palette, bgStyle, texture, texts,
      photos: api.photos, panzoom: api.panzoom,
    });
    setBusy(false);
    onConfirm();
  };

  return (
    <div className="modalOverlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <header className="modalHead">
          <div>
            <h2>Export carousel</h2>
            <p>The strip is sliced at each boundary into {tpl.n} PNGs at 1080 × {tpl.H} px. Upload them in order as one Instagram carousel and the seams line up.</p>
          </div>
          <button type="button" className="iconBtn" onClick={onClose} aria-label="Close">{Ic.close}</button>
        </header>
        <div className="exportRow">
          {Array.from({ length: tpl.n }, (_, i) => (
            <div key={i} className="exportSlide">
              <div className="exportClip" style={{ width: slideW, height: tpl.H * s }}>
                <div style={{ transform: `translateX(${-i * slideW}px)` }}>
                  <StripContent tpl={tpl} palette={palette} bgStyle={bgStyle}
                    texture={texture} texts={texts} s={s}
                    api={{ ...api, interactive: false }} />
                </div>
              </div>
              <span>slide_{String(i + 1).padStart(2, "0")}.png</span>
            </div>
          ))}
        </div>
        <footer className="modalFoot">
          <span className="protoNote">Each slide downloads as its own PNG — allow multiple downloads if your browser asks</span>
          <button type="button" className="primaryBtn lg" onClick={download} disabled={busy}>
            {Ic.download}<span>{busy ? "Exporting…" : `Download ${tpl.n} PNGs`}</span>
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
