/* Shared data model. Mirrors the runtime shapes produced by core.ts. */

export interface Box {
  id: number;
  slide: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  frame: "polaroid" | null;
  blurBg: boolean;
}

export interface Band {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Decor =
  | { kind: "ribbon"; y: number; h: number }
  | { kind: "circle"; cx: number; cy: number; r: number; stroke: boolean };

export interface Template {
  boxes: Box[];
  bands: Band[];
  decor: Decor[];
  layoutAt: string[];
  n: number;
  H: number;
}

export interface Palette {
  name: string;
  bg: string;
  ph: string;
  ink: string;
  text: string;
}

export interface Panzoom {
  x: number;
  y: number;
  z: number;
  r?: number; // content straighten angle, degrees
}

export type Enabled = Record<string, boolean>;

/* A free text block placed in strip coordinates. x/y is the anchor point
   (interpreted per `align`); size/letterSpacing are stored at the 1350-tall
   baseline and scaled by vs=H/1350 at render. color "auto" = palette text. */
export interface TextBlock {
  id: number;
  text: string;
  font: string;          // FontDef.id
  color: string;         // hex, or "auto"
  size: number;          // px @ H=1350
  weight: number;        // 400 | 500 | 600 | 700
  italic: boolean;
  letterSpacing: number; // px @ H=1350
  align: "left" | "center" | "right";
  upper: boolean;
  x: number;             // strip coords (anchor)
  y: number;             // strip coords (vertical center)
}

export type BgStyle = "flat" | "gradient" | "blurpano";
export type Texture = "none" | "grain" | "paper";
export type ViewMode = "strip" | "posts";

/* The interaction surface threaded from <App> down into the strip renderer.
   photos are src strings (null = empty slot); panzoom keyed by slot index. */
export interface StripApi {
  photos: (string | null)[];
  panzoom: Record<number, Panzoom>;
  interactive: boolean;
  rotateMode?: boolean; // canvas drag rotates content instead of panning
  onSelect?: (i: number) => void;
  onSlotClick?: (i: number) => void;
  onDropFile?: (i: number, file: File) => void;
  onRemove?: (i: number) => void;
  onPan?: (i: number, dx: number, dy: number, box: Box) => void;
  onZoom?: (i: number, f: number) => void;
  onRotate?: (i: number, dDeg: number, box: Box) => void;
  // text blocks
  texts?: TextBlock[];
  selText?: number | null;
  onTextSelect?: (id: number) => void;
  onTextMove?: (id: number, dx: number, dy: number) => void;
}
