import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { GroundShadow } from './GroundShadow';
import { HeadphoneModel } from './HeadphoneModel';

export interface ProductViewerProps {
  explode: number;
  shellColor: string;
  showLabels?: boolean;
  assembleOnMount?: boolean;
  interactive?: boolean;
  label: string;
}

// Default export so it can be React.lazy-loaded: three.js stays out of the first bundle.
export default function ProductViewer({
  explode,
  shellColor,
  showLabels = false,
  assembleOnMount = false,
  interactive = true,
  label,
}: ProductViewerProps) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [0, 0.3, 5.2], fov: 38 }}
      gl={{ antialias: true, alpha: true }}
      aria-label={label}
      role="img"
    >
      <hemisphereLight args={['#ffffff', '#b9bfc2', 1.8]} />
      <directionalLight position={[3, 4, 5]} intensity={3} />
      <directionalLight position={[-4, 2, 3]} intensity={1.2} />
      {/* rim light from behind: keeps the silhouette readable on the darkest finish */}
      <directionalLight position={[0, 3, -5]} intensity={2.4} />
      <HeadphoneModel
        explode={explode}
        shellColor={shellColor}
        showLabels={showLabels}
        assembleOnMount={assembleOnMount}
      />
      <GroundShadow y={-1.0} />
      {interactive && (
        <OrbitControls
          enablePan={false}
          minDistance={3}
          maxDistance={7}
          minPolarAngle={Math.PI * 0.2}
          maxPolarAngle={Math.PI * 0.62}
        />
      )}
    </Canvas>
  );
}
