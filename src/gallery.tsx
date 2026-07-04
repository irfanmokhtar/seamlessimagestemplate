/* gallery.tsx — project home screen: one card per saved carousel. */

import React from "react";
import { PALETTES } from "./core";
import { Ic, IconBtn } from "./icons";
import { TemplateThumb } from "./strip";
import type { DocRecord } from "./store";

function relTime(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.round(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function Gallery({ docs, theme, onTheme, onOpen, onNew, onDelete, onDuplicate }: {
  docs: DocRecord[];
  theme: string;
  onTheme: () => void;
  onOpen: (d: DocRecord) => void;
  onNew: () => void;
  onDelete: (d: DocRecord) => void;
  onDuplicate: (d: DocRecord) => void;
}) {
  return (
    <div className="editor ready" data-theme={theme}>
      <header className="topBar">
        <div className="tbLeft">
          <span className="brandMark" title="Seamless"><i></i><i></i><i></i></span>
          <span className="tbDivider"></span>
          <span className="galTitle">Seamless</span>
          <span className="docMeta">Projects</span>
        </div>
        <div className="tbRight">
          <IconBtn icon={theme === "dark" ? Ic.sun : Ic.moon}
            title="Toggle light / dark" onClick={onTheme} />
          <button type="button" className="primaryBtn" onClick={onNew}>
            {Ic.plus}<span>New carousel</span>
          </button>
        </div>
      </header>

      <div className="galBody">
        <div className="galGrid">
          <button type="button" className="galCard galNew" onClick={onNew}>
            <span className="galNewIcon">{Ic.plus}</span>
            <span>New carousel</span>
          </button>
          {docs.map(d => {
            const tpl = d.history?.[d.cursor];
            const pal = PALETTES[d.paletteIdx] || PALETTES[0];
            return (
              <div key={d.id} className="galCard" role="button" tabIndex={0}
                onClick={() => onOpen(d)}
                onKeyDown={(e) => { if (e.key === "Enter") onOpen(d); }}>
                <div className="galThumb">
                  {tpl ? <TemplateThumb tpl={tpl} palette={pal} width={236} /> : null}
                </div>
                <div className="galMeta">
                  <div className="galName">
                    <b>{d.name || "Untitled carousel"}</b>
                    <span>{tpl ? `${tpl.n} posts` : ""} · {relTime(d.updatedAt)}</span>
                  </div>
                  <div className="galActions" onClick={(e) => e.stopPropagation()}>
                    <IconBtn icon={Ic.swap} title="Duplicate" onClick={() => onDuplicate(d)} />
                    <IconBtn icon={Ic.trash} title="Delete" danger onClick={() => onDelete(d)} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {docs.length === 0 && (
          <p className="galEmpty">No projects yet — start a new carousel and it autosaves here.</p>
        )}
      </div>
    </div>
  );
}
