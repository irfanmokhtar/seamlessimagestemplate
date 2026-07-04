/* store.ts — IndexedDB persistence. Framework-agnostic (no React, no DOM
   beyond indexedDB). Two object stores:
     docs   — one record per carousel project (template history, settings,
              text blocks, panzoom, photo *ids*).
     photos — { id, blob } original image files, shared across docs and
              garbage-collected when no doc references them. */

import type { Template, Panzoom, TextBlock, Enabled, BgStyle, Texture } from "./types";

export interface DocRecord {
  id: string;
  name: string;
  updatedAt: number;
  history: Template[];
  cursor: number;
  n: number;
  H: number;
  paletteIdx: number;
  bgStyle: BgStyle;
  texture: Texture;
  enabled: Enabled;
  texts: TextBlock[];
  panzoom: Record<number, Panzoom>;
  photoIds: (string | null)[];
  poolIds?: string[]; // extra uploaded photos not assigned to any slot
  locks: boolean[];
}

const DB_NAME = "seamless";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = run(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

/* ---------- docs ---------- */

export const putDoc = (doc: DocRecord) => tx("docs", "readwrite", s => s.put(doc));
export const getDoc = (id: string) => tx<DocRecord | undefined>("docs", "readonly", s => s.get(id));
export const getAllDocs = () =>
  tx<DocRecord[]>("docs", "readonly", s => s.getAll())
    .then(docs => docs.sort((a, b) => b.updatedAt - a.updatedAt));

export async function deleteDoc(id: string): Promise<void> {
  await tx("docs", "readwrite", s => s.delete(id));
  await gcPhotos();
}

/* ---------- photos ---------- */

export const newId = () =>
  (crypto as any).randomUUID ? crypto.randomUUID() : `p${Date.now()}_${Math.random().toString(36).slice(2)}`;

export const putPhoto = (id: string, blob: Blob) =>
  tx("photos", "readwrite", s => s.put({ id, blob }));

export const getPhoto = (id: string) =>
  tx<{ id: string; blob: Blob } | undefined>("photos", "readonly", s => s.get(id))
    .then(rec => rec?.blob ?? null);

/* delete photo blobs no doc references anymore */
export async function gcPhotos(): Promise<void> {
  const docs = await getAllDocs();
  const referenced = new Set<string>();
  for (const d of docs) {
    for (const pid of d.photoIds || []) if (pid) referenced.add(pid);
    for (const pid of d.poolIds || []) if (pid) referenced.add(pid);
  }
  const ids = await tx<IDBValidKey[]>("photos", "readonly", s => s.getAllKeys());
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction("photos", "readwrite");
    const s = t.objectStore("photos");
    for (const id of ids) if (!referenced.has(String(id))) s.delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/* resolve a doc's photoIds to fresh object URLs (parallel array) */
export async function loadPhotoUrls(photoIds: (string | null)[]): Promise<(string | null)[]> {
  return Promise.all((photoIds || []).map(async pid => {
    if (!pid) return null;
    try {
      const blob = await getPhoto(pid);
      return blob ? URL.createObjectURL(blob) : null;
    } catch { return null; }
  }));
}
