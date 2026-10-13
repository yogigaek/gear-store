import { Path, Quaternion, Shape, Vector3 } from 'three';
import type { P3 } from './layout';

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);

/** midpoint, length, and the rotation that turns `axis` onto the segment a → b */
export function span(a: P3, b: P3, axis: 'x' | 'y' = 'y') {
  const va = new Vector3(...a);
  const d = new Vector3(...b).sub(va);
  return {
    position: va.add(d.clone().multiplyScalar(0.5)),
    quaternion: new Quaternion().setFromUnitVectors(axis === 'x' ? X : Y, d.clone().normalize()),
    length: d.length(),
  };
}

/** a toothed ring in the x/y plane, extruded along z: chainring and cassette cogs */
export function gearShape(teeth: number, r: number, holes: { r: number; at: number; count: number } | null) {
  const shape = new Shape();
  const tooth = 0.0034;
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    const pts: [number, number][] = [
      [a0, r - tooth],
      [a0 + step * 0.3, r + tooth],
      [a0 + step * 0.55, r + tooth],
      [a0 + step * 0.85, r - tooth],
    ];
    pts.forEach(([a, rr], j) => {
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0 && j === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
  }
  shape.closePath();
  const bore = new Path();
  bore.absarc(0, 0, Math.min(0.018, r * 0.5), 0, Math.PI * 2, true);
  shape.holes.push(bore);
  if (holes) {
    for (let i = 0; i < holes.count; i++) {
      const a = (i / holes.count) * Math.PI * 2;
      const h = new Path();
      h.absarc(Math.cos(a) * holes.at, Math.sin(a) * holes.at, holes.r, 0, Math.PI * 2, true);
      shape.holes.push(h);
    }
  }
  return shape;
}
