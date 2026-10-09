import { useMemo } from 'react';
import { CanvasTexture } from 'three';

// One soft ellipse under the product. ContactShadows traced each part separately, which read as stains
// under the cups when the model is exploded.
export function GroundShadow({ y }: { y: number }) {
  const texture = useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(21,24,26,0.32)');
      g.addColorStop(0.55, 'rgba(21,24,26,0.12)');
      g.addColorStop(1, 'rgba(21,24,26,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    return new CanvasTexture(canvas);
  }, []);

  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[3.6, 1.3, 1]}>
      <planeGeometry />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}
