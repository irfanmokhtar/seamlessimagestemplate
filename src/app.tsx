/* app.tsx — Seamless editor: state, wiring, layout.
   Screens: gallery (saved projects, IndexedDB) ⇄ editor (one doc, autosaved). */

import React from "react";
import {
  PATTERNS, DECOR_KEYS, PALETTES, SLIDE_W, generateTemplate, resizeTemplate,
  shuffleTemplate, setSlideLayout, addSlot, removeSlot, newTextBlock,
  encodeLook, decodeLook, newSeed,
} from "./core";
import { clampPan } from "./strip";
import { StripStage } from "./strip";
import { TopBar, LeftRail, LeftPanel, Inspector, BottomStrip } from "./panels";
import { ExportModal, Toast } from "./modal";
import { Gallery } from "./gallery";
import {
  DocRecord, putDoc, getAllDocs, deleteDoc, newId, putPhoto, loadPhotoUrls, gcPhotos,
} from "./store";
import type { Box, Enabled, BgStyle, Texture, ViewMode, TextBlock, Template } from "./types";

const ALL_KEYS = [...Object.keys(PATTERNS), ...DECOR_KEYS];
// ribbon + circles decor start off — they read as busy on a fresh canvas
const defaultEnabled = (): Enabled =>
  Object.fromEntries(ALL_KEYS.map(k => [k, k !== "ribbon" && k !== "arcs"]));

const ACCENT = "#1E9E72";
const MORPH_MS = 600;
const MIN_BOX = 160;   // strip px
const SNAP_TOL = 14;   // strip px

const STORE_KEY = "seamless_settings";
const THEME_KEY = "seamless_theme";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function loadSettings(): any {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null") || {}; }
  catch { return {}; }
}
const saved = loadSettings();

/* Rearrange an index-keyed asset array to follow a box-index map produced by
   shuffleTemplate/setSlideLayout: kept boxes keep their asset, new boxes soak
   up the displaced assets in order. */
function remapArr<T>(old: (T | null)[], map: number[]): (T | null)[] {
  const used = new Set(map.filter(m => m >= 0));
  const leftovers: T[] = [];
  old.forEach((v, i) => { if (v != null && !used.has(i)) leftovers.push(v as T); });
  return map.map(m => (m >= 0 ? old[m] ?? null : leftovers.shift() ?? null));
}

const snapTo = (v: number, targets: number[], tol = SNAP_TOL) => {
  let best = v, bd = tol;
  for (const t of targets) {
    const d = Math.abs(v - t);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
};

export function App() {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  const [theme, setTheme] = React.useState<string>(
    () => localStorage.getItem(THEME_KEY) || "dark");
  React.useEffect(() => { localStorage.setItem(THEME_KEY, theme); }, [theme]);

  /* ----- screens + docs ----- */
  const [screen, setScreen] = React.useState<"loading" | "gallery" | "editor">("loading");
  const [docs, setDocs] = React.useState<DocRecord[]>([]);
  const [docId, setDocId] = React.useState<string | null>(null);

  const [docName, setDocName] = React.useState("Untitled carousel");
  const [n, setN] = React.useState(5);
  const [H, setH] = React.useState(1350);
  const [paletteIdx, setPaletteIdx] = React.useState<number>(
    () => (Number.isInteger(saved.paletteIdx) && PALETTES[saved.paletteIdx]) ? saved.paletteIdx : 0);
  const [bgStyle, setBgStyle] = React.useState<BgStyle>(
    () => saved.bgStyle === "white" ? "flat" : (saved.bgStyle || "flat"));
  const [texture, setTexture] = React.useState<Texture>(() => saved.texture || "grain");
  const [texts, setTexts] = React.useState<TextBlock[]>([]);
  const [enabled, setEnabled] = React.useState<Enabled>(
    () => ({ ...defaultEnabled(), ...(saved.enabled || {}) }));
  const [locks, setLocks] = React.useState<boolean[]>([]);
  const [slideBg, setSlideBg] = React.useState<(string | null)[]>([]);

  // global defaults for new docs (theme persists separately; docs persist in IndexedDB)
  React.useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ enabled, bgStyle, texture, paletteIdx }));
  }, [enabled, bgStyle, texture, paletteIdx]);

  const [history, setHistory] = React.useState<Template[]>(
    () => [generateTemplate(5, 1350, { ...defaultEnabled(), ...(saved.enabled || {}) })]);
  const [cursor, setCursor] = React.useState(0);
  const [draft, setDraft] = React.useState<Template | null>(null); // live box-edit gesture
  const draftRef = React.useRef<Template | null>(null);
  const setDraft2 = (t: Template | null) => { draftRef.current = t; setDraft(t); };
  const tpl = draft ?? history[cursor];

  const [photos, setPhotos] = React.useState<(string | null)[]>(() => []);
  const [photoIds, setPhotoIds] = React.useState<(string | null)[]>(() => []);
  // pool = extra uploaded photos not assigned to any slot (reservoir for
  // shuffle-fill + manual placement). Kept separate from the slot arrays.
  const [pool, setPool] = React.useState<{ id: string; url: string }[]>(() => []);
  const [panzoom, setPanzoom] = React.useState<Record<number, any>>({});
  const [viewMode, setViewMode] = React.useState<ViewMode>("strip");
  const [tab, setTab] = React.useState("layouts");
  const [selected, setSelected] = React.useState<number | null>(null);
  const [selText, setSelText] = React.useState<number | null>(null);
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

  /* ----- boot: share link → fresh doc; else gallery ----- */
  React.useEffect(() => {
    const m = location.hash.match(/^#look=(.+)$/);
    if (m) {
      const look = decodeLook(m[1]);
      history_replaceHash();
      if (look) {
        openNewDoc(look);
        showToast("Shared look loaded — drop in your photos");
        return;
      }
    }
    getAllDocs()
      .then(ds => { setDocs(ds); setScreen("gallery"); })
      .catch(() => setScreen("gallery"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const history_replaceHash = () =>
    window.history.replaceState(null, "", location.pathname + location.search);

  /* ----- doc lifecycle ----- */
  const hydrate = (rec: DocRecord, urls: (string | null)[], poolUrls: { id: string; url: string }[] = []) => {
    setDocId(rec.id);
    setDocName(rec.name);
    setHistory(rec.history?.length ? rec.history : [generateTemplate(rec.n, rec.H, rec.enabled)]);
    setCursor(Math.min(rec.cursor ?? 0, (rec.history?.length ?? 1) - 1));
    setDraft2(null);
    setN(rec.n); setH(rec.H);
    setPaletteIdx(PALETTES[rec.paletteIdx] ? rec.paletteIdx : 0);
    setBgStyle(rec.bgStyle || "flat");
    setTexture(rec.texture || "grain");
    setEnabled({ ...defaultEnabled(), ...(rec.enabled || {}) });
    setTexts(Array.isArray(rec.texts) ? rec.texts : []);
    setPanzoom(rec.panzoom || {});
    setLocks(rec.locks || []);
    setSlideBg(rec.slideBg || []);
    setPhotoIds(rec.photoIds || []);
    setPhotos(urls);
    setPool(poolUrls);
    setSelected(null); setSelText(null);
    setViewMode("strip"); setTab("layouts");
    setScreen("editor");
  };

  const openDoc = async (rec: DocRecord) => {
    const urls = await loadPhotoUrls(rec.photoIds || []);
    const poolResolved = await loadPhotoUrls(rec.poolIds || []);
    const poolUrls = (rec.poolIds || [])
      .map((id, i) => ({ id, url: poolResolved[i] }))
      .filter((p): p is { id: string; url: string } => !!p.id && !!p.url);
    hydrate(rec, urls, poolUrls);
  };

  const openNewDoc = (look?: ReturnType<typeof decodeLook>) => {
    const en = look?.enabled ? { ...defaultEnabled(), ...look.enabled } : { ...defaultEnabled(), ...(saved.enabled || {}) };
    const nn = look?.n ?? 5;
    const hh = look?.H ?? 1350;
    const tpl0 = generateTemplate(nn, hh, en, look?.seed);
    const rec: DocRecord = {
      id: newId(),
      name: "Untitled carousel",
      updatedAt: Date.now(),
      history: [tpl0],
      cursor: 0,
      n: nn, H: hh,
      paletteIdx: look?.paletteIdx ?? paletteIdx,
      bgStyle: (look?.bgStyle as BgStyle) ?? bgStyle,
      texture: (look?.texture as Texture) ?? texture,
      enabled: en,
      texts: look?.texts ?? [],
      panzoom: {},
      photoIds: [],
      poolIds: [],
      locks: [],
      slideBg: [],
    };
    hydrate(rec, [], []);
  };

  /* autosave (debounced) — everything a doc needs to reopen exactly */
  const saveTimer = React.useRef<number | undefined>(undefined);
  const buildRec = (): DocRecord | null => {
    if (!docId) return null;
    return {
      id: docId, name: docName, updatedAt: Date.now(),
      history, cursor, n, H, paletteIdx, bgStyle, texture, enabled,
      texts, panzoom, photoIds, poolIds: pool.map(p => p.id), locks, slideBg,
    };
  };
  const buildRecRef = React.useRef(buildRec);
  buildRecRef.current = buildRec;
  React.useEffect(() => {
    if (screen !== "editor" || !docId) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const rec = buildRecRef.current();
      if (rec) putDoc(rec).catch(() => { /* quota/blocked — editor keeps working */ });
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [screen, docId, docName, history, cursor, n, H, paletteIdx, bgStyle, texture,
    enabled, texts, panzoom, photoIds, pool, locks, slideBg]);

  const goHome = async () => {
    const rec = buildRecRef.current();
    if (rec) await putDoc(rec).catch(() => {});
    const ds = await getAllDocs().catch(() => [] as DocRecord[]);
    setDocs(ds);
    setScreen("gallery");
  };

  const duplicateDoc = async (d: DocRecord) => {
    const copy: DocRecord = { ...d, id: newId(), name: d.name + " copy", updatedAt: Date.now() };
    await putDoc(copy);
    setDocs(await getAllDocs());
  };
  const removeDoc = async (d: DocRecord) => {
    await deleteDoc(d.id);
    setDocs(await getAllDocs());
  };

  /* ----- template + history (undo / redo) ----- */
  const pushTemplate = (newTpl: Template, preserve = false) => {
    setHistory(h => {
      const trimmed = h.slice(0, cursor + 1);
      const next = [...trimmed, newTpl];
      return next.length > 24 ? next.slice(next.length - 24) : next;
    });
    setCursor(c => Math.min(c + 1, 23));
    if (!preserve) { setPanzoom({}); setSelected(null); }
  };

  const applyMap = (map: number[]) => {
    setPhotos(prev => remapArr(prev, map));
    setPhotoIds(prev => remapArr(prev, map));
    setPanzoom(prev => {
      const nx: Record<number, any> = {};
      map.forEach((m, j) => { if (m >= 0 && prev[m]) nx[j] = prev[m]; });
      return nx;
    });
  };

  const regenerate = (nn = n, hh = H, en = enabled) => {
    setSpinning(true);
    setTimeout(() => setSpinning(false), 700);
    if (nn === tpl.n && hh === tpl.H) {
      // shuffle in place — locked slides keep boxes AND their photos
      const { tpl: next, map } = shuffleTemplate(tpl, en, locks);
      if (map) {
        // remap keeps existing photos glued to surviving boxes …
        const newPhotos = remapArr(photos, map);
        const newIds = remapArr(photoIds, map);
        const newPz: Record<number, any> = {};
        map.forEach((m, j) => { if (m >= 0 && panzoom[m]) newPz[j] = panzoom[m]; });
        // … then fill any empty unlocked slot from the pool (random pick)
        const bag = shuffleArr(pool);
        const taken = new Set<string>();
        next.boxes.forEach((b: Box, i: number) => {
          if (!newPhotos[i] && !locks[b.slide] && bag.length) {
            const e = bag.shift()!;
            newPhotos[i] = e.url; newIds[i] = e.id; taken.add(e.id);
          }
        });
        setPhotos(newPhotos); setPhotoIds(newIds); setPanzoom(newPz);
        if (taken.size) setPool(p => p.filter(e => !taken.has(e.id)));
        pushTemplate(next, true); setSelected(null);
      } else pushTemplate(next);
    } else {
      pushTemplate(generateTemplate(nn, hh, en));
    }
  };

  const jumpTo = (i: number) => {
    const target = history[i];
    setCursor(i); setN(target.n); setH(target.H);
    setDraft2(null);
    setPanzoom({}); setSelected(null);
  };
  const undo = () => { if (cursor > 0) jumpTo(cursor - 1); };
  const redo = () => { if (cursor < history.length - 1) jumpTo(cursor + 1); };

  /* ----- keyboard ----- */
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const t = el?.tagName?.toLowerCase();
      if (t === "input" || t === "textarea" || el?.isContentEditable) {
        if (e.key === "Escape" && !el.isContentEditable) el.blur();
        return;
      }
      if (screen !== "editor") return;
      const z = e.key.toLowerCase() === "z";
      if ((e.metaKey || e.ctrlKey) && z) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (e.key === "Escape") {
        setSelected(null); setSelText(null);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        if (selText != null) { e.preventDefault(); removeText(selText); }
        else if (selected != null) { e.preventDefault(); deleteSlot(selected); }
      } else if (e.key.startsWith("Arrow") && selText != null) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        setTexts(ts => ts.map(tb => tb.id === selText ? { ...tb, x: tb.x + dx, y: tb.y + dy } : tb));
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const changeN = (v: number) => {
    setN(v);
    setLocks(l => l.slice(0, v));
    setSlideBg(b => b.slice(0, v));
    pushTemplate(resizeTemplate(tpl, v, H, enabled), true);
  };

  const pickBg = (slide: number, hex: string | null) => {
    setSlideBg(prev => {
      const nx = prev.slice();
      while (nx.length < n) nx.push(null);
      nx[slide] = hex;
      return nx;
    });
  };
  const changeH = (v: number) => { setH(v); regenerate(n, v, enabled); };
  const togglePattern = (k: string) => {
    const next = { ...enabled, [k]: enabled[k] === false };
    setEnabled(next); regenerate(n, H, next);
  };

  /* ----- locks + per-slide layout ----- */
  const toggleLock = (i: number) => {
    setLocks(l => {
      const nx = l.slice();
      while (nx.length < n) nx.push(false);
      nx[i] = !nx[i];
      return nx;
    });
  };
  const pickLayout = (slide: number, type: string) => {
    const { tpl: next, map } = setSlideLayout(tpl, slide, type);
    applyMap(map);
    pushTemplate(next, true);
    setSelected(null);
  };

  /* ----- zoom ----- */
  const zoomStep = (dir: number) => setZoom(z => clamp(dir > 0 ? z * 1.15 : z / 1.15, 0.4, 3));
  const fitZoom = () => setZoom(1);

  /* ----- photos (stored as blobs in IndexedDB, object URLs in state) ----- */
  const registerFile = async (file: File): Promise<{ id: string; url: string }> => {
    const id = newId();
    putPhoto(id, file).catch(() => {});
    return { id, url: URL.createObjectURL(file) };
  };

  const setSlotPhoto = async (i: number, file: File) => {
    const { id, url } = await registerFile(file);
    setPhotos(prev => { const nx = [...prev]; nx[i] = url; return nx; });
    setPhotoIds(prev => { const nx = [...prev]; nx[i] = id; return nx; });
    setPanzoom(pz => { const nx = { ...pz }; delete nx[i]; return nx; });
  };

  const fillEmpty = async (files: File[]) => {
    const entries = await Promise.all(files.map(registerFile));
    // fill empty slots in order; the rest overflow into the pool
    const emptyIdx: number[] = [];
    for (let i = 0; i < tpl.boxes.length; i++) if (!photos[i]) emptyIdx.push(i);
    const place = entries.slice(0, emptyIdx.length);
    const overflow = entries.slice(emptyIdx.length);
    if (place.length) {
      setPhotos(prev => { const nx = [...prev]; place.forEach((e, k) => nx[emptyIdx[k]] = e.url); return nx; });
      setPhotoIds(prev => { const nx = [...prev]; place.forEach((e, k) => nx[emptyIdx[k]] = e.id); return nx; });
    }
    if (overflow.length) setPool(p => [...p, ...overflow.map(e => ({ id: e.id, url: e.url }))]);
    const parts: string[] = [];
    if (place.length) parts.push(`${place.length} placed`);
    if (overflow.length) parts.push(`${overflow.length} to pool`);
    showToast(`Added ${entries.length} photo${entries.length > 1 ? "s" : ""}` +
      (parts.length ? ` · ${parts.join(" · ")}` : ""));
  };

  /* ----- pool ↔ slots ----- */
  const shuffleArr = <T,>(arr: T[]): T[] => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // move a pool photo into a slot; any photo it displaces returns to the pool
  const poolToSlot = (poolIdx: number, slot: number) => {
    const p = pool[poolIdx];
    if (!p || !tpl.boxes[slot]) return;
    const prevId = photoIds[slot], prevUrl = photos[slot];
    setPhotos(a => { const nx = [...a]; nx[slot] = p.url; return nx; });
    setPhotoIds(a => { const nx = [...a]; nx[slot] = p.id; return nx; });
    setPanzoom(pz => { const nx = { ...pz }; delete nx[slot]; return nx; });
    setPool(cur => {
      const nx = cur.filter((_, k) => k !== poolIdx);
      if (prevId) nx.push({ id: prevId, url: prevUrl as string });
      return nx;
    });
  };

  // click a pool photo: drop it into the selected slot, else the first empty one
  const usePoolPhoto = (poolIdx: number) => {
    let slot = (selected != null && tpl.boxes[selected]) ? selected : -1;
    if (slot < 0) slot = tpl.boxes.findIndex((_b: Box, i: number) => !photos[i]);
    if (slot < 0) { showToast("Select a slot to place it in"); return; }
    poolToSlot(poolIdx, slot);
  };

  const removePoolPhoto = (poolIdx: number) =>
    setPool(p => p.filter((_, k) => k !== poolIdx));

  // pull a slot's photo out into the pool, leaving the slot empty
  const slotToPool = (slot: number) => {
    const id = photoIds[slot], url = photos[slot];
    if (!id) return;
    setPhotos(a => { const nx = [...a]; nx[slot] = null; return nx; });
    setPhotoIds(a => { const nx = [...a]; nx[slot] = null; return nx; });
    setPanzoom(pz => { const nx = { ...pz }; delete nx[slot]; return nx; });
    setPool(p => [...p, { id, url: url as string }]);
  };

  const onPickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files || [])].filter(f => f.type.startsWith("image/"));
    e.target.value = "";
    if (!files.length) return;
    const slot = pendingSlot.current;
    pendingSlot.current = null;
    if (slot !== null && files.length === 1) setSlotPhoto(slot, files[0]);
    else fillEmpty(files);
  };

  const openPicker = (slot: number | null) => { pendingSlot.current = slot; pickerRef.current?.click(); };

  const swapSlots = (i: number, j: number) => {
    if (i === j) return;
    const sw = <T,>(arr: (T | null)[]) => {
      const nx = [...arr];
      while (nx.length <= Math.max(i, j)) nx.push(null);
      [nx[i], nx[j]] = [nx[j], nx[i]];
      return nx;
    };
    setPhotos(sw); setPhotoIds(sw);
    setPanzoom(pz => {
      const nx = { ...pz };
      const a = nx[i]; const b = nx[j];
      if (b) nx[i] = b; else delete nx[i];
      if (a) nx[j] = a; else delete nx[j];
      return nx;
    });
    showToast(`Swapped slots ${i + 1} ↔ ${j + 1}`);
  };

  /* ----- direct box manipulation (draft = live gesture, commit on release) ----- */
  const stripW = tpl.n * SLIDE_W;
  const snapTargets = (skip: number) => {
    const xs: number[] = [], ys: number[] = [0, tpl.H];
    for (let k = 0; k <= tpl.n; k++) xs.push(k * SLIDE_W);
    tpl.boxes.forEach((b, k) => {
      if (k === skip) return;
      xs.push(b.x, b.x + b.w);
      ys.push(b.y, b.y + b.h);
    });
    return { xs, ys };
  };

  const editBox = (i: number, fn: (b: Box) => Box) => {
    const base = draftRef.current ?? history[cursor];
    const boxes = base.boxes.slice();
    if (!boxes[i]) return;
    boxes[i] = { ...fn(boxes[i]), manual: true };
    setDraft2({ ...base, boxes });
  };

  const onBoxMove = (i: number, dx: number, dy: number) => editBox(i, b => {
    const { xs, ys } = snapTargets(i);
    let x = b.x + dx, y = b.y + dy;
    const sx = snapTo(x, xs); if (sx !== x) x = sx;
    else { const sr = snapTo(x + b.w, xs); if (sr !== x + b.w) x = sr - b.w; }
    const sy = snapTo(y, ys); if (sy !== y) y = sy;
    else { const sb = snapTo(y + b.h, ys); if (sb !== y + b.h) y = sb - b.h; }
    x = clamp(x, 0, stripW - b.w);
    y = clamp(y, 0, tpl.H - b.h);
    return { ...b, x: Math.round(x), y: Math.round(y) };
  });

  const onBoxResize = (i: number, corner: string, dx: number, dy: number) => editBox(i, b => {
    const { xs, ys } = snapTargets(i);
    let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
    if (corner.includes("l")) x0 = snapTo(clamp(x0 + dx, 0, x1 - MIN_BOX), xs);
    if (corner.includes("r")) x1 = snapTo(clamp(x1 + dx, x0 + MIN_BOX, stripW), xs);
    if (corner.includes("t")) y0 = snapTo(clamp(y0 + dy, 0, y1 - MIN_BOX), ys);
    if (corner.includes("b")) y1 = snapTo(clamp(y1 + dy, y0 + MIN_BOX, tpl.H), ys);
    if (x1 - x0 < MIN_BOX || y1 - y0 < MIN_BOX) return b;
    return { ...b, x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
  });

  const onBoxEditEnd = () => {
    const d = draftRef.current;
    if (!d) return;
    setDraft2(null);
    pushTemplate(d, true); // one undo step per gesture
  };

  const deleteSlot = (i: number) => {
    if (!tpl.boxes[i]) return;
    const next = removeSlot(tpl, i);
    // assets follow their boxes: splice the same index out of every parallel store
    setPhotos(prev => prev.filter((_, k) => k !== i));
    setPhotoIds(prev => prev.filter((_, k) => k !== i));
    setPanzoom(prev => {
      const nx: Record<number, any> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki === i) return;
        nx[ki > i ? ki - 1 : ki] = v;
      });
      return nx;
    });
    setSelected(null);
    pushTemplate(next, true);
    showToast("Slot removed");
  };

  const addSlotHere = () => {
    const slide = activePost ?? 0;
    pushTemplate(addSlot(tpl, slide), true);
    setSelected(tpl.boxes.length); // the appended box
    showToast("Slot added — ⌘-drag to move, corners to resize");
  };

  const api = {
    photos, panzoom, interactive: true,
    texts, selText,
    onTextSelect: (id: number) => { setSelText(id); setSelected(null); setTab("text"); },
    onTextMove: (id: number, dx: number, dy: number) =>
      setTexts(ts => ts.map(t => t.id === id ? { ...t, x: t.x + dx, y: t.y + dy } : t)),
    onTextEdit: (id: number, text: string) =>
      setTexts(ts => ts.map(t => t.id === id ? { ...t, text } : t)),
    onSelect: (i: number) => { setSelected(i); setSelText(null); },
    onSlotClick: (i: number) => openPicker(i),
    onDropFile: (i: number, file: File) => { setSlotPhoto(i, file); },
    onRemove: (i: number) => {
      setPhotos(prev => { const nx = [...prev]; nx[i] = null; return nx; });
      setPhotoIds(prev => { const nx = [...prev]; nx[i] = null; return nx; });
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
    onBoxMove, onBoxResize, onBoxEditEnd,
    onSwap: swapSlots,
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

  /* ----- text blocks ----- */
  const addText = (partial: Partial<TextBlock> = {}) => {
    // drop new block near the top-centre of the post currently in view
    const slide = activePost ?? 0;
    const block = newTextBlock({
      x: slide * SLIDE_W + SLIDE_W / 2, y: H * 0.16, ...partial,
    });
    setTexts(ts => [...ts, block]);
    setSelText(block.id); setSelected(null);
    if (tab !== "text") setTab("text");
  };
  const updateText = (id: number, patch: Partial<TextBlock>) =>
    setTexts(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
  const removeText = (id: number) => {
    setTexts(ts => ts.filter(t => t.id !== id));
    setSelText(s => s === id ? null : s);
  };
  const duplicateText = (id: number) => {
    const src = texts.find(t => t.id === id);
    if (!src) return;
    const { id: _omit, ...rest } = src;
    const block = newTextBlock({ ...rest, x: src.x + 40, y: src.y + 40 });
    setTexts(ts => [...ts, block]);
    setSelText(block.id);
  };
  const selectText = (id: number) => { setSelText(id); setSelected(null); };

  /* ----- share look ----- */
  const shareLook = async () => {
    const code = encodeLook({
      seed: tpl.seed ?? newSeed(), n, H, enabled, paletteIdx, bgStyle, texture, texts,
    });
    const url = `${location.origin}${location.pathname}#look=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Share link copied — same layout, colors & text on open");
    } catch {
      window.prompt("Copy this share link:", url);
    }
  };

  const onStageDrop = (e: React.DragEvent) => {
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith("image/"));
    if (files.length) fillEmpty(files);
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

  if (screen === "loading") {
    return <div className="editor" data-theme={theme} />;
  }

  if (screen === "gallery") {
    return (
      <>
        <Gallery docs={docs} theme={theme}
          onTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          onOpen={openDoc} onNew={() => openNewDoc()}
          onDelete={removeDoc} onDuplicate={duplicateDoc} />
        <Toast toast={toast} />
      </>
    );
  }

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
        onShuffle={() => regenerate()} spinning={spinning}
        onHome={goHome} />

      <div className="editorBody">
        <LeftRail tab={tab} onTab={setTab} />
        <LeftPanel tab={tab}
          enabled={enabled} onToggle={togglePattern} offCount={offCount}
          onShuffle={() => regenerate()} spinning={spinning}
          tpl={tpl} photos={photos} onAddPhotos={() => openPicker(null)}
          onSelectSlot={(i: number) => { setSelected(i); setSelText(null); }} selected={selected}
          onSwapSlots={swapSlots} onAddSlot={addSlotHere}
          pool={pool} onUsePool={usePoolPhoto} onPoolToSlot={poolToSlot}
          onRemovePool={removePoolPhoto} onSlotToPool={slotToPool}
          texts={texts} selText={selText} onAddText={addText} onUpdateText={updateText}
          onRemoveText={removeText} onSelectText={selectText} onDuplicateText={duplicateText}
          panzoom={panzoom} onStraighten={onStraighten} onFitPhoto={onFitPhoto} />

        <div className="workspace">
          <main className="canvasArea">
            <StripStage tpl={tpl} palette={palette} bgStyle={bgStyle} texture={texture}
              texts={texts} viewMode={viewMode} showGuides={true} slideBg={slideBg}
              api={api} onStageDrop={onStageDrop} zoom={zoom}
              selected={selected} onClearSelect={() => { setSelected(null); setSelText(null); }} />
          </main>
          <BottomStrip tpl={tpl} palette={palette} bgStyle={bgStyle} texture={texture}
            texts={texts} api={api} activePost={activePost} onSelectPost={selectPost}
            onAddPost={addPost} n={n}
            locks={locks} slideBg={slideBg} onToggleLock={toggleLock}
            onPickLayout={pickLayout} onPickBg={pickBg} />
        </div>

        <Inspector selected={selected} tpl={tpl} photos={photos} panzoom={panzoom}
          paletteIdx={paletteIdx} n={n} H={H} bgStyle={bgStyle} texture={texture}
          onPalette={setPaletteIdx} onN={changeN} onH={changeH}
          onBgStyle={setBgStyle} onTexture={setTexture}
          onReplace={openPicker} onRemove={api.onRemove}
          onZoomTo={onZoomTo} onNudge={onNudge} onFitPhoto={onFitPhoto}
          onStraighten={onStraighten}
          onShare={shareLook} onDeleteSlot={deleteSlot} />
      </div>

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)}
        tpl={tpl} palette={palette} bgStyle={bgStyle} texture={texture} texts={texts} api={api}
        docName={docName} slideBg={slideBg}
        onConfirm={(msg: string) => {
          setExportOpen(false);
          showToast(msg);
        }} />

      <Toast toast={toast} />
      <input ref={pickerRef} type="file" accept="image/*" multiple hidden onChange={onPickerChange} />
    </div>
  );
}
