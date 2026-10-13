import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';

/**
 * A texture painted on a canvas: lettering in the brand typeface. It is painted again once the web font has
 * loaded, since the first paint may still use the fallback.
 */
export function usePaintedTexture(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [width, height]);

  useEffect(() => {
    let live = true;
    const draw = () => {
      if (!live) return;
      const canvas = texture.image as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, width, height);
      // each paint starts from a clean context: alignment or fill left over from the last one would carry over
      ctx.save();
      paint(ctx, width, height);
      ctx.restore();
      texture.needsUpdate = true;
    };
    draw();
    void document.fonts.load('800 100px "Archivo Variable"').then(draw);
    return () => {
      live = false;
    };
  }, [texture, paint, width, height]);

  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** set the brand face on a 2D context; `fontStretch` is not in every browser's canvas yet */
export function brandFont(ctx: CanvasRenderingContext2D, px: number, weight = 800) {
  ctx.font = `${weight} ${px}px "Archivo Variable", "Arial Narrow", Arial, sans-serif`;
  if ('fontStretch' in ctx) (ctx as { fontStretch: string }).fontStretch = 'expanded';
}

/** perceived lightness, 0–1, of a #rrggbb colour: decides whether lettering on it is dark or light */
export function lightness(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
