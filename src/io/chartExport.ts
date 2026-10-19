/** Rasterise rendered charts (Victory SVG) to downloadable PNGs. */

import { downloadBlob } from './writers';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BACKGROUND = '#0d0f14';
const PADDING = 12;
const SCALE = 2;
const MIN_SIZE = 40;

export interface ChartExportResult {
  exported: number;
  failed: number;
}

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not rasterise the chart'));
    image.src = url;
  });

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

const svgSize = (svg: SVGSVGElement): { width: number; height: number } => {
  const rect = svg.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return { width: rect.width, height: rect.height };
  const width = parseFloat(svg.getAttribute('width') ?? '');
  const height = parseFloat(svg.getAttribute('height') ?? '');
  return { width: Number.isFinite(width) ? width : 0, height: Number.isFinite(height) ? height : 0 };
};

const renderPng = async (svg: SVGSVGElement): Promise<Blob> => {
  const { width, height } = svgSize(svg);
  if (width < MIN_SIZE || height < MIN_SIZE) throw new Error('Chart has no drawable area');

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  // Inherited fonts are not part of the serialised markup, so pin them.
  const family = getComputedStyle(svg).fontFamily;
  if (family) clone.style.fontFamily = family;

  const markup = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await loadImage(svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((width + PADDING * 2) * SCALE);
    canvas.height = Math.ceil((height + PADDING * 2) * SCALE);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(SCALE, SCALE);
    ctx.drawImage(image, PADDING, PADDING, width, height);
    const blob = await canvasToBlob(canvas);
    if (!blob) throw new Error('PNG encoding failed');
    return blob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
};

/**
 * Export every rendered chart inside `root` as a separate PNG.
 * Charts are drawn sequentially so large reports do not spike memory.
 */
export const exportChartsAsPng = async (
  root: ParentNode,
  baseName = 'lazstats-chart'
): Promise<ChartExportResult> => {
  const charts = Array.from(root.querySelectorAll('svg')).filter((svg) => {
    if (svg.closest('[data-no-export]')) return false;
    const svgEl = svg as SVGSVGElement;
    const { width, height } = svgSize(svgEl);
    return width >= MIN_SIZE && height >= MIN_SIZE;
  });

  let exported = 0;
  let failed = 0;
  for (let i = 0; i < charts.length; i += 1) {
    try {
      const blob = await renderPng(charts[i] as SVGSVGElement);
      const suffix = charts.length > 1 ? `-${i + 1}` : '';
      downloadBlob(blob, `${baseName}${suffix}.png`);
      exported += 1;
    } catch {
      failed += 1;
    }
    // Give the download manager a tick between files.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { exported, failed };
};
