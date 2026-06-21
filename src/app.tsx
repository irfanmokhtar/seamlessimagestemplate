/* app.tsx — Seamless editor: state, wiring, layout. */

import React from "react";
import { PATTERNS, DECOR_KEYS, PALETTES, SLIDE_W, generateTemplate, resizeTemplate } from "./core";
import { clampPan } from "./strip";
import { StripStage } from "./strip";
import { TopBar, LeftRail, LeftPanel, Inspector, BottomStrip } from "./panels";
import { ExportModal, Toast } from "./modal";
import type { Box, Enabled, BgStyle, Texture, ViewMode } from "./types";

const ALL_KEYS = [...Object.keys(PATTERNS), ...DECOR_KEYS];
// ribbon + circles decor start off — they read as busy on a fresh canvas
const defaultEnabled = (): Enabled =>
  Object.fromEntries(ALL_KEYS.map(k => [k, k !== "ribbon" && k !== "arcs"]));

const ACCENT = "#1E9E72";
const MORPH_MS = 600;

const STORE_KEY = "seamless_settings";
const THEME_KEY = "seamless_theme";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function loadSettings(): any {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null") || {}; }
  catch { return {}; }
}
const saved = loadSettings();

export function App() {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  const [theme, setTheme] = React.useState<string>(
    () => localStorage.getItem(THEME_KEY) || "dark");
  React.useEffect(() => { localStorage.setItem(THEME_KEY, theme); }, [theme]);

  const [docName, setDocName] = React.useState("Untitled carousel");
  const [n, setN] = React.useState(5);
  const [H, setH] = React.useState(1350);
  const [paletteIdx, setPaletteIdx] = React.useState<number>(
    () => (Number.isInteger(saved.paletteIdx) && PALETTES[saved.paletteIdx]) ? saved.paletteIdx : 0);
  const [bgStyle, setBgStyle] = React.useState<BgStyle>(
    () => saved.bgStyle === "white" ? "flat" : (saved.bgStyle || "flat"));
  const [texture, setTexture] = React.useState<Texture>(() => saved.texture || "grain");
  const [title, setTitle] = React.useState<string>(() => saved.title || "");
  const [enabled, setEnabled] = React.useState<Enabled>(
    () => ({ ...defaultEnabled(), ...(saved.enabled || {}) }));

  // persist settings (theme persists separately)
  React.useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ enabled, bgStyle, texture, title, paletteIdx }));
  }, [enabled, bgStyle, texture, title, paletteIdx]);

  const [history, setHistory] = React.useState(
    () => [generateTemplate(5, 1350, { ...defaultEnabled(), ...(saved.enabled || {}) })]);
  const [cursor, setCursor] = React.useState(0);
  const tpl = history[cursor];

  const [photos, setPhotos] = React.useState<(string | null)[]>(() => []);
  const [panzoom, setPanzoom] = React.useState<Record<number, any>>({});
  const [viewMode, setViewMode] = React.useState<ViewMode>("strip");
  const [tab, setTab] = React.useState("layouts");
  const [selected, setSelected] = React.useState<number | null>(null);
  const [zoom, setZoom] = React.useState(0.66);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [toast, setToast] = React.useState<{ msg: string; id: number } | null>(null);
  const [spinning, setSpinning] = React.useState(false);

  const pickerRef = React.useRef<HTMLInputElement>(null);
  const pendingSlot = React.useRef<number | null>(null);
  const toastTimer = React.useRef<number | undefined>(undefined);

  const showToast = (msg: string) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, id: Date.now() });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  };

  /* ----- template + history (undo / redo) ----- */
  const pushTemplate = (newTpl: any, preserve = false) => {
    setHistory(h => {
      const trimmed = h.slice(0, cursor + 1);
      const next = [...trimmed, newTpl];
      return next.length > 24 ? next.slice(next.length - 24) : next;
    });
    setCursor(c => Math.min(c + 1, 23));
    if (!preserve) { setPanzoom({}); setSelected(null); }
  };

  const regenerate = (nn = n, hh = H, en = enabled) => {
    setSpinning(true);
    setTimeout(() => setSpinning(false), 700);
    pushTemplate(generateTemplate(nn, hh, en));
  };

  const jumpTo = (i: number) => {
    const target = history[i];
    setCursor(i); setN(target.n); setH(target.H);
    setPanzoom({}); setSelected(null);
  };
  const undo = () => { if (cursor > 0) jumpTo(cursor - 1); };
  const redo = () => { if (cursor < history.length - 1) jumpTo(cursor + 1); };

  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (t === "input" || t === "textarea") {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      const z = e.key.toLowerCase() === "z";
      if ((e.metaKey || e.ctrlKey) && z) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (e.key === "Escape") {
        setSelected(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const changeN = (v: number) => {
    setN(v);
    pushTemplate(resizeTemplate(tpl, v, H, enabled), true);
  };
  const changeH = (v: number) => { setH(v); regenerate(n, v, enabled); };
  const togglePattern = (k: string) => {
    const next = { ...enabled, [k]: enabled[k] === false };
    setEnabled(next); regenerate(n, H, next);
  };

  /* ----- zoom ----- */
  const zoomStep = (dir: number) => setZoom(z => clamp(dir > 0 ? z * 1.15 : z / 1.15, 0.4, 3));
  const fitZoom = () => setZoom(1);

  /* ----- photos ----- */
  const fillEmpty = (srcs: string[]) => {
    setPhotos(prev => {
      const next = [...prev];
      let cur = 0;
      for (let i = 0; i < tpl.boxes.length && cur < srcs.length; i++) {
        if (!next[i]) next[i] = srcs[cur++];
      }
      if (cur < srcs.length) showToast("All slots are full — ⌥ click a photo to free one");
      else showToast(`Added ${srcs.length} photo${srcs.length > 1 ? "s" : ""}`);
      return next;
    });
  };

  const onPickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files || [])].filter(f => f.type.startsWith("image/"));
    e.target.value = "";
    if (!files.length) return;
    const srcs = files.map(f => URL.createObjectURL(f));
    const slot = pendingSlot.current;
    pendingSlot.current = null;
    if (slot !== null && srcs.length === 1) {
      setPhotos(prev => { const nx = [...prev]; nx[slot] = srcs[0]; return nx; });
      setPanzoom(pz => { const nx = { ...pz }; delete nx[slot]; return nx; });
    } else {
      fillEmpty(srcs);
    }
  };

  const openPicker = (slot: number | null) => { pendingSlot.current = slot; pickerRef.current?.click(); };

  const api = {
    photos, panzoom, interactive: true,
    onSelect: (i: number) => setSelected(i),
    onSlotClick: (i: number) => openPicker(i),
    onDropFile: (i: number, file: File) => {
      const src = URL.createObjectURL(file);
      setPhotos(prev => { const nx = [...prev]; nx[i] = src; return nx; });
      setPanzoom(pz => { const nx = { ...pz }; delete nx[i]; return nx; });
    },
    onRemove: (i: number) => {
      setPhotos(prev => { const nx = [...prev]; nx[i] = null; return nx; });
      setPanzoom(pz => { const nx = { ...pz }; delete nx[i]; return nx; });
      showToast("Photo removed");
    },
    onPan: (i: number, dx: number, dy: number, box: Box) => {
      setPanzoom(pz => {
        const cur = pz[i] || { x: 0, y: 0, z: 1 };
        const next = clampPan(box, { ...cur, x: cur.x + dx, y: cur.y + dy }, photos[i]);
        return { ...pz, [i]: next };
      });
    },
    onZoom: (i: number, f: number) => {
      setPanzoom(pz => {
        const cur = pz[i] || { x: 0, y: 0, z: 1 };
        return { ...pz, [i]: { ...cur, z: clamp(cur.z * f, 1, 4) } };
      });
    },
    rotateMode: tab === "crop",
    onRotate: (i: number, dDeg: number, box: Box) => {
      setPanzoom(pz => {
        const cur = pz[i] || { x: 0, y: 0, z: 1, r: 0 };
        const r = clamp((cur.r || 0) + dDeg, -45, 45);
        return { ...pz, [i]: clampPan(box, { ...cur, r }, photos[i]) };
      });
    },
  };

  /* inspector actions */
  const onZoomTo = (i: number, z: number) => setPanzoom(pz => {
    const cur = pz[i] || { x: 0, y: 0, z: 1 };
    return { ...pz, [i]: { ...cur, z } };
  });
  const onNudge = (i: number, dx: number, dy: number) => {
    const box = tpl.boxes[i];
    if (box) api.onPan(i, dx, dy, box);
  };
  const onFitPhoto = (i: number) => setPanzoom(pz => ({ ...pz, [i]: { x: 0, y: 0, z: 1, r: 0 } }));
  const onStraighten = (i: number, deg: number) => setPanzoom(pz => {
    const cur = pz[i] || { x: 0, y: 0, z: 1, r: 0 };
    const box = tpl.boxes[i];
    return { ...pz, [i]: clampPan(box, { ...cur, r: deg }, photos[i]) };
  });

  const onStageDrop = (e: React.DragEvent) => {
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith("image/"));
    if (files.length) fillEmpty(files.map(f => URL.createObjectURL(f)));
  };

  const selectPost = (i: number) => {
    // prefer a box that starts in this slide; else any box overlapping it (cross-slide span)
    const lo = i * SLIDE_W, hi = (i + 1) * SLIDE_W;
    let idx = tpl.boxes.findIndex((b: Box) => b.slide === i);
    if (idx < 0) idx = tpl.boxes.findIndex((b: Box) => b.x < hi && b.x + b.w > lo);
    if (idx >= 0) setSelected(idx);
    // scroll the actual post window into view (robust to centering + posts-mode gaps)
    const win = document.querySelectorAll(".slideWin")[i] as HTMLElement | undefined;
    win?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };
  const addPost = () => { if (n < 10) changeN(n + 1); };

  /* ----- derived ----- */
  const palette = PALETTES[paletteIdx];
  const offCount = ALL_KEYS.filter(k => enabled[k] === false).length;
  const activePost = selected != null && tpl.boxes[selected] ? tpl.boxes[selected].slide : null;

  return (
    <div className={"editor" + (ready ? " ready" : "")} data-theme={theme}
      data-dots="1"
      style={{ "--accent": ACCENT, "--morph": MORPH_MS + "ms" } as React.CSSProperties}>

      <TopBar docName={docName} onDocName={setDocName}
        theme={theme} onTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onUndo={undo} onRedo={redo} canUndo={cursor > 0} canRedo={cursor < history.length - 1}
        zoom={zoom} onZoomStep={zoomStep} onFit={fitZoom}
        viewMode={viewMode} onViewMode={setViewMode}
        onExport={() => setExportOpen(true)}
        onShuffle={() => regenerate()} spinning={spinning} />

      <div className="editorBody">
        <LeftRail tab={tab} onTab={setTab} />
        <LeftPanel tab={tab}
          enabled={enabled} onToggle={togglePattern} offCount={offCount}
          onShuffle={() => regenerate()} spinning={spinning}
          tpl={tpl} photos={photos} onAddPhotos={() => openPicker(null)}
          onSelectSlot={(i: number) => setSelected(i)} selected={selected}
          title={title} onTitle={setTitle}
          panzoom={panzoom} onStraighten={onStraighten} onFitPhoto={onFitPhoto} />

        <div className="workspace">
          <main className="canvasArea">
            <StripStage tpl={tpl} palette={palette} bgStyle={bgStyle} texture={texture}
              title={title} viewMode={viewMode} showGuides={true}
              api={api} onStageDrop={onStageDrop} zoom={zoom}
              selected={selected} onClearSelect={() => setSelected(null)} />
          </main>
          <BottomStrip tpl={tpl} palette={palette} bgStyle={bgStyle} texture={texture}
            title={title} api={api} activePost={activePost} onSelectPost={selectPost}
            onAddPost={addPost} n={n} />
        </div>

        <Inspector selected={selected} tpl={tpl} photos={photos} panzoom={panzoom}
          paletteIdx={paletteIdx} n={n} H={H} bgStyle={bgStyle} texture={texture}
          onPalette={setPaletteIdx} onN={changeN} onH={changeH}
          onBgStyle={setBgStyle} onTexture={setTexture}
          onReplace={openPicker} onRemove={api.onRemove}
          onZoomTo={onZoomTo} onNudge={onNudge} onFitPhoto={onFitPhoto}
          onStraighten={onStraighten} />
      </div>

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)}
        tpl={tpl} palette={palette} bgStyle={bgStyle} texture={texture} title={title} api={api}
        onConfirm={() => {
          setExportOpen(false);
          showToast(`${tpl.n} PNGs downloaded — upload them in order as one carousel`);
        }} />

      <Toast toast={toast} />
      <input ref={pickerRef} type="file" accept="image/*" multiple hidden onChange={onPickerChange} />
    </div>
  );
}
