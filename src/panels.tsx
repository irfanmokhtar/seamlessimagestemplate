/* panels.tsx — editor chrome: top bar, left tool panel,
   right contextual inspector, bottom slide strip. */

import React from "react";
import { PATTERNS, PATTERN_INFO, DECOR_KEYS, RATIOS, SLIDE_W, PALETTES, BG_COLORS, FONTS, fontStack } from "./core";
import { Ic, Seg, Stepper, IconBtn, PaletteSwatches, PatternTile, PatternDiagram, Popover } from "./icons";
import { StripContent } from "./strip";

/* ============ TOP BAR ============ */
export function TopBar({ docName, onDocName, theme, onTheme, onUndo, onRedo, canUndo, canRedo,
  zoom, onZoomStep, onFit, viewMode, onViewMode, onExport, onShuffle, spinning, onHome }: any) {
  const pct = Math.round(zoom * 100);
  return (
    <header className="topBar">
      <div className="tbLeft">
        <button type="button" className="brandMark asBtn" title="All projects" onClick={onHome}>
          <i></i><i></i><i></i>
        </button>
        <span className="tbDivider"></span>
        <input className="docName" value={docName} spellCheck={false}
          onChange={(e) => onDocName(e.target.value)} aria-label="Document name" />
        <span className="docMeta">Carousel</span>
      </div>

      <div className="tbCenter">
        <div className="tbCluster">
          <IconBtn icon={Ic.undo} title="Undo (⌘Z)" onClick={onUndo} disabled={!canUndo} />
          <IconBtn icon={Ic.redo} title="Redo (⌘⇧Z)" onClick={onRedo} disabled={!canRedo} />
        </div>
        <span className="tbDivider"></span>
        <div className="tbCluster zoomCluster">
          <IconBtn icon={Ic.zoomOut} title="Zoom out" onClick={() => onZoomStep(-1)} />
          <button type="button" className="zoomVal" onClick={onFit} title="Reset to fit">{pct}%</button>
          <IconBtn icon={Ic.zoomIn} title="Zoom in" onClick={() => onZoomStep(1)} />
          <IconBtn icon={Ic.fit} title="Fit to screen" onClick={onFit} />
        </div>
        <span className="tbDivider"></span>
        <Seg compact value={viewMode} onChange={onViewMode} options={[
          { value: "strip", label: "Strip", icon: Ic.strip, title: "One continuous canvas — edit here" },
          { value: "posts", label: "Posts", icon: Ic.posts, title: "Pulled apart — how it reads in the feed" },
        ]} />
      </div>

      <div className="tbRight">
        <button type="button" className={"ghostBtn" + (spinning ? " spinning" : "")}
          onClick={onShuffle} title="Re-roll the arrangement — photos stay put">
          {Ic.shuffle}<span>Shuffle</span>
        </button>
        <IconBtn icon={theme === "dark" ? Ic.sun : Ic.moon}
          title="Toggle light / dark" onClick={onTheme} />
        <button type="button" className="primaryBtn" onClick={onExport}>
          {Ic.download}<span>Export</span>
        </button>
      </div>
    </header>
  );
}

/* ============ LEFT TOOL PANEL ============ */

const LEFT_TABS = [
  { id: "layouts", label: "Layouts", icon: Ic.layouts },
  { id: "photos",  label: "Photos",  icon: Ic.image },
  { id: "text",    label: "Text",    icon: Ic.text },
  { id: "adjust",  label: "Adjust",  icon: Ic.adjust, soon: true },
  { id: "crop",    label: "Crop",    icon: Ic.crop },
];

export function LeftRail({ tab, onTab }: any) {
  return (
    <nav className="leftRail">
      {LEFT_TABS.map(t => (
        <button key={t.id} type="button"
          className={"railBtn" + (t.id === tab ? " on" : "")}
          onClick={() => onTab(t.id)} title={t.soon ? t.label + " — coming soon" : t.label}>
          {t.icon}
          <span>{t.label}</span>
          {t.soon && <em className="soonDot"></em>}
        </button>
      ))}
    </nav>
  );
}

function LayoutsSection({ enabled, onToggle, offCount, onShuffle, spinning }: any) {
  const singles = Object.keys(PATTERNS).filter(t => PATTERNS[t].span === 1);
  const multis = Object.keys(PATTERNS).filter(t => PATTERNS[t].span > 1);
  return (
    <>
      <div className="panelHd">
        <h2>Layouts</h2>
        <p>Pick which arrangements the generator may draw from.</p>
      </div>
      <button type="button" className={"bigAction" + (spinning ? " spinning" : "")} onClick={onShuffle}>
        {Ic.shuffle}<span>Shuffle layout</span>
      </button>
      <div className="panelScroll">
        <section className="pGroup">
          <h3>Single post</h3>
          <div className="patGrid">
            {singles.map(t => (
              <PatternTile key={t} pat={t} on={enabled[t] !== false} onToggle={() => onToggle(t)} />
            ))}
          </div>
        </section>
        <section className="pGroup">
          <h3>Across posts <span className="seamTag">{Ic.link}seamless</span></h3>
          <div className="patGrid">
            {multis.map(t => (
              <PatternTile key={t} pat={t} on={enabled[t] !== false} onToggle={() => onToggle(t)} />
            ))}
          </div>
        </section>
        <section className="pGroup">
          <h3>Decor</h3>
          <div className="patGrid">
            {DECOR_KEYS.map(t => (
              <PatternTile key={t} pat={t} on={enabled[t] !== false} onToggle={() => onToggle(t)} />
            ))}
          </div>
        </section>
      </div>
      <p className="panelFoot">
        {offCount > 0 ? `${offCount} hidden · ` : ""}Toggling re-rolls the template — your photos stay assigned.
      </p>
    </>
  );
}

function PhotosSection({ tpl, photos, onAddPhotos, onSelectSlot, selected, onSwapSlots, onAddSlot,
  pool = [], onUsePool, onPoolToSlot, onRemovePool, onSlotToPool }: any) {
  const slots = tpl.boxes.map((_b: any, i: number) => i);
  const filled = slots.filter((i: number) => photos[i]);
  const empty = slots.length - filled.length;
  const [dragOver, setDragOver] = React.useState<number | null>(null);
  const [poolOver, setPoolOver] = React.useState(false);
  return (
    <>
      <div className="panelHd">
        <h2>Photos</h2>
        <p>{filled.length} placed · {empty} empty {empty ? "slot" + (empty > 1 ? "s" : "") : ""}
          {pool.length ? ` · ${pool.length} in pool` : ""}</p>
      </div>
      <button type="button" className="bigAction" onClick={onAddPhotos}>
        {Ic.photos}<span>Add photos</span>
      </button>
      <div className="panelScroll">
        <div className="photoTray">
          {slots.map((i: number) => (
            <button key={i} type="button"
              className={"trayItem" + (selected === i ? " on" : "") + (photos[i] ? "" : " empty")
                + (dragOver === i ? " dragOver" : "")}
              onClick={() => onSelectSlot(i)} title={"Slot " + (i + 1) + " — drag onto another slot to swap"}
              draggable={!!photos[i]}
              onDragStart={(e) => { e.dataTransfer.setData("seamless/slot", String(i)); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => {
                const types = [...e.dataTransfer.types];
                if (types.includes("seamless/slot") || types.includes("seamless/pool")) { e.preventDefault(); setDragOver(i); }
              }}
              onDragLeave={() => setDragOver(d => (d === i ? null : d))}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(null);
                const types = [...e.dataTransfer.types];
                if (types.includes("seamless/pool")) {
                  const pi = Number(e.dataTransfer.getData("seamless/pool"));
                  if (Number.isInteger(pi)) onPoolToSlot(pi, i);
                  return;
                }
                const from = Number(e.dataTransfer.getData("seamless/slot"));
                if (Number.isInteger(from) && from !== i) onSwapSlots(from, i);
              }}>
              {photos[i]
                ? <img src={photos[i]} alt="" draggable={false} />
                : <span className="trayNum">{i + 1}</span>}
              <em>{i + 1}</em>
            </button>
          ))}
        </div>
        <button type="button" className="miniBtn" onClick={onAddSlot}>
          {Ic.plus}<span>Add photo slot</span>
        </button>

        {pool.length > 0 && (
          <section className="pGroup poolGroup">
            <h3>Photo pool <span className="poolCount">{pool.length}</span></h3>
            <div className={"photoTray poolTray" + (poolOver ? " dragOver" : "")}
              onDragOver={(e) => {
                if ([...e.dataTransfer.types].includes("seamless/slot")) { e.preventDefault(); setPoolOver(true); }
              }}
              onDragLeave={() => setPoolOver(false)}
              onDrop={(e) => {
                e.preventDefault(); setPoolOver(false);
                const from = Number(e.dataTransfer.getData("seamless/slot"));
                if (Number.isInteger(from)) onSlotToPool(from);
              }}>
              {pool.map((p: any, idx: number) => (
                <button key={p.id} type="button" className="trayItem poolItem"
                  onClick={() => onUsePool(idx)}
                  title="Click to place in the selected (or next empty) slot — drag onto a slot to place"
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData("seamless/pool", String(idx)); e.dataTransfer.effectAllowed = "move"; }}>
                  <img src={p.url} alt="" draggable={false} />
                  <span className="trayX" title="Remove from pool"
                    onClick={(e) => { e.stopPropagation(); onRemovePool(idx); }}>×</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      <p className="panelFoot">Add more photos than slots — extras wait in the pool. Shuffle fills empty slots from it,
        or click a pool photo to place it. Drag a slot photo here to send it back.</p>
    </>
  );
}

const TEXT_COLORS = ["auto", "#FFFFFF", "#111111", "#C9A24B", "#E4572E", "#3A6B6B"];

/* one-tap text styles — partials fed straight into newTextBlock */
const TEXT_PRESETS: { label: string; partial: any }[] = [
  { label: "Heading",   partial: { text: "Heading", font: "playfair", size: 140, weight: 600, upper: true, letterSpacing: 2 } },
  { label: "Subtitle",  partial: { text: "Subtitle", font: "montserrat", size: 56, weight: 500, upper: true, letterSpacing: 10 } },
  { label: "Caption",   partial: { text: "A short caption", font: "inter", size: 40, weight: 400, upper: false, letterSpacing: 0 } },
  { label: "Signature", partial: { text: "yours truly", font: "dancing", size: 110, weight: 400, upper: false, letterSpacing: 0 } },
];

function TextSection({ texts = [], selText, onAddText, onUpdateText, onRemoveText, onSelectText, onDuplicateText }: any) {
  const sel = texts.find((t: any) => t.id === selText) || null;
  return (
    <>
      <div className="panelHd">
        <h2>Text</h2>
        <p>Add titles, captions & signatures — drag them anywhere, double-click to edit in place.</p>
      </div>
      <button type="button" className="bigAction" onClick={() => onAddText()}>
        {Ic.text}<span>Add text block</span>
      </button>
      <div className="panelScroll">
        <div className="presetRow">
          {TEXT_PRESETS.map(p => (
            <button key={p.label} type="button" className="presetBtn"
              style={{ fontFamily: fontStack(p.partial.font) }}
              onClick={() => onAddText(p.partial)}>{p.label}</button>
          ))}
        </div>
        {texts.length > 0 && (
          <div className="textList">
            {texts.map((t: any) => (
              <button key={t.id} type="button"
                className={"textListItem" + (t.id === selText ? " on" : "")}
                onClick={() => onSelectText(t.id)} title="Edit block">
                <span style={{ fontFamily: fontStack(t.font) }}>{t.text || "Empty"}</span>
              </button>
            ))}
          </div>
        )}

        {sel ? (
          <TextEditor key={sel.id} t={sel} onUpdate={onUpdateText} onRemove={onRemoveText}
            onDuplicate={onDuplicateText} />
        ) : (
          <p className="inspHint" style={{ padding: "8px 4px 0" }}>
            {texts.length ? "Select a block above to edit it." : "No text yet — add a block to get started."}
          </p>
        )}
      </div>
    </>
  );
}

function TextEditor({ t, onUpdate, onRemove, onDuplicate }: any) {
  const set = (patch: any) => onUpdate(t.id, patch);
  const cats = ["Serif", "Sans", "Script"] as const;
  return (
    <div className="textEditor">
      <div className="field">
        <label>Content</label>
        <textarea className="textField textArea" value={t.text} rows={2}
          placeholder="Type your text…" onChange={(e) => set({ text: e.target.value })} />
      </div>

      <div className="field">
        <label>Font</label>
        <select className="selectField" value={t.font} style={{ fontFamily: fontStack(t.font) }}
          onChange={(e) => set({ font: e.target.value })}>
          {cats.map(cat => (
            <optgroup key={cat} label={cat}>
              {FONTS.filter(f => f.cat === cat).map(f => (
                <option key={f.id} value={f.id} style={{ fontFamily: f.stack }}>{f.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <InspGroup label="Color">
        <div className="colorRow">
          {TEXT_COLORS.map(c => (
            <button key={c} type="button" title={c === "auto" ? "Auto (matches background)" : c}
              className={"colorDot" + (t.color === c ? " on" : "") + (c === "auto" ? " auto" : "")}
              style={c === "auto" ? undefined : { background: c }}
              onClick={() => set({ color: c })}>{c === "auto" ? "A" : ""}</button>
          ))}
          <label className="colorDot custom" title="Custom color"
            style={{ background: t.color !== "auto" && !TEXT_COLORS.includes(t.color) ? t.color : undefined }}>
            +
            <input type="color" value={t.color === "auto" ? "#ffffff" : t.color}
              onChange={(e) => set({ color: e.target.value })} />
          </label>
        </div>
      </InspGroup>

      <InspGroup label={`Size · ${Math.round(t.size)}`}>
        <input type="range" className="slider" min="24" max="320" step="1"
          value={t.size} onChange={(e) => set({ size: Number(e.target.value) })} />
      </InspGroup>

      <InspGroup label={`Letter spacing · ${t.letterSpacing}`}>
        <input type="range" className="slider" min="-5" max="30" step="0.5"
          value={t.letterSpacing} onChange={(e) => set({ letterSpacing: Number(e.target.value) })} />
      </InspGroup>

      <InspGroup label="Weight">
        <Seg full compact value={t.weight} onChange={(v: number) => set({ weight: v })} options={[
          { value: 400, label: "Reg" }, { value: 500, label: "Med" },
          { value: 600, label: "Semi" }, { value: 700, label: "Bold" }]} />
      </InspGroup>

      <InspGroup label="Align">
        <Seg full compact value={t.align} onChange={(v: string) => set({ align: v })} options={[
          { value: "left", label: "Left" }, { value: "center", label: "Center" },
          { value: "right", label: "Right" }]} />
      </InspGroup>

      <div className="toggleRow">
        <Toggle label="Italic" on={t.italic} onChange={(v: boolean) => set({ italic: v })} />
        <Toggle label="UPPERCASE" on={t.upper} onChange={(v: boolean) => set({ upper: v })} />
      </div>

      <div className="btnRow">
        <button type="button" className="lineBtn" onClick={() => onDuplicate(t.id)}>
          {Ic.swap}<span>Duplicate</span>
        </button>
        <button type="button" className="lineBtn danger" onClick={() => onRemove(t.id)}>
          {Ic.trash}<span>Delete</span>
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, on, onChange }: any) {
  return (
    <button type="button" className={"pillToggle" + (on ? " on" : "")}
      onClick={() => onChange(!on)}>
      <span className="pillBox">{on ? Ic.check : null}</span>{label}
    </button>
  );
}

function CropSection({ tpl, photos, panzoom, selected, onSelectSlot, onStraighten, onFitPhoto }: any) {
  const slots = tpl.boxes.map((_b: any, i: number) => i);
  const sel = selected != null ? selected : null;
  const src = sel != null ? photos[sel] : null;
  const pz = (sel != null && panzoom[sel]) || { x: 0, y: 0, z: 1, r: 0 };
  return (
    <>
      <div className="panelHd">
        <h2>Crop & straighten</h2>
        <p>Rotate a photo inside its slot. Drag the photo on the canvas to rotate, or use the slider.</p>
      </div>
      <div className="panelScroll">
        <div className="photoTray">
          {slots.map((i: number) => (
            <button key={i} type="button"
              className={"trayItem" + (selected === i ? " on" : "") + (photos[i] ? "" : " empty")}
              onClick={() => onSelectSlot(i)} title={"Slot " + (i + 1)}>
              {photos[i]
                ? <img src={photos[i]} alt="" draggable={false} />
                : <span className="trayNum">{i + 1}</span>}
              <em>{i + 1}</em>
            </button>
          ))}
        </div>

        {sel != null ? (
          <InspGroup label={"Straighten · slot " + (sel + 1)}>
            <StraightenControl index={sel} src={src} deg={pz.r || 0} onStraighten={onStraighten} />
            <button type="button" className="miniBtn" disabled={!src}
              onClick={() => onFitPhoto(sel)}>{Ic.reset}<span>Reset framing</span></button>
          </InspGroup>
        ) : (
          <p className="inspHint" style={{ padding: "0 4px" }}>Select a slot above to straighten it.</p>
        )}
      </div>
      <p className="panelFoot">Straightening auto-zooms the photo so the slot stays filled.</p>
    </>
  );
}

function SoonSection({ icon, title, blurb, items }: any) {
  return (
    <>
      <div className="panelHd">
        <h2>{title}</h2>
        <p>{blurb}</p>
      </div>
      <div className="panelScroll">
        <div className="soonHero">{icon}</div>
        <ul className="soonList">
          {items.map((it: string, i: number) => <li key={i}>{it}</li>)}
        </ul>
        <SoonNote label="In the works" />
      </div>
    </>
  );
}

function SoonNote({ label }: any) {
  return <div className="soonNote">{Ic.lock}<span>{label}</span></div>;
}

export function LeftPanel(props: any) {
  const { tab } = props;
  let body;
  if (tab === "layouts") body = <LayoutsSection {...props} />;
  else if (tab === "photos") body = <PhotosSection {...props} />;
  else if (tab === "text") body = <TextSection {...props} />;
  else if (tab === "adjust") body = <SoonSection icon={Ic.adjust} title="Adjust"
    blurb="Tune each photo to match." items={[
      "Brightness, contrast & warmth", "Filters & presets", "Per-photo or whole carousel"]} />;
  else if (tab === "crop") body = <CropSection {...props} />;
  return <aside className="leftPanel">{body}</aside>;
}

/* ============ RIGHT INSPECTOR ============ */

export function Inspector({ selected, tpl, photos, panzoom, paletteIdx, n, H, bgStyle, texture,
  onPalette, onN, onH, onBgStyle, onTexture, onReplace, onRemove, onZoomTo, onNudge,
  onFitPhoto, onStraighten, onShare, onDeleteSlot }: any) {

  if (selected != null) {
    const src = photos[selected];
    const pz = panzoom[selected] || { x: 0, y: 0, z: 1 };
    return (
      <aside className="inspector">
        <div className="inspHd">
          <h2>Photo</h2>
          <span className="inspTag">Slot {selected + 1}</span>
        </div>
        <div className="inspScroll">
          <div className="photoPreview" style={{ background: PALETTES[paletteIdx].ph }}>
            {src ? <img src={src} alt="" draggable={false} /> : <span>Empty slot</span>}
          </div>
          <div className="btnRow">
            <button type="button" className="lineBtn" onClick={() => onReplace(selected)}>
              {Ic.swap}<span>{src ? "Replace" : "Add photo"}</span>
            </button>
            <button type="button" className="lineBtn danger" disabled={!src}
              onClick={() => onRemove(selected)}>{Ic.trash}<span>Remove</span></button>
          </div>

          <InspGroup label="Zoom">
            <div className="sliderRow">
              <input type="range" className="slider" min="1" max="4" step="0.01"
                value={pz.z} disabled={!src}
                onChange={(e) => onZoomTo(selected, Number(e.target.value))} />
              <span className="sliderVal">{Math.round(pz.z * 100)}%</span>
            </div>
            <button type="button" className="miniBtn" disabled={!src}
              onClick={() => onFitPhoto(selected)}>{Ic.reset}<span>Reset framing</span></button>
          </InspGroup>

          <InspGroup label="Position">
            <div className="nudgePad">
              <button type="button" className="nudge up" disabled={!src} onClick={() => onNudge(selected, 0, -24)}>{Ic.chevron}</button>
              <button type="button" className="nudge left" disabled={!src} onClick={() => onNudge(selected, -24, 0)}>{Ic.chevron}</button>
              <span className="nudgeCore">{Ic.cursor}</span>
              <button type="button" className="nudge right" disabled={!src} onClick={() => onNudge(selected, 24, 0)}>{Ic.chevron}</button>
              <button type="button" className="nudge down" disabled={!src} onClick={() => onNudge(selected, 0, 24)}>{Ic.chevron}</button>
            </div>
            <p className="inspHint">Or drag the photo on the canvas, scroll to zoom.</p>
          </InspGroup>

          <InspGroup label="Straighten">
            <StraightenControl index={selected} src={src} deg={pz.r || 0}
              onStraighten={onStraighten} />
            <p className="inspHint">Or pick the Crop tool and drag the photo to rotate.</p>
          </InspGroup>

          <InspGroup label="Slot">
            <p className="inspHint">⌘-drag moves the slot · drag a corner handle to resize ·
              ⇧-drag onto another slot to swap photos.</p>
            <button type="button" className="lineBtn danger"
              onClick={() => onDeleteSlot(selected)}>{Ic.trash}<span>Delete slot</span></button>
          </InspGroup>

          <InspGroup label="Coming soon">
            <div className="soonRow">{Ic.adjust}<span>Brightness & filters</span>{Ic.lock}</div>
          </InspGroup>
        </div>
      </aside>
    );
  }

  return (
    <aside className="inspector">
      <div className="inspHd">
        <h2>Carousel</h2>
        <span className="inspTag">{n} posts</span>
      </div>
      <div className="inspScroll">
        <InspGroup label="Posts">
          <Stepper value={n} min={2} max={10} onChange={onN} />
        </InspGroup>
        <InspGroup label="Aspect ratio">
          <Seg full compact value={H} onChange={onH}
            options={RATIOS.map(r => ({ value: r.h, label: r.label, title: `${r.name} — 1080×${r.h}` }))} />
        </InspGroup>
        <InspGroup label="Background color">
          <PaletteSwatches paletteIdx={paletteIdx} onChange={onPalette} />
        </InspGroup>
        <InspGroup label="Background style">
          <Seg full compact value={bgStyle} onChange={onBgStyle} options={[
            { value: "flat", label: "Flat" },
            { value: "gradient", label: "Gradient" },
            { value: "blurpano", label: "Photo", title: "Blurred first photo behind everything" },
          ]} />
        </InspGroup>
        <InspGroup label="Texture">
          <Seg full compact value={texture} onChange={onTexture} options={[
            { value: "none", label: "None" },
            { value: "grain", label: "Grain" },
            { value: "paper", label: "Paper" },
          ]} />
        </InspGroup>
        <InspGroup label={"Look" + (tpl.seed != null ? ` · #${tpl.seed.toString(16).toUpperCase()}` : "")}>
          <button type="button" className="lineBtn" onClick={onShare}>
            {Ic.link}<span>Copy share link</span>
          </button>
          <p className="inspHint">Anyone opening the link gets this exact layout, colors,
            background & text — with empty photo slots.</p>
        </InspGroup>
        <p className="inspHint pad">Select a photo on the canvas to edit it individually.</p>
      </div>
    </aside>
  );
}

export function StraightenControl({ index, src, deg, onStraighten }: any) {
  const d = deg || 0;
  return (
    <>
      <div className="sliderRow">
        <input type="range" className="slider" min="-45" max="45" step="0.5"
          value={d} disabled={!src}
          onChange={(e) => onStraighten(index, Number(e.target.value))} />
        <span className="sliderVal">{d > 0 ? "+" : ""}{d.toFixed(1)}°</span>
      </div>
      <button type="button" className="miniBtn" disabled={!src || d === 0}
        onClick={() => onStraighten(index, 0)}>{Ic.reset}<span>Reset to 0°</span></button>
    </>
  );
}

export function InspGroup({ label, children }: any) {
  return (
    <div className="inspGroup">
      <label className="inspLabel">{label}</label>
      {children}
    </div>
  );
}

/* ============ BOTTOM SLIDE STRIP ============ */

function PostThumb({ tpl, palette, bgStyle, texture, texts, api, i, s, slideW, H, active,
  locked, slideBg, onSelectPost, onToggleLock, onPickLayout, onPickBg }: any) {
  // popover position is fixed — the bottom strip scrolls horizontally, so an
  // absolutely-positioned popover would be clipped by the scroll container
  const [pickAt, setPickAt] = React.useState<{ x: number; y: number } | null>(null);
  const pickOpen = pickAt !== null;
  const setPickOpen = (o: boolean) => setPickAt(o ? pickAt : null);
  const [bgAt, setBgAt] = React.useState<{ x: number; y: number } | null>(null);
  const bgOpen = bgAt !== null;
  const curBg = (slideBg && slideBg[i]) || null;
  const singles = Object.keys(PATTERNS).filter(t => PATTERNS[t].span === 1);
  const openPop = (e: React.MouseEvent, cur: any, set: (v: any) => void) => {
    e.stopPropagation();
    if (cur) { set(null); return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    set({ x: r.left + r.width / 2, y: r.top - 8 });
  };
  return (
    <span className={"ssThumbWrap" + (locked ? " locked" : "")}>
      <button type="button"
        className={"ssThumb" + (active ? " on" : "")}
        onClick={() => onSelectPost(i)} title={"Post " + (i + 1)}>
        <span className="ssClip" style={{ width: slideW, height: H }}>
          <span className="ssInner" style={{ transform: `translateX(${-i * slideW}px)` }}>
            <StripContent tpl={tpl} palette={palette} bgStyle={bgStyle}
              texture={texture} texts={texts} s={s} slideBg={slideBg} api={{ ...api, interactive: false }} />
          </span>
        </span>
        <em className="ssNum">{i + 1}</em>
      </button>
      <span className="ssTools">
        <button type="button" className={"ssTool" + (locked ? " on" : "")}
          title={locked ? "Unlock — shuffle may change this post" : "Lock — shuffle keeps this post"}
          onClick={(e) => { e.stopPropagation(); onToggleLock(i); }}>
          {Ic.lock}
        </button>
        <button type="button" className={"ssTool popTrigger" + (pickOpen ? " on" : "")}
          title="Choose this post's layout"
          onClick={(e) => openPop(e, pickOpen, (v) => setPickAt(v))}>
          {Ic.layouts}
        </button>
        <button type="button" className={"ssTool popTrigger ssBgTool" + (bgOpen ? " on" : "") + (curBg ? " set" : "")}
          title="Background color for this post"
          onClick={(e) => openPop(e, bgOpen, (v) => setBgAt(v))}>
          <span className="ssBgDot" style={curBg ? { background: curBg } : undefined}></span>
        </button>
      </span>
      <Popover open={pickOpen} onClose={() => setPickOpen(false)} className="layoutPop"
        style={pickAt ? {
          position: "fixed", left: pickAt.x, top: pickAt.y,
          bottom: "auto", transform: "translate(-50%, -100%)",
        } : undefined}>
        <span className="layoutPopHd">Post {i + 1} layout</span>
        <div className="layoutPopGrid">
          {singles.map(t => (
            <button key={t} type="button"
              className={"layoutPick" + (tpl.layoutAt[i] === t ? " on" : "")}
              title={PATTERN_INFO[t].desc}
              onClick={() => { setPickOpen(false); onPickLayout(i, t); }}>
              <PatternDiagram type={t} />
              <span>{PATTERN_INFO[t].label}</span>
            </button>
          ))}
        </div>
      </Popover>
      <Popover open={bgOpen} onClose={() => setBgAt(null)} className="bgPop"
        style={bgAt ? {
          position: "fixed", left: bgAt.x, top: bgAt.y,
          bottom: "auto", transform: "translate(-50%, -100%)",
        } : undefined}>
        <span className="layoutPopHd">Post {i + 1} background</span>
        <div className="bgPopGrid">
          <button type="button" className={"bgPick bgPickDefault" + (!curBg ? " on" : "")}
            title="Use the carousel background" onClick={() => { setBgAt(null); onPickBg(i, null); }}>
            <span className="bgPickSw"></span><span>Default</span>
          </button>
          {BG_COLORS.map((c: any) => (
            <button key={c.bg} type="button"
              className={"bgPick" + (curBg === c.bg ? " on" : "")} title={c.name}
              onClick={() => { setBgAt(null); onPickBg(i, c.bg); }}>
              <span className="bgPickSw" style={{ background: c.bg }}></span>
              <span>{c.name}</span>
            </button>
          ))}
          <label className="bgPick bgPickCustom" title="Custom color">
            <span className="bgPickSw" style={curBg && !BG_COLORS.some((c: any) => c.bg === curBg) ? { background: curBg } : undefined}>+</span>
            <span>Custom</span>
            <input type="color" value={curBg || "#ffffff"}
              onChange={(e) => onPickBg(i, e.target.value)} />
          </label>
        </div>
      </Popover>
    </span>
  );
}

export function BottomStrip({ tpl, palette, bgStyle, texture, texts, api, activePost, onSelectPost,
  onAddPost, n, locks = [], slideBg = [], onToggleLock, onPickLayout, onPickBg }: any) {
  const H = 60;
  const s = H / tpl.H;
  const slideW = SLIDE_W * s;
  return (
    <div className="slideStrip">
      <span className="ssLabel">Posts</span>
      <div className="ssScroll">
        {Array.from({ length: tpl.n }, (_, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="ssLink" title="Seamless boundary">{Ic.link}</span>}
            <PostThumb tpl={tpl} palette={palette} bgStyle={bgStyle} texture={texture}
              texts={texts} api={api} i={i} s={s} slideW={slideW} H={H}
              active={activePost === i} locked={!!locks[i]} slideBg={slideBg}
              onSelectPost={onSelectPost} onToggleLock={onToggleLock} onPickLayout={onPickLayout}
              onPickBg={onPickBg} />
          </React.Fragment>
        ))}
        {n < 10 && (
          <button type="button" className="ssAdd" onClick={onAddPost} title="Add a post">
            {Ic.plus}
          </button>
        )}
      </div>
    </div>
  );
}
