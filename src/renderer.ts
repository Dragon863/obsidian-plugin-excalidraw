import type { ExcalidrawData, ExcalidrawElement, ExcalidrawPageOptions } from "./types";

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface ResolvedEmbed {
  html: string;
  href: string;
}

export interface EmbedOverlay {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  link: string;
  isWikilink: boolean;
  resolved?: ResolvedEmbed;
}

export interface RenderContext {
  resolvedEmbeds?: Record<string, ResolvedEmbed>;
  resolvedImages?: Record<string, string>;
}

export interface RenderMetadata {
  overlays: EmbedOverlay[];
  viewBox: { width: number; height: number; offsetX: number; offsetY: number };
}

/** Returns the bounds and HTML overlays needed around Excalidraw's exported SVG. */
export function getRenderMetadata(
  data: ExcalidrawData,
  opts: ExcalidrawPageOptions = {},
  ctx?: RenderContext,
): RenderMetadata {
  const elements = data.elements.filter((el) => !el.isDeleted);
  if (elements.length === 0) {
    return { overlays: [], viewBox: { width: 100, height: 100, offsetX: 0, offsetY: 0 } };
  }

  const padding = opts.exportPadding ?? 20;
  const bbox = computeBoundingBox(elements);
  const overlays = elements
    .filter((el) => el.type === "embeddable" || el.type === "iframe")
    .map((el) => {
      const link = (el.link as string) ?? "";
      return {
        id: el.id,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        link,
        isWikilink: link.startsWith("[["),
        resolved: ctx?.resolvedEmbeds?.[el.id],
      };
    });

  return {
    overlays,
    viewBox: {
      width: Math.ceil(bbox.width + padding * 2),
      height: Math.ceil(bbox.height + padding * 2),
      offsetX: -bbox.minX + padding,
      offsetY: -bbox.minY + padding,
    },
  };
}

function computeBoundingBox(elements: ExcalidrawElement[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    for (const [x, y] of getElementCorners(el)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
  }

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function getElementCorners(el: ExcalidrawElement): Array<[number, number]> {
  if ((el.type === "line" || el.type === "arrow" || el.type === "freedraw") && el.points) {
    return el.points.map(([px, py]) => [el.x + px, el.y + py]);
  }

  const corners: Array<[number, number]> = [
    [el.x, el.y],
    [el.x + el.width, el.y],
    [el.x + el.width, el.y + el.height],
    [el.x, el.y + el.height],
  ];

  if (!el.angle) return corners;

  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const cos = Math.cos(el.angle);
  const sin = Math.sin(el.angle);
  return corners.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
  });
}
