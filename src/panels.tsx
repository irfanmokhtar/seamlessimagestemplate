/* panels.tsx — editor chrome: top bar, left tool panel,
   right contextual inspector, bottom slide strip. */

import React from "react";
import { PATTERNS, DECOR_KEYS, RATIOS, SLIDE_W, PALETTES } from "./core";
import { Ic, Seg, Stepper, IconBtn, PaletteSwatches, PatternTile } from "./icons";
import { StripContent } from "./strip";

/* ============ TOP BAR ============ */
export function TopBar({ docName, onDocName, theme, onTheme, onUndo, onRedo, canUndo, canRedo,
  zoom, onZoomStep, onFit, viewMode, onViewMode, onExport, onShuffle, spinning }: any) {
  const pct = Math.round(zoom * 100);
  return (
    <header className="topBar">
      <div className="tbLeft">
        <span className="brandMark" title="Seamless">
          <i></i><i></i><i></i>
        </span>
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
  { id: "crop",    label: "Crop",    icon: Ic.crop, soon: true },
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

function PhotosSection({ tpl, photos, onAddPhotos, onSelectSlot, selected }: any) {
  const slots = tpl.boxes.map((_b: any, i: number) => i);
  const filled = slots.filter((i: number) => photos[i]);
  const empty = slots.length - filled.length;
  return (
    <>
      <div className="panelHd">
        <h2>Photos</h2>
        <p>{filled.length} placed · {empty} empty {empty ? "slot" + (empty > 1 ? "s" : "") : ""}</p>
      </div>
      <button type="button" className="bigAction" onClick={onAddPhotos}>
        {Ic.photos}<span>Add photos</span>
      </button>
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
      </div>
      <p className="panelFoot">Drop images straight onto the canvas to fill empty slots in order.</p>
    </>
  );
}

function TextSection({ title, onTitle }: any) {
  return (
    <>
      <div className="panelHd">
        <h2>Text</h2>
        <p>A display title set across the carousel.</p>
      </div>
      <div className="panelScroll">
        <div className="field">
          <label>Title</label>
          <input type="text" className="textField" value={title} maxLength={40}
            placeholder="e.g. CONVOCATION '26" onChange={(e) => onTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Typeface</label>
          <div className="fauxSelect disabled">Editorial Serif {Ic.chevron}</div>
        </div>
        <div className="field">
          <label>Style</label>
          <div className="segRow disabled">
            <span className="fauxSeg on">Title</span>
            <span className="fauxSeg">Subtitle</span>
            <span className="fauxSeg">Caption</span>
          </div>
        </div>
        <SoonNote label="Multiple text blocks, fonts & color" />
      </div>
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
  else if (tab === "crop") body = <SoonSection icon={Ic.crop} title="Crop & straighten"
    blurb="Reframe a photo inside its slot." items={[
      "Drag handles to crop", "Straighten & rotate", "Lock to slot aspect ratio"]} />;
  return <aside className="leftPanel">{body}</aside>;
}

/* ============ RIGHT INSPECTOR ============ */

export function Inspector({ selected, tpl, photos, panzoom, paletteIdx, n, H, bgStyle, texture,
  onPalette, onN, onH, onBgStyle, onTexture, onReplace, onRemove, onZoomTo, onNudge,
  onFitPhoto }: any) {

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

          <InspGroup label="Coming soon">
            <div className="soonRow">{Ic.crop}<span>Crop & straighten</span>{Ic.lock}</div>
            <div className="soonRow">{Ic.adjust}<span>Brightness & filters</span>{Ic.lock}</div>
            <div className="soonRow">{Ic.fitFill}<span>Free resize slot</span>{Ic.lock}</div>
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
        <InspGroup label="Palette">
          <PaletteSwatches paletteIdx={paletteIdx} onChange={onPalette} />
        </InspGroup>
        <InspGroup label="Background">
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
        <p className="inspHint pad">Select a photo on the canvas to edit it individually.</p>
      </div>
    </aside>
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

export function BottomStrip({ tpl, palette, bgStyle, texture, title, api, activePost, onSelectPost,
  onAddPost, n }: any) {
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
            <button type="button"
              className={"ssThumb" + (activePost === i ? " on" : "")}
              onClick={() => onSelectPost(i)} title={"Post " + (i + 1)}>
              <span className="ssClip" style={{ width: slideW, height: H }}>
                <span className="ssInner" style={{ transform: `translateX(${-i * slideW}px)` }}>
                  <StripContent tpl={tpl} palette={palette} bgStyle={bgStyle}
                    texture={texture} title={title} s={s} api={{ ...api, interactive: false }} />
                </span>
              </span>
              <em className="ssNum">{i + 1}</em>
            </button>
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
