import { useCallback } from 'react';
import { WHEEL } from './layout';
import { brandFont, usePaintedTexture } from './canvas';

// Printed details: tyre and rim lettering, fork decals, the head badge. Painted once on canvases.

/** text set around a circle, centred on the canvas, reading clockwise along the top */
function paintRing(
  ctx: CanvasRenderingContext2D,
  size: number,
  text: string,
  radius: number,
  px: number,
  colour: string,
) {
  brandFont(ctx, px, 700);
  ctx.fillStyle = colour;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0);
  // set the string twice, on opposite halves of the wheel
  for (const start of [-Math.PI / 2, Math.PI / 2]) {
    let a = start - total / radius / 2;
    chars.forEach((c, i) => {
      const half = widths[i] / radius / 2;
      a += half;
      ctx.save();
      ctx.translate(size / 2 + Math.cos(a) * radius, size / 2 + Math.sin(a) * radius);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(c, 0, 0);
      ctx.restore();
      a += half;
    });
  }
}

const RING = 2048;
/** the lettering planes span the tyre's outer diameter; canvas pixels per metre */
const SPAN = WHEEL.r * 2;
const PX = RING / SPAN;

/** sidewall and rim lettering, on both sides of a wheel; place inside the wheel so it turns with it */
export function WheelLettering() {
  const tyre = useCallback((ctx: CanvasRenderingContext2D, w: number) => {
    paintRing(ctx, w, 'RAKIT  TRAIL  29 × 2.4  ·  TUBELESS READY', (WHEEL.r - 0.021) * PX, 44, '#8c9396');
  }, []);
  const rim = useCallback((ctx: CanvasRenderingContext2D, w: number) => {
    paintRing(ctx, w, 'RAKIT  AL30  ·  29″', 0.2925 * PX, 22, '#d9dcdd');
  }, []);
  const tyreText = usePaintedTexture(RING, RING, tyre);
  const rimText = usePaintedTexture(RING, RING, rim);
  // the tyre's sidewall bulges to the tread width; the rim's flat face sits further in
  const layers = [
    { map: tyreText, z: WHEEL.tyreTube + 0.001 },
    { map: rimText, z: 0.0153 },
  ];
  return (
    <>
      {layers.flatMap(({ map, z }) =>
        [-1, 1].map((side) => (
          <mesh key={`${z}${side}`} position-z={side * z} rotation-y={side > 0 ? 0 : Math.PI}>
            <planeGeometry args={[SPAN, SPAN]} />
            <meshStandardMaterial
              map={map}
              transparent
              depthWrite={false}
              roughness={0.7}
              polygonOffset
              polygonOffsetFactor={-2}
            />
          </mesh>
        )),
      )}
    </>
  );
}

/** "RAKIT 160" down the outside of each fork lower; `axle` is the lower's end in the fork's frame */
export function ForkDecals({ axle }: { axle: number }) {
  const paint = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    brandFont(ctx, h * 0.7);
    ctx.fillStyle = '#f2c230';
    ctx.textBaseline = 'middle';
    ctx.fillText('RAKIT', w * 0.04, h * 0.52);
    brandFont(ctx, h * 0.42, 600);
    ctx.fillStyle = '#d9dcdd';
    ctx.textAlign = 'right';
    ctx.fillText('160', w * 0.96, h * 0.52);
  }, []);
  const texture = usePaintedTexture(512, 96, paint);
  const y = (axle - 0.19) / 2 + 0.01;
  return (
    <>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[0, y, side * (0.058 + 0.0232)]}
          rotation={[0, side > 0 ? 0 : Math.PI, Math.PI / 2]}
        >
          <planeGeometry args={[0.15, 0.15 * (96 / 512)]} />
          <meshStandardMaterial
            map={texture}
            transparent
            roughness={0.4}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      ))}
    </>
  );
}

/** the brand mark on the front of the head tube; place in the head tube's frame, y up the tube */
export function HeadBadge() {
  const paint = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = '#15181a';
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, 18);
    ctx.fill();
    ctx.strokeStyle = '#f2c230';
    ctx.lineWidth = 6;
    ctx.stroke();
    brandFont(ctx, h * 0.62);
    ctx.fillStyle = '#f2c230';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('R', w / 2, h * 0.53);
  }, []);
  const texture = usePaintedTexture(128, 160, paint);
  return (
    <mesh position={[0.0335, 0.085, 0]} rotation-y={Math.PI / 2}>
      <planeGeometry args={[0.026, 0.0325]} />
      <meshStandardMaterial map={texture} transparent metalness={0.6} roughness={0.3} />
    </mesh>
  );
}
